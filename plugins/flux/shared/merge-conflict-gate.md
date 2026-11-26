# Gate de integração com a base — conflito é bloqueio de pipeline, não detalhe de merge

> Fonte única do protocolo "antes de escrever qualquer coisa numa branch de PR, garantir que ela
> ainda integra com a base". Referenciada por `flux:iterate` (passo 2b, o **primeiro** gate do fluxo)
> e por `flux:land` (que já coleta `mergeable` por PR). **Não duplicar esta lógica** nos comandos:
> apontar para cá e declarar só o que for específico.
>
> Complementa `${FLUX_ROOT}/shared/worktree-discipline.md` (onde escrever) e
> `${FLUX_ROOT}/shared/fanout-discipline.md` (quem escreve). Este shared responde **se pode escrever**.

## Princípio (regra pétrea)

**Uma PR que não integra com a base é uma PR sobre a qual não se escreve.** Enquanto
`mergeable == CONFLICTING`, aplicar correção de review, commitar e pushar produz trabalho que nasce
empilhado em cima de uma base que o GitHub já não consegue fundir. Então o estado de integração é
verificado **antes** da triagem de CI e **antes** de qualquer correção, e não depois.

## Por que este é o primeiro gate

Três razões, em ordem de gravidade:

1. **CI verde numa PR `DIRTY` é sinal falso.** O GitHub não consegue computar o merge commit, então os
   checks que você está lendo rodaram contra uma base velha ou contra o head puro. "13/13 verde" numa
   PR que divergiu 24 commits da `main` não diz que a PR passa: diz que ela passava. Triar CI antes de
   resolver o conflito é triar um resultado que vai mudar.
2. **Correção aplicada em base não integrada aumenta o conflito.** Cada commit de review empilhado
   numa branch conflitante é mais um commit para reaplicar depois, e o rebase que era mecânico
   (3 arquivos de versão) passa a ser semântico. O custo do conflito cresce com o tempo que ele fica
   de pé, e o iterate é justamente o comando que fica de pé (watch).
3. **A PR não pode fechar o loop.** O propósito do iterate é deixar a PR merge-ready. Fechar todas as
   threads, ficar verde e declarar "assentou" com `mergeable: CONFLICTING` é entrega pela metade,
   pelo mesmo motivo que título e descrição em drift são (ver passo 8a do iterate).

**Caso real que originou este gate:** `OlaIsaac/arco-ai-plugins#252`, 0 review threads, 0 issue
comments acionáveis, CI 13/13 verde, e `mergeStateStatus: DIRTY` com a `main` 24 commits à frente.
O iterate declarou "nada acionável" e encerrou a passada. O único trabalho real que existia na PR era
exatamente o que ele não olhava.

## Quando aplicar

- **Sempre** que o fluxo puder escrever na branch: `flux:iterate` (1ª passada **e** todo tick do
  watch, porque a base anda enquanto o watch dorme), `flux:land` por PR do lote. Pilha de PRs
  defasada, com ou sem conflito, é outro protocolo: `${FLUX_ROOT}/shared/stack-propagation.md`.
  Quando o iterate de uma PR filha de aresta defasada leva `--no-rebase` (e a base dela fica com a
  propagação) e quando roda este gate normal: seção 7 do `stack-propagation.md`, "Iterate de PR
  filha: quando leva `--no-rebase`".
- **Nunca** em fluxo read-only: `flux:peek`, `flux:review`, `flux:iterate --dry`. Nesses, o estado de
  integração é **reportado** (é informação de primeira ordem sobre a PR) e nada é resolvido.

## 1. Detecção

`mergeable` é computado de forma assíncrona pelo GitHub. Logo depois de um push ele vem `UNKNOWN`, e
quem trata `UNKNOWN` como "está tudo bem" reintroduz o bug que este gate existe para matar.

```bash
gh pr view "$PR_NUMBER" --repo "$REPO_FULL" --json mergeable,mergeStateStatus,baseRefName,headRefOid
```

| `mergeable` | leitura |
|---|---|
| `MERGEABLE` | integra. Seguir o fluxo. |
| `CONFLICTING` | **conflito real.** Acionar este gate. |
| `UNKNOWN` | ainda computando. **Repetir a consulta** (até 3 tentativas, ~3s de intervalo). Se persistir `UNKNOWN`, não presumir: medir localmente com `git merge-tree` (abaixo) e reportar que o GitHub não decidiu. |

`mergeStateStatus` refina o diagnóstico e **não é redundante**: `DIRTY` (conflito), `BEHIND` (atrás da
base, sem conflito, mas o repo exige branch atualizada para mergear), `BLOCKED` (gate de proteção ou
review pendente), `UNSTABLE` (CI falhando), `CLEAN`. `BEHIND` **não** é conflito: só justifica
atualizar a branch se a proteção da base exigir, e nunca justifica force-push arriscado.

Medir a extensão antes de decidir qualquer coisa (barato, e não abre o repo no contexto principal):

```bash
git -C "$REPO_PATH" fetch origin "$BASE" "$BRANCH" -q
git -C "$REPO_PATH" rev-list --left-right --count "origin/$BASE...origin/$BRANCH"   # <atrás>	<à frente>
git -C "$REPO_PATH" merge-tree --write-tree --name-only "origin/$BASE" "origin/$BRANCH" 2>&1 | tail -20
```

`merge-tree` lista os arquivos em conflito **sem tocar o working tree**, o que permite classificar
antes de criar worktree ou iniciar rebase. Use-o sempre como passo de reconhecimento. **Atenção ao
formato:** a primeira linha do output é o OID da tree resultante, não um arquivo; os nomes vêm depois,
seguidos das mensagens `CONFLICT (...)`. Quem parseia esperando só filenames engole o OID como se
fosse um arquivo conflitante.

## 2. Classificação (decide se pode resolver sozinho)

Mesma régua da triagem de CI: o que é atribuível e mecânico, o flow resolve; o que é decisão, ele
devolve. Classificar pelos **arquivos em conflito** e pela natureza da sobreposição:

- **Mecânico** — resolução determinada pela convenção, não pelo julgamento de produto:
  - lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `go.sum`, `poetry.lock`) → **regenerar**, nunca
    resolver marcador a marcador à mão;
  - bump de versão concorrente (`package.json`, `plugin.json`, manifesto de marketplace) → vence a
    versão **mais alta**, e nunca se regride o que já está na base;
  - arquivos de append cronológico (`CHANGELOG.md`, changelog de docs) → **preservar as duas
    contribuições** na ordem que o arquivo já usa, sem descartar entrada de ninguém;
  - imports/barrel files, blocos adicionados em pontas opostas do mesmo arquivo;
  - doc de instrução (`CLAUDE.md`, `AGENTS.md`) em que os dois lados **só acrescentaram** parágrafos
    no mesmo ponto, sem editar nem apagar linha existente → **preservar os dois**, o da base primeiro.
    Bastou um lado editar uma linha que o outro também tocou, é semântico.
- **Semântico** — duas mudanças de intenção sobre a mesma lógica: mesma função, mesma condição, mesmo
  teste, migração de schema, contrato de API. **Nunca resolver sozinho**, nem em `--auto`, nem no
  watch. Registrar bloqueio e devolver ao usuário com os arquivos e o que cada lado fez.

Na dúvida entre mecânico e semântico, **é semântico**. O custo de errar para o lado cauteloso é uma
pergunta; o de errar para o outro é um force-push que apaga a intenção de alguém.

## 3. Estratégia: rebase ou merge da base

Não existe default universal, existe convenção de repo. Inferir, nesta ordem:

1. **Convenção declarada** no `AGENTS.md`/`CLAUDE.md`/`CONTRIBUTING.md` do repo, se disser algo.
2. **Histórico da base**: `git -C "$REPO_PATH" log --oneline --merges -10 "origin/$BASE"`. Base cheia
   de merge commits tolera `merge`; base linear indica squash/rebase.
3. **Default**: `rebase` sobre `origin/$BASE`, que é o que mantém a PR legível.

Escolher **`merge origin/$BASE`** (e não rebase) quando qualquer uma valer:

- **Há threads abertas ancoradas em linha** que esta rodada vai responder. Rebase reescreve os SHAs e
  marca as threads como `isOutdated`, atrapalhando a própria rodada que o iterate está fechando.
- **A branch tem commits de terceiros** (`git log --format='%ae' origin/$BASE..origin/$BRANCH | sort -u`
  com mais de um autor). Force-push em branch coautorada derruba o trabalho de quem não está na sala.
- **A branch é base de outra PR** (alguém empilhou em cima dela).

Em qualquer um desses casos, rebase é escolha errada mesmo que o repo prefira histórico linear: a
linearidade se resolve no squash do merge, o trabalho perdido não se resolve.

**Exceção: propagação em pilha.** Quando quem reescreve é o protocolo de
`${FLUX_ROOT}/shared/stack-propagation.md`, a primeira e a terceira condições acima **não** forçam
merge: a pilha é reescrita inteira na mesma rodada, então nenhuma PR de cima fica órfã, e o custo das
threads virarem `isOutdated` é aceito (seção 2 do `stack-propagation.md`). A segunda condição continua valendo
sem exceção: branch de terceiro ou coautorada bloqueia a propagação da pilha inteira. E a convenção
declarada do repo (passo 1 acima) vence a exceção: repo que declara merge não é rebaseado, e a
propagação fica em `hold` com o motivo (`bloqueado:convencao-merge`).

## 4. Resolução (em subagente, na worktree, sem push)

A resolução é **trabalho de subagente executor**, nunca do contexto principal: ela abre o repo, lê
código e edita arquivo (ver `${FLUX_ROOT}/shared/fanout-discipline.md`). O executor:

1. Resolve a worktree da `BRANCH` por `${FLUX_ROOT}/shared/worktree-discipline.md`. **Nunca**
   `git checkout` na árvore principal, e nunca rebase na árvore principal do usuário.
2. Sincroniza com o remote da branch (`git pull --ff-only`) para não resolver em cima de estado velho.
   Se a worktree não está igual ou atrás de `origin/$BRANCH` (à frente ou divergida) ou se
   `git -C <worktree> status --porcelain` não está vazio, antes do pull aplica o descarte
   condicionado da seção 5; nunca reset incondicional. Worktree limpa e só atrás faz o pull normal.
3. Executa a estratégia escolhida. **Se o processo se mostrar maior que o previsto** (conflito em
   arquivo que o `merge-tree` não previu, conflito semântico que a classificação não pegou, conflito
   repetido commit após commit): **`git rebase --abort` / `git merge --abort`** e devolver como
   bloqueio. Abortar é resultado legítimo, não falha do executor.
4. Roda o quality gate real do repo depois de resolver, e reporta o resultado de cada gate como ele
   veio. Gate não executável localmente é `n/a` com o motivo, nunca "verde". Devolve a worktree
   limpa (`status --porcelain` vazio): o que um gate escrever em arquivo (lint com `--fix`, por
   exemplo) entra no commit da resolução ou é descartado, e vai no relato de qualquer forma.
5. **Para sem pushar.** O push é do elo, nas condições da seção 5. Exceção: na propagação em pilha o
   push em cadeia é do executor (`${FLUX_ROOT}/shared/stack-propagation.md`, seção 6).

Contrato de retorno enxuto (< 40 linhas, sem diff colado): worktree, estratégia, ok/abortado, commits
reaplicados, **por arquivo o que foi decidido e por quê**, resultado dos gates, SHA local, bloqueios.

## 5. Push: `--force-with-lease`, autorizado pelo pedido

Rebase reescreve histórico publicado, e é a operação mais destrutiva de todo o fluxo flux. Portanto:

- **Sempre `git push --force-with-lease origin "$BRANCH"`.** Nunca `--force` puro: sem o lease, um
  push concorrente (o bot reviewer, o próprio usuário de outra máquina) é apagado sem aviso. Se o
  lease falhar, **não insistir**: refetch, reavaliar, e reportar. Lease recusado é só a rejeição do
  push por lease (`stale info`); qualquer outra rejeição (branch protegida, hook do servidor,
  permissão) consome a tentativa e é bloqueio `abortado`. Lease recusado **não consome** a
  tentativa daquele SHA de base (quem andou foi a branch, não a base): a próxima passada ou tick pode
  tentar de novo depois do refetch, respeitando o descarte condicionado abaixo.
- **Merge da base não precisa de force.** Push normal.
- **O pedido de resolver conflito autoriza o `--force-with-lease`, a qualquer momento do run**
  (fora de fluxo read-only, como `--dry`, que só reporta).
  Invocar o elo sem `--no-rebase` (a resolução é o default) ou pedir explicitamente que ele resolva
  o conflito **é** a autorização: o push com lease da resolução mecânica sai sem gate humano, na 1ª
  passada, com `--auto` e em todo tick do watch, inclusive quando o elo roda despachado por outro
  (o `flux:land`, por exemplo). Não existe aprovação por run a guardar nem a reperguntar. O lease
  protege contra push concorrente (recusa se o remote andou desde a última leitura); a resolução em
  si deixa de ser vista antes de publicada, e por isso o relato abaixo é obrigatório.
- **Quality gate vermelho segura o push.** A autorização cobre publicar uma resolução que passou nos
  gates do repo (seção 4, item 4), não uma que os quebrou: gate vermelho depois de resolver é
  bloqueio, a resolução fica na worktree sem push e o elo cai no modo degradado (seção 6). Gate `n/a`
  não segura, vai relatado como `n/a`.
- **Resolução retida e descarte condicionado.** Resolução retida é a resolução local que não foi
  publicada porque o quality gate ficou vermelho ou porque o lease foi recusado; a causa não muda o
  tratamento. Ao reter, o elo registra o SHA local da resolução (o que o executor devolve no contrato
  da seção 4) como `retainedResolutionSha`, e o passa no prompt do executor da próxima tentativa,
  que é quem faz a conferência abaixo (seção 4, item 2). Antes da próxima tentativa, o descarte só acontece com as
  duas condições juntas: `HEAD` da worktree igual a `retainedResolutionSha` **e**
  `git -C <worktree> status --porcelain` vazio. Aí, e só aí,
  `git -C <worktree> reset --hard "origin/$BRANCH"`, na worktree dedicada, nunca na árvore principal,
  e `retainedResolutionSha` volta a `null`. Qualquer outra situação (`HEAD` diferente, worktree suja,
  `retainedResolutionSha` desconhecido, por exemplo numa sessão nova sem estado) **não reseta**, porque
  a worktree pode ter commit de correção não publicado ou mudança do usuário: é bloqueio
  `worktree-retida` e o elo cai no modo degradado (seção 6). O relato traz
  `git -C <worktree> log --oneline "origin/$BRANCH..HEAD"` e `git -C <worktree> status --porcelain`,
  e as duas saídas para o humano destravar: publicar à mão o que está na worktree, ou descartar à mão.
- **O relato substitui a pergunta.** Depois do push, registrar no board e no resumo da rodada:
  estratégia, arquivos resolvidos com a decisão de cada um, resultado dos gates, SHA antes/depois e o
  `<atrás>/<à frente>` de `git rev-list --left-right --count "origin/$BASE...origin/$BRANCH"` (o
  comando da seção 1) antes/depois. Force-push sem esse rastro é o que torna a autorização perigosa.
  Sem board (perfil sem `VAULT_ROOT`), o relato vai só no resumo da rodada e o elo declara a perda no
  banner inicial, em `degradacoes:`, com o token `rastro de force-push so no chat`
  (`${FLUX_ROOT}/shared/preflight.md`, "Tokens canônicos de `degradacoes:`").
- **A autorização não se estende ao que segue proibido.** Conflito semântico continua sem resolução
  automática (seção 2); `--no-rebase` desliga a resolução e, com ela, o push; PR de terceiro e branch
  coautorada continuam fora (abaixo e seção 3). `--force` puro nunca.
- **Uma tentativa de resolução por SHA da base.** Se resolveu e a base andou de novo, isso é um SHA
  novo e uma tentativa nova; se a *mesma* resolução falhou, não retentar em loop.
- **Nunca resolver conflito de PR de terceiro.** Force-push em branch alheia está fora de escopo,
  sempre: reportar ao usuário e, no máximo, comentar na PR. Mesmo guard da reconciliação de
  título/descrição.

## 6. Quando o gate não consegue resolver: modo degradado, não paralisia

Conflito semântico, `--no-rebase`, PR de terceiro, rebase abortado, quality gate vermelho após
resolver, lease recusado ou worktree retida sem descarte seguro (seção 5) **não abortam o comando**. Eles
particionam o que ainda é seguro fazer:

| ação | depende de base integrada? |
|---|---|
| coletar threads, verificar alegação contra o código | não — segue |
| postar réplica, reagir 👍/👎, resolver thread | não — segue |
| aplicar correção, commitar, pushar | **sim — suspenso** |
| triar/corrigir CI | **sim — o resultado é inconfiável, só reportar** |
| reconciliar título e descrição (passo 8a) | sim (roda pós-push) — suspenso |

Ou seja: o iterate continua fechando a conversa da PR, e para de mexer no código dela. Reportar isso
explicitamente, sem eufemismo: `conflito semântico em <arquivos> — respondi as threads, não apliquei
correção nem pushei`. O usuário precisa saber que a PR saiu da rodada ainda travada.

## 7. Condição de saída e board

- **Nenhum watch declara "assentou" com `mergeable: CONFLICTING`.** Assentar exige, além de CI verde e
  zero threads, `mergeable == MERGEABLE`. PR conflitante e quieta é PR travada, não PR pronta.
- Todo tick do watch **reconsulta** `mergeable`: a base anda enquanto o watch dorme, e uma PR que
  assentou às 14h pode estar `DIRTY` às 15h.
- Eventos para o board (o vocabulário de tipo `conflito` já existe em
  `${FLUX_ROOT}/shared/board-template.md`) e para o hook Slack, quando configurado:
  `conflito-detectado`, `conflito-resolvido`, `conflito-bloqueado`.
- Conflito detectado **conta como trabalho acionável** para efeito de criar o board: uma PR sem
  threads e sem CI vermelho, mas conflitante, tem board.

## Segurança (resumo do que nunca se faz)

- Nunca resolver conflito na árvore principal do usuário.
- Nunca `git push --force` sem lease. Nunca push em `main`, nem na branch base.
- Nunca abrir gate humano para o `--force-with-lease` de uma resolução mecânica pedida: o pedido é a
  autorização (seção 5).
- Nunca force-push em branch de terceiro ou coautorada.
- Nunca resolver conflito semântico sem aval humano, mesmo em `--auto`.
- Nunca resolver lockfile marcador a marcador: regenerar.
- Nunca tratar `mergeable: UNKNOWN` como `MERGEABLE`.
- Nunca declarar CI confiável em PR `DIRTY`.
