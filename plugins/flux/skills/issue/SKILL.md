---
name: issue
description: "Orquestrador `flux:issue` — gera issues de alta qualidade a partir de QUALQUER fonte (thread do Slack, texto livre, PR), embasadas em código real via os specialists do repo (o mesmo arsenal do review/iterate/delivery), com disciplina de links e escrita correta. Grava um rascunho revisável no vault e cria no Linear só após aprovação (HITL). Global, resolve contexto via `flux-context.md`."
user-invocable: true
---

# /flux:issue

Transforma um pedido (de onde vier) numa issue o mais próxima da perfeição: título e descrição no
padrão do time, **embasamento em código real** (achados dos specialists com `arquivo:linha` linkado),
labels certas, e a disciplina de links do flux. Nunca cria no Linear sem você aprovar.

**Formato canônico da issue:** `${FLUX_ROOT}/shared/issue-template.md`
**Formato do board:** `${FLUX_ROOT}/shared/board-template.md`, **perfil exploração** (`type: issue-draft`).
As seções, a legenda de ícones e a disciplina de carimbo de data vivem lá e não são repetidas aqui.
**Descoberta + fan-out de specialists:** `${FLUX_ROOT}/shared/review-agents.md`
**Disciplina de fan-out (regra pétrea da família):** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Mecânica Linear (não reimplementar):** `LINEAR_OPS` do perfil (campo `linear_ops` do manifesto)

## Out of scope (nunca sem confirmação explícita)

- Não criar issue no Linear antes do gate de aprovação (Step 5). O único destino de escrita antes disso
  é o board no vault.
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
  Step 1/3 do `${FLUX_ROOT}/skills/reply/SKILL.md` — decompor a URL, `slack_read_thread`, e
  varrer o texto por repos citados (contra `REPOS`), PRs (`#\d+`), tickets (`[A-Z]{2,5}-\d+`) e os
  claims/pedidos. O pedido central = o que a thread está pedindo pra fazer.
- **PR (número/URL)**: `gh pr view <n> --json title,body,files,url,headRefOid` + `gh pr diff <n>` pra
  contexto; o pedido = o gap/follow-up que a PR sugere.
- **Texto livre / path / doc**: usar como o pedido diretamente; extrair repos/símbolos citados.

Guardar `SOURCE` (o permalink/url/texto), `REQUEST` (o pedido), `TARGET_REPOS` (repos envolvidos).
Se nenhum repo for identificável, perguntar ao usuário qual repo é o alvo (não chutar).

## Step 1-bis — Resolver o board antes de criar (SEMPRE)

**Sem `VAULT_ROOT`** (perfil genérico): não há onde procurar nem o que retomar — pular direto para o
Step 1-ter, que trata a degradação.

Com `VAULT_ROOT` resolvido, procurar em `<VAULT_ROOT>/linear/` um board `type: issue-draft` cujo campo
`source:` case com o `SOURCE`. Casou → é **este** o board, atualiza. Não casou → board novo no Step 1-ter.

**Como casar, por tipo de fonte:**

- **Permalink do Slack / URL de PR**: comparação **exata** da URL, descartando query string e o
  `?thread_ts=` (o mesmo alvo copiado duas vezes pode trazer parâmetros diferentes).
- **Texto livre**: o `source:` gravado é o texto cru; o match é pelo **slug normalizado** dos dois lados
  (minúsculas, sem acento, pontuação virando hífen, kebab-case ASCII). Bateu o slug → é o mesmo pedido.
- **Casou parcialmente** (mesmo repo e tema, slug diferente; ou mais de um candidato): **perguntar via
  `AskUserQuestion`** qual board retomar, ou se é pedido novo. Nunca escolher por proximidade de data.

**Nunca criar um segundo board para um pedido que já tem um.** O mesmo pedido rodado duas vezes tem que
convergir num rascunho só; dois arquivos concorrentes da mesma issue é exatamente o problema que o board
existe para evitar. Na dúvida entre dois candidatos, perguntar via `AskUserQuestion` em vez de chutar.
Retomando um board existente, **consultar a 🔬 Achados de codebase antes de reprospectar**: o que já foi
verificado (inclusive o que foi refutado) continua valendo e não precisa de subagente de novo.

**Achar o board de origem (`ORIGIN_BOARD`).** Se o pedido veio de um caso do `/flux:reply`, o path do
board de conversa vira `origin_board:` no frontmatter, fechando o cross-link que o board de conversa
registra no forward. Quando o `/flux:issue` é chamado direto com um permalink do Slack, esse vínculo não
chega pronto: procurar também em `<VAULT_ROOT>/0-inbox/` um board `type: thread` cujo
`surfaces[].channel_id` (+ `thread_ts`, quando houver) case com o alvo — é o mesmo grep que o
`/flux:reply` faz para reencontrar um caso. Achou → é o `ORIGIN_BOARD`, e a 🔬 Achados dele é dossiê
pronto, que **não** precisa ser reprospectado. Não achou → sem `origin_board`, segue normal.

## Step 1-ter — Abrir o board de exploração (antes do fan-out)

**Gatilho:** havendo prospecção, ou seja, sempre que `TARGET_REPOS` não estiver vazio. Pedido sem repo
alvo identificável não dispara specialist e não gera board.

Abrir o board **antes** de disparar os prospectors do Step 2 — **criar**, se o Step 1-bis não achou
nenhum; **retomar** o que ele achou, se achou — seguindo o **perfil exploração** de
`${FLUX_ROOT}/shared/board-template.md`, e **anunciar o path no chat**.

> **Por que antes.** O fan-out roda em N subagentes por muitos minutos e o retorno estruturado é a
> primeira e única notícia. Se um prospector travar ou voltar vazio, um board que nascesse depois não
> teria rastro de onde parou. Board que nasce depois do trabalho é ata, não board.

1. **Caminho:** o board resolvido no Step 1-bis; ou, sendo novo, `<VAULT_ROOT>/linear/YYYY-MM-DD-<slug>.md`.
   Path já ocupado por um board de **outro** `source` (slugs diferentes que colidiram): sufixar `-2`,
   `-3`. Nunca sobrescrever board de outro pedido.
2. **Nasce com:** frontmatter (`execution_status: active`, `source`, `repos`, `linear_ids: []`,
   `origin_board` quando houver), TLDR com o `REQUEST` em uma frase, 🎯 Próximo Movimento apontando para
   a prospecção, e o painel com **uma linha `🔧 APURANDO` por repo** de `TARGET_REPOS` — as candidatas
   ainda não existem, o que existe é a apuração. Linha na Timeline de Eventos, tipo `prospecção`.
   **Retomando um board:** não recriar o cabeçalho; rolar o carimbo de data, abrir
   `### Sessão de <data>` na Timeline Verbosa e reabrir as linhas de apuração que forem refeitas.
3. **Sem `VAULT_ROOT`** (perfil genérico): não há board; tudo sai no chat, como antes. É capacidade que
   degrada, não requisito — declarar a perda no banner de perfil e seguir.
4. **Escritor único:** o `/flux:issue` não tem watch, então **não existe board-keeper** — a main escreve
   direto, como no `--once` do iterate. Nenhum subagente escreve neste arquivo
   (`${FLUX_ROOT}/shared/fanout-discipline.md`).

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

**Fan-in no board, conforme cada repo retorna** (não no fim de todos): gravar os achados **inteiros** na
seção 🔬 Achados de codebase — inclusive os `refuta` e `sem-evidência`, que não vão para a issue mas são
o que evita reprospectar a mesma hipótese no próximo run. Cada retorno vira linha na Timeline de Eventos
(tipo `prospecção`).

**As linhas de apuração dão lugar às candidatas.** A linha `🔧 APURANDO` de um repo é provisória: ela
existe para tornar o fan-out observável, e some quando aquele repo produz candidatas (Step 3). O
desfecho por repo:

- **Voltou com achados** → a linha some e é substituída pelas candidatas que aquele repo gerou.
- **Voltou vazio** (nenhum achado utilizável) → a linha vira `⚪ DESCARTADA`, motivo `sem achados`, e a
  ausência fica registrada na 🔬 Achados. Nenhuma candidata nasce daquele repo.
- **Falhou** (subagente morreu, sem checkout, sem permissão) → a linha vira `🔒 BLOQUEIA` com a causa, e
  reprospectar aquele repo vira item do 🎯 Próximo Movimento. Falha não é "sem achados": confundir as
  duas faz a issue nascer achando que investigou o que não investigou.

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

**Cada slice vira uma linha do painel** (`🟡 RASCUNHADA`), com a coluna **Embasamento** contada dos
achados que sustentam **aquela** candidata (`✔ ◐ ✘ ?`) e `Linear: n/d`. Abaixo da tabela, a ordem de
criação e o grafo de bloqueio entre as candidatas. Candidata cujo pedido depende de decisão humana para
não nascer errada entra como `🔒 BLOQUEIA`, com a pergunta explícita no 🎯 Próximo Movimento.

## Step 4 — Consolidar o board

Escrever a seção **📝 Rascunho da issue** com a(s) issue(s) já formatadas (uma subseção por candidata) e
rolar o carimbo de data (frontmatter `updated:`, TLDR, título do painel). Frontmatter, naming e ciclo de
vida seguem o perfil exploração do `board-template.md` — não redefinir aqui.

Sem `VAULT_ROOT` (perfil genérico): imprimir o rascunho no chat, sem board.

## Step 5 — HITL (gate de aprovação)

Mostrar a prévia via `AskUserQuestion` (single-select): título(s), tipo, labels, prioridade, e um
resumo de 2-3 linhas da descrição. Opções:

1. `Criar no Linear (Recomendado)` — cria a(s) issue(s) conforme o rascunho.
2. `Editar antes` — o usuário aponta ajustes; reeditar o rascunho e reperguntar.
3. `Só o rascunho, não criar` — fica no vault, nada no Linear.

Só seguir pro Step 6 na opção 1.

**Cada rodada deixa rastro no board**, e é isto que o board acrescenta a este gate:

- **Opção 2:** a versão nova do corpo entra como `#### v<N+1>` na 📝 Rascunho da issue, com o motivo do
  ajuste; a anterior fica colapsada, nunca sobrescrita. Linha na Timeline de Eventos (tipo `decisão`) e
  🎯 Próximo Movimento reescrito. Candidata que o usuário mandou tirar vira `⚪ DESCARTADA` com o motivo
  (tipo `candidata`), e a subseção dela permanece.
- **Opção 3:** `execution_status: open` (o rascunho segue vivo, pode virar issue depois), candidatas
  ficam em `🟡 RASCUNHADA` e o "criar no Linear" vira item do ✅ Ação / Continuidade.
- **Opção 1:** candidatas aprovadas vão para `🟢 APROVADA` antes de o Step 6 rodar — assim, se a criação
  falhar no meio, o board já registra o que tinha sinal verde.

## Step 6 — Criar no Linear

Quando o perfil declara `LINEAR_OPS`, **ler esse doc antes** e seguir a mecânica dele (cache de
team/project em `.claude/cache/`, team routing inferido do contexto, nunca hardcoded). Sem
`LINEAR_OPS`, resolver team e project pelos MCP tools do Linear e confirmar com o usuário antes de criar. Criar via os
MCP tools do Linear (`save_issue` e afins), aplicando labels, prioridade e — em decomposição — criando
os **blockers primeiro** para ter IDs reais nos `blockedByIds`. `assignee: "me"`.

**Fechar o board** (é o passo que encerra o ciclo de vida da nota):

- `linear_ids:` preenchido com os identificadores criados; cada candidata vai para `🟣 CRIADA` com o
  identificador **linkado** na coluna `Linear`, e a subseção dela na 📝 Rascunho da issue ganha o mesmo
  link no cabeçalho. Linha na Timeline de Eventos, tipo `linear`.
- `execution_status: done` — é o campo de estado canônico do vault (ADR-014, `fields.execution_status`
  no `note-schema.json`), o mesmo que os boards de `/flux:reply`, `/flux:build` e `/flux:review` já
  usam. Aqui ele fecha exatamente no gatilho que o schema declara para o `issue-draft`:
  `done_when: "issue criada no Linear a partir do rascunho"`.
- **Handoff forward:** o 🎯 Próximo Movimento final aponta para `/flux:build <repo> <TICKET>`, com o
  ticket linkado. É o elo seguinte da família: `issue` abre o trabalho, `build` executa,
  `review`/`iterate`/`land` fecham.
- **Criação falhou** (sem MCP, sem permissão): board intacto, `execution_status` segue `active`, as
  candidatas ficam em `🟢 APROVADA` e o retry manual vira item do ✅ Ação / Continuidade. Nunca gravar
  identificador que não foi confirmado pela API.
- **Criação parcial** (a candidata #1 nasceu, a #2 falhou — o caso comum em decomposição, porque os
  blockers são criados primeiro): **o board fecha pelo pior caso**. `execution_status` segue `active`,
  não `done`: o lifecycle do `issue-draft` fecha quando a issue **do rascunho** existe, e ela ainda não
  existe inteira. `linear_ids` leva só os identificadores confirmados; a #1 vai para `🟣 CRIADA` com o
  link, a #2 fica em `🟢 APROVADA` com a causa da falha no veredito, e o retry só dela vira o primeiro
  item do 🎯 Próximo Movimento. **Atenção ao `blockedByIds`:** candidata que dependia de uma issue que
  não nasceu não pode ser criada no retry sem antes recriar o blocker, senão o vínculo se perde em
  silêncio.

Responder no chat só com os identificadores/links criados e o path do board.

## Notas

- PT-BR com acentuação correta. Sem em-dash quando `NO_EMDASH == true` (o Linear é destino externo).
- O embasamento em código é o que dá qualidade: uma issue sem nenhum achado `confirma`/`parcial` é
  sinal de que faltou investigação — avisar e sugerir apontar o repo/arquivo antes de criar. No board
  isso não é só uma nota de rodapé: aparece como `✔0 ◐0` na coluna **Embasamento** daquela candidata.
- O board é doc interno do vault (travessão liberado lá); a proibição de em-dash vale para o que vai
  ao Linear. Timeline em horário local.
- Fecha o ciclo da família: `flux:issue` **abre** o trabalho (issue), `flux:review`/`iterate`/`delivery`
  **fecham** (review → merge).
