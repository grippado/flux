---
name: build
description: Orquestrador `flux:build` — elo de execução da família: recebe um ticket/descrição e um repo, e despacha para o motor de execução nativo daquele repo (`/workflow`), caindo em `/core:implement-task` quando o repo não tem motor próprio. Produz código + PR draft. Não reimplementa pipeline de implementação. Global, resolve contexto via `flux-context.md`. Local apenas — CI e Forja ficam fora.
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
**Formato do board:** `${FLUX_ROOT}/shared/board-template.md`, **perfil execução** (`type: build`). As seções, a legenda de ícones e a disciplina de carimbo de data vivem lá e não são repetidas aqui.
**Orçamento de contexto (leitura sob demanda, delegação):** `${FLUX_ROOT}/shared/context-budget.md`

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
| `--engine <cmd>` | Força o motor (ex.: `--engine core:implement-task`), pulando a descoberta do Step 2. |

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

1. Procurar `flux-context.json` em `.claude/` subindo a árvore a partir do `cwd`.

2. Se encontrar (perfil declarado), extrair:
   - `WORKSPACE_ROOT` = `workspace_root` (raiz dos checkouts; sem o campo, o diretório pai do `.claude/` onde o manifesto foi achado)
   - `REPOS` = `repos` (lista de repos conhecidos, usada para validar e sugerir)
   - `EXEC_COMMAND` = `exec_command` se presente, senão `workflow` (nome do comando nativo de execução dos repos deste contexto)
   - `EXEC_FALLBACK` = `exec_fallback` se presente, senão `core:implement-task`
   - `LINEAR_ORG` = `linear_org` (para normalizar IDs de ticket em URL, quando útil)
   - `VAULT_ROOT` = `vault_root` / `VAULT_CTX` = `vault_context` (onde o board de execução é gravado)
   - `NO_EMDASH` = `no_emdash`

3. Se não encontrar (perfil genérico):
   - `WORKSPACE_ROOT` = o `cwd`
   - `REPOS` = subdiretórios com `.git` do `cwd`
   - `EXEC_COMMAND` = `workflow`
   - `EXEC_FALLBACK` = `core:implement-task`
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

3. Resolver o checkout:

```bash
REPO_PATH="$(pwd)/$REPO"
[ -d "$REPO_PATH/.git" ] || REPO_PATH="$WORKSPACE_ROOT/$REPO"
```

4. Se não resolver, **pare** com erro claro listando o que existe (`REPOS` do manifesto ∩ o que tem checkout local):

```bash
[ -d "$REPO_PATH/.git" ] || {
  echo "repo '$REPO' não encontrado. Checkouts disponíveis em $WORKSPACE_ROOT:"
  ls -d "$WORKSPACE_ROOT"/*/.git 2>/dev/null | xargs -n1 dirname | xargs -n1 basename
  exit 1
}
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

**B) Fallback genérico** (`EXEC_FALLBACK`, default `core:implement-task`):

Usado quando o repo **não tem** motor nativo. Confirme que o comando de fallback está disponível na sessão (ele costuma vir de um plugin instalado, e o default `core:implement-task` vem do plugin `core`). Se estiver:

```
ENGINE="fallback"
```

Neste caminho, **você** é responsável pela disciplina que o motor nativo daria de graça:
- Trabalhar em **worktree dedicado** — ver `${FLUX_ROOT}/shared/worktree-discipline.md`. Nunca na árvore principal do repo.
- Ler o `CLAUDE.md` do repo antes de escrever (convenções do repo vencem qualquer default).
- Rodar os checks que o repo declarar (lint/typecheck/test) antes de abrir a PR.

**C) Nenhum dos dois** → pare com mensagem clara:

```
'<repo>' não tem /<EXEC_COMMAND> nativo e o fallback '<EXEC_FALLBACK>' não está disponível nesta sessão.
Opções: abrir sessão em repo mode, habilitar o plugin core, ou usar --engine <cmd> explicitamente.
```

> Repos sem motor nativo caem no fallback, o que antes era um erro morto.
> **Antes de cair no fallback, procure uma skill nativa mais específica.** Um repo pode não ter `/<EXEC_COMMAND>` e ainda assim declarar skills próprias para o tipo de trabalho pedido (uma suíte E2E com skills de teste, por exemplo). Nesse caso, ofereça a skill nativa ao usuário em vez do fallback genérico.

---

## Step 2-bis — Criar o board de execução (antes de despachar)

Com `VAULT_ROOT` resolvido, criar o board **antes** de disparar o motor, seguindo o **perfil execução**
de `${FLUX_ROOT}/shared/board-template.md` (`type: build`).

> **Por que antes.** O motor roda em worktree, longe da main, por muitos minutos. Se o board nascesse
> no fim, o intervalo inteiro seria cego e um motor que trava não deixaria rastro nenhum. Board que
> nasce depois do trabalho é ata, não board.

1. **Path:** `<VAULT_ROOT>/0-inbox/YYYY-MM-DD-HHMM-build-<repo-slug>-<slug-do-ticket>.md`.
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

1. **Atualizar o board com o resultado**: etapas em `✅`/`❌`, `pr:` preenchido (ou `null` se o motor
   não chegou a abrir), `esforço` = `arquivos tocados · checks (verde/total)`, e o
   `🎯 Próximo Movimento` apontando o elo seguinte.
2. **Board de build morre no handoff.** Ele cobre uma execução, não um processo: `execution_status`
   vai para `done` quando a PR nasce, e o board do `/flux:iterate` assume dali. Gravar
   `iterate_board:` quando o iterate rodar, e o board do iterate aponta de volta em `parent_board:`.
3. **Motor falhou?** O board fica com `pr: null` e a etapa que quebrou em `❌`. Isso é resultado
   válido e é o que torna a falha investigável depois. Não apagar o board.

Ao final, o resultado é o do motor (tipicamente PR draft + CI monitorado). Feche apontando o próximo elo, escolhendo **um**:

- PR draft aberta e sozinha → `/flux:review <pr>` (review formal) ou `/flux:peek <pr>` (relance rápido).
- PR já com threads/CI vermelho → `/flux:iterate <pr>`.
- Task era uma frente de entrega multi-PR → `/flux:land <issue>`.

Não rode o próximo elo automaticamente: informe e devolva o volante ao usuário.

---

## Rules

- **Dispatcher, não executor.** Nunca reimplemente lógica de workflow que pertence ao repo.
- **Flags verbatim.** Cada repo define as suas (`--no-review`, etc.); não as interprete nem valide.
- **Local apenas.** Sem CI, sem cloud, sem Forja.
- **Um repo por invocação.**
- **Fallback é degradação consciente, não silenciosa.** Sempre diga ao usuário que caiu no fallback e por quê.
- Quando `NO_EMDASH` é `true`, nada que possa ir para o GitHub (título/corpo de PR, comentário) usa travessão ou en-dash.
