---
name: build
description: "Orquestrador `flux:build` — elo de execução da família: recebe um ticket/descrição e um repo, e despacha para o motor de execução nativo daquele repo (`/workflow`), caindo no `exec_fallback` do perfil ou no modo autônomo quando o repo não tem motor próprio. Produz código + PR draft. Não reimplementa pipeline de implementação. Global, resolve contexto via `flux-context.md`. Local apenas — CI e Forja ficam fora."
user-invocable: true
requires:
  soft:
    - bin: gh
---

# /flux:build

O **elo de execução** da família: recebe uma task (ticket ou descrição livre) e um repo, resolve qual
motor de execução aquele repo tem, e despacha. Transforma issue em código e PR draft, entre o
`/flux:issue` e o `review` → `iterate` → `land`. **Não implementa a task**: a lógica de implementação
(testes, verificação local, padrão de PR) é do motor do repo, que conhece o próprio terreno.

**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Disciplina de worktree (escrever sempre em worktree):** `${FLUX_ROOT}/shared/worktree-discipline.md`
**Disciplina de fan-out (despachar, não executar na main):** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Disciplina de comentários em código (não comentar sem pedido):** `${FLUX_ROOT}/shared/code-comment-discipline.md` — vale para o motor de execução também: quando o build despacha um executor (nativo, `exec_fallback` ou modo autônomo), a regra vai no prompt dele.
**Bootstrap de specialists:** `${FLUX_ROOT}/shared/bootstrap-specialists.md`
**Formato do board:** `${FLUX_ROOT}/shared/board-template.md`, **perfil execução** (`type: flux-build`). As seções, a legenda de ícones e a disciplina de carimbo de data vivem lá e não são repetidas aqui.
**Orçamento de contexto (leitura sob demanda, delegação):** `${FLUX_ROOT}/shared/context-budget.md`
**Gate de escopo (o que decide se a task é despachada inteira):** `${FLUX_ROOT}/shared/scope-gate.md`
**Gates com o usuário:** `${FLUX_ROOT}/shared/hitl.md`
**Carimbo de atribuição no corpo da PR (Step 4):** `${FLUX_ROOT}/shared/pr-attribution.md`
**Contrato de vertical slice (o que é uma fatia):** `${FLUX_ROOT}/shared/issue-template.md`, seção **Decomposição (vertical slices)**

## Banner de perfil — gabarito (copiar VERBATIM)

Todo output deste elo **abre** com o banner, copiado com as cercas, trocando só o que está entre
chaves (regras e degradações: `${FLUX_ROOT}/shared/preflight.md`, Passo 5; a linha `escopo`:
`${FLUX_ROOT}/shared/scope-gate.md`, "Como o veredito é declarado"). O gabarito mora no corpo do elo de
propósito: num shared, ele não chega ao contexto na hora de emitir.

````
```
perfil: {nome do manifesto | generico}{ (ancora: alvo <path>)} · nivel: {FULL|REDUCED|THIN}
escopo: {🟢 cabe | 🟡 cabe raso | 🔴 nao cabe} ({sinais lidos})
lentes: L1 n/a · L2 {lista|ausente|inalcancavel} · L3 {lista|ausente|inalcancavel}
motor: {nativo <cmd> | exec_fallback <cmd> | autonomo}
degradacoes: {soft ausentes e o que se perde com cada um | nenhuma}
carimbo: {harness} | flux:build@{flux_version}
```
````

**A linha `escopo` sai uma vez só**, com o veredito do passe único do Step 2-quater (os dois insumos
do gate chegam juntos no corpo da issue; `scope-gate.md`, "Dois tempos"). Com `--no-slice` ela continua
saindo, com ` (dispensado por --no-slice)` no fim: a flag desliga a ação do gate, nunca a medição.

`holistico:` **não entra** e `L1` sai `n/a`: este elo não resolve reviewer. A linha `lentes` sai porque
o build é muitas vezes o primeiro elo a tocar um repo, e é onde se descobre que ele está sem cobertura.

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
- **Não poste no Slack nem salve rascunho aqui.** A oferta de pedir review no canal (Step 4, item 7) só
  abre um gate e delega ao `flux:reply`, que rascunha.
- Um repo por invocação. Para várias frentes, várias invocações (ou `/convocar` para mutirão).
- **Não acione specialists**, nem como briefing antes de implementar, nem como gate sobre o diff antes
  da PR (Step 2-ter). Quem revisa é o `/flux:review`, depois.

---

## Step 0-context: resolver perfil de contexto

Seguir o protocolo de `${FLUX_ROOT}/shared/flux-context.md`. Em resumo:

1. Resolver a **âncora** e procurar `flux-context.json` subindo a árvore a partir dela, conforme
   `${FLUX_ROOT}/shared/flux-context.md` (seção "Qual é a âncora"). Neste comando o alvo é sempre
   explícito (`<repo>`), então **a âncora é o repo, não o `cwd`**: `/flux:build backoffice-bff …`
   rodado de qualquer lugar tem que achar o perfil do workspace onde `backoffice-bff` vive.

2. Se encontrar (perfil declarado), extrair:
   - `WORKSPACE_ROOT` = `workspace_root` (raiz dos checkouts; sem o campo, o pai do diretório (`.claude/` ou `.cursor/`) onde o manifesto foi achado)
   - `REPOS` = `repos` (lista de repos conhecidos, usada para validar e sugerir)
   - `EXEC_COMMAND` = `exec_command` se presente, senão `workflow` (nome do comando nativo de execução dos repos deste contexto)
   - `EXEC_FALLBACK` = `exec_fallback` se presente, escalar **ou** mapa por repo; **sem default**
     (ausente = modo autônomo). A resolução está no Step 2, caminho B.
   - `LINEAR_ORG` = `linear_org` (para normalizar IDs de ticket em URL, quando útil)
   - `LINEAR_TOKEN_ENV` = `linear_token_env` (nome da variável do token; ausente = `LINEAR_API_KEY`; `${FLUX_ROOT}/shared/api-first.md`)
   - `SECRETS_FILE` = `secrets_file` (default `~/.secrets`)
   - `VAULT_ROOT` = `vault_root` / `VAULT_CTX` = `vault_context` (onde o board de execução é gravado)
   - `NO_EMDASH` = `no_emdash`
   - `SLACK_DIR` = `slack_directory` (diretório de alias do Slack, `${FLUX_ROOT}/shared/slack-directory.md`; só para a oferta de pedir review no Step 4, opcional)
   - `SPECIALISTS_ROOT` = `specialists_root` (template de path com `{repo}`; degrau 1 da descoberta de
     L2 e degrau 2 da cascata de destino, opcional)
   - `KITS_ROOT` = `kits_root` (template de path com `{repo}`; degrau 3 da cascata de destino, opcional)
   - `KITS` = `kits` (caminhos locais de kit; origem 1 do `KIT_ROOTS`, Passo 1d do preflight, opcional)
   - `WRITE_DESTINATIONS` = `write_destinations` (destinos já aprovados, com o `repos` de cada um;
     degrau 4 da cascata e degrau 3 da descoberta de L2, opcional)

   A tripla de descoberta (`specialists_root`, `kits_root`, `write_destinations`) é extraída inteira
   mesmo sem revisar nada: a linha `lentes` e a escolha entre `--agents-only` e `--engine-only` no
   Step 4 dependem do passo 1a do `${FLUX_ROOT}/shared/review-agents.md`, que a lê em cascata; faltando uma, o build
   declara `L2 ausente` para repo que tem suite.

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

`exec_fallback` **não tem default**: o comando de implementação de um time não é conhecimento da
família. Quem tem um, declara.

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

**A leitura é API primeiro.** Ler o ticket é uma query GraphQL só (descrição, comentários, relações,
anexos), não três ou quatro chamadas de tool em sequência, e o token do manifesto resolve o workspace
certo em vez do que a sessão MCP calhou de autenticar. Seguir `${FLUX_ROOT}/shared/api-first.md`,
canal `linear`, sem degrau de canário (leitura é idempotente); descida para MCP vai a `degradacoes:` como
`transporte mcp (linear: <motivo>)`.

Uma issue nascida do `/flux:issue` já teve os specialists do repo rodando na prospecção: o
"Embasamento no código" **é** o parecer deles, e repassá-lo custa zero chamada de agente.

Duas ressalvas de honestidade sobre esse embasamento, que devem ir junto no prompt do motor:

- **Os números de linha envelhecem.** A apuração foi feita contra o SHA de quando a issue nasceu, e a
  `main` andou desde então. Instrua o motor a localizar **pelo nome do símbolo**, não pela linha, e a
  reportar no retorno o que divergiu.
- **Uma issue escrita à mão não tem esse embasamento**, e isso não é degradação: é só uma issue de
  outra origem. Não invente a seção, não rode specialists para produzi-la.

**Por que este elo não aciona specialists.** Como briefing de entrada, duplicariam o que a issue já
carrega, e as suites declaram que não autoram (sem diff, devolvem aprovação vazia). Como gate de
saída, só compensariam quando o diff passa limpo de primeira, e no modo autônomo seriam o mesmo modelo
relendo o que escreveu. O build carrega o parecer que já existe; quem produz parecer novo é o
`/flux:review`, sobre o diff.

---

## Step 2-bis — Resolver o board, antes de despachar

Com `VAULT_ROOT` resolvido, resolver o board **antes** de disparar o motor, conforme
`${FLUX_ROOT}/shared/board-template.md`, "Resolver o board": o desta sessão, se já houver; senão o do
caso (`case_keys`: `ticket:<ID>`, e `pr:...` quando a task continua uma PR); senão um novo, **perfil
execução** (`type: flux-build`, `generator: "flux-build"`). O board nasce antes porque o motor roda em
worktree por muitos minutos: board que nasce depois do trabalho é ata.

1. **Anunciar o path no chat** na criação ou na retomada.
2. **Frontmatter** pelo template, inclusive a linha desta sessão em `provenance.runs` e o `provenance` com o checklist,
   mais os campos do perfil: `repo`, `ticket`, `engine`, `engine_kind`, `worktree`, `branch`,
   `pr: null`, `scope`.
3. **Painel** com uma linha por etapa do motor, todas `⏳ pendente`:
   `contexto lido · plano · implementação · checks · PR`. Motor nativo que declara etapas próprias
   substitui a lista.
4. **Sem `VAULT_ROOT`:** sem arquivo; painel no chat a cada atualização e a perda declarada no banner.
5. **Com `--dry`:** não criar board. O `--dry` não despacha, então não há execução para observar.

---

## Step 2-quater — Gate de escopo (medir antes de despachar)

Aplicar `${FLUX_ROOT}/shared/scope-gate.md`, tempo **passe único**. Sinais, limiares, contagem e faixas
estão lá, não aqui; este elo declara só o que fazer com a faixa.

**Os insumos já estão em contexto, e nenhum deles custa uma chamada de agente:**

- o **corpo da issue** — entregáveis enumerados, e se ele mistura produção, teste e hook/infra;
- o **embasamento em código do Step 2-ter** — quantos arquivos, em quantos diretórios de topo, em
  quantos repos com escrita prevista;
- o **motor resolvido no Step 2** — `autonomo` é sinal mole, e é o único sinal do contrato que existe
  **só neste elo**: sem os gates do repo, errar grande custa mais.

**Nenhum agente é chamado para medir** (invariante 1 do contrato, e a proibição do Step 2-ter). **Passe
único**, não T0 e T1 como no `flux:refine`, porque o embasamento chega pronto.

O gate roda **depois do board e antes do despacho**: toda decisão dele precisa de rastro (invariante 3),
inclusive a dispensa e a saída inócua, e o board nasce vazio no Step 2-bis, antes de qualquer minuto de
motor. O que o gate barra é o despacho (Step 3), não a anotação.

### O que cada faixa faz

| faixa | ação |
|---|---|
| 🟢 **cabe** | despacha direto. Nenhum gate, nenhuma pergunta. |
| 🟡 **cabe raso** | abre o gate oferecendo fatiar, **com o corte proposto** |
| 🔴 **não cabe** | abre o gate com o corte proposto e a **fatia 1 recomendada** |

O gate abre também no 🟡 (barrar custa uma pergunta; despachar grande custa a execução inteira). Entre 🟡
e 🔴, o que muda é a recomendação e quão nomeado é o corte.

### O menu (single-select, `${FLUX_ROOT}/shared/hitl.md`)

Antes de abrir, montar o **corte proposto**: quais frentes o pedido tem, quais entram na fatia 1,
quais ficam, e — obrigatoriamente — **o que a fatia 1 entrega sozinha**. Cada fatia respeita o
contrato de vertical slice do `${FLUX_ROOT}/shared/issue-template.md`, seção **Decomposição (vertical
slices)**: independentemente entregável, atravessa as camadas necessárias, **1 repo**. Camada não é
fatia: "o backend disto" e "o frontend disto" são **uma** fatia quando uma não serve sem a outra.
Uma proposta que não diz o que a primeira fatia entrega sozinha não é proposta, é uma lista.

Uma única question, opções nesta ordem:

1. **Fatiar e despachar a fatia 1** *(Recomendado)* — despacha ao motor **só** a fatia 1, com o
   embasamento restrito a ela. As demais fatias **não viram issue aqui** (este elo não cria issue):
   ficam nomeadas no board e no handoff. Recomendada nas duas faixas, e mais ainda quando o motor é
   `autonomo`.
2. **Despachar inteiro** — despacha a task como veio, sem corte. O gate fica registrado como
   dispensado no board, com os sinais apurados. Não cancela nada, não altera a task.
3. **Só mostrar o plano** — imprime o veredito, os sinais lidos e o corte proposto, e **para**. Nada é
   despachado, nada é escrito no repo. Saída inócua.

Sem round-trip estruturado comprovado, o gate não desaparece: siga o fallback numerado de
`${FLUX_ROOT}/shared/hitl.md`, com a mesma ordem, e declare a degradação no banner.

**O gate roda na main, nunca dentro de subagente** — subagente não tem canal com o usuário. Quem
despacha resolve o gate primeiro e passa a decisão já tomada.

### `--no-slice` e `--dry`

- **`--no-slice`** mede, declara e **não abre o gate**: despacha inteiro. É a única renúncia, e é do
  usuário, nunca do elo (o `flux:refine` não tem equivalente: `scope-gate.md`, "Vermelho no
  `flux:refine` não tem override").
- **`--dry`** não abre o gate tampouco, por outro motivo: ele não despacha, então não há o que barrar.
  O veredito e o corte proposto entram no plano impresso no Step 3.

### O que fica registrado

Com board (sem `--dry`), sempre:

1. **o veredito** — faixa e sinais lidos — como linha da Timeline, tipo `escopo`, e
   `scope:` no frontmatter;
2. **a escolha do usuário** — como linha tipo `decisão`, dizendo qual opção e, se fatiou, o que ficou
   de fora **por nome**;
3. **a dispensa** — tanto a da opção 2 quanto a de `--no-slice` — como linha tipo `escopo`, com os
   sinais que o gate tinha apurado. Dispensar é legítimo; dispensar sem rastro não é.

---

## Step 3 — Anunciar e despachar

1. Antes de disparar, informe ao usuário em **uma linha** (duas se houver ressalva):

> Despachando para `<repo>` via motor **nativo** (`/<EXEC_COMMAND>`): `<task>`. O motor do repo assume daqui.

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
2. **Validar e alinhar os metadados da PR antes da atribuição.** A main faz esta conciliação depois
   do retorno do motor; não reabre a implementação. Sem PR (`pr: null`), não há conciliação: seguir
   para o item 4.
   - **Pré-condições, na main.** Se o preflight declarou `gh` ausente, parar esta auditoria e
     registrar `NÃO VERIFICADO` com o motivo. Parsear `PR_NUMBER` e `REPO_FULL` da URL retornada. Ler
     a identidade uma única vez com `gh api user -q .login` e guardar em `ME`; ler a PR com
     `gh pr view <PR_NUMBER> --repo <REPO_FULL> --json url,title,body,author,isDraft,headRefName,baseRefName`.
     Se alguma consulta falhar, `ME` vier vazio ou a URL não puder ser analisada, registrar
     `NÃO VERIFICADO` com o motivo. Não ler nem imprimir credenciais. Conferir que URL, repo, branch
     de origem e base correspondem ao alvo. Definir `IS_OWN_PR = (author.login == ME)` uma única vez,
     com o guard de autoria de `${FLUX_ROOT}/shared/pr-attribution.md` (§Guardrails), valendo para
     esta auditoria e para a atribuição. PR de terceiro: não editar título, corpo nem atribuição;
     registrar o bloqueio.
   - **Draft.** O estado de uma PR aberta pelo motor do repo não é do dispatcher: PR própria fora de
     draft vira o bloqueio `PR aberta pronta, não draft`, sem conversão. A única exceção é o caminho
     C do Step 2 (modo autônomo), em que o draft é regra do próprio flux: ali, converter com
     `gh pr ready <PR_NUMBER> --repo <REPO_FULL> --undo`, reler e confirmar `isDraft: true`; sem a
     confirmação, registrar o bloqueio.
   - **Apuração de convenções, fora da main.** Em workspace mode, despachar um subagente com prompt
     autocontido (repo, `PR_NUMBER`, branch, título e corpo remotos, checks e bloqueios devolvidos
     pelo motor), conforme `${FLUX_ROOT}/shared/fanout-discipline.md`; em repo mode, rodar inline,
     como o motor. A apuração lê `AGENTS.md`/`CLAUDE.md`, as regras de contribuição e o template de
     PR do repo (raiz, `.github/` ou `docs/`); sem template, compara com até três PRs mergeadas
     recentes do mesmo repo, sem autores bot, e nunca com exemplos de outro repo. Confronta título e
     corpo com essas convenções e com as evidências (diff e commits reais da branch, checks
     verificados pelo motor, bloqueios reportados) e devolve só o veredito: `alinhado`, ou
     `desalinhado` com os campos, o título proposto e o corpo proposto gravado no `SCRATCH`. Sem
     identificador fornecido, não cria um; nunca inventa mudança, commit, resultado ou bloqueio.
   - **Conteúdo do corpo proposto.** Ticket real, mudanças implementadas, commits, resultado de cada
     check e bloqueios. Só é aprovado o que tem evidência: checks que falharam continuam falhos, os
     bloqueados recebem `BLOQUEADO` com o motivo, e os que não rodaram ou não puderam ser verificados
     ficam como `NÃO EXECUTADO`/`NÃO VERIFICADO`, com motivo. Atualizar só o que estiver ausente ou
     comprovadamente desalinhado, preservando links, seções úteis ou desconhecidas, notas manuais,
     códigos, proveniência e trailers; o que for ambíguo fica como está e vira bloqueio relatado.
   - **Publicação: um ciclo só, junto com o item 3.** O corpo proposto entra na cópia `body-after`
     da §Mecânica de `${FLUX_ROOT}/shared/pr-attribution.md`, o algoritmo de atribuição do item 3
     roda sobre essa mesma cópia, e só então sai um único `gh pr edit` (com `--title` quando o título
     mudou), com os pós-checks do contrato. Antes de publicar, mostrar o diff de título e corpo e
     pedir confirmação pelo gate de `${FLUX_ROOT}/shared/hitl.md`; recusado, publicar só a
     atribuição. Com `NO_EMDASH`, título e corpo seguem a regra. Depois, reler e confirmar título,
     corpo, autor e draft.
   - **Quando a auditoria não passa** (`NÃO VERIFICADO`, PR de terceiro, PR fora de draft, edição
     recusada ou não confirmada): o item 3 só carimba se `IS_OWN_PR` estiver verificado, os itens 4 a
     6 seguem, o bloqueio entra na Timeline do board e no handoff, `execution_status` não vai para
     `done`, e o handoff aponta `${FLUX_CMD}iterate <pr>` com o bloqueio nomeado.
3. **Conciliar a atribuição da PR.** Se o motor abriu PR, a main (depois do retorno, não o motor)
   aplica `flux:build@<FLUX_VERSION>` e concilia uma entrada legada `Gerado por: <par-do-motor>` na
   linha `🤖 Generated with ...`, pelo algoritmo de `${FLUX_ROOT}/shared/pr-attribution.md`, com o
   `HARNESS_LABEL` do preflight (o mesmo para Claude Code, Cursor, Codex, OpenCode ou `AI agent`), no mesmo ciclo
   de publicação do item 2. Forma ambígua → preservar o body. `pr: null` → nada a conciliar.
   `PR_NUMBER` e `REPO_FULL` vêm da URL devolvida pelo motor; `SCRATCH` é o diretório temporário da
   sessão; `IS_OWN_PR` é o do item 2, reutilizado sem novo `gh api user`. Falso → não carimbar.
4. **Atualizar o board com o resultado**: etapas em `✅`/`❌`, `pr:` preenchido (ou `null` se o motor
   não chegou a abrir), `esforço` = `arquivos tocados · checks (verde/total)`, e o
   `🎯 Próximo Movimento` apontando o elo seguinte.
5. **O board continua sendo o do caso.** Quando a PR nasce, gravar `pr:` e acrescentar
   `pr:<owner>/<repo>#<n>` em `case_keys`. O `${FLUX_CMD}review` e o `${FLUX_CMD}iterate` dessa PR,
   nesta sessão ou em outra, escrevem neste mesmo board. `execution_status` segue `active` até o caso
   fechar.
6. **Motor falhou?** O board fica com `pr: null` e a etapa que quebrou em `❌`. Isso é resultado
   válido e é o que torna a falha investigável depois. Não apagar o board.
7. **Oferecer o pedido de review no canal de PR.** Só quando o motor abriu PR, a auditoria do item 2
   passou sem bloqueio, o `SLACK_DIR` está declarado com algum canal que tenha o intent `pedir-review`
   (`${FLUX_ROOT}/shared/slack-directory.md`, seção "Direção do canal e intents rápidos") **e** há
   capacidade de Slack na sessão (`mcp.slack` do manifesto ou servidor achado na sessão, como o
   "Validar ambiente" do `${FLUX_CMD}reply`). Sem qualquer uma, nenhuma pergunta, nenhuma linha extra e
   nenhum token em `degradacoes:` (a oferta é oportunista). Atendidas, abrir **um GATE**
   (`${FLUX_ROOT}/shared/hitl.md`), single-select, depois dos itens 3 a 6 e antes do handoff:

   - `Pedir review em <nome do canal>`, uma opção por canal na ordem do diretório. Com um canal só, a
     opção é a primeira e leva `(Recomendado)` no rótulo; com mais de um, nenhuma opção é recomendada,
     porque o build não sabe qual canal o usuário quer.
   - `Agora não`.

   Aceitar roda, por exemplo, `${FLUX_CMD}reply "<match> <nome do canal> <url>"`, **sempre entre aspas**
   (um verbo do reply dentro do `match` não pode ser lido como verbo do comando), com uma frase
   de `match` literal do intent `pedir-review` daquele canal (a primeira da lista do diretório), o nome
   do canal (primeiro alias; sem `aliases`, o slug) e a URL completa da PR
   (`https://github.com/<REPO_FULL>/pull/<PR_NUMBER>`). A frase vem do diretório para garantir o
   casamento; se o reply mesmo assim seguir o pipeline normal, avisar o usuário em vez de afirmar que
   só rascunha. O reply rascunha pelo `template` e passa pelo próprio gate de salvar; este elo não lê o
   Slack, não posta nem salva rascunho, e recusar não registra nada. Sem round-trip estruturado, o
   fallback numerado do `hitl.md`. Aqui e não antes: a pergunta precisa da PR para citar.

Ao final, o resultado é o do motor (tipicamente PR draft + CI monitorado). Feche apontando o próximo elo, escolhendo **um**:

- PR draft aberta e sozinha → `${FLUX_CMD}review <pr>` (review formal) ou `${FLUX_CMD}peek <pr>` (relance rápido).
- PR já com threads/CI vermelho → `${FLUX_CMD}iterate <pr>`.
- Task era uma frente de entrega multi-PR → `${FLUX_CMD}land <issue>`.

**Fatiou no Step 2-quater?** O handoff carrega também as fatias que ficaram, nomeadas, na ordem
proposta, com o que cada uma entrega (viram issue pelo `${FLUX_CMD}issue`, ou nova invocação deste
elo; **este comando não cria issue**). Fatia que só existe no chat é fatia perdida.

Montar com o `FLUX_CMD` resolvido no preflight, **nunca** com `/flux:` literal.

Não rode o próximo elo automaticamente: informe e devolva o volante ao usuário. A única exceção é o
`${FLUX_CMD}reply` que o usuário aceitou no gate do item 7.

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
