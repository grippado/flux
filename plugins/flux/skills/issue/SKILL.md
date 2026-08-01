---
name: issue
description: Orquestrador `flux:issue` — gera issues de alta qualidade a partir de QUALQUER fonte (thread do Slack, texto livre, PR), embasadas em código real via os specialists do repo (o mesmo arsenal do review/iterate/delivery), com disciplina de links e escrita correta. Grava um rascunho revisável no vault e cria no Linear só após aprovação (HITL). Global, resolve contexto via `flux-context.md`.
user-invocable: true
---

# /flux:issue

Transforma um pedido (de onde vier) numa issue o mais próxima da perfeição: título e descrição no
padrão do time, **embasamento em código real** (achados dos specialists com `arquivo:linha` linkado),
labels certas, e a disciplina de links do flux. Nunca cria no Linear sem você aprovar.

**Formato canônico da issue:** `${FLUX_ROOT}/shared/issue-template.md`
**Descoberta + fan-out de specialists:** `${FLUX_ROOT}/shared/review-agents.md`
**Disciplina de fan-out (regra pétrea da família):** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Mecânica Linear (não reimplementar):** `LINEAR_OPS` do perfil (campo `linear_ops` do manifesto)

## Out of scope (nunca sem confirmação explícita)

- Não criar issue no Linear antes do gate de aprovação (Step 5). O único destino de escrita antes disso
  é o rascunho no vault.
- Não commitar, não mexer em repo, não postar em Slack/GitHub. O comando é leitura + rascunho + (após
  aprovar) criação de issue.

## Step 0-context: resolver perfil

Seguir `${FLUX_ROOT}/shared/flux-context.md`. Extrair: `HOLISTIC`, `SPECIALISTS_ROOT`,
`REPOS`, `VAULT_ROOT`, `VAULT_CTX`, `NO_EMDASH`, `LINEAR_ORG` (org do Linear), `LINEAR_OPS` (path do
doc de mecânica Linear do perfil; opcional) e os agentes de prospecção (`slack_prospector` quando a
fonte é Slack). Sem manifesto: perfil genérico (holístico `pr-reviewer`, sem persistência automática,
sem Linear).

## Step 1 — Resolver a fonte (qualquer)

Detectar pelo argumento e colher o **pedido** + os **repos/temas** envolvidos:

- **Permalink do Slack** (`https://<ws>.slack.com/archives/<CH>/p<DIGITS>[?thread_ts=...]`): reusar o
  Step 1/3 do `${FLUX_ROOT}/commands/flux/reply.md` — decompor a URL, `slack_read_thread`, e
  varrer o texto por repos citados (contra `REPOS`), PRs (`#\d+`), tickets (`[A-Z]{2,5}-\d+`) e os
  claims/pedidos. O pedido central = o que a thread está pedindo pra fazer.
- **PR (número/URL)**: `gh pr view <n> --json title,body,files,url,headRefOid` + `gh pr diff <n>` pra
  contexto; o pedido = o gap/follow-up que a PR sugere.
- **Texto livre / path / doc**: usar como o pedido diretamente; extrair repos/símbolos citados.

Guardar `SOURCE` (o permalink/url/texto), `REQUEST` (o pedido), `TARGET_REPOS` (repos envolvidos).
Se nenhum repo for identificável, perguntar ao usuário qual repo é o alvo (não chutar).

## Step 2 — Prospecção embasada em código (o diferencial)

Para cada repo em `TARGET_REPOS`, disparar os specialists seguindo o contrato de
`${FLUX_ROOT}/shared/review-agents.md` (descoberta via `SPECIALISTS_ROOT`/`repo-owner`, fan-out
paralelo via Task tool). Instrução aos agentes: **investigar o código real** relativo ao `REQUEST` e
devolver achados no contrato do prospector:

```
Veredito: confirma | refuta | parcial | sem-evidência
Evidência: {caminho/arquivo.ts:linha, função, PR#, commit} — obrigatório em confirma/refuta/parcial
```

- Fonte Slack: preferir o `slack_prospector` do perfil, um por repo.
- Sem specialists/prospector no repo: degradar pro `HOLISTIC`, avisar no chat, seguir (não travar).
- Montar os permalinks: `https://github.com/{owner}/{repo}/blob/{HEAD_SHA-ou-branch-default}/{path}#L{n}`
  (com PR, usar o `headRefOid`; senão o branch default do repo).

Guardar `FINDINGS` = os achados consolidados por repo, cada um com evidência linkável.

## Step 3 — Sintetizar a(s) issue(s)

Montar seguindo o **`issue-template.md`** (formato to-issue enriquecido):

- **Título:** `[contexto]: [verbo] [assunto]`, PT-BR, sem em-dash.
- **Tipo:** inferir (Feature/Bug/Improvement/Spike) do `REQUEST`.
- **Descrição:** as seções do tipo + a seção obrigatória `## Embasamento no código` (os `FINDINGS`, cada
  achado com `arquivo:linha` como **permalink** e o veredito). Ancorar "O que fazer" e "Critério de
  aceite" nos achados. Aplicar a disciplina de links e as regras de escrita do template.
- **Labels propostas:** tipo + `Application` (repo) + `Agent autonomy` (AFK/HITL) + prioridade 1-4 se
  o pedido indicar urgência (ver `LINEAR-OPS.md`).
- **Decomposição:** se o pedido tem ≥2 ACs independentes ou toca >1 repo, decompor em vertical slices
  (1 repo por issue, blockers primeiro), conforme o template.

## Step 4 — Gravar rascunho no vault

Gravar `<VAULT_ROOT>/linear/YYYY-MM-DD-<slug>.md` com o frontmatter de `issue-draft` (ver
`issue-template.md`: `source`, `repos`, `labels_propostas`, `linear_ids: []`, `pending_organize: true`)
e o corpo com a(s) issue(s) já formatadas. Anunciar o path no chat.

Sem `VAULT_ROOT` (perfil genérico): imprimir o rascunho no chat em vez de gravar.

## Step 5 — HITL (gate de aprovação)

Mostrar a prévia via `AskUserQuestion` (single-select): título(s), tipo, labels, prioridade, e um
resumo de 2-3 linhas da descrição. Opções:

1. `Criar no Linear (Recomendado)` — cria a(s) issue(s) conforme o rascunho.
2. `Editar antes` — o usuário aponta ajustes; reeditar o rascunho e reperguntar.
3. `Só o rascunho, não criar` — fica no vault, nada no Linear.

Só seguir pro Step 6 na opção 1.

## Step 6 — Criar no Linear

Quando o perfil declara `LINEAR_OPS`, **ler esse doc antes** e seguir a mecânica dele (cache de
team/project em `.claude/cache/`, team routing inferido do contexto, nunca hardcoded). Sem
`LINEAR_OPS`, resolver team e project pelos MCP tools do Linear e confirmar com o usuário antes de criar. Criar via os
MCP tools do Linear (`save_issue` e afins), aplicando labels, prioridade e — em decomposição — criando
os **blockers primeiro** para ter IDs reais nos `blockedByIds`. `assignee: "me"`.

Ao final: registrar os `linear_ids` + URLs de volta no rascunho do vault (campo `linear_ids`) e
responder no chat só com os identificadores/links criados. Se a criação falhar (sem MCP, sem
permissão), avisar e manter o rascunho intacto no vault para retry manual.

## Notas

- PT-BR com acentuação correta. Sem em-dash quando `NO_EMDASH == true` (o Linear é destino externo).
- O embasamento em código é o que dá qualidade: uma issue sem nenhum achado `confirma`/`parcial` é
  sinal de que faltou investigação — avisar e sugerir apontar o repo/arquivo antes de criar.
- Fecha o ciclo da família: `flux:issue` **abre** o trabalho (issue), `flux:review`/`iterate`/`delivery`
  **fecham** (review → merge).
