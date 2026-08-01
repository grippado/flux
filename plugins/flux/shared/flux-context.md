# Resolução de contexto da família `flux:`

> Fonte única de como um comando `flux:*` global descobre em que contexto está rodando e quais
> reviewers/paths usar. É isto que torna a família **global e distribuível**: os comandos vivem em
> nível global e context-agnóstico; o que é específico de um time/repo vem de um **manifesto de
> contexto**, não hardcoded no comando.

## O manifesto

Um arquivo `flux-context.json` colocado num `.claude/` de workspace ou repo. O comando procura o
**mais próximo** subindo a árvore a partir do `cwd` (mesma disciplina do `.claude/` do Claude Code):

```
<cwd>/.claude/flux-context.json
<parent>/.claude/flux-context.json
...
```

Se achar → **perfil declarado**. Se não achar → **perfil genérico** (abaixo).

### Campos

```json
{
  "name": "acme",
  "holistic_reviewer": "acme-pr-reviewer",
  "doc_reviewer": "acme-doc-reviewer",
  "answerer": "acme-pr-answerer",
  "slack_prospector": "acme-slack-prospector",
  "slack_answerer": "acme-slack-answerer",
  "specialists_root": "~/agents/acme/{repo}/repo-owner.md",
  "specialists_spec": "~/agents/acme/AGENT_SPEC.md",
  "specialists_repo": "acme/agent-suites",
  "vault_root": "~/notes",
  "vault_context": "acme",
  "workspace_root": "~/code/acme",
  "linear_org": "acme",
  "linear_ops": "~/code/acme/plugins/core/shared/LINEAR-OPS.md",
  "repos": ["api-gateway", "web-monorepo", "notifications", "payments", "..."],
  "exec_command": "workflow",
  "no_emdash": true
}
```

> Exemplo ilustrativo. **Nenhum campo é obrigatório além de `name`**: cada um que faltar cai no
> default do perfil genérico descrito no fim deste doc. Um manifesto de uma linha só já é válido.

- `holistic_reviewer` / `doc_reviewer` / `answerer` — `subagent_type` que o comando invoca por lente
  (review de PR, review de doc, rascunho de réplicas do `flux:iterate --dry`).
- `slack_prospector` / `slack_answerer` — agentes que o `flux:reply` usa (colher contexto do codebase,
  redigir a réplica). Opcionais; sem eles, o `flux:reply` cai em `general-purpose` e declara a perda
  no banner de perfil.
- `specialists_root` — template de path (com `{repo}`) para achar o orquestrador de specialists.
  Ver `claude/shared/review-agents.md` passo 1.
- `linear_ops` — path de um doc que descreve a **mecânica** de criação no Linear do time (cache de
  team/project, routing, labels). Consumido pelo `flux:issue` no Step 6. Opcional: sem ele, o
  `flux:issue` resolve team/project pelos MCP tools e confirma com o usuário antes de criar.
- `specialists_spec` — path da espec que rege a autoria de uma suite de specialists nova (formato dos
  arquivos, o que cada specialist cobre). Consumido pelo Bootstrap de repo-owner do `flux:review`.
  Opcional: sem ele, o Bootstrap usa o checklist mínimo embutido no comando.
- `specialists_repo` — repo (`owner/nome`) onde as suites versionadas vivem, e alvo do PR draft que o
  Bootstrap abre. **Nunca é o repo revisado.** Opcional: sem ele, o Bootstrap só escreve local e não
  oferece a opção de PR.
- `vault_root` / `vault_context` — onde persistir o artefato e qual `context:` gravar no frontmatter.
- `workspace_root` — raiz onde os checkouts dos repos vivem, usada por
  `flux:land` pra resolver checkouts cross-repo. Sem o campo, assume o diretório pai do `.claude/`
  onde o manifesto foi encontrado.
- `linear_org` — org do Linear, usada por `flux:issue` pra montar URLs de ticket
  (`https://linear.app/{linear_org}/issue/...`) e pelo doc apontado em `linear_ops` no roteamento de team.
- `repos` — repos conhecidos do contexto (usado por `flux:land` pra resolver targets cross-repo).
- `exec_command` — nome do comando **nativo de execução** dos repos deste contexto, usado pelo `flux:build`
  pra descobrir o motor (`<repo>/.claude/commands/<exec_command>.md`). Default: `workflow`.
- `exec_fallback` — comando de implementação **do seu time**, usado pelo `flux:build` quando o repo
  não tem motor nativo. **Sem default, deliberadamente**: um comando vindo de um plugin específico é
  conhecimento de quem o instalou, não da família, e assumir um faria o `build` invocar, na máquina
  de outra pessoa, algo de um marketplace ao qual ela pode nem ter acesso. Ausente → modo autônomo.
- `no_emdash` — quando `true`, o output que pode ser postado no GitHub não usa travessão/en-dash.

## Perfil genérico (sem manifesto)

Quando nenhum `flux-context.json` é encontrado, o comando cai no default universal:

- `holistic_reviewer` = o genérico da família (detecta a stack dinamicamente), resolvido como
  `flux:pr-reviewer` quando instalado via marketplace ou `pr-reviewer` num checkout direto. Ver
  `preflight.md`, Passo 3.
- `doc_reviewer` = o mesmo genérico, em modo doc.
- `answerer` = o próprio `flux:iterate --dry` sem agente dedicado.
- `specialists_root` = override local do repo: `<repo-checkout>/.claude/agents/reviewer.md` ou
  `<repo-checkout>/.claude/agents/review/*.md`. Sem isso → só holístico (fallback gracioso).
- `vault_root` = não persiste por default (só imprime no chat); `flux:review` pode receber `--save <dir>`.
- `workspace_root` = o próprio `cwd`; `repos` = subdiretórios com `.git`.
- `exec_command` = `workflow`; `exec_fallback` = nenhum. Sem motor nativo e sem fallback declarado, o
  `flux:build` roda em **modo autônomo** (worktree + `CLAUDE.md` do repo + checks declarados + PR
  draft) e diz no banner que rodou sem os gates do repo.
- `no_emdash` = `false`.

Assim, qualquer pessoa que instale a família `flux:` já tem review holístico funcionando em qualquer
repo GitHub; declarar um `flux-context.json` (ou um `<repo>/.claude/agents/reviewer.md`) é o que soma
os specialists e a persistência.

## Detecção de "PR própria vs de terceiros"

Independe do manifesto: comparar o autor da PR com a conta logada do `gh` (`gh api user -q .login`).
Direciona a ação pós-review (aplicar correções na própria vs postar inline na de terceiros).
