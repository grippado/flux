# Template compartilhado de board (build + iterate + delivery + slack)

> Fonte única do formato de board vivo do vault, referenciada por `/flux:iterate`,
> `/flux:land` e `/flux:reply`. **Não duplicar este template dentro dos comandos** — cada comando
> aponta para cá e só declara os parâmetros específicos dele (naming, gatilho de criação, escopo do painel).
> Editar o formato do board significa editar ESTE arquivo, e os comandos herdam a mudança.

O board é uma **nota viva** em `<VAULT_ROOT>/0-inbox/`. Nasce cedo (não no fim), tem o caminho anunciado
no chat na criação, e é atualizado a CADA passo relevante e a CADA tick do watch. Timeline em horário
local. É doc interno do vault (travessão/en-dash liberados aqui; a proibição de travessão vale só para
texto postado no GitHub/Slack, via iterate).

## Quatro perfis do mesmo template

| Perfil | Comando | O que o painel lista | `type` no frontmatter | Naming do arquivo |
|--------|---------|----------------------|-----------------------|-------------------|
| **execução** | `/flux:build` | N linhas (as etapas do motor) | `build` | `YYYY-MM-DD-HHMM-build-<repo-slug>-<slug-do-ticket>.md` |
| **single-PR** | `/flux:iterate` | 1 linha (a PR única) | `iterate` | `YYYY-MM-DD-HHMM-iterate-pr<N>-<repo-slug>.md` |
| **multi-PR** | `/flux:land` | N linhas (todas as PRs da entrega) | `delivery` | `YYYY-MM-DD-HHMM-delivery-<slug>.md` |
| **conversa** | `/flux:reply` | N linhas (pendências em aberto do caso) | `thread` | `YYYY-MM-DD-HHMM-slack-board-<slug-do-caso>.md` |

> **O `type` tem que ser canônico** quando o vault declara um schema (`<VAULT_ROOT>/.schema/note-schema.json`). `build`, `iterate`,
> `delivery` e `thread` estão no enum; os nomes antigos `iterate-board`/`delivery-flow`/`slack-ata`/`slack-thread` só
> sobrevivem no mapa de colapso, por compatibilidade com os boards já gravados. Emitir tipo fora do enum
> faz o lint do vault **abortar o commit**, quando houver um. `repo:` também é validado: use
> o slug puro (`web-monorepo`), nunca `acme/web-monorepo`.
>
> **Por que o perfil conversa usa `thread` e não `slack`:** no schema, `slack` é o type de *digest*
> (`done_signal: born_done`, nasce fechado — é o que o `/cantar` emite). `thread` tem exatamente o
> lifecycle de um caso vivo: `default_state: open`, `done_when: "discussão resolvida"`,
> `done_signal: manual`. É também o type que as atas de Slack já usavam, então os boards antigos
> continuam válidos sem migração de schema.

As **seções, a ordem, a legenda de ícones e a disciplina de carimbo de data são idênticas** nos quatro
perfis. O que muda é o que o painel lista, o bloco de proveniência (abaixo), as três seções extras do
perfil conversa (7-ter, 7-quater, 7-quinquies) e a coluna de esforço do perfil execução.

### O que o perfil execução herda e o que ele acrescenta

O `flux:build` despacha para o motor nativo do repo, que roda **longe da main, num worktree, por muitos
minutos**. Sem board, esse intervalo é cego: o retorno de `< 40 linhas` do subagente é a primeira e
única notícia, e se o motor travar no meio não sobra rastro de onde parou.

O perfil execução existe para tornar esse intervalo observável. A unidade do painel não é a PR nem a
pendência: é a **etapa do motor** (contexto lido, plano, implementação, checks, PR). O board nasce
**antes do despacho** (com as etapas ainda vazias) e é atualizado a cada retorno de etapa.

Diferenças de coluna no painel:

- **esforço** = `arquivos tocados · checks (verde/total)`, em vez de `rodadas · threads · flow`.
- **estado** de cada etapa: `⏳ pendente`, `🔄 rodando`, `✅ ok`, `❌ falhou`, `⏭️ pulada`.

O board do build **morre quando a PR nasce**: o `🎯 Próximo Movimento` final aponta para o
`/flux:iterate` da PR criada, e o board do iterate assume dali (cross-link bidirecional, ver bloco de
proveniência). Não é um board que vive por dias, é um board que cobre uma execução longa.

> **Por que `build` precisou entrar no enum do schema.** Nenhum type canônico existente descrevia
> "execução longa que termina numa PR": `iterate` pressupõe PR já existente e `delivery` pressupõe N
> PRs. Entrada registrada com `default_state: active` (o build já nasce rodando) e
> `done_signal: manual` (fecha no handoff, não no merge — o merge é assunto do iterate).

### O que o perfil conversa herda e o que ele acrescenta

O perfil conversa existe porque um caso de trabalho no Slack tem a mesma natureza de um delivery: nasce
cedo, vive por dias, muda de estado, e a memória do que já foi apurado vale mais que a transcrição. A
diferença é que a unidade de trabalho não é a PR, é a **pendência** — a pergunta em aberto e de quem é a
bola. E o caso não vive num lugar só: ele **migra de superfície** (helpdesk → DM → canal de time), e essa
migração é normal, não excepcional.

Por isso o perfil conversa acrescenta três seções, e só ele as tem:

- **🧭 Rastro do caso** (7-ter) — as superfícies por onde o caso passou e por que mudou.
- **🔬 Achados de codebase** (7-quater) — o dossiê verificado acumulado, que sobrevive às rodadas.
- **✍️ Rascunhos** (7-quinquies) — o histórico de drafts, incluindo os que foram invalidados.

## Frontmatter

```yaml
---
title: "<Board do build — <ticket> (repo)>  |  <Board do iterate — PR #N (repo)>  |  <Delivery board — feature/issues>"
date: "<YYYY-MM-DD>"
updated: "<YYYY-MM-DD HH:MM>"       # rola a CADA tick, mesmo tick sem novidade
type: iterate                       # ou: build | delivery  (canônicos; ver nota acima)
context: <VAULT_CTX>
pending_organize: true
# execução (build):
repo: "<repo-slug>"                 # slug puro, sem a org
ticket: <ENG-XXXX|null>
engine: "<nome do comando, ou 'autonomo'>"      # motor que de fato rodou
engine_kind: nativo                 # nativo | fallback | autonomo
worktree: "<path do worktree dedicado>"
branch: "<branch criada>"
pr: <número|null>                   # null até o motor abrir a PR
iterate_board: "<path do board do iterate, quando o handoff acontecer>"
# single-PR (iterate):
pr: <número>
repo: "<repo-slug>"                 # slug puro, sem a org
ticket: <CPU-XXXX|MOM-XXXX|null>
parent_board: "<path do board do delivery-flow, se este iterate nasceu de um>"  # só quando --parent-board
# multi-PR (delivery):
issues: [CPU-XXXX, ...]
repos: [...]
iterate_boards: ["<path do board de iterate da PR #A>", "<...#B>"]   # preenchido conforme os filhos nascem
# conversa (slack):
source: slack
surfaces:                            # TODAS as superfícies do caso, em ordem cronológica
  - channel: "#helpdesk-comunicacao"
    channel_id: "CXXXXXXXX"
    thread_ts: "1720012800.123456"
    url: "https://<ws>.slack.com/archives/CXXXXXXXX/p1720012800123456"
    kind: thread                     # thread | dm | channel
    status: parada                   # ativa | parada | migrada | resolvida
  - channel: "DM <Nome>"
    channel_id: "DXXXXXXXX"
    thread_ts: null                  # DM sem thread: null
    url: "https://<ws>.slack.com/archives/DXXXXXXXX"
    kind: dm
    status: migrada
participants: ["Nome (U...)", "..."]  # união de todas as superfícies
repos: [...]
tags: [board, <build|iterate|delivery|slack>, orchestration]
---
```

> **`surfaces` é a chave de identidade do perfil conversa.** Um caso é reencontrado por QUALQUER uma das
> suas superfícies, não só pela primeira. Antes de criar board novo, procurar em `<VAULT_ROOT>/0-inbox/`
> por um board cujo `surfaces[].channel_id` (+ `thread_ts`, quando houver) case com o alvo. Casou:
> atualiza aquele board. Não casou: board novo. Isso é o que impede um caso de virar cinco notas soltas
> quando a conversa anda de canal.

## Bloco de proveniência (cross-links bidirecionais)

**Regra de ouro da proveniência: todo link é real e verificável — nunca inventar um path de board que não
foi criado.** Se um lado ainda não existe, marcar `n/d` até existir.

- **Board de iterate nascido de um delivery-flow** (flag `--parent-board <path>` presente): logo no TLDR,
  uma linha explícita `> Executado a partir de um delivery-flow: [board da entrega](<parent_board>)`, e o
  campo `parent_board:` no frontmatter. Sem a flag (iterate avulso do dia a dia), este bloco não aparece.
- **Board de delivery-flow**: mantém a **lista de boards de iterate filhos** (ver seção 7-bis abaixo),
  um link por PR, preenchida conforme cada iterate consolidado gera o seu. O frontmatter espelha em
  `iterate_boards:`.

- **Board de execução** (`/flux:build`): o vínculo é **para frente, no tempo**. O build produz a PR que
  o iterate vai fechar, então quando a PR nasce o board de execução grava `pr:` e, no handoff, o
  `iterate_board:`. O board do iterate correspondente aponta de volta com `parent_board:` apontando
  para o board de execução, exatamente como faz com um delivery. Um board de build sem PR ao final é
  legítimo (o motor pode ter falhado): fica `pr: null` com o estado da etapa que quebrou, e é isso que
  torna a falha investigável depois.

- **Board de conversa** (`/flux:reply`): a proveniência não é entre boards, é entre **superfícies** — o
  caso é o mesmo, o lugar muda. Isso vive no `surfaces:` do frontmatter e na seção 🧭 Rastro do caso. Se
  a conversa gerar uma issue (via `/flux:issue`) ou uma entrega (via `/flux:land`), registrar o link
  forward na seção ✅ Ação / Continuidade, e o board de destino aponta de volta pelo path deste.

O link forward (delivery → iterate) e o reverse (iterate → delivery) apontam um para o outro pelo path
determinístico do naming acima, de modo que o vínculo fecha mesmo que o iterate rode em outra sessão.

## Template fixo — sempre nesta ordem, sem exceção

**Regra de ouro do painel:** o Painel (item 4) é a ÚNICA tabela de status da unidade de trabalho do
documento (PR nos perfis de PR, pendência no perfil conversa). Nenhuma outra seção pode conter tabela que
liste essas unidades com colunas de status — qualquer info por-unidade que não seja o painel vira prosa
(bullets, texto corrido), nunca tabela paralela. As duas únicas outras tabelas permitidas no documento
são a Timeline de Eventos Relevantes (item 6) e o 🧭 Rastro do caso (7-ter, perfil conversa), ambas
cronológicas e nenhuma delas de status.

1. **Frontmatter** (acima).

2. **Título (H1) + TLDR** — uma linha de título seguida de blockquote de 1-2 frases: o que é, o estado
   atual resumido, o que falta. É o que se lê em 5 segundos. No perfil single-PR com proveniência, a
   linha de proveniência (acima) entra logo após o TLDR.

3. **🎯 PRÓXIMO MOVIMENTO (leia isto primeiro)** — lista numerada curta e imperativa do que precisa
   acontecer a seguir, na ordem real. Reescrita (não só anexada) a cada atualização relevante.

4. **📊 Painel (status ao vivo)** — fonte única da verdade de status.

   **Perfis single-PR e multi-PR.** Colunas mínimas:

   | PR | Ticket | Status | esforço (rodadas · threads · 👍/👎) | veredito |

   **Perfil conversa.** A unidade não é a PR, é a **pendência**: cada linha é uma pergunta em aberto, uma
   decisão travada ou um compromisso assumido por alguém. Colunas mínimas:

   | # | Pendência | Bola com | Superfície | Status | desde |

   - **Pendência**: a pergunta ou decisão em uma frase, do jeito que ela precisa ser respondida. Não é
     resumo de assunto ("visibilidade de canal"), é o que está travado ("read-only bloqueia só iniciar
     conversa ou também responder?").
   - **Bola com**: quem precisa agir. Nome de pessoa, sempre — `Ana`, `Bruno`, `Cris`. Nunca "time" ou
     "produto": pendência sem dono nomeado é pendência que não anda. Se não há dono definido, o valor é
     `⚠️ sem dono` e isso vira item do Próximo Movimento.
   - **Superfície**: onde essa pendência está viva agora (casa com uma entrada de `surfaces:`). Uma
     pendência levantada na DM e ainda não recolocada no canal novo é um risco visível, não um detalhe.
   - **desde**: data em que a pendência foi aberta. Pendência parada há dias salta à vista.
   - Pendência resolvida **não sai do painel**: vira `🟣 RESOLVIDA` com o desfecho no lugar do texto de
     status. O board é memória, não lista de TODO.

   Legenda de `Status` — **single-PR e multi-PR** (incluir sempre como bloco de referência acima da
   tabela, mesmo que nem todo ícone apareça no board corrente):

   | ícone | significado |
   |---|---|
   | 🟣 | **MERGED** — já subiu, fim de linha nesta PR |
   | 🟢 | **READY** — sem draft, sem trava, aguardando só aprovação humana |
   | 🔒 | **HITL** — não-draft no GitHub, mas o flow segura o pedido de review por falta de validação humana específica (visual, produto, nome de evento). Usar mesmo que o GitHub mostre `isDraft: false`/`REVIEW_REQUIRED`. |
   | 🔗 | **ORDEM** — trava de sequência de merge (depende de outra PR ainda não mergeada), não é qualidade |
   | 🟡 | **DRAFT** — ainda em rascunho no GitHub |
   | 🔧 | **FIXING** — o flow está fechando threads/CI antes de a PR virar qualquer estado anterior |

   Legenda de `Status` — **perfil conversa**:

   | ícone | significado |
   |---|---|
   | 🟣 | **RESOLVIDA** — respondida ou decidida; fica no painel como registro histórico |
   | 🟢 | **RESPONDIDA** — você já respondeu/entregou; a bola está com o outro lado |
   | 🔒 | **BLOQUEIA** — trava o próximo passo concreto do caso (virar ticket, subir PR, fechar o chamado) |
   | 🟡 | **ABERTA** — perguntada, sem resposta ainda |
   | 🔧 | **APURANDO** — prospector rodando / verificação de código em andamento |
   | ⚪ | **INFORMATIVA** — registrada para não se perder, mas não aciona ninguém agora |

   > **🔒 BLOQUEIA é o ícone que justifica o board.** Ele separa "o Alex ainda não respondeu" de "sem a
   > resposta do Alex a issue nasce errada". Só use quando a ausência da resposta produz retrabalho ou
   > decisão errada, e diga qual no campo de veredito/desfecho. Marcar tudo como bloqueio esvazia o sinal.

   - **esforço** = `rodadas · threads (res/tot) · flow 👍/👎` numa célula compacta. **rodadas** = passadas
     de iterate fechadas (contador `round`/`iterateRounds` do estado). **threads** = resolvidas/total do
     GraphQL real. **flow 👍/👎** = reações aplicadas pelo flow, filtradas pela conta que roda o `gh`
     (ex.: `.user.login=="<login do gh>"`), nunca reações de terceiros.
   - **veredito**: uma frase curta (o que a PR faz + motivo do status). Detalhe técnico extenso vai para
     a análise/timeline, não para esta célula.
   - PR `MERGED`: status vira `🟣 MERGED (<data/hora>)`, esforço congela no momento do merge (registro
     histórico) — não deletar a linha.
   - **Todo número no painel vem de fonte real** (GraphQL de threads, `gh pr checks`, contador de estado).
     Onde não houver fonte, `n/d` — proibido preencher métrica sem origem verificável.
   - Abaixo da tabela, ainda nesta seção, em prosa/lista (não tabelas novas): ordem de merge, grafo de
     bloqueio (`#B ⟵ bloqueada por #A` + motivo), contagem por repo, métricas agregadas, análise de
     segurança de subida (multi-PR) e go/no-go corrente (ou `🏁 DONE`). No single-PR muitos desses itens
     colapsam para uma linha ou somem (não há ordem entre PRs); manter só o que faz sentido para 1 PR.
     No perfil conversa, o que entra em prosa abaixo da tabela é: **estado do caso** em uma linha (o que
     precisa acontecer para ele fechar), e **o que já está decidido** (as definições fechadas em rodadas
     anteriores, para ninguém reabrir por esquecimento).

5. **⏰ Timeline Verbosa** — narrativa cronológica por sessão: rodadas fechadas, pushes, mudanças de CI,
   decisões, com detalhe técnico (arquivo:linha, causa raiz, decisão e porquê). Append, nunca reescreve o
   passado. Separar por `### Sessão de <data>` quando o board for retomado.

6. **📅 Timeline de Eventos Relevantes** — tabela compacta estilo post-mortem, índice escaneável da
   verbosa (não a substitui):

   | data | hora | evento | tipo | PR(s) |
   |---|---|---|---|---|

   - **tipo**: vocabulário fixo — `push`, `merge`, `conflito`, `decisão`, `review`, `ci`, `qa`,
     `descoberta`, `pr-body`. No perfil conversa acrescentam-se: `migração` (o caso mudou de
     superfície), `rascunho` (draft salvo/enviado/invalidado) e `pendência` (aberta ou fechada).
   - No perfil conversa a coluna final é **superfície**, não `PR(s)`.
   - `pr-body` = reconciliação da descrição da PR (passo 8a do `/flux:iterate`). A linha diz **qual
     afirmação** foi corrigida, não só "descrição atualizada"; o detalhe da evidência vai na verbosa.
   - **Regra de captura**: toda vez que o carimbo de data rola (frontmatter `updated:`, painel, verbosa),
     a MESMA ação insere uma linha aqui. Um tick sem novidade substantiva não gera linha (evita ruído),
     mas ainda rola o carimbo de data das outras seções.

7. **✅ Ação / Continuidade (HITL)** — checklist `- [ ]` de itens acionáveis para o usuário continuar a
   parte humana (pedir review, criar flag, rodar QA). Marcar `- [x]` quando resolvido, não apagar a linha.

7-bis. **🔗 Boards de iterate por PR** *(só no perfil multi-PR / delivery-flow)* — lista em prosa (não
   tabela), um item por PR, linkando o board de iterate filho que aquela PR gerou:

   ```
   - #1054 (api-gateway): [board do iterate](<VAULT_ROOT>/0-inbox/....md) — última rodada: 2
   - #8057 (web-monorepo): [board do iterate](<VAULT_ROOT>/0-inbox/....md) — última rodada: 1
   - #1157 (notifications): n/d (iterate ainda não rodou nesta PR)
   ```

   Preenchida conforme cada iterate consolidado (seção 4 do delivery) nasce. É a contraparte forward do
   `parent_board` que cada board de iterate carrega (reverse).

7-ter. **🧭 Rastro do caso** *(só no perfil conversa)* — por onde a conversa passou e por que mudou de
   lugar. Tabela, porque é cronologia, não status de trabalho (a regra de ouro do painel proíbe outra
   tabela **de status de PR**; esta é de superfícies e não conflita):

   | quando | superfície | quem entrou | por que mudou |
   |---|---|---|---|
   | 30/07 09:48 | [#helpdesk-comunicacao](url) (thread) | Mariana, Alex | origem: chamado da escola |
   | 31/07 09:46 | [DM Bruno](url) | Bruno | Ana levou o texto para validação antes de postar |
   | 31/07 16:05 | [#agenda-e-conversas-ptd](url) (thread) | Cla, Torres | Alex escalou para design + EM |

   - **Toda superfície nova é registrada aqui na mesma rodada em que é lida.** Migração de contexto é
     comportamento normal do trabalho, não exceção: quem escala uma conversa não avisa o board.
   - **Ao registrar uma superfície nova, comparar o que foi levado com o que o dossiê tem.** Quando
     alguém encaminha um resumo, quase sempre encurta. O que ficou de fora (ressalva, número, risco) e
     que os novos interlocutores **não** viram vira linha de pendência no painel ou item do Próximo
     Movimento. Este é o erro que o rastro existe para pegar: o time novo decidindo com menos informação
     do que o board tem, e ninguém percebendo.
   - A superfície anterior não é abandonada em silêncio: ela ganha `status: migrada` (ou `parada`, se
     ficou pendência aberta lá) no `surfaces:` do frontmatter, e o que restou nela vira pendência.

7-quater. **🔬 Achados de codebase (dossiê acumulado)** *(só no perfil conversa)* — o ativo mais caro do
   board: os fatos verificados em código pelos prospectors, acumulados por rodada, agrupados **por repo**
   e em prosa/bullets (nunca tabela).

   - Cada achado carrega **âncora real** (`arquivo:linha`, PR#, commit) e **veredito** contra o claim que
     o motivou: `confirma` / `refuta` / `parcial` / `sem-evidência`.
   - **Achado não expira ao mudar de rodada.** Um fato levantado na rodada 1 continua valendo na rodada 4
     e é o que alimenta a issue no fim. Reprospectar o que já está aqui é desperdício: consultar primeiro.
   - **Achado que foi invalidado não é apagado**, é marcado `~~riscado~~` com o motivo e a rodada em que
     caiu. Saber que uma hipótese morreu, e por quê, vale tanto quanto o fato vivo.
   - **Incertezas e lacunas ficam explícitas**, separadas dos fatos. O que virou pergunta ao interlocutor
     tem que estar rastreável até a linha do painel que a representa.

7-quinquies. **✍️ Rascunhos** *(só no perfil conversa)* — histórico dos drafts, um item por rascunho, em
   prosa:

   ```
   - `Dr0BLK7Q7VUP` — 30/07 17:23, thread #helpdesk-comunicacao — ⚠️ INVALIDADO na rodada 3
     (a seção "caminho que resolve hoje" caiu; não enviar como está)
   - `Dr0BM36YGRE1` — 31/07 11:03, DM Alex — ✅ ENVIADO 11:15
   - `Dr0BM9TEAQM7` — 31/07 13:35, DM Alex — ✅ ENVIADO (encaminhado por Alex ao canal, editado)
   ```

   - Estados: `PENDENTE` (salvo, não enviado), `ENVIADO`, `⚠️ INVALIDADO` (achado posterior derrubou
     parte do texto), `DESCARTADO`.
   - **Rascunho invalidado é evento de primeira classe**: gera linha na Timeline de Eventos (tipo
     `decisão`) e item no Próximo Movimento. Um draft errado parado nos drafts do usuário é uma armadilha
     esperando o dia em que ele apertar enviar sem reler.

## Disciplina de carimbo de data (vale para todos os perfis)

Atualizar o board (painel + próximo movimento) a CADA passo relevante; nunca deixar para o fim. O carimbo
de data (`updated:` no frontmatter, a linha "Última atualização"/TLDR e o timestamp do título do painel)
rola junto a cada atualização e a cada tick do watch. Um board com painel novo e data velha confunde quem
acompanha. Tick sem novidade substantiva: ainda rola a data (sinaliza "vivo, checado agora"), mas não cria
linha nova na Timeline de Eventos Relevantes.
