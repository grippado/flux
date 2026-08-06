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
**Bootstrap de specialists:** `${FLUX_ROOT}/shared/bootstrap-specialists.md`
**Formato do board:** `${FLUX_ROOT}/shared/board-template.md`, **perfil execução** (`type: flux-build`). As seções, a legenda de ícones e a disciplina de carimbo de data vivem lá e não são repetidas aqui.
**Orçamento de contexto (leitura sob demanda, delegação):** `${FLUX_ROOT}/shared/context-budget.md`

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
lentes: L1 {agente} · L2 {lista|ausente} · L3 {lista|ausente}
motor: {nativo <cmd> | exec_fallback <cmd> | autonomo}
degradacoes: {soft ausentes e o que se perde com cada um | nenhuma}
```
````

Este elo **não** resolve reviewer holístico — quem revisa é o motor do repo, depois, em outro
elo. O campo `holistico:` **não entra no banner**; a linha `lentes` sai porque o build é
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

### Exemplos

```
/flux:build api-gateway ENG-1234
/flux:build notifications https://linear.app/{LINEAR_ORG}/issue/NOT-2693
/flux:build web-monorepo "ajustar empty state do EventAnnouncement"
/flux:build payments PAY-88 --dry
/flux:build ENG-1234                    # dentro de <WORKSPACE_ROOT>/api-gateway
```

## Out of scope (NUNCA faça)

- **Não implemente a task aqui.** Se você se pegar editando código de produto neste comando, o despacho falhou — pare e reporte.
- **Não acione CI nem cloud.** Este comando é local: nunca chame `/workflow-cloud`, nunca dispare workflow do GitHub Actions.
- **Forja fica de fora.** Qualquer `/forja:*` é opt-in e explícito do usuário; nunca o invoque a partir daqui.
- **Não mergeie nada.** Merge é decisão do `/flux:land` + humano.
- Um repo por invocação. Para várias frentes, várias invocações (ou `/convocar` para mutirão).

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
   - `EXEC_FALLBACK` = `exec_fallback` se presente; **sem default** (ausente = modo autônomo)
   - `LINEAR_ORG` = `linear_org` (para normalizar IDs de ticket em URL, quando útil)
   - `VAULT_ROOT` = `vault_root` / `VAULT_CTX` = `vault_context` (onde o board de execução é gravado)
   - `NO_EMDASH` = `no_emdash`

3. Se não encontrar (perfil genérico):
   - `WORKSPACE_ROOT` = o `cwd`
   - `REPOS` = subdiretórios com `.git` do `cwd`
   - `EXEC_COMMAND` = `workflow`
   - `EXEC_FALLBACK` = nenhum (modo autônomo)
   - `VAULT_ROOT` = não persiste por default (o board sai só no chat); `VAULT_CTX` = `generic`
   - `NO_EMDASH` = `false`

---

## Step 1 — Resolver o repo-alvo

1. Parse dos argumentos: retire primeiro as flags próprias (`--dry`, `--engine`). Do que restar, o **primeiro token** é candidato a `<repo>`; o resto é `$REST` (task + flags do motor), repassado inteiro e sem interpretação.

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
esse que roda quando o repo não tem motor nativo. Confirme que o comando está disponível na sessão:

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

## Step 3 — Anunciar e despachar

1. Antes de disparar, informe ao usuário em **uma linha** (duas se houver ressalva):

> Despachando para `<repo>` via motor **nativo** (`/<EXEC_COMMAND>`): `<task>`. O motor do repo assume daqui.

O banner de perfil (`${FLUX_ROOT}/shared/preflight.md`, Passo 5) declara, além do motor escolhido,
**quais camadas de specialists existem para este repo** (L2 local e L3 do repo). Elas não participam
da execução, mas o build é frequentemente o primeiro elo a tocar um repo novo, e é aqui que você
descobre que ele está sem cobertura. A oferta de criar vem no Step 4, depois do trabalho.

ou, no fallback:

> `<repo>` não tem motor nativo — despachando via `<EXEC_FALLBACK>` em worktree dedicado. Convenções vêm do `CLAUDE.md` do repo.

2. Se `--dry`, **pare aqui**: imprima repo resolvido, checkout, motor escolhido, task e flags repassadas. Nada mais.

3. Disparar o motor. **Onde ele roda depende do modo de sessão** — a regra é a disciplina de fan-out
   (`${FLUX_ROOT}/shared/fanout-discipline.md`): o repo-alvo nunca pode ser um **segundo**
   root carregado no contexto principal.

   - **Workspace mode** (`cwd` é o workspace, `REPO_PATH` é outro diretório) → **subagente
     obrigatório** (`subagent_type: general-purpose`). O prompt é auto-contido: `cd "$REPO_PATH"`,
     rodar `/<EXEC_COMMAND> $REST` (ou `/<EXEC_FALLBACK> $REST`), e devolver **< 40 linhas**:
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

1. **Oferecer a suite local quando faltar.** Se o repo não tem L2 (suite de specialists local),
   oferecer o Bootstrap agora, seguindo `${FLUX_ROOT}/shared/bootstrap-specialists.md`. **Aqui e não
   antes**: quem pediu um build quer código, e uma entrevista sobre agents antes do trabalho é ruído.
   Havendo L2, não perguntar nada.
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
- Quando `NO_EMDASH` é `true`, nada que possa ir para o GitHub (título/corpo de PR, comentário) usa travessão ou en-dash.
