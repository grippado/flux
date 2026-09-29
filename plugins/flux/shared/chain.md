# Chain de elos: gramática e contrato

> Fonte única de **como um chain de elos `flux:` é escrito, validado e executado**: a tabela
> verbo, artefato consumido, artefato produzido, a regra de legalidade, o que passa de um elo ao
> seguinte, e o que acontece quando um elo para. **Não duplicar esta lógica** nos verbos: eles
> continuam sem saber que existem dentro de um chain, e o gabarito de banner mora no SKILL do chain.
>
> **Consumidor:** `${FLUX_ROOT}/skills/chain/SKILL.md`, único executor. O CLI parseia e faz
> preflight numa etapa futura (seção "O que não está implementado").

## Princípio (regra pétrea)

**A família encadeia por artefato, não por comando.** `refine` e `probe` escrevem o board que o
`issue` consome; `build` abre a PR que `review` e `iterate` consomem. O chain não cria essa relação:
ele a declara, a valida antes de gastar tempo, e remove a pergunta "e agora?".

Três invariantes governam tudo abaixo:

1. **O chain não abole nenhum gate.** Cada elo mantém os seus HITL (`${FLUX_ROOT}/shared/hitl.md`),
   na main, na ordem em que o elo os abriria sozinho. O chain só passa o baton entre eles.
2. **O chain não é uma procuração.** Não existe `--auto` de chain: a tabela de procurações do
   `hitl.md` não tem linha para ele, e uma flag com semântica de gate que o contrato de gates não
   conhece é um gate invisível. O chain recusa `--auto`; quem quer `--auto` num elo roda o elo.
3. **Validar é gratuito, executar não.** A gramática é checada por inteiro antes do primeiro elo
   rodar. Um chain ilegal custa uma mensagem, nunca uma execução parcial.

## Sintaxe

```
${FLUX_CMD}chain <elo>[><elo>]... <alvo> [flags]
```

Exemplos: `${FLUX_CMD}chain review>iterate 65`, `${FLUX_CMD}chain review>iterate 65 --once`.
A forma de shell abaixo (`flux chain ...`) é a **alvo**: o CLI ainda não parseia chain (ver "O que não está implementado").

- Os elos são nomes de verbo sem prefixo, separados por `>`. Espaço em volta do `>` é ignorado.
- **No shell, o chain vai entre aspas**: `flux chain 'review>iterate' 65`. Sem aspas, o shell trata
  `>` como redirecionamento, cria (ou sobrescreve) um arquivo chamado `iterate`, e quem parseia recebe só
  `chain review 65`: o `>iterate` some antes de chegar a ele.
  Dentro do harness (slash command) as aspas não são necessárias.
- O `<alvo>` é a entrada **do primeiro elo** e de mais nenhum: os seguintes só recebem o baton.
- Mínimo dois elos. Um elo só é o próprio verbo.
- As flags são repassadas aos elos que as declaram na coluna "flags repassadas" abaixo; flag que
  **nenhum** elo do chain declara é recusada, nunca ignorada.

## A gramática

### Artefatos

| artefato | o que é | onde vive |
|----------|---------|-----------|
| `fonte` | entrada livre: ideia, thread, bug, texto, descrição | só nos argumentos; nenhum elo a produz |
| `alvo-telemetria` | link ou consulta de Sentry/Datadog | só nos argumentos; nenhum elo a produz |
| `board` | PRD/TRD/slices (`refine`) ou dossiê (`probe`) no vault | `${VAULT_ROOT}`, perfil do board em `${FLUX_ROOT}/shared/board-template.md` |
| `issue` | issue(s) criadas no tracker | tracker |
| `pr` | PR aberta | GitHub |
| `review` | review persistido no vault, e as threads que o gate de postagem publicou | vault + PR |
| `go-no-go` | veredito de entrega de N PRs | chat e board |

### Tabela de elos

A gramática é de **tipos**: diz quem pode vir depois de quem. Como cada elo recebe o baton (forma do
argumento, repo posicional, retomada de board) é decisão do executor de cada chain, e só a v1 o
decidiu, para `review>iterate`.

| elo | consome (qualquer um) | produz | repassa | flags repassadas (v1) |
|-----|----------------------|--------|---------|------------------|
| `refine` | `fonte` | `board` | | a definir |
| `probe` | `alvo-telemetria` | `board` | | a definir |
| `issue` | `board`, `fonte`, `pr` | `issue` | | a definir |
| `build` | `issue`, `fonte` | `pr` | | a definir |
| `peek` | `pr` | (parecer no chat, não persiste) | `pr` | a definir |
| `review` | `pr` | `review` | `pr` | `--solo` |
| `iterate` | `pr` | (correções na `pr`) | `pr` | `--once`, `--dry`, `--solo`, `--no-rebase` |
| `land` | `pr`, `issue` | `go-no-go` | | a definir |

"A definir" é literal: o chain que usar o elo só passa a repassar flag quando o executor dele existir.

Fora do chain, por decisão e não por esquecimento:

- **`map` e `equip`** são setup, não chain: nenhum trata de uma entrega. Em qualquer posição, o chain
  recusa e aponta o verbo avulso.
- **`reply`** entra por permalink de thread e sai como rascunho de Slack; nenhum elo do ciclo consome
  esse rascunho, e ele não consome nenhum artefato que os outros produzam. Fora até haver vizinho.

**`fonte` e `alvo-telemetria` só são satisfeitos pelos argumentos, e só valem para o primeiro elo.**
Isso é o que faz `build` aceitar uma descrição livre como primeiro elo e recusá-la no meio
(`review>build`, `refine>build`): nenhum elo produz esses artefatos, então eles saem do baton depois
do primeiro elo.

**`pr` em `issue`:** o `flux:issue` já aceita PR como fonte (`${FLUX_ROOT}/skills/issue/SKILL.md`),
então `review>issue` é legal. A issue nasce da **PR** (diff e metadados via `gh`), não do artefato de
review no vault.

**`peek` consome `pr` no chain** embora o verbo aceite também working tree, range, doc e path: o
baton de um chain só carrega PR entre elos.

## Regra de legalidade

O chain carrega um **baton**: o conjunto de artefatos disponíveis. Começa com o que o `<alvo>` é
(`fonte`, `alvo-telemetria` ou `pr`, inferido como o primeiro elo infere) e cresce a cada elo com o que
ele **produz** e **repassa**. `fonte` e `alvo-telemetria` satisfazem **só o primeiro elo** e saem do
baton depois dele. Um elo é legal quando **algum** artefato que ele consome está no baton.

Verificar da esquerda para a direita; a primeira aresta ilegal encerra a validação.

| exemplo | veredito | por quê |
|---------|----------|---------|
| `review>iterate` | legal | `review` repassa `pr`; `iterate` consome `pr` |
| `build>peek>iterate` | legal | `build` produz `pr`; `peek` e `iterate` repassam e consomem `pr` |
| `refine>issue>build>review>iterate` | legal | `board`, depois `issue`, depois `pr`, e `pr` atravessa até o fim |
| `probe>issue` | legal | `probe` produz `board`, que `issue` consome |
| `review>build` | **ilegal** | `build` consome `issue` ou `fonte`; o baton só tem `pr` e `review` |
| `refine>build` | **ilegal** | `build` consome `issue` ou `fonte`; `fonte` só vale para o primeiro elo e o baton tem `board`. Ponte: `refine>issue>build` |
| `iterate>refine` | **ilegal** | `refine` consome `fonte`, e nada produz `fonte` |
| `refine>refine` | **ilegal** | elo adjacente repetido é no-op; recusar em vez de rodar duas vezes |
| `iterate>land` | legal, **dúvida aberta** | ver abaixo |

**Dúvida aberta em `iterate>land`.** O `flux:land` já despacha `iterate` por PR por conta própria
(`${FLUX_ROOT}/skills/land/SKILL.md`). A gramática aceita o chain, mas não está decidido se o `iterate`
avulso na frente é útil ou duplica a primeira iteração daquela PR. Enquanto não decidir, o executor
não o roda (ver v1 abaixo).

### Recusa útil

Um chain ilegal **nunca** termina em "inválido". A recusa segue o estilo de
`${FLUX_ROOT}/shared/scope-gate.md` ("A recusa é útil, ou não é recusa"): diz qual aresta falhou, o
que faltava no baton, e propõe o corte legal. Dois cortes, nessa ordem, cada um só se for legal:

1. **Ponte:** inserir o elo mais curto que produz o artefato que faltava e cuja entrada o baton já
   satisfaz. Para `review>build`, o baton tem `pr`, e `issue` consome `pr`: `review>issue>build`.
2. **Prefixo:** cortar antes do elo ilegal. Para `review>build`: `review`.

```
review>build não roda: build consome issue (ou uma descrição livre no primeiro elo), e review
produz um review, não uma issue.
Cortes legais:
  1. review>issue>build   (a issue nasce da PR; a issue vira PR)
  2. review               (só o prefixo legal)
```

Sem ponte possível, só o prefixo é oferecido. Sem prefixo de dois elos legal, o chain diz que o
pedido é um verbo avulso e cita qual. A recusa nomeia **verbos**, sem prefixo de invocação: ela sai
antes de `FLUX_CMD` ser verificado.

## O que passa entre os elos (baton)

O baton é **referência, nunca conteúdo**: identificador que o elo seguinte usa para reler a fonte da
verdade. Passar o conteúdo copiaria um estado que o GitHub, o tracker ou o vault podem ter mudado no
intervalo.

| baton | forma | quem relê |
|-------|-------|-----------|
| `pr` | URL da PR (`https://github.com/owner/repo/pull/N`), a forma que `review` e `iterate` aceitam. **Resolvida pelo chain no preflight** (`gh pr view <alvo> --json url`), não extraída da saída do elo: o chat do `review` só imprime a URL se o usuário postou. Alvo sem PR aberta (branch local, alvo vazio) aborta antes do primeiro elo | `gh`, a cada elo |
| `issue` | id do tracker e URL | o tracker |
| `board` | path absoluto no vault | o elo que consome |
| `review` | path do arquivo no vault, **quando houve vault**; sem vault o `review` não persiste e não há este baton | registrado no estado do chain; **`iterate` não o lê**, ele lê as threads da PR |

**`review>iterate` e o gate de postagem.** O que liga os dois é a PR, não o arquivo do vault. Se o
usuário escolheu, no Step 8 do `review`, **não postar**, a PR chega ao `iterate` sem threads novas. O
`iterate` continua acionável por CI vermelho ou conflito com a base, e sem nada disso ele reporta que
não há o que fazer. **O chain não decide isso e não para por isso**: o gate de ação pós-review do
`review` não cancela o baton `pr`, e a ausência de threads é o baton mais magro que o gate do usuário
deixou, não falha.

**Exceção: commits locais sem push.** Em PR própria, a opção 1 do 8a aplica correções em commits
**sem push**. O `iterate` que vem em seguida opera na mesma branch e o push dele levaria esses commits
junto, transformando a decisão "sem push" num push que nenhum gate mostrou. Por isso, entre os dois
elos, o chain confere se a branch da PR tem commits que o remoto não tem
(`git rev-list --count origin/<headRefName>..<headRefName>`). Maior que zero: **parar antes do
`iterate`**, com o bloco de estado dizendo que há commits locais aguardando a decisão de push. O
usuário pusha e retoma, ou roda o `iterate` avulso sabendo o que ele levará.

## Execução

1. **Validar** a gramática inteira (regra acima). Ilegal: recusa útil, encerra sem efeito.
2. **Cobertura.** Chain legal que o executor ainda não roda: imprime o plano e encerra (ver "O que a v1
   executa"). Recusa e plano saem **antes do preflight**, no formato de abortagem, sem banner.
3. **Preflight único.** O chain resolve o Step 0 uma vez (`${FLUX_ROOT}/shared/step0-cli.md`,
   depois `preflight.md`), **verifica `${FLUX_CMD}`** (Passo 1b, porque despacha irmãos) e verifica a
   **união dos requisitos `hard` dos elos**. Falta um, ou `FLUX_CMD` é `UNAVAILABLE`: aborta **antes**
   do primeiro elo, no formato de abortagem do preflight e nomeando o que faltou. Descobrir no elo 3
   que falta `gh` joga fora os dois primeiros.
4. **Medir o escopo** (seção seguinte; não implementado na v1: nenhum chain executável contém `refine` ou `build`).
5. **Banner do chain** (gabarito no SKILL do chain), depois o plano em uma linha por elo.
6. **Rodar os elos em sequência, na main.** Cada elo é invocado como o harness invoca uma skill, com
   o baton como entrada, e roda o **próprio pipeline**, gates e Step 0 incluídos. **Elo nunca vira
   subagente**: subagente não abre gate (`${FLUX_ROOT}/shared/hitl.md`), e um chain cujos gates
   fossem respondidos pelo próprio modelo seria exatamente a ação não autorizada com aparência de
   fluxo normal que o contrato existe para impedir. Isso é exceção declarada à regra de fan-out de
   `${FLUX_ROOT}/shared/fanout-discipline.md`, que vale para o trabalho **dentro** de um elo.
7. **Entre elos**, o chain lê a saída do elo, extrai o baton e passa adiante. Não interpreta, não
   resume, não reescreve o que o elo entregou.
8. **Watch só no último elo.** O `iterate` vigia por default e nunca termina. Num elo que **não é o
   último**, o chain passa `--once`, senão o chain nunca avança. No último, vale o default do elo (ou o
   `--once` que o usuário pediu).

### Banner

O gabarito é **um só, o do SKILL do chain** (`${FLUX_ROOT}/skills/chain/SKILL.md`), copiado verbatim do
preflight (Passo 5) com `flux:chain` no carimbo. Aqui só a regra dos campos:

- `nivel` é o **pior** entre os elos; `degradacoes:` é a **união** sem repetir token. O banner do
  chain sai antes dos elos, então reflete o que o preflight do chain mediu (a união dos `hard` e
  `soft` declarados); o banner de cada elo é a fonte do nível efetivo.
- O andamento por elo (`1/2 review: concluído`, `2/2 iterate: em watch`) vai **no corpo**, abaixo do
  banner. O gabarito é fechado: campo fora dele é campo inventado.
- **Cada elo emite o próprio banner**, como avulso. Nenhum mecanismo declarado faz um elo saber que
  está sob chain, e suprimir o banner de um elo apagaria o único lugar onde ele declara degradações
  que só aparecem em runtime. Colapsar tudo num banner só é o alvo, e está em "O que não está
  implementado".

### Escopo medido

O gate de escopo (`${FLUX_ROOT}/shared/scope-gate.md`) mede um **pedido**, e só `refine` e `build`
têm um. Um chain que contém `refine` ou `build` deve medir o pedido de entrada **uma vez, antes do
primeiro elo**, com o contrato e os limiares do gate, sem sinal novo. Vermelho **não** é recusa seca:
o `build` tem override (`--no-slice`), e o chain não pode ser mais duro que o elo, então ele
apresenta o corte proposto e devolve a decisão ao usuário. O `refine` e o `build` medem de novo por
conta própria, porque nenhum deles recebe procuração do chain; a medição do chain é antecipação.

Chain sem `refine` nem `build` (só PR) **não tem pedido a medir** e pula este passo. Nenhum chain
executável hoje contém esses elos, então o passo está especificado e **não implementado**.

## Falha no meio

O chain **para no elo que falhou**, sem tentar o próximo, e **não desfaz** o que o elo anterior fez:
PR postada, commit pushado e issue criada já aconteceram e são estado do mundo.

O chain **para** quando o elo:

- aborta, ou termina em erro que o próprio elo classifica como bloqueio;
- devolve ao usuário uma decisão que ficou sem resposta;
- é recusado pelo usuário num gate que **encerra o elo sem produzir o baton** (saída inócua). **Não é
  falha**, é decisão: o chain encerra sem token de degradação e diz qual elo o usuário parou. A saída
  inócua do gate de ação pós-review do `review` **não** entra aqui: ela não cancela o baton `pr`
  (ver "`review>iterate` e o gate de postagem");
- deixa commits locais sem push na branch da PR antes de um `iterate` (mesma seção).

Ao parar por falha, o chain emite o **estado** no chat, bloco fechado:

```
chain: {cadeia completa}
parou em: {n}/{total} {elo} ({motivo em uma linha})
concluidos: {elo, baton entregue, um por linha | nenhum}
baton: {artefato = referência, um por linha}
retomar: ${FLUX_CMD}{verbo do elo que parou, com o baton já preenchido}
```

e **reemite o banner** com `chain interrompido` em `degradacoes:`, seguido do elo e do motivo, como a
tabela do preflight pede. O banner do início já saiu e não pode ser corrigido depois.

**Retomar, hoje, é rodar o elo que parou** com o baton do estado, sem reexecutar os concluídos, pela
forma de invocação que a sessão expõe: `iterate https://github.com/owner/repo/pull/65`. Isso funciona
porque os elos relêem a fonte da verdade (a PR, o board, o tracker). O que **não** existe é um
comando único de retomada; ver abaixo.

## Neutralidade

- **Harness.** O nome de cada elo e do próprio chain vem de `${FLUX_CMD}`, nunca `/flux:` literal.
  O chain **despacha irmãos**, então herda o limite que o `flux:land` já tem no Codex, onde
  `FLUX_CMD` fica `UNAVAILABLE` (`${FLUX_ROOT}/shared/codex-compat.md`). O caminho de ausência é
  declarado: recusa e plano (que nomeiam só verbos) funcionam, e a fase de execução **aborta no
  preflight** com a mensagem padrão, nomeando `FLUX_CMD`. Nunca degrada para executar o pipeline de
  um elo inline, fora do contrato.
- **Time.** Nenhum contexto de time mora aqui: nem repo, nem reviewer, nem tracker, nem canal.
  Tudo isso continua vindo do manifesto de contexto, resolvido pelos elos. Se um chain vier a
  precisar de configuração própria, vira campo de manifesto documentado em
  `${FLUX_ROOT}/shared/flux-context.md`, nunca constante neste arquivo.

## O que a v1 executa

Validar vale para **todo** chain da gramática. Executar, por ora, só o mínimo:

| chain | v1 |
|-------|----|
| `review>iterate` | **executa** |
| qualquer outro legal | valida, imprime o plano (verbos e baton por elo, sem prefixo de invocação) e **não roda nenhum elo**; termina sem executar, não como falha |
| ilegal | recusa útil |

O segundo caso é o degrau honesto: o usuário recebe o que o chain resolveu (legalidade, ordem, baton)
sem que o executor finja uma capacidade que ainda não tem.

## O que não está implementado

Declarado por nome, no estilo das linhas de `${FLUX_ROOT}/shared/preflight.md`, para ninguém tomar
a especificação por comportamento:

| item | estado |
|------|--------|
| executor de chains além de `review>iterate` | **não implementado**, sem ticket ainda |
| entrega do baton aos elos além da v1 (forma do argumento de `issue`, `build`, `peek`, `land`; retomada de board pelo `issue`; repo de `build`) | **não implementado**: a gramática é de tipos, e essa decisão nasce com o executor de cada chain |
| parse e preflight de chain no CLI (`flux chain 'review>iterate' 65`) | **não implementado**, sem ticket ainda. Hoje `flux preflight chain --json` responde, mas com os requisitos do perfil padrão, sem a união dos elos |
| arquivo de estado do chain e o comando `flux resume` | **não implementado**, sem ticket ainda. O bloco de estado acima só existe no chat |
| banner único (suprimir o dos elos) | **não implementado**: exige um mecanismo declarado pelo qual o elo saiba que roda sob chain, e ele mexe no contrato de banner de todo elo |
| medição de escopo antecipada do chain | **não implementado**: nenhum chain executável da v1 contém `refine` ou `build` |
| decisão de `iterate>land` | **em aberto** |
| `reply` como elo | **fora** até haver vizinho que consuma o rascunho |
