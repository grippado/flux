---
name: build
description: "Orquestrador `flux:build` — elo de execução da família: recebe um ticket/descrição e um repo, e despacha para o motor de execução nativo daquele repo (`/workflow`), caindo no `exec_fallback` do perfil ou no modo autônomo quando o repo não tem motor próprio. Produz código + PR draft. Não reimplementa pipeline de implementação. Global, resolve contexto via `flux-context.md`. Local apenas — CI e Forja ficam fora."
user-invocable: true
---

# /flux:build

O **elo de execução** da família `flux:`. Recebe uma task (ticket Linear ou descrição livre) e um repo, resolve **qual motor de execução aquele repo tem**, e despacha. É o passo que transforma issue em código + PR draft, fechando o ciclo entre `/flux:issue` (que cria a issue) e `/flux:review` → `/flux:iterate` → `/flux:land` (que levam a PR até o merge).

Este comando **não implementa a task**. Ele resolve repo + motor, carrega contexto e delega. Toda a lógica de implementação (pattern-finder, testes, verificação local, padrão de PR) continua sendo do motor do repo — que é quem conhece o próprio terreno.

Onde ele fica no ciclo:

```
/flux:issue    ideia, thread, PR  →  issue embasada
/flux:build     issue              →  código + PR draft      ← este
/flux:peek      relance read-only da PR
/flux:review    review formal (holístico + specialists)
/flux:iterate   threads → correções → push → CI verde
/flux:land  N PRs → toposort → go/no-go
/flux:reply     comunica o resultado
```

**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Disciplina de worktree (escrever sempre em worktree):** `${FLUX_ROOT}/shared/worktree-discipline.md`
**Disciplina de fan-out (despachar, não executar na main):** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Disciplina de comentários em código (não comentar sem pedido):** `${FLUX_ROOT}/shared/code-comment-discipline.md` — vale para o motor de execução também: quando o build despacha um executor (nativo, `exec_fallback` ou modo autônomo), a regra vai no prompt dele.
**Bootstrap de specialists:** `${FLUX_ROOT}/shared/bootstrap-specialists.md`
**Formato do board:** `${FLUX_ROOT}/shared/board-template.md`, **perfil execução** (`type: flux-build`). As seções, a legenda de ícones e a disciplina de carimbo de data vivem lá e não são repetidas aqui.
**Orçamento de contexto (leitura sob demanda, delegação):** `${FLUX_ROOT}/shared/context-budget.md`
**Gate de escopo (o que decide se a task é despachada inteira):** `${FLUX_ROOT}/shared/scope-gate.md`
**Gates com o usuário:** `${FLUX_ROOT}/shared/hitl.md`
**Contrato de vertical slice (o que é uma fatia):** `${FLUX_ROOT}/shared/issue-template.md`, seção **Decomposição (vertical slices)**

## Banner de perfil — gabarito (copiar VERBATIM)

Todo output deste elo **abre** com o banner. Ele não é decoração: é o que impede uma execução
degradada de se passar por uma completa. O gabarito mora aqui, no corpo do elo, porque um gabarito
que só existe num shared não chega ao contexto na hora de emitir — e o que sai é um banner
improvisado, com campos inventados e sem o `nivel`.

Copiar com as cercas, trocando só o que está entre chaves. Regras dos campos e casos de degradação
em `${FLUX_ROOT}/shared/preflight.md`, Passo 5; a linha `escopo` é definida em
`${FLUX_ROOT}/shared/scope-gate.md`, seção "Como o veredito é declarado".

````
```
perfil: {nome do manifesto | generico}{ (ancora: alvo <path>)} · nivel: {FULL|REDUCED|THIN}
escopo: {🟢 cabe | 🟡 cabe raso | 🔴 nao cabe} ({sinais lidos})
lentes: L1 n/a · L2 {lista|ausente|inalcancavel} · L3 {lista|ausente|inalcancavel}
motor: {nativo <cmd> | exec_fallback <cmd> | autonomo}
degradacoes: {soft ausentes e o que se perde com cada um | nenhuma}
```
````

**A linha `escopo` sai uma vez só**, com o veredito do passe único do Step 2-quater, e não é
reemitida — ao contrário do `flux:refine`, que tem T0 e T1 e corrige o número provisório. Aqui não há
número provisório: o embasamento chega pronto no corpo da issue, então os dois insumos do gate
chegam juntos (`${FLUX_ROOT}/shared/scope-gate.md`, "Dois tempos"). Com `--no-slice`, a linha continua
saindo — o que a flag desliga é a **ação** do gate, nunca a medição, porque um despacho que ignora o
tamanho sem nem tê-lo lido é o caso que este elo existe para não repetir. Rodando com `--no-slice`,
acrescentar ` (dispensado por --no-slice)` ao fim da linha.

Este elo **não** resolve reviewer holístico — quem revisa é o motor do repo, depois, em outro
elo. O campo `holistico:` **não entra no banner** e `L1` sai como `n/a`, porque anunciar uma lente
holística que nunca foi resolvida é prometer cobertura inexistente; a linha `lentes` sai porque o build é
frequentemente o primeiro elo a tocar um repo novo e é onde se descobre que ele está sem
cobertura (ver `${FLUX_ROOT}/shared/preflight.md`, Passo 5).

Abortagem segue o gabarito do "Formato da mensagem de abortagem" do preflight, também verbatim, e o
nome do elo na primeira linha usa `${FLUX_CMD}` já substituído (`/flux:build` num harness,
`/flux-build` em outro) — nunca `flux:` literal.

## Uso

```
/flux:build <repo> <ticket-ou-descrição> [flags-do-motor]
/flux:build <ticket-ou-descrição>              # repo mode: infere o repo do cwd
```

| Argumento | Descrição |
|-----------|-----------|
| `<repo>` | Slug do repo-alvo. Obrigatório em workspace mode; omitido em repo mode (inferido do `cwd`). |
| `<ticket-ou-descrição>` | ID/URL de ticket Linear ou descrição livre da task. Repassado ao motor. |
| flags | Repassadas **verbatim** ao motor do repo (ex.: `--no-review` onde suportado). Exceto as flags próprias abaixo. |

Flags próprias do `flux:build` (consumidas aqui, **não** repassadas):

| Flag | Efeito |
|------|--------|
| `--dry` | Resolve repo + motor, imprime o plano de despacho e **para**. Nada é executado. |
| `--engine <cmd>` | Força o motor (ex.: `--engine meu-time:implement`), pulando a descoberta do Step 2. |
| `--no-slice` | Desliga o **gate de escopo** do Step 2-quater: mede, declara a faixa no banner e no board, e **despacha inteiro sem abrir o gate**. Não desliga a medição, só a pergunta. A dispensa vira evento `escopo` no board, com os sinais apurados. |

### Exemplos

```
/flux:build api-gateway ENG-1234
/flux:build notifications https://linear.app/{LINEAR_ORG}/issue/NOT-2693
/flux:build web-monorepo "ajustar empty state do EventAnnouncement"
/flux:build payments PAY-88 --dry
/flux:build payments PAY-88 --no-slice  # eu já sei que é grande e quero inteiro assim mesmo
/flux:build ENG-1234                    # dentro de <WORKSPACE_ROOT>/api-gateway
```

## Out of scope (NUNCA faça)

- **Não implemente a task aqui.** Se você se pegar editando código de produto neste comando, o despacho falhou — pare e reporte.
- **Não acione CI nem cloud.** Este comando é local: nunca chame `/workflow-cloud`, nunca dispare workflow do GitHub Actions.
- **Forja fica de fora.** Qualquer `/forja:*` é opt-in e explícito do usuário; nunca o invoque a partir daqui.
- **Não mergeie nada.** Merge é decisão do `/flux:land` + humano.
- Um repo por invocação. Para várias frentes, várias invocações (ou `/convocar` para mutirão).
- **Não acione specialists.** Nem como briefing antes de implementar, nem como gate sobre o diff
  antes da PR. O motivo está no Step 2-ter: o embasamento que eles produziriam já existe, escrito na
  issue, e as suites declaram que não participam de autoria. Quem revisa é o `/flux:review`, depois.

---

## Step 0-context: resolver perfil de contexto

Seguir o protocolo de `${FLUX_ROOT}/shared/flux-context.md`. Em resumo:

1. Resolver a **âncora** e procurar `flux-context.json` subindo a árvore a partir dela, conforme
   `${FLUX_ROOT}/shared/flux-context.md` (seção "Qual é a âncora"). Neste comando o alvo é sempre
   explícito (`<repo>`), então **a âncora é o repo, não o `cwd`**: `/flux:build backoffice-bff …`
   rodado de qualquer lugar tem que achar o perfil do workspace onde `backoffice-bff` vive.

2. Se encontrar (perfil declarado), extrair:
   - `WORKSPACE_ROOT` = `workspace_root` (raiz dos checkouts; sem o campo, o diretório pai do `.claude/` onde o manifesto foi achado)
   - `REPOS` = `repos` (lista de repos conhecidos, usada para validar e sugerir)
   - `EXEC_COMMAND` = `exec_command` se presente, senão `workflow` (nome do comando nativo de execução dos repos deste contexto)
   - `EXEC_FALLBACK` = `exec_fallback` se presente, escalar **ou** mapa por repo; **sem default**
     (ausente = modo autônomo). A resolução está no Step 2, caminho B.
   - `LINEAR_ORG` = `linear_org` (para normalizar IDs de ticket em URL, quando útil)
   - `VAULT_ROOT` = `vault_root` / `VAULT_CTX` = `vault_context` (onde o board de execução é gravado)
   - `NO_EMDASH` = `no_emdash`
   - `SPECIALISTS_ROOT` = `specialists_root` (template de path com `{repo}`; degrau 1 da descoberta de
     L2 e degrau 2 da cascata de destino, opcional)
   - `KITS_ROOT` = `kits_root` (template de path com `{repo}`; degrau 3 da cascata de destino, opcional)
   - `WRITE_DESTINATIONS` = `write_destinations` (destinos já aprovados, com o `repos` de cada um;
     degrau 4 da cascata e degrau 3 da descoberta de L2, opcional)

   > **Por que o build extrai a tripla de descoberta se não revisa nada.** Ele não usa as lentes para
   > executar, mas o Passo 5 do `${FLUX_ROOT}/shared/preflight.md` **obriga** este elo a emitir a linha
   > `lentes` com as três camadas, e o Step 4 decide entre `--agents-only` e `--engine-only` a partir do
   > estado de L2. As duas coisas dependem do passo 1a do `${FLUX_ROOT}/shared/review-agents.md`, que lê
   > `specialists_root`, `kits_root` e `write_destinations` **em cascata**. Extrair só um dos três faria
   > o build declarar `L2 ausente` para um repo que tem suite, e oferecer criar de novo o que já existe.

3. Se não encontrar (perfil genérico):
   - `WORKSPACE_ROOT` = o `cwd`
   - `REPOS` = subdiretórios com `.git` do `cwd`
   - `EXEC_COMMAND` = `workflow`
   - `EXEC_FALLBACK` = nenhum (modo autônomo)
   - `VAULT_ROOT` = não persiste por default (o board sai só no chat); `VAULT_CTX` = `generic`
   - `NO_EMDASH` = `false`

---

## Step 1 — Resolver o repo-alvo

1. Parse dos argumentos: retire primeiro as flags próprias (`--dry`, `--engine`, `--no-slice`). Do que restar, o **primeiro token** é candidato a `<repo>`; o resto é `$REST` (task + flags do motor), repassado inteiro e sem interpretação.

2. Decidir entre workspace mode e repo mode:

```bash
# candidato existe como diretório-filho com .git? → workspace mode
if [ -d "$(pwd)/$CANDIDATE/.git" ] || [ -d "$WORKSPACE_ROOT/$CANDIDATE/.git" ]; then
  REPO="$CANDIDATE"   # e $REST = tokens restantes
else
  REPO="$(basename "$(git rev-parse --show-toplevel 2>/dev/null)")"  # repo mode
  # e $REST = TODOS os tokens (o primeiro era parte da task, não um repo)
fi
```

3. Resolver o checkout. `WORKSPACE_ROOT` aqui é o do perfil **da âncora**, que no Step 0 já foi
   resolvida a partir do repo e não do `cwd`:

```bash
REPO_PATH="$(pwd)/$REPO"
[ -d "$REPO_PATH/.git" ] || REPO_PATH="$WORKSPACE_ROOT/$REPO"
```

4. Se ainda não resolveu, o candidato pode ser um repo de **outro** contexto declarado na máquina.
   Antes de abortar, aplicar o passo 2 da resolução de âncora
   (`${FLUX_ROOT}/shared/flux-context.md`): descobrir os manifestos existentes e ver qual reivindica
   o slug, seja pelo campo `repos` ou por ter `<workspace_root>/<slug>/.git`.

   - Um reivindica → adotar aquele perfil **inteiro** (não só o `workspace_root`) e seguir.
   - Mais de um → perguntar ao usuário qual contexto usar.
   - Nenhum → aí sim, parar:

```bash
echo "repo '$REPO' não encontrado. Checkouts disponíveis em $WORKSPACE_ROOT:"
ls -d "$WORKSPACE_ROOT"/*/.git 2>/dev/null | xargs -n1 dirname | xargs -n1 basename
echo "e nenhum manifesto conhecido reivindica esse slug."
```

Não improvise um repo próximo por similaridade de nome: pare e deixe o usuário escolher.

> **Por que este passo existe.** Sem ele, `/flux:build <repo> …` invocado de fora do workspace aborta
> com "repo não encontrado" para um repo que existe, está declarado num manifesto e tem checkout
> local. O usuário passou o alvo explicitamente; dizer que não o achou é o pior erro possível aqui.

---

## Step 2 — Descobrir o motor de execução

Em ordem, primeira opção que existir vence. Se `--engine` foi passado, pule direto para o despacho com aquele motor.

**A) Motor nativo do repo** (preferido, sempre):

```bash
[ -f "$REPO_PATH/.claude/commands/$EXEC_COMMAND.md" ] && ENGINE="native"
```

O repo declara o próprio pipeline: ele conhece escopo de testes, verificação local (Figma/curl/browser), gates e padrão de PR. Sempre prefira isto.

**B) Fallback declarado pelo perfil** (`EXEC_FALLBACK`), **só quando o manifesto declara**:

Um time que já tem um comando de implementação próprio declara o nome dele em `exec_fallback`, e é
esse que roda quando o repo não tem motor nativo.

**`EXEC_FALLBACK` pode ser um escalar ou um mapa** (`${FLUX_ROOT}/shared/flux-context.md`), e a
resolução é **repo → `default` → modo autônomo**, nesta ordem e sem pular degrau:

1. É um mapa e tem a chave `$REPO` → esse é o motor. Um motor gravado sob o slug foi autorado
   **para aquele repo**, lendo a stack e os scripts dele.
2. É um mapa e tem `default` → esse é o motor.
3. É um escalar → esse é o motor (equivale a um mapa só com `default`, que é o que mantém a forma
   antiga funcionando sem alteração nenhuma no manifesto de quem já a usa).
4. Nenhum dos anteriores → **caminho C**, modo autônomo. Um mapa que não nomeia este repo e não tem
   `default` não autoriza usar o motor de outro repo: seria executar código com o pipeline errado, em
   silêncio.

Confirme que o comando resolvido está disponível na sessão:

```
ENGINE="fallback"
```

> **`exec_fallback` não tem valor default, e isso é deliberado.** Um comando de implementação que
> venha de um plugin específico é conhecimento **do time que o instalou**, não da família. Assumir um
> default faria o `flux:build` tentar invocar, na máquina de quem clonou, um comando de um
> marketplace ao qual essa pessoa talvez nem tenha acesso. Quem tem um, declara.

**C) Modo autônomo** (nem motor nativo, nem `exec_fallback` declarado):

O caminho universal, e o que faz o `flux:build` funcionar em qualquer repo Git sem configuração
nenhuma. **Não abortar**: despachar um `general-purpose` que assume a disciplina que um motor nativo
daria de graça.

```
ENGINE="autonomo"
```

Nos caminhos **B** e **C**, a disciplina abaixo é responsabilidade do elo, não do motor:
- Trabalhar em **worktree dedicado** — ver `${FLUX_ROOT}/shared/worktree-discipline.md`. Nunca na árvore principal do repo.
- Ler as instruções do repo (`AGENTS.md` e/ou `CLAUDE.md`) antes de escrever — convenções do repo vencem qualquer default.
- Rodar os checks que o repo declarar (lint/typecheck/test) antes de abrir a PR.
- Abrir a PR como **draft**, sempre.

Declarar no banner qual dos três caminhos rodou. O modo autônomo é um resultado legítimo, não uma
falha, mas quem o roda precisa saber que rodou sem os gates do repo.
> **Antes de cair no fallback, procure uma skill nativa mais específica.** Um repo pode não ter `/<EXEC_COMMAND>` e ainda assim declarar skills próprias para o tipo de trabalho pedido (uma suíte E2E com skills de teste, por exemplo). Nesse caso, ofereça a skill nativa ao usuário em vez do fallback genérico.

---

## Step 2-ter — O embasamento da issue é o briefing (não rode specialists aqui)

Quando a task é um ticket, **leia a issue inteira e repasse ao motor a seção de embasamento em
código**, junto da descrição. Não resuma: o motor precisa dos `arquivo:linha` literais.

Uma issue nascida do `/flux:issue` já teve os specialists do repo rodando sobre ela, na prospecção
(`${FLUX_ROOT}/skills/issue/SKILL.md`, Step 2). O que está escrito ali sob "Embasamento no código"
**é** o parecer dos specialists daquele repo, persistido no tracker no momento em que eles tinham
terreno para trabalhar. Repassar isso ao implementador custa zero chamada de agente e é a diferença
entre ele descobrir o território e ele já chegar com o mapa.

Duas ressalvas de honestidade sobre esse embasamento, que devem ir junto no prompt do motor:

- **Os números de linha envelhecem.** A apuração foi feita contra o SHA de quando a issue nasceu, e a
  `main` andou desde então. Instrua o motor a localizar **pelo nome do símbolo**, não pela linha, e a
  reportar no retorno o que divergiu.
- **Uma issue escrita à mão não tem esse embasamento**, e isso não é degradação: é só uma issue de
  outra origem. Não invente a seção, não rode specialists para produzi-la.

### Por que este elo não aciona specialists

Foi avaliado em 2026-08-09, com dois desenhos concorrentes especificados e descartados. O registro
existe para não se refazer a discussão:

- **Briefing de entrada** (specialist informa invariantes antes de o motor escrever) duplica o que a
  issue já carrega, e esbarra num contrato das próprias suites: uma suite de specialists típica
  declara que pedido de autoria "não é desta suite, esta suite revisa, não escreve". Além disso, os
  specialists individuais são formados pelo diff (a regra de atribuição deles é o escopo
  `DIFF_FILES`), então sem diff eles devolvem aprovação vazia.
- **Gate de saída** (specialist revisa o diff antes de a PR nascer) otimiza para o caso que menos
  precisa de ajuda. Se o gate acha algo, paga-se gate + correção + gate e **ainda** o `/flux:review`
  depois, que é quem roda o holístico. Só se paga quando passa limpo de primeira, que é exatamente
  quando o ciclo que ele queria encurtar já seria barato. E no modo autônomo, sem suite no repo, o
  gate seria o mesmo modelo relendo o diff que acabou de escrever: confirmação circular, não segunda
  lente.

A regra que ficou: **o build carrega o parecer que já existe; quem produz parecer novo é o
`/flux:review`, sobre o diff, depois.**

---

## Step 2-bis — Criar o board de execução (antes de despachar)

Com `VAULT_ROOT` resolvido, criar o board **antes** de disparar o motor, seguindo o **perfil execução**
de `${FLUX_ROOT}/shared/board-template.md` (`type: flux-build`).

> **Por que antes.** O motor roda em worktree, longe da main, por muitos minutos. Se o board nascesse
> no fim, o intervalo inteiro seria cego e um motor que trava não deixaria rastro nenhum. Board que
> nasce depois do trabalho é ata, não board.

1. **Path:** `<VAULT_ROOT>/0-inbox/YYYY-MM-DD-HHMM-flux-build-<repo-slug>-<slug-do-ticket>.md`.
   **Anunciar o path no chat** na criação, como fazem os outros elos.
2. **Frontmatter:** `repo`, `ticket`, `engine`, `engine_kind` (`nativo`/`fallback`), `worktree`,
   `branch`, `pr: null`.
3. **Painel:** uma linha por etapa do motor, todas nascendo `⏳ pendente`:
   `contexto lido · plano · implementação · checks · PR`. Um motor nativo com etapas próprias
   sobrescreve essa lista pelas dele, quando as declarar no retorno.
4. **Sem `VAULT_ROOT`** (perfil genérico): não gravar arquivo. Imprimir o painel no chat a cada
   atualização e declarar a perda no banner de perfil. O board é uma capacidade que degrada, não um
   requisito que trava.
5. **Com `--dry`:** não criar board. O `--dry` não despacha, então não há execução para observar.

---

## Step 2-quater — Gate de escopo (medir antes de despachar)

Aplicar `${FLUX_ROOT}/shared/scope-gate.md`, tempo **passe único**. Os sinais duros e moles, os
limiares, a contagem termo a termo e as três faixas estão **lá**, e não são redefinidos aqui: este elo
declara apenas o que é dele, que é o que fazer com a faixa. Redefinir um limiar neste arquivo é
garantir que ele divirja do `flux:refine`, que lê o mesmo contrato.

**Os insumos já estão em contexto, e nenhum deles custa uma chamada de agente:**

- o **corpo da issue** — entregáveis enumerados, e se ele mistura produção, teste e hook/infra;
- o **embasamento em código do Step 2-ter** — quantos arquivos, em quantos diretórios de topo, em
  quantos repos com escrita prevista;
- o **motor resolvido no Step 2** — `autonomo` é sinal mole, e é o único sinal do contrato que existe
  **só neste elo**: sem os gates do repo, errar grande custa mais.

> **Nenhum agente é chamado para medir.** É a invariante 1 do contrato, e aqui ela é mais que uma
> preferência: medir por fan-out violaria a proibição do Step 2-ter ("Por que este elo não aciona
> specialists"). O gate lê texto que já está na tela.

> **Por que passe único, e não T0 e T1 como no `flux:refine`.** Este elo **recebe** o embasamento
> pronto no corpo da issue; ele não o produz. Os dois insumos do gate chegam juntos, não há intervalo
> entre eles, e um "T0" aqui seria a mesma leitura feita duas vezes. A justificativa é do contrato
> (`${FLUX_ROOT}/shared/scope-gate.md`, "Dois tempos"), que também explica por que a lista de sinais é
> a mesma nos dois casos.

### Por que aqui, depois do board e antes do despacho

O gate precisa de duas coisas para existir: o embasamento (Step 2-ter), que é o insumo, e um lugar
onde a decisão fique registrada. O board nasce no Step 2-bis, e a invariante 3 do contrato exige que
**toda decisão do gate deixe rastro** — inclusive a dispensa, porque é dela que se aprende que um
limiar está errado. Rodar o gate antes do board obrigaria a gravar o veredito retroativamente, ou a
perdê-lo inteiro quando o usuário escolhesse a saída inócua, que é justamente o caso em que o rastro
mais importa.

E o board é barato: ele nasce vazio, antes de qualquer minuto de motor. O que o gate barra é o
**despacho** (Step 3), não a anotação.

### O que cada faixa faz

| faixa | ação |
|---|---|
| 🟢 **cabe** | despacha direto. Nenhum gate, nenhuma pergunta. |
| 🟡 **cabe raso** | abre o gate oferecendo fatiar, **com o corte proposto** |
| 🔴 **não cabe** | abre o gate com o corte proposto e a **fatia 1 recomendada** |

> **O gate abre no 🟡 também, com 1 sinal mole.** A LAB-65 pedia disparo só com 2 sinais, mas o
> contrato é a fonte única e ele dá ao 🟡 uma ação própria neste elo — e a assimetria de custo é a
> mesma: barrar de graça custa uma pergunta, despachar grande custa a execução inteira. O que muda
> entre 🟡 e 🔴 não é abrir ou não, é qual opção chega recomendada e quão nomeado é o corte.

### O menu (single-select, `${FLUX_ROOT}/shared/hitl.md`)

Antes de abrir, montar o **corte proposto**: quais frentes o pedido tem, quais entram na fatia 1,
quais ficam, e — obrigatoriamente — **o que a fatia 1 entrega sozinha**. Cada fatia respeita o
contrato de vertical slice do `${FLUX_ROOT}/shared/issue-template.md`, seção **Decomposição (vertical
slices)**: independentemente entregável, atravessa as camadas necessárias, **1 repo**. Camada não é
fatia: "o backend disto" e "o frontend disto" são **uma** fatia quando uma não serve sem a outra.
Uma proposta que não diz o que a primeira fatia entrega sozinha não é proposta, é uma lista.

> **Por que o build referencia esse contrato explicitamente.** A regra "um repo por invocação" deste
> elo sempre foi consistente com o `issue-template.md`, mas por **convenção implícita**: nada aqui
> apontava para lá. Um gate que corta trabalho sem dizer o que é uma fatia inventaria uma definição
> concorrente na terceira invocação.

Uma única question, opções nesta ordem:

1. **Fatiar e despachar a fatia 1** *(Recomendado)* — despacha ao motor **só** a fatia 1, com o
   embasamento restrito a ela. As demais fatias **não viram issue aqui** (este elo não cria issue):
   ficam nomeadas no board e no handoff. Recomendada nas duas faixas, e mais ainda quando o motor é
   `autonomo`.
2. **Despachar inteiro** — despacha a task como veio, sem corte. O gate fica registrado como
   dispensado no board, com os sinais apurados. Não cancela nada, não altera a task.
3. **Só mostrar o plano** — imprime o veredito, os sinais lidos e o corte proposto, e **para**. Nada é
   despachado, nada é escrito no repo. Saída inócua.

Sem `AskUserQuestion` no harness, o gate não desaparece: vira menu numerado no chat, com a mesma
ordem, e a degradação é declarada no banner (`${FLUX_ROOT}/shared/hitl.md`).

**O gate roda na main, nunca dentro de subagente** — subagente não tem canal com o usuário. Quem
despacha resolve o gate primeiro e passa a decisão já tomada.

### `--no-slice` e `--dry`

- **`--no-slice`** mede, declara e **não abre o gate**: despacha inteiro. É a única forma de renunciar
  a este gate, e é do usuário, nunca do elo. O `flux:refine` não tem equivalente, e a assimetria está
  explicada no contrato ("Vermelho no `flux:refine` não tem override"): lá, forçar produz um documento
  raso com cara de completo, que circula como spec; aqui, produz uma execução que falha visivelmente,
  em worktree, sem enganar ninguém depois. Não reescrever esse raciocínio, apontá-lo.
- **`--dry`** não abre o gate tampouco, por outro motivo: ele não despacha, então não há o que barrar.
  O veredito e o corte proposto entram no plano impresso no Step 3.

### O que fica registrado

Com board (sem `--dry`), sempre:

1. **o veredito** — faixa e sinais lidos — como linha da Timeline de Eventos, tipo `escopo`, e
   `scope:` no frontmatter;
2. **a escolha do usuário** — como linha tipo `decisão`, dizendo qual opção e, se fatiou, o que ficou
   de fora **por nome**;
3. **a dispensa** — tanto a da opção 2 quanto a de `--no-slice` — como linha tipo `escopo`, com os
   sinais que o gate tinha apurado. Dispensar é legítimo; dispensar sem rastro não é, porque é
   exatamente o que impede corrigir os limiares com evidência em vez de opinião.

---

## Step 3 — Anunciar e despachar

1. Antes de disparar, informe ao usuário em **uma linha** (duas se houver ressalva):

> Despachando para `<repo>` via motor **nativo** (`/<EXEC_COMMAND>`): `<task>`. O motor do repo assume daqui.

O banner de perfil (`${FLUX_ROOT}/shared/preflight.md`, Passo 5) declara, além do motor escolhido,
**quais camadas de specialists existem para este repo** (L2 local e L3 do repo). Elas não participam
da execução, mas o build é frequentemente o primeiro elo a tocar um repo novo, e é aqui que você
descobre que ele está sem cobertura. A oferta de criar vem no Step 4, depois do trabalho.

ou, no fallback:

> `<repo>` não tem motor nativo — despachando via `<EXEC_FALLBACK>` em worktree dedicado. Convenções vêm do `CLAUDE.md` do repo.

2. Se `--dry`, **pare aqui**: imprima repo resolvido, checkout, motor escolhido, task, flags repassadas
   e o **veredito de escopo** do Step 2-quater (faixa, sinais lidos e, fora do 🟢, o corte proposto).
   Nada mais.

2-bis. **Fatiou no Step 2-quater?** O que vai ao motor é a **fatia 1**, não a task inteira: a descrição
   despachada é a da fatia, e o embasamento repassado é o subconjunto que encosta nela. Despachar o
   corpo inteiro depois de cortar desfaz o corte em silêncio, que é o pior desfecho possível do gate.

3. Disparar o motor. **Onde ele roda depende do modo de sessão** — a regra é a disciplina de fan-out
   (`${FLUX_ROOT}/shared/fanout-discipline.md`): o repo-alvo nunca pode ser um **segundo**
   root carregado no contexto principal.

   - **Workspace mode** (`cwd` é o workspace, `REPO_PATH` é outro diretório) → **subagente
     obrigatório** (`subagent_type: general-purpose`). O prompt é auto-contido: `cd "$REPO_PATH"`,
     rodar `/<EXEC_COMMAND> $REST` (ou `/<EXEC_FALLBACK> $REST`), e devolver **< 40 linhas**.
     O prompt carrega também o **embasamento em código da issue** (Step 2-ter), literal, e a
     instrução de localizar por símbolo e não por linha. Retorno:
     `{branch, worktree, PR criada (url) ou n/a, CI, arquivos tocados (só a lista), checks
     (verde/total), etapa em que parou se falhou, bloqueios}`. O prompt carrega o **path do board**
     para o subagente citá-lo no retorno, mas **quem escreve o board é a main**, nunca o subagente
     (escritor único, ver `${FLUX_ROOT}/shared/fanout-discipline.md`).
     Rodar aqui carregaria `CLAUDE.md` + `.claude/rules/**` do repo + a skill do motor
     permanentemente na main, por nada — o dispatcher não participa da execução mesmo.
   - **Repo mode** (`cwd` **já é** o `REPO_PATH`) → o motor roda inline: o repo já é o único root
     da sessão, e é isso que a Regra 1 do orçamento de contexto permite.

   **Gate interativo dentro de subagente:** subagente não tem canal com o usuário. Se o motor tem
   gate de aprovação de plano, ou ele é despachado com a flag não-interativa do repo, ou o
   subagente devolve o plano no retorno para o gate acontecer na main. Nunca deixe um gate travar
   em silêncio dentro do subagente. Na dúvida, avise o usuário e ofereça rodar em repo mode.

A partir daqui **o motor assume**. O dispatcher não interfere, não opina no meio, não duplica gates.

---

## Step 4 — Fechar o board e fazer o handoff

1. **Oferecer o preparo que faltou, quando faltou.** Duas ausências podem ter aparecido nesta
   execução, e as duas se resolvem pelo mesmo verbo, `${FLUX_CMD}equip`:

   - **Sem L2** (suite de specialists local) → oferecer o Bootstrap seguindo
     `${FLUX_ROOT}/shared/bootstrap-specialists.md`; aceitar dispara
     `${FLUX_CMD}equip <repo> --agents-only`. Havendo L2, não perguntar nada.
   - **Rodou em modo autônomo** (caminho C do Step 2: nem motor nativo, nem `exec_fallback`) →
     oferecer `${FLUX_CMD}equip <repo> --engine-only`, que autora um motor para este repo e o declara
     no perfil. É a única forma de o próximo build não cair no mesmo lugar. Rodou por motor nativo ou
     por fallback declarado, não perguntar nada.

   **Aqui e não antes**: quem pediu um build quer código, e uma entrevista sobre ferramental antes do
   trabalho é ruído. As duas ofertas cabem num gate só quando as duas faltas existirem.
2. **Atualizar o board com o resultado**: etapas em `✅`/`❌`, `pr:` preenchido (ou `null` se o motor
   não chegou a abrir), `esforço` = `arquivos tocados · checks (verde/total)`, e o
   `🎯 Próximo Movimento` apontando o elo seguinte.
3. **Board de build morre no handoff.** Ele cobre uma execução, não um processo: `execution_status`
   vai para `done` quando a PR nasce, e o board do `/flux:iterate` assume dali. Gravar
   `iterate_board:` quando o iterate rodar, e o board do iterate aponta de volta em `parent_board:`.
4. **Motor falhou?** O board fica com `pr: null` e a etapa que quebrou em `❌`. Isso é resultado
   válido e é o que torna a falha investigável depois. Não apagar o board.

Ao final, o resultado é o do motor (tipicamente PR draft + CI monitorado). Feche apontando o próximo elo, escolhendo **um**:

- PR draft aberta e sozinha → `${FLUX_CMD}review <pr>` (review formal) ou `${FLUX_CMD}peek <pr>` (relance rápido).
- PR já com threads/CI vermelho → `${FLUX_CMD}iterate <pr>`.
- Task era uma frente de entrega multi-PR → `${FLUX_CMD}land <issue>`.

**Fatiou no Step 2-quater?** O handoff carrega, além do elo seguinte, as fatias que ficaram — nomeadas,
na ordem proposta, com o que cada uma entrega. Elas viram issue pelo `${FLUX_CMD}issue`, ou entram
direto numa nova invocação deste elo; **este comando não cria issue**. Uma fatia que só existe no
histórico do chat é uma fatia perdida, e o corte vira o mesmo despacho parcial acidental que o gate
existe para evitar.

Montar com o `FLUX_CMD` resolvido no preflight, **nunca** com `/flux:` literal — o usuário vai digitar
o que estiver escrito aqui.

Não rode o próximo elo automaticamente: informe e devolva o volante ao usuário.

---

## Rules

- **Dispatcher, não executor.** Nunca reimplemente lógica de workflow que pertence ao repo.
- **Flags verbatim.** Cada repo define as suas (`--no-review`, etc.); não as interprete nem valide.
- **Local apenas.** Sem CI, sem cloud, sem Forja.
- **Um repo por invocação.**
- **Fallback é degradação consciente, não silenciosa.** Sempre diga ao usuário que caiu no fallback e por quê.
- **O escopo é medido sempre, e medido sem chamar agente.** `--no-slice` dispensa o gate, nunca a
  medição, e a dispensa vira evento no board. Os limiares moram em
  `${FLUX_ROOT}/shared/scope-gate.md`; este elo não tem limiar próprio.
- **O gate mede tamanho, nunca valor.** Ele não diz que a task é ruim, diz que ela não cabe numa
  execução, e mostra o que caberia.
- Quando `NO_EMDASH` é `true`, nada que possa ir para o GitHub (título/corpo de PR, comentário) usa travessão ou en-dash.
