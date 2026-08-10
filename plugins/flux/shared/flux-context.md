# Resolução de contexto da família `flux:`

> Fonte única de como um comando `flux:*` global descobre em que contexto está rodando e quais
> reviewers/paths usar. É isto que torna a família **global e distribuível**: os comandos vivem em
> nível global e context-agnóstico; o que é específico de um time/repo vem de um **manifesto de
> contexto**, não hardcoded no comando.

## O manifesto

Um arquivo `flux-context.json` colocado num `.claude/` (ou `.cursor/`) de workspace ou repo. O
comando procura o **mais próximo** subindo a árvore a partir de uma **âncora** (mesma disciplina de
diretório de config subindo a árvore que os harnesses já usam):

```
<âncora>/.claude/flux-context.json
<âncora>/.cursor/flux-context.json
<parent>/.claude/flux-context.json
<parent>/.cursor/flux-context.json
...
```

**A proximidade vence o diretório.** Em cada nível, `.claude/` é consultado antes de `.cursor/`, mas
um manifesto num nível mais fundo vence um mais raso independentemente de qual dos dois diretórios o
abriga. O contrário faria um `.cursor/flux-context.json` do repo perder para um `.claude/` do
workspace, que é exatamente o override que quem trabalha no Cursor quer declarar.

Se achar → **perfil declarado**. Se não achar → **perfil genérico** (abaixo).

## Qual é a âncora: o alvo primeiro, o `cwd` depois

> **O contexto é do trabalho, não de onde você estava sentado quando pediu.** Um elo invocado com um
> alvo explícito (`/flux:build backoffice-bff …`, `/flux:peek ~/code/acme/api`) deve rodar no perfil
> **do alvo**, não no do diretório de onde foi chamado. Ancorar só no `cwd` faz o elo abortar com
> "repo não encontrado" para um repo que existe e está declarado num manifesto, e é o erro que mais
> confunde: o usuário passou o alvo, e o comando diz que não o achou.

Resolver a âncora **nesta ordem**, parando na primeira que produzir um manifesto:

**1. O alvo, quando ele é um caminho.** Path local (arquivo ou diretório), absoluto ou relativo ao
`cwd`. Se existe no disco, é a âncora: subir a árvore a partir dele.

**2. O alvo, quando ele é um slug de repo.** Tentar resolver o slug como checkout:

```bash
for base in "$(pwd)" "$WORKSPACE_ROOT_DO_CWD"; do
  [ -n "$base" ] && [ -d "$base/$SLUG/.git" ] && ANCHOR="$base/$SLUG" && break
done
```

Não resolveu, e **só então**, descobrir os manifestos existentes na máquina e perguntar a eles:

```bash
find "$HOME" -maxdepth 4 -type f \
  \( -path '*/.claude/flux-context.json' -o -path '*/.cursor/flux-context.json' \) 2>/dev/null
```

Um manifesto **reivindica** o slug quando ele aparece no campo `repos`, ou quando existe
`<workspace_root>/<slug>/.git`. Então:

- **exatamente um** reivindica → é a âncora.
- **mais de um** reivindica → **perguntar ao usuário** qual contexto usar, listando os candidatos com
  o `name` de cada um. Nunca escolher por proximidade de path, ordem alfabética ou primeiro achado:
  rodar no contexto errado escreve no vault errado, invoca os reviewers errados e aponta para a org
  de tracker errada.
- **nenhum** reivindica → seguir para o passo 3.

**3. O `cwd`.** O comportamento clássico, e o único caminho quando não há alvo (`/flux:peek` sem
argumento lê a working tree do `cwd`, e aí o `cwd` **é** o alvo).

**4. Nada disso achou manifesto** → perfil genérico.

### Ordem obrigatória: parse do alvo antes da resolução de contexto

Ancorar no alvo só é possível se o alvo já foi lido. Todo elo segue esta ordem, e não outra:

```
1. parse dos argumentos           (identifica o alvo; não abre repo, não lê arquivo)
2. resolve a ÂNCORA               (alvo → cwd)
3. resolve o MANIFESTO            (sobe a árvore a partir da âncora)
4. preflight: requires + HOLISTIC (o holístico vem do manifesto, então depende do passo 3)
5. o trabalho do elo
```

Fazer o preflight antes do passo 2 resolve o agente holístico do perfil errado, e o elo roda inteiro
com o reviewer de outro time sem que nada acuse o problema.

### Regras da âncora

- **A âncora é resolvida uma vez, no Step 0, e vale para o elo inteiro.** Nada de resolver contexto de
  novo no meio do pipeline: dois perfis na mesma execução é como um artefato acaba com `vault_context`
  de um time e reviewers de outro.
- **O passo 2 é o único que toca o disco fora do alvo**, e só quando o slug não resolveu pelos
  caminhos baratos. Não faça a varredura quando os passos 1 ou 2-rápido já resolveram.
- **Declarar a âncora no banner** quando ela **não** for o `cwd`, para que a origem do perfil seja
  auditável:

  ```
  perfil: arco (âncora: alvo ~/code/acme/api-gateway) · nivel: FULL · ...
  ```

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
  "kits_root": "~/agents/acme/kits/{repo}",
  "vault_root": "~/notes",
  "vault_context": "acme",
  "workspace_root": "~/code/acme",
  "linear_org": "acme",
  "linear_ops": "~/code/acme/plugins/core/shared/LINEAR-OPS.md",
  "repos": ["api-gateway", "web-monorepo", "notifications", "payments", "..."],
  "exec_command": "workflow",
  "mcp": {
    "docs": "mcp__claude_ai_Google_Drive",
    "slack": "mcp__plugin_slack_slack"
  },
  "no_emdash": true,
  "quality_gate": {
    "provider": "sonarcloud",
    "host": "https://sonarcloud.io",
    "org": "olaisaac",
    "project_key_template": "OlaIsaac_{repo}",
    "token_env": "SONAR_TOKEN",
    "secrets_file": "~/.secrets"
  }
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
  Ver `${FLUX_ROOT}/shared/review-agents.md` passo 1. É também o **degrau 2** da cascata de destino de
  escrita (`${FLUX_ROOT}/shared/write-destination.md`) — e lá, como o destino de escrita é sempre um
  **diretório**, um valor que termina em `.md` (o caso do exemplo acima) tem o `dirname` tomado.
- `kits_root` — template de path (com `{repo}`, resolvido exatamente como `specialists_root`) da raiz
  onde os **kits** de uma máquina vivem. Hoje o campo tem um papel só, e deliberadamente estreito: é o
  **degrau 3** da cascata de destino de escrita. O formato de um kit e o verbo que o instala são
  especificados à parte; declará-los aqui antes da hora congelaria um formato que ainda não existe.
  Ausente → a cascata segue para o degrau 4 (`write_destinations`) e, não achando nada, para o degrau
  5, que **pergunta**.
- `linear_ops` — path de um doc que descreve a **mecânica** de criação no Linear do time (cache de
  team/project, routing, labels). Consumido pelo `flux:issue` no Step 6. Opcional: sem ele, o
  `flux:issue` resolve team/project pelos MCP tools e confirma com o usuário antes de criar.
- `mcp` — prefixos das MCP tools que os elos com integração externa usam. Dois canais:
  `docs` (leitura de documento — o modo doc do `flux:review` e do `flux:peek`) e `slack`
  (o `flux:reply`). Declare **o prefixo**, não os nomes das tools: o elo descobre as tools daquele
  prefixo e escolhe a que atende cada capacidade (ler conteúdo, ler metadados, ler permissões,
  salvar rascunho, reagir). É a mesma granularidade que o `requires: mcp: <prefixo>` do preflight
  já usa.

  Sem o campo, o elo procura na sessão um servidor que ofereça a capacidade e, achando um só, usa
  ele; achando vários ou nenhum, degrada e declara no banner. **Nunca chute um prefixo**: um id de
  MCP é específico de como aquela máquina instalou o servidor, e hardcodar o da sua faz o elo
  abortar na máquina de qualquer outra pessoa.
- `specialists_spec` — path da espec que rege a autoria de uma suite de specialists nova (formato dos
  arquivos, o que cada specialist cobre). Consumido pelo Bootstrap de specialists (`flux:review`, `flux:iterate`, `flux:land` e `flux:build`).
  Opcional: sem ele, o Bootstrap usa o checklist mínimo embutido no comando.
- `specialists_repo` — repo (`owner/nome`) onde as suites versionadas vivem, e alvo do PR draft que o
  Bootstrap de specialists abre. **Nunca é o repo revisado.** Opcional: sem ele, o Bootstrap só escreve local e não
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
- `write_destinations` — **escrito pelos elos, não à mão**: mapa de **diretório canônico** → aprovação
  registrada no gate de destino de escrita, para a pergunta não voltar a cada execução. Cada entrada
  declara `repos` (os slugs para os quais aquele destino foi aprovado), `approved_at` e o estado das
  guardas no momento da aprovação; sem o `repos`, a entrada não saberia de quem é e a descoberta teria
  que adivinhar por substring do path. A chave é sempre um path já resolvido, **nunca** um template
  com `{repo}` — isso é assunto de `specialists_root` e `kits_root`. É o **degrau 4** da cascata, e a
  gravação aqui tem gate próprio e passa pelas próprias guardas: num setup de dotfiles este arquivo é
  tipicamente um symlink para dentro de um repo git. Formato, semântica de caducidade e o que fazer
  sem manifesto estão em `${FLUX_ROOT}/shared/write-destination.md`. Ausente = nada aprovado ainda.
- `quality_gate` — bloco opcional para diagnóstico de gates de qualidade externos via API (todo
  o sub-bloco é opcional):
  - `provider`: `"sonarcloud"` ou `"sonarqube"`. **Ausente = sem consulta** (degradação declarada
    por `${FLUX_ROOT}/shared/quality-gate-api.md`, que trata gate externo como pendência humana).
  - `host`: URL base do servidor. Default `https://sonarcloud.io` quando provider=sonarcloud.
  - `org`: organização do SonarCloud. Ignorado para SonarQube.
  - `project_key_template`: template com `{repo}` substituído pelo slug do repo, como
    `specialists_root` já faz. **Ausente = sem chave de projeto = sem consulta.**
  - `token_env`: nome da variável com o token. Default `SONAR_TOKEN`.
  - `secrets_file`: arquivo de secrets a ler quando a variável não estiver no ambiente.
    Default `~/.secrets`. Formato `KEY=value`, sem `export`, uma chave por linha.

## Perfil genérico (sem manifesto)

Quando nenhum `flux-context.json` é encontrado, o comando cai no default universal:

- `holistic_reviewer` = o genérico da família (detecta a stack dinamicamente), resolvido pela
  cascata `flux:pr-reviewer` → `flux-pr-reviewer` → `pr-reviewer`, conforme a instalação. Ver
  `preflight.md`, Passo 3. **O campo ausente no manifesto cai nessa mesma cascata**, que é mais
  robusta que declarar um nome fixo.
- `doc_reviewer` = o mesmo genérico, em modo doc.
- `answerer` = o próprio `flux:iterate --dry` sem agente dedicado.
- `specialists_root` = override local do repo: `<repo-checkout>/.claude/agents/reviewer.md` ou
  `<repo-checkout>/.claude/agents/review/*.md`. Sem isso → só holístico (fallback gracioso).
- `kits_root` = ausente; a cascata de destino cai no degrau que pergunta.
- `write_destinations` = sem manifesto não há onde persistir a aprovação: ela vale só para a execução
  corrente, e o elo declara isso ao perguntar.
- `vault_root` = não persiste por default (só imprime no chat); `flux:review` pode receber `--save <dir>`.
- `workspace_root` = o próprio `cwd`; `repos` = subdiretórios com `.git`.
- `exec_command` = `workflow`; `exec_fallback` = nenhum. Sem motor nativo e sem fallback declarado, o
  `flux:build` roda em **modo autônomo** (worktree + `CLAUDE.md` do repo + checks declarados + PR
  draft) e diz no banner que rodou sem os gates do repo.
- `no_emdash` = `false`.
- `mcp` = ausente; cada elo com integração externa descobre a capacidade na sessão e degrada
  declarando a perda quando não achar (o `flux:reply` sem canal Slack aborta; o modo doc do
  `flux:review`/`flux:peek` aborta só naquele alvo).
- `quality_gate` = ausente (sem consulta à API de quality gates; gate externo é tratado como
  pendência humana com degradação declarada — ver `${FLUX_ROOT}/shared/quality-gate-api.md`).

Assim, qualquer pessoa que instale a família `flux:` já tem review holístico funcionando em qualquer
repo GitHub; declarar um `flux-context.json` (ou um `<repo>/.claude/agents/reviewer.md`) é o que soma
os specialists e a persistência.

## Detecção de "PR própria vs de terceiros"

Independe do manifesto: comparar o autor da PR com a conta logada do `gh` (`gh api user -q .login`).
Direciona a ação pós-review (aplicar correções na própria vs postar inline na de terceiros).
