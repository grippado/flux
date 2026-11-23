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
que gerou (`skills`, `commands`, `agents`, relativos ao destino). Numa rodada seguinte, ele só
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

Round-trip **lido no código, não exercitado em sessão real**. Como no Codex, uma resposta com
escolha na própria sessão é a comprovação de que ele funciona ali; não se exige prova antes da
primeira chamada.

Cai no fallback numerado de [`hitl.md`](hitl.md), com as opções e descrições completas e espera de
escolha explícita no chat, quando qualquer destas condições valer:

- a tool `question` não está disponível para o agent da sessão;
- a chamada é recusada ou volta sem escolha nenhuma;
- a pessoa dispensa a pergunta: o OpenCode encerra o turno, e dispensa não é consentimento;
- o menu do gate não cabe na tool: nunca truncar opção em silêncio;
- a sessão é headless (o bloco de preflight traz `gate_signal:`): vale o sinal `flux-gate/1` de
  [`hitl.md`](hitl.md), "Execução headless".

Nos três primeiros casos, declarar `pergunta estruturada ausente` em `degradacoes:`
([`preflight.md`](preflight.md), Passo 5). Menu que não cabe e sessão headless seguem o numerado
sem o token.

### Adaptador de instruções de agente

Para os agents da família, vale o nome registrado `flux-<nome>`, verificado pela lista de agents da
sessão como manda o Passo 3-bis do [`preflight.md`](preflight.md). Para L1 de override, L2 e L3 de
repo (`.claude/agents/`, `.cursor/agents/`, raízes do manifesto) não foi apurado se o OpenCode os
registra. Quando o nome não estiver na lista da sessão, aplicar literalmente "Adaptador de
instruções de agente" do [`codex-compat.md`](codex-compat.md): resolver uma fonte de instruções
legível, despachar o subagente `general` com o path absoluto e registrar o path no rodapé de
cobertura. Não criar agents no diretório do OpenCode para simular registro.

## Capacidades ausentes

O perfil genérico continua válido sem MCP, vault, Linear, Slack ou specialists, nas mesmas
condições de "Capacidades ausentes" do [`codex-compat.md`](codex-compat.md). Além delas, o OpenCode
não tem `ScheduleWakeup` nem `SendMessage`. O que degrada, por verbo:

- **`reply`**: sem acompanhamento agendado do caso; cada rodada é uma invocação manual.
- **`land`**: sem board-keeper por `SendMessage` e sem re-checagem agendada; e o despacho do
  `iterate` por PR depende de subagente invocar um verbo (abaixo).
- **`iterate`**: a passada roda inteira; o watch segue "Watch do iterate", abaixo.
- **`chain`**: depende de despachar irmãos (abaixo).

### Alcance da L3 e índice de agents

Não há `/add-dir` verificado no OpenCode: `ADDDIR_CMD` fica `UNAVAILABLE` e o degrau 0 sai da escada,
como descrito em "Alcance da L3 e índice de agents" do [`codex-compat.md`](codex-compat.md). O
`flux-agents.json` segue a mesma regra de lá: nasce na raiz de agents que o harness declara, e sem
raiz declarada o `flux:map` diz que não tem destino.

### Elos que despacham irmãos no OpenCode

O Passo 1b do [`preflight.md`](preflight.md) tenta `/flux/` antes de `/`, e é essa a forma que o
instalador expõe. Ela resolve quando a sessão lista os commands `flux/<verbo>`; sem a lista à vista,
`FLUX_CMD` é `UNAVAILABLE` e o texto nomeia o verbo, pela regra do próprio passo.

O que **não foi apurado** é o despacho: um subagente, ou a própria main dentro de um elo, invocar
`/flux/<verbo>` e receber o verbo de verdade, em vez de improvisar. Até uma sessão real comprovar,
toda fase que despacha irmão segue o comportamento de "Elos que despacham irmãos no Codex", em
[`codex-compat.md`](codex-compat.md): `land` aborta a fase de entrega multi-PR, `chain` valida e
imprime o plano mas aborta a execução, `map` imprime as remediações em vez de despachar o `equip`, o
encadeamento fatia-por-fatia do `refine` cai no fechamento padrão, e as ofertas de `reply` e de
Bootstrap imprimem a instrução e não executam. Texto impresso para o usuário digitar continua usando
`${FLUX_CMD}`, que aqui é `/flux/`.

## Watch do iterate

Não foi medido se o fim de um processo em background acorda uma sessão do OpenCode, e o modo
`agendado` depende de `ScheduleWakeup`, que não existe aqui. Hoje, no OpenCode, o watch do `iterate`
está indisponível: o verbo faz a passada inteira, declara a degradação e diz ao usuário que o
reinvoque para a próxima rodada. O caminho de ausência é do verbo, em "`WATCH_WAKE`" do `SKILL.md`
do `iterate`.

## Limites

Worktrees, aprovação humana e verificação externa continuam obrigatórios. Suporte só ao OpenCode V2:
o instalador recusa a 1.x. Mover o checkout quebra os symlinks em silêncio; reinstalar conserta. A
detecção de `HARNESS` depende de variáveis que o OpenCode injeta na tool de shell
(`OPENCODE_SESSION_ID`, `OPENCODE`, `AI_AGENT`), lidas no código e não documentadas como contrato:
se mudarem, `HARNESS` cai para `unknown`, degradação honesta. Claude Code, Cursor e Codex continuam
usando seus próprios adaptadores, com `${FLUX_ROOT}` e `${FLUX_CMD}` preservados.
