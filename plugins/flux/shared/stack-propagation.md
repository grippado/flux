# Propagação em pilha — levar um ajuste do slice N para os slices de cima

> Fonte única do protocolo "um slice de uma pilha de PRs mudou; levar a mudança para todos os que
> estão empilhados em cima dele, numa rodada só". Referenciada pelo `flux:land` (modo `--restack` e
> detecção no watch). **Não duplicar esta lógica** nos verbos: apontar para cá.
>
> Complementa `${FLUX_ROOT}/shared/merge-conflict-gate.md`, de onde herda a classificação de
> conflito (seção 2), a disciplina de push com lease e o tratamento de resolução retida (seção 5), e
> `${FLUX_ROOT}/shared/worktree-discipline.md`, que diz onde cada branch é reescrita.

## Princípio

**A pilha é a unidade, não a PR.** Um ajuste no slice 1 de uma pilha de M PRs é **um** evento, e
propagá-lo é **uma** operação: reescrever a cadeia de baixo para cima, validar uma vez no topo e
publicar. Tratá-lo como M eventos independentes (um iterate por PR, um tick por PR, um quality gate
por PR) é o que transforma uma operação de segundos numa de dezenas de minutos.

> **Medição que originou este shared** (LAB-438, 2026-11-25): em três propagações reais, rebase e
> push ocuparam menos de 5% do tempo. O que custou foi revalidar cada branch, em série, depois de
> cada rebase (48%), mais a geração do modelo entre as chamadas (26%). E em nenhuma das três a
> propagação passou pelo `flux:land`: ele só traz a base para uma PR quando ela fica `CONFLICTING` ou
> quando chega thread nova, e um ajuste pedido no chat não produz nenhum dos dois.

## Quando aplicar

- **Gatilho explícito:** `${FLUX_CMD}land ... --restack`.
- **Gatilho detectado:** em todo tick do watch do `flux:land`, uma aresta pai → filho da pilha
  defasada (abaixo) dispara a propagação daquela pilha.
- **Nunca** em fluxo read-only (`flux:peek`, `flux:review`, `--dry`): lá a defasagem é **reportada**,
  nada é reescrito.

## 1. Detectar a pilha e a defasagem

A pilha é a árvore formada pelas PRs da entrega cujo `baseRefName` é o `headRefName` de outra PR da
entrega. A raiz de cada árvore tem como base a branch default do repo. A fonte é a descoberta do
próprio elo, que lista PRs em **todos** os estados: um pai já mergeado continua no grafo, e é ele que
denuncia o caso do squash abaixo.

```bash
gh pr list --repo "$REPO_FULL" --state all --search "$TICKET" \
  --json number,state,headRefName,baseRefName,headRefOid,isCrossRepository,author
```

Depois que o GitHub reaponta a base do filho de um pai mergeado, a aresta some da leitura atual. Por
isso o elo **guarda o grafo** (a aresta e o `baseRefName` de cada PR) no estado dele, e a detecção
compara com o grafo da leitura anterior, não só com a atual.

Uma aresta pai → filho está **defasada** quando o tip do pai não é ancestral do filho:

```bash
git -C "$REPO_PATH" fetch origin -q
git -C "$REPO_PATH" merge-base --is-ancestor "origin/$PAI" "origin/$FILHO" || echo defasada
```

Esse é o sinal que faltava: ele não depende de `mergeable`, de thread, nem de o GitHub ter
recomputado nada. Barato, local, determinístico, e roda na main (é metadado, não leitura de código).

Um pai **squash-mergeado** também conta como defasagem: a PR do pai está `MERGED`, o filho ainda
carrega os commits originais do pai, e a base do filho tem que passar a ser a branch default.

## 2. Pré-condições (bloqueiam a pilha antes de qualquer escrita)

Conferir para **toda** branch da pilha que seria reescrita, antes de reescrever a primeira:

| condição | efeito |
|---|---|
| PR de terceiro (`author.login != ME`) ou `isCrossRepository` | **bloqueia a pilha**: `bloqueado:terceiro` |
| branch coautorada (mais de um autor em `git log --format='%ae' origin/$PAI..origin/$FILHO`) | **bloqueia a pilha**: `bloqueado:coautorada` |
| worktree da branch suja ou à frente do remote sem `retainedResolutionSha` que a explique | **bloqueia a pilha**: `bloqueado:worktree-retida` |
| threads abertas ancoradas em linha | **não bloqueia** (decisão D2 da LAB-438, ver seção 3 do gate) |
| a branch é base de outra PR | **não bloqueia**: é a definição de pilha |

Uma pilha com um único bloqueio não é propagada em parte. Reescrever a metade de baixo e parar no
meio deixa a pilha num estado que nenhum dos dois lados reconhece.

## 3. Registrar os dois SHAs de cada aresta

Antes de reescrever qualquer coisa, guardar, para **cada** branch da pilha, dois SHAs completos
(nunca curtos):

- **`LEASE[$BRANCH]`**: o tip remoto atual da branch, `git rev-parse "origin/$BRANCH"`. É o lease do
  push (passo 6).
- **`STACKED[$FILHO]`**: o tip do pai **sobre o qual o filho foi empilhado**, que é o limite de baixo
  do `--onto` (passo 4). Não é o tip atual do pai: quando o ajuste reescreveu o pai (`--amend`,
  rebase, squash), o tip atual já não tem nada em comum com o que o filho carrega.

`STACKED` se resolve nesta ordem, parando no primeiro que existir:

1. O `stackedOn` daquela aresta no estado do elo: o tip do pai na última leitura em que a aresta
   **não** estava defasada. O elo atualiza esse campo a cada leitura em que o teste do passo 1 passa.
2. `git -C "$REPO_PATH" merge-base --fork-point "origin/$PAI" "origin/$FILHO"`, que usa o reflog do
   ref remoto do pai no clone local. Funciona quando o clone já tinha buscado o pai antes do ajuste.
3. Nenhum dos dois: `bloqueado:tip-desconhecido` para aquela aresta e para tudo acima dela.

**Nunca** o `merge-base` simples. Num pai reescrito ele devolve o ponto anterior ao pai inteiro, e o
rebase reaplica os commits antigos do pai por cima dos novos. Ensaio (pilha de três branches, remoto
bare, ajuste no slice 1 por `--amend` na mesma linha): com o tip atual do pai como limite, o commit
antigo voltou e conflitou exatamente na linha ajustada, e "resolver" esse conflito como mecânico
reverteria o ajuste. Com o `--fork-point`, o rebase passou limpo e o slice 2 ficou com o ajuste.

Pai squash-mergeado e branch apagada: vale a mesma cascata, e o `stackedOn` costuma ser a única
fonte, porque o ref remoto sumiu.

## 4. Reescrever a cadeia, de baixo para cima

Em ordem topológica (pai antes de filho), cada filho é reescrito **na worktree dele**, resolvida por
`${FLUX_ROOT}/shared/worktree-discipline.md`:

```bash
git -C "$WORKTREE_FILHO" rebase --onto "$NOVO_PAI" "${STACKED[$FILHO]}" "$FILHO"
```

- `NOVO_PAI` é `refs/heads/$PAI` quando o pai foi reescrito nesta mesma rodada (os refs são
  compartilhados entre as worktrees do repo), `origin/$PAI` quando não foi, e `origin/$DEFAULT`
  quando o pai foi squash-mergeado.
- Pai squash-mergeado: depois do rebase, conferir o `baseRefName` do filho. Se ainda aponta para a
  branch do pai, reapontar com `gh pr edit "$FILHO_PR" --base "$DEFAULT"`.
- Conflito durante o rebase: classificar pela seção 2 do `merge-conflict-gate.md`. Mecânico, resolver
  e `rebase --continue`. Semântico ou maior que o previsto: `rebase --abort` **naquela** branch, e a
  propagação para ali. As branches de baixo, já reescritas, seguem para o passo 5 como `retida` (não
  são publicadas sozinhas, ver seção 6); as de cima não são tocadas.

> **Por que não `git rebase --update-refs`.** Ele faria a cadeia inteira num comando, mas **pula em
> silêncio** toda branch que esteja em checkout em outra worktree, e a disciplina de worktree da
> família cria exatamente uma worktree por branch. Ensaio numa pilha de três branches com a do meio
> em outra worktree: o topo recebeu o ajuste, a do meio não, e o comando reportou sucesso. A cadeia
> de `--onto` funciona com ou sem worktree e em qualquer git, então não há caminho de ausência a
> declarar.

## 5. Validar só o topo

Decisão D1 da LAB-438. O quality gate real do repo (o mesmo da seção 4 do `merge-conflict-gate.md`)
roda **uma vez por folha** da árvore, na worktree da folha. O topo contém todos os slices abaixo dele,
então é onde a combinação é verificada.

- As branches intermediárias **não** são validadas, e o relato diz isso por nome: `nao-validada`.
  Nunca `ok`, nunca `n/a`: `n/a` quer dizer "não executável aqui", e aqui é "não executado por
  decisão".
- O risco aceito é um slice intermediário que quebre sozinho e só apareça quando for mergeado sozinho.
  Quem precisar fechar esse risco valida a branch à mão antes do merge dela; a propagação não o faz.
- **Topo vermelho segura o push da pilha inteira** daquela árvore. As reescritas ficam nas worktrees
  como resolução retida (seção 5 do `merge-conflict-gate.md`), com `retainedResolutionSha` por branch.

## 6. Publicar, de baixo para cima

Uma branch por vez, na ordem topológica, com o lease amarrado ao tip antigo registrado no passo 3:

```bash
git -C "$WORKTREE" push --force-with-lease="$BRANCH:${LEASE[$BRANCH]}" origin "$BRANCH"
```

- **Lease recusado** numa branch: parar ali. As de baixo já publicadas ficam (cada uma contém o
  ajuste e é consistente sozinha); a recusada e as de cima ficam `retida`. Publicar de baixo para cima
  é o que garante que o estado remoto é sempre um prefixo coerente da pilha, nunca um topo novo sobre
  um meio velho.
- **Outra rejeição** (branch protegida, hook, permissão): mesma parada, motivo `abortado`.
- Reexecutar é seguro: a próxima rodada relê os tips (passo 3), e o que já foi publicado não está
  mais defasado (passo 1).
- A autorização do push é a mesma da seção 5 do `merge-conflict-gate.md`: invocar o elo que
  propaga, sem a flag dele que desliga a propagação, **é** a autorização, sem gate humano por branch.
  O nome dessa flag é do elo (no `flux:land`, `--no-restack`); com ela, a defasagem é só reportada.

## 7. Quem executa e o contrato de retorno

**Um subagente executor para a pilha inteira**, nunca a main e nunca um por PR
(`${FLUX_ROOT}/shared/fanout-discipline.md`). Ele é o único escritor de todas as worktrees da pilha
naquela rodada; por isso, no tick em que a propagação roda, nenhum iterate é despachado para PRs
daquela pilha. Com isso, a regra do land "mesmo repo em série, uma por tick" continua valendo: a
propagação é **uma** unidade daquele repo naquele tick.

Retorno (< 40 linhas, sem diff colado):

```
- pilha: <owner/repo> #A -> #B -> #C (ordem topológica)
- gatilho: <restack | defasada:<pai>-><filho> | squash:<pai>>
- por branch, uma linha: <branch> · <publicada|retida|bloqueada|intocada> · <shaAntes>-><shaDepois> · validacao:<ok|vermelho|nao-validada> · conflitos:<n/a|arquivo: decisão>
- topo: <branch> · gates <por gate: ok|vermelho|n/a>
- base reapontada: <PR -> base | nenhuma>
- bloqueios: <lista curta, ou nenhum>
```

O relato substitui a pergunta, como no gate de conflito: SHA antes e depois, e a validação de cada
branch, vão para o board pelo escritor único. Force-push em cadeia sem esse rastro é o que torna a
autorização perigosa.

## Segurança (resumo do que nunca se faz)

- Nunca reescrever parte de uma pilha que tem uma branch bloqueada (seção 2).
- Nunca `--force` sem lease, nunca lease com SHA curto, nunca push em `main` nem na branch default.
- Nunca publicar um topo vermelho, nem uma branch de cima antes da de baixo.
- Nunca chamar de validada uma branch intermediária que não rodou gate.
- Nunca reapontar um filho de pai mergeado sem o tip antigo do pai.
- Nunca usar o tip atual do pai, nem o `merge-base` simples, como limite do `--onto` (passo 3).
