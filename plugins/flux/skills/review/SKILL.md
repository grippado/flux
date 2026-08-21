---
name: review
description: "Orquestrador `flux:review` — revisão formal de PR ou doc; reviewer holístico + specialists do repo reconciliados conforme `review-agents.md`; badges textuais conforme `review-legend.md`; persiste no vault. Global, resolve contexto via `flux-context.md`. Para relance rápido e read-only, use o verbo `peek` da família."
user-invocable: true
requires:
  hard:
    - file: shared/review-legend.md
    - file: shared/review-artifact-template.md
    - file: shared/flux-context.md
    - bin: git
    - agent: ${HOLISTIC}
  soft:
    - bin: gh
    - file: shared/review-body-template.md
    - vault
    - index
---

# /flux:review

Skill orquestradora de review **formal**, despachada por verbo. Resolve o contexto de execução dinamicamente, delega a análise ao reviewer holístico do perfil (+ specialists do repo, reconciliados), e persiste o resultado num arquivo markdown padronizado no vault Obsidian.

**Legenda canônica de badges:** `${FLUX_ROOT}/shared/review-legend.md`
**Corpo da review postada no GitHub:** `${FLUX_ROOT}/shared/review-body-template.md`
**Contrato de agentes (descoberta + reconciliação):** `${FLUX_ROOT}/shared/review-agents.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Disciplina de fan-out (o contexto principal orquestra, os agentes trabalham):** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Preflight:** `${FLUX_ROOT}/shared/preflight.md`
**Bootstrap de specialists:** `${FLUX_ROOT}/shared/bootstrap-specialists.md`

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
nome do elo na primeira linha usa `${FLUX_CMD}` já substituído (`/flux:review` num harness,
`/flux-review` em outro) — nunca `flux:` literal.

## Step 0-preflight: verificar pré-requisitos

Seguir `${FLUX_ROOT}/shared/preflight.md` **antes de coletar o alvo**. Ele resolve `FLUX_ROOT`, verifica
os `requires` do frontmatter, confere a existência do agente holístico e classifica o nível de
capacidade. Faltou um `hard` → abortar sem efeito colateral. Faltou um `soft` → seguir e declarar a
perda no banner de perfil, que abre todo output.

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
   - `HOLISTIC` = `holistic_reviewer` (campo ausente → cascata genérica do preflight, Passo 3)
   - `DOC_REVIEWER` = `doc_reviewer` (campo ausente → mesma cascata, em modo doc)
   - `MCP_DOCS` = `mcp.docs` (prefixo do MCP de documentos; ausente → descoberta na sessão)
   - `VAULT_ROOT` = `vault_root` (raiz compartilhada: é onde fica o `0-inbox/`, e toda escrita nova vai para lá)
   - `VAULT_CTX` = `vault_context`
   - `VAULT_CTX_ROOT` = `vault_context_root` (raiz do contexto, onde o eixo por tipo vive; só leitura. Ausente → `VAULT_ROOT`)
   - `NO_EMDASH` = `no_emdash`
   - `REPOS` = `repos` (lista de repos conhecidos do contexto)
   - `SPECIALISTS_ROOT` = `specialists_root` (template de path com `{repo}`)
   - `KITS_ROOT` = `kits_root` (template de path com `{repo}`; degrau 3 da cascata de destino, opcional)
   - `KITS` = `kits` (caminhos locais de kit; origem 1 do `KIT_ROOTS`, Passo 1d do preflight, opcional)
   - `SPECIALISTS_SPEC` = `specialists_spec` (espec que rege a autoria da suite; opcional)
   - `SPECIALISTS_REPO` = `specialists_repo` (repo onde a suite versionada vive, para PR; opcional)
   - `WORKSPACE_ROOT` = `workspace_root` (raiz dos checkouts; sem o campo, o pai do `.claude/` achado)
   - `LINEAR_ORG` = `linear_org` (org do Linear, para montar URLs de ticket; opcional)

3. Se não encontrar (perfil genérico):
   - `HOLISTIC` = genérico da família pela cascata do preflight (Passo 3): `flux:pr-reviewer` →
     `flux-pr-reviewer` → `pr-reviewer`, parando no primeiro que **existir**
   - `DOC_REVIEWER` = o mesmo agente resolvido acima, em modo doc
   - `MCP_DOCS` = descoberto na sessão; ambíguo ou ausente → o modo doc degrada e declara

   > **Nunca hardcodar `pr-reviewer` aqui.** O nome com que o genérico fica registrado depende de
   > como a família foi instalada, e num harness que não prefixa por `:` a forma sem prefixo pode
   > simplesmente não existir. Resolver por cascata é o que faz o perfil genérico funcionar em
   > qualquer instalação.
   - `VAULT_ROOT` = não persiste por default; aceita `--save <dir>` para gravar
   - `VAULT_CTX` = `generic`
   - `VAULT_CTX_ROOT` = nenhum (sem vault não há rodada anterior para procurar)
   - `NO_EMDASH` = `false`
   - `REPOS` = [] (detecção de stack dinâmica a partir do checkout local)
   - `SPECIALISTS_ROOT` = `<repo-checkout>/.claude/agents/reviewer.md` ou `<repo-checkout>/.claude/agents/review/*.md`
   - `SPECIALISTS_SPEC` = nenhum (a autoria segue o checklist embutido no Bootstrap)
   - `SPECIALISTS_REPO` = nenhum (a suite é escrita no próprio checkout, sem PR)
   - `WORKSPACE_ROOT` = `cwd`
   - `LINEAR_ORG` = nenhum (sem `LINEAR_ORG`, `TICKET_URL` fica `null`)

Após resolver o perfil, seguir para a resolução de verbo abaixo.

## Verbos

| Verbo | Target | Reviewer | Saída no vault |
|-------|--------|----------|----------------|
| `pr` | PR number / URL de PR / branch atual | `<HOLISTIC>` + specialists reconciliados | `<VAULT_ROOT>/0-inbox/` |
| `doc` | URL do Google Docs / Drive | `<DOC_REVIEWER>` + specialists reconciliados | `<VAULT_ROOT>/0-inbox/` |

**Resolução de verbo (após Step 0-context, sempre antes de qualquer coleta):**

1. Se o 1º token não-flag ∈ {`pr`, `doc`}, consome como verbo; o resto é o target.
2. Sem verbo explícito → **inferir** (backward-compat, não quebra o uso antigo):
   - vazio / numérico / URL `github.com/.../pull/...` → `pr`
   - URL `docs.google.com` ou `drive.google.com` → `doc`
   - qualquer outra coisa → propor ao usuário qual verbo usar, ou sugerir `${FLUX_CMD}peek` para relance rápido sem cerimônia.
3. A flag `--solo` pode aparecer em qualquer posição: desliga os specialists e roda só `<HOLISTIC>`.

Depois de resolver o verbo, saltar para o pipeline correspondente:
- `pr` → **Pipeline `pr`** (Steps 1 a 8)
- `doc` → **Pipeline `doc`**

**Out of scope (NUNCA faça sem confirmação explícita):**

- Não rodar `pnpm test` / `pnpm typecheck` / `pnpm lint` / qualquer suite de testes — EXCETO no modo "aplicar correções" do Step 8 (PR própria), onde rodar a verificação dos arquivos tocados é obrigatório
- Não fazer commit, push, nem modificar arquivos do repo sob review — EXCETO no modo "aplicar correções" do Step 8 (PR própria), e mesmo aí só após o usuário escolher essa opção
- Não aprovar nem mergear (`gh pr review --approve`, `gh pr merge`)
- Não escrever em lugar nenhum exceto: o arquivo final no vault; e (opcionalmente) a review da PR via `gh api` no Step 8; e, no modo "aplicar correções", os arquivos de código + commit na branch da PR própria.

**Sobre o Step 8:** após gravar o arquivo no vault (Step 6), o Step 8 oferece, via GATE (`${FLUX_ROOT}/shared/hitl.md`), a ação pós-review. O menu MUDA conforme a PR seja **de terceiros** (postar comentários inline) ou **do próprio usuário** (aplicar as correções recomendadas em commits semânticos). Nunca agir sem o usuário escolher uma opção positiva.

## Inputs aceitos

| Forma | Verbo resolvido | Significado |
|-------|-----------------|-------------|
| `/flux:review` (sem arg) | `pr` (inferido) | Branch atual do `pwd` vs `main` |
| `/flux:review 790` | `pr` (inferido) | PR #790 do repo do `pwd` atual |
| `/flux:review pr 790` | `pr` (explícito) | idem |
| `/flux:review https://github.com/acme/api-gateway/pull/790` | `pr` (inferido) | PR do URL (qualquer repo de `REPOS`) |
| `/flux:review doc https://docs.google.com/document/d/.../edit` | `doc` (explícito) | Review de documento/RFC |
| `/flux:review https://docs.google.com/document/d/.../edit` | `doc` (inferido) | idem |

**Flag opcional:** `--solo` pode aparecer em qualquer posição (antes ou depois do verbo/target), em qualquer verbo. Quando ausente: roda holístico + specialists reconciliados (conforme `review-agents.md`). Quando presente: pula os specialists e roda só `<HOLISTIC>`.

## Pipeline `pr` (review de PR/branch)

### 1. Resolver o target

```bash
# Detectar e remover a flag --solo antes de resolver o target
SOLO=false
for arg in "$@"; do
  case "$arg" in --solo) SOLO=true ;; esac
done
# ARGS = argumentos sem a flag (usados abaixo como PR_NUMBER / URL)

# se arg numérico (após remover a flag):
PR_NUMBER=<primeiro arg que não seja a flag>
REPO_FULL=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# se arg é URL:
# parse {owner}/{repo}/pull/{number}

# se sem arg:
# branch atual vs main, REPO_FULL = $(gh repo view --json nameWithOwner -q .nameWithOwner)
# PR_NUMBER = null
```

### 2. Decidir cross-repo vs local

Se o `pwd` é o checkout do repo alvo (ou não há arg), trabalhe direto. Se for cross-repo:

1. Tente buscar diff via `gh pr diff <n> --repo {owner}/{repo}` — se funcionar, segue só com diff
2. Se falhar (auth, repo privado sem acesso), **aborte** com mensagem:
   > `Não consegui acessar o diff de {owner}/{repo}#{n} a partir daqui. Faça \`cd\` no checkout local de {repo} e rode ${FLUX_CMD}review {n} novamente.`
3. Não tente trocar de pwd automaticamente

### 3. Coletar contexto

Para PR existente:

```bash
gh pr view $PR_NUMBER --repo $REPO_FULL --json number,title,body,author,headRefName,baseRefName,headRefOid,url,state,additions,deletions,changedFiles,commits
gh pr diff $PR_NUMBER --repo $REPO_FULL
```

Guardar `HEAD_SHA = .headRefOid` (branch local sem PR: `git rev-parse HEAD`) — é a base dos permalinks.

Buscar nome humano do autor:

```bash
gh api users/{login} --jq .name
# se vier null/vazio, usa só o login
```

Detectar se a PR é **do próprio usuário** (decide o menu do Step 8). Buscar também o assignee:

```bash
ME=$(gh api user -q .login)
gh pr view $PR_NUMBER --repo $REPO_FULL --json author,assignees \
  -q '{author: .author.login, assignees: [.assignees[].login]}'
# IS_OWN_PR = true se ME == author.login OU ME estiver em assignees
```

Guardar `IS_OWN_PR` (bool) e `ME`. Para branch local sem PR aberta, tratar como própria (`IS_OWN_PR = true`).

Para branch local (sem PR):

```bash
git branch --show-current
git log main..HEAD --oneline
git diff main..HEAD
git diff main..HEAD --stat
```

Extrair ticket Linear do título da PR ou nome da branch (regex `[A-Z]{2,5}-\d+`).

Se tiver checkout local do repo alvo, também leia:

- `AGENTS.md` e `CLAUDE.md` (as que existirem, não só a primeira)
- `.github/PULL_REQUEST_TEMPLATE.md`

**Montar as URLs (disciplina de links do `review-artifact-template.md`).** O artefato exige link em
toda citação — montar e guardar:

- `PR_URL` = `.url` do `gh pr view`.
- `COMMIT_URL` = `https://github.com/{owner}/{repo}/commit/{HEAD_SHA}`.
- `TICKET_URL` = `https://linear.app/{LINEAR_ORG}/issue/{TICKET}`. Sem `LINEAR_ORG` no perfil ou sem ticket: `null`.
- **Permalink de código** (função, aplicada a cada `arquivo:linha` citado nos findings):
  `https://github.com/{owner}/{repo}/blob/{HEAD_SHA}/{path}#L{n}` (range → `#L{a}-L{b}`). O `HEAD_SHA`
  no path deixa o link estável a novos pushes. Os `url` das threads (GraphQL, passo 3b) já são
  permalinks; reusar.

### 3b. Histórico de rodadas anteriores e threads existentes

**Rodadas anteriores da mesma PR (vault):**

Procurar nos **dois** lugares onde uma review pode estar: no `0-inbox/`, se ainda não foi triada, e no
eixo por tipo do contexto, se o `/organize` já a promoveu.

```bash
ls <VAULT_ROOT>/0-inbox/ <VAULT_CTX_ROOT>/pr-reviews/ 2>/dev/null \
  | grep -E "^[0-9]{4}-[0-9]{2}-[0-9]{2}(-[0-9]{4})?-{repo-slug}-PR{number}(-v[0-9]+)?\.md$" \
  | sort
```

> Só o `0-inbox/` não basta: a review da semana passada já foi promovida e sumiria da busca, e a rodada
> nova nasceria como se fosse a primeira. Sem `VAULT_CTX_ROOT` (vault sem separação por contexto), fica
> só o `0-inbox/`.

Se houver arquivo(s), ler o mais recente e extrair apenas a seção `## Comentários de Review` + frontmatter (`status`, `date`). Guardar como `PREV_REVIEW_COMMENTS`. Se não houver, `PREV_REVIEW_COMMENTS = null`.

**Threads já postadas na PR (abertas e resolvidas):**

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

Para comentários com body truncado (> 200 chars), buscar o body completo via REST:

```bash
gh api repos/$REPO_FULL/pulls/comments/<databaseId> -q '.body'
```

**Top-level PR comments — COLETA OBRIGATÓRIA.** O `reviewThreads` acima **não retorna** comentários top-level de PR (os sem `path:line`), e revisor humano frequentemente deixa o argumento mais denso justamente ali, por não caber numa linha do diff. Rode sempre, na mesma passada:

```bash
gh api repos/$REPO_FULL/issues/$PR_NUMBER/comments \
  --jq '.[] | {id, author: .user.login, createdAt: .created_at, body}'
```

Descarte os ecos de bot (CI, sincronização de ticket, reviewer automático que só informa que não achou nada) e trate o restante como parte do material de review, no mesmo pé das threads. Um review que ignora esses comentários reporta cobertura que não teve.

Guardar como `PR_THREADS` (dois conjuntos: `open` + `resolved`). Se a query GraphQL falhar (rate limit, permissão), continuar com `PR_THREADS = null` e avisar no chat.

### 4. Análise: holístico + specialists reconciliados

Seguir o contrato completo de `${FLUX_ROOT}/shared/review-agents.md`.

Resumo do contrato:

- **Inputs base** (comuns a todas as lentes): diff completo, lista de commits, título + ticket, metadados (repo, autor, branches), caminho do checkout local se disponível, `PREV_REVIEW_COMMENTS` (instrução: não repetir findings já cobertos), `PR_THREADS` (instrução: se um finding cobrir o mesmo ponto de thread existente, classificar como `resolved` ou referenciar a URL da thread irmã).

- **Passo 1 (review-agents.md):** descobrir specialists do repo a partir de `SPECIALISTS_ROOT`. Fallback gracioso se não houver. Com `--solo`, pular este passo.

- **Passo 2 (review-agents.md):** rodar em paralelo via Task tool:
  - **2a — Holístico:** Task com `subagent_type: <HOLISTIC>` com os inputs base. Guardar como `HOLISTIC_REPORT`.
  - **2b — Specialists:** Task com o orquestrador de specialists (repo-owner ou reviewer local) com diff + metadados + threads. Guardar como `AGENT_REPORT`. (Pulado se `--solo` ou se não houver specialists.)

- **Passo 3 (review-agents.md):** reconciliar `HOLISTIC_REPORT` + `AGENT_REPORT` num único `FINAL_REPORT` (união, dedup por chave `(arquivo, linha/bloco, tema)`, precedência por domínio, mapeamento de severidade para badges conforme `review-legend.md`).

O `FINAL_REPORT` segue o formato `SUMARIO / COMENTARIOS / CHECKLIST / VEREDITO / STATUS / PRIORIDADE`, já com badges textuais.

### 5. Computar nome do arquivo

Convenção:

- **Com PR number:** `YYYY-MM-DD-HHMM-{repo-slug}-PR{number}.md`
  - Exemplo: `2026-04-30-1435-backoffice-bff-PR790.md`
- **Sem PR (branch local):** `YYYY-MM-DD-HHMM-{repo-slug}-{branch-slug}.md`
  - Exemplo: `2026-04-30-1435-backoffice-bff-cma-2400-feature-x.md`
  - branch-slug = nome da branch em kebab-case, sem prefixos como `feat/`, `fix/`
- `HHMM` = hora **local** da criação do artefato (mesma regra do perfil doc). É o que mantém a
  listagem do `0-inbox/` em ordem cronológica real — todo perfil da família grava com `HHMM`, e a
  review não é exceção. A busca de rodada anterior (passo 3b) ignora o `HHMM` de propósito, então
  artefatos legados sem hora continuam sendo encontrados.

Path completo: `<VAULT_ROOT>/0-inbox/{filename}`

> **A review nasce no inbox, como toda nota nova.** O contexto voltou a ser pasta: o eixo por tipo do
> vault vive **dentro** de cada contexto (`<VAULT_CTX_ROOT>/pr-reviews/`), e não na raiz. Mas escolher a
> pasta na hora da captura é justamente a decisão que este elo não tem como tomar bem, então ele não a
> toma: grava no `0-inbox/` e deixa o `/organize` promover.
>
> O frontmatter não é mais o lugar onde o contexto mora **em vez** da pasta; é o **sinal de roteamento**
> que diz ao `/organize` para qual contexto promover. Por isso `context: <VAULT_CTX>` continua obrigatório,
> agora acompanhado de `repo:` (slug puro) e `pending_organize: true`. Review sem esses campos chega no
> inbox sem endereço e vira triagem manual. O repo segue embutido no nome do arquivo
> (`{repo-slug}-PR{number}`), que é o que faz a busca de rodada anterior funcionar dos dois lados.

**Re-runs no mesmo dia:**

- Se já existe artefato da mesma PR no mesmo dia (em qualquer dos dois lugares varridos no passo 3b,
  com ou sem `HHMM`), sufixar com `-v2`, `-v3`, etc. — o `HHMM` é o da nova rodada.
  - `2026-04-30-1612-backoffice-bff-PR790-v2.md`

### 6. Renderizar template e gravar

Montar o artefato seguindo o **perfil PR** de `${FLUX_ROOT}/shared/review-artifact-template.md`
— fonte única do formato (frontmatter, linha de metadados, e as seções 🎯 Veredito & prioridades →
📊 Painel de findings → 🔎 Findings → 📎 Escopo → ✅ Ação → 🔗 Cobertura), com a **disciplina de links**,
as **regras de escrita** e a **regra de ouro do painel**. Tradução de STATUS e cálculo de `size_*` também
vivem lá.

Preencher com os dados coletados (`PR_URL`, `COMMIT_URL`, `TICKET_URL`, `HEAD_SHA`, `IS_OWN_PR`, tabela
de arquivos, threads/reviews anteriores) + o `FINAL_REPORT` (SUMARIO, COMENTARIOS, CHECKLIST, VEREDITO,
STATUS, PRIORIDADE). Ao montar:

- Cada finding em `## 🔎 Findings` tem header curto e estável (`### f{n} · {rótulo}`), alvo dos
  wikilinks internos (`[[#f{n} · {rótulo}|f{n}]]`; âncora de Pandoc `{#fN}` não resolve no Obsidian,
  ver "Âncoras internas" no template), e ABRE com o banner-imagem (já vem no corpo do
  `FINAL_REPORT`). Todo `arquivo:linha` citado (no painel, nos findings, nas prioridades) vira
  **permalink no `HEAD_SHA`** — nada de citação nua.
- `## 📊 Painel de findings` é a **única** tabela de findings; preencher a contagem por badge (`counts`)
  e a legenda colorida.
- `## 🎯 Veredito & prioridades` no topo, com cada prioridade linkando pro `#fN` e pro código.
- Frontmatter enriquecido: `pr_url`, `ticket_url`, `head_sha`, `counts` e `status` (vocabulário novo).

Gravar com a Write tool no caminho calculado (Step 5). Quando `VAULT_ROOT` não estiver definido (perfil
genérico sem `--save`): imprimir o artefato no chat em vez de gravar; com `--save <dir>`, gravar em
`<dir>/{filename}`.

### 7. Resposta no chat

Depois de gravar com sucesso, responda com:

```
Review salvo em {caminho-completo-do-arquivo}.

Veredito: {STATUS} — {1 frase do veredito}.
```

**Não** repita o conteúdo do review no chat. **Não** faça resumo expandido. O arquivo é a fonte de verdade.

Em seguida, vá direto para o Step 8 (sem esperar input adicional do usuário). Se o review **não tem PR number** (branch local sem PR aberta) ou se o `FINAL_REPORT` não retornou nenhum comentário acionável (`request-change`, `breaking-change`, `question`, `suggestion`, `praise`), **pule o Step 8** — apenas terminar.

### 8. Oferecer ação pós-review (aplicar ou publicar)

Se há PR aberta e comentários acionáveis no review, abrir um **GATE** (`${FLUX_ROOT}/shared/hitl.md`) — uma única question, single-select. **O conjunto de opções depende de `IS_OWN_PR`** (Step 3): em PR própria, o padrão é aplicar as correções; em PR de terceiros, o padrão é postar inline.

#### 8a. PR do próprio usuário (`IS_OWN_PR == true`)

Postar comentário pra si mesmo não agrega; o valor é aplicar a correção. Antes de perguntar, se a PR ainda não tiver o usuário como assignee, atribuir:

```bash
gh pr edit $PR_NUMBER --repo $REPO_FULL --add-assignee "$ME"
```

Perguntar:

- **Header:** `Ação na PR?`
- **Question:** `A PR #{number} é sua. O que fazer com as recomendações do review?`
- **Options (nessa ordem):**
  1. `Aplicar correções em commits semânticos (Recomendado)` — descrição: `Aplica os request-change + breaking-change + suggestion acionáveis no working tree, roda a verificação dos arquivos tocados, e commita semanticamente. Não posta nada. Sem push automático.`
  2. `Aplicar e dar push` — descrição: `Igual acima, e ao final dá push na branch da PR.`
  3. `Postar comentários inline` — descrição: `Em vez de aplicar, posta o review na PR (mesmo menu de PR de terceiros). Útil pra registrar sem mexer no código agora.`
  4. `Não fazer nada` — descrição: `Review fica só no vault. Você decide depois.`

Se escolher 1 ou 2 → ir para **8c**. Se escolher 3 → usar a postagem de **8b**. Se 4 → terminar.

#### 8b. PR de terceiros (`IS_OWN_PR == false`) — publicar inline

Abrir o GATE (single-select, protocolo em `${FLUX_ROOT}/shared/hitl.md`):

- **Header:** `Postar na PR?`
- **Question:** `Quer postar algum subset dos comentários direto na PR #{number}?`
- **Options (nessa ordem):**
  1. `Prioridades + praise (Recomendado)` — descrição: `Posta request-change + breaking-change + itens da lista PRIORIDADE + todos os praise inline. Padrão histórico do usuário.`
  2. `Só prioridades` — descrição: `Posta request-change + breaking-change + itens da lista PRIORIDADE inline. Sem praise.`
  3. `Tudo` — descrição: `Posta todos os comentários do review (request-change, breaking-change, question, suggestion, praise) inline. note nunca vai.`
  4. `Não postar` — descrição: `Review fica só no vault. Eu reviso antes de decidir.`

> A opção "Recomendado" é a primeira e tem `(Recomendado)` no label.
> Para rascunhar réplicas às threads abertas da PR, use `${FLUX_CMD}iterate <pr> --dry` (montar com o
> `FLUX_CMD` do preflight, não com `/flux:` literal).

Se o usuário escolher uma opção positiva (1, 2 ou 3), montar a review e postar via `gh api`:

```bash
gh api -X POST repos/{owner}/{repo}/pulls/{number}/reviews --input <json-file>
```

JSON shape esperado:

```json
{
  "event": "COMMENT",
  "body": "<corpo da review — formato canônico em shared/review-body-template.md>",
  "comments": [
    { "path": "...", "line": N, "side": "RIGHT", "body": "[![request-change](https://img.shields.io/badge/request--change-D73A49)](https://pullpo.io/cc?l=request-change) **título** — corpo do comentário em PT-BR." },
    { "path": "...", "start_line": N, "line": M, "side": "RIGHT", "body": "[![praise](https://img.shields.io/badge/praise-22C55E)](https://pullpo.io/cc?l=praise) **título** — ..." }
  ]
}
```

Regras para montar o payload (conforme `review-legend.md` — Banner do badge):

- `event` **sempre** `COMMENT`. Nunca `APPROVE` nem `REQUEST_CHANGES` sem pedido explícito separado.
- Cada comentário usa `side: "RIGHT"`. Range multi-linha → `start_line` + `line`. Linha única → só `line`.
- **Validar os números de linha contra o diff real** antes de postar — os números no markdown do vault podem estar relativos a hunks ou desatualizados. Buscar a linha no novo arquivo (RIGHT side) procurando pelo trecho citado.
- **O `body` da review segue `${FLUX_ROOT}/shared/review-body-template.md`** (fonte única): veredito em negrito no topo, `### Placar dos findings` com a tabela de badges (incluindo os zeros), a linha da legenda, e as seções opcionais de destaque. **Não escrever o corpo em prosa solta.** O placar é **contado a partir do payload que você está postando**, nunca de memória.
- `praise` sobre arquivo inteiro novo (ex: `.changeset/*`) vai no `body` da review (não dá pra inline em "arquivo todo"), como seção com banner próprio, e entra no placar marcado como "no corpo".
- O `body` de cada comentário É o corpo do finding correspondente, que **já abre com o banner-imagem**
  (`[![{badge}]({img-url})]({link-url}) **título** — corpo`). **Confira que cada body começa com `[![`
  (imagem colorida), NUNCA com `[` sozinho (link de texto azul, sem cor — foi a regressão).** Banners
  prontos por badge em `review-legend.md`.
- **Sem em-dashes** nos textos publicados quando `NO_EMDASH == true` (regra global — usar vírgula, dois-pontos, parênteses).
- Se a PR está em repo cross-org sem acesso de escrita, capturar o erro do `gh api` e reportar ao usuário sem retentar.

Após `gh api` retornar sucesso (com `html_url` da review), responder no chat **só** com:

```
Review postada: {html_url}

{n} inline + {m} praise no corpo. Submetida como COMMENTED (não-bloqueante).
```

Se o usuário escolher "Não postar" ou cancelar a question, apenas terminar (sem mensagem extra).

#### 8c. Aplicar correções (modo PR própria)

Aplicar no working tree as correções **acionáveis** do review: `request-change` (obrigatórias), `breaking-change` (obrigatórias) e `suggestion`/`question` acionáveis (mudança concreta de código). **Pular** `praise` (elogios), `note` (notas internas) e itens que sejam só "considerar/avaliar" sem ação definida.

Regras:

- **Verificar antes de aplicar:** cada finding deve ser confirmado contra o código real. Se um item for improcedente na verificação, NÃO aplicar, e registrar no resumo final por que foi pulado. Se for uma decisão de design genuinamente ambígua (trade-off real), perguntar ao usuário em vez de chutar.
- **3-file gate:** se as correções tocarem **mais de 3 arquivos**, NÃO edite direto — delegue a um agente de implementação (`general-purpose` ou específico) com instruções precisas: arquivos, edições exatas, comandos de verificação e mensagem(ns) de commit. Para <= 3 arquivos, pode aplicar direto.
- **Verificação obrigatória** nos arquivos tocados, antes de commitar: typecheck + lint + os testes unitários afetados. Respeitar a versão de Node pinada do repo (`.nvmrc` via fnm/nvm) quando houver. Se algum gate falhar por motivo ambiental (registry/auth/deps faltando), confirmar que é idêntico ao baseline `main` e registrar; se falhar por causa da mudança, corrigir antes de commitar.
- **Commits semânticos:** Conventional Commits + emoji, PT-BR com acentuação correta. Agrupar por tema (um commit por finding ou por grupo coerente, a critério). Trailer **obrigatório** `Co-Authored-By: Claude <noreply@anthropic.com>` via HEREDOC. Se o repo tiver hook (husky/lint-staged) quebrado por ambiente, usar `--no-verify` e registrar o motivo.
- **Push:** só na opção 2 (Aplicar e dar push), e só na branch `headRefName` da PR (nunca `main`). Opção 1 deixa os commits locais.
- **Nunca** postar comentário, aprovar nem mergear neste modo.
- **Atualizar a descrição da PR** quando a correção mudar materialmente o que a PR faz (ex.: removeu/alterou algo descrito no corpo): editar via `gh pr edit $PR_NUMBER --repo $REPO_FULL --body-file <arquivo>`. Sem em-dashes quando `NO_EMDASH == true` (texto externo).

Resposta no chat ao final: tabela curta `{finding | aplicado/pulado | arquivos}`, depois `{commit(s) SHA, resultado da verificação, e range de push se houve}`. Sinalizar findings pulados (improcedentes/ambíguos) e o que precisa de decisão do usuário.

## Pipeline `doc` (review de documento / RFC)

Espelha o pipeline `pr` em estrutura (coletar → delegar → gravar → ofertar ação), mas o artefato é
um documento de prosa, não um diff. Out of scope (mesma disciplina do `pr`): nunca postar/editar no
Google Doc, nunca commitar/mexer em repo, exceto a etapa Bootstrap (que é opt-in e mira só o
repositório de suites do perfil, nunca o repo revisado). Escreve **apenas** o arquivo no vault.

### d1. Resolver o target e buscar o doc

Extrair o `docId` do URL (`docs.google.com/document/d/{docId}/...` ou `drive.google.com/.../d/{docId}`).

Buscar metadados e conteúdo via MCP de documentos, usando o prefixo `${MCP_DOCS}` resolvido do
manifesto (campo `mcp.docs` — ver `${FLUX_ROOT}/shared/flux-context.md`). Os nomes abaixo são os do
servidor de referência; num servidor diferente, localizar as tools daquele prefixo que atendem às
mesmas capacidades (metadados, conteúdo com comentários):

```
${MCP_DOCS}__get_file_metadata  { fileId: docId }
${MCP_DOCS}__read_file_content  { fileId: docId, includeComments: true }
```

Guardar: `DOC_TITLE`, `DOC_AUTHOR` (responsável, se aparecer no corpo/metadata), `DOC_UPDATED`
(última atualização), `DOC_TEXT` (conteúdo), `DOC_COMMENTS` (comentários já existentes — análogo às
threads de PR). Se a leitura falhar (sem acesso / mime não suportado), abortar com mensagem clara e
**não** gravar arquivo parcial.

**Detectar autoria (decide a seção de respostas e o menu do d8).** Guardar `IS_OWN_DOC` (bool):
`true` quando o e-mail/nome do usuário aparece como autor no corpo do doc (linhas do tipo "escrito
por", "autor", "responsável") **ou** quando ele é owner/writer do arquivo no Drive. Quando o corpo
não deixar claro, confirmar com:

```
${MCP_DOCS}__get_file_permissions  { fileId: docId }
```

Co-autoria conta como própria: se o usuário é um dos autores, `IS_OWN_DOC = true`. Na dúvida
irredutível, tratar como `true` (o custo de gerar respostas que ele não vai usar é baixo; o de omitir
é ele descobrir as threads na mão).

**Guardar `OPEN_THREADS`** = os `commentThreads` com `status: OPEN`, cada um com `{n, autor, texto
verbatim, trecho ancorado, commentId}`. O trecho ancorado sai dos marcadores
`<comment_start id=...>...<comment_end id=...>` do `DOC_TEXT`: casar o `id` com o `commentId` da
thread. Threads `RESOLVED` viram contexto (não repetir o ponto), não entram em `OPEN_THREADS`.

### d2. Rodadas anteriores (vault)

```bash
ls <VAULT_ROOT>/0-inbox/ | grep -E "flux-review-doc.*\.md$" | sort
```

Se houver review anterior do mesmo doc (mesmo `source_url` no frontmatter), ler a seção
`## Comentários de Review` e guardar como `PREV_REVIEW_COMMENTS` (instrução ao subagent: não repetir
findings já cobertos). Senão, `null`.

### d3. Detectar repos referenciados + checkouts locais

Varrer `DOC_TEXT` por sinais de repo: nomes de repo de `REPOS`, nomes de pacote correspondentes, e paths de arquivo reconhecíveis. Para cada repo detectado, resolver o checkout local (confirmar com `ls`). Guardar `REFERENCED_REPOS` = lista de `{slug, checkout_path|null}`.

Para cada repo com suite de specialists no ambiente e sem `--solo`, invocar o orquestrador de specialists correspondente (mesma mecânica do Step 4 do pipeline `pr`), passando os trechos do doc que falam daquele repo como `scope`, e guardar os `AGENT_REPORT`(s). Repos sem suite → sem enrichment; o subagent lê o checkout direto.

### d4. Delegar ao `<DOC_REVIEWER>`

Use a Task tool com `subagent_type: <DOC_REVIEWER>`, passando:
- `DOC_TEXT`, metadados (`DOC_TITLE`, `DOC_AUTHOR`, `DOC_UPDATED`, URL)
- `DOC_COMMENTS` (comentários existentes — não repetir pontos já levantados)
- `OPEN_THREADS` + `IS_OWN_DOC`
- `PREV_REVIEW_COMMENTS`
- `REFERENCED_REPOS` com os checkout paths (instrução: verificar toda afirmação de código contra o arquivo real)
- `AGENT_REPORT`(s) quando houver (como evidência, não verdade cega)

O subagent retorna `SUMARIO`, `COMENTARIOS` (cada um com **Trecho no doc** + **Comentário**, ancorado
em `§seção "trecho verbatim"`), `CHECKLIST`, `VEREDITO`, `STATUS`, `PRIORIDADE`, `TLDR`, `RESUMO_EXEC`.
Guardar como `FINAL_REPORT`. Se o output vier mal formatado, mostrar o erro e não gravar.

**Instruções obrigatórias ao subagent (as três vêm das disciplinas de amarração e ações do template):**

1. **Amarrar todo finding ao trecho**, conforme a seção "Amarração de trechos" do
   `review-artifact-template.md`: trecho verbatim curto no header, trecho completo no campo
   `Trecho no doc:`, verbatim de verdade (inclusive erros de grafia, que é o que torna o ponto
   localizável por Ctrl+F no Doc). Finding sem trecho amarrado é output mal formatado, rejeitar.
2. **Findings enxutos:** cada finding carrega o problema, a evidência e o link para a ação que o
   resolve (campo `Achado:` na ação correspondente). Não incluir ficha de edição nem texto de resposta
   dentro do finding — isso vai nas ações.
3. **Quando `IS_OWN_DOC == true`, retornar `ACOES`** no formato exato da seção
   `## ⚡ Ações no documento` do `review-artifact-template.md` (vocabulário fechado `SUBSTITUIR` /
   `ACRESCENTAR` / `DELETAR` / `RESPONDER` / `PERGUNTAR`; numeração contínua; ordem de execução:
   edições antes das respostas que elas sustentam; `Depende de` em toda `RESPONDER`; `Inserir` sempre
   em texto final colável, nunca em forma de instrução; cobertura total: toda thread de `OPEN_THREADS`
   tem sua `RESPONDER`, inclusive as sem resposta boa ainda — essas viram `Veredito: precisa de dado
   que não tenho`). Ação sem campo `Achado:`, finding acionável sem ação correspondente, thread `OPEN`
   sem `RESPONDER`, ou `Inserir` em forma de instrução são output mal formatado: rejeitar e pedir de
   novo. Se `IS_OWN_DOC == false`, não gerar `ACOES`.

### d5. Computar nome do arquivo

- Slug do doc = título em kebab-case (sem stopwords longas).
- Filename: `YYYY-MM-DD-HHMM-flux-review-doc-{slug}.md` (HHMM da hora local).
- Re-runs no mesmo doc/dia: sufixar `-v2`, `-v3`.
- Path: `<VAULT_ROOT>/0-inbox/{filename}`.

### d6. Renderizar template e gravar

Montar o artefato seguindo o **perfil doc** de `${FLUX_ROOT}/shared/review-artifact-template.md`
— mesma espinha visual do perfil PR (metadados linkados, 🎯 Veredito → 📊 Painel de findings →
⚡ Ações no documento (quando `IS_OWN_DOC == true`) → 🔎 Findings → 📎 Escopo → ✅ Ação → 🔗 Cobertura),
adaptada a documento:

- Âncora de cada finding é `§seção "trecho verbatim"` (não `arquivo:linha`), nos **três** lugares que
  a seção "Amarração de trechos" do template exige (header, campo `Trecho no doc:`, coluna `local` do
  painel). Sem `head_sha`/permalink de código; quando o doc afirmar algo sobre um repo, linkar o
  permalink no branch default do repo citado.
- Frontmatter: `type: doc-review`, `source_url` (no lugar de `pr_url`/`head_sha`), `execution_status: open`,
  `own_doc`, `counts`, `actions: {N}` (quando `IS_OWN_DOC == true`), `status` (vocabulário novo),
  `parent: "[[_index]]"`.
- `## 📎 Escopo` vira "Repos referenciados" (lista linkada). Manter `## TL;DR` e `## Resumo Executivo`
  ao final (seções próprias do doc-review).
- **Quando `IS_OWN_DOC == true`: gravar `## ⚡ Ações no documento`** logo após o painel e antes de
  `## 🔎 Findings`, preenchida com o `ACOES` retornado pelo subagent (seção d4). É obrigatória, não
  opt-in. Se `OPEN_THREADS` estiver vazio e não houver ação de edição, a seção entra com a linha
  "Nenhuma ação pendente." (para o leitor saber que foi verificado, não esquecido). Findings ficam
  enxutos: problema + evidência + link `[[#fN · rótulo|fN]]` para a ação que resolve. Sem ficha de
  edição nem texto de resposta dentro do finding.
- Quando `IS_OWN_DOC == false`: sem seção `⚡ Ações no documento`. Sugestões ficam em prosa nos findings.
- Disciplina de links, regra de ouro do painel, regras de escrita e tradução de STATUS: todas no template.

Gravar com a Write tool no path calculado (Step d5).

### d7. Resposta no chat

```
Review do doc salvo em {caminho-completo}.

Veredito: {STATUS} — {1 frase do veredito}.
```

Não repetir o conteúdo do review no chat. O arquivo é a fonte de verdade.

### d8. Ação pós-review (doc)

Documentos não aceitam comentário inline via API neste fluxo. Após gravar, oferecer via
GATE (`${FLUX_ROOT}/shared/hitl.md`), single-select. **O menu muda conforme `IS_OWN_DOC`**, porque em doc próprio o
artefato já traz as ações e as réplicas prontas na seção `⚡ Ações no documento` — gerar um bloco
separado para colar seria redundante.

#### d8a. Doc próprio (`IS_OWN_DOC == true`)

- **Header:** `Ação no doc?`
- **Question:** `O review de "{DOC_TITLE}" está no vault com as ações prontas. O que fazer a seguir?`
- **Options (nessa ordem):**
  1. `Criar issues no Linear a partir dos blockers (Recomendado)` — para cada `request-change` e
     `breaking-change` com ação correspondente, abre uma issue no Linear (projeto/time do perfil
     resolvido) com o título do finding, a ação exata como descrição e o link do vault. Não altera o
     doc. **Só é oferecida quando `LINEAR_ORG` está declarado no perfil**; sem ele, cai direto na
     opção 2.
  2. `Não fazer nada agora` — o artefato fica no vault; as ações e réplicas estão lá quando precisar.

#### d8b. Doc de terceiros (`IS_OWN_DOC == false`)

- **Header:** `Ação no doc?`
- **Question:** `O que fazer com os comentários do review de "{DOC_TITLE}"?`
- **Options (nessa ordem):**
  1. `Gerar bloco "comentários para colar no Doc" (Recomendado)` — anexa ao final do arquivo do
     vault um bloco com os `request-change` + `breaking-change` + `question` + `praise` formatados
     para colar manualmente no Google Doc (cada um com o trecho a marcar). Não posta nada.
  2. `Não fazer nada` — review fica só no vault.

Em seguida (independente da escolha), seguir para a etapa **Bootstrap de repo-owner** se algum repo
referenciado não tiver suite no ambiente.

## Bootstrap de specialists (repo sem suite local)

Acionada em **qualquer verbo**, depois de gravar o artefato, quando **L2 está ausente** para o repo.

Contrato completo (quando oferecer, como a oferta é redigida, o que a suite contém):
`${FLUX_ROOT}/shared/bootstrap-specialists.md`. **Não duplicar a lógica aqui.**

**Aceitar a oferta dispara `${FLUX_CMD}equip <repo> --agents-only`**, que é quem de fato gera: os
gates de destino de escrita e de manifesto vivem lá, num verbo só, em vez de espalhados por quatro
elos. O review oferece e sai da frente.

Ponto que o review não pode esquecer: a suite gerada é **L2, fora do repositório**. Se o repo já tem
agents de review próprios, eles são L3, já entraram na review por descoberta, e o `equip` não os
toca.

## Notas finais

- Sempre PT-BR com acentuação correta no conteúdo do review (frontmatter pode ficar em inglês onde já era padrão: `type`, `status`)
- Sem em-dashes (—) em qualquer texto que o usuário possa colar/postar quando `NO_EMDASH == true`
- Se o subagent retornar erro ou output mal formatado, mostre o erro e **não** grave arquivo parcial
- Se faltar `gh` autenticado (pipelines `pr` e Bootstrap), peça ao usuário pra rodar `gh auth login` e aborte
- Se o Drive MCP não estiver disponível/autenticado (pipeline `doc`), avise e aborte sem gravar parcial
