# Board da família `flux:`: um por sessão, um por caso

> Fonte única do formato do board, referenciada por todo verbo que grava no vault. Um verbo aponta
> para cá e declara só o que lhe é próprio (o que o painel lista, a seção que ele acrescenta). Editar
> o formato do board é editar ESTE arquivo.

O board é uma **nota viva** em `<VAULT_ROOT>/0-inbox/`. Nasce cedo, tem o caminho anunciado no chat
na criação e é atualizado a cada passo relevante e a cada tick do watch. É doc interno do vault: o
travessão é liberado aqui (a proibição vale só para o que é postado no GitHub ou no Slack).

## As duas regras

1. **Uma sessão grava em um board só.** Tudo o que a sessão faz entra nele: cada verbo do flux, cada
   rodada, cada review, cada rascunho, e também as skills e os comandos de fora do flux que rodarem
   na mesma sessão. Nenhum verbo cria uma segunda nota na mesma sessão. O review e o `iterate --dry`
   deixaram de gravar artefato próprio e viraram seção do board; o `peek --save`, numa sessão com
   board, também (ver "Seções por verbo").
2. **Um caso tem um board só, e ele atravessa sessões.** Iterar uma PR hoje no Claude Code e de novo
   na segunda no Codex atualiza **o mesmo** board, que ganha a run nova em `provenance.runs` e passa a mostrar,
   na Timeline, qual harness fez cada passo.

As duas regras juntas dão a forma: **sessão → no máximo 1 board; board → N sessões**.

## Resolver o board (todo verbo, antes do primeiro Write)

Rodar no Step 0, depois do preflight, nesta ordem. Parar no primeiro que casar.

1. **Esta sessão já tem board.** É o board cujo path esta sessão já anunciou no chat, ou o que tem em
   `provenance.runs` o id de lançador (`LAUNCHER_RUN_ID`) ou o `session_id` (`SESSION_ID`) desta
   sessão, procurado em `<VAULT_ROOT>/0-inbox/` e em `<VAULT_CTX_ROOT>/` (os dois ids vêm do Passo
   1a-run do preflight). Casou: é ele, sempre. Se o caso do verbo atual for outro, abrir o **gate de
   fuga de escopo**, abaixo, antes de gravar. Sem nenhum dos dois ids, só o path anunciado reconhece a
   sessão, e ele se perde se o contexto for compactado sem guardá-lo: o banner declara
   `sessao nao identificavel`.
2. **O caso já tem board.** Derivar as `case_keys` do alvo (tabela abaixo) e procurar nos mesmos dois
   lugares um board que tenha qualquer uma delas. Casou: reabrir aquele board onde ele estiver
   (atualizar nota já promovida é escrita legítima fora do inbox) e acrescentar esta run em
   `provenance.runs`.
   Board antigo sem `case_keys` também conta, pelas chaves legadas: `pr:` + `repo:`, `ticket:`,
   `linear_ids`, `source:` e `surfaces[].channel_id` (+ `thread_ts`). **Exceção do land:** ele procura
   só pela própria chave `land:...`; os boards que casarem pelo `pr:` ou pelo `ticket:` de cada PR são
   de outros casos e entram em 🔗 Boards relacionados, nunca como candidato.
3. **Nenhum casou.** Criar o board novo em `<VAULT_ROOT>/0-inbox/`, com o naming do verbo que o abriu.

Dois candidatos no passo 2: abrir um gate (`${FLUX_ROOT}/shared/hitl.md`) com os dois caminhos e o
TL;DR de cada um, em vez de escolher sozinho.

Atalhos que pulam a resolução: `--board <path>` (land, reply) assume aquele board (e conta como o
board desta sessão); `--parent-board
<path>` (o iterate despachado pelo land) não escreve board e devolve o delta ao escritor do
orquestrador. Sem `VAULT_ROOT` não há board no vault: o verbo relata no chat e declara `sem vault` no
banner; com `--save <dir>` (review, peek), o board é gravado em `<dir>/`, com `session_sources: []`.

### `case_keys`: a identidade do caso

Lista no frontmatter, com strings normalizadas. É ela que o passo 2 procura e é ela que cresce quando
o mesmo board passa a cobrir mais de um alvo. Esta tabela é a única dona da forma de cada chave.

| alvo | chave |
|---|---|
| PR | `pr:<owner>/<repo>#<n>` |
| Ticket | `ticket:<ID>` (maiúsculas, ex. `ticket:ENG-42`) |
| Entrega multi-PR | `land:<IDs das issues, ordenados e separados por vírgula>` |
| Thread ou DM do Slack | `slack:<channel_id>/<thread_ts>` (sem thread: `slack:<channel_id>/-`) |
| Pedido de exploração | `source:<url>` (sem query string nem `?thread_ts=`); N alvos: as URLs ordenadas, separadas por espaço; texto livre: `source:texto-livre:<slug>` (minúsculas, sem acento, pontuação vira hífen) |
| Doc do Google | `doc:<file_id>` |
| Branch sem PR | `branch:<owner>/<repo>@<branch>` |

Um verbo **acrescenta** a chave do que produziu: o `issue` grava `ticket:<ID>` de cada issue que criou,
o `build` grava `pr:...` quando abre a PR. É assim que o build de amanhã acha o board do refine de
hoje, e o iterate acha o do build. Chave não se remove.

### Quando o board fecha

`execution_status` vai a `done` quando o **último** alvo vivo do caso fecha: a PR mergeada ou
fechada (iterate, land), as issues criadas (exploração), a conversa resolvida (reply). O `ticket:`
de uma issue recém-criada não mantém o board aberto: ele serve para o board ser reencontrado. Board
`done` reaberto por uma sessão nova (o build daquela issue, por exemplo) volta a `active`.

### Gate de fuga de escopo

Disparado quando a sessão já tem board (passo 1) e o verbo novo, ou o pedido novo do usuário, mira um
alvo cujas `case_keys` não estão no board **e** que não é o próximo elo natural do mesmo caso. É elo
natural o que nasce de algo que o board já produziu: a PR que o build abriu, a issue que o issue
criou, o ticket que o refine fatiou. Pedido sem alvo identificável (pergunta solta, ajuste no
próprio board) não dispara gate.

O gate segue `${FLUX_ROOT}/shared/hitl.md` nos dois harnesses (`AskUserQuestion` no Claude Code,
`request_user_input` no Codex, texto numerado onde não houver ferramenta de pergunta), com estas
opções, nesta ordem:

1. **Abrir em sessão nova (Recomendado).** Entregar um **mini-handoff** num bloco copiável
   (objetivo, alvo com link, estado, decisões já tomadas, o comando `${FLUX_CMD}<verbo> ...` a rodar)
   para o usuário levar a um contexto novo. Com `LAUNCHER_RUN_ID` resolvido, o bloco cita a run de
   origem, para o lançador que abriu a sessão poder encadear a nova. O verbo novo **não roda** nesta
   sessão.
2. **Registrar neste board.** O verbo roda aqui; o board ganha as `case_keys` do alvo novo, e o TL;DR
   passa a nomear os dois casos.
3. **Cancelar.** Nada roda, nada se grava além do registro do gate.

O gate e a escolha entram em `### Gates` (seção ✅ Ação) e geram linhas `pendência` e `decisão` na
Timeline, como todo gate.

## Perfis: o que muda por verbo

O formato é um só. O perfil diz só o `type`, o naming do arquivo e a unidade do painel do verbo que
**abriu** o board. Os verbos que entram depois não mudam o `type` nem o nome do arquivo: acrescentam
a própria seção e as próprias `case_keys`. Os links obrigatórios de cada perfil (o ticket no TL;DR e
no Próximo movimento; a PR no painel e na Timeline; a issue bloqueante onde for citada) seguem a
Disciplina de links.

| Perfil | Quem abre | Unidade do painel | `type` | Naming |
|---|---|---|---|---|
| **execução** | `build` | etapas do motor | `flux-build` | `YYYY-MM-DD-HHMM-flux-build-<repo-slug>-<slug-do-ticket>.md` |
| **single-PR** | `iterate` | a PR | `flux-iterate` | `YYYY-MM-DD-HHMM-flux-iterate-pr<N>-<repo-slug>.md` |
| **review** | `review` | os findings | `pr-review` (doc: `doc-review`) | `YYYY-MM-DD-HHMM-flux-review-pr<N>-<repo-slug>.md`; sem PR, `flux-review-<repo-slug>-<branch-slug>`; doc, `flux-review-doc-<slug>` |
| **multi-PR** | `land` | as PRs da entrega | `flux-land` | `YYYY-MM-DD-HHMM-flux-land-<slug>.md` |
| **conversa** | `reply` | as pendências do caso | `thread` | `YYYY-MM-DD-HHMM-flux-reply-<slug-do-caso>.md` |
| **exploração** | `issue`, `refine`, `probe` | as issues candidatas | `flux-issue` | `YYYY-MM-DD-HHMM-flux-issue-<slug>.md` (ou `flux-probe-<slug>`) |
| **parecer** (fora de board) | `peek --save` sem board na sessão | não há painel | sem `type` | `YYYY-MM-DD-HHMM-flux-peek-<alvo-slug>.md` em `<dir>/` |

- **O infixo é o verbo que abriu**, para quem lista o `0-inbox/` saber de onde a nota veio. Os
  infixos antigos (`build-`, `iterate-`, `delivery-`, `slack-board-`) estão aposentados.
- **O `type` tem que ser canônico** no schema do vault (`<VAULT_ROOT>/.schema/note-schema.json`),
  senão o lint aborta o commit. `repo:` é sempre o slug puro (`web-monorepo`, nunca `acme/web-monorepo`).
- **`thread` no perfil conversa**: é o type genérico de caso vivo do vault (`default_state: open`,
  `done_signal: manual`); o board do reply se distingue pelo nome do arquivo, não pelo type.
- **O path é endereço, a identidade são as `case_keys`.** Path já ocupado por board de outro caso:
  sufixar `-2`, `-3`. Sobrescrever board alheio é perda de trabalho.
- **Execução**: o board nasce antes do despacho do motor, com as etapas vazias (`⏳ pendente`,
  `🔄 rodando`, `✅ ok`, `❌ falhou`, `⏭️ pulada`), e a coluna de esforço é
  `arquivos tocados · checks (verde/total)`. Quando a PR nasce, o board ganha `pr:...` em
  `case_keys` e continua sendo o board do caso: o iterate dessa PR escreve nele.
- **Exploração**: o board nasce antes do fan-out, com uma linha por repo em `🔧 APURANDO`. O
  `refine`, o `probe` e o `issue` escrevem no mesmo board do pedido: o `issue` encontra pelo `source`
  as candidatas que o `refine` deixou em `🟡 RASCUNHADA` e não reprospecta nada.
- **Conversa**: o caso migra de superfície (helpdesk → DM → canal) e continua o mesmo board, por
  qualquer uma das `surfaces`.

## Frontmatter

Completo em todo board, gravado na criação; `updated:`, `provenance.runs`, `case_keys:` e os campos de
estado são atualizados depois. Os campos de um perfil só aparecem quando o verbo daquele perfil rodou.

```yaml
---
title: "<o caso em uma linha, ex.: PR #12 (meu-repo): cache de sessão>"
date: "<YYYY-MM-DD da criação>"
updated: "<YYYY-MM-DD HH:MM>"         # rola a cada escrita e a cada tick
type: flux-iterate                    # do verbo que abriu (tabela de perfis)
context: <VAULT_CTX>
pending_organize: true
execution_status: active              # active | open | done | dropped
repo: "<repo-slug>"                   # repo principal; `repos: [...]` quando forem vários
case_keys: ["pr:acme/meu-repo#12", "ticket:ENG-42"]
tags: [board, <build|iterate|review|delivery|slack|issue-draft>, orchestration]   # o do perfil que abriu
# por perfil (só quando o verbo rodou):
pr: <número|null>                     # execução, single-PR, review
pr_number: <número>                   # review (obrigatório no schema de pr-review)
ticket: <ID|null>
engine: "<motor que rodou>"           # execução
engine_kind: nativo                   # nativo | fallback | autonomo
worktree: "<path>"                    # execução
branch: "<branch>"
scope: cabe                           # cabe | cabe-raso | nao-cabe (scope-gate.md)
issues: [ENG-1, ...]                  # multi-PR
source: "<permalink | url | 'texto livre'>"   # exploração e conversa
surfaces:                             # conversa: todas as superfícies, em ordem cronológica
  - { channel: "#canal", channel_id: "C...", thread_ts: "<ts>|null", url: "<permalink>",
      kind: thread, status: ativa }   # kind: thread|dm|channel · status: ativa|parada|migrada|resolvida
participants: ["Nome (U...)"]         # conversa: união das superfícies
telemetry:                            # exploração, quando o probe rodou; uma entrada por fonte
  - { provider: sentry, org: "<org>", issues: ["<SHORT-ID>"], sample: "<M de C eventos>" }
  - { provider: datadog, site: "<site>", services: ["<svc>"], window: "<de → até>", control: "<janela|null>" }
labels_propostas: { tipo: "...", application: "...", agent_autonomy: "AFK|HITL", prioridade: N }   # exploração
linear_ids: []                        # exploração; preenchido ao criar
origin_board: "[[...]]"               # board de onde o pedido veio, quando houver
# review (o board aberto pela review, ou que a recebeu), valores da rodada mais recente:
pr_url: "<url>"
head_sha: "<sha>"
author: "<gh-login>"
reviewer: "<gh-login>"
own_pr: true
status: approved-with-suggestions     # approved | approved-with-suggestions | approved-with-questions | request-changes
counts: { request-change: 0, breaking-change: 0, question: 0, suggestion: 2, praise: 1, note: 0 }
reverified_threads: 0                 # só quando o Passo 4b do review rodou
source_url: "<url do doc>"            # review de doc, no lugar de pr_url/head_sha
own_doc: true                         # review de doc
actions: 0                            # review de doc próprio
provenance: {...}                     # ver abaixo
---
```

## Bloco `provenance` (todos os perfis)

Contrato único do bloco. As dez chaves descrevem **o nascimento** do board e são gravadas uma vez,
nunca recalculadas; a décima primeira, `runs`, cresce uma linha por sessão que escreve no board. É
o bloco que um leitor de vault usa para listar o board entre as sessões do dia (`generator`
começando por `flux-`) e para saber em que dias ele foi tocado (`runs[].started_at`).

```yaml
provenance:
  machine: "<hostname -s>"
  invocation: "<texto invocado, como digitado; ex. no Claude Code: /flux:build meu-repo ENG-42>"
  generator: "flux-build"
  captured_at: "<YYYY-MM-DD HH:MM ±HHMM>"
  session_sources: ["<path absoluto do .jsonl>"]
  harness: claude-code
  flux_version: "<versão>"
  model: "<id do model, ou unknown>"
  effort: "<effort, ou unknown>"
  stamp: "claude-code | flux:build@<versão>"
  runs:                               # uma linha por sessão, em ordem; flow mapping, uma linha só
    - { session_id: "<id>", harness: "claude-code", machine: "<hostname -s>", started_at: "<YYYY-MM-DD HH:MM ±HHMM>", verbs: [build, review], model: "<id>", effort: "<effort>", flux_version: "<versão>" }
```

| chave | valor | `unknown` permitido? |
|---|---|---|
| `machine` | `hostname -s` | não |
| `invocation` | o texto invocado, como digitado | não |
| `generator` | o verbo que abriu, do enum abaixo | não |
| `captured_at` | `date "+%Y-%m-%d %H:%M %z"`, literal | não |
| `session_sources` | paths absolutos de `.jsonl` candidatos, ou `[]` | não (`[]` é a ausência) |
| `harness` | `HARNESS` do preflight: `claude-code` \| `cursor` \| `codex` \| `unknown` | sim |
| `flux_version` | `FLUX_VERSION` do preflight | sim |
| `model` | `MODEL` do preflight | sim |
| `effort` | `EFFORT` do preflight | sim |
| `stamp` | `<harness> \| flux:<verbo>@<flux_version>`, com `<verbo>` = `generator` sem o prefixo `flux-`; derivado, nunca digitado | herda dos campos de origem |
| `runs` | lista de runs, ver abaixo | não |

**Enum de `generator`:** `flux-build` · `flux-iterate` · `flux-land` · `flux-issue` · `flux-reply` ·
`flux-probe` · `flux-refine` · `flux-review` · `flux-peek`. Sempre com hífen; `flux:refine` com
dois-pontos não é valor válido. Verbo novo entra no enum antes de gravar.

**`runs`: quem fez o quê.** Cada sessão acrescenta a sua linha na primeira escrita e depois só
atualiza o `verbs` dela; nunca reescreve a linha de outra run.

- `<launcher_run_key>`: só quando o manifesto declara `launcher_run_env` e `launcher_run_key`
  (`flux-context.md`); a chave é o valor de `launcher_run_key`, com essa grafia exata, e o valor é
  `LAUNCHER_RUN_ID` do preflight, ou `null`. É a chave de junção com a run do lançador e com a
  telemetria dele. Exemplo, com `launcher_run_key: "acme_run_id"`:
  `- { acme_run_id: "run-1a2b", session_id: "...", ... }`.
- `session_id`: `SESSION_ID` do preflight, ou `null`. `null` nos dois é ausência verificada.
- `harness`, `machine`, `model`, `effort`, `flux_version`: os desta sessão, mesmas fontes das chaves
  de nascimento.
- **Aspas em todo valor de texto** da linha (`session_id`, id de lançador, `harness`, `machine`,
  `started_at`, `model`, `effort`, `flux_version`): num flow mapping, um `[`, `:` ou `,` sem aspas
  (como em `claude-opus-4-1[1m]`) quebra o parse do frontmatter inteiro. `null` vai sem aspas.
- `started_at`: o `date` da primeira escrita desta sessão no board.
- `verbs`: os verbos do flux que esta sessão rodou aqui, em ordem.
- `run_id`: só quando a execução foi gravada com `--record` (`shared/run.md`); ficar na linha da run
  é o que impede duas execuções no mesmo board de se sobrescreverem.

**`session_sources`:** em `~/.claude/projects/<cwd-codificado>/` (o cwd com `/` virando `-`), os
`.jsonl` com mtime nas últimas 48h que ainda não aparecem em nenhuma nota do vault
(`grep -rl "<uuid>" <VAULT_ROOT>`), como paths absolutos. Com `SESSION_ID` resolvido, o candidato é só
`<SESSION_ID>.jsonl`. Nenhum candidato: `[]`.

**`model` e `effort`** são os da sessão que grava, nunca os de um subagente que ela despachou.
**`unknown`** só aparece em `harness`, `flux_version`, `model` e `effort` (nas chaves de nascimento e
na linha da run), e só quando o preflight resolveu assim: o gravador copia os valores do Step 0,
nunca reavalia. Sessão sem id (os dois `null`) segue a regra de linha do Passo 1a-run do preflight.

### Checklist antes de gravar

1. As onze chaves presentes, nenhuma a mais dentro de `provenance` (`case_keys` e os campos de perfil
   ficam no topo).
2. `generator` no enum, e é o verbo que abriu.
3. `harness` em `claude-code | cursor | codex | unknown`.
4. `unknown` como valor inteiro só nas chaves que o admitem.
5. `captured_at` e `started_at` casam com `YYYY-MM-DD HH:MM ±HHMM` e vieram de um `date`.
6. `session_sources` é lista de paths absolutos `.jsonl`, ou `[]`.
7. `stamp` é exatamente `<harness> | flux:<verbo>@<flux_version>` com os valores deste bloco.
8. `runs` tem a linha desta sessão, numa linha só, com `session_id` (e o id de lançador, quando o
   manifesto o declara) copiados do preflight, valor entre aspas ou `null`, e todo valor de texto entre
   aspas.

Board antigo sem o bloco, sem `runs` ou sem `case_keys` continua válido para leitura: tudo é aditivo.
O checklist vale para gravação nova e não autoriza reescrever nota antiga. Board antigo reaberto
ganha `provenance.runs` (só a linha desta sessão) e `case_keys` na primeira escrita nova; as dez
chaves de nascimento dele não são reescritas. Board antigo com `runs:` ou `run_id:` no topo continua
sendo lido e achado pelo `run.sh resolve-ref`.

## Corpo: sempre nesta ordem

1. **Título (H1)**: o caso em uma linha.
2. **`## TL;DR`**: 2 a 4 linhas, **reescritas a cada escrita**, nunca anexadas. A primeira linha é
   `**Agora:** <o que a sessão está fazendo neste momento>`; depois, o estado do caso e o que falta.
   É um H2 de propósito: é o que um leitor de vault extrai como resumo. No fim da sessão, `Agora:` vira
   `**Parado em:**`.
3. **`## 🎯 Próximo movimento`**: lista numerada, curta, imperativa, na ordem real. Reescrita a cada
   escrita. A primeira linha tem o link do alvo da ação.
4. **`## 📊 Painel`**: a única tabela de status do documento (ver "Painel por perfil"). Board que
   reúne verbos de perfis diferentes tem um painel por perfil, um abaixo do outro, cada um com
   `### <perfil>`.
5. **`## 👥 Quem tocou`**: um item por ator, reescrito quando entra ator novo. O usuário (decisões,
   aprovações, validação humana); cada harness com as máquinas, as datas e os verbos (derivado de
   `provenance.runs`); subagentes e specialists pelo que fizeram, sem listar cada despacho.
6. **`## ⏰ Timeline`**: a única narrativa cronológica. Append, nunca reescreve o passado.

   | quando | run | harness | verbo | tipo | evento |
   |---|---|---|---|---|---|
   | 25/11 19:52 | `a1b2` | claude-code | `review` | review | rodada 1 em [#12](url): 2 request-change |

   - **run**: os 4 últimos caracteres do id de lançador, ou os 4 primeiros do `session_id`, ou `n/d`.
   - **verbo**: o verbo do flux, ou `skill:<nome>` / `cmd:<nome>` para o que rodou fora do flux.
   - **tipo**: `push`, `merge`, `conflito`, `decisão`, `review`, `ci`, `qa`, `descoberta`, `pr-body`,
     `escopo`, `pendência`; conversa acrescenta `migração` e `rascunho`; exploração acrescenta
     `prospecção`, `coleta`, `candidata` e `linear`. A escolha do usuário num gate é `decisão`.
   - **evento**: uma ou duas frases, com link. O detalhe técnico (causa raiz, `arquivo:linha`, por que
     a decisão foi aquela) vai na seção do verbo, não aqui.
   - Uma linha por evento substantivo. Tick sem novidade rola o `updated:` e não gera linha.
7. **`## ✅ Ação / Continuidade (HITL)`**: checklist `- [ ]` do que é humano (pedir review, criar
   flag, rodar QA); `- [x]` quando resolvido, sem apagar. Abaixo, `### Gates`: para cada gate, os
   fatos e as origens, a pergunta, as opções apresentadas, o estado (`pendente` ou a escolha) e o
   resultado da ação, conforme `${FLUX_ROOT}/shared/hitl.md`.
8. **Seções por verbo**, na ordem em que entraram, com uma exceção na exploração: o 📝 Rascunho da
   issue vem antes do 📐 Refinamento, que vem antes da 🔭 Telemetria (o produto antes do insumo).

**Regra do painel:** nenhuma outra seção lista as unidades de trabalho com colunas de status. As
únicas outras tabelas permitidas são a Timeline e o 🧭 Rastro do caso, que são cronologia.

### Skills e comandos de fora do flux

Com a sessão já tendo board, o que roda fora do flux também entra nele: uma linha na Timeline com
`verbo: skill:<nome>` (ou `cmd:<nome>`), o que fez em uma frase e o link do que produziu. Se a skill
gravou nota própria (um `/context-save`, por exemplo), o board linka essa nota com wikilink e não a
copia. Quem grava é a main da sessão, ao fim do passo; o flux não intercepta skill alheia.

## Painel por perfil

Legenda sempre acima da tabela, mesmo que nem todo ícone apareça. Todo número vem de fonte real
(GraphQL de threads, `gh pr checks`, contador de estado); sem fonte, `n/d`. Unidade encerrada não sai
do painel: muda de status e guarda o desfecho.

**single-PR, multi-PR e execução depois da PR.** `| PR | Ticket | Status | esforço | veredito |`.
Esforço = `rodadas · threads (res/tot) · flow 👍/👎`, com as reações filtradas pela conta do `gh`;
congela no merge. Veredito = uma frase (o que a PR faz e por que o status).
Status: 🟣 MERGED · 🟢 READY · 🔒 HITL (o flow segura o pedido de review por falta de validação
humana específica) · 🔗 ORDEM (depende de outra PR) · 🟡 DRAFT · 🔧 FIXING. Abaixo da tabela, em
prosa: ordem de merge, grafo de bloqueio (`#B ⟵ bloqueada por #A` + motivo), go/no-go corrente.

**review.** O painel de findings da rodada mais recente, no formato de
`${FLUX_ROOT}/shared/review-artifact-template.md`, "Painel de findings". As rodadas guardam os
findings, não uma segunda tabela.

**conversa.** `| # | Pendência | Bola com | Superfície | Status | desde |`. Pendência é a pergunta
do jeito que ela precisa ser respondida, não o assunto. **Bola com** é sempre nome de pessoa; sem
dono, `⚠️ sem dono`, e isso vira Próximo movimento. Status: 🟣 RESOLVIDA · 🟢 RESPONDIDA ·
🔒 BLOQUEIA (sem a resposta, o próximo passo nasce errado; dizer qual) · 🟡 ABERTA · 🔧 APURANDO ·
⚪ INFORMATIVA. Abaixo: estado do caso em uma linha e o que já está decidido.

**exploração.** `| # | Título proposto | Repo | Tipo | Autonomia | Embasamento | Status | Linear |`.
Título no formato do `issue-template.md`; Tipo `Feature | Bug | Improvement | Spike`; Autonomia
`AFK | HITL` (`n/d` só quando o workspace não tem o label); Embasamento `✔N ◐N ✘N ?N`, contado da
🔬 Achados (✔0 ◐0 não vai ao Linear); Linear
linkado ou `n/d`. Status: 🟣 CRIADA · 🟢 APROVADA · 🔒 BLOQUEIA · 🟡 RASCUNHADA · 🔧 APURANDO ·
⚪ DESCARTADA. Abaixo: ordem de criação (blockers primeiro) e grafo de bloqueio.

**execução.** `| Etapa | Estado | esforço | nota |`, com as etapas do motor (contexto, plano,
implementação, checks, PR).

## Seções por verbo

Cada verbo que roda no board acrescenta a sua seção, abaixo das comuns, com H2 `## <ícone> <verbo> ·
<alvo>`. Verbo que roda de novo no mesmo alvo atualiza a própria seção com um H3 por rodada
(`### Rodada 2 · 30/11 · codex`), sem apagar a anterior.

- **🔎 review** (`## 🔎 Review · PR #N`, ou `## 🔎 Review · doc <título>`): uma
  `### Rodada K · <DD/MM HH:MM> · <harness>` por execução, com o
  conteúdo de `${FLUX_ROOT}/shared/review-artifact-template.md`, que é o dono dos níveis de heading
  e do header de finding. Os campos de frontmatter da review são os do bloco "review" acima.
- **👁️ peek**: numa sessão com board, uma linha na Timeline e, com `--save`, o parecer como seção. O
  peek nunca abre board: sem board na sessão, o `--save` grava arquivo próprio (ver `peek/SKILL.md`).
- **🔁 iterate**: o relato das rodadas (threads respondidas, pushes, CI); em `--dry`, os rascunhos
  de réplica, como seção, com `[dry-run]` no TL;DR.
- **🔗 Boards relacionados** *(multi-PR)*: um item por PR, com o wikilink do board de cada PR,
  quando a PR já tem board de outro caso; `n/d` enquanto não tiver.
- **🧭 Rastro do caso** *(conversa, seção 7-ter)*: tabela `| quando | superfície | quem entrou | por
  que mudou |`. Toda superfície nova entra na rodada em que é lida; ao registrar, comparar o que foi
  levado com o que o dossiê tem, e o que ficou de fora vira pendência. Superfície anterior ganha
  `status: migrada` ou `parada` em `surfaces:`.
- **🔬 Achados de codebase** *(conversa e exploração, seção 7-quater)*: o dossiê acumulado, por repo,
  em bullets. Cada achado com âncora real e veredito (`confirma` / `refuta` / `parcial` /
  `sem-evidência`) e, na exploração, a candidata a que serve (`#1`). Achado não expira entre rodadas
  e não se apaga: o invalidado fica `~~riscado~~` com o motivo. Incertezas e lacunas ficam separadas
  dos fatos, cada uma rastreável até a linha do painel que a representa. Consultar antes de
  reprospectar.
- **✍️ Rascunhos** *(conversa, seção 7-quinquies)*: um item por draft, com id, data, superfície e
  estado (`PENDENTE`, `ENVIADO`, `⚠️ INVALIDADO`, `DESCARTADO`). Draft invalidado gera linha
  `decisão` e item no Próximo movimento.
- **📝 Rascunho da issue** *(exploração, seção 7-sexies)*: o produto. Um `### #N — <título>` por
  candidata, no formato de `issue-template.md`. Ajuste do gate versiona (`#### v2 — <data> (motivo)`,
  a anterior em `<details>`; só a mais recente vai ao Linear); candidata descartada mantém a subseção;
  criada no Linear, ganha o id linkado no cabeçalho.
- **📐 Refinamento** *(exploração, seção 7-septies, quando o refine rodou)*: §1 PRD-fast, §2 TRD-fast
  (contrato inline, pontos de toque com `arquivo:linha` linkado, o não apurado declarado como tal),
  §3 Plano (slices em prosa, grafo de bloqueio, AFK/HITL), §4 Veredito de escopo
  (`scope-gate.md`). Na recusa, §3 traz o corte proposto e §4 o encaminhamento. Fica **depois** do
  7-sexies: o produto vem antes do insumo.
- **🔭 Telemetria** *(exploração, seção 7-octies, quando o probe rodou)*: uma subseção por fonte, com
  §1 Denominador (o que foi agregado de quanto existe, a janela), §2 Distribuições (contagem e %),
  §3 Números e correlações (percentis com denominador, correlação em faixa), §4 Plausibilidade (as
  contas que confirmam ou derrubam a explicação corrente; o que derruba sobe ao TL;DR) e §5 O que a
  telemetria não diz (lacunas, e fonte declarada não consultada por nome). Os vereditos moram na
  🔬 Achados; aqui fica a medição.

## Disciplina de links

Um board é reaberto dias depois, de outra máquina, sem a sessão que o criou: toda entidade citada é
clicável.

| entidade | forma |
|---|---|
| PR | `[#{n}](https://github.com/{owner}/{repo}/pull/{n})` |
| Ticket / issue | `[{ID}](https://linear.app/{LINEAR_ORG}/issue/{ID})`; sem `LINEAR_ORG`, sem link (nunca inventar a org) |
| Commit | `[{sha:0:7}](https://github.com/{owner}/{repo}/commit/{sha})` |
| Código | permalink no SHA: `.../blob/{sha}/{path}#L{a}-L{b}`; diretório `.../tree/{sha}/{path}` |
| Board irmão, nota do vault | wikilink `[[nome-do-arquivo-sem-extensão]]` |
| Thread / mensagem | o permalink real, nunca o nome do canal solto |
| Path local | `` `código inline` ``, sem link |

### O caso do código

`arquivo:linha` em backticks parece citação e não abre em lugar nenhum. Três regras, juntas:

1. Toda citação de código que afirma algo vira permalink, no board, no rascunho de Slack e no corpo
   de issue. Só fica nu o path que não existe no repo (arquivo proposto).
2. O alvo é um SHA, nunca uma branch. Resolver uma vez (`git rev-parse origin/main`, ou o `head_sha`
   da PR) e usar em todas as citações do artefato.
3. A linha é conferida contra aquele SHA (`git show {sha}:{path} | sed -n '{a},{b}p'`).

No Slack, a mesma regra em mrkdwn: `<{url}|{arquivo}:{linha}>`. Sem SHA resolvido, a citação fica nua
e o motivo entra como lacuna declarada. Entidade que ainda não existe fica `n/d`: link inventado é
pior que link ausente.

## Disciplina de carimbo de data

Atualizar o board a cada passo relevante, nunca no fim. **Todo carimbo vem de um `date` real**:
antes de criar o board e antes de cada escrita, rodar `date "+%Y-%m-%d %H:%M %z"` e usar o valor
literal (o comando resolve o fuso da máquina; nunca hardcodar offset). A mesma leitura alimenta o
`HHMM` do nome (só na criação), `updated:`, o `**Agora:**` do TL;DR, o `started_at` da run (só na
primeira escrita dela) e a linha da Timeline. Inferir "agora" erra pelo fuso: já houve board com 3h de drift por isso.
