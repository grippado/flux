---
name: iterate
description: "Orquestrador `flux:iterate` — fecha o loop de UMA PR (checa se ela ainda funde com a base e resolve conflito mecânico, verifica threads contra o código real, aplica correções, responde, reage 👍/👎, resolve, commita, pusha, vigia CI + bot). `--dry` rascunha réplicas read-only e salva no vault. Global, resolve contexto via `flux-context.md`."
user-invocable: true
---

# /flux:iterate

Comando orquestrador para **fechar o loop** de uma rodada de review: lê as threads abertas, verifica cada alegação contra o código real, aplica o que é pertinente, responde/reage/resolve no GitHub, **olha o estado do CI** e tenta corrigir o que for atribuível ao próprio push, atualiza a PR com commit + push e **reconcilia título e descrição da PR** com o que a rodada decidiu. Por padrão, fica vivo monitorando CI e novas rodadas do bot até a PR assentar.

Toda escrita acontece num **git worktree dedicado à branch da PR**, nunca na árvore principal do repo (ver `${FLUX_ROOT}/shared/worktree-discipline.md`), e todo trabalho pesado — verificar alegação contra o código, aplicar correção, rodar quality gate — acontece em **subagente**, nunca no contexto principal (ver `${FLUX_ROOT}/shared/fanout-discipline.md`). E o CI é tratado **desde a 1ª passada**, não só no watch: uma PR sem threads abertas mas com CI vermelho ainda é acionável.

**Antes de tudo isso vem o gate de integração com a base** (passo 2b): PR que não funde com a base é PR sobre a qual não se escreve, e o CI verde dela é sinal falso. Uma PR sem threads e sem CI vermelho, mas conflitante, **é acionável**. Ver `${FLUX_ROOT}/shared/merge-conflict-gate.md`.

É o irmão "ativo" da família:

- `/flux:review` — gera o review formal (read-only, salva no vault).
- `/flux:iterate --dry` — rascunha réplicas read-only (salva no vault, não posta).
- `/flux:iterate` — **aplica + posta + resolve + commita + pusha + reconcilia título e descrição** (este, no modo padrão).

Roda independente dos outros. Pensado para PRs com rodadas de bot reviewer, mas trata threads humanas também.

**Legenda canônica de badges:** `${FLUX_ROOT}/shared/review-legend.md`
**Contrato de agentes (descoberta + reconciliação):** `${FLUX_ROOT}/shared/review-agents.md`
**Bootstrap de specialists (repo sem suite local):** `${FLUX_ROOT}/shared/bootstrap-specialists.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Disciplina de worktree (escrever sempre em worktree):** `${FLUX_ROOT}/shared/worktree-discipline.md`
**Gate de integração com a base (OBRIGATÓRIO — 1º gate, antes do CI):** `${FLUX_ROOT}/shared/merge-conflict-gate.md`
**Diagnóstico de quality gates externos via API (consultar antes de classificar gate Sonar):** `${FLUX_ROOT}/shared/quality-gate-api.md`
**Disciplina de fan-out (OBRIGATÓRIA — verificação e execução em subagente):** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Disciplina de comentários em código (OBRIGATÓRIA — não comentar sem pedido):** `${FLUX_ROOT}/shared/code-comment-discipline.md`
**Orçamento de contexto (leitura sob demanda, um root por sessão, delegação):** `${FLUX_ROOT}/shared/context-budget.md`

## Banner de perfil — gabarito (copiar VERBATIM)

Todo output deste elo **abre** com o banner. Ele não é decoração: é o que impede uma execução
degradada de se passar por uma completa. O gabarito mora aqui, no corpo do elo, porque um gabarito
que só existe num shared não chega ao contexto na hora de emitir — e o que sai é um banner
improvisado, com campos inventados e sem o `nivel`.

Copiar com as cercas, trocando só o que está entre chaves. Regras dos campos e casos de degradação
em `${FLUX_ROOT}/shared/preflight.md`, Passo 5.

````
```
perfil: {nome do manifesto | generico}{ (ancora: alvo <path>)} · nivel: {FULL|REDUCED|THIN} · holistico: {agente}
lentes: L1 {agente} · L2 {lista|ausente|inalcancavel} · L3 {lista|ausente|inalcancavel}
degradacoes: {soft ausentes e o que se perde com cada um | nenhuma}
```
````

Abortagem segue o gabarito do "Formato da mensagem de abortagem" do preflight, também verbatim, e o
nome do elo na primeira linha usa `${FLUX_CMD}` já substituído (`/flux:iterate` num harness,
`/flux-iterate` em outro) — nunca `flux:` literal.

## Step 0-cli: atalho mecânico (tentar primeiro)

Seguir `${FLUX_ROOT}/shared/step0-cli.md`: tentar `flux preflight iterate [alvo] --json` antes da
resolução agentica. JSON válido resolve o Step 0-context abaixo — revalidar só o que
`session_revalidation_required` lista — e a coleta da PR usa `flux gather pr <n> --threads --json`
(threads são insumo obrigatório deste elo; `degraded` sem threads → tratar como a perda que o
fluxo já descreve). CLI ausente ou saída inválida → seguir o step abaixo como sempre.

## Step 0-context: resolver perfil de contexto

Seguir o protocolo descrito em `${FLUX_ROOT}/shared/flux-context.md`. Em resumo:

1. Resolver a **âncora** (alvo primeiro, `cwd` depois — ver `${FLUX_ROOT}/shared/flux-context.md`,
   seção "Qual é a âncora") e procurar `flux-context.json` em `.claude/` subindo a árvore a partir
   dela:
   ```
   <cwd>/.claude/flux-context.json
   <parent>/.claude/flux-context.json
   ...
   ```

2. Se encontrar (perfil declarado), extrair as variáveis de sessão:
   - `HOLISTIC` = `holistic_reviewer`
   - `VAULT_ROOT` = `vault_root` (raiz compartilhada: é onde fica o `0-inbox/`, e toda escrita nova vai para lá)
   - `VAULT_CTX` = `vault_context` (campo `context:` no frontmatter do que for gravado)
   - `VAULT_CTX_ROOT` = `vault_context_root` (raiz do contexto, onde o eixo por tipo vive; só leitura. Ausente → `VAULT_ROOT`)
   - `NO_EMDASH` = `no_emdash`
   - `SPECIALISTS_ROOT` = `specialists_root` (template de path com `{repo}`)
   - `KITS_ROOT` = `kits_root` (template de path com `{repo}`; degrau 3 da cascata de destino, opcional)
   - `KITS` = `kits` (caminhos locais de kit; origem 1 do `KIT_ROOTS`, Passo 1d do preflight, opcional)
   - `ANSWERER` = `answerer` (agente para rascunhar réplicas em `--dry`; se ausente, usar `<HOLISTIC>` com instrução de rascunhar)

3. Se não encontrar (perfil genérico):
   - `HOLISTIC` = genérico da família pela cascata do preflight (Passo 3), nunca um nome fixo
   - `VAULT_ROOT` = não persiste por default; imprime no chat
   - `VAULT_CTX` = `generic`
   - `VAULT_CTX_ROOT` = nenhum (sem vault não há rodada anterior para procurar)
   - `NO_EMDASH` = `false`
   - `SPECIALISTS_ROOT` = `<repo-checkout>/.claude/agents/reviewer.md` ou `<repo-checkout>/.claude/agents/review/*.md`
   - `ANSWERER` = o próprio `<HOLISTIC>` com instrução de rascunhar réplicas (sem agente dedicado)

## Inputs aceitos

| Forma | Significado |
|-------|-------------|
| `/flux:iterate` (sem arg) | PR da branch atual do `pwd` |
| `/flux:iterate 962` | PR #962 do repo do `pwd` atual |
| `/flux:iterate https://github.com/owner/repo/pull/962` | PR do URL informado |
| `/flux:iterate 962 --auto` | Pula a confirmação interativa da 1ª passada e executa o fluxo completo direto |
| `/flux:iterate 962 --once` | **Desliga o watch** (alias `--no-watch`): roda só uma passada e termina após o push |
| `/flux:iterate 962 --dry` | Modo read-only: rascunha réplicas e salva no vault, **nunca** escreve no GitHub |
| `/flux:iterate 962 --solo` | Pula os specialists; verificação de threads usa só `<HOLISTIC>` |
| `/flux:iterate 962 --no-rebase` | **Desliga a resolução** do gate de conflito (alias `--skip-conflict-gate`): detecta e reporta o conflito, mas não toca no histórico da branch. Cai no modo degradado do passo 2b. |
| `/flux:iterate 962 --parent-board <path>` | Marca como filho de um delivery-flow: registra proveniência + link reverso. Passado automaticamente pelo delivery-flow. |

> **O watch é o default.** Depois da 1ª passada e do push, o comando fica vivo monitorando CI + novas rodadas do bot até a PR assentar (CI verde + nada novo) ou mergear. Use `--once` quando quiser só fechar a rodada atual e sair.

As flags `--auto`, `--once` (alias `--no-watch`), `--dry`, `--solo`, `--no-rebase` (alias `--skip-conflict-gate`) e `--parent-board <path>` podem aparecer em qualquer posição dos argumentos e combinadas entre si. As **rodadas subsequentes do watch rodam em `--auto`** (aplicam + postam + resolvem + commitam + pusham sozinhas). `--once` desliga o watch. `--solo` pula os specialists em todas as rodadas. `--no-rebase` persiste em todas as rodadas.

> **`--auto` nunca autoriza reescrever histórico.** Ele dispensa a confirmação do plano de threads (passo 6), não o gate humano do force-push (passo 2b). Isso vale igual no watch.

## Out of scope (NUNCA faça)

- Não aprovar nem mergear (`gh pr review --approve`, `gh pr merge`).
- Não usar `event: APPROVE` / `REQUEST_CHANGES` em nada.
- Não pushar para `main`. Não fazer `git checkout`/`git switch` de branch na árvore principal do repo: para entrar na branch da PR, resolver/criar a **worktree** dela (ver disciplina de worktree), nunca sequestrar o working tree principal do usuário.
- **Não `git push --force` sem lease, nunca.** Force-push só com `--force-with-lease`, só na branch da PR, e só depois do gate humano do passo 2b. Não force-pushar branch de terceiro nem branch coautorada.
- **Não resolver conflito semântico sozinho.** Conflito sobre a mesma lógica (mesma função, mesma condição, mesmo teste, migração, contrato) exige aval humano mesmo em `--auto` e mesmo no watch: registrar bloqueio e cair no modo degradado. Na dúvida entre mecânico e semântico, é semântico.
- **Não declarar CI confiável, nem "assentou", em PR `CONFLICTING`.** Nem tratar `mergeable: UNKNOWN` como se fosse `MERGEABLE`.
- Não resolver thread humana que esteja em `needs-discussion` (ver guardrail no passo 7).
- Não retentar escrita em repo cross-org sem acesso — capturar o erro e reportar.
- **Não editar título nem descrição de PR de terceiro.** A reconciliação do passo 8a só vale para PR cuja `author.login` é a conta autenticada; em PR de outra pessoa, a correção vira sugestão em comentário. Nunca reescrever texto alheio.
- **Não commitar nem pushar em PR de terceiro sem pedido explícito + confirmação textual.** `IS_OWN_PR == false` é modo `no-push` por default, tanto no passo 6 (correções de threads) quanto no passo 2c (auto-fix de CI): só interação (responder/reagir/resolver); a correção de CI pode ser aplicada e validada localmente, mas fica sem commit/push. Sair disso exige a opção "pedir permissão pra escrever" e a confirmação textual do passo 6 — nunca inferido de contexto, nunca default mesmo com `--auto`.
- **Não mexer no prefixo de ticket do título** (`[ENG-1234]`, `[PROD-000]`). É chave de rastreabilidade para Linear e CI; trocar ou remover quebra automação em silêncio.
- **Não renomear título que só ficou genérico.** Renomeia-se apenas título que nomeia desenho refutado. A barra do título é mais alta que a da descrição, porque ele vira mensagem de squash commit e circula em notificação.
- **Não regerar a descrição da PR do zero.** Editar sempre sobre o body atual, cirurgicamente. Body regenerado apaga contexto humano (links de PRs irmãs, checklist marcada pelo revisor) de forma silenciosa e irreversível pela UI.
- Em modo `--dry`: **nunca** escrever no GitHub (sem reply, sem reação, sem resolve, sem commit, sem push).
- **Não entrar num segundo repo.** O iterate fecha o loop de UMA PR, logo toca UM repo. Se a correção parecer exigir mexer noutro repo, isso é escopo de `/flux:land` (que despacha um subagente por PR): registre como bloqueio e reporte, não abra o segundo checkout aqui. Ver `${FLUX_ROOT}/shared/context-budget.md` (Regra 1: cada root de repo custa 10-20k tokens permanentes).
- **Não despejar saída crua no contexto**: `gh run view`, `type-check`, `test` e afins sempre filtrados na origem (`| tail -N`, `| grep -E 'error|fail'`). Regra 4 do orçamento de contexto.
- **Não verificar thread nem aplicar correção no contexto principal.** Ler o código da PR, checar alegação e editar arquivo são trabalho de subagente (passos 3 e 4). Na main ficam: metadados via `gh`, fan-in dos retornos, HITL, board, postagem no GitHub e watch. Ver `${FLUX_ROOT}/shared/fanout-discipline.md`.

---

## Fluxo de execução

### 1. Resolver o target + sanidade

```bash
gh auth status           # se falhar, abortar pedindo `gh auth login`
# parse args: separar PR-spec de --auto / --once / --no-watch / --dry / --solo / --parent-board <path>
AUTO=false; WATCH=true; DRY=false; SOLO=false; PARENT_BOARD=""
expect_board=false
for arg in "$@"; do
  if $expect_board; then PARENT_BOARD="$arg"; expect_board=false; continue; fi
  case "$arg" in
    --auto)            AUTO=true ;;
    --once|--no-watch) WATCH=false ;;
    --dry)             DRY=true ;;
    --solo)            SOLO=true ;;
    --parent-board)    expect_board=true ;;
  esac
done
# URL  -> {owner}/{repo}/pull/{number}
# número -> REPO_FULL=$(gh repo view --json nameWithOwner -q .nameWithOwner)
# sem arg ->
#   PR_NUMBER=$(gh pr view --json number -q .number)
#   REPO_FULL=$(gh repo view --json nameWithOwner -q .nameWithOwner)
```

**Localizar o repo (não a branch ainda).** Identifique o checkout local do repo alvo (`REPO_PATH`, ex. `<WORKSPACE_ROOT>/<repo>`). Se o repo **não tem checkout local**, aborte pedindo para cloná-lo (este comando precisa do working tree para aplicar correções e commitar). Em `--dry` não é necessário checkout (opera sobre o diff via `gh`).

**Worktree resolvida agora, não na hora de escrever.** O `pwd` **não** precisa estar na branch da PR: a worktree dedicada à `headRefName` é resolvida (achada ou criada) via `${FLUX_ROOT}/shared/worktree-discipline.md` **nesta etapa**, incluindo o provisionamento dos arquivos de ambiente descrito naquele protocolo, e é nela que o comando passa a operar. Não fazer `git checkout` na árvore principal para trocar de branch.

Ela é criada cedo por dois motivos que se somam. O primeiro é que a worktree não serve só para o elo escrever: ela é **onde o usuário vai olhar o resultado** da rodada, e um pedido de "quero ver isso rodando" no meio do run não deveria disparar clone de árvore e provisionamento de env do zero. O segundo é que as próprias lentes ficam melhores com ela: verificar uma alegação contra o código **da branch** é mais direto num checkout da branch do que via `git show <sha>:<path>` na árvore principal.

O custo é real e assumido: uma PR sem nada acionável ganha uma worktree que ninguém usou. É barato (a worktree compartilha o object store) e reversível (`git worktree remove`), e perde para o custo de não ter a árvore quando ela é necessária. Fluxos read-only (`--dry`) seguem **sem** criar worktree, porque ali não há nem escrita nem push, e o modo existe justamente para não tocar o disco do usuário.

Se `DRY == true`, ir direto para o **Modo `--dry`** após a coleta de metadados + threads (passo 2).

### 2. Coletar metadados + TODAS as threads (abertas e resolvidas)

```bash
gh pr view $PR_NUMBER --repo $REPO_FULL \
  --json number,title,headRefName,baseRefName,url,state,isDraft,author,headRefOid,mergeable,mergeStateStatus
```

`mergeable` e `mergeStateStatus` **não são opcionais nesta coleta**: eles alimentam o gate de integração do passo 2b, que roda antes da triagem de CI.

**`IS_OWN_PR` — o guard de autoria.** `IS_OWN_PR = (author.login == ME)`, onde `ME` é a conta autenticada (`gh api user -q .login`). **Deliberadamente mais restrito que o `IS_OWN_PR` do `${FLUX_CMD}review`** (que também conta assignee): aqui ele guarda commit, push e force-push, não só postar comentário, e ser assignee não implica consentimento pra escrever no histórico da branch de outra pessoa. Governa cinco coisas: força-push (passo 2b), reconciliação de título/descrição (passo 8a), **quais opções o GATE do passo 6 oferece e se o passo 8 (commit/push) pode rodar**, **se o executor do passo 4 pode commitar/pushar em `--auto`**, e **se o auto-fix de CI do passo 2c pode commitar/pushar** a correção que aplicou. `IS_OWN_PR == false` não distingue colega de time com push habilitado de desconhecido: é binário, por `author.login`, sem exceção para coautoria ou bypass de branch protection.

Buscar **todas** as threads via GraphQL (a REST não expõe `isResolved`). Buscar resolvidas também é essencial: elas formam o **corpus de referência** para o cross-reference do passo 3.

```bash
gh api graphql -f query='
{
  repository(owner: "OWNER", name: "REPO") {
    pullRequest(number: PR) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first: 1) {
            nodes { databaseId url author { login } createdAt body }
          }
        }
      }
    }
  }
}'
```

Particionar o resultado em dois conjuntos:

- **Threads abertas** (`isResolved == false`) — as que serão endereçadas neste run. Guardar: `id` (NODE id `PRRT_...`, usado para resolver), `path`, `line`, `isOutdated`, e do primeiro comentário `databaseId` (reply/react), `url` (permalink), `author.login`, `body`.
- **Corpus de referência** (`isResolved == true`) — guardar `url`, `path:line`, `author.login` e um resumo do ponto + veredito (ler o body; se truncado, `gh api repos/$REPO_FULL/pulls/comments/<databaseId>`).

Ler o body completo de um comentário quando truncado:

```bash
gh api repos/$REPO_FULL/pulls/comments/<databaseId> -q '.body'
```

**Top-level PR comments — COLETA OBRIGATÓRIA, NÃO É OPCIONAL.** O GraphQL `reviewThreads` acima **NÃO retorna** comentários top-level de PR (os que não têm `path:line`). Quem só roda aquele query enxerga um subconjunto das pendências e declara a PR fechada com comentário humano de pé. Rode SEMPRE, na mesma passada:

```bash
gh api repos/$REPO_FULL/issues/$PR_NUMBER/comments \
  --jq '.[] | {id, author: .user.login, createdAt: .created_at, body}'
```

Eles não têm reply nativo (responder = novo issue comment) nem resolução; reações vão em `repos/$REPO_FULL/issues/comments/<id>/reactions`.

**Particionar também estes**, com a mesma régua das review threads:

- **Acionáveis** — de terceiros, com conteúdo substantivo. Entram no mesmo conjunto de trabalho das threads abertas: verificar contra o código real, responder, reagir. Não há resolve, então "fechado" aqui significa **respondido**.
- **Ignoráveis** — bot de CI/Linear/reviewer automático que só ecoa estado (ex.: "rodou uma revisão automática e não encontrou pontos"), sincronização de ticket, e comentários do próprio autor sem réplica de terceiros.

**Um issue comment humano NUNCA é ignorado por não ser thread.** Se houver issue comment de terceiro ainda sem réplica sua posterior a ele, a PR **é acionável** mesmo com `reviewThreads` 100% resolvidas. Esse caso já aconteceu e passou batido (PR #238 do `technical-refining`: 12/12 threads fechadas, com um comentário substantivo de revisor humano intocado por dois dias).

**Contagem reportada:** ao informar progresso (chat, board, retorno para um orquestrador), conte os dois universos e diga qual é qual, no formato `threads <res>/<tot> · issue comments <respondidos>/<acionáveis>`. Nunca reporte só o número de `reviewThreads` como se fosse o total de pendências da PR.

**Pular threads triviais:** body só com aprovação (`LGTM`, `👍`, `:+1:`, `✅`) ou comentário do próprio autor sem réplica de terceiros.

**Coletar também o estado do CI** (sempre, mesmo sem threads):

```bash
gh pr checks $PR_NUMBER --repo $REPO_FULL   # ou --json name,state,conclusion,link
```

Classificar o agregado do CI (mesma regra do watch): `pending`/`in_progress` → **rodando**; todos `success`/`neutral`/`skipped` → **verde**; qualquer `failure`/`timed_out`/`cancelled` → **vermelho**.

**Critério de término da 1ª passada (redefinido):** o run só encerra cedo (avisar no chat, não commitar) quando **não há thread acionável, não há issue comment acionável sem réplica, o CI não está vermelho** (verde ou ainda rodando) **E a PR integra com a base** (`mergeable == MERGEABLE`). Qualquer um dos três últimos torna a PR acionável mesmo sem thread nenhuma:

- **`mergeable == CONFLICTING`** → seguir para o **gate de integração** (passo 2b). É o caso que mais engana, porque a PR parece limpa: zero threads e CI verde.
- **CI vermelho** → seguir para a **triagem de CI** (passo 2c).

Registrar no chat o motivo do prosseguimento (ex.: `sem threads abertas e CI verde, mas PR conflitante com a base — acionando o gate de integração`).

### 2a. Board no vault (nota viva)

Havendo trabalho acionável (threads abertas, **PR conflitante com a base** ou CI vermelho), **crie o board deste iterate** antes de seguir para a verificação, e **anuncie o caminho no chat** (o board existe desde o começo, não só no fim; a partir daqui, cada passo relevante e cada tick do watch atualiza o board).

**O formato é fonte única compartilhada:** siga `${FLUX_ROOT}/shared/board-template.md`, **perfil single-PR** (`type: flux-iterate` — canônico no schema do vault, painel com **1 linha** — a PR deste run). Todas as seções (Frontmatter → H1+TLDR → 🎯 Próximo Movimento → 📊 Painel → ⏰ Timeline Verbosa → 📅 Timeline de Eventos Relevantes → ✅ Ação/Continuidade), a legenda de ícones, a regra do painel e a disciplina de carimbo de data vivem lá.

- **Caminho (determinístico):** `<VAULT_ROOT>/0-inbox/YYYY-MM-DD-HHMM-flux-iterate-pr<N>-<repo-slug>.md`. Se `VAULT_ROOT` não estiver definido (perfil genérico), registrar só no chat. Se já existir um board deste iterate (retomada de watch), **atualizá-lo**, nunca duplicar.
- **Proveniência (`--parent-board`):** se `PARENT_BOARD` não estiver vazio, este iterate nasceu de um delivery-flow. Gravar `parent_board: "<PARENT_BOARD>"` no frontmatter e, logo após o TLDR, a linha `> Executado a partir de um delivery-flow: [board da entrega](<PARENT_BOARD>)`. Sem a flag (iterate avulso), o board não tem bloco de proveniência.
- **Sem fabricação:** todo número do painel vem de fonte real — rodadas = `round` do estado; threads res/tot do GraphQL do passo 2; 👍/👎 filtrados pela conta do `gh`; CI do `gh pr checks`. Onde não houver fonte, `n/d`.
- O board nasce **tanto no watch quanto no `--once`** (o delivery-flow chama o iterate com `--once`, e ainda assim precisa do board filho). Registrar o path no estado (passo do watch, campo `board`).
- **Quem escreve depende do watch** (`${FLUX_ROOT}/shared/fanout-discipline.md`, seção do board-keeper): com o watch ligado, criar aqui o **board-keeper** (subagente nomeado, escritor único do board) e passar a mandar o delta de cada tick por `SendMessage` — assim o `CLAUDE.md` do vault e o template de board nunca entram no contexto principal, e a main nunca relê o board. Com `--once` (inclusive quando despachado por um delivery), **não criar keeper**: é uma escrita só, a main grava direto.
- **Em `--dry`:** criar o board normalmente, mas sinalizar no TLDR que o run foi read-only.

### 2b. Gate de integração com a base — PRIMEIRO gate (1ª passada E cada tick do watch)

> **Protocolo canônico:** `${FLUX_ROOT}/shared/merge-conflict-gate.md`. Não duplicar a lógica aqui: o
> shared define detecção, classificação mecânico/semântico, escolha entre rebase e merge da base,
> resolução em subagente, `--force-with-lease` e o gate humano. Este passo declara só o encaixe no
> iterate.

**Por que vem antes da triagem de CI:** numa PR `DIRTY` o GitHub não computa o merge commit, então o
resultado do CI que você leria no passo 2c é sinal falso, e qualquer correção aplicada empilha em cima
de uma base que já não funde. Triar CI antes de resolver o conflito é triar um número que vai mudar.

Com `mergeable` / `mergeStateStatus` coletados no passo 2:

- **`MERGEABLE`** → nada a fazer; seguir para o passo 2c.
- **`UNKNOWN`** → reconsultar (até 3 vezes, ~3s). Persistindo, medir localmente com `git merge-tree` e
  reportar que o GitHub não decidiu. **Nunca** seguir tratando como `MERGEABLE`.
- **`CONFLICTING`** → acionar o gate:
  1. **Reconhecer sem tocar no working tree**: `rev-list --left-right --count` (extensão da divergência)
     e `merge-tree --write-tree --name-only` (arquivos em conflito).
  2. **Classificar** mecânico vs semântico pela régua do shared. `--no-rebase`, PR de terceiro
     (`author.login != ` conta autenticada) ou classificação semântica ⇒ **não resolver**: ir ao modo
     degradado (abaixo).
  3. **Resolver via subagente executor** (o mesmo do passo 4, mesma disciplina de worktree e de
     fan-out), que aplica a estratégia, roda o quality gate do repo e **para sem pushar**.
  4. **Gate humano antes do force-push**, inclusive com `--auto` e no watch, com a estratégia, a decisão
     por arquivo, o resultado dos gates e o antes/depois do `rev-list`. Push sempre com
     `--force-with-lease`; merge da base não precisa de force.
- **`BEHIND`** (sem conflito) → só atualizar se a proteção da base exigir branch atualizada. Não é
  conflito e não justifica force-push.

**Modo degradado (o gate não resolveu):** não abortar o comando. Suspender o que depende de base
integrada (aplicar correção, commitar, pushar, triar/corrigir CI, reconciliar título e descrição) e
seguir com o que não depende (verificar alegações, responder, reagir, resolver threads). Reportar sem
eufemismo o que ficou de pé. Tabela completa na seção 6 do shared.

**Em `--dry`:** apenas **reportar** o estado de integração, como se faz com o CI. Não resolver nada.

Conflito detectado **conta como trabalho acionável** para o passo 2a (a PR tem board). Emitir os
eventos `conflito-detectado`, `conflito-resolvido` ou `conflito-bloqueado` no board e no hook Slack.

### 2c. Triagem de CI (1ª passada E cada tick do watch)

> Esta é a lógica **canônica** de CI do iterate. Vale igual na 1ª passada e em todo tick do watch, com ou sem threads no delta. Nunca relaxa o rigor: em `--dry`, apenas **reportar** o estado do CI, sem tentar corrigir.
>
> **Pré-requisito:** o gate do passo 2b passou (`mergeable == MERGEABLE`). Em PR conflitante o
> resultado do CI é inconfiável: reportar o estado e **não** tentar corrigir nada por ele.

Com o estado do CI coletado no passo 2:

- **CI verde ou rodando** → nada a fazer aqui; seguir o fluxo (threads, se houver) ou aguardar (no watch).
- **CI vermelho** → coletar o porquê antes de decidir:

  ```bash
  gh pr checks $PR_NUMBER --repo $REPO_FULL --json name,state,conclusion,link   # achar o check que falhou
  gh run view <run-id> --repo $REPO_FULL --log-failed                            # run-id vem do link/databaseId do check
  ```

  Classificar a causa:
  - **Gate de qualidade externo (SonarCloud/SonarQube)** — identificado quando o nome do check ou
    o log contém `QUALITY GATE STATUS: FAILED` ou similar: **antes de classificar**, consultar a
    API conforme `${FLUX_ROOT}/shared/quality-gate-api.md`. A sequência é: Etapa 1 (quais condições
    em `ERROR` e com que números) e depois, guiado pela condição, Etapa 2 (arquivo:linha para bug/
    vulnerabilidade, arquivos sem cobertura para `new_coverage`, hotspots pendentes para `new_security_hotspots`).
    Com os dados em mão, aplicar o mapa condição → ação do shared:
    - Condições resolvíveis por código (`new_vulnerabilities`, `new_bugs`, `new_duplicated_lines_density`,
      ratings com issue específica): classificar como **atribuível** e despachar o executor com o
      `arquivo:linha` exato da API. Nunca assumir que o arquivo está no código de produto sem verificar
      o path retornado — vulnerabilidade em `.github/workflows/` é problema de CI, não de código.
    - Condições não resolvíveis por código (hotspot pendente, cobertura em arquivo de teste medido
      como código de produção, override de gate): classificar como **não atribuível** e reportar como
      pendência humana com a evidência da API (`metricKey`, `actualValue`, `errorThreshold`).
    - Sem manifesto, sem token ou sem provider configurado: degradação declarada — o shared descreve
      o comportamento conservador e o texto do banner.
  - **Atribuível ao próprio push e dentro do escopo** (typecheck/lint/teste que este fluxo mexeu quebrou, build da branch): despachar o **subagente executor** do passo 4 com a instrução de resolver a worktree via `${FLUX_ROOT}/shared/worktree-discipline.md`, tentar **uma** correção e rodar o quality gate local (passo 5). **Sujeito ao mesmo guard de autoria do passo 6**: com `IS_OWN_PR == true`, ou `IS_OWN_PR == false` com escrita já concedida (`writeGrantedForThirdParty == true`), passando o gate, commitar + pushar na branch da PR. Com `IS_OWN_PR == false` sem concessão, o executor aplica e valida a correção mas **não commita nem pusha**: registra a correção pronta como bloqueio no board e reporta no chat, pedindo a mesma confirmação textual do passo 6 antes de escrever — nunca commitar "porque era só o CI". A investigação do log e a correção rodam nele, não na main. **No máximo uma tentativa de auto-fix por SHA** — não entrar em loop de correção.
  - **Não atribuível** (falha de infra, flaky, teste não relacionado, mudança de base): **não** mexer no código. Registrar no board + reportar no chat com link do log, e (no watch) seguir monitorando.

Emitir os eventos de CI no board/Slack conforme o hook do watch (`ci-vermelho`, `ci-corrigido-tentativa`, `ci-verde`).

### 3. Verificar e decidir cada thread (planejar) · fase 1

**A verificação roda em fan-out, não na main** (`${FLUX_ROOT}/shared/fanout-discipline.md`).
O contexto principal já tem as threads (metadados baratos do passo 2); quem **abre o repo e lê o
código** é subagente. Despachar, num único bloco de Task calls:

- **Lente holística:** Task `subagent_type: <HOLISTIC>` com o lote INTEIRO de threads abertas +
  diff + metadados, instruída a verificar cada alegação contra o código real e devolver, por
  `databaseId`, `{veredito procede|improcedente, fundamento com arquivo:linha, correção proposta}`.
- **Lentes de specialist:** conforme o contrato de `${FLUX_ROOT}/shared/review-agents.md`
  (descoberta via `SPECIALISTS_ROOT`, fan-out paralelo). Com `--solo`, pular.

Fan-out **por lente, não por thread**: as threads de uma PR compartilham o mesmo diff, então N
agentes lendo o mesmo repo para uma thread cada é desperdício. Uma lente processa o lote todo.

O contexto principal faz o **fan-in**: reconcilia os retornos, decide, e monta o plano. Não relê
os arquivos citados para "conferir" — se uma evidência ficou dúbia, despacha outro subagente.

Retorno esperado de cada lente: **< 40 linhas**, sem diff nem conteúdo de arquivo colado.

Critérios que valem para toda thread, dentro ou fora do subagente:

- **Verificar a alegação contra o código/testes/docs reais.** Bots reviewers produzem falsos positivos com frequência (ex.: apontar perda de precisão num `bigint mode:'number'`, ou "mensagem some" num cenário que já tem teste). Leia o arquivo citado, os testes adjacentes e a doc do endpoint antes de concluir. Reviewers humanos erram menos, mas o mesmo rigor se aplica.
- **Enriquecimento via specialists (por default, salvo `--solo`):** seguir o contrato de `${FLUX_ROOT}/shared/review-agents.md`. Descobrir specialists via `SPECIALISTS_ROOT`, rodá-los em paralelo via Task tool (passo 2 do contrato), e reconciliar as evidências ao verificar cada alegação. Se um specialist cobrir o mesmo ponto da thread (mesmo arquivo/linha/tema), usar os findings como evidência adicional a favor ou contra. Citar a fonte no fundamento: `(corroborado por route-auditor)` ou `(refutado por repository-layer-auditor)`. Fallback gracioso quando não houver specialists: seguir só com `<HOLISTIC>`.
- Com `--solo`: pular os specialists e verificar usando só `<HOLISTIC>`.
- Classificar: **procede** (aplicar correção) ou **improcedente/marginal** (recusar com fundamento).
- Sempre **citar `arquivo:linha`** na justificativa.

#### 3a. Cross-reference com threads já tratadas (camada de decisão)

Antes de redigir a réplica, comparar o ponto de cada thread aberta contra (a) o corpus de threads resolvidas do passo 2 e (b) as threads já processadas mais cedo NESTE run. Classificar a sobreposição:

- **`none`** — ponto novo. Seguir normal.
- **`duplicate`** — mesmo ponto já tratado e decidido numa thread irmã, sem nada de novo. Aplica a MESMA decisão. A réplica DEVE citar e **linkar** a thread irmã (markdown `[link](url)`) e dizer explicitamente que é o mesmo ponto já endereçado. Não reabrir a análise nem reaplicar correção que já foi feita.
- **`related-but-distinct`** — toca o mesmo código/tema de uma thread irmã, mas traz um ângulo genuinamente diferente (ex.: mesma subquery, mas a irmã era sobre *correção* e esta é sobre *performance/índice*). A réplica DEVE linkar a irmã para contexto E deixar claro **o que há de diferente**, e dar a este ponto sua **própria decisão** (não herdar a da irmã).

**Regra de ouro:** nunca tratar como duplicado de forma silenciosa. Sempre articular, na réplica, se é duplicado puro ou se, apesar de já citado em outro ponto, há algo distinto que merece decisão própria. Na dúvida entre `duplicate` e `related-but-distinct`, escolher `related-but-distinct` e explicar a diferença.

Como linkar a irmã: usar o `url` (permalink do comentário) coletado no passo 2. Ex.: `já endereçado em [PERF / MIN(id)](https://github.com/{owner}/{repo}/pull/{n}#discussion_r{databaseId})`.

#### 3b. Reação alinhada ao teor da resposta (vale para bot E humanos)

- 👍 (`content=+1`) quando a sugestão é acolhida/procedente (e será aplicada), OU quando é um `related-but-distinct` válido.
- 👎 (`content=-1`) quando improcedente, marginal, ou `duplicate` de algo já recusado.
- Para `duplicate` de algo já **aceito e aplicado**: 👍 (o ponto é válido), com réplica curta apontando a irmã.

Monte o **plano** (o "dry-run" da confirmação): por thread, registre `{databaseId, path:line, autor, veredito, sobreposição (none|duplicate|related-but-distinct + link da irmã), reação 👍/👎, rascunho da réplica}`, e ao final `{lista de arquivos alterados, resumo do diff, mensagem de commit proposta}`.

### 4. Aplicar as correções pertinentes · fase 2 — via subagente executor

> **GUARDA DE MODO DEGRADADO (checar antes de despachar):** se o gate do passo 2b não resolveu o
> conflito (`mergeable == CONFLICTING`), **PULE este passo inteiro**. Não despache executor, não edite
> arquivo, não rode gate. Vá direto ao passo 7 (responder/reagir/resolver as threads, que não depende
> de base integrada) e **pule os passos 8 e 8a**. Aplicar correção numa PR que não funde é exatamente
> o que o gate existe para impedir. Ver a tabela do modo degradado na seção 6 de
> `${FLUX_ROOT}/shared/merge-conflict-gate.md`.

**A execução também é fan-out.** O contexto principal **não edita arquivo do repo**: despacha **um
subagente executor** (`subagent_type: general-purpose`) que resolve a worktree, aplica as correções
e roda o quality gate (passo 5) lá dentro. É o mesmo motivo do passo 3 — abrir o repo na main custa
o pacote inteiro daquele root, permanentemente.

Prompt do executor (auto-contido, ele não herda a conversa):

- **O path da worktree já resolvida no passo 1** (com os envs já provisionados), e a instrução de
  operar exclusivamente lá dentro: nunca `git checkout` na árvore principal, nunca criar outra
  worktree. Passar o path pronto, e não a instrução de resolvê-lo, evita que dois despachos do mesmo
  run cheguem a caminhos diferentes.
- A lista de correções decididas no passo 3, uma por thread que **procede**, com `arquivo:linha` e
  o que mudar. Threads que NÃO procedem não geram mudança de código — só réplica + reação no passo 7.
- **A regra de comentários, verbatim** (`${FLUX_ROOT}/shared/code-comment-discipline.md`, seção "Como
  propagar aos subagentes"). Ela **precisa ir no prompt**: o executor não herda a conversa nem os
  `CLAUDE.md` da sessão, e este elo é o mais propenso ao defeito, porque o contexto que chega até ele é
  justamente a discussão da review, a evidência e o veredito — material que pede para virar comentário
  e não deve. Um despacho sem essa linha terceiriza a violação e volta pronto para commitar.
- O quality gate do passo 5, para rodar antes de devolver.
- Com `--auto` **e** (`IS_OWN_PR == true` **ou** `IS_OWN_PR == false` com `writeGrantedForThirdParty
  == true`): o executor também **commita e pusha** (passo 8), num só despacho, e devolve o SHA. Sem
  `--auto`, ele para depois do gate — o commit fica para depois do gate humano do passo 6. **Com
  `IS_OWN_PR == false` sem concessão, mesmo em `--auto`, o executor para depois do quality gate e não
  commita nem pusha** — o mesmo guard do passo 6/8, aplicado aqui, porque em `--auto` o passo 6 pode
  nunca ser alcançado antes do commit acontecer.

Contrato de retorno (**< 40 linhas**, sem diff colado):

```
- worktree: <path>
- arquivos: <lista de arquivos alterados>
- porThread: <databaseId> → <o que foi aplicado, em uma linha>
- gate: typecheck <ok|fail> · lint <ok|fail> · testes <ok|fail|n/a>
- falhas: <mensagens de erro resumidas, ou nenhuma>
- commit: <sha, ou n/a>
- bloqueios: <lista curta, ou nenhum>
```

Se o gate falhar, o executor devolve a falha resumida — a main decide (redespachar com a correção,
ou reportar como bloqueio). **A main não abre os arquivos para conferir o que o executor fez.**

### 5. Quality gate (antes de oferecer o push)

Rodado **dentro do executor do passo 4**, na worktree, nos arquivos tocados:

```bash
pnpm typecheck
pnpm lint        # ou: npx biome check <arquivos>
# testes unitários afetados:
CI=true AUTH_TOKEN=test-token npx vitest run <arquivos de teste afetados>
```

Integração roda em Docker. Se o daemon estiver down (`docker info` falha), **não bloqueie** — registre no plano "integração não validada localmente (Docker down)" e avise o usuário. Seguir o Agent Workflow do `CLAUDE.md` do repo (self-reviewer) quando aplicável.

> O Biome ignora os paths de teste de integração: rodar `biome check` num arquivo sob `tests/integration/` reporta "Checked 0 files" — isso é esperado, não é erro; registrar como n/a no plano.

### 6. Confirmação interativa (pular se `--auto`, exceto em PR de terceiro sem escrita concedida)

Mostre no chat o plano resumido (vereditos + reações + arquivos alterados + mensagem de commit), e abra um GATE (`${FLUX_ROOT}/shared/hitl.md`) (single-select). **As opções dependem de `IS_OWN_PR`:**

**`IS_OWN_PR == true`** (comportamento atual, sem mudança):

- **Header:** `Atualizar PR?`
- **Question:** `Apliquei as correções e preparei as respostas das {N} threads da PR #{number}. O que fazer agora?`
- **Options (nesta ordem):**
  1. `Postar tudo e atualizar a PR (Recomendado)` — descrição: `Posta as réplicas + reações 👍/👎, resolve as threads, e então commita + pusha as correções.`
  2. `Postar respostas e resolver, sem push` — descrição: `Interage no GitHub (réplicas, reações, resolve threads) mas deixa o commit/push pra você revisar o diff antes.`
  3. `Só deixar as correções locais` — descrição: `Não toca no GitHub. Threads ficam abertas, nada é commitado. Você revisa tudo localmente.`
  4. `Cancelar` — descrição: `Não posta nada. Os arquivos alterados ficam no working tree pra você inspecionar ou reverter.`

> A opção recomendada é a primeira, com `(Recomendado)` no label. Com `--auto`, assuma a opção 1 sem perguntar.

**`IS_OWN_PR == false`** (modo `no-push` por default — RN-01): sem escrita já concedida nesta rodada
(ver "Pedido explícito de escrita" abaixo), o GATE **não oferece nem executa commit/push como caminho
default**. Ele se comporta como se só a opção de interação existisse:

- **Header:** `Atualizar PR de terceiro?`
- **Question:** `Apliquei as correções e preparei as respostas das {N} threads da PR #{number}, que não é sua. O que fazer agora?`
- **Options (nesta ordem):**
  1. `Postar respostas e resolver, sem push (Recomendado)` — descrição: `Interage no GitHub (réplicas, reações, resolve threads). Nenhum commit, nenhum push — PR de terceiro não escreve por default.`
  2. `Pedir permissão pra escrever nela agora` — descrição: `Abre uma confirmação textual explícita antes de liberar commit/push nesta PR de terceiro (RN-02/RN-03). Ver "Pedido explícito de escrita".`
  3. `Só deixar as correções locais` — descrição: `Não toca no GitHub. Threads ficam abertas, nada é commitado.`
  4. `Cancelar` — descrição: `Não posta nada.`

> Com `--auto`, assuma a opção 1 (interação, sem push) **a menos que a escrita já tenha sido concedida
> nesta rodada ou persista de uma rodada anterior do mesmo watch** (ver "Pedido explícito de escrita").
> `--auto` nunca dispensa a confirmação textual da opção 2 por conta própria — ele só reaproveita uma
> concessão que já aconteceu.

#### Pedido explícito de escrita em PR de terceiro (RN-02, RN-03)

Escolhida a opção 2 (`IS_OWN_PR == false`), o comando **não libera commit/push ainda**: abre uma
segunda pergunta, desta vez de confirmação textual (não outro single-select do `shared/hitl.md`) —
peça pro usuário digitar explicitamente algo como `sim, escrever na PR de terceiro`. **Critério de
aceitação:** conta qualquer resposta que expresse, em texto claro e explícito, consentimento pra
escrever *nesta* PR de terceiro (variações da frase-exemplo servem; não precisa ser match exato).
Resposta vaga, neutra, condicional, ou fora do contexto desse consentimento (ex.: mudar de assunto,
"talvez", "deixa eu pensar") **não** conta como confirmação e cancela o pedido, voltando pro modo
`no-push` (opção 1).

Confirmado o texto, a escrita fica concedida **para esta rodada** e o fluxo segue como se a opção 1 de
`IS_OWN_PR == true` tivesse sido escolhida (post + commit + push, passo 7 e passo 8 rodam normalmente).

**Persistência no watch (RN-c):** a concessão vale pras próximas rodadas automáticas do **mesmo run**
de watch, sem precisar ser re-afirmada a cada rodada — grave `writeGrantedForThirdParty: true` no
estado persistente (ver "Estado persistente" no modo WATCH). Um novo `/flux:iterate` (nova invocação,
novo estado) sempre nasce em `no-push`; a concessão não atravessa runs.

Nunca inferir o pedido de contexto (ex.: o usuário mencionar "pode commitar" numa thread não conta).
A confirmação textual é o único caminho.

**Interação com o gate do passo 2b:**
- Se o gate **resolveu** um conflito neste run e o force-push ainda não foi aprovado, a aprovação do force-push é **pergunta própria e anterior** a esta (feita no passo 2b, com estratégia + decisão por arquivo + gates), nunca embutida na opção 1. Reescrever histórico e postar réplicas são decisões de risco diferente, e juntá-las esconde a mais grave atrás da mais trivial. `--auto` dispensa **esta** confirmação, não aquela.
- Se o gate ficou em **modo degradado**, o plano mostrado aqui não tem "arquivos alterados" nem mensagem de commit (o passo 4 foi pulado). Ajustar a pergunta para o que resta: postar as réplicas + reações e resolver as threads. Em `IS_OWN_PR == true`, a opção 1 vira equivalente à 2, dito na descrição junto do motivo (`PR conflitante com a base, correções suspensas`). Em `IS_OWN_PR == false`, o modo degradado é compatível com o `no-push` já default: nada muda na pergunta.

### 7. Postar réplicas + reações + resolver (opções 1 e 2) · fase 3

Para cada thread endereçada, na ordem: **reply → reação → resolve**.

```bash
# Réplica (review comment line-anchored):
gh api repos/$REPO_FULL/pulls/$PR_NUMBER/comments/<databaseId>/replies -f body='...'

# Reação no comentário:
gh api repos/$REPO_FULL/pulls/comments/<databaseId>/reactions -f content='+1'   # ou -1

# Resolver a thread (usa o NODE id PRRT_..., NÃO o databaseId):
gh api graphql -f query='mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread { isResolved } } }' -f id="<PRRT_...>"
```

**GOTCHA zsh:** variáveis não sofrem word-splitting. Ao iterar IDs, processe **um por vez** (loop com a lista literal ou linha a linha) — nunca passe a string inteira de IDs de uma vez para a mutation, senão o GraphQL recebe os IDs concatenados e dá `NOT_FOUND`.

Top-level issue comments: responder = novo `gh api repos/$REPO_FULL/issues/$PR_NUMBER/comments -f body=...` referenciando o autor; reação via `issues/comments/<id>/reactions`. Não há resolve.

**Guardrail para threads HUMANAS:** resolva automaticamente quando o assunto está encerrado (acolhido + aplicado, ou recusado com justificativa clara e baixa controvérsia). Se a thread precisa de decisão do revisor (`needs-discussion`), **poste a réplica + reação mas NÃO resolva** — deixe aberta e sinalize ao usuário no resumo final.

### 8. Commit + push (somente opção 1, e só após o passo 7 completo) · fase 4

> **GUARDA DE MODO DEGRADADO:** com `mergeable == CONFLICTING` não resolvido pelo passo 2b, **não
> commite e não pushe** (nem rode o passo 8a, que pressupõe push). O passo 7 já fechou a conversa; o
> código fica intocado e o bloqueio vai no relatório do passo 9. Não "aproveitar" o push para
> atualizar a branch.

> **GUARDA DE AUTORIA (RN-01/RN-02):** com `IS_OWN_PR == false`, este passo só roda se a escrita foi
> concedida no passo 6 (opção 2 + confirmação textual, desta rodada ou persistida do watch). Sem essa
> concessão, o passo 6 já não teria levado até aqui — mas se algum caminho de código chegar neste
> ponto sem `IS_OWN_PR == true` nem a concessão registrada, é bug: aborte o commit/push, registre o
> bloqueio e reporte, nunca escreva "por garantia".

Confirme que TODAS as threads endereçadas foram respondidas e resolvidas antes de pushar.

**Antes de commitar, conferir os comentários que a rodada está introduzindo** (`${FLUX_ROOT}/shared/code-comment-discipline.md`, seção "Verificação antes de commitar"): `git diff --cached | grep -nE '^\+\s*(//|/\*|\*|\{/\*|#)'`. Linha de comentário adicionada que não seja diretiva de ferramenta nem o padrão de doc comment do repo **sai antes do commit**. É o único ponto do fluxo em que isso se pega sem depender do usuário revisar.

**Com `--auto`, este passo já foi feito pelo executor do passo 4** (o SHA veio no retorno) — não
refaça. Sem `--auto`, ele acontece agora, depois do gate humano: rode os comandos abaixo com
`git -C <worktree>` a partir do contexto principal (git contra a worktree é barato e não abre o
root do repo na main) ou, se a situação exigir julgar arquivos, redespache o executor com a
instrução de commitar e pushar.

```bash
git add <arquivos alterados>
git commit -m "$(cat <<'EOF'
<emoji> <tipo>(<escopo>): <descrição do que e por que>

<corpo: o que mudou e o porquê das correções dos comentários>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
git push origin <headRefName>
```

- Conventional Commits + emoji prefix. Se forem correções heterogêneas, agrupe num commit coerente (ou separe em commits por tema, a critério).
- **OBRIGATÓRIO** o trailer `Co-Authored-By: Claude <noreply@anthropic.com>` via HEREDOC, sem exceção.
- Push só na branch da PR (`headRefName`), nunca em `main`.

### 8a. Reconciliar título e descrição da PR · fase 4b

> **Por que existe.** Título e descrição são o que o revisor humano lê primeiro e o que sobrevive no
> histórico do repo. Quando uma rodada muda o desenho (proposta refutada, mecanismo trocado, escopo
> cortado), os dois passam a **afirmar coisa que a própria PR já refutou** nas threads. Caso real que
> originou este passo: a descrição anunciava `/implement-task update` como *a* proposta depois de a review
> ter derrubado o verbo-fachada, uma tabela listava uma seção como "ausente" depois de a thread ter provado
> que ela existe, e o título ainda dizia "proposta do verbo update" depois de o verbo ter sido descartado.
> Thread resolvida com CI verde e título/descrição mentindo é entrega pela metade.

Roda **depois do push** (título e descrição descrevem o estado que está no remoto, não o intermediário),
em toda rodada que mudou algo que eles afirmam. **Nunca roda em `--dry`.** Título e descrição são
reconciliados na **mesma passada**, porque descasá-los é pior que deixar os dois velhos: título novo com
descrição velha faz o leitor duvidar de qual dos dois está certo.

#### Guardrails (os três são bloqueantes)

1. **Só PR própria.** Comparar `author.login` da PR com a conta autenticada (`gh api user -q .login`). Se
   for PR de terceiro, **nunca** editar a descrição: redigir a correção sugerida e postar como comentário,
   registrando no board que a reconciliação virou sugestão. Editar o texto de outra pessoa não é escopo
   deste comando.
2. **Só afirmação refutada por evidência.** Mesmo rigor do passo 3: só mexe numa frase da descrição que
   esteja contradita por (a) evidência no estado atual da branch, com `arquivo:linha`, ou (b) decisão
   fechada numa thread desta rodada, com link da thread. **Proibido "melhorar" redação, reorganizar
   seções ou reescrever o que apenas envelheceu de estilo.** Sem par de evidência, não é drift: é gosto,
   e não se toca.
3. **Nunca reescrever o body inteiro.** Sempre `gh pr view --json body` primeiro e editar **sobre** o
   texto atual, cirurgicamente. Gerar descrição do zero apaga trabalho humano (contexto que o autor
   escreveu à mão, links de PRs irmãs, checklist que o revisor marcou) e é a falha mais cara possível
   aqui, porque é silenciosa e irreversível pela UI.

#### O título tem regra própria (mais restritiva que a descrição)

O título circula muito mais que o corpo: entra em notificação de e-mail e Slack, no assunto da review
request, na busca do GitHub, na lista de PRs, e vira a **mensagem do squash commit** que fica na `main`
para sempre. Renomear no meio da review confunde quem procura pelo nome antigo. Então:

- **Renomear só quando o título nomeia o desenho refutado**, ou seja, quando ele é factualmente errado
  agora. Título que apenas ficou genérico, ou que você escreveria melhor hoje, **não se toca**. A barra é
  mais alta que a da descrição, não igual.
- **Preservar a convenção do repo, não inventar formato.** Inferir o padrão dos títulos das PRs vizinhas
  (`gh pr list --limit 20 --json number,title`) e manter exatamente: prefixo de ticket (`[ENG-1234]`,
  `[AIPROD-000]`), tipo e escopo de Conventional Commit (`docs(shared):`), e convenções de escrita do repo
  — incluindo **se o repo escreve título sem acento**, caso em que não se acentua o título novo mesmo com
  a regra geral de PT-BR acentuado valendo para o corpo. O que muda é só o miolo que ficou errado.
- **Nunca mexer no prefixo de ticket.** Ele é chave de rastreabilidade para o Linear e para o CI; trocar
  ou remover quebra automação silenciosamente.
- **Registrar o título antigo no bloco gerenciado** (linha do changelog daquela rodada), para que quem
  procurar pelo nome anterior ainda ache o rastro dentro da PR.
- Vale o mesmo guard de autoria: título de PR de terceiro **não** se renomeia, vira sugestão em comentário.

```bash
gh pr edit $PR_NUMBER --repo $REPO_FULL --title '<titulo novo>'
```

#### Duas zonas, tratadas de forma diferente

- **Zona autoral** (a prosa da descrição): edição cirúrgica só nas afirmações refutadas. Preservar voz,
  estrutura de seções, tabelas e o trailer `🤖 Generated with [Claude Code]`. Quando a mudança inverte
  uma decisão, **não apagar o desenho antigo em silêncio**: reescrever para o desenho vigente e registrar
  a virada no bloco gerenciado (abaixo). Quem chega na PR depois precisa entender por que mudou.
- **Bloco gerenciado** (append no fim, antes do trailer): tabela mantida pelo flow, delimitada por
  marcadores HTML, segura de reescrever por inteiro a cada rodada.

```markdown
<!-- flux:iterate:changelog -->
### Histórico de revisão (mantido pelo `/flux:iterate`)

| rodada | data | o que mudou | origem |
|---|---|---|---|
| 2 | 2026-07-29 | mecanismo do read-only passa de `allowed-tools` para `disallowed-tools`; verbo-fachada descartado | [thread](https://github.com/o/r/pull/240#issuecomment-5123908114) |
<!-- /flux:iterate:changelog -->
```

Se os marcadores já existem, substituir **só** o conteúdo entre eles. Se não existem, inserir o bloco
antes do trailer (ou no fim, se não houver trailer). Nunca duplicar o bloco.

#### Mecânica

```bash
# 1. salvar o body atual (rollback + diff auditável)
gh pr view $PR_NUMBER --repo $REPO_FULL --json body -q .body > "$SCRATCH/pr-$PR_NUMBER-body-before.md"
cp "$SCRATCH/pr-$PR_NUMBER-body-before.md" "$SCRATCH/pr-$PR_NUMBER-body-after.md"
# 2. editar o -after.md cirurgicamente (Edit tool), nunca reescrevendo do zero
# 3. conferir o diff antes de publicar
diff -u "$SCRATCH/pr-$PR_NUMBER-body-before.md" "$SCRATCH/pr-$PR_NUMBER-body-after.md"
# 4. publicar
gh pr edit $PR_NUMBER --repo $REPO_FULL --body-file "$SCRATCH/pr-$PR_NUMBER-body-after.md"
```

Usar `--body-file`, nunca `--body` com string inline: markdown longo em argumento de shell é onde nascem
os acidentes de escaping e de truncamento. Quando o título também mudou, publicar título e corpo **no mesmo
`gh pr edit`** (ou em chamadas consecutivas, sem gate entre elas), para a PR nunca ficar num estado com um
reconciliado e o outro não. Valem as **Convenções de texto** deste arquivo, incluindo a
proibição de travessão quando `NO_EMDASH == true` (a descrição é publicação externa).

Após publicar, gravar `bodySyncedAtSha` no estado (o SHA para o qual a descrição está reconciliada) e
registrar no board: linha na Timeline de Eventos Relevantes com tipo `pr-body` e um parágrafo na Timeline
Verbosa dizendo **qual afirmação** foi corrigida e **com que evidência** (não basta "descrição
atualizada"). Emitir o evento Slack `descricao-reconciliada` se o feed estiver configurado.

#### Gate

- **1ª passada (interativa):** o diff da descrição entra no plano do passo 6, resumido como "N afirmações
  da descrição contraditas pelo estado atual" mais o antes/depois do título, quando houver. A opção 1 da
  confirmação passa a cobrir a reconciliação dos dois.
- **Rodadas de watch (`--auto`):** aplica sozinha, com os três guardrails valendo igual, e registra no
  board. Watch não relaxa o rigor, aqui como em qualquer outro passo.
- Se **nenhuma** afirmação estiver refutada, não editar nada e não tocar no bloco gerenciado só para
  rolar data. Descrição sem drift é descrição correta, e título ainda preciso é título que fica como está
  (é comum a descrição precisar de conserto e o título não: são barras diferentes).

### 9. Resposta no chat

Tabela curta: por thread `{path:line | veredito | sobreposição | 👍/👎}`, depois `{commit hash, range de push}`.

**Dizer onde ficou a worktree e em que estado ela está** (path, e quantos envs foram provisionados do cofre, ou por que não foram). É a informação que o usuário precisa para abrir a branch e olhar o resultado com os próprios olhos, e omiti-la obriga a perguntar. Quando o cofre não tinha entrada para o repo, ou o manifesto não declara `env_vault`, dizer isso explicitamente em vez de deixar a worktree parecer pronta para subir. Sinalize threads humanas deixadas abertas (`needs-discussion`) e quais foram marcadas como `duplicate`/`related-but-distinct` (com link da irmã). Não repita os bodies completos das réplicas.

**Sempre reportar o estado de integração com a base**, mesmo quando ele estava limpo (é a informação que decide se a PR pode mergear). Quando este run foi despachado por um orquestrador (`--parent-board` presente, ou seja, rodando dentro do subagente de um `/flux:land`), o retorno inclui os campos estruturados `mergeable` e `conflito` do contrato da fase 4 do land, e não só a prosa: quem consome é máquina, e inferir conflito de texto livre é frágil no dado que decide o go/no-go. Se o gate do passo 2b agiu, dizer a estratégia (`rebase` ou `merge`), os arquivos resolvidos com a decisão de cada um, e o resultado dos gates. Se o gate ficou em **modo degradado**, dizer explicitamente o que **não** foi feito: `conflito semântico em <arquivos> — respondi as threads, não apliquei correção nem pushei`. Nunca fechar o relatório dando a PR por pronta quando ela segue conflitante.

Quando o passo 8a mexeu em título ou descrição, dizer em uma linha **o que foi corrigido e por quê** (e, no caso do título, mostrar o antes/depois) (ex.: `descrição: a seção "A proposta" ainda anunciava o verbo-fachada, refutado na thread X`). Quando a PR é de terceiro e a reconciliação virou sugestão em comentário, sinalizar isso explicitamente.

## Convenções de texto (GitHub = publicação externa)

- PT-BR com acentuação correta sempre.
- **PROIBIDO travessão (—) e en-dash (–)** em qualquer texto postado no GitHub (réplicas, corpo de commit que vai pra PR) quando `NO_EMDASH == true`. Usar vírgula, dois-pontos, parênteses, ponto-e-vírgula. (Vale para texto externo, não para este arquivo de doc interno.)
- Em `gh api -f body='...'`, usar **aspas simples** para o shell não interpretar crases/backticks. Conferir que o texto não contém apóstrofo (que quebraria a aspa simples); se contiver, reescrever sem apóstrofo ou usar HEREDOC via `--input`. Como backtick é literal dentro de aspas simples, dá pra usar markdown à vontade no body sem escape.

### Formatação markdown das réplicas (OBRIGATÓRIO)

O GitHub renderiza markdown nas réplicas. NÃO postar identificadores e código em plain text. Aplicar sempre:

- **Inline code (backticks)** em: identificadores (variáveis, funções, colunas, tabelas, enums, flags), expressões e trechos curtos de SQL/código, nomes de arquivo, valores literais e query params de exemplo.
- **Referências `arquivo:linha`** sempre em backticks, e quando ajudar o leitor, linkadas ao permalink do blob no SHA do head da PR:
  - Linha única: `` [`path:1467`](https://github.com/{owner}/{repo}/blob/{headSha}/{path}#L1467) ``
  - Range: `...#L1463-L1466`
  - Pegar o SHA: `gh pr view {n} --repo {owner}/{repo} --json headRefOid -q .headRefOid` (usar o SHA, não a branch, para o link não quebrar em pushes futuros).
- **Trechos de mais de uma linha** em bloco cercado com a linguagem: ```` ```sql ... ``` ````.
- A legenda canônica de badges de findings (quando for citar a severidade de um ponto no corpo da réplica) segue `${FLUX_ROOT}/shared/review-legend.md`. **Atenção:** as reações 👍/👎 do GitHub e os STATUS do board (🟣 MERGED, 🟢 READY, 🔒 HITL, etc.) são categorias distintas — deixá-las intactas, não substituir por badges.

---

## Modo `--dry` (rascunho read-only)

Quando `--dry` estiver presente, o comando opera em modo **estritamente read-only**: coleta e analisa as threads, mas **não aplica**, **não posta**, **não resolve**, **não commita**, **não pusha** e **não edita título nem descrição** da PR.

### Fluxo em `--dry`

1. Executar os passos 0-context, 1 (resolver target), 2 (coletar metadados + threads), e 2a (criar board com nota `[dry-run]` no TLDR).
2. Coletar o diff completo da PR: `gh pr diff $PR_NUMBER --repo $REPO_FULL`.
3. **Pular threads triviais** (regra do passo 2): body só com aprovação (`LGTM`, `👍`, `:+1:`, `✅`) ou comentário do próprio autor sem réplica de terceiros.
4. Delegar ao `<ANSWERER>` via Task tool (subagent_type: `<ANSWERER>`), passando:
   - Lista de threads abertas não-triviais (path:line, body, autor, `diff_hunk` quando disponível, cadeia de réplicas existentes)
   - Diff completo da PR
   - Metadados (repo, número da PR, branches, autor)
   - Caminho do checkout local quando disponível
   - Instrução: produzir rascunhos classificados em `accepts-suggestion / defends-decision / needs-discussion / needs-code-change` + os comandos `gh api` prontos para cada thread.
   - Se `ANSWERER` não estiver definido no perfil (genérico): usar `<HOLISTIC>` com instrução explícita de rascunhar réplicas seguindo o mesmo formato.
5. Computar o **path do arquivo de saída**:
   - Com `VAULT_ROOT`: `<VAULT_ROOT>/0-inbox/YYYY-MM-DD-HHMM-{repo-slug}-PR{n}-v{N}-answers.md` — nota nova nasce no inbox, como todas as outras.
     - `{N}` = número de runs de `--dry` neste dia para esta PR. Contar os arquivos de mesmo prefixo nos **dois** lugares onde eles podem estar: `<VAULT_ROOT>/0-inbox/` (ainda não triados) e `<VAULT_CTX_ROOT>/pr-reviews/` (já promovidos pelo `/organize`). Contar só o inbox reinicia o `v` depois de cada triagem e sobrescreve rascunho anterior.
   - Sem `VAULT_ROOT` (perfil genérico): imprimir o resultado no chat em vez de salvar.
6. **Salvar** o output do `<ANSWERER>` no arquivo calculado (Write tool), com frontmatter mínimo de roteamento (`type: pr-review`, `context: <VAULT_CTX>`, `repo: <repo-slug>`, `pr:`, `date:`, `pending_organize: true`) — sem esse sinal o `/organize` não sabe para qual contexto promover. **Nunca** escrever no GitHub.
7. Anunciar no chat:
   ```
   Rascunhos salvos em {caminho-completo}.

   {N} threads: {X} accepts-suggestion, {Y} defends-decision, {Z} needs-discussion, {W} needs-code-change.
   ```
   Acrescentar o **estado de integração com a base** (`mergeable`), porque em `--dry` ele é reportado como qualquer outro diagnóstico. PR `CONFLICTING` significa que os rascunhos são aplicáveis, mas a PR precisa do gate do passo 2b num run que escreva.

> Em `--dry`, o watch (**não** faz sentido vigiar CI sem ter pushado nada) é ignorado automaticamente — equivale a `--once`.

---

## Modo WATCH (default; desligue com `--once`)

> O watch é o comportamento **padrão**: o comando faz a 1ª passada normalmente e, após o push, **fica vivo** monitorando a PR (CI + novas rodadas do bot) até ela assentar ou mergear. Use `--once` (alias `--no-watch`) para rodar só uma passada e terminar após o push.

### Quando o usuário pediu

Cenário típico: o usuário fechou a 1ª rodada de threads e **vai sair**. Quer que o comando:
1. Pegue automaticamente as **próximas rodadas** do bot reviewer (que costuma recomentar depois do push) e as feche sem intervenção.
2. **Monitore o CI** da PR (GitHub Actions) e avise/aja quando quebrar.
3. Não esqueça: mantenha a sessão acordada com cadência sã até a PR assentar.

As **rodadas subsequentes do watch rodam em `--auto`**: cada uma aplica + posta + resolve + commita + pusha sozinha (assume a opção 1 da confirmação), já que o usuário tipicamente saiu. **Em PR de terceiro, isso vale só se a escrita já foi concedida** (`writeGrantedForThirdParty == true` no estado, ver "Pedido explícito de escrita" no passo 6); sem concessão, cada rodada automática fica em `no-push` (interação, sem commit/push) até o usuário pedir escrita numa passada interativa. A 1ª passada mantém a confirmação interativa, a menos que `--auto`. A configuração de `--solo` persiste em todas as rodadas. Verificação contra o código real continua **obrigatória** em toda rodada, watch não relaxa o rigor anti-falso-positivo.

### Estado persistente (não esquecer entre wakes)

Mantenha um arquivo de estado por PR para sobreviver aos `ScheduleWakeup` e às janelas de contexto. Caminho: `.git/flux-watch-pr-<PR_NUMBER>.json` no checkout (fica fora do versionamento, dentro de `.git/`). Campos:

```json
{
  "pr": 962,
  "repo": "owner/repo",
  "headRefName": "feat/...",
  "round": 1,
  "solo": false,
  "noRebase": false,
  "resolvedThreadIds": ["PRRT_..."],
  "answeredCommentIds": [123456789],
  "lastHeadSha": "abc123",
  "lastCiConclusion": "success|failure|pending|null",
  "lastMergeable": "MERGEABLE|CONFLICTING|UNKNOWN|null",
  "conflictAttemptedAtBaseSha": null,
  "forcePushApproved": false,
  "writeGrantedForThirdParty": false,
  "bodySyncedAtSha": "abc123",
  "titleSyncedAtSha": "abc123",
  "quietTicks": 0,
  "board": "<VAULT_ROOT>/0-inbox/....md",
  "parentBoard": null,
  "startedAt": "<ISO>",
  "lastTickAt": "<ISO>"
}
```

Os três campos do gate de integração: `lastMergeable` = último `mergeable` lido; `conflictAttemptedAtBaseSha` = SHA da **base** para o qual já se tentou uma resolução (a régua de "uma tentativa por SHA da base"); `forcePushApproved` = o usuário já aprovou force-push neste run, o que dispensa reperguntar em ticks seguintes **enquanto a classificação seguir mecânica** (conflito semântico repergunta sempre). `writeGrantedForThirdParty` = em PR de terceiro (`IS_OWN_PR == false`), o usuário já confirmou por texto o pedido de escrita (passo 6) neste run — dispensa repetir a confirmação nas rodadas automáticas seguintes do mesmo watch, nunca entre runs diferentes. Em PR própria o campo fica `false` e não é lido.

Na 1ª passada, gravar o estado inicial (round 1, threads que você resolveu, SHA pós-push, `board` = path criado no passo 2a, `parentBoard` = `PARENT_BOARD` se veio de um delivery-flow, `solo` = valor da flag, `noRebase` = valor da flag, `bodySyncedAtSha` / `titleSyncedAtSha` = SHA para o qual descrição e título foram reconciliados no passo 8a, ou `null` se não houve drift, `writeGrantedForThirdParty` = `true` se a 1ª passada já concedeu escrita numa PR de terceiro, senão `false`). Em cada tick, ler, atualizar e regravar. Se o arquivo sumir (ex.: sessão reiniciada), reconstruir o `resolvedThreadIds` a partir das threads atualmente `isResolved == true` de sua autoria, o `answeredCommentIds` a partir dos issue comments de terceiros que já têm réplica sua posterior a eles, e o `board` a partir do naming determinístico do passo 2a.

**Atualizar o board a cada tick:** todo tick rola o carimbo de data do board (frontmatter `updated:`, TLDR, título do painel) e recomputa o painel single-PR (status da PR, CI real do `gh pr checks`, threads res/tot, rodadas, 👍/👎 do flow). Tick com novidade substantiva (rodada fechada, push, CI mudou, PR mergeou) também ganha linha na Timeline de Eventos Relevantes + parágrafo na Timeline Verbosa. Tick quiet só rola a data.

### O loop de watch (cada tick)

Após a 1ª passada (e a cada wake), execute UM tick:

1. **Estado da PR.** `gh pr view $PR_NUMBER --repo $REPO_FULL --json state,merged,headRefOid,isDraft,mergeable,mergeStateStatus`.
   - `merged == true` ou `state == "CLOSED"` → **encerrar o watch** com relatório final. Não pushar mais nada.
   - **`mergeable` entra nesta coleta obrigatoriamente.** A base anda enquanto o watch dorme: uma PR que integrava no tick anterior pode estar `CONFLICTING` agora. Não herdar `lastMergeable` do estado sem reconsultar.
2. **CI.** `gh pr checks $PR_NUMBER --repo $REPO_FULL --json name,state,conclusion,link` (ou `gh pr checks` simples se o JSON não vier). Classifique o agregado:
   - `pending`/`in_progress` → CI rodando, ainda não decidiu.
   - todos `success`/`neutral`/`skipped` → **verde**.
   - qualquer `failure`/`timed_out`/`cancelled` → **vermelho**.
3. **Threads novas.** Rode o GraphQL `reviewThreads` do passo 2. Compute o delta: threads `isResolved == false` cujo `id` (PRRT) **não** está em `resolvedThreadIds` do estado, e que não sejam triviais (mesma regra de "pular triviais"). Esse delta é a **nova rodada**.
3b. **Issue comments novos.** Rode TAMBÉM `gh api repos/$REPO_FULL/issues/$PR_NUMBER/comments` (o `reviewThreads` não os retorna — ver passo 2). Compute o delta: comentários de terceiros com `id` **não** presente em `answeredCommentIds` do estado, aplicando a mesma partição acionável/ignorável do passo 2. Um issue comment acionável novo **conta como nova rodada**, exatamente como uma thread nova. Ao respondê-lo, acrescente o `id` a `answeredCommentIds`.

#### Decisão do tick (em ordem de prioridade)

- **PR conflitante (`mergeable == CONFLICTING`) → tem precedência sobre tudo.** Aplicar o **gate de integração do passo 2b** (fonte única) antes de qualquer outra coisa deste tick, pelo mesmo motivo da 1ª passada: correção empilhada em base que não funde piora o conflito, e o CI do tick é inconfiável. Se a base andou desde a última tentativa (`conflictAttemptedAtBaseSha != ` SHA atual de `origin/<base>`), é tentativa nova; se é o mesmo SHA de base, **não retentar**. Resolvido → evento `conflito-resolvido`, atualizar `lastHeadSha` e `lastMergeable`, e seguir o tick normalmente. Não resolvido → evento `conflito-bloqueado`, **modo degradado**: fechar a conversa das threads do delta (responder/reagir/resolver) sem aplicar, commitar ou pushar, e não contar quiet tick.
- **Nova rodada de threads (delta não vazio)** → executar o fluxo normal (passos 3 a 8a, incluindo a reconciliação da descrição) **só sobre as threads do delta**, com `--auto`. Ao terminar: `round += 1`, adicionar os PRRT recém-resolvidos a `resolvedThreadIds`, atualizar `lastHeadSha`, zerar `quietTicks`. Emitir evento Slack `nova-rodada-fechada` (ver "Hook Slack").
- **CI vermelho** (e sem delta de threads) → aplicar a **triagem de CI do passo 2c** (fonte única): coletar o porquê via log, identificar se é gate de qualidade externo e, nesse caso, consultar a API conforme `${FLUX_ROOT}/shared/quality-gate-api.md` antes de classificar; se a causa for atribuível ao próprio push e dentro do escopo, tentar **uma** correção na worktree da PR + quality gate + commit/push na mesma branch (evento `ci-corrigido-tentativa`); senão, não mexer no código, registrar e reportar (evento `ci-vermelho` com link do log e, para gate externo, com `metricKey`/`actualValue`/`errorThreshold` da API). No máximo **uma** tentativa de auto-fix por SHA — nunca em loop.
- **CI verde + sem delta de threads + PR integrando** → antes de contar quiet tick, checar **drift de título e descrição**: se `bodySyncedAtSha != lastHeadSha` ou `titleSyncedAtSha != lastHeadSha`, rodar o passo 8a sobre o SHA corrente (uma passada, com os três guardrails). Depois, `quietTicks += 1`. Emitir `ci-verde` apenas na **transição** (quando `lastCiConclusion != success`).
- **CI pending + sem delta** → não fazer nada além de aguardar (não conta como quiet tick).

Atualizar sempre `lastCiConclusion`, `lastMergeable` e `lastTickAt` no estado.

#### Condições de saída (encerrar o watch)

- PR mergeada ou fechada.
- **Assentou**: CI verde, zero threads abertas, **`mergeable == MERGEABLE`** e **título/descrição reconciliados** (`bodySyncedAtSha` e `titleSyncedAtSha` == `lastHeadSha`, ou nenhuma afirmação em drift) por **2 ticks consecutivos** (`quietTicks >= 2`). A PR está pronta para review humano/merge; o watch cumpriu o papel. **Nunca declarar "assentou" com a PR `CONFLICTING`** (nem com `UNKNOWN` sem reconsultar): PR conflitante e quieta é PR travada, não PR pronta, exatamente como título ou descrição afirmando algo que a PR já refutou.
- **Conflito bloqueado sem saída**: `mergeable == CONFLICTING` com o gate em modo degradado (semântico, `--no-rebase` ou PR de terceiro) e **nada mais a fazer** (zero threads no delta, CI não acionável) → encerrar avisando que a PR precisa de resolução humana do conflito. Ficar vivo não muda o bloqueio, e o watch não deve consumir wakes esperando por decisão que é do usuário.
- Limite de segurança: `round > 8` ou watch ativo há mais de ~6h sem assentar → encerrar avisando que passou do esperado (provável discussão humana travada, CI cronicamente vermelho ou conflito recorrente com uma base muito movimentada) e pedir olhada manual.
- Usuário interrompe a sessão.

Em qualquer saída, **relatório final** no chat: rodadas fechadas, estado final do CI (com link se vermelho), **estado final de integração com a base** (e, se houve resolução de conflito, a estratégia usada e os arquivos resolvidos), threads humanas deixadas em `needs-discussion`, e o range de commits pushados durante o watch.

### Cadência (escolha do `delaySeconds` do próximo wake)

Use `ScheduleWakeup` ao fim de cada tick para reabrir a sessão. A escolha do intervalo segue as janelas de cache (TTL ~5 min):
- **CI rodando** ou **acabei de fechar uma rodada** (espero recomentário rápido do bot): **270s** (mantém o cache quente; é o que muda rápido).
- **CI verde, aguardando assentar** (quiet ticks): **1200s** (~20 min). Não há o que checar antes disso; paga o cache miss uma vez e espera mais.
- **CI vermelho aguardando resolução externa**: **1200s**. Já reportei; só re-checo se mudou.
- **Conflito com a base aguardando decisão humana** (modo degradado): **1200s**, ou encerrar se não houver mais nada a fazer (ver condições de saída). Não ficar acordando de 270s em 270s para reencontrar o mesmo conflito.
- Nunca 300s (pior dos dois mundos). O `reason` do wake deve ser específico: `"watch PR #962: CI rodando pós-push, re-checo em 270s"`.

Passar o **mesmo input** (`${FLUX_CMD}iterate <pr>`, que já reentra no watch por ser o default) de volta no `prompt` do `ScheduleWakeup`, para o próximo firing reentrar no watch. Omitir o `ScheduleWakeup` apenas nas condições de saída.
(montar com o `FLUX_CMD` resolvido no preflight, nunca com `/flux:` literal: o prompt do wake é reinvocação de máquina, e um comando que não existe naquele harness faz o watch morrer em silêncio)

### Hook Slack (feed de status, opcional)

Se o feed de PRs no Slack estiver configurado no perfil, emitir uma atualização a cada **transição** relevante: `conflito-detectado`, `conflito-resolvido`, `conflito-bloqueado`, `nova-rodada-fechada`, `ci-vermelho`, `ci-corrigido-tentativa`, `ci-verde`, `descricao-reconciliada`, `assentou`, `mergeada`. Usar o updater do feed (canvas vivo + ping no thread). Se o feed não estiver configurado, **pular silenciosamente** o hook, o watch funciona sem ele.

---

## Bootstrap de specialists (repo sem suite local)

Ao **assentar a PR** (fim do watch, ou fim da passada com `--once`), se o repo estiver **sem L2**,
oferecer a criação da suite local seguindo `${FLUX_ROOT}/shared/bootstrap-specialists.md`. Nunca
antes: fechar a PR é a prioridade, e a oferta no meio do loop é ruído.

**Aceitar dispara `${FLUX_CMD}equip <repo> --agents-only`**; o iterate oferece, não gera. Toda a
mecânica de escrita (destino, guardas, manifesto) é do verbo de preparo.

A suite gerada é **L2, fora do repositório**. Se o repo tem agents de review próprios, eles são L3,
já entraram na verificação por descoberta, e o `equip` não os toca.

## Notas finais

- **Integração com a base é o primeiro gate** (passo 2b, protocolo em `${FLUX_ROOT}/shared/merge-conflict-gate.md`): PR que não funde com a base é PR sobre a qual não se escreve, e o CI verde dela é sinal falso. Conflito conta como trabalho acionável por si só, então uma PR com zero threads e CI verde **não** encerra a passada se estiver `CONFLICTING` (foi exatamente assim que a `arco-ai-plugins#252` passou batida). Resolução mecânica o flow faz; semântica é do usuário; force-push só com `--force-with-lease` e aval humano, que `--auto` não substitui.
- Verificação vem antes de tudo: nunca aceitar um comentário sem confirmar a alegação no código real. Vale igual dentro do modo WATCH e no `--dry`.
- **Specialists por default**: a verificação enriquece com os specialists do repo seguindo `${FLUX_ROOT}/shared/review-agents.md`. Use `--solo` para pular e rodar só com `<HOLISTIC>`. Fallback gracioso quando não houver specialists no repo.
- **Watch é o default**: após a 1ª passada e o push, fica vivo monitorando CI + novas rodadas do bot até a PR assentar/mergear (ver "Modo WATCH"). Use **`--once`** (alias `--no-watch`) para o comportamento de uma passada só.
- **`--dry` nunca escreve no GitHub**: qualquer texto rascunhado fica no vault (ou no chat se não houver vault) e não é postado.
- **Título e descrição são entregável, não enfeite** (passo 8a): thread resolvida com CI verde e descrição afirmando o desenho que a própria rodada refutou é entrega pela metade. A reconciliação roda em toda rodada que muda algo afirmado pela descrição, com os três guardrails (só PR própria · só afirmação refutada por evidência · nunca regerar do zero), e o watch não declara "assentou" com título ou descrição em drift. O título tem barra mais alta: só se renomeia quando nomeia o desenho refutado, preservando prefixo de ticket e a convenção de escrita do repo, com o nome antigo registrado no changelog.
- Se `gh` não estiver autenticado, pedir `gh auth login` e abortar.
- Se o quality gate falhar (typecheck/lint/teste), **não** avançar para postar/pushar: reportar a falha e parar para o usuário decidir.
