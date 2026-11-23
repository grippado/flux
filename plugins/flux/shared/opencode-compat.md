# Adaptador OpenCode

Este arquivo é a ponte entre os contratos compartilhados do Flux e o runtime do OpenCode V2. As
skills, agents e templates continuam sendo uma única fonte; o harness só troca a forma de
descobrir recursos, delegar trabalho e anunciar limitações. Onde o comportamento é o mesmo do
Codex, este arquivo aponta para [`codex-compat.md`](codex-compat.md) em vez de repetir.

Tudo o que está aqui foi lido no código do OpenCode V2, não exercitado numa sessão real. Cada
afirmação que depende de execução está marcada como não apurada, com o caminho de degradação.

## Recursos

A instalação é feita por `scripts/install-opencode.sh`, no destino
`${FLUX_OPENCODE_DIR:-~/.config/opencode}`:

- `skills/flux-<verbo>/` é um **symlink** para `plugins/flux/skills/<verbo>/` do checkout. O
  OpenCode usa o nome do diretório pai como ID da skill, sem namespace de plugin, e por isso o
  prefixo `flux-` está no diretório. O `name:` do frontmatter não é reescrito.
- `commands/flux/<verbo>.md` é gerado: o OpenCode nomeia o command pelo caminho relativo, então o
  verbo é invocado como `/flux/<verbo>`. O corpo manda carregar a skill `flux-<verbo>` pela tool
  `skill` e repassa `$ARGUMENTS`; um command não referencia skill por frontmatter.
- `agents/flux-<agent>.md` é gerado a partir de `plugins/flux/agents/`, com frontmatter V2.

Resolver `${FLUX_ROOT}` pelo candidato 5 do Passo 1a do [`preflight.md`](preflight.md). A tool
`skill` entrega `Base directory for this skill: <dir>` com o caminho do link, sem realpath; o
`readlink -f` do `SKILL.md` leva ao checkout, e dois níveis acima está `plugins/flux`, com `shared/`,
`agents/` e `scripts/` como irmãos. O candidato 6 (`${FLUX_HOME}`) fica de fallback: o instalador
imprime o `export`, não grava em arquivo de shell. Não copiar nem duplicar os contratos
compartilhados: uma cópia da skill quebraria o candidato 5, porque dois níveis acima dela é o
diretório de configuração do OpenCode.

**Kits.** Como no Codex, a raiz não vem dos candidatos 1 a 3, então o degrau 3 do `KIT_ROOTS`
(Passo 1d do [`preflight.md`](preflight.md)) não é consultado, e o elo declara
`kit origem nao consultada`. A remediação é declarar `kits` no manifesto
([`codex-compat.md`](codex-compat.md), "Recursos").

**Manifesto de instalação.** O instalador grava em `$DEST/.flux-install.json` a lista dos caminhos
que gerou (`skills`, `commands`, `agents`, relativos ao destino) e `source`, o caminho absoluto de
`plugins/flux` no checkout de origem. Os quatro campos são contrato: `source` é lido pela CLI como
candidato 7 da cascata de `FLUX_ROOT` (Passo 1a do [`preflight.md`](preflight.md)), e mudar o nome
ou o formato dele exige mudar a CLI junto. Numa rodada seguinte, ele só
sobrescreve ou remove o que estiver listado ali, e por isso um verbo ou agent que saiu da família
também sai do destino. O que existe nos mesmos lugares (`skills/flux-*`, `commands/flux/*.md`,
`agents/flux-*.md`) e não está no manifesto fica, com aviso: um specialist L2 registrado como
`agents/flux-repo-owner.md` ou um command de terceiro em `commands/flux/` sobrevivem a qualquer
reinstalação. Numa instalação feita antes do manifesto existir, conta como gerado só o que bate com
o que a versão anterior produzia: skill que é symlink para `.../plugins/flux/skills/<verbo>`, command
cujo corpo é exatamente o que manda carregar a skill `flux-<verbo>`, e agent byte a byte igual ao que
o gerador produz da fonte atual.

Antes de tocar no destino, o instalador lê e valida todos os frontmatters da fonte e o manifesto, e
recusa com erro, sem alterar nada, a forma que não entende: valor em bloco `>` ou `|`, escape
inválido entre aspas duplas, comentário inline num valor, `readonly` que não seja `true` ou `false`.
Cada arquivo é gerado num diretório temporário dentro do destino e trocado no lugar por rename, e o
manifesto é o último a ser gravado.

**Colisão de ID.** Na colisão de ID de skill o último carregado vence, e o OpenCode também lê
`~/.claude/skills` e `~/.agents/skills`. O instalador avisa quando encontra `flux-<verbo>` nesses
lugares. No destino, um `skills/flux-<verbo>` que não é dele fica, e o command `/flux/<verbo>`
daquele verbo não é instalado.

## Delegação

Onde um contrato Claude/Cursor disser `Task tool`, o adaptador OpenCode usa a tool `subagent`. O
resto do protocolo não muda: vale [`fanout-discipline.md`](fanout-discipline.md) como está escrito.
O agent `general` do OpenCode tem `question` e `subagent` negados. Para os agents `flux-*` gerados
sem `permissions`, o default não foi apurado; vale de qualquer forma a regra da família de que
subagente não abre gate com o usuário.

Os agents da família ficam registrados como `flux-<nome>` (`flux-pr-reviewer`,
`flux-issue-creator`, `flux-sentry-prospector`, `flux-datadog-prospector`). É a segunda forma do
genérico no Passo 3 do [`preflight.md`](preflight.md), que já a tenta; nenhuma forma nova é
necessária. O `flux-pr-reviewer` sai read-only por `permissions`: nega `*` e libera `read`, `grep`,
`glob`, `shell` e `external_directory`, no padrão do agent `explore` do próprio OpenCode. Nenhum
agent gerado declara `model`: `opus` e `sonnet` não têm tradução para `provider/model`, e sem o
campo o agent herda o model da sessão.

### Perguntas ao usuário

No OpenCode, a pergunta estruturada é a tool `question`. A main renderiza a `GateSpec` validada de
[`hitl.md`](hitl.md) com **uma** entrada em `questions`:

- `question`: o texto da pergunta da spec, literal.
- `header`: rótulo curto do gate, com até 30 caracteres. É o único campo que admite encurtar, e
  encurtar o header nunca encurta pergunta nem opção.
- `options`: uma entrada `{label, description}` por opção da spec, na ordem dela, com a recomendada
  primeiro e a saída inócua por último.
- `multiple`: `false`, salvo quando a spec declara multi-select.

O gate continua na main: o agent primário `build` tem `question` liberado; o `general` não. A resposta
volta como `answers` (uma lista de escolhas por pergunta) na mesma sessão. O OpenCode acrescenta
sozinho um campo de resposta livre; ele não é opção do Flux e uma resposta livre não é escolha de
opção: tratá-la como mensagem do usuário e reapresentar o gate, sem agir.

**Estado: round-trip não comprovado.** O caminho acima foi lido no código do OpenCode, não
exercitado numa sessão real, e [`hitl.md`](hitl.md) só admite a pergunta estruturada com round-trip
comprovado. Até que a comprovação seja registrada nesta seção, com data, versão do OpenCode e o que
se observou (como faz "Perguntas ao usuário" do [`codex-compat.md`](codex-compat.md)), o OpenCode
**não usa a tool `question`**: todo GATE vai ao fallback numerado de [`hitl.md`](hitl.md), e o elo
declara `pergunta estruturada ausente` em `degradacoes:` ([`preflight.md`](preflight.md), Passo 5),
porque o mecanismo estruturado não está disponível como contrato. Registrada a comprovação, a tool
passa a valer com o mapeamento acima e as condições abaixo.

Com a comprovação registrada, cai no fallback numerado de [`hitl.md`](hitl.md), com as opções e
descrições completas e espera de escolha explícita no chat, quando qualquer destas condições valer:

- a tool `question` não está disponível para o agent da sessão;
- a chamada é aceita e volta sem escolha nenhuma: isso não comprova round-trip;
- a chamada é recusada, ou a pessoa dispensa a pergunta (o OpenCode encerra o turno, e dispensa não
  é consentimento);
- o menu do gate não cabe na tool: nunca truncar opção em silêncio;
- a sessão é headless (o bloco de preflight traz `gate_signal:`): vale o sinal `flux-gate/1` de
  [`hitl.md`](hitl.md), "Execução headless".

A semântica do token é a do Codex: só os dois primeiros casos declaram `pergunta estruturada
ausente`. Recusa, dispensa, menu que não cabe e sessão headless seguem o numerado sem o token.

### Adaptador de instruções de agente

Para os agents da família, vale o nome registrado `flux-<nome>`, verificado pela lista de agents da
sessão como manda o Passo 3-bis do [`preflight.md`](preflight.md). O OpenCode não registra os agents
de L1 de override, L2 e L3 que moram nos diretórios do Claude e do Cursor (`.claude/agents/`,
`.cursor/agents/`) e nas raízes do manifesto. Quando o nome não estiver na lista da sessão, vale a
exceção do adaptador de instruções estendida ao OpenCode no Passo 3 do
[`preflight.md`](preflight.md) e no [`review-agents.md`](review-agents.md): aplicar literalmente
"Adaptador de instruções de agente" do [`codex-compat.md`](codex-compat.md), com o subagente
`general` no papel do subagente nativo genérico. Não criar agents no diretório do OpenCode para
simular registro.

## Capacidades ausentes

O perfil genérico continua válido sem MCP, vault, Linear, Slack ou specialists, nas mesmas
condições de "Capacidades ausentes" do [`codex-compat.md`](codex-compat.md). Além delas, o OpenCode
não tem `ScheduleWakeup` nem `SendMessage`. O que degrada, por verbo:

- **`land`** e **`chain`**: abortam a fase de despacho porque `FLUX_CMD` fica `UNAVAILABLE` (abaixo),
  antes de chegar ao board-keeper por `SendMessage` ou à re-checagem agendada.
- **`iterate`**: a passada roda inteira; o watch segue "Watch do iterate", abaixo.
- **`reply`**: o modo watch reagenda o próximo tick por `ScheduleWakeup` reinvocando
  `${FLUX_CMD}reply`, e aqui não há nenhum dos dois. O verbo roda a passada, e a próxima é uma
  invocação manual. O [`codex-compat.md`](codex-compat.md) não dá a essa ausência um tratamento
  próprio no Codex, que tem o mesmo limite, e o Passo 5 do [`preflight.md`](preflight.md) não tem
  token para ela; este item é o registro dela, sem token novo.

### Alcance da L3 e índice de agents

Não há `/add-dir` verificado no OpenCode: `ADDDIR_CMD` fica `UNAVAILABLE` e o degrau 0 sai da escada,
como descrito em "Alcance da L3 e índice de agents" do [`codex-compat.md`](codex-compat.md). O
`flux-agents.json` segue a mesma regra de lá: nasce na raiz de agents que o harness declara, e sem
raiz declarada o `flux:map` diz que não tem destino.

### Elos que despacham irmãos no OpenCode

No OpenCode, `FLUX_CMD` fica `UNAVAILABLE`, como no Codex, e o Passo 1b do
[`preflight.md`](preflight.md) diz isso. O instalador expõe os verbos como commands `/flux/<verbo>`,
mas o que **não foi apurado** é o despacho: um subagente, ou a própria main dentro de um elo,
invocar `/flux/<verbo>` e receber o verbo de verdade, em vez de improvisar. Nenhuma das formas do
Passo 1b conta aqui: os IDs de skill `flux-<verbo>` não são command, e o Passo 1b só aceita command
invocável que a sessão lista.

Com `FLUX_CMD` indisponível, cada elo que despacha irmão reage como descrito em "Elos que despacham
irmãos no Codex" do [`codex-compat.md`](codex-compat.md), inclusive a oferta de aviso pelo `reply`,
a oferta de Bootstrap e o encadeamento do `refine`, e as ofertas de `equip --expose-l3` e `map` de
"Alcance da L3 e índice de agents" de lá. Este arquivo não repete esse comportamento.

**Texto impresso para o usuário.** Vale a regra do Passo 1b para `FLUX_CMD` indisponível: nomear o
verbo. Quando o texto disser a forma que a sessão expõe para o usuário digitar, no OpenCode ela é
`/flux/<verbo>`, que é a que o instalador registra, e só quando a sessão lista o command
`flux/<verbo>`: com colisão de skill o instalador não o cria, e sem a lista à vista o texto fica só
no nome do verbo. Essa forma vale só para o usuário digitar; nunca
entra em prompt de subagente nem no `prompt` de um wake. Quando uma sessão real comprovar o despacho,
o registro com data entra nesta seção e o Passo 1b passa a aceitar `/flux/`.

## Watch do iterate

Não foi medido se o fim de um processo em background acorda uma sessão do OpenCode, e o modo
`agendado` depende de `ScheduleWakeup`, que não existe aqui. Hoje, no OpenCode, o watch do `iterate`
está indisponível: o verbo faz a passada inteira, declara a degradação e diz ao usuário que o
reinvoque para a próxima rodada. O caminho de ausência é do verbo, em "`WATCH_WAKE`" do `SKILL.md`
do `iterate`.

## Comprovações em sessão real

**2026-11-23, OpenCode v2.3.2, `opencode run` headless, modelo `opencode-go/kimi-k3`, verbo
`peek` sobre um working tree descartável.** Comprovado:

- o command `/flux/peek` carrega a skill instalada e segue o corpo dela;
- `FLUX_ROOT` resolve para o checkout do instalador: numa sessão OpenCode (`OPENCODE_SESSION_ID`),
  a CLI lê o `source` do `.flux-install.json` antes da heurística (`flux_root_source:
  "opencode-install-manifest"`). Antes disso, a heurística escolheu o plugin do Claude Code
  instalado na mesma máquina, de outra versão, em quatro sessões seguidas, e instruir o modelo a
  passar `FLUX_HOME` (pelo Step 0-cli ou pelo command gerado) não resolveu. Uma CLI anterior a esta
  versão não conhece o manifesto: com ela, exportar o `FLUX_HOME` que o instalador imprime;
- `HARNESS=opencode`, com o banner saindo `carimbo: opencode | flux:peek@<versão>`;
- o despacho do holístico pela tool `subagent`, pelo nome `flux-pr-reviewer`, e o retorno do
  parecer para a sessão principal;
- o texto impresso para o usuário com a forma `/flux/<verbo>`.

Não comprovado nesta sessão: o round-trip da tool `question` (headless não abre gate), o despacho
de irmão por `/flux/<verbo>` de dentro de subagente e o comportamento interativo.

## Limites

Worktrees, aprovação humana e verificação externa continuam obrigatórios. Suporte só ao OpenCode V2:
o instalador recusa a 1.x. Mover o checkout quebra os symlinks em silêncio; reinstalar conserta. A
detecção de `HARNESS` depende de variáveis que o OpenCode injeta na tool de shell
(`OPENCODE_SESSION_ID`, `OPENCODE`, `AI_AGENT`), lidas no código e não documentadas como contrato:
se mudarem, `HARNESS` cai para `unknown`, degradação honesta. Um Claude Code (ou `flux <verbo>`)
disparado de dentro de uma sessão OpenCode herda `OPENCODE_SESSION_ID` pela tool de shell e sai
carimbado `opencode`, inclusive no rótulo público de atribuição. É limitação conhecida, da mesma
classe da regra do `CODEX_THREAD_ID` no Passo 1a do preflight, e não bug. Claude Code, Cursor e Codex continuam
usando seus próprios adaptadores, com `${FLUX_ROOT}` e `${FLUX_CMD}` preservados.
