---
name: reply
description: "Orquestrador `flux:reply` — acompanha um CASO de trabalho no Slack embasado no codebase; prospecção em paralelo por repo, rascunho no Slack + board vivo no vault; segue o caso quando ele muda de canal; nunca posta sozinho. Global, resolve contexto leve via flux-context.json (VAULT_ROOT, VAULT_CTX, NO_EMDASH). Prospector e answerer vêm do manifesto; sem eles, cai em general-purpose."
user-invocable: true
---

# /flux:reply

Skill orquestradora para **acompanhar um caso de trabalho no Slack com embasamento de codebase**, despachada por verbo. Coleta a conversa, delega a colheita de fatos a prospectors (um por repo, em paralelo), delega a redação ao answerer, mantém um **board vivo** no vault Obsidian, e só age no Slack (salvar rascunho, reagir) após escolha explícita do usuário.

A ação recomendada é sempre **salvar como rascunho** (`slack_send_message_draft`), para o usuário revisar antes de enviar. **Nunca** envia mensagem de fato sozinho.

**A unidade de trabalho é o CASO, não a thread.** Uma discussão de trabalho raramente fica onde nasceu: sai do helpdesk, vira DM para validação, e volta como thread num canal de time com mais gente. Isso é normal, não excepcional. O board acompanha o caso por todas as superfícies (ver `## Casos multi-superfície`), em vez de deixar cada mudança de canal virar uma nota órfã.

**Formato do board:** `${FLUX_ROOT}/shared/board-template.md`, **perfil conversa** (`type: thread`). As seções, a legenda de ícones e a disciplina de carimbo de data vivem lá e não são repetidas aqui. Editar o formato = editar aquele arquivo.
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Disciplina de fan-out (regra pétrea da família):** `${FLUX_ROOT}/shared/fanout-discipline.md`

## Banner de perfil — gabarito (copiar VERBATIM)

Todo output deste elo **abre** com o banner. Ele não é decoração: é o que impede uma execução
degradada de se passar por uma completa. O gabarito mora aqui, no corpo do elo, porque um gabarito
que só existe num shared não chega ao contexto na hora de emitir — e o que sai é um banner
improvisado, com campos inventados e sem o `nivel`.

Copiar com as cercas, trocando só o que está entre chaves. Regras dos campos e casos de degradação
em `${FLUX_ROOT}/shared/preflight.md`, Passo 5.

````
```
perfil: {nome do manifesto | generico}{ (ancora: alvo <path>)} · nivel: {FULL|REDUCED|THIN}
prospector: {agente} · answerer: {agente}
degradacoes: {soft ausentes e o que se perde com cada um | nenhuma}
```
````

Este elo **não** resolve reviewer holístico (o trabalho de agente aqui é do prospector e do
answerer), então o campo `holistico:` **não entra no banner**. Declarar um agente que o elo não
resolveu nem verificou é o oposto do que o banner existe para fazer.

Abortagem segue o gabarito do "Formato da mensagem de abortagem" do preflight, também verbatim, e o
nome do elo na primeira linha usa `${FLUX_CMD}` já substituído (`/flux:reply` num harness,
`/flux-reply` em outro) — nunca `flux:` literal.

## Step 0-context: resolver perfil (leve)

Seguir o protocolo de `${FLUX_ROOT}/shared/flux-context.md` — procurar `flux-context.json` em `.claude/` subindo a árvore a partir do `cwd`. Extrair apenas:

- `VAULT_ROOT` = `vault_root` (onde persistir o board e o sidecar de watch)
- `VAULT_CTX` = `vault_context` (campo `context:` no frontmatter do board)
- `NO_EMDASH` = `no_emdash` (regra de travessão em textos externos)
- `REPOS` = `repos` (repos conhecidos do contexto, para resolver checkouts locais)
- `WORKSPACE_ROOT` = pai do diretório `.claude/` onde o manifesto foi encontrado; sem manifesto: `pwd`
- `PROSPECTOR` = `slack_prospector` do manifesto; sem o campo: `general-purpose`
- `ANSWERER` = `slack_answerer` do manifesto; sem o campo: `general-purpose`
- `MCP_SLACK` = `mcp.slack` do manifesto; sem o campo: descobrir a capacidade na sessão (ver "Validar ambiente")

> **Nota:** `slack_prospector` e `slack_answerer` são campos **opcionais** do manifesto. Declará-los é
> o que troca o `general-purpose` genérico por agentes que conhecem os repos e o tom do time, e é a
> diferença entre uma réplica correta e uma réplica boa. Sem eles o comando roda, com prospecção mais
> rasa: declarar a perda no banner de perfil.

Sem manifesto: `VAULT_ROOT` = não persiste por default (só imprime o board no chat); `VAULT_CTX` = `generic`; `NO_EMDASH` = `false`; `PROSPECTOR`/`ANSWERER` = `general-purpose`.

## Verbos

| Verbo | Aliases | Semântica | Saída |
|-------|---------|-----------|-------|
| `responder` | `draft`, `reply` | Núcleo. Lê a conversa, colhe dados, redige resposta embasada, julga (Maria Bonita), cria/atualiza o board, oferece rascunho. Depois fica vigiando (watch default), salvo `--once`. | board em `<VAULT_ROOT>/0-inbox/` + rascunho Slack |
| `acompanhar` | `watch` | Igual ao `responder`, forma explícita do modo watch (fica de olho nas superfícies do caso; novidades realimentam o board). | mesmo board, cresce por rodada |
| `mudou` | `migrou`, `move` | **Migração explícita de contexto.** O o usuário informa que o caso continua em outro lugar. Registra a superfície nova no board existente (sem criar board novo), lê o que já rolou lá, reconcilia o que foi levado contra o dossiê, e segue o pipeline normal a partir da superfície nova. | mesmo board + nova superfície |

`resumir` e `reagir` são fase 2 (reusam a mesma infra) — não implementados aqui.

## Step 1 — Resolução de verbo, flags e alvo (sempre primeiro)

Parse de `"$@"` num loop bash:

```bash
VERB=""; WATCH=true; ONCE=false; BOARD=""
TARGETS=()                                   # pode haver MAIS DE UM permalink (ver Casos multi-superfície)
expect_board=false
for arg in "$@"; do
  if $expect_board; then BOARD="$arg"; expect_board=false; continue; fi
  case "$arg" in
    responder|draft|reply)          VERB="responder" ;;
    acompanhar|watch)               VERB="acompanhar" ;;
    mudou|migrou|move)              VERB="mudou" ;;
    --once|--no-watch)              ONCE=true ;;
    --board)                        expect_board=true ;;
    https://*.slack.com/archives/*) TARGETS+=("$arg") ;;
  esac
done
# sem verbo + target Slack => responder (backward-compat)
[ -z "$VERB" ] && [ ${#TARGETS[@]} -gt 0 ] && VERB="responder"
# 2+ permalinks sem verbo explícito => o caso mudou de lugar
[ ${#TARGETS[@]} -gt 1 ] && [ "$VERB" = "responder" ] && VERB="mudou"
# acompanhar é a forma explícita do watch; --once desliga em qualquer verbo
[ "$ONCE" = true ] && WATCH=false
TARGET="${TARGETS[-1]}"                      # a superfície ATUAL é sempre a última informada
```

- Se não há permalink Slack válido em `TARGETS`, **abortar** com mensagem pedindo o link (`/flux:reply responder <permalink>`).
- **A superfície atual é a ÚLTIMA da lista.** Quando o usuário passa dois links ("era nessa thread, agora o papo tá aqui"), o primeiro é histórico e o último é onde a conversa está viva agora.
- `--board <path>` assume um board existente em vez de procurar/criar. Atalho para quando o usuário já sabe qual é.
- **Watch é DEFAULT-ON**: depois da 1ª passada, o comando fica vigiando o caso até assentar. `--once` (alias `--no-watch`) faz uma passada só.
- **Linguagem natural conta como sinal de migração.** Se o pedido do usuário descreve movimento ("moveram pra cá", "o papo continuou em", "mandei por DM e ele respondeu em", "agora tá no canal X"), tratar como `mudou` mesmo sem o verbo literal. Ele não vai lembrar de digitar o verbo; o comando é que tem que reconhecer a situação.

### Resolver o permalink → `channel_id` + `thread_ts`

Formato Slack: `https://<workspace>.slack.com/archives/<CHANNEL_ID>[/p<DIGITS>][?thread_ts=<TS>&cid=<CHANNEL_ID>]`.

```bash
CHANNEL_ID=$(echo "$TARGET" | sed -E 's#.*/archives/([^/?]+).*#\1#')
PTS=$(echo "$TARGET" | sed -nE 's#.*/p([0-9]+).*#\1#p')
if [ -n "$PTS" ]; then
  MSG_TS="${PTS:0:${#PTS}-6}.${PTS: -6}"                    # insere o ponto 6 casas da direita
  THREAD_TS=$(echo "$TARGET" | sed -nE 's#.*[?&]thread_ts=([0-9.]+).*#\1#p')
  [ -z "$THREAD_TS" ] && THREAD_TS="$MSG_TS"                # sem thread_ts na query => a msg apontada é a raiz
  KIND=$([ "${CHANNEL_ID:0:1}" = "D" ] && echo dm || echo thread)
else
  MSG_TS=""; THREAD_TS=""                                   # link de canal/DM inteiro, sem mensagem específica
  KIND=$([ "${CHANNEL_ID:0:1}" = "D" ] && echo dm || echo channel)
fi
```

- Se a query tem `thread_ts=`, esse é o ts da **raiz** da thread (a mensagem apontada é uma réplica); senão, o `p`-ts é a própria raiz.
- **Link sem `/p<ts>` é legítimo e comum** (é o que o Slack dá ao copiar link de uma DM ou de um canal). Nesse caso não há thread: a leitura é `slack_read_channel`, não `slack_read_thread`, e `thread_ts` fica `null` no `surfaces:` do board. Não abortar por falta de `p`-ts.
- `channel_id` que começa com `D` é DM; `C` é canal. Isso define `kind` no `surfaces:` e decide a ferramenta de leitura.

### Validar ambiente

Confirmar que as MCP tools do Slack estão disponíveis, no prefixo `${MCP_SLACK}` resolvido do manifesto (campo `mcp.slack` — ver `${FLUX_ROOT}/shared/flux-context.md`). Sem o campo, procurar na sessão um servidor que ofereça as capacidades de Slack; achando mais de um, abrir um GATE (`${FLUX_ROOT}/shared/hitl.md`) perguntando qual usar, em vez de escolher.

Sem canal de Slack nenhum, **abortar** sem gravar nada, dizendo qual prefixo foi procurado e que este elo depende de um MCP de Slack ativo na sessão. Os nomes de tool citados adiante (`slack_send_message_draft`, `slack_add_reaction`, `slack_get_reactions`) são os do servidor de referência: num servidor diferente, usar as tools equivalentes do prefixo resolvido.

## Out of scope (NUNCA faça sem escolha explícita)

- **Nunca** `slack_send_message` (enviar de fato na thread). A ação de enviar é sempre do usuário, no Slack, revisando o rascunho.
- **Nunca** `slack_add_reaction` fora da opção escolhida no menu final (passo 8). Reagir é efeito externo visível.
- Salvar rascunho (`slack_send_message_draft`) é a **única** ação com efeito no Slack que pode ser automática — e só no modo watch em background (é privado, reversível, não notifica ninguém). Na passada interativa, mesmo o rascunho passa pelo menu.
- Não escrever em lugar nenhum exceto: o board no vault (`<VAULT_ROOT>/0-inbox/`), o sidecar de estado do watch (`<VAULT_ROOT>/.slack-watch/`), e o rascunho no Slack quando autorizado.
- Falha graciosa: se um subagent retornar erro/output malformado, **abortar e não gravar board parcial**.

## Casos multi-superfície (migração de contexto)

Um caso vive em N superfícies ao longo do tempo. O board é do **caso**; `surfaces:` no frontmatter é a lista delas.

### Resolver o board antes de criar (SEMPRE)

Antes de criar board novo, procurar um board existente do mesmo caso:

1. **Por superfície:** grep em `<VAULT_ROOT>/0-inbox/` por boards `type: thread` cujo `surfaces[].channel_id` case com `CHANNEL_ID` (e `thread_ts`, quando houver). Casou → é este board, atualiza.
2. **Por permalink histórico:** se o usuário passou mais de um link, casar por **qualquer** um deles. O link antigo é justamente o que reencontra o board.
3. **Por tema, quando 1 e 2 falham:** se a superfície nova for desconhecida mas a conversa citar explicitamente uma thread já registrada (Slack marca `Forwarded message from`, ou o texto traz o permalink), casar por aí.
4. Nada casou → board novo.

**Nunca criar um segundo board para um caso que já tem um.** Caso fragmentado em várias notas é exatamente o problema que o board resolve. Na dúvida entre dois candidatos, abrir um GATE (`${FLUX_ROOT}/shared/hitl.md`) em vez de chutar.

### Registrar a superfície nova

Ao entrar numa superfície que ainda não está no board:

1. **Ler o que já rolou lá** (`slack_read_thread` se há `thread_ts`; `slack_read_channel` se é DM/canal), incluindo as mensagens anteriores à entrada do usuário — o contexto que os outros já construíram importa.
2. **Resolver os interlocutores novos** (`slack_read_user_profile`), inclusive cargo/título: saber que quem entrou é EM, designer ou PM muda o que a resposta precisa endereçar.
3. **Acrescentar a entrada em `surfaces:`** e a linha no 🧭 Rastro do caso, com o motivo da mudança.
4. **Marcar a superfície anterior** como `migrada` (nada pendente lá) ou `parada` (ficou pendência aberta). Pendência que ficou para trás continua no painel, apontando a superfície velha.
5. **Reconciliar o que foi levado contra o dossiê** (passo obrigatório, ver abaixo).

### Reconciliação do encaminhamento (o passo que justifica tudo)

Quando alguém escala a conversa, quase sempre **encurta** o que o usuário escreveu: corta números, ressalvas, riscos. O resultado é um time novo decidindo com menos informação do que o board tem, sem ninguém perceber.

Então, ao registrar superfície nova, **comparar item a item** o que chegou lá contra os 🔬 Achados e o painel:

- O que **não** atravessou e é material (ressalva de escopo, risco, número, achado de segurança) vira **pendência no painel** ou item do 🎯 Próximo Movimento, marcado como "não chegou ao time novo".
- Se o corte muda a decisão que o time novo vai tomar, isso é `🔒 BLOQUEIA`, não `⚪ INFORMATIVA`.
- Registrar linha na Timeline de Eventos, tipo `migração`, dizendo o que foi levado e o que ficou de fora.

### Rascunhos órfãos

Um draft salvo numa superfície que virou `migrada`/`parada` **precisa ser reavaliado**: ou continua válido, ou virou `⚠️ INVALIDADO`. Isso vai para a seção ✍️ Rascunhos e para o Próximo Movimento. Draft errado parado nos drafts do usuário é armadilha esperando o dia em que ele apertar enviar sem reler.

## Pipeline `responder` / `acompanhar` / `mudou`

### 2. Ler a conversa e resolver interlocutores

Na superfície atual (`CHANNEL_ID` + `THREAD_TS` resolvidos no passo 1):

```
# há thread_ts  → slack_read_thread(channel_id=CHANNEL_ID, message_ts=THREAD_TS)   # raiz + réplicas
# não há        → slack_read_channel(channel_id=CHANNEL_ID, limit=N)               # DM ou canal
slack_get_reactions(...)  na mensagem-alvo                                          # reações já existentes
```

**Atenção ao ler thread em canal:** uma mensagem postada num canal frequentemente recebe respostas **no canal**, não na thread dela. Se `slack_read_thread` voltar sem réplicas, ler também o canal em volta (`slack_read_channel` com `oldest` no ts da mensagem) antes de concluir que ninguém respondeu. Concluir "sem resposta" quando havia resposta no canal é erro de fato no board.

Para cada autor distinto, resolver nome + `user_id` (`slack_search_users` / `slack_read_user_profile`) — necessário para as menções `<@ID>` do rascunho e para o campo `participants` do board. Resolver também **cargo/título** dos interlocutores novos. Guardar o handle do canal (`#nome`) para o menu e o frontmatter.

Se o verbo é `mudou` (ou a superfície é nova), executar aqui a rotina de `## Casos multi-superfície`.

### 3. Extrair repos, tickets e claims

Do texto da thread, extrair:
- **Repos citados** — casar contra a lista de `REPOS` do contexto resolvido (ou contra repos detectados localmente em `WORKSPACE_ROOT` se sem manifesto).
- **PRs / tickets** — regex `#\d+` e `[A-Z]{2,5}-\d+` (ex.: `ENG-4122`).
- **Claims / perguntas** — as afirmações e dúvidas que pedem embasamento de código.

Mapear cada repo → checkout `<WORKSPACE_ROOT>/<repo-slug>` (confirmar com `ls`). Repo sem checkout local vira alvo cross-repo → LACUNA (o answerer degrada com tom assertivo + hedge, decisão do usuário).

Para cada PR/ticket extraído, **derivar e guardar a URL canônica** — ela é obrigatória no rascunho (ver `## Convenção de citações`).

### 3a. Convenção de citações (PADRÃO de escrita de rascunho)

Toda referência a **PR** (`#NNNN`) e a **issue do Linear** (`ABC-NNNN`) no rascunho Slack **DEVE** virar hyperlink mrkdwn `<url|texto>`, nunca texto cru. O texto visível permanece a citação curta (`#1077`, `ENG-4308`); só o alvo do link é a URL. Aplicar em **todas** as ocorrências, inclusive repetidas.

Derivação da URL canônica:
- **PR** `#NNNN` → `https://github.com/<ORG>/<repo>/pull/NNNN`, onde `<repo>` é o repo ao qual a PR pertence (inferido do contexto; se ambíguo, resolver antes de linkar).
- **Issue Linear** `ABC-NNNN` → URL Linear canônica da issue.

Se a URL não puder ser resolvida com confiança, manter o texto cru **e** registrar como incerteza no board (seção 🔬 Achados).

### 4. Fan-out: colher fatos de codebase (paralelo)

**Antes de disparar, consultar o dossiê.** Se o board já existe, ler a seção 🔬 Achados de codebase e **descontar dos claims** o que já está verificado. Reprospectar fato já ancorado (`arquivo:linha`) é desperdício de tempo e de contexto, e ainda arrisca produzir uma segunda versão divergente do mesmo achado. O que sobra depois do desconto é o escopo real desta rodada.

Um investigador **por repo com checkout**, disparados **em paralelo** via Task tool:

- **Se o repo tem suite nativa de agents** no ambiente (`<SPECIALISTS_ROOT>` resolvido para o repo existir): delegar ao `repo-owner` do repo, passando os claims daquele repo como escopo.
- **Senão**: usar `subagent_type: <PROSPECTOR>`, passando `{repo-slug, checkout, claims}`.

**Passar ao investigador o que já é sabido**, marcado como base a não re-verificar. Isso muda a qualidade do retorno: o prospector gasta o esforço na fronteira do desconhecido, não reconfirmando o que já está no board.

Cada investigador retorna `ACHADOS` (claim → `confirma|refuta|parcial|sem-evidência` + `arquivo:linha`/PR#) + `LACUNAS`. Repos sem checkout não disparam agent: entram direto como LACUNA.

**Achado novo que contradiz achado antigo:** não sobrescrever em silêncio. O antigo vai para `~~riscado~~` com o motivo e a rodada da queda; o novo entra vivo. Se o achado derrubado sustentava um rascunho já salvo, esse rascunho vira `⚠️ INVALIDADO` (ver `## Casos multi-superfície`).

### 5. Fan-in: redigir + julgar

Delegar ao `<ANSWERER>` (um só) via Task tool, passando:
- A thread na íntegra (mensagens + autores + ts).
- Os `ACHADOS` de todos os investigadores.
- Os perfis dos interlocutores (nomes + `user_id`).
- As reações existentes na mensagem-alvo.
- Contexto: canal, se a raiz é do próprio usuário, e qual mensagem motivou esta rodada.

Passar também, quando o board já existe: as **pendências em aberto** do painel (para o rascunho não repetir pergunta já feita nem ignorar pergunta que ficou sem resposta) e o **dossiê acumulado** (para o rascunho poder citar fato de rodada anterior sem reprospecção).

O answerer retorna `JULGAMENTO` (`responder|reagir|nada` + emoji se `reagir`), `RASCUNHO` (Slack-safe), `PONTO_DE_ATENCAO` e `ATA` (a matéria-prima da Timeline Verbosa e do delta do painel). Guardar como `ANSWER`.

### 6. Carimbo Maria Bonita

Invocar `Skill(maria-bonita)` uma vez para carimbar o veredito de 1 linha no chat e sanity-check do corte `responder/reagir/nada`. É a voz de fechamento; não duplica a lógica (que já vive no answerer), só confirma e dá o tom.

### 7. Criar / atualizar o board

Resolver o board conforme `## Casos multi-superfície` (procurar antes de criar). Path e naming em `## Board no vault`.

- **Caso novo**: criar o arquivo já com o painel montado (mesmo que várias pendências comecem `🟡 ABERTA`) e **anunciar o caminho no chat**. O board nasce cedo, não no fim.
- **Caso existente**: atualizar **as seções afetadas** — painel (delta de pendências), 🧭 Rastro (se houve migração), 🔬 Achados (fatos novos + riscados), ✍️ Rascunhos, Timeline Verbosa (append), Timeline de Eventos, Próximo Movimento (reescrito, não anexado). Nunca criar arquivo novo para um caso que já tem board.
- **Todo tick rola o carimbo de data** (frontmatter `updated:`, TLDR, título do painel), mesmo tick sem novidade.

Usar Write/Edit. Se `ANSWER` veio malformado, abortar sem gravar.

**Escritor único no watch.** Com o watch ligado, o board é mantido por um **board-keeper** (subagente nomeado, criado junto com o board e retomado por `SendMessage` a cada tick com o delta) — contrato em `${FLUX_ROOT}/shared/fanout-discipline.md`. Assim o `board-template.md` e o `CLAUDE.md` do vault nunca entram no contexto principal, e a main nunca relê o board. Com `--once`, não criar keeper: é uma escrita só, a main grava direto.

### 8. Resposta minimalista no chat

Depois de gravar:

```
Board em {caminho-completo}.

Veredito: {responder|reagir|nada} — {1 frase do racional}.
{se houve migração: linha dizendo o que NÃO atravessou para a superfície nova}
```

Não repetir o rascunho inteiro no chat. O board é a fonte de verdade. Em seguida, ir ao passo 9 (passada interativa) ou entrar no watch (tick de background).

### 9. Menu de ação (GATE — `${FLUX_ROOT}/shared/hitl.md` —, só na passada interativa)

Single-select, recomendada na posição 1, **condicionada ao `JULGAMENTO`**. Nunca agir sem escolha positiva.

**`JULGAMENTO = responder`** — "Rascunho pronto para a thread em `#{canal}`. O que fazer?":
1. `💬 Salvar como rascunho no Slack (Recomendado)` — `slack_send_message_draft(channel_id, texto, thread_ts=THREAD_TS)`. Fica nos drafts do usuário para revisar e enviar. **Nunca** `slack_send_message`.
2. `Salvar rascunho + acompanhar` — grava o draft e entra no watch.
3. `Só documentar (não rascunhar agora)` — o board já está atualizado, encerra.
4. `Reagir com emoji em vez de responder` — mostra emoji sugerido, confirma, `slack_add_reaction`.
5. `Não fazer nada`.

**`JULGAMENTO = reagir`** — "A thread não pede resposta nova, só um aceno. Reagir?":
1. `👍 Reagir com {emoji sugerido} (Recomendado)` — `slack_get_reactions` (evita duplicar) → `slack_add_reaction`.
2. `Escolher outro emoji`.
3. `Rascunhar resposta mesmo assim` — cai no fluxo de `responder`.
4. `Não fazer nada`.

**`JULGAMENTO = nada`** — "Maria Bonita: essa thread não pede sua interação agora. Confirmar?":
1. `Só documentar e encerrar (Recomendado)`.
2. `Acompanhar mesmo assim` (entra no watch, caso espere desdobramento).
3. `Forçar rascunho de resposta`.

**Heurística de PR própria:** se a mensagem **raiz** da thread é do próprio usuário e o que falta é resposta de terceiros, a recomendada de `responder` passa a ser a opção `Salvar rascunho + acompanhar` (o próximo movimento é dos outros, não dele).

Se a thread é só ruído (nada acionável e `JULGAMENTO = nada` sem desdobramento esperado), pular o passo 9 e encerrar.

### 10. Watch (se `WATCH = true`)

Entrar no loop de polling (ver `## Modo watch`).

## Board no vault

**O formato é fonte única compartilhada:** siga `${FLUX_ROOT}/shared/board-template.md`, **perfil conversa** (`type: thread`). Todas as seções (Frontmatter → H1+TLDR → 🎯 Próximo Movimento → 📊 Painel → ⏰ Timeline Verbosa → 📅 Timeline de Eventos → ✅ Ação/Continuidade → 🧭 Rastro do caso → 🔬 Achados → ✍️ Rascunhos), a legenda de ícones, a regra do painel e a disciplina de carimbo de data vivem lá e **não são repetidas aqui**.

Parâmetros específicos deste comando:

- **Path**: `<VAULT_ROOT>/0-inbox/`. Sem manifesto: imprimir o board no chat em vez de gravar.
- **Nome**: `AAAA-MM-DD-HHMM-flux-reply-<slug-do-caso>.md`, com a data/hora da **criação** do board (não muda quando o caso migra). Slug em kebab-case ASCII (sem acento) descrevendo **o caso**, não a superfície: tema + ticket ou escola/produto. Ex.: `2026-07-30-1723-flux-reply-canal-institucional-read-only.md`. O infixo `flux-reply` nomeia o comando que gerou o board, distinguindo-o das atas legadas na listagem do 0-inbox; o slug não carrega o nome do canal, justamente porque o canal muda.
- **Colisão** no mesmo dia com caso **diferente** → sufixo `-v2`. Mesmo caso → mesmo arquivo, sempre (ver `## Casos multi-superfície`).
- **Painel**: lista **pendências** (pergunta em aberto / decisão travada / compromisso assumido), não superfícies. As superfícies vão no 🧭 Rastro do caso.
- **`execution_status`**: `open` enquanto o caso roda; `done` quando resolve; `dropped` se morre sem desfecho.

### Regra Slack-safe (vale para os blocos de rascunho dentro do board)

Dentro de qualquer bloco de rascunho: nada de headers `#` nem tabelas markdown. Só `*bold*`, `_italic_`, bullets, crase tripla, `>`, `<@ID>` e hyperlinks `<url|texto>`. Toda citação de PR/issue linkada conforme `## Convenção de citações`. O resto do board é markdown normal (é doc interno do vault).

## Modo watch (default-on)

- **Ferramenta**: `ScheduleWakeup` (não `Monitor`, não `Bash sleep`). Cada wake processa **um tick**; ao fim, agenda o próximo reentrando com `/flux:reply acompanhar <permalink-da-superfície-atual>`. Omite o `ScheduleWakeup` só nas condições de saída.
- **O watch é do CASO, não de uma thread.** Cada tick varre **todas as superfícies com `status: ativa`** do board (tipicamente uma, às vezes duas durante uma migração). Uma superfície `migrada` sai da varredura; uma `parada` continua sendo checada de vez em quando, porque pendência aberta lá pode ser respondida a qualquer momento.
- **Estado por caso** (sidecar, fora do git): `<VAULT_ROOT>/.slack-watch/<slug-do-caso>.json`:
  ```json
  {
    "case_slug": "canal-institucional-read-only",
    "board_path": "<VAULT_ROOT>/0-inbox/AAAA-MM-DD-HHMM-slack-....md",
    "surfaces": [
      { "channel_id": "CXXXXXXXX", "thread_ts": "1720012800.123456",
        "kind": "thread", "status": "parada", "lastSeenTs": "1720016400.000200" },
      { "channel_id": "CYYYYYYYY", "thread_ts": "1720100000.000100",
        "kind": "thread", "status": "ativa",  "lastSeenTs": "1720100500.000300" }
    ],
    "round": 1,
    "quietTicks": 0,
    "startedAt": "<ISO>",
    "lastTickAt": "<ISO>"
  }
  ```
  Sidecar antigo no formato por-thread (`<channel_id>-<thread_ts>.json`) continua sendo lido: migrar para o formato por-caso na primeira oportunidade, preservando `lastSeenTs`. Se o sidecar sumir, reconstruir do `surfaces:` do board e do maior `ts` registrado na Timeline (o board é a fonte durável).
- **Cadência do `delaySeconds`** (Slack é mais lento que CI): caso quente (mensagem nova nos últimos ~15min) → **600s**; caso morno (aguardando, sem novidade) → **1800s**. `reason` específico, ex.: `"watch caso canal-read-only: aguardando Torres em #agenda-e-conversas-ptd, re-checo em 1800s"`.
- **Detecção de delta**: cada tick lê cada superfície ativa (`slack_read_thread` se há `thread_ts`, senão `slack_read_channel`) e computa o delta = mensagens com `ts > lastSeenTs` **daquela superfície**, excluindo as do próprio usuário e as triviais (só emoji / "valeu" / 👍 / LGTM). Numa superfície de canal, checar também respostas **no canal** à mensagem-raiz, não só na thread.
- **Ação por tick (background, o usuário ausente):**
  - Delta não vazio → roda passos 2-7 com escopo no delta. Para cada mensagem nova, o answerer julga:
    - `responder` → **auto-salvar o rascunho** (`slack_send_message_draft` na superfície certa, privado e reversível) + registrar em ✍️ Rascunhos e na Timeline. **Nunca** enviar.
    - `reagir` → registrar o emoji sugerido como **pendência** no board. Não reagir sozinho.
    - `nada` → registrar "sem ação: {motivo}" na Timeline Verbosa.
    - `round++`, atualizar `lastSeenTs` **da superfície**, zerar `quietTicks`.
  - **Delta que revela superfície nova** (alguém encaminhou o caso para outro canal, ou o usuário foi marcado em outro lugar sobre o mesmo assunto) → rodar `## Casos multi-superfície`: registrar em `surfaces:`, reconciliar o encaminhamento, e passar a varrer a nova. **Não abrir board novo.**
  - Delta vazio em todas as superfícies ativas → `quietTicks++`.
  - **Toda pendência do painel envelhece**: um tick que encontra pendência `🔒 BLOQUEIA` parada há mais de ~2 dias promove ela no 🎯 Próximo Movimento e diz isso no relatório de saída.
- **Condição de parada ("assentou"):**
  - Caso resolvido (desfecho detectado ou o usuário encerrou) → `execution_status: done` e todas as pendências fechadas ou explicitamente transferidas (para uma issue, um board de delivery, ou o backlog).
  - `quietTicks >= 3` (sem novidade por ~1h30 morno) → encerra avisando.
  - Guardrails: `round > 8` ou watch ativo > ~8h → para e pede olhada manual.
  - Usuário interrompe a sessão.
  - Em qualquer saída: relatório no chat (rodadas, superfícies varridas, **rascunhos salvos pendentes de envio**, **rascunhos invalidados**, reações sugeridas pendentes, pendências `🔒 BLOQUEIA` em aberto e de quem é a bola).

## Notas finais

- **PT-BR com acentuação correta** em todo o conteúdo. Termos técnicos em inglês quando natural.
- **Sem em-dashes** (—) em qualquer texto que possa ir para o Slack (rascunho, reação) quando `NO_EMDASH == true`. Vírgula, dois-pontos, parênteses no lugar.
- **Citações viram hyperlink**: toda menção a PR (`#NNNN`) e issue do Linear (`ABC-NNNN`) no rascunho é renderizada como link mrkdwn `<url|texto>` (ver `## Convenção de citações`). Texto cru só quando a URL não puder ser resolvida com confiança.
- **Resposta no chat é minimalista**: path do board + veredito de 1 linha. Não repetir o rascunho no chat.
- **Um caso, um board.** Antes de criar, procurar (`## Casos multi-superfície`). Caso espalhado em várias notas é o problema que o board existe para resolver.
- **O dossiê é o ativo.** Os 🔬 Achados sobrevivem às rodadas e são o insumo direto de `/flux:issue` quando o caso vira issue. Reprospectar o que já está ancorado é desperdício; contradizer sem riscar o antigo é perda de rastro.
- Se a leitura do Slack falhar (canal sem acesso, permalink inválido), avisar e abortar sem gravar parcial.
- **Elo com o resto da família:** caso que amadurece vira issue por `/flux:issue` (que consome o dossiê), e entrega multi-PR vira `/flux:land`. Registrar o link forward na seção ✅ Ação / Continuidade quando isso acontecer. O cross-link fecha dos dois lados: o board de exploração do `/flux:issue` grava o path deste board em `origin_board:` (perfil exploração do `board-template.md`).
- O comando roda em **workspace mode**, com o plugin `slack@claude-plugins-official` e os agents `<PROSPECTOR>`/`<ANSWERER>` disponíveis.
