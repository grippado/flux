---
name: land
description: "Orquestrador `flux:land` — orquestra a entrega multi-PR de uma issue/feature (descobre, ordena, valida regressão com specialists por default via review-agents.md, mantém merge-ready delegando ao `flux:iterate`, emite go/no-go). Global, resolve contexto via flux-context.json. NÃO mergeia. Complementa o mutirao/convocar (que criam PRs); este orquestra PRs já existentes até o merge. Workspace mode."
user-invocable: true
---

# /flux:land

Comando orquestrador de **entrega**: enxerga o conjunto de PRs de uma feature espalhada por vários repos e conduz todas até ficarem prontas para merge, na ordem certa e sem regressão.

É a camada acima da família de review:

- `/flux:review` — gera review de UMA PR (read-only).
- `/flux:iterate` — fecha o loop de UMA PR (aplica + posta + resolve + commita + pusha + watch).
- `/flux:land` — orquestra VÁRIAS PRs de uma entrega: descobre, ordena, valida regressão, mantém merge-ready (delegando ao iterate), e emite go/no-go. **Este.**

Não confundir com `mutirao`/`/convocar`: aqueles planejam e CRIAM PRs a partir de tasks; este assume PRs que **já existem** e cuida do caminho até produção.

**Legenda canônica de badges (findings):** `${FLUX_ROOT}/shared/review-legend.md`
**Contrato de agentes (specialists + reconciliação):** `${FLUX_ROOT}/shared/review-agents.md`
**Bootstrap de specialists (repo sem suite local):** `${FLUX_ROOT}/shared/bootstrap-specialists.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Disciplina de worktree (o iterate de cada PR escreve sempre em worktree):** `${FLUX_ROOT}/shared/worktree-discipline.md`
**Disciplina de fan-out (OBRIGATÓRIA — uma PR = um subagente; nada pesado na main):** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Orçamento de contexto (OBRIGATÓRIO — delivery é multi-repo, é o comando que mais sofre):** `${FLUX_ROOT}/shared/context-budget.md`

## Inputs aceitos

| Forma | Significado |
|-------|-------------|
| `/flux:land <url-issue-linear>` | Descobre as PRs da issue (ex.: ticket CPU-/MOM-) |
| `/flux:land ENG-4335 ENG-4262 ENG-4261` | Múltiplas issues, entrega agregada |
| `/flux:land <url-pr> <url-pr> ...` | Conjunto explícito de PRs (quando o naming não ajuda) |
| `/flux:land ... --once` | Uma passada só (desliga o watch consolidado) |
| `/flux:land ... --solo` | Pula os specialists de regressão; roda só o holístico |
| `/flux:land ... --board <path>` | Assume/atualiza uma nota-board existente em vez de criar nova |

> **Watch consolidado é o default** (desliga com `--once`). Após a 1ª passada, o comando fica vivo num único loop varrendo TODAS as PRs da entrega (CI + novas rodadas do bot), mantendo cada uma merge-ready e o board atualizado, até a entrega assentar. `--solo` vale em todas as rodadas.

As flags podem aparecer em qualquer posição e combinadas.

## Ordem de execução OBRIGATÓRIA (NÃO reordenar)

1. **Resolver contexto** (Step 0) e **validar ambiente** (gh, workspace).
2. **Descobrir** todas as PRs da entrega.
3. **Abrir o board** no vault — anunciar o caminho no chat desde o início; atualizar a cada passo relevante (não acumular updates para o final).
4. **Montar** o grafo de ordem + locks de merge → refletir no painel.
5. **Validar** regressão de subida de cada PR (contra o código real de `main`) → refletir no painel.
6. **Iterar** cada PR acionável **despachando um subagente por PR** (que roda `/flux:iterate --auto --once` lá dentro) para deixá-la merge-ready → atualizar a linha dela no painel com o retorno curto de cada subagente.
7. **Pedido de review no Slack** (gatilho: PR sai de draft) → perguntar ao usuário onde postar e registrar no board.
8. **Consolidar** o go/no-go no board.
9. **Watch consolidado** (default): reagendar e repetir até assentar, atualizando o board a cada tick.

## Out of scope (NUNCA faça)

- **Não mergeia** (`gh pr merge`), não aprova nem usa `REQUEST_CHANGES`. O go/no-go é recomendação; o merge é do humano.
- Não pusha `main`, não troca de branch sozinho.
- Não cria PRs nem implementa features novas (isso é `mutirao`/`/convocar`).
- Não resolve thread humana em `needs-discussion` (herda o guardrail do iterate).
- Não roda escrita em repo sem checkout local: registra o bloqueio e segue.
- **Não roda o `/flux:iterate` inline** no contexto principal (fase 4): sempre via subagente. Ver `${FLUX_ROOT}/shared/context-budget.md`.
- **Não faz trabalho pesado na main, em fase nenhuma.** Investigar regressão (fase 3), iterar PR (fase 4) e qualquer varredura de repo vão para subagente, em paralelo. Na main ficam: descoberta via `gh` (JSON barato), grafo de ordem, board, HITL e watch. Ver `${FLUX_ROOT}/shared/fanout-discipline.md` — regra pétrea da família, como o worktree.
- **Não escreve, edita nem roda comando dentro do checkout de um segundo repo** a partir do contexto principal. O contexto principal orquestra e mantém o board; quem entra em repo é subagente.
- Não relê o board inteiro a cada tick: atualiza a seção afetada (Regra 4 do orçamento de contexto).

---

## Fluxo de execução

### 0. Step 0-context: resolver perfil + sanidade + parse

**Seguir o protocolo de `${FLUX_ROOT}/shared/flux-context.md`.** Em resumo:

1. Resolver a **âncora** (alvo primeiro, `cwd` depois — ver `${FLUX_ROOT}/shared/flux-context.md`,
   seção "Qual é a âncora") e procurar `flux-context.json` em `.claude/` subindo a árvore a partir
   dela:
   ```
   <cwd>/.claude/flux-context.json
   <parent>/.claude/flux-context.json
   ...
   ```

2. Se encontrar (perfil declarado), extrair:
   - `HOLISTIC` = `holistic_reviewer`
   - `VAULT_ROOT` = `vault_root`
   - `VAULT_CTX` = `vault_context`
   - `NO_EMDASH` = `no_emdash`
   - `SPECIALISTS_ROOT` = `specialists_root` (template com `{repo}`)
   - `REPOS` = `repos` (lista de repos conhecidos do contexto)
   - `WORKSPACE_ROOT` = pai do diretório `.claude/` onde o manifesto foi encontrado
     (ex.: manifesto em `<raiz>/.claude/flux-context.json` → `WORKSPACE_ROOT=<raiz>`)

3. Se não encontrar (perfil genérico):
   - `HOLISTIC` = `pr-reviewer`
   - `VAULT_ROOT` = não persiste por default; `--board <path>` ou criar em `pwd`
   - `VAULT_CTX` = `generic`
   - `NO_EMDASH` = `false`
   - `SPECIALISTS_ROOT` = `<repo-checkout>/.claude/agents/reviewer.md` (override local)
   - `REPOS` = [] (descoberta dinâmica a partir dos repos no workspace)
   - `WORKSPACE_ROOT` = `pwd`

**ORG do GitHub:** inferir via `git -C <WORKSPACE_ROOT>/<repo> remote get-url origin` no primeiro repo com checkout disponível, extraindo o owner (`<ORG>/<repo>` na URL do remote).

**Sanidade:**

```bash
gh auth status   # se falhar, abortar pedindo `gh auth login`
```

Se o `pwd` não estiver sob `WORKSPACE_ROOT`, avise para `cd` no workspace antes de seguir (o iterate de cada PR precisa do checkout local de cada repo; a worktree por branch é criada pelo próprio iterate via `${FLUX_ROOT}/shared/worktree-discipline.md`).

**Parse de flags:**

```bash
ONCE=false; SOLO=false; BOARD=""
# separar targets (issues ou URLs de PR) das flags --once / --solo / --board
```

### 1. Descoberta das PRs

**Regra de ouro (não pular): PR não vive só em `claude/<ticket-id>`.** Follow-ups, hotfixes e PRs abertas por outro contexto/pessoa depois da descoberta inicial usam naming totalmente diferente (`claude/<ticket-id>-2`, `fix/<ticket-id>-...`, `<username>/<ticket-id>-...`) e às vezes até base branch diferente (`release-train-terca`, não só `main`). Buscar só por `--head "claude/<ticket-id>"` PERDE essas PRs silenciosamente — já aconteceu (uma entrega teve 3 PRs adicionais descobertas só porque o usuário reparou depois). Por isso a descoberta é **por conteúdo (título/corpo), não por branch** — branch-match é só um cross-check secundário.

Para cada target:

- **Issue Linear** (`CPU-XXXX`/`MOM-XXXX` ou URL): pegar metadados, sub-issues **e anexos/links** via Linear MCP (`get_issue`) — a integração GitHub do Linear costuma auto-linkar PRs mencionadas na descrição/branch à issue; isso é a fonte mais confiável quando disponível. Derivar o `ticket-id` em lowercase.

- **Descoberta primária (por conteúdo, todos os repos de `REPOS`):**

  ```bash
  for repo in <REPOS>; do
    gh pr list --repo <ORG>/$repo --search "<TICKET-ID>" --state all \
      --json number,url,title,state,isDraft,headRefName,baseRefName,mergeable,reviewDecision
  done
  ```

  `--search` faz full-text em título/corpo — pega qualquer branch/naming, desde que o título/corpo mencione o ticket. Rode para CADA ticket-id da entrega (o principal e qualquer issue-irmã descoberta — ver abaixo).

  Sem manifesto (`REPOS = []`): varrer os repos detectados localmente em `WORKSPACE_ROOT` por `ls` + confirmar remote GitHub.

- **Cross-check secundário (branch-match, para o raro caso sem menção no título/corpo):**

  ```bash
  gh pr list --repo <ORG>/$repo --state all --json number,url,title,headRefName \
    --jq '.[] | select(.headRefName | test("(?i)<ticket-id>"))'
  ```

  Padrão `test` case-insensitive e SUBSTRING — cobre `claude/<ticket-id>-2`, `fix/<ticket-id>-...`, `<user>/<ticket-id>-...`, etc.

- **URLs de PR** no input: usar direto (`{owner}/{repo}/pull/{n}`).

- **Issues-irmãs descobertas em runtime:** se o corpo de alguma PR encontrada mencionar outro ticket que não estava nos targets originais, **não absorva silenciosamente nem ignore** — pare e pergunte ao usuário se esse ticket entra no escopo desta entrega ou fica só como referência cruzada no board.

Dedup e monte `PRS[]`. Para cada PR, confira se o **repo** tem checkout local (`<WORKSPACE_ROOT>/<repo>`):

```bash
git -C <WORKSPACE_ROOT>/<repo> worktree list   # inspecionar worktrees já existentes do repo
```

A worktree dedicada à `headRefName` de cada PR **não precisa existir agora**: quando o delivery iterar a PR (fase 4), o `/flux:iterate` a resolve/cria via `${FLUX_ROOT}/shared/worktree-discipline.md`. O que trava é faltar o **checkout do repo** em si: se o repo não estiver clonado sob `WORKSPACE_ROOT`, registre a PR no board como `sem-checkout` e siga (o iterate dela fica bloqueado até o repo existir localmente). PRs já `MERGED` entram no board como contexto (não são acionáveis) — mas ENTRAM.

**Re-descoberta a cada tick do watch (seção 6):** PRs de follow-up/hotfix podem aparecer DEPOIS da descoberta inicial, inclusive já mergeadas por outro contexto. Rode a descoberta primária de novo em todo tick; qualquer PR nova — mergeada ou não — entra no painel, gera linha `descoberta` na Timeline de Eventos Relevantes e é anunciada no chat.

Se nenhuma PR acionável, avise e termine.

### 2. Grafo de ordem + locks

- Classifique cada PR por **camada** (backend/api, bff, frontend, infra) e por issue.
- Detecte dependências de deploy (quem consome contrato de quem) e monte a **ordem de merge** por toposort cross-repo (mesma lógica de camadas/`blocked_by` do `mutirao-planner`, `${FLUX_ROOT}/agents/mutirao-planner.md`).
- Fontes de **lock**:
  - **base branch empilhado**: `baseRefName != main` → a PR base entra antes (garantido pelo próprio base).
  - **acoplamento de contrato**: descoberto na fase 3 (ex.: backend gatilho por último).
  - **regra de produto**: conhecida do domínio (ex.: banner publicado antes de remover o modal legado).
- Saída: lista ordenada + locks explícitos por PR (ex.: `#4485 só após #4480`).

### 3. Validação de regressão de subida (núcleo)

Para CADA PR, responda com evidência `arquivo:linha` contra o código real de `main`:

> **Subir esta PR na sua posição da ordem, com as irmãs ainda não mergeadas, causa regressão em produção?**

**A investigação roda inteira em fan-out** (`${FLUX_ROOT}/shared/fanout-discipline.md`): o contexto principal formula a pergunta e recebe o veredito com a evidência `arquivo:linha`; quem abre o checkout e lê o código é subagente. Todos os despachos da fase vão num único bloco de Task calls.

**Agentes de investigação — seguir o contrato completo de `${FLUX_ROOT}/shared/review-agents.md`:**

- **Specialists do repo rodam por default** (via o contrato acima): `repo-owner` do repo produtor e do(s) consumidor(es), em `<SPECIALISTS_ROOT>` resolvido para o repo-slug.
- Sem suite de specialists para o repo: cai em `Explore`/`general-purpose` genérico (fallback gracioso do contrato).
- **Com `--solo`:** pula os specialists; só o holístico analisa.

Perguntas canônicas a cobrir por PR:
- O contrato mudado já é consumido em produção hoje? Por quem?
- A mudança é **aditiva/opcional** (inócua até as irmãs subirem) ou **incondicional** (muda comportamento já ao subir)?
- Há feature flag ou opt-in (query param) que isole a mudança?
- O consumidor atual tolera a transição (campo extra ignorado, fallback, param opcional)?

Veredito por PR (usar badges de `${FLUX_ROOT}/shared/review-legend.md` para findings de qualidade; o STATUS de regressão usa seus próprios rótulos abaixo):

- `safe-solo` — pode mergear a qualquer momento sem regressão.
- `needs-order (after #X)` — segura só na posição certa da fila.
- `blocked (regressão)` — subir agora quebra prod; depende de irmã(s).
- `hold (qualidade)` — pendência conhecida (bug, validação HITL) trava independentemente da ordem.

**Rigor anti-falso-positivo:** nunca declarar `safe`/`blocked` sem confirmar no código; o mesmo rigor do iterate.

### 4. Iterate consolidado (manter merge-ready) — SEMPRE via subagente

Para cada PR acionável (não `hold`, com checkout local), rode uma passada do iterate por tick.

**REGRA DURA — o iterate NUNCA roda inline no contexto principal do delivery.** Cada PR é
despachada para um **subagente próprio** (Task tool, `subagent_type: general-purpose`). Isto é
o coração do orçamento de contexto do delivery (`${FLUX_ROOT}/shared/context-budget.md`,
Regras 1, 2 e 3): rodar o iterate inline carrega, no contexto principal e **para sempre**, o
`CLAUDE.md` + todos os `.claude/rules/**` do repo daquela PR (10-20k tokens **por repo**) mais a
skill `flux:iterate` (~14k tokens, restaurada a cada compact). Num delivery de 3 PRs em 2 repos
isso sozinho estoura a janela e joga a sessão em thrashing de autocompact — já aconteceu
(medido numa entrega real de 3 PRs).

Dentro do subagente, o comando é o mesmo de sempre:

```
/flux:iterate <url-da-pr> --auto --once --parent-board "<path-do-board-deste-delivery>"
```

O `--auto` pula confirmação (o subagente não tem canal com o usuário — sem ele o iterate trava);
o `--once` garante que o watch é do delivery (consolidado), não N watches por PR; o
`--parent-board` passa o caminho DESTE board de delivery para o iterate, que então (a) marca no
board de iterate filho que ele nasceu de um delivery, com link reverso, e (b) permite fechar o
cross-link. PRs em `hold` NÃO entram no iterate automático até serem liberadas (registre o motivo
no board).

**PRs de repos diferentes são despachadas em paralelo** (um Task por PR, todos na mesma mensagem).
PRs do **mesmo repo** vão em série, uma por tick, para não colidirem na mesma worktree.

**Contrato de retorno do subagente (curto — alvo < 40 linhas).** O prompt do Task deve exigir
literalmente este retorno, e nada além dele:

```
- pr: <owner/repo#N>
- iterateBoard: <path do board de iterate filho, ou n/d>
- headSha: <sha após o push, ou inalterado>
- threads: <resolvidas>/<total>
- issueComments: <respondidos>/<acionáveis>   # top-level, não vêm no reviewThreads
- ci: <passing | failing | pending | n/d>
- isDraft: <true|false>
- pushed: <true|false>
- bloqueios: <lista curta, ou nenhum>
```

Proibido no retorno: diffs, conteúdo de arquivo, log de CI cru, transcrição do que foi feito.
O contexto principal **não relê** os arquivos que o subagente tocou para conferir — confia no
retorno; se precisar de verificação, despacha outro subagente.

**Capturar o board filho:** o path vem no campo `iterateBoard` do retorno. Registre-o em
`prs[].iterateBoard` no estado do delivery e reflita a linha correspondente na seção
**🔗 Boards de iterate por PR** do board (e em `iterate_boards:` no frontmatter). Se a PR ainda
não gerou board de iterate: `n/d`.

> Herdam do iterate: verificação contra código real, formatação markdown das réplicas, convenção de commit por repo (atenção ao commitlint: alguns repos rejeitam emoji prefix), e o guardrail de thread humana `needs-discussion`.

### 4b. Pedido de review no Slack (gatilho: PR sai de draft)

**Gatilho:** em qualquer tick, se uma PR tinha `isDraft: true` na última leitura e agora está `isDraft: false` — seja porque o usuário tirou o draft manualmente, seja porque o `/flux:iterate` chegou nesse estado. Não dispara para PR que nasceu já `ready for review` fora de um tick observado; nesse caso, ofereça a mesma pergunta como parte da confirmação da fase 4, se o usuário não tiver pedido review ainda.

**Agrupamento:** se mais de uma PR da MESMA issue/ticket vira `ready for review` no mesmo tick, agrupe todas num ÚNICO pedido de review.

Pergunte via `AskUserQuestion` (single-select):

- **Header:** `Pedir review?`
- **Question:** `{N} PR(s) da entrega saíram de draft e estão prontas pra review: {lista "#PR (repo)"}. Postar pedido no Slack?`
- **Options:**
  1. `Canal do time (Recomendado)` — `Posta só no canal de PRs do próprio time dono do repo. Sem cc — é o canal certo, o time já está lá.`
  2. `#code-review (escopo aberto)` — `Posta no canal geral #code-review, com "cc @<time>" para chamar atenção de fora do time.`
  3. `Nos dois canais` — `Posta a mesma mensagem no canal do time E no #code-review.`
  4. `Não postar agora` — `Só registra no board que a PR está pronta pra review; o usuário posta manualmente.`

**Formato da mensagem** (uma linha `:open-pr:` por PR, agrupadas pelo mesmo ticket):

```
:open-pr:  [ENG-4262] Ajusta visual do banner de ativação de notificações < backoffice
:open-pr:  [ENG-4262] Ajusta visual do banner de ativação de notificações < rf-monorepo
```

A linha `cc @<time>` **só aparece quando o post vai para `#code-review`** — no canal do próprio time nunca entra.

**Descobrir canal do time e handle de cc:** inferir o squad a partir do time Linear da issue ou de memória salva. Não existe mapeamento confiável automatizado repo/squad → canal/handle; se não souber com confiança, **perguntar ao usuário** antes de postar — nunca adivinhar um nome de canal Slack.

Após postar, registrar o canal usado e o link da mensagem no board (Timeline de Eventos Relevantes, tipo `review`). **Registro no estado:** cada PR em `prs[]` ganha os campos `wasDraft`, `reviewRequestedAt` e `reviewRequestedChannel` (para não perguntar de novo na mesma PR).

### 5. Board no vault (nota viva)

**Escritor único.** Com o watch ligado (default), o board é mantido por um **board-keeper** — subagente nomeado, criado junto com o board e retomado por `SendMessage` a cada tick com o delta. Ver a seção do board-keeper em `${FLUX_ROOT}/shared/fanout-discipline.md`: contrato do delta, retorno de uma linha, guardrails e fallback. O keeper é dono **só deste** board; os boards de iterate filhos continuam sendo escritos pelos próprios filhos (a main só registra o path que veio no retorno). Com `--once`, não criar keeper.

Crie (ou assuma via `--board`) a nota em `<VAULT_ROOT>/0-inbox/YYYY-MM-DD-HHMM-delivery-<slug>.md` **logo após a descoberta (fase 2), não no fim**. Já na criação, escreva o painel de status (mesmo que várias colunas comecem vazias/`pending`) e **anuncie o caminho no chat**. Nunca duplique um board existente da mesma entrega: se já houver (ou `--board` apontar), atualize-o.

Frontmatter: segue o template compartilhado (`type: delivery`), com os campos `issues: [...]`, `repos: [...]`, `iterate_boards: [...]` (paths dos boards de iterate filhos, preenchidos conforme nascem), `context: <VAULT_CTX>` e `pending_organize: true`.

**O formato do board é fonte única compartilhada:** siga o template em
`${FLUX_ROOT}/shared/board-template.md`, **perfil multi-PR** (`type: delivery` — canônico no schema do vault,
painel com N linhas — uma por PR da entrega). Todas as seções (Frontmatter → H1+TLDR → 🎯 Próximo Movimento
→ 📊 Painel → ⏰ Timeline Verbosa → 📅 Timeline de Eventos Relevantes → ✅ Ação/Continuidade), a legenda de
ícones de STATUS do painel (🟣🟢🔒🔗🟡🔧 — nota: esta legenda é de STATUS de PR no board, não os badges de findings do review-legend.md), a regra de ouro do painel ("o painel é a única tabela de status de PR") e a disciplina de carimbo de data vivem lá e valem aqui sem repetição. Editar o formato = editar aquele arquivo.

**Específico do delivery (além do que o template define):**

- **Métricas por PR num tick:** GraphQL de `reviewThreads` trazendo `isResolved`, `comments(first:1){nodes{author{login} reactions(first:30){nodes{content user{login}}}}}`, agregado com `jq` (threads res/tot, 👍/👎 do flow filtrando a conta do `gh`, comentaristas por autor). Todo número do painel sai daqui ou do `gh pr checks` — nunca de estimativa; sem fonte, `n/d`.
- **Issue comments contam, e o `reviewThreads` não os traz.** Rode SEMPRE, junto, `gh api repos/<owner>/<repo>/issues/<n>/comments`, descarte ecos de bot (CI, sincronização de ticket, reviewer automático sem achado) e conte os de terceiros ainda sem réplica. O painel reporta os dois universos, `threads <res>/<tot> · comments <resp>/<acion>`, nunca só as threads. Uma PR com `12/12` threads e um comentário humano intocado **não está assentada**, e chamá-la de assentada é erro de fato no board. Isto já aconteceu (PR #238 do `technical-refining`, comentário do revisor parado dois dias enquanto o painel dizia 12/12).
- **Ao despachar o iterate de uma PR (fase 4), não diga ao subagente qual é o alvo da rodada.** Passe o estado observado como contexto, mas deixe a triagem com ele. Enunciar "as N threads abertas do bot são o alvo" faz o subagente parar exatamente ali e ignorar o que estiver fora daquela contagem — foi assim que o comentário do #238 passou batido.
- **Abaixo do painel, em prosa** (não tabelas novas): ordem de merge, grafo de bloqueio (`#B ⟵ bloqueada por #A` + motivo), contagem por repo, métricas agregadas, análise de segurança de subida (por PR, veredito da fase 3 com evidência `arquivo:linha`) e go/no-go corrente (ou `🏁 DONE`).
- **🔗 Boards de iterate por PR** (seção 7-bis do template): lista em prosa, um item por PR, linkando o board de iterate filho gerado pela fase 4. PR cujo iterate ainda não rodou: `n/d (iterate ainda não rodou nesta PR)`.
- **Discrepância GitHub × board:** se uma PR `🔒 HITL` mergear sem o board ter registrado a validação humana, não apague o rastro — registre no veredito da linha e sinalize no Próximo Movimento como confirmação retroativa: o board não vê validações feitas fora do GitHub.

### 6. Watch consolidado (default; `--once` desliga)

**Estado do delivery** (multi-repo, fora do `.git` de um só repo):

`<VAULT_ROOT>/.delivery/<slug>.json`

```json
{
  "slug": "cpu4335-4262-4261",
  "issues": ["ENG-4335", "ENG-4262", "ENG-4261"],
  "board": "<VAULT_ROOT>/0-inbox/....md",
  "prs": [
    { "repo": "<ORG>/backoffice-bff", "number": 1054, "worktree": "...",
      "lastHeadSha": "", "lastCiConclusion": "null", "resolvedThreadIds": [], "iterateRounds": 0, "verdict": "safe-solo",
      "wasDraft": true, "reviewRequestedAt": null, "reviewRequestedChannel": null,
      "iterateBoard": null }
  ],
  "order": ["#1054", "#8057", "#1157"],
  "quietTicks": 0,
  "startedAt": "<ISO>",
  "lastTickAt": "<ISO>"
}
```

Cada **tick**:
1. **Re-descoberta** (seção 1, descoberta primária por conteúdo): rode de novo para cada ticket-id da entrega. Compare com `prs[]` do estado — qualquer PR nova (mergeada ou não) entra no painel, gera linha `descoberta` na Timeline de Eventos Relevantes e é anunciada no chat.
2. Para cada PR (incluindo recém-descobertas): mini-tick (estado da PR, CI agregado, delta de threads via GraphQL `reviewThreads` filtrando `resolvedThreadIds`, **e delta de issue comments** via `gh api repos/<owner>/<repo>/issues/<n>/comments` filtrando os já respondidos — o `reviewThreads` não os retorna). Issue comment novo de terceiro dispara iterate igual a thread nova.
3. Se há delta de threads numa PR → despachar **um subagente** para rodar `/flux:iterate <url> --auto --once` só nela (fase 4: nunca inline, mesmo no watch — o tick é onde o custo se acumula tick após tick); atualizar `resolvedThreadIds`/`lastHeadSha` a partir do retorno curto e **incrementar `iterateRounds`** dessa PR.
3b. **Checar transição de draft** (compare `isDraft` atual com `wasDraft` salvo). Se alguma PR virou `ready for review` neste tick, dispare a pergunta do passo 4b (agrupando por ticket) antes de seguir. Atualize `wasDraft` para o valor atual de todas as PRs.
4. Se algum head/base mudou → recomputar ordem/regressão afetada (fases 2–3) só do que mudou.
5. Recomputar as métricas do painel e mandar o **delta do tick ao board-keeper** por `SendMessage` (contrato do delta em `fanout-discipline.md`); é ele que atualiza o **painel no topo do board** + próximo movimento + go/no-go. A main não relê o board nem o reescreve. **Rolar o carimbo de data em TODO tick** (mesmo tick sem mudança): frontmatter `updated:`, o TLDR/"Última atualização" e o timestamp no título do painel, todos para o horário local corrente. Atualizar o estado (`lastTickAt`).
6. **Se este tick teve algo substantivo** (PR nova, PR mergeada, rodada fechada, conflito resolvido, mudança de CI relevante), acrescentar linha na **Timeline de Eventos Relevantes** + parágrafo correspondente na Timeline Verbosa. Um tick "quiet" (nada mudou) não gera linha na tabela de eventos.
7. Reagendar com `ScheduleWakeup` (mesmo input do comando), cadência pelo agregado:
   - Qualquer PR com **CI rodando** ou **rodada recém-fechada** → **270s**.
   - Todas verdes + zero threads (quiet) → **1200s**.
   - Nunca 300s. `reason` específico (ex.: `"delivery cpu4335: #1157 CI rodando, re-checo em 270s"`).

**Condições de saída (encerrar o watch):**
- Todas as PRs `MERGED`/`CLOSED`.
- **Assentou**: todas merge-ready (CI verde + zero threads + veredito `safe`/`needs-order` resolvido) por **2 ticks** (`quietTicks >= 2`) → emitir **go/no-go final** com a ordem e encerrar.
- Limite de segurança: `>~6h` sem assentar → encerrar avisando (provável discussão humana/CI cronicamente vermelho).
- Usuário interrompe.

Em qualquer saída, **relatório final** no chat: ordem de merge recomendada, veredito por PR, PRs em `hold` (com motivo), threads humanas deixadas em `needs-discussion`, e o range de commits pushados durante o watch.

---

## Convenções

- PT-BR com acentuação correta. Texto postado no GitHub (via iterate) segue as convenções do iterate (sem em-dash quando `NO_EMDASH == true`, markdown com backticks, etc.).
- O board é doc interno do vault; timeline em horário local.
- Verificação vem antes de tudo: nenhum veredito de regressão sem confirmação no código real. Vale igual dentro do watch.

## Bootstrap de specialists (repos sem suite local)

No **go/no-go final**, para cada repo da entrega que estiver **sem L2**, oferecer a criação da suite
local seguindo `${FLUX_ROOT}/shared/bootstrap-specialists.md`. Uma oferta por repo no máximo, e
sempre depois do veredito: a entrega é o produto, a suite é consequência.

A suite gerada é **L2, fora do repositório** revisado.

## Notas finais

- **Não mergeia**: o comando entrega tudo pronto e recomenda a ordem; o merge (e o deploy em prod) é decisão humana.
- Reuso: `/flux:iterate` (por PR, `--auto --once`, **sempre dentro de subagente** — ver fase 4 e `${FLUX_ROOT}/shared/context-budget.md`), specialists via `review-agents.md`, lógica de toposort do `mutirao-planner`, padrão de board do template compartilhado.
- Se `gh` não estiver autenticado, pedir `gh auth login` e abortar.
