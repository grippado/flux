---
name: iterate
description: "Orquestrador `flux:iterate` — fecha o loop de UMA PR (checa se ela ainda funde com a base e resolve conflito mecânico, verifica threads contra o código real, aplica correções, responde, reage 👍/👎, resolve, commita, pusha, vigia CI + bot). `--dry` rascunha réplicas read-only e salva no vault. Global, resolve contexto via `flux-context.md`."
user-invocable: true
requires:
  hard:
    - file: shared/flux-context.md
    - file: shared/merge-conflict-gate.md
    - file: shared/worktree-discipline.md
    - file: shared/fanout-discipline.md
    - file: shared/review-agents.md
    - file: shared/board-template.md
    - bin: git
    - bin: gh
    - agent: ${HOLISTIC}
  soft:
    - bin: jq
    - checkout_local
    - vault
---

# /flux:iterate

Fecha o loop de uma rodada de review: verifica cada thread (aberta, ou resolvida por terceiro) contra o código real, aplica o que procede, responde, reage, resolve, trata o CI atribuível ao próprio push, commita, pusha e reconcilia título e descrição. Por padrão fica vivo vigiando CI e novas rodadas até a PR assentar.

Três regras atravessam o verbo: o **gate de integração com a base vem primeiro** (passo 2b; PR que não funde não recebe escrita, e o CI verde dela é sinal falso); toda escrita acontece na **worktree da branch da PR** (`${FLUX_ROOT}/shared/worktree-discipline.md`); e todo trabalho pesado roda em **subagente** (`${FLUX_ROOT}/shared/fanout-discipline.md`). Uma PR sem threads mas conflitante, ou com CI vermelho, continua acionável.

Irmãos: `/flux:review` (review formal, read-only) e `/flux:iterate --dry` (rascunha réplicas, não posta). Trata threads de bot e de pessoas.

**Legenda canônica de badges:** `${FLUX_ROOT}/shared/review-legend.md`
**Contrato de agentes (descoberta + reconciliação):** `${FLUX_ROOT}/shared/review-agents.md`
**Bootstrap de specialists (repo sem suite local):** `${FLUX_ROOT}/shared/bootstrap-specialists.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Disciplina de worktree (escrever sempre em worktree):** `${FLUX_ROOT}/shared/worktree-discipline.md`
**Gate de integração com a base (OBRIGATÓRIO — 1º gate, antes do CI):** `${FLUX_ROOT}/shared/merge-conflict-gate.md`
**Diagnóstico de quality gates externos via API (consultar antes de classificar gate Sonar):** `${FLUX_ROOT}/shared/quality-gate-api.md`
**Carimbo de atribuição no corpo da PR (passo 8a):** `${FLUX_ROOT}/shared/pr-attribution.md`
**Disciplina de fan-out (OBRIGATÓRIA — verificação e execução em subagente):** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Disciplina de comentários em código (OBRIGATÓRIA — não comentar sem pedido):** `${FLUX_ROOT}/shared/code-comment-discipline.md`
**Orçamento de contexto (leitura sob demanda, um root por sessão, delegação):** `${FLUX_ROOT}/shared/context-budget.md`

## Banner de perfil — gabarito (copiar VERBATIM)

Todo output deste elo **abre** com o banner, copiado com as cercas, trocando só o que está entre
chaves (regras e degradações: `${FLUX_ROOT}/shared/preflight.md`, Passo 5). O gabarito mora no corpo
do elo de propósito: num shared, ele não chega ao contexto na hora de emitir.

````
```
perfil: {nome do manifesto | generico}{ (ancora: alvo <path>)} · nivel: {FULL|REDUCED|THIN} · holistico: {agente}
lentes: L1 {agente} · L2 {lista|ausente|inalcancavel} · L3 {lista|ausente|inalcancavel}
degradacoes: {soft ausentes e o que se perde com cada um | nenhuma}
carimbo: {harness} | flux:iterate@{flux_version}
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

**`jq` é requisito `soft` deste elo** (`git` e `gh` são `hard`): só o gate mecânico do watch
(`${FLUX_ROOT}/scripts/iterate-watch-gate.sh`) depende dele. Sem `jq` o elo roda inteiro, inclusive
`--once` e `--dry`, e o watch fica no modo agendado ("`WATCH_WAKE`"), com a perda na linha
`degradacoes` do banner. O `flux preflight iterate` já devolve essa degradação; na resolução agentica,
conferir `command -v jq` junto com os outros dois.

## Step 0-context: resolver perfil de contexto

Seguir o protocolo descrito em `${FLUX_ROOT}/shared/flux-context.md`. Em resumo:

1. Resolver a **âncora** (alvo primeiro, `cwd` depois — ver `${FLUX_ROOT}/shared/flux-context.md`,
   seção "Qual é a âncora") e procurar `flux-context.json` subindo a árvore a partir dela, na ordem
   da seção "O manifesto" de `${FLUX_ROOT}/shared/flux-context.md` (em cada nível, `.claude/` antes de
   `.cursor/`; o nível mais fundo vence, qualquer que seja o diretório que o abriga).

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
   - `SLACK_DIR` = `slack_directory` (diretório de alias do Slack, `${FLUX_ROOT}/shared/slack-directory.md`; só para o aviso no canal do passo 9a, opcional)

3. Se não encontrar (perfil genérico):
   - `HOLISTIC` = genérico da família pela cascata do preflight (Passo 3), nunca um nome fixo
   - `VAULT_ROOT` = não persiste por default; imprime no chat
   - `VAULT_CTX` = `generic`
   - `VAULT_CTX_ROOT` = nenhum (sem vault não há rodada anterior para procurar)
   - `NO_EMDASH` = `false`
   - `SPECIALISTS_ROOT` = o default de `specialists_root` da seção "Perfil genérico (sem manifesto)" de `${FLUX_ROOT}/shared/flux-context.md`
   - `ANSWERER` = o próprio `<HOLISTIC>` com instrução de rascunhar réplicas (sem agente dedicado)
   - `SLACK_DIR` = nenhum (sem diretório, nenhum aviso no canal)

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
| `/flux:iterate 962 --parent-board <path>` | Não escreve board: devolve o delta ao board que o orquestrador (o `flux:land`, na mesma sessão) já resolveu. Passado automaticamente pelo land. |

> **O watch é o default.** Depois da 1ª passada e do push, o comando fica vivo monitorando CI + novas rodadas do bot até a PR assentar (CI verde + nada novo) ou mergear. Use `--once` quando quiser só fechar a rodada atual e sair.

As flags `--auto`, `--once` (alias `--no-watch`), `--dry`, `--solo`, `--no-rebase` (alias `--skip-conflict-gate`) e `--parent-board <path>` podem aparecer em qualquer posição dos argumentos e combinadas entre si. As **rodadas subsequentes do watch rodam em `--auto`** (aplicam + postam + resolvem + commitam + pusham sozinhas). `--once` desliga o watch. `--solo` pula os specialists em todas as rodadas. `--no-rebase` persiste em todas as rodadas.

> **Resolver conflito já vem autorizado.** Invocar o iterate sem `--no-rebase` autoriza o push da resolução mecânica nas condições de `${FLUX_ROOT}/shared/merge-conflict-gate.md`, seção 5. O `--auto` continua dispensando só a confirmação do plano de threads (passo 6).

## Out of scope (NUNCA faça)

- Não aprovar nem mergear (`gh pr review --approve`, `gh pr merge`).
- Não usar `event: APPROVE` / `REQUEST_CHANGES` em nada.
- Não pushar para `main`. Não fazer `git checkout`/`git switch` de branch na árvore principal do repo: para entrar na branch da PR, resolver/criar a **worktree** dela (ver disciplina de worktree), nunca sequestrar o working tree principal do usuário.
- **Não `git push --force` sem lease, nunca.** Force-push só para publicar a resolução de conflito do passo 2b, nas condições de `${FLUX_ROOT}/shared/merge-conflict-gate.md`, seção 5. Não force-pushar branch de terceiro nem branch coautorada.
- **Não resolver conflito semântico sozinho.** Conflito sobre a mesma lógica (mesma função, mesma condição, mesmo teste, migração, contrato) exige aval humano mesmo em `--auto` e mesmo no watch: registrar bloqueio e cair no modo degradado. Na dúvida entre mecânico e semântico, é semântico.
- **Não declarar CI confiável, nem "assentou", em PR `CONFLICTING`.** Nem tratar `mergeable: UNKNOWN` como se fosse `MERGEABLE`.
- Não resolver thread humana que esteja em `needs-discussion` (ver guardrail no passo 7).
- Não retentar escrita em repo cross-org sem acesso — capturar o erro e reportar.
- **Não editar título nem descrição de PR de terceiro.** A reconciliação do passo 8a só vale para PR cuja `author.login` é a conta autenticada; em PR de outra pessoa, a correção vira sugestão em comentário. Nunca reescrever texto alheio.
- **Não commitar nem pushar em PR de terceiro** sem a concessão do passo 6 (guarda de autoria, passo 2).
- **Não mexer no prefixo de ticket do título** (`[ENG-1234]`, `[PROD-000]`). É chave de rastreabilidade para Linear e CI; trocar ou remover quebra automação em silêncio.
- **Não renomear título que só ficou genérico.** Renomeia-se apenas título que nomeia desenho refutado. A barra do título é mais alta que a da descrição, porque ele vira mensagem de squash commit e circula em notificação.
- **Não regerar a descrição da PR do zero.** Editar sempre sobre o body atual, cirurgicamente. Body regenerado apaga contexto humano (links de PRs irmãs, checklist marcada pelo revisor) de forma silenciosa e irreversível pela UI.
- **Não postar no Slack nem salvar rascunho aqui.** O aviso do passo 9a só delega ao `${FLUX_CMD}reply`: na passada interativa, depois de um GATE aceito; em `--auto` e nos ticks do watch, direto, pela variante `--auto`. O `reply` só rascunha, nunca posta.
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

Ela nasce cedo porque é também onde o usuário vai olhar o resultado, e porque verificar alegação na branch é mais direto com o checkout dela. `--dry` não cria worktree.

Se `DRY == true`, ir direto para o **Modo `--dry`** após a coleta de metadados + threads (passo 2).

### 2. Coletar metadados + TODAS as threads (abertas e resolvidas)

```bash
gh pr view $PR_NUMBER --repo $REPO_FULL \
  --json number,title,headRefName,baseRefName,url,state,isDraft,author,headRefOid,mergeable,mergeStateStatus
```

`mergeable` e `mergeStateStatus` **não são opcionais nesta coleta**: eles alimentam o gate de integração do passo 2b, que roda antes da triagem de CI.

**Guarda de autoria.** `IS_OWN_PR = (author.login == ME)`, com `ME` = `gh api user -q .login`. É mais
restrito que o do `${FLUX_CMD}review` (assignee não conta) porque aqui guarda escrita no histórico. É
binário, sem exceção para coautoria ou bypass de proteção. Com `IS_OWN_PR == false`:

- **Nunca**, nem com concessão: force-push (resolução de conflito do 2b), edição de título ou descrição
  e carimbo de atribuição (8a, que vira sugestão em comentário).
- **Modo `no-push` por default**: só interação (responder, reagir, resolver). Correção de thread ou de
  CI pode ser aplicada e validada na worktree, mas não é commitada nem pushada.
- **A concessão do passo 6** (`writeGrantedForThirdParty`) libera só commit e push (o auto-fix do 2c, o
  executor do 4 e o passo 8). Nunca é inferida e nunca vem do `--auto`.

Um caminho que chegue a escrever sem a guarda é bug: abortar, registrar o bloqueio no board e reportar,
nunca escrever "por garantia".

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
          resolvedBy { login }
          path
          line
          comments(first: 100) {
            pageInfo { hasNextPage endCursor }
            nodes { databaseId url author { login } createdAt body }
          }
        }
      }
    }
  }
}'
```

Particionar o resultado em três conjuntos, comparando `login` sem diferenciar maiúsculas de
minúsculas com `ME`:

- **Threads abertas** (`isResolved == false`) — as que serão endereçadas neste run. Guardar: `id` (NODE id `PRRT_...`, usado para resolver), `path`, `line`, `isOutdated`, e do primeiro comentário `databaseId` (reply/react), `url` (permalink), `author.login`, `body`.
- **Verificação pendente** (`isResolved == true` e `resolvedBy.login != ME`, incluindo resolver ausente/desconhecido) — tratar como trabalho deste run, não como resolvida só por estar fechada no GitHub. Guardar o `resolvedBy.login`, o primeiro comentário, toda a conversa disponível (`comments.nodes`) e `path:line`; se `pageInfo.hasNextPage` for `true`, paginar a conversa até obter o comentário mais recente antes do fan-out. Ler o body completo de qualquer comentário truncado pela REST. `resolvedBy` identifica quem fechou a thread, não prova que o finding foi corrigido.
- **Corpus de referência** (`isResolved == true` e `resolvedBy.login == ME`) — guardar `url`, `path:line`, `author.login` e um resumo do ponto + veredito. Estas threads continuam servindo apenas ao cross-reference do passo 3a; não entram na fila de verificação.

**Régua da verificação pendente:** a lente classifica cada comentário como (a) correção já presente e ainda válida, (b) finding que persiste ou regrediu, ou (c) sem finding, alegação que não procede ou que ficou obsoleta. No caso (a), manter a thread fechada e registrar a verificação; não reaplicar a correção. No caso (b), incluir o finding no plano normal de correção com evidência `arquivo:linha`. No caso (c), manter a thread fechada e registrar que não há finding ou por que a alegação não procede/não se aplica mais. Resolver por terceiro ou desconhecido nunca é evidência suficiente, por si só, de que o ponto foi conferido.

Para cada thread com `pageInfo.hasNextPage == true`, guardar o `endCursor` e consultar o node da própria thread com esse cursor:

```graphql
query($thread: ID!, $after: String) {
  node(id: $thread) {
    ... on PullRequestReviewThread {
      comments(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { databaseId url author { login } createdAt body }
      }
    }
  }
}
```

Repetir com `after` igual ao `endCursor` retornado até `hasNextPage == false`, acumulando `nodes` por `databaseId`. Não classificar com base apenas no comentário inicial se há respostas que explicam a resolução.

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

**Um issue comment humano NUNCA é ignorado por não ser thread.** Se houver issue comment de terceiro ainda sem réplica sua posterior a ele, a PR **é acionável** mesmo com `reviewThreads` 100% resolvidas.

**Contagem reportada:** ao informar progresso (chat, board, retorno para um orquestrador), conte os dois universos e diga qual é qual, no formato `threads <res>/<tot> · issue comments <respondidos>/<acionáveis>`. Nunca reporte só o número de `reviewThreads` como se fosse o total de pendências da PR.

**Pular threads triviais abertas:** body só com aprovação (`LGTM`, `👍`, `:+1:`, `✅`) ou comentário do próprio autor sem réplica de terceiros. Não aplicar esse filtro a threads resolvidas por terceiros/unknown: todas entram na verificação, mesmo que sejam curtas ou pareçam aprovação; a lente pode registrar que não havia finding.

**Coletar também o estado do CI** (sempre, mesmo sem threads):

```bash
gh pr checks $PR_NUMBER --repo $REPO_FULL   # ou --json name,state,bucket,link
```

Classificar o agregado do CI pelo `bucket`, pela regra do passo 2 de "Um tick" (fonte única): qualquer `fail` ou `cancel` → **vermelho**; senão, qualquer `pending` → **rodando**; senão → **verde**.

**Critério de término da 1ª passada (redefinido):** o run só encerra cedo (avisar no chat, não commitar) quando **não há thread aberta acionável, não há verificação pendente de thread resolvida por terceiro/unknown, não há issue comment acionável sem réplica, o CI não está vermelho** (verde ou ainda rodando) **E a PR integra com a base** (`mergeable == MERGEABLE`). Estas condições mantêm a PR acionável mesmo sem thread aberta:

- **Verificação pendente ou issue comment acionável** → seguir para a verificação do passo 3 e incluir os findings persistentes no plano normal.
- **`mergeable == CONFLICTING`** → seguir para o **gate de integração** (passo 2b). É o caso que mais engana, porque a PR parece limpa: zero threads e CI verde.
- **CI vermelho** → seguir para a **triagem de CI** (passo 2c).

Registrar no chat o motivo do prosseguimento (ex.: `sem threads abertas e CI verde, mas PR conflitante com a base — acionando o gate de integração`).

### 2a. Board no vault (nota viva)

Havendo trabalho acionável (threads abertas, **verificação pendente de thread resolvida por terceiro/unknown**, **PR conflitante com a base** ou CI vermelho), **resolva o board** (abaixo) antes de seguir para a verificação, e **anuncie o caminho no chat** (o board existe desde o começo, não só no fim; a partir daqui, cada passo relevante e cada tick do watch atualiza o board).

**Resolver o board** conforme `${FLUX_ROOT}/shared/board-template.md`, "Resolver o board": o desta sessão; senão o do caso (`case_keys`: `pr:<owner>/<repo>#<n>`, que acha também o board do build que abriu a PR e o do review dela); senão um novo, **perfil single-PR** (`type: flux-iterate`, `generator: "flux-iterate"`). Formato, frontmatter (com a linha desta sessão em `provenance.runs`), painel e carimbo de data vivem lá. Esta rodada entra na seção `## 🔁 iterate · PR #N`, um H3 por rodada.

- **Caminho do board novo:** `<VAULT_ROOT>/0-inbox/YYYY-MM-DD-HHMM-flux-iterate-pr<N>-<repo-slug>.md`. Sem `VAULT_ROOT`, só no chat.
- **`--parent-board <path>`:** o orquestrador (o `flux:land`) roda na mesma sessão e já resolveu o board dela; `PARENT_BOARD` **é** esse board. Não criar nem escrever board: o escritor único é o do orquestrador. Devolver no retorno o delta desta PR, dentro do limite de retorno do land (até 5 linhas de Timeline e um resumo da rodada em até 10 linhas, com links), e quem grava é ele. Sem a flag, vale a resolução acima.
- **Sem fabricação:** todo número do painel vem de fonte real — rodadas = `round` do estado; threads res/tot do GraphQL do passo 2; 👍/👎 filtrados pela conta do `gh`; CI do `gh pr checks`. Onde não houver fonte, `n/d`.
- O board é resolvido **tanto no watch quanto no `--once`**, salvo com `--parent-board`, em que o iterate não escreve board. Registrar o path no estado (passo do watch, campo `board`).
- **Quem escreve depende do watch** (`${FLUX_ROOT}/shared/fanout-discipline.md`, seção do board-keeper): com o watch ligado, retomar o keeper do board se a sessão já tiver um, ou criar o **board-keeper** (subagente nomeado, escritor único) e mandar o delta de cada tick por `SendMessage`; assim o template e o `CLAUDE.md` do vault não entram no contexto principal. Com `--once` avulso, não criar keeper: a main grava direto. Com `--parent-board`, quem grava é o orquestrador.
- **Em `--dry`:** resolver o board normalmente e marcar `[dry-run]` no TL;DR.
- Para cada thread resolvida por terceiro/unknown verificada, registrar na seção do iterate o `resolvedBy`, o resultado (`correção presente e válida`, `finding persistente/regredido` ou `sem finding/alegação improcedente/obsoleta`), o SHA do head verificado e a evidência `arquivo:linha` quando houver. Indexar a verificação na Timeline como tipo `review`; não criar tabela paralela nem alterar a contagem real de threads do painel.

### 2b. Gate de integração com a base — PRIMEIRO gate (1ª passada E cada tick do watch)

> **Protocolo canônico:** `${FLUX_ROOT}/shared/merge-conflict-gate.md`. Não duplicar a lógica aqui: o
> shared define detecção, classificação mecânico/semântico, escolha entre rebase e merge da base,
> resolução em subagente e o `--force-with-lease` autorizado pelo pedido. Este passo declara só o encaixe no
> iterate.

Vem antes da triagem de CI porque, numa PR `DIRTY`, o GitHub não computa o merge commit: o CI dela é
sinal falso.

Com `mergeable` / `mergeStateStatus` coletados no passo 2:

- **`MERGEABLE`** → nada a fazer; seguir para o passo 2c.
- **`UNKNOWN`** → reconsultar (até 3 vezes, ~3s). Persistindo, medir localmente com `git merge-tree` e
  reportar que o GitHub não decidiu. **Nunca** seguir tratando como `MERGEABLE`.
- **`CONFLICTING`** → acionar o gate:
  1. **Reconhecer sem tocar no working tree**: `rev-list --left-right --count` (extensão da divergência)
     e `merge-tree --write-tree --name-only` (arquivos em conflito).
  2. **Classificar** mecânico vs semântico pela régua do shared. `--no-rebase`, PR de terceiro
     (`author.login != ` conta autenticada) ou classificação semântica ⇒ **não resolver**: ir ao modo
     degradado (abaixo). As demais causas de degradado (rebase abortado, gate vermelho, lease
     recusado, worktree retida) estão na seção 6 do shared.
  3. **Resolver via subagente executor** (o mesmo do passo 4, mesma disciplina de worktree e de
     fan-out), que aplica a estratégia, roda o quality gate do repo e **para sem pushar**. O prompt
     leva o `retainedResolutionSha` do estado, para a conferência do descarte condicionado (seção 4,
     item 2, e seção 5 do shared).
  4. **Publicar conforme a seção 5 do shared**, só se nenhum gate do item 3 voltou vermelho (`n/a`
     não segura). Gate vermelho ⇒ não pushar: é bloqueio e o elo vai ao modo degradado. Depois do
     push, registrar o relato conforme a seção 5.
- **`BEHIND`** (sem conflito) → só atualizar se a proteção da base exigir branch atualizada. Não é
  conflito e não justifica force-push.

**Modo degradado (o gate não resolveu; causas na seção 6 do shared, inclusive gate vermelho):** não abortar o comando. Suspender o que depende de base
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
  gh pr checks $PR_NUMBER --repo $REPO_FULL --json name,state,bucket,link   # achar o check que falhou
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
  - **Atribuível ao próprio push e dentro do escopo** (typecheck, lint ou teste que este fluxo mexeu quebrou, build da branch): o **executor** do passo 4 investiga o log, tenta **uma** correção, roda o quality gate (passo 5) e, se o gate passar e a guarda de autoria permitir, commita e pusha. Em `no-push`, a correção pronta vira bloqueio no board e o chat pede a confirmação textual do passo 6 ("Pedido explícito de escrita"), mesmo quando não há thread no plano; nunca commitar "porque era só o CI". **No máximo uma tentativa por SHA.**
  - **Não atribuível** (falha de infra, flaky, teste não relacionado, mudança de base): **não** mexer no código. Registrar no board + reportar no chat com link do log, e (no watch) seguir monitorando.

Emitir os eventos de CI no board/Slack conforme o hook do watch (`ci-vermelho`, `ci-corrigido-tentativa`, `ci-verde`).

### 3. Verificar e decidir cada thread (planejar) · fase 1

**A verificação roda em fan-out, não na main** (`${FLUX_ROOT}/shared/fanout-discipline.md`).
O contexto principal já tem as threads (metadados baratos do passo 2); quem **abre o repo e lê o
código** é subagente. Despachar, num único bloco de Task calls:

- **Lente holística:** Task `subagent_type: <HOLISTIC>` com o lote INTEIRO de threads abertas,
  verificações pendentes de threads resolvidas por terceiros/unknown + diff + metadados, instruída a
  verificar cada alegação contra o código real. Para as abertas, devolver o formato atual por
  `databaseId`: `{veredito procede|improcedente, fundamento com arquivo:linha, correção proposta}`.
  Para cada thread resolvida por terceiro/unknown, devolver também `{estado: correcao_presente_valida|finding_persiste_ou_regrediu|sem_finding_ou_alegacao_improcedente_ou_obsoleta, fundamento com arquivo:linha|null, correcao_necessaria|null}`. `correcao_presente_valida` exige apontar a implementação atual que
  corrige o finding; não basta a thread estar fechada ou o comentário dizer que foi corrigido.
- **Lentes de specialist:** conforme o contrato de `${FLUX_ROOT}/shared/review-agents.md`
  (descoberta via `SPECIALISTS_ROOT`, fan-out paralelo), recebendo o mesmo lote e distinguindo threads
  abertas de resolvidas por terceiros/unknown. Com `--solo`, pular.

Fan-out **por lente, não por thread**: as threads de uma PR compartilham o mesmo diff, então N
agentes lendo o mesmo repo para uma thread cada é desperdício. Uma lente processa o lote todo.

O contexto principal faz o **fan-in**: reconcilia os retornos, decide, e monta o plano. Não relê
os arquivos citados para "conferir" — se uma evidência ficou dúbia, despacha outro subagente.

Retorno esperado de cada lente: **< 40 linhas**, sem diff nem conteúdo de arquivo colado.

Critérios que valem para toda thread, dentro ou fora do subagente:

- **Verificar a alegação contra o código/testes/docs reais.** Bots reviewers produzem falsos positivos com frequência (ex.: apontar perda de precisão num `bigint mode:'number'`, ou "mensagem some" num cenário que já tem teste). Leia o arquivo citado, os testes adjacentes e a doc do endpoint antes de concluir. Reviewers humanos erram menos, mas o mesmo rigor se aplica.
- **Enriquecimento via specialists (por default, salvo `--solo`):** seguir o contrato de `${FLUX_ROOT}/shared/review-agents.md`. Descobrir specialists via `SPECIALISTS_ROOT`, rodá-los em paralelo via Task tool (passo 2 do contrato), e reconciliar as evidências ao verificar cada alegação. Se um specialist cobrir o mesmo ponto da thread (mesmo arquivo/linha/tema), usar os findings como evidência adicional a favor ou contra. Citar a fonte no fundamento: `(corroborado por route-auditor)` ou `(refutado por repository-layer-auditor)`. Fallback gracioso quando não houver specialists: seguir só com `<HOLISTIC>`.
- Com `--solo`: pular os specialists e verificar usando só `<HOLISTIC>`.
- Para threads abertas, classificar como hoje: **procede** (aplicar correção) ou
  **improcedente/marginal** (recusar com fundamento).
- Para as já resolvidas por terceiros/unknown, reconciliar os três estados descritos no passo 2:
  correção presente e ainda válida; finding persistente/regredido; ou alegação improcedente/obsoleta.
  Se a correção já está presente, não gerar tarefa de executor nem reaplicá-la. Finding persistente
  ou regredido entra no mesmo plano e executor das threads abertas, com `arquivo:linha` atual.
  Se não houver finding, ou a alegação for improcedente/obsoleta, registrar a conclusão sem criar
  correção nem interação desnecessária.
- Sempre **citar `arquivo:linha`** na justificativa.

#### 3a. Cross-reference com threads já tratadas (camada de decisão)

Antes de redigir a réplica, comparar o ponto de cada thread aberta ou verificação pendente contra
(a) o corpus de threads resolvidas pelo próprio `ME` no passo 2 e (b) as threads já processadas mais
cedo NESTE run. Uma thread resolvida por terceiro/unknown só passa a compor o corpus de referência
depois de verificada; sua resolução externa, sozinha, não decide nem duplica findings. Classificar a
sobreposição:

- **`none`** — ponto novo. Seguir normal.
- **`duplicate`** — mesmo ponto já tratado e decidido numa thread irmã, sem nada de novo. Aplica a MESMA decisão. A réplica DEVE citar e **linkar** a thread irmã (markdown `[link](url)`) e dizer explicitamente que é o mesmo ponto já endereçado. Não reabrir a análise nem reaplicar correção que já foi feita.
- **`related-but-distinct`** — toca o mesmo código/tema de uma thread irmã, mas traz um ângulo genuinamente diferente (ex.: mesma subquery, mas a irmã era sobre *correção* e esta é sobre *performance/índice*). A réplica DEVE linkar a irmã para contexto E deixar claro **o que há de diferente**, e dar a este ponto sua **própria decisão** (não herdar a da irmã).

**Regra de ouro:** nunca tratar como duplicado de forma silenciosa. Sempre articular, na réplica, se é duplicado puro ou se, apesar de já citado em outro ponto, há algo distinto que merece decisão própria. Na dúvida entre `duplicate` e `related-but-distinct`, escolher `related-but-distinct` e explicar a diferença.

Como linkar a irmã: usar o `url` (permalink do comentário) coletado no passo 2. Ex.: `já endereçado em [PERF / MIN(id)](https://github.com/{owner}/{repo}/pull/{n}#discussion_r{databaseId})`.

#### 3b. Reação alinhada ao teor da resposta (vale para bot E humanos)

- 👍 (`content=+1`) quando a sugestão é acolhida/procedente (e será aplicada), OU quando é um `related-but-distinct` válido.
- 👎 (`content=-1`) quando improcedente, marginal, ou `duplicate` de algo já recusado.
- Para `duplicate` de algo já **aceito e aplicado**: 👍 (o ponto é válido), com réplica curta apontando a irmã.

Monte o **plano** (o "dry-run" da confirmação): por thread aberta ou resolvida por terceiro/unknown,
registre `{thread_id, databaseId, estado no GitHub, resolvedBy, path:line, autor, veredito,
sobreposição (none|duplicate|related-but-distinct + link da irmã), ação (corrigir|manter resolvida|
registrar como improcedente/obsoleta), reação 👍/👎 quando houver interação, rascunho da réplica quando
houver interação}`. Threads resolvidas cuja correção já está presente ou cuja alegação não procede/
ficou obsoleta ficam fechadas, sem réplica ou reação desnecessária; a verificação fica registrada no
board e no relatório. Ao final, liste `{arquivos alterados, resumo do diff, mensagem de commit proposta}`.

### 4. Aplicar as correções pertinentes · fase 2 — via subagente executor

> **Modo degradado** (passo 2b não resolveu o conflito): pular este passo e os passos 8 e 8a; ir
> direto ao 7.

**A execução também é fan-out.** O contexto principal **não edita arquivo do repo**: despacha **um
subagente executor** (`subagent_type: general-purpose`) que resolve a worktree, aplica as correções
e roda o quality gate (passo 5) lá dentro. É o mesmo motivo do passo 3 — abrir o repo na main custa
o pacote inteiro daquele root, permanentemente.

Prompt do executor (auto-contido, ele não herda a conversa):

- **O path da worktree já resolvida no passo 1** (com os envs já provisionados), e a instrução de
  operar exclusivamente lá dentro: nunca `git checkout` na árvore principal, nunca criar outra
  worktree. Passar o path pronto, e não a instrução de resolvê-lo, evita que dois despachos do mesmo
  run cheguem a caminhos diferentes.
- A lista de correções decididas no passo 3, uma por finding que **procede**, com `arquivo:linha` e
  o que mudar. Inclua findings persistentes/regredidos de threads já resolvidas por terceiros/unknown.
  Não reaplique correção já presente e válida. Threads que NÃO procedem não geram mudança de código.
- **A regra de comentários, verbatim** (`${FLUX_ROOT}/shared/code-comment-discipline.md`, seção "Como
  propagar aos subagentes"): o executor não herda a conversa nem os `CLAUDE.md`, e o material que ele
  recebe (a discussão da review) é justamente o que pede para virar comentário.
- O quality gate do passo 5, para rodar antes de devolver.
- Com `--auto` e a guarda de autoria permitindo, o executor também **commita e pusha** (passo 8) no
  mesmo despacho e devolve o SHA. Sem `--auto`, ou em `no-push`, para depois do quality gate.

Contrato de retorno (**< 40 linhas**, sem diff colado):

```
- worktree: <path>
- arquivos: <lista de arquivos alterados>
- porThread: <databaseId> → <o que foi aplicado, em uma linha>
- gate: typecheck <ok|fail|n/a: motivo> · lint <ok|fail|n/a: motivo> · testes <ok|fail|n/a: motivo>
- falhas: <mensagens de erro resumidas, ou nenhuma>
- commit: <sha, ou n/a>
- bloqueios: <lista curta, ou nenhum>
```

Se o gate falhar, o executor devolve a falha resumida — a main decide (redespachar com a correção,
ou reportar como bloqueio). **A main não abre os arquivos para conferir o que o executor fez.**

### 5. Quality gate (antes de oferecer o push)

Rodado **dentro do executor do passo 4**, na worktree, nos arquivos tocados: os checks que o repo
declara (`CLAUDE.md`, `Makefile`, `package.json` ou o equivalente da stack), na ordem typecheck, lint e
testes afetados. Seguir o fluxo de agentes do `CLAUDE.md` do repo quando houver. Teste que depende de
serviço indisponível localmente (Docker parado, por exemplo) **não bloqueia**: entra no plano como "não
validado localmente", com o motivo, e o usuário é avisado. Check que o repo não declara, ou que não dá
para rodar, volta `n/a` com o motivo e nunca `ok` (a régua de `${FLUX_ROOT}/shared/merge-conflict-gate.md`
para gate não executável); repo sem nenhum check declarado é dito no plano e no relatório, para o push
não parecer validado.

### 6. Confirmação interativa (pular se `--auto`, exceto em PR de terceiro sem escrita concedida)

Mostre no chat o plano resumido (vereditos + ações de threads abertas e resolvidas por terceiros/unknown + reações + arquivos alterados + mensagem de commit), e abra um GATE (`${FLUX_ROOT}/shared/hitl.md`) (single-select) quando o plano tiver interação no GitHub, commit/push ou outra escrita. Itens resolvidos cuja correção já está presente, ou cuja alegação não procede/ficou obsoleta, não geram escrita e não entram na contagem de respostas; se forem o único trabalho, registre a verificação no board e no relatório sem abrir um gate vazio. **As opções dependem de `IS_OWN_PR`:**

**`IS_OWN_PR == true`** (comportamento atual, sem mudança):

- **Header:** `Atualizar PR?`
- **Question:** `Apliquei as correções e preparei as respostas dos {N} itens acionáveis da PR #{number}. O que fazer agora?`
- **Options (nesta ordem):**
  1. `Postar tudo e atualizar a PR (Recomendado)` — descrição: `Posta as réplicas + reações 👍/👎, resolve as threads, e então commita + pusha as correções.`
  2. `Postar respostas e resolver, sem push` — descrição: `Interage no GitHub (réplicas, reações, resolve threads) mas deixa o commit/push pra você revisar o diff antes.`
  3. `Só deixar as correções locais` — descrição: `Não toca no GitHub. Threads ficam abertas, nada é commitado. Você revisa tudo localmente.`
  4. `Cancelar` — descrição: `Não posta nada. Os arquivos alterados ficam no working tree pra você inspecionar ou reverter.`

> A opção recomendada é a primeira, com `(Recomendado)` no label. Com `--auto`, assuma a opção 1 sem perguntar.
> O renderer dos dois menus deste passo e do GATE do 9a segue (`${FLUX_ROOT}/shared/hitl.md`, "Auto-resolução por tempo").
> A opção 1 assumida pelo `--auto` vem de flag explícita (renúncia do usuário ou procuração do
> `flux:land`) ou do gate da 1ª passada do watch, nunca de auto-resolução do harness.

**`IS_OWN_PR == false`** (modo `no-push` por default — RN-01): sem escrita já concedida nesta rodada
(ver "Pedido explícito de escrita" abaixo), o GATE **não oferece nem executa commit/push como caminho
default**. Ele se comporta como se só a opção de interação existisse:

- **Header:** `Atualizar PR de terceiro?`
- **Question:** `Apliquei as correções e preparei as respostas dos {N} itens acionáveis da PR #{number}, que não é sua. O que fazer agora?`
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

Escolhida a opção 2, o comando ainda não escreve: pede uma **confirmação textual** (não outro
single-select), como `sim, escrever na PR de terceiro`. Vale qualquer texto que expresse consentimento
claro para escrever *nesta* PR; resposta vaga, condicional ou fora do assunto cancela o pedido e volta
ao `no-push`. Confirmado, o fluxo segue como a opção 1 de PR própria (post, commit e push; passos 7 e 8), e `writeGrantedForThirdParty: true`
vai ao estado: a concessão vale para as rodadas seguintes do **mesmo** watch e nunca atravessa uma
invocação nova. Nunca inferir o pedido de contexto (um "pode commitar" numa thread não conta).

**Interação com o gate do passo 2b:**
- Se o gate resolveu um conflito neste run, o push dele já foi decidido no passo 2b conforme a seção 5 do shared; esta pergunta não o reabre nem o embute na opção 1: mostra o relato como contexto e trata só das threads.
- Se o gate ficou em **modo degradado**, o plano mostrado aqui não tem "arquivos alterados" nem mensagem de commit (o passo 4 foi pulado). Ajustar a pergunta para o que resta: postar as réplicas + reações e resolver as threads. Em `IS_OWN_PR == true`, a opção 1 vira equivalente à 2, dito na descrição junto do motivo (`PR conflitante com a base, correções suspensas`). Em `IS_OWN_PR == false`, o modo degradado é compatível com o `no-push` já default: nada muda na pergunta.

### 7. Postar réplicas + reações + resolver (opções 1 e 2) · fase 3

Para cada thread que o plano marcou para interação, na ordem: **reabrir se necessário → reply → reação → resolve**. Threads resolvidas por terceiros/unknown que foram verificadas como corretas ou obsoletas não são reabertas nem recebem resposta/reação: permanecem fechadas, com a verificação registrada.

```bash
gh api graphql -f query='mutation($id:ID!){ unresolveReviewThread(input:{threadId:$id}){ thread { isResolved } } }' -f id="<PRRT_...>"

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

> **Modo degradado** (passo 2b): não commitar, não pushar, não rodar o 8a.

> **Guarda de autoria** (passo 2): em `no-push`, este passo não roda.

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

Título e descrição são o que o revisor lê primeiro e o que fica no histórico; quando a rodada muda o
desenho, eles passam a afirmar o que as threads já refutaram, e isso é entrega pela metade.

Roda **depois do push**, em toda rodada que mudou algo que título ou descrição afirmam, nunca em
`--dry`, e sempre os dois na mesma passada.

#### Guardrails (bloqueantes)

1. **Só PR própria, sem exceção**: em PR de terceiro, **nunca** editar, nem com a concessão do passo 6;
   a correção vira comentário de sugestão, registrado no board.
2. **Só afirmação refutada por evidência**: contradita pelo estado atual da branch (`arquivo:linha`) ou
   por decisão fechada numa thread desta rodada (link). Melhorar redação, reorganizar ou atualizar
   estilo não é drift. A única exceção é o carimbo de atribuição, abaixo.
3. **Nunca reescrever o body inteiro**: `gh pr view --json body` primeiro e edição cirúrgica sobre ele,
   preservando o que é humano (contexto, links de PRs irmãs, checklist marcada).

#### O título tem regra própria (mais restritiva que a descrição)

O título circula mais que o corpo (notificação, busca, mensagem do squash commit), e renomear no meio da
review confunde quem procura pelo nome antigo. Então:

- **Renomear só quando o título nomeia o desenho refutado.** Título só genérico, ou que hoje sairia
  melhor, fica.
- **Preservar a convenção do repo** (inferida de `gh pr list --limit 20 --json number,title`): prefixo
  de ticket, tipo e escopo de Conventional Commit, e até a ausência de acento, quando o repo escreve
  título sem acento.
- **Nunca mexer no prefixo de ticket.**
- **Registrar o título antigo** na linha da rodada no bloco gerenciado.

```bash
gh pr edit $PR_NUMBER --repo $REPO_FULL --title '<titulo novo>'
```

#### Duas zonas, tratadas de forma diferente

- **Zona autoral** (a prosa): edição cirúrgica só nas afirmações refutadas, preservando voz, seções,
  tabelas e o trailer `🤖 Generated with`. Decisão invertida não some em silêncio: o texto passa ao
  desenho vigente e a virada vai ao bloco gerenciado.
- **Bloco gerenciado** (no fim, antes do trailer): tabela do flow entre marcadores, reescrita por
  inteiro a cada rodada.

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

Usar `--body-file`, nunca `--body` inline. Título e corpo saem no mesmo `gh pr edit` (ou em chamadas
seguidas, sem gate entre elas). Valem as Convenções de texto, inclusive `NO_EMDASH`.

Após publicar, gravar `bodySyncedAtSha` no estado (o SHA para o qual a descrição está reconciliada), e
`titleSyncedAtSha` junto, e
registrar no board: linha na Timeline com tipo `pr-body` e, na seção do iterate, um parágrafo dizendo **qual afirmação** foi corrigida e **com que evidência** (não basta "descrição
atualizada"). Emitir o evento Slack `descricao-reconciliada` se o feed estiver configurado.

#### Carimbo de atribuição

Toda passada que **pushou commit** nesta PR (passo 8 rodou) aplica o carimbo `flux:iterate@<FLUX_VERSION>`
e concilia a entrada legada `Gerado por: <par-do-motor>` na linha `🤖 Generated with ...`, seguindo
`${FLUX_ROOT}/shared/pr-attribution.md` (formato, algoritmo idempotente, nome do harness quando a linha
não existe, guardrails). Este passo não redefine nada disso: só diz **quando** o carimbo entra.

- Roda **mesmo sem drift**: o carimbo não é afirmação da descrição, então a regra "nenhuma afirmação
  refutada, não editar nada" do Gate abaixo não o bloqueia. Também não entra no changelog gerenciado.
- Passada que não pushou (só respondeu threads, `--dry`, modo degradado do gate de integração) **não**
  carimba: o iterate não mudou o código da PR, então não tem o que atribuir.
- Nas rodadas de watch, o par já presente torna a edição um no-op (diff vazio, sem `gh pr edit`). É o que
  garante que várias rodadas na mesma versão não repitam o par.
- Quando a reconciliação da descrição também roda nesta passada, aplicar o carimbo no mesmo
  `-after.md` e publicar os dois num único `gh pr edit`.
- PR de terceiro nunca recebe carimbo, nem com a concessão do passo 6 (guarda de autoria, passo 2).

#### Gate

- **1ª passada (interativa):** o diff da descrição entra no plano do passo 6, resumido como "N afirmações
  da descrição contraditas pelo estado atual" mais o antes/depois do título, quando houver. A opção 1 da
  confirmação passa a cobrir a reconciliação dos dois. O carimbo de atribuição **não entra no plano**:
  é consequência mecânica do push aprovado, e a opção que autoriza o push já o autoriza.
- **Rodadas de watch (`--auto`):** aplica sozinha, com os três guardrails valendo igual, e registra no
  board. Watch não relaxa o rigor, aqui como em qualquer outro passo.
- Se **nenhuma** afirmação estiver refutada, não editar nada e não tocar no bloco gerenciado só para
  rolar data (o carimbo de atribuição, acima, é a única edição que independe de drift). Descrição sem drift é descrição correta, e título ainda preciso é título que fica como está
  (é comum a descrição precisar de conserto e o título não: são barras diferentes). **Mesmo sem editar,
  gravar `bodySyncedAtSha` e `titleSyncedAtSha` com o SHA corrente**: os campos registram que os dois
  foram verificados neste SHA, e é isso que impede o watch de reabrir o `drift` (ver "Decisão do tick").

### 9. Resposta no chat

Tabela curta: por thread aberta ou finding persistente de thread reaberta `{path:line | veredito | sobreposição | 👍/👎}`, depois `{commit hash, range de push}`. Acrescentar um resumo das threads fechadas por terceiros/unknown verificadas, com `resolvedBy`, resultado, `headSha` conferido e evidência `arquivo:linha` quando houver; confirmar que as verificadas como corrigidas continuam fechadas e não receberam correção duplicada.

**Dizer onde ficou a worktree e em que estado ela está** (path, e quantos envs foram provisionados do cofre, ou por que não foram). Quando o cofre não tinha entrada para o repo, ou o manifesto não declara `env_vault`, dizer isso explicitamente em vez de deixar a worktree parecer pronta para subir. Sinalize threads humanas deixadas abertas (`needs-discussion`) e quais foram marcadas como `duplicate`/`related-but-distinct` (com link da irmã). Não repita os bodies completos das réplicas.

**Sempre reportar o estado de integração com a base**, mesmo quando ele estava limpo (é a informação que decide se a PR pode mergear). Quando este run foi despachado por um orquestrador (`--parent-board` presente, ou seja, rodando dentro do subagente de um `/flux:land`), o retorno inclui os campos estruturados `mergeable` e `conflito` do contrato da fase 4 do land, e não só a prosa: quem consome é máquina, e inferir conflito de texto livre é frágil no dado que decide o go/no-go. Inclui também os campos do relato definidos no contrato de retorno da fase 4 do `${FLUX_CMD}land`. Se o gate do passo 2b agiu, dizer os itens do relato da seção 5 do shared. Se o gate ficou em **modo degradado**, dizer explicitamente o que **não** foi feito: `conflito semântico em <arquivos> — respondi as threads, não apliquei correção nem pushei`. Nunca fechar o relatório dando a PR por pronta quando ela segue conflitante.

Quando o passo 8a mexeu em título ou descrição, dizer em uma linha **o que foi corrigido e por quê** (e, no caso do título, mostrar o antes/depois) (ex.: `descrição: a seção "A proposta" ainda anunciava o verbo-fachada, refutado na thread X`). Quando a PR é de terceiro e a reconciliação virou sugestão em comentário, sinalizar isso explicitamente.

### 9a. Aviso no canal de PR (GATE na passada interativa, automático em `--auto` e em todo tick do watch, nunca posta)

Depois do passo 7 (e do 8, quando houve push), só quando **todas** valem: PR própria; o turno
respondeu, reagiu ou resolveu thread de **pessoa** (bot e o próprio autor não contam); fora de `--dry` e
de run despachado por orquestrador (`--parent-board`); `SLACK_DIR` com canal que tenha o intent do grupo;
`FLUX_CMD` utilizável; e Slack na sessão (`mcp.slack` do manifesto ou servidor achado na sessão). Faltando qualquer uma, nada acontece, sem token de
degradação; as lacunas do `reply --auto` (`draft-pendente`, `sem-rascunho`) saem só no relatório do
tick. Não confundir com o Hook Slack (feed de status).

Agrupar por revisor (o `author.login` da thread tratada, pessoas apenas):
- **`iterate-enderecado`**: revisores cujas threads tratadas neste run ficaram **todas** respondidas, reagidas
  (👍 ou 👎) e resolvidas.
- **`iterate-aguardando`**: revisores com **ao menos uma** thread deixada aberta com réplica, esperando a
  resposta deles (`needs-discussion`, ou defesa mantida aberta). `abertos` é a contagem dessas threads
  (a soma dos revisores do grupo), e o revisor com threads dos dois tipos entra só neste grupo.

**No `--auto` e em todo tick do watch**, sem gate: o aviso vai pelo `${FLUX_CMD}reply --auto`, que
imprime o preview no relatório e salva o rascunho (privado, reversível, não notifica). Só se avisa
revisor com thread tratada **neste turno**; `slackNotified` (`<login>` → `{grupo, abertos, round}`)
impede avisar o mesmo revisor duas vezes no mesmo `round`. Rascunho não salvo (`draft-pendente`,
`sem-rascunho`) não grava `slackNotified`: o próximo tick tenta de novo, e o relatório diz o motivo uma vez.

Para cada grupo não vazio cujo intent exista num canal do diretório, na passada interativa, abrir **um GATE**
(`${FLUX_ROOT}/shared/hitl.md`, `GateSpec`; renderer conforme `${FLUX_ROOT}/shared/hitl.md`,
"Auto-resolução por tempo"), single-select, "Avisar {revisores} no canal de PR?":
- `Rascunhar aviso em <nome do canal>`, uma opção por canal na ordem do diretório (com um canal só, é a
  primeira e leva `(Recomendado)`; com mais de um, nenhuma é recomendada).
- `Agora não`.

Aceitar (ou, em `--auto` e nos ticks, direto, com `${FLUX_CMD}reply --auto`) roda `${FLUX_CMD}reply` com uma frase de `match` literal do intent, o nome do canal (primeiro alias; sem
`aliases`, o slug), a URL completa da PR (`https://github.com/<REPO_FULL>/pull/<PR_NUMBER>`), o nome de cada
revisor do grupo (o `alias` da entrada de `people` cujo campo `github` é o login; sem entrada, o nome de
exibição do GitHub, e o `reply` pergunta quando não resolver) e, no `iterate-aguardando`, `abertos=<N>`, tudo
numa string entre aspas. O `reply` acha o **seu** pedido de review no canal (`own_post_only`: pedido postado por
outra pessoa não vale, e o `reply` termina sem rascunho), rascunha a réplica na thread dele, mostra o preview e
só então salva o rascunho (na variante `--auto`, sem esperar a escolha). Com os dois grupos não vazios, um gate e um
rascunho por grupo, em sequência: o Slack aceita um rascunho anexado por canal, então o segundo espera o
usuário enviar ou apagar o primeiro (no tick, fica sem gravar `slackNotified` e é tentado no tick seguinte).

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

Quando `--dry` estiver presente, o comando opera em modo **estritamente read-only**: coleta e verifica as threads, mas **não aplica**, **não posta**, **não reabre**, **não resolve**, **não commita**, **não pusha** e **não edita título nem descrição** da PR.

### Fluxo em `--dry`

1. Executar os passos 0-context, 1 (resolver target), 2 (coletar metadados + threads), e 2a (resolver o board, com `[dry-run]` no TL;DR).
2. Coletar o diff completo da PR: `gh pr diff $PR_NUMBER --repo $REPO_FULL`.
3. **Pular apenas threads abertas triviais** conforme o passo 2. A regra de comentário do próprio autor sem réplica de terceiros continua valendo para threads abertas; toda thread já resolvida por terceiro/unknown entra na verificação pelo `resolvedBy`, sem filtro por tamanho ou conteúdo, mesmo que o primeiro comentário tenha sido escrito pelo autor da PR.
4. Verificar threads abertas e resolvidas por terceiros/unknown pelo fan-out do passo 3, honrando `--solo`. Depois, delegar ao `<ANSWERER>` via Task tool (subagent_type: `<ANSWERER>`) para redigir apenas as réplicas necessárias, passando:
   - Lista de threads abertas não-triviais e de verificações pendentes de threads resolvidas por terceiros/unknown (path:line, body, autor, `resolvedBy`, estado no GitHub, `diff_hunk` quando disponível, cadeia de réplicas existentes, e veredito reconciliado do passo 3)
   - Diff completo da PR
   - Metadados (repo, número da PR, branches, autor)
   - Caminho do checkout local quando disponível
   - Instrução: produzir rascunhos classificados em `accepts-suggestion / defends-decision / needs-discussion / needs-code-change` + os comandos `gh api` prontos para cada thread que exige interação. Para resolvidas cuja correção está presente e válida ou cuja alegação é improcedente/obsoleta, não redigir réplica nem comando; a thread fica fechada e o resultado da verificação é registrado no artefato.
   - Se `ANSWERER` não estiver definido no perfil (genérico): usar `<HOLISTIC>` com instrução explícita de rascunhar réplicas seguindo o mesmo formato.
5. **Gravar os rascunhos no board da sessão**, não em arquivo próprio: subseção `### Rascunhos dry-run v{N} · <data>` dentro de `## 🔁 iterate · PR #N`, com `{N}` = rodadas de `--dry` já registradas nessa seção + 1. Sem `VAULT_ROOT`: imprimir no chat.
6. **Nunca** escrever no GitHub.
7. Anunciar no chat:
   ```
   Rascunhos salvos no board {caminho-completo}, seção do iterate.

   {N} threads abertas: {X} accepts-suggestion, {Y} defends-decision, {Z} needs-discussion, {W} needs-code-change.
   {R} threads resolvidas por terceiros/unknown verificadas: {A} correção presente e válida, {B} finding persistente/regredido, {C} sem finding/alegação improcedente/obsoleta.
   ```
   Acrescentar o **estado de integração com a base** (`mergeable`), porque em `--dry` ele é reportado como qualquer outro diagnóstico. PR `CONFLICTING` significa que os rascunhos são aplicáveis, mas a PR precisa do gate do passo 2b num run que escreva.

> Em `--dry`, o watch (**não** faz sentido vigiar CI sem ter pushado nada) é ignorado automaticamente — equivale a `--once`.

---

## Modo WATCH (default; desligue com `--once`)

O usuário fechou a 1ª rodada e vai sair: o watch pega as próximas rodadas do bot, vigia o CI e mantém
a PR até assentar, **sem gastar turno de LLM em tick ocioso**.

Quem espera é o **gate mecânico** (`${FLUX_ROOT}/scripts/iterate-watch-gate.sh`): um processo em
background faz o poll da PR e só termina quando há algo a fazer ou quando o watch acabou. Onde o gate
não puder ser usado, vale o watch agendado de sempre (um tick de LLM reagendado por `ScheduleWakeup`).
A escolha entre os dois é o `WATCH_WAKE`, abaixo.

As **rodadas do watch rodam em `--auto`** (opção 1 da confirmação), respeitando a guarda de autoria:
em `no-push`, cada rodada só interage. `--solo` persiste. A verificação contra o código real continua
obrigatória em toda rodada.

### `WATCH_WAKE`: quem acorda a sessão

Resolver **uma vez**, na main, depois da 1ª passada, e gravar no estado (`watchWake`). Vale o rigor do
Passo 1b do `${FLUX_ROOT}/shared/preflight.md`: **resolver não é verificar**. É introspecção do que a
sessão de fato expõe, nunca leitura de documentação de harness.

| valor | quando | o que o watch faz |
|-------|--------|-------------------|
| `processo` | a sessão expõe execução de comando **em background** e o **fim do processo reabre a sessão** como evento de sistema (não como mensagem do usuário) | lança o gate e espera a saída ("O loop de watch") |
| `fila` | o fim do processo não reabre a sessão, mas ela é acordável por um comando de fila chamado pelo próprio invólucro do gate. **Só existe pelo adaptador do harness e é opt-in**: contrato, pré-condições e estado atual em `${FLUX_ROOT}/shared/codex-compat.md`, seção "Watch do iterate". **Hoje não é resolvível**: as pré-condições de lá não estão validadas, então este valor nunca é escolhido | lança o gate dentro do invólucro descrito lá |
| `agendado` | nenhum dos dois acima foi verificado, ou o gate falhou neste run | o watch atual: um tick por wake, reagendado por `ScheduleWakeup` ("Fallback agendado") |

- **Sem `jq` é `agendado`, direto.** O gate não roda sem ele (sairia com o código 2), então não se
  lança: o requisito é `soft` e a degradação já está no banner.
- **Na dúvida é `agendado`.** Capacidade que não pôde ser confirmada nesta sessão não foi verificada. O
  fallback é o comportamento de sempre, então errar para ele custa só turnos, e errar para `processo`
  onde o fim do processo não acorda ninguém custa o watch inteiro, em silêncio.
- **Cair em `agendado` é degradação e sai com aviso**, no chat e no board, dizendo o motivo (capacidade
  ausente, código de saída do gate, saída sem JSON). Nunca em silêncio.
- **`agendado` também tem caminho de ausência.** Ele depende de duas coisas: uma ferramenta de wake
  agendado na sessão e `FLUX_CMD` resolvido (o wake reinvoca `${FLUX_CMD}iterate`). Faltando qualquer
  uma, **o watch não se sustenta**: a passada termina como em `--once`, com aviso no chat e no board
  dizendo que o watch está indisponível, o motivo, e que o usuário reinvoque o verbo para a próxima
  rodada. Vale igual quando a queda para `agendado` acontece no meio do run.
- **O wake não é aprovação.** A regra é a de "Modo watch" do `${FLUX_ROOT}/shared/hitl.md`.

O que decide é a capacidade verificada na sessão, nunca o nome do harness (medição de referência:
LAB-170).

### Estado persistente (não esquecer entre wakes)

Mantenha um arquivo de estado por PR para sobreviver à espera do gate, aos `ScheduleWakeup` do fallback e às janelas de contexto (inclusive compactação). Caminho: `flux-watch-pr-<PR_NUMBER>.json` no diretório git **comum** do checkout, o que `git rev-parse --git-common-dir` devolve (o `.git/` do repo, também quando o comando roda de dentro de uma worktree; fica fora do versionamento). É o mesmo arquivo que o gate lê, e por isso o caminho é passado a ele em `--state`. Campos:

```json
{
  "pr": 962,
  "repo": "owner/repo",
  "headRefName": "feat/...",
  "round": 1,
  "solo": false,
  "noRebase": false,
  "resolvedThreadIds": ["PRRT_..."],
  "verifiedResolvedThreads": [{"threadId":"PRRT_...","headSha":"abc123","resolvedBy":"reviewer","lastCommentId":123456789}],
  "discussionThreadIds": [],
  "slackNotified": {},
  "answeredCommentIds": [123456789],
  "lastHeadSha": "abc123",
  "lastCiConclusion": "success|failure|pending|null",
  "lastMergeable": "MERGEABLE|CONFLICTING|UNKNOWN|null",
  "conflictAttemptedAtBaseSha": null,
  "retainedResolutionSha": null,
  "writeGrantedForThirdParty": false,
  "bodySyncedAtSha": "abc123",
  "titleSyncedAtSha": "abc123",
  "quietTicks": 0,
  "watchWake": "processo|fila|agendado",
  "gatePid": null,
  "gateSignalExits": 0,
  "gateLastPollAtSeen": null,
  "lastGateEvent": null,
  "board": "<VAULT_ROOT>/0-inbox/....md",
  "startedAt": "<UTC: YYYY-MM-DDTHH:MM:SSZ>",
  "lastTickAt": "<UTC: YYYY-MM-DDTHH:MM:SSZ>"
}
```

O que cada campo guarda, e a regra de gravação que o gate depende:

- **`resolvedThreadIds`**: toda thread que este elo já processou, resolvida ou não. É o que o gate usa
  para decidir novidade, então a deixada aberta de propósito entra aqui também.
- **`discussionThreadIds`**: o subconjunto deixado aberto de propósito (`needs-discussion`); o gate não o
  lê, o tick sim.
- **`answeredCommentIds`**: todo issue comment de terceiro já classificado, respondido ou ignorável
  (senão o gate o devolve como `nova-rodada` a cada relançamento). O nome não muda.
- **`verifiedResolvedThreads`**: um snapshot (`threadId`, `headSha`, `resolvedBy`, `lastCommentId`) por
  thread resolvida por terceiro já verificada, gravado só depois da classificação. A verificação só
  reabre quando um desses valores muda. Estado perdido: lista vazia e reverificar.
- **`lastCiConclusion`**: só `success`, `failure`, `pending` ou `null` (sem checks); outra grafia faz o
  `ci-vermelho` se repetir.
- **`lastMergeable`**: o último `mergeable` lido. **`conflictAttemptedAtBaseSha`**: SHA da base já
  avaliado (uma tentativa por SHA de base). **`retainedResolutionSha`**: resolução local retida sem
  push, âncora do descarte condicionado (shared, seção 5); `null` quando não há.
- **`writeGrantedForThirdParty`**: concessão do passo 6, válida só neste run; em PR própria fica `false`.
- **`bodySyncedAtSha` / `titleSyncedAtSha`**: SHA em que o 8a verificou, com ou sem edição.
- **`watchWake`**: o valor de "`WATCH_WAKE`"; no meio do run só muda **para** `agendado`.
- **`startedAt` / `lastTickAt`**: UTC com `Z`, exatamente `date -u +%Y-%m-%dT%H:%M:%SZ`; com offset local
  ou sem `Z`, o gate descarta o valor em silêncio e passa a contar o limite de ~6h do primeiro poll dele.
- **`gatePid`, `gateSignalExits`, `gateLastPollAtSeen`, `lastGateEvent`**: memória do loop do gate entre
  turnos ("O loop de watch"); o gate não lê nenhum deles.
- **`quietTicks`**: contado aqui só no fallback agendado; com o gate, a contagem é dele, em
  `flux-watch-gate-pr-<PR_NUMBER>.json`, que este elo não edita.
- **`slackNotified`**: `{"<login>": {"grupo": "enderecado|aguardando", "abertos": N, "round": N, "recusado": false}}`,
  gravado pelo 9a no rascunho salvo e no `Agora não` (`recusado: true`); falha em salvar não grava; nasce
  `{}`.

**Na 1ª passada**, gravar o estado inicial com `round: 1`, o que a passada processou e classificou nas
listas acima, o SHA pós-push, o CI do passo 2, `conflictAttemptedAtBaseSha` = `baseRefOid` se o 2b
terminou em degradado (exceto lease recusado), `startedAt` = agora, `board`, `solo`, `noRebase` e os
`*SyncedAtSha` do 8a (ou `null` se ele não rodou). Em cada tick, ler, atualizar e regravar.

**Estado perdido** (sessão reiniciada): `resolvedThreadIds` = threads resolvidas por `ME` mais as abertas
cujo último comentário é seu (estas também em `discussionThreadIds`); `verifiedResolvedThreads` vazia;
`answeredCommentIds` = comentários de terceiros com réplica sua posterior; `slackNotified` = `{}` (o
primeiro tick pode avisar de novo, e o `reply` já contém isso pelo rascunho anexado); e o `board` pela resolução do
passo 2a (`board-template.md`, "Resolver o board"), nunca pelo nome do arquivo.

**Atualizar o board a cada tick:** tick é turno deste elo. Com o gate, só existe tick quando ele sai (o poll ocioso acontece fora da LLM e não toca o board); no fallback agendado, a cada wake. Todo tick rola o carimbo de data do board (frontmatter `updated:` e o `**Agora:**` do TL;DR) e recomputa o painel single-PR (status da PR, CI real do `gh pr checks`, threads res/tot, rodadas, 👍/👎 do flow). Tick com novidade substantiva (rodada fechada, push, CI mudou, PR mergeou) também ganha linha na Timeline e o detalhe na seção do iterate. Tick quiet só rola a data.

### O loop de watch (gate mecânico)

Com `watchWake` em `processo` (ou em `fila`, pelo invólucro do adaptador), o loop é: **gravar o estado,
lançar o gate em background, encerrar o turno, tratar a saída, relançar**. Entre o lançamento e a
saída não há turno de LLM: o poll ocioso é do script.

**1. Gravar o estado antes de lançar.** O gate decide lendo o arquivo de estado (`resolvedThreadIds`,
`answeredCommentIds`, `lastHeadSha`, `lastCiConclusion`, `conflictAttemptedAtBaseSha`, `bodySyncedAtSha`,
`titleSyncedAtSha`, `round`, `noRebase`, `startedAt`). Estado desatualizado faz o gate sair de novo com o
mesmo evento, na hora.

**2. Lançar em background**, pelo modo de background da ferramenta de shell da sessão, pedindo o maior
limite de vida que ela aceitar, e **encerrar o turno** sem `ScheduleWakeup`:

```bash
GIT_COMMON="$(cd "$WORKTREE_PATH" && cd "$(git rev-parse --git-common-dir)" && pwd -P)"
WATCH_STATE="$GIT_COMMON/flux-watch-pr-$PR_NUMBER.json"
GATE_OUT="$GIT_COMMON/flux-watch-gate-pr-$PR_NUMBER.out"
GATE_ERR="$GIT_COMMON/flux-watch-gate-pr-$PR_NUMBER.err"
GATE_LOCK="$GIT_COMMON/flux-watch-gate-pr-$PR_NUMBER.lock"
bash "${FLUX_ROOT}/scripts/iterate-watch-gate.sh" --pr "$PR_NUMBER" --repo "$REPO_FULL" \
  --state "$WATCH_STATE" ${GATE_FAST:+--fast} > "$GATE_OUT" 2> "$GATE_ERR"
```

`WORKTREE_PATH` é a worktree da PR resolvida no passo 1. O diretório git comum sai **dela**, nunca do
cwd da sessão: com input por URL de outro repo, o cwd aponta para o `.git` errado. As cinco linhas de
caminho são **recalculadas em todo turno que as usa** (lançar, ler a saída, reabrir): cada turno roda
em outro shell, e variável definida no lançamento não existe mais na leitura.

`GATE_FAST=1` quando o tick acabou de fechar uma rodada ou de pushar (recomentário rápido do bot é
esperado); vazio nos demais. A cadência do poll (270s e 1200s, nunca 300s) é do script. O contrato de
argumentos, eventos e códigos de saída é o `--help` dele, fonte única: não reescrever aqui.

Ainda neste turno, depois de lançar: ler o pid do gate em `$GATE_LOCK/pid` (o script o grava ao assumir
o lock; esperar alguns segundos se o arquivo ainda não existir) e gravá-lo em `gatePid` no estado. O
gate relê o estado a cada poll, então gravar depois do lançamento não o atrapalha. Se o processo já
tiver terminado, não gravar: tratar o código de saída.

**3. Ler a saída.** O aviso de fim do processo traz **só o código de saída**: é dele que vem `GATE_RC`
(em `fila`, do campo `exit=` da mensagem do invólucro). Nenhum trecho anterior define essa variável,
porque o lançamento aconteceu em outro turno; atribuí-la aqui, com o valor do aviso, e recalcular os
caminhos do passo 2. O evento é a última linha de `$GATE_OUT`, um JSON
`{ts,event,pr,sha,ci,mergeable,delta,detail}`:

```bash
GATE_RC=<código de saída do aviso>
GATE_EVENT="$(tail -n 1 "$GATE_OUT" | jq -c 'select(type == "object" and has("event"))' 2>/dev/null || true)"
```

`GATE_EVENT` vazio é **saída sem JSON**.

**4. Tratar o código de saída:**

```bash
case "$GATE_RC" in
  0)           [ -n "$GATE_EVENT" ] && NEXT=tick || NEXT=fallback ;;
  10|11|12|13) [ -n "$GATE_EVENT" ] && NEXT=saida || NEXT=fallback ;;
  14)          NEXT=ceder ;;
  129|130|143) NEXT=relancar ;;
  *)           NEXT=fallback ;;
esac
```

Toda saída que não seja `relancar` zera `gateSignalExits`, e toda saída que não seja `ceder` limpa
`gatePid` (o processo terminou).

- **`tick`** (0: `nova-rodada`, `ci-vermelho`, `conflito-novo`, `drift`) → primeiro o **disjuntor**,
  abaixo; passando por ele, executar **um tick** pelo
  fluxo de sempre ("Um tick", abaixo): mesma coleta, mesmos gates, mesma ordem de prioridade. O evento
  diz por que a sessão acordou e o `delta` adianta os ids, mas quem decide é a coleta do tick, porque a
  PR pode ter andado entre a saída do gate e este turno. Ao fim, voltar ao passo 1 e relançar.
  - **Disjuntor de loop quente.** A chave tem quatro partes: `event`, `sha` e `delta` de `GATE_EVENT`,
    mais o **SHA da base**, o `baseRefOid` do `gh pr view` do passo 1 de "Um tick" (adiantar essa
    leitura para cá; o gate só expõe a base dentro de `detail`, que é prosa e não se compara). Comparar
    a chave com `lastGateEvent` do estado. **Iguais** → o gate saiu duas vezes seguidas pelo mesmo
    motivo, no mesmo SHA (logo, sem push no meio) e com a mesma base: o tick anterior não deixou no
    estado o que o gate lê, e relançar repetiria a saída a cada poll. Não executar outro tick por esse
    caminho: ir para `fallback`, com o aviso **nomeando o evento** repetido e o SHA. **Diferentes** →
    gravar as quatro partes em `lastGateEvent` e seguir. O SHA da base é o que separa dois
    `conflito-novo` legítimos: com a base andando, o segundo chega com o mesmo head e o mesmo delta do
    primeiro. Um disparo indevido (o mesmo evento legítimo duas vezes na mesma chave) custa só a troca
    pelo modo agendado.
- **`saida`** (10 a 13) → o watch acabou; seguir "Condições de saída" (`flux session end` e relatório
  final, iguais aos de hoje). 10 = mergeada ou fechada (`event` diz qual); 11 = assentou; 12 = conflito
  bloqueado sem saída; 13 = limite de segurança. Não relançar.
  - **11 pede uma conferência antes de valer.** O gate não enxerga réplica nova em thread de
    `discussionThreadIds` (ele compara ids). Antes de declarar "assentou", reconsultar essas threads
    pela regra do passo 3 de "Um tick". Alguma recebeu réplica desde que foi deixada aberta → não é
    saída: é rodada. Executar **um tick** (sem passar pelo disjuntor, que só compara eventos
    acionáveis) e voltar ao passo 1. Nenhuma recebeu → assentou.
- **`fallback`** (2, 3, 64, qualquer outro código, ou saída sem JSON) → gravar `watchWake: "agendado"`,
  avisar no chat e no board com o código e a última linha de `$GATE_ERR`, e seguir pelo "Fallback
  agendado" até o fim deste run. **Não relançar o gate neste run.** 2 é dependência ausente, 3 é o `gh`
  falhando três vezes, 64 é erro de invocação ou estado ilegível: nos três, repetir a mesma chamada
  repete a falha, e o tick agendado não depende do script (estado ilegível ele reconstrói pela regra do
  "Estado persistente").
- **`ceder`** (14: já existe um gate rodando nesta PR) → **não relançar e não agendar**: dois vigias
  na mesma PR aplicam, respondem e pusham em dobro. O dono do lock está em `$GATE_LOCK/pid`. Se esse pid
  é o `gatePid` do estado **e** esta sessão é a que o lançou (a distinção entre continuação da sessão e
  invocação nova, no ramo `esperar` abaixo), o gate vivo é o dela: seguir esperando por ele. Senão, encerrar o watch desta sessão avisando que a PR já tem um watch ativo (com o pid do
  dono), rodar o
  `flux session end` das "Condições de saída" e fechar com o relatório final do que esta sessão fez,
  **sem** declarar "assentou". Nunca matar um processo que esta sessão não lançou, e não limpar o
  `gatePid` do estado: ele é da sessão dona do gate.
- **`relancar`** (129, 130, 143: o script recebeu HUP, INT ou TERM e traduziu o sinal em código) → não
  é evento da PR nem falha do gate; voltar ao passo 2. O progresso do gate
  está no arquivo de estado dele e sobrevive ao relançamento. Dois encerramentos por sinal seguidos sem
  que o `lastPollAt` de `flux-watch-gate-pr-<PR_NUMBER>.json` avance → `fallback`. A conta mora no
  estado, para sobreviver à compactação: ler o `lastPollAt` do gate; se ele avançou em relação a
  `gateLastPollAtSeen`, `gateSignalExits = 1`; senão, `gateSignalExits += 1`; gravar o valor lido em
  `gateLastPollAtSeen`; com `gateSignalExits >= 2`, `fallback`.
  - **Sinal que esta sessão mesma mandou não relança.** Quando foi ela que encerrou o gate (parágrafo
    abaixo: saída do watch ou queda para o fallback), o 143 que chega depois é eco desse encerramento,
    reconhecível porque `gatePid` já foi limpo no estado e o watch já saiu ou `watchWake` já é
    `agendado`: não relançar, não contar em `gateSignalExits`, não tratar como evento.
  - **Qual sinal o harness manda** ao estourar o limite de vida de um comando em background não foi
    medido, e este elo não presume. O que o `case` garante: encerramento que o script traduz (129, 130,
    143) relança; encerramento que ele não tem como traduzir (137, de um KILL) cai em `*` e portanto em
    `fallback`, com o lock deixado para trás, que o script recupera como órfão num lançamento futuro.

Em toda saída do watch e em toda queda para o fallback, se ainda houver um gate **lançado por esta
sessão** rodando, encerrá-lo antes (o script limpa o próprio lock ao receber o sinal) e limpar
`gatePid`. `gatePid` vivo e igual ao pid do lock diz só que o gate do estado está vivo, não de quem ele
é: o estado é por PR e toda sessão que abre a mesma PR lê o mesmo `gatePid`. Quem identifica a sessão
é a distinção do ramo `esperar`, abaixo: só a sessão que lançou o gate, ou a continuação dela, o
encerra. Uma invocação nova do verbo não encerra gate nenhum e não mexe em `gatePid`, em nenhum ramo
(`ceder`, `saida`, `fallback`).

Se a sessão for reaberta sem aviso de saída pendente (compactação, retomada manual), ler `watchWake` do
estado. Em `agendado`, seguir o fallback. Em `processo` ou `fila`, **não relançar para descobrir se há
gate vivo**: os redirecionamentos da linha de lançamento truncam `$GATE_OUT` e `$GATE_ERR` do gate vivo
antes de o script responder 14. Recalcular os caminhos do passo 2 e checar a vivacidade:

```bash
LOCK_PID="$(cat "$GATE_LOCK/pid" 2>/dev/null || true)"
GATE_PID="$(jq -r '.gatePid // empty' "$WATCH_STATE" 2>/dev/null || true)"
if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
  [ "$LOCK_PID" = "$GATE_PID" ] && NEXT=esperar || NEXT=ceder
else
  NEXT=lancar
fi
```

- **`lancar`** → não há gate vivo: seguir pelo passo 1.
- **`esperar`** → o gate vivo é o que este watch lançou. Se a reabertura é **continuação desta sessão**
  (compactação), encerrar o turno sem relançar: a saída dele reabre a sessão. Se é uma **invocação
  nova** do verbo, o gate pertence a outra sessão e o fim dele não reabre esta: tratar como `ceder`.
- **`ceder`** → como no código 14.

### Um tick

Um tick roda quando o gate sai com evento acionável ou, no fallback agendado, a cada wake:

1. **Estado da PR.** `gh pr view $PR_NUMBER --repo $REPO_FULL --json state,mergedAt,headRefOid,baseRefName,baseRefOid,isDraft,mergeable,mergeStateStatus`.
   - `state == "MERGED"` (com `mergedAt` preenchido) ou `state == "CLOSED"` → **encerrar o watch** com relatório final. Não pushar mais nada.
   - **`mergeable` entra nesta coleta obrigatoriamente.** A base anda enquanto o watch dorme: uma PR que integrava no tick anterior pode estar `CONFLICTING` agora. Não herdar `lastMergeable` do estado sem reconsultar.
   - **`baseRefName` e `baseRefOid` também**: a base de uma PR pode ser trocada no meio do watch, e `baseRefOid` é a régua de `conflictAttemptedAtBaseSha`. É o mesmo valor que o gate lê do GitHub; medir contra o `origin/<baseRefName>` local diverge dele sempre que falta um `git fetch`, e uma tentativa já registrada deixa de ser reconhecida.
2. **CI.** `gh pr checks $PR_NUMBER --repo $REPO_FULL --json name,state,bucket,link` (ou `gh pr checks` simples se o JSON não vier). Classifique o agregado pelo `bucket`, na mesma ordem do gate, e grave em `lastCiConclusion` o literal entre parênteses:
   - qualquer `fail` ou `cancel` → **vermelho** (`failure`).
   - senão, qualquer `pending` → CI rodando, ainda não decidiu (`pending`).
   - senão (todos `pass` ou `skipping`) → **verde** (`success`).
   - nenhum check reportado → **sem checks** (`null`): para assentar vale como verde, e nunca é vermelho.
3. **Threads novas.** O GraphQL `reviewThreads` do passo 2, com `resolvedBy` e o último comentário
   (`comments(last: 1)`). Dois deltas, sem misturar: (a) abertas cujo `id` não está em
   `resolvedThreadIds`, com o filtro de trivialidade; (b) `isResolved == true` com `resolvedBy.login != ME`
   ou ausente, cujo snapshot difere de `verifiedResolvedThreads`, sem filtro nenhum. Resolvidas por `ME` ficam fora dos
   dois. Qualquer delta não vazio é **nova rodada**.
   - **Reaberta externamente** (no delta b com `isResolved == false`): tirar o snapshot e o id das listas,
     tratar como thread aberta normal (deduplicada por `threadId`) e gravar o estado final dela ao fim do
     tick, sem snapshot enquanto estiver aberta.
   - **`discussionThreadIds`**: reconsultar o último comentário de cada uma; autor diferente de `ME` ⇒
     tirar das duas listas e tratar como delta. O gate não acorda por isso: a réplica é vista no próximo
     tick ou na conferência do código 11.
3b. **Issue comments novos** (`gh api repos/$REPO_FULL/issues/$PR_NUMBER/comments`): de terceiro, com `id`
   fora de `answeredCommentIds`, pela partição do passo 2. Acionável novo é **nova rodada**. Ao fim do
   tick, todo comentário classificado entra em `answeredCommentIds`, inclusive o ignorável; o que fica de
   fora reacorda a sessão a cada poll até o disjuntor derrubar o watch para `agendado`.

#### Decisão do tick (em ordem de prioridade)

- **PR conflitante (`mergeable == CONFLICTING`) → tem precedência sobre tudo.** Aplicar o **gate de integração do passo 2b** (fonte única) antes de qualquer outra coisa deste tick, pelo mesmo motivo da 1ª passada: correção empilhada em base que não funde piora o conflito, e o CI do tick é inconfiável. Se a base andou desde a última tentativa (`conflictAttemptedAtBaseSha != baseRefOid` do passo 1), é tentativa nova; se é o mesmo SHA de base, **não retentar**. Resolvido → evento `conflito-resolvido`, atualizar `lastHeadSha` e `lastMergeable`, e seguir o tick normalmente. Não resolvido → evento `conflito-bloqueado`, **modo degradado**: fechar a conversa das threads do delta (responder/reagir/resolver) sem aplicar, commitar ou pushar, e não contar quiet tick. **Gravar `conflictAttemptedAtBaseSha = baseRefOid` em toda queda para o degradado**, com ou sem tentativa de resolução (qualquer causa da seção 6 do shared, inclusive gate vermelho), **exceto lease recusado**, que não grava porque não consome a tentativa daquele SHA de base (seção 5 do shared): o campo diz ao gate que este SHA de base já foi avaliado. Sem ele, o gate reemite `conflito-novo` a cada relançamento e nunca chega ao código 12.
- **Nova rodada de threads (qualquer delta não vazio)** → executar os passos 3 a 8a em `--auto` **apenas sobre os deltas**: abertas seguem exatamente o fluxo atual; resolvidas por terceiros/unknown passam pela classificação do passo 2 e só findings persistentes/regredidos entram no plano normal de correção. Correção já presente não é reaplicada; se confirmada válida ou improcedente/obsoleta, manter a thread fechada e registrar a verificação. Ao terminar: `round += 1`; adicionar a `resolvedThreadIds` todas as threads do delta processadas (as abertas deixadas por `needs-discussion` também entram em `discussionThreadIds`); adicionar a `verifiedResolvedThreads` os snapshots das threads resolvidas por terceiros/unknown que foram classificadas; atualizar `lastHeadSha`, zerar `quietTicks`. Rodar o passo 9a em modo automático sobre os revisores do delta (aviso no canal, só rascunho). Emitir evento Slack `nova-rodada-fechada` (ver "Hook Slack").
- **CI vermelho** (e sem delta de threads) → **passo 2c**, que é a fonte única (evento `ci-corrigido-tentativa` ou `ci-vermelho`, com `metricKey`/`actualValue`/`errorThreshold` quando é gate externo).
- **CI verde ou sem checks + sem delta de threads + PR integrando** → antes de contar quiet tick, checar **drift de título e descrição**: se `bodySyncedAtSha != lastHeadSha` ou `titleSyncedAtSha != lastHeadSha`, rodar o passo 8a sobre o SHA corrente (uma passada, com os três guardrails). É o que o evento `drift` do gate pede. **Ao fim do 8a, gravar `bodySyncedAtSha` e `titleSyncedAtSha` com o SHA corrente mesmo quando nada foi editado**: os campos registram "verificado neste SHA", não "editado neste SHA", e sem a gravação o gate reemite `drift` a cada relançamento e a PR nunca assenta. Depois, `quietTicks += 1` (só no fallback agendado; com o gate, o quiet tick é contado por ele). Emitir `ci-verde` apenas na **transição** (quando `lastCiConclusion != success`).
- **CI pending + sem delta** → não fazer nada além de aguardar (não conta como quiet tick).

Atualizar sempre `lastHeadSha`, `lastCiConclusion`, `lastMergeable` e `lastTickAt` no estado, **antes** de relançar o gate ou de agendar o próximo wake, **em todo tick, inclusive o que não mexeu em nada**. `lastHeadSha` é o `headRefOid` do fim do tick (o lido no passo 1, ou o SHA pós-push se o tick pushou): um push externo move o head sem rodada nenhuma, e o gate compara o head atual com este campo. `lastCiConclusion` usa os literais do passo 2.

#### Condições de saída (encerrar o watch)

As condições são as mesmas nos dois modos. Com o gate, quem as detecta é o script e elas chegam como código de saída (10 = mergeada ou fechada, 11 = assentou, 12 = conflito bloqueado, 13 = limite); no fallback agendado, quem as detecta é o tick. Uma parte do "assentou" o script não vê, a réplica nova em thread de `discussionThreadIds`: no agendado o tick a reconsulta a cada wake, e com o gate ela é conferida ao receber o 11 (ramo `saida` de "O loop de watch"). O que se faz ao sair é idêntico.

- PR mergeada ou fechada.
- **Assentou**: CI verde **ou PR sem checks** (repo sem CI assenta; CI rodando ou vermelho, não), zero threads no delta (as de `discussionThreadIds` sem réplica nova não contam: esperam o revisor e vão listadas no relatório final; com réplica nova voltam ao delta), **`mergeable == MERGEABLE`** e **título/descrição reconciliados** (`bodySyncedAtSha` e `titleSyncedAtSha` == `lastHeadSha`) por **2 ticks consecutivos** (`quietTicks >= 2`). A PR está pronta para review humano/merge; o watch cumpriu o papel. **Nunca declarar "assentou" com a PR `CONFLICTING`** (nem com `UNKNOWN` sem reconsultar): PR conflitante e quieta é PR travada, não PR pronta, exatamente como título ou descrição afirmando algo que a PR já refutou.
- **Conflito bloqueado sem saída**: `mergeable == CONFLICTING` com o gate em modo degradado (qualquer causa da seção 6 do shared, inclusive gate vermelho) e **nada mais a fazer** (zero threads no delta, CI não acionável) → encerrar avisando que a PR precisa de resolução humana do conflito. Ficar vivo não muda o bloqueio, e o watch não deve consumir wakes esperando por decisão que é do usuário.
- Limite de segurança: `round > 8` ou watch ativo há mais de ~6h sem assentar → encerrar avisando que passou do esperado (provável discussão humana travada, CI cronicamente vermelho ou conflito recorrente com uma base muito movimentada) e pedir olhada manual.
- Usuário interrompe a sessão.

Em toda saída normal (não a interrupção pelo usuário), antes do relatório final: se a variável de
ambiente `FLUX_SESSION_ID` estiver definida (sessão disparada via `flux iterate`), rodar
`flux session end "$FLUX_SESSION_ID"` para marcar `status: "ended"` no arquivo de estado do CLI
(`~/.flux/sessions/<id>.json`). Sem a variável (sessão aberta manualmente, fora do CLI), pular
silenciosamente — não há arquivo de estado para marcar. Se o comando falhar ou `flux` não estiver
no PATH, ignorar o erro e seguir para o relatório final normalmente — é best-effort, nunca
bloqueante.

Em qualquer saída, **relatório final** no chat: rodadas fechadas, estado final do CI (com link se vermelho), **estado final de integração com a base** (e, se houve resolução de conflito, os itens do relato da seção 5 do shared), threads humanas deixadas em `needs-discussion`, e o range de commits pushados durante o watch.

### Fallback agendado (`watchWake: agendado`)

É o watch de antes do gate, inteiro, e vale onde o `WATCH_WAKE` não resolveu `processo` nem `fila`, ou depois de uma queda do gate neste run. Sem wake agendado utilizável, vale o caminho de ausência descrito em "`WATCH_WAKE`". Cada wake executa "Um tick" e reagenda; o gate não é lançado.

Use `ScheduleWakeup` ao fim de cada tick para reabrir a sessão. A escolha do `delaySeconds` segue as janelas de cache (TTL ~5 min):
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

- `--dry` nunca escreve no GitHub: o rascunho fica no board (ou no chat, sem vault).
- Se `gh` não estiver autenticado, pedir `gh auth login` e abortar.
- Se o quality gate falhar (typecheck/lint/teste), **não** avançar para postar/pushar: reportar a falha e parar para o usuário decidir.
