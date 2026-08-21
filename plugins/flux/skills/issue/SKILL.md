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
**Formato do board:** `${FLUX_ROOT}/shared/board-template.md`, **perfil exploração** (`type: flux-issue`).
As seções, a legenda de ícones e a disciplina de carimbo de data vivem lá e não são repetidas aqui.
**Descoberta + fan-out de specialists:** `${FLUX_ROOT}/shared/review-agents.md`
**Agente de criação no tracker (Step 6):** `issue-creator`, resolvido pela cascata
`flux:issue-creator` → `flux-issue-creator` → `issue-creator`, conforme a instalação. Ausente: a main
cria inline e **declara a degradação no banner** (perde-se o paralelismo e a economia de contexto, não
a capacidade).
**Disciplina de fan-out (regra pétrea da família):** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Mecânica Linear (não reimplementar):** `LINEAR_OPS` do perfil (campo `linear_ops` do manifesto)

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
specialists: {lista|nenhum}
degradacoes: {soft ausentes e o que se perde com cada um | nenhuma}
```
````

Abortagem segue o gabarito do "Formato da mensagem de abortagem" do preflight, também verbatim, e o
nome do elo na primeira linha usa `${FLUX_CMD}` já substituído (`/flux:issue` num harness,
`/flux-issue` em outro) — nunca `flux:` literal.

## Out of scope (nunca sem confirmação explícita)

- Não criar issue no Linear antes do gate de aprovação (Step 5). O único destino de escrita antes disso
  é o board no vault.
- Não commitar, não mexer em repo, não postar em Slack/GitHub. O comando é leitura + rascunho + (após
  aprovar) criação de issue.

## Step 0-context: resolver perfil

Seguir `${FLUX_ROOT}/shared/flux-context.md`. Extrair: `HOLISTIC`, `SPECIALISTS_ROOT`,
`REPOS`, `VAULT_ROOT` (raiz compartilhada, onde fica o `0-inbox/`), `VAULT_CTX`,
`VAULT_CTX_ROOT` (raiz do contexto, onde o eixo por tipo vive; só leitura, ausente → `VAULT_ROOT`),
`NO_EMDASH`, `LINEAR_ORG` (org do Linear), `LINEAR_OPS` (path do
doc de mecânica Linear do perfil; opcional), `LINEAR_TOKEN_ENV` (campo `linear_token_env`; nome da
variável com o token da API, default `LINEAR_API_KEY`), `SECRETS_FILE` (campo `secrets_file`, default
`~/.secrets`) e os agentes de prospecção (`slack_prospector` quando a
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

Com `VAULT_ROOT` resolvido, procurar um board `type: flux-issue` cujo campo `source:` case com o
`SOURCE`, nos **dois** lugares onde ele pode estar: `<VAULT_ROOT>/0-inbox/`, se ainda não foi triado, e
`<VAULT_CTX_ROOT>/linear/`, se o `/organize` já o promoveu. Casou → é **este** o board, atualiza (mesmo
estando na pasta promovida: atualizar nota que já existe é escrita legítima fora do inbox). Não casou →
board novo no Step 1-ter.

> Procurar só no inbox é como não procurar: board de pedido antigo já foi promovido, sairia da busca, e
> o mesmo pedido ganharia um segundo rascunho concorrente — exatamente o que o Step 1-bis existe para
> impedir.

**Como casar, por tipo de fonte:**

- **Permalink do Slack / URL de PR**: comparação **exata** da URL, descartando query string e o
  `?thread_ts=` (o mesmo alvo copiado duas vezes pode trazer parâmetros diferentes).
- **Texto livre**: o `source:` gravado é o texto cru; o match é pelo **slug normalizado** dos dois lados
  (minúsculas, sem acento, pontuação virando hífen, kebab-case ASCII). Bateu o slug → é o mesmo pedido.
- **Casou parcialmente** (mesmo repo e tema, slug diferente; ou mais de um candidato): **abrir um GATE**
  (`${FLUX_ROOT}/shared/hitl.md`) perguntando qual board retomar, ou se é pedido novo. Nunca escolher por proximidade de data.

**Nunca criar um segundo board para um pedido que já tem um.** O mesmo pedido rodado duas vezes tem que
convergir num rascunho só; dois arquivos concorrentes da mesma issue é exatamente o problema que o board
existe para evitar. Na dúvida entre dois candidatos, abrir um GATE (`${FLUX_ROOT}/shared/hitl.md`) em vez de chutar.
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

1. **Caminho:** o board resolvido no Step 1-bis; ou, sendo novo, `<VAULT_ROOT>/0-inbox/YYYY-MM-DD-HHMM-flux-issue-<slug>.md`.
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
- **Labels propostas:** tipo + `Application` (repo) + **autonomia de agente (AFK/HITL)** + prioridade
  1-4 se o pedido indicar urgência (ver `LINEAR-OPS.md`).

#### Autonomia de agente (AFK/HITL) — obrigatória em toda issue

**Toda candidata recebe a classificação, sem exceção.** É a informação que decide se a issue pode ser
despachada para um `/flux:build` sem ninguém olhando ou se ela vai parar esperando um humano, e uma
issue sem ela obriga a redescobrir isso na hora de executar, que é o pior momento.

Critério, e ele é binário de propósito:

- **AFK** — os critérios de aceite são verificáveis por teste ou por comando, e a issue **não** exige
  desenho visual novo, decisão em aberto, nem julgamento sobre texto em linguagem natural. Um agente
  leva do início ao fim e o humano só revisa o resultado.
- **HITL** — em algum ponto é preciso julgamento humano: desenho de UI novo, uma decisão que a própria
  issue declara em aberto (toda issue com `needs-decision` é HITL por construção), interpretação de uma
  medição, ou revisão de conteúdo redigido (tradução, copy).

**Como achar o label, nesta ordem.** O nome do grupo varia entre workspaces e não pode ser hardcoded:

1. Um **grupo de labels** cujos filhos sejam exatamente um par do tipo AFK/HITL. Casar pelos **filhos**,
   não pelo nome do grupo, é o que sobrevive a o grupo se chamar `AI Operation`, `Agent autonomy`,
   `Autonomia` ou qualquer outra coisa.
2. Não havendo grupo, labels soltos cujos nomes sejam `AFK` e `HITL` (ou equivalentes evidentes:
   `autonomous`/`supervised`, `unattended`/`attended`).

**Degradação graciosa, e ela é obrigatória.** Não achou nem grupo nem par solto: **seguir criando a
issue sem esse label**. Não criar o label, não inventar um nome parecido, não travar a criação, e não
perguntar ao usuário no meio do fan-out. Registrar a ausência uma única vez, no banner de perfil e no
board, com a forma:

```
degradacoes: sem label de autonomia AFK/HITL no workspace (issues nascem sem a classificação)
```

A classificação em si continua sendo feita e **fica escrita no corpo da issue**, mesmo sem label. O que
degrada é a etiqueta, não o julgamento.
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

Mostrar a prévia num GATE (`${FLUX_ROOT}/shared/hitl.md`), single-select: título(s), tipo, labels, prioridade, e um
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

## Step 6 — Criar no Linear (fan-out, um agente por candidata)

Quando o perfil declara `LINEAR_OPS`, **ler esse doc antes** e seguir a mecânica dele (cache de
team/project em `.claude/cache/`, team routing inferido do contexto, nunca hardcoded). Sem
`LINEAR_OPS`, resolver team e project pelos MCP tools do Linear e confirmar com o usuário antes de criar.

### Step 6-pre — gate de transporte: API direta ou MCP

Há dois caminhos para chegar ao tracker, e eles têm custos muito diferentes. **Testar, não presumir.**

**O que decide.** A API GraphQL do Linear aceita **N mutations aliasadas num único request**; o MCP
expõe **uma issue por chamada de tool**. Numa criação de 20 issues isso é a diferença entre 2 requests
e 20 round-trips. Medição real (workspace pessoal, 2026-08-08): 6 issues atualizadas num request só, em
**0,71s**; uma query de identidade sozinha custa **0,43s**, ou seja, o custo é quase todo de ida e
volta, e é exatamente esse custo que o batching amortiza.

O gate, nesta ordem, e ele para no primeiro "não":

1. **Existe token?** O **nome da variável** vem do manifesto (`linear_token_env`, default
   `LINEAR_API_KEY`); o valor vem do ambiente ou, faltando lá, do arquivo declarado em `secrets_file`
   (default `~/.secrets`, formato `KEY=value`). Ausente nos dois: ver **Step 6-pre-bis** abaixo —
   não cai em MCP em silêncio.

   ```bash
   TOKEN_VAR="${LINEAR_TOKEN_ENV:-LINEAR_API_KEY}"       # linear_token_env do manifesto
   TOKEN=$(printenv "$TOKEN_VAR")                        # printenv, não expansão indireta: portátil zsh/bash
   [ -z "$TOKEN" ] && TOKEN=$(grep -E "^${TOKEN_VAR}=" "${SECRETS_FILE:-$HOME/.secrets}" 2>/dev/null | cut -d= -f2-)
   ```

   > **Por que o nome é configurável, e por que o default não é o seu.** Quem trabalha em mais de um
   > workspace do tracker tem mais de uma chave, e as duas não cabem sob o mesmo nome no mesmo cofre.
   > Cada manifesto declara a sua, e é assim que o elo nunca cria issue numa org com a credencial da
   > outra. Um nome de máquina hardcoded aqui faria o degrau 1 falhar para todo mundo que não tem
   > aquele nome. O contrato do campo está em `${FLUX_ROOT}/shared/flux-context.md`, e as regras de
   > manuseio do token (nunca ecoar, nunca gravar, header em vez de `--user`, aviso de permissão
   > frouxa no arquivo) em `${FLUX_ROOT}/shared/quality-gate-api.md`, seção "Resolução do token".
2. **O token autentica?** Uma query `{ viewer { id name } }`. Resposta diferente de `200`, ou payload
   com `errors`: **MCP**.
3. **O token enxerga o alvo?** Uma query do team com os labels, que é a mesma que resolve os UUIDs do
   passo seguinte. Falhou: **MCP**.
4. **O token escreve?** **Não existe dry run de mutation**, e é por isso que este passo é um *canário*
   e não uma pergunta: criar **a primeira candidata sozinha** pela API. Nasceu: seguir pela API com o
   resto em levas. Falhou por autenticação ou permissão: **cair para MCP e criar todo o resto por lá**,
   inclusive essa primeira.

> **Por que canário e não uma leva inteira.** Descobrir a falta de permissão no meio de um batch de 3
> deixa um estado ambíguo: parte do documento GraphQL pode ter sido aplicada. Uma criação sozinha falha
> de forma limpa, e o fallback fica trivial.

**O que a API cobra a mais, e que o MCP resolvia sozinho:** ela quer **UUIDs**, não nomes. Team,
project, milestone, labels, estado e responsável precisam ser resolvidos antes. É **uma query**, feita
uma vez, cujo resultado serve a criação inteira, e é a mesma do passo 3 do gate. Resolver nome por nome
a cada issue joga fora todo o ganho.

**Declarar no banner** qual caminho está em uso, porque a diferença de velocidade é visível e a origem
dela precisa ser auditável:

```
transporte: api (batch) | api (canário falhou, caiu para mcp) | mcp (sem <linear_token_env>) | mcp (setup guiado falhou nesta execução) | mcp (usuário optou por não configurar API)
```

O `mcp (sem ...)` cita o **nome** da variável que foi procurada, nunca o valor: sem o nome, quem lê o
banner não sabe se configurou a chave errada ou não configurou nenhuma.

**Nunca imprimir o token**, nem em log, nem em mensagem de erro, nem no board. Ao ecoar resposta de
erro da API, filtrar o valor antes.

### Step 6-pre-bis — sem token: perguntar, não presumir

O item 1 do gate historicamente caía em MCP no silêncio, mas isso esconde do usuário um ganho de
velocidade real (ver a medição acima) por falta de dois minutos de setup. Sem o token resolvido (variável
`$TOKEN_VAR`, nome declarado em `linear_token_env`, default `LINEAR_API_KEY`), **antes de seguir por MCP**,
checar se já existe uma escolha salva (ver cache abaixo) e,
não existindo, abrir um gate de uma pergunta (`${FLUX_ROOT}/shared/hitl.md`, single-select):

1. **Gerar a chave agora** *(Recomendado)* — guiar o passo a passo:
   1. Abrir `https://linear.app/settings/account/security` (Settings → Security & access →
      Personal API keys) e criar uma chave nova, com um label que identifique a máquina (ex.:
      `flux-issue-<hostname>`).
   2. Colar o valor gerado no `secrets_file` do manifesto (default `~/.secrets`), no formato
      `${TOKEN_VAR}=<valor>` (onde `TOKEN_VAR` é o nome declarado em `linear_token_env`, ex.:
      `LINEAR_API_KEY=<valor>`), uma linha só, sem `export`. **Nunca peça pro usuário colar a chave
      no chat** — a instrução é pra ele editar o arquivo diretamente.
   3. Confirmado o salvamento, **releia o arquivo** e retome o gate a partir do item 2 (autentica).
      Ainda sem token legível: reportar e cair pra MCP nesta execução, sem gravar preferência (a
      tentativa falhou, não foi uma escolha).
2. **Não usar API, seguir por MCP** — grava a preferência no cache local (abaixo) e segue o resto
   desta execução, e das próximas, direto pelo MCP, sem repetir a pergunta.

Sem `AskUserQuestion` no harness, vira menu numerado, mesma ordem, degradação declarada no banner
(`${FLUX_ROOT}/shared/hitl.md`).

**Cache da preferência.** `<REPO_PATH>/.claude/cache/flux-issue-linear-transport.json`, mesma raiz de
cache que o Step 6 já usa para team/project quando há `LINEAR_OPS`:

```json
{ "transport": "mcp", "reason": "usuario optou por nao configurar ${TOKEN_VAR}" }
```

Antes de abrir a pergunta, ler esse arquivo: `transport: "mcp"` pula direto pro MCP, sem pergunta,
sem tentar o token de novo. **Não é o `flux-context.json`**: esse manifesto só é escrito pelo
`flux:equip`, sob os dois campos que ele já governa (`exec_fallback`, `write_destinations`) — dar a
este elo um terceiro campo pra escrever ali quebraria essa invariante de escritor único
(`${FLUX_ROOT}/shared/flux-context.md`, "Só um elo escreve este arquivo"). O cache é local ao repo,
específico deste elo, e não precisa do gate de destino de escrita: é preferência de transporte, não
artefato de trabalho.

Configurando a variável declarada em `linear_token_env` depois (por fora, a qualquer momento), a próxima
execução tenta o token de novo a partir do item 1 — o cache só existe **enquanto** a chave está ausente;
achar o token no ambiente ou no `secrets_file` sempre tem prioridade sobre um cache de `"mcp"` antigo.

### Step 6 — a criação

**A main resolve, os agentes criam.** Resolver team, project, milestone e os labels é trabalho
de metadado barato e fica na main (item 2 da lista fechada de `${FLUX_ROOT}/shared/fanout-discipline.md`).
A **criação em si não fica**: cada candidata vai para um subagente `issue-creator`, e a unidade de
fan-out deste passo é **uma candidata**.

> **Quando o transporte é `api`, a unidade muda.** O gargalo deixa de ser o round-trip por issue e passa
> a ser o corpo das issues atravessando o contexto. Aí cada `issue-creator` leva **uma leva inteira** (as
> 3 candidatas da leva) e as cria **num único request batched**, em vez de um agente por candidata. O
> fan-out continua existindo pelo motivo de contexto; o que encolhe é o número de agentes.

> **Por que.** O corpo de uma issue do `flux:issue` é longo por construção — é embasado em código, com
> citação de `arquivo:linha` e permalink. Criar N delas inline arrasta pelo contexto principal tanto o
> dossiê lido quanto o corpo escrito, e os dois ficam lá, restaurados a cada compact. Em subagente,
> isso morre com quem redigiu. E as candidatas são independentes entre si, tirando a ordem dos
> bloqueios, então a redação de N issues paraleliza.
>
> **O agente é `sonnet`, e a escolha do tier importa.** A tentação é tratar isto como transporte e
> descer para `haiku`, mas **o board não guarda o corpo pronto** — guarda a apuração, com os achados
> de todas as candidatas misturados, inclusive os refutados. Compor a issue é escolher quais achados
> sustentam **aquela** candidata e ancorar o critério de aceite neles, o que é julgamento. A regra da
> casa vale aqui: mecânico vai de `haiku`, julgamento vai de `sonnet`. Se algum dia o board passar a
> carregar o corpo literal, a tarefa vira transporte e `haiku` passa a ser o certo.
>
> **Medição que sustenta o desenho** (2026-08-08, workspace pessoal): criar issues uma a uma na main
> custou **~23s por issue**, e quase tudo foi geração de texto — o transporte pela API leva menos de
> um segundo para um lote inteiro. Logo, o ganho de tempo vem de paralelizar a **redação**, não de
> trocar o canal.

### Levas de 3, e a ordem que as governa

Despachar em **levas de até 3 agentes**, cada leva num único bloco de tool calls. Três é o ponto em que
o paralelismo já paga e o fan-in ainda cabe numa leitura: cada leva volta com até 3 retornos para a
main reconciliar e gravar no board antes de soltar a próxima, e é isso que mantém o board fiel mesmo
se a criação for interrompida no meio.

A ordem entre as levas não é livre, e é a mesma de sempre: **blockers primeiro**.

1. **Leva(s) de blockers** — toda candidata que aparece como bloqueadora no grafo do painel. Só depois
   de confirmados os identificadores reais delas é que as bloqueadas podem ser despachadas.
2. **Levas das candidatas sem vínculo** — o grosso, em levas de 3.
3. **Leva(s) das bloqueadas** — por último, já com os `blockedBy` resolvidos em identificadores reais.

**Nunca despachar uma candidata bloqueada na mesma leva do bloqueador dela.** Os agentes de uma leva
correm em paralelo e não se falam: o identificador do bloqueador não existe enquanto a leva não voltou.

### O que vai no prompt de cada agente

Prompt auto-contido (o subagente não herda a conversa):

- **path do board** e o **número da candidata** no painel — é de lá que ele lê o corpo. Passar o path
  em vez do corpo é deliberado: assim o corpo não precisa estar no contexto da main para ser criado.
- **team, project, milestone, labels, prioridade, estado e responsável**, já resolvidos, com os nomes
  exatos que o tracker aceita.
- **`blockedBy`** com identificadores **reais**, quando houver. Marcador por preencher faz o agente
  abortar, de propósito.
- **`NO_EMDASH`** quando o perfil o declara, e o idioma do corpo.

### Fan-in

Cada leva volta com até 3 retornos curtos. A main reconcilia e **grava o board antes da leva
seguinte** — o board é o que sobrevive a uma interrupção, e uma criação de 20 issues tem tempo de ser
interrompida.

Tratar os vereditos assim:

- **`CRIADA`** → `🟣 CRIADA` no painel, identificador linkado.
- **`CRIADA COM DIVERGENCIA`** → também `🟣 CRIADA` (a issue existe), mas a divergência vira linha da
  Timeline de Eventos e item do 🎯 Próximo Movimento. Não colapsar com `CRIADA`: a issue nasceu sem a
  label ou sem o milestone que foi decidido no gate, e isso não se descobre sozinho depois.
- **`FALHOU`** → candidata segue em `🟢 APROVADA`, com a causa no veredito. Corrigir e redespachar.
- **`INDETERMINADO`** → **a main confere no tracker antes de qualquer coisa.** É o caso em que a
  criação pode ter funcionado sem o agente saber. Redespachar sem conferir cria duplicata, e o agente
  não repete a chamada exatamente para que essa decisão seja da main.

Uma candidata que falhou e era **bloqueadora** trava a leva 3 inteira: as bloqueadas dela não podem ser
criadas sem o vínculo, e criá-las mesmo assim perde o vínculo em silêncio.

### Step 6-pos — verificação determinística (obrigatória, e não é agente)

Depois do fan-in da última leva, **a main verifica o lote inteiro contra o que foi decidido no gate**.
Uma query de metadados sobre o projeto, comparação de conjuntos, e um veredito. **Sem subagente**: isto
é comparação de conjuntos, não julgamento, e um modelo conferindo o trabalho de outro modelo troca uma
afirmação não verificada por duas.

Verificar, por issue criada:

- **labels** — igualdade de conjunto com o pedido, sem faltar nem sobrar. Inclui o label de autonomia,
  que é o mais fácil de sumir sem ninguém notar;
- **milestone**, **prioridade**, **estado** e **responsável** — igualdade simples;
- **relações de bloqueio** — existem, e no **sentido** certo (o sujeito é quem bloqueia);
- **contagem** — o número de issues do lote bate com o número de candidatas aprovadas.

Divergência não vira aviso solto: vira item do 🎯 Próximo Movimento e linha da Timeline de Eventos, e a
criação **não é declarada completa** até ser corrigida.

> **Por que isto é obrigatório, com o número que o motivou.** Num lote real de 22 issues (2026-08-08),
> **duas nasceram sem o label de autonomia e os agentes que as criaram reportaram os campos como
> conferidos** — 9% de falha silenciosa num campo que existe justamente para decidir o que pode ser
> despachado sem supervisão. A autoconferência do subagente é útil e não é suficiente: ela é feita pelo
> mesmo processo que errou. A verificação da main custou uma query e dois segundos, e pegou as duas.
>
> Vale para os dois transportes. Não é defeito da API nem do MCP: o tracker aceita a criação e **descarta
> em silêncio** o que não entendeu, em qualquer canal.

**Fechar o board** (é o passo que encerra o ciclo de vida da nota):

- `linear_ids:` preenchido com os identificadores criados; cada candidata vai para `🟣 CRIADA` com o
  identificador **linkado** na coluna `Linear`, e a subseção dela na 📝 Rascunho da issue ganha o mesmo
  link no cabeçalho. Linha na Timeline de Eventos, tipo `linear`.
- `execution_status: done` — é o campo de estado canônico do vault (ADR-014, `fields.execution_status`
  no `note-schema.json`), o mesmo que os boards de `/flux:reply`, `/flux:build` e `/flux:review` já
  usam. Aqui ele fecha exatamente no gatilho que o schema declara para o `issue-draft`:
  `done_when: "issue criada no Linear a partir do rascunho"`.
- **Handoff forward:** o 🎯 Próximo Movimento final aponta para `${FLUX_CMD}build <repo> <TICKET>`, com o
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
