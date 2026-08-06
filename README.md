```
   ███████╗██╗     ██╗   ██╗██╗  ██╗
   ██╔════╝██║     ██║   ██║╚██╗██╔╝ ██╗
   █████╗  ██║     ██║   ██║ ╚███╔╝  ╚═╝
   ██╔══╝  ██║     ██║   ██║ ██╔██╗  ██╗
   ██║     ███████╗╚██████╔╝██╔╝ ██╗ ╚═╝
   ╚═╝     ╚══════╝ ╚═════╝ ╚═╝  ╚═╝

   da ideia ao merge, sem trocar de ferramenta
```

[![license](https://img.shields.io/badge/license-MIT-6B7280)](LICENSE) [![claude code](https://img.shields.io/badge/Claude%20Code-plugin-8B5CF6)](#claude-code) [![cursor](https://img.shields.io/badge/Cursor-plugin-3B82F6)](#cursor)

> Família de comandos **globais e context-agnósticos** que cobre o ciclo inteiro de trabalho num repo: da issue ao código, do código ao review, do review ao merge, do merge à comunicação.

## Instalação

O flux é **um plugin só, com dois manifestos**. O mesmo `plugins/flux/` (as skills, os agents, os shared) serve os dois harnesses: não há fork, versão portada nem arquivo duplicado.

### Claude Code

```
/plugin marketplace add grippado/flux
/plugin install flux@flux
```

### Cursor

```bash
git clone https://github.com/grippado/flux ~/code/flux
~/code/flux/scripts/install-cursor.sh
# reiniciar o Cursor (Cmd+Q, não só fechar a janela)
```

Os verbos ficam como `/flux-peek`, `/flux-review`, `/flux-iterate`. Confira em Settings → Customize → Plugins.

O script existe por dois motivos que não dá para resolver no README:

**O Cursor não segue symlink** em `~/.cursor/plugins/local/`. Um symlink registra o plugin e não carrega nada, sem erro em lugar nenhum. Tem que ser diretório real, então o script copia.

**O Cursor não prefixa skill de plugin.** O nome invocável sai do campo `name` do frontmatter, e sem namespace: `name: peek` viraria `/peek`, no mesmo espaço onde o próprio Cursor já tem uma skill nativa chamada `review`. Prefixar na fonte não serve, porque o Claude Code usa o mesmo campo e viraria `/flux:flux-peek`. Então o prefixo é aplicado **na cópia instalada**, pelo script. O repo mantém um nome só por verbo.

Não há hot-reload: a cada `git pull`, rode o script de novo e reinicie o Cursor.

Em plano Teams/Enterprise dá para importar o repo em Dashboard → Plugins e distribuir pelo marketplace do time, com auto-refresh.

### Depois de instalar, nos dois

Pronto: `/flux:peek`, `/flux:review`, `/flux:iterate` e os demais ficam disponíveis em qualquer repo Git, sem configuração nenhuma.

Requisitos reais: **`git`** (duro — sem ele o preflight aborta) e **`gh` autenticado** (mole, mas é o que separa "roda em PR" de "roda só na working tree"). Nada além disso. Sem manifesto, sem vault e sem specialists, a família roda no perfil genérico e [o banner do preflight](#convenções-transversais) declara o nível degradado em vez de fingir que está completo.

Dois elos dependem de MCP e vão degradar sem ele: o `flux:reply` precisa de um MCP de Slack, e o modo doc do `flux:review`/`flux:peek` precisa de um MCP de Google Drive.

Para somar specialists, persistência no vault e integrações do seu time, declare um [manifesto de contexto](#o-manifesto-de-contexto). Exemplos prontos em [`examples/`](examples/).

## O que é

`flux:` é **um ciclo, não um conjunto de utilitários**. Cada comando é um elo com fronteira nítida, e o elo seguinte assume onde o anterior parou. Você nunca sai da família para completar uma entrega.

Dois princípios sustentam isso:

1. **Os comandos são globais e não sabem nada do seu time.** Eles vivem na raiz da instalação (`${FLUX_ROOT}/skills/`) e funcionam em qualquer repo Git, em qualquer harness. O que é específico de um time (quais reviewers, qual vault, quais repos) vem de um **manifesto de contexto** — `flux-context.json` —, nunca hardcoded no comando.
2. **Cada elo delega o trabalho especializado.** Review vai para agents reviewers; execução vai para o motor nativo do repo; prospecção de codebase vai para specialists. Os comandos orquestram, não reimplementam.

## O ciclo

```
        ideia / thread / bug relatado
                    │
                    ▼
        ┌───────────────────────┐
        │   flux:issue          │  fonte livre → issue embasada em código real
        └───────────┬───────────┘
                    ▼
        ┌───────────────────────┐
        │   flux:build          │  issue → código + PR draft
        └───────────┬───────────┘  (despacha ao motor nativo do repo)
                    ▼
        ┌───────────────────────┐        ┌───────────────────────┐
        │   flux:peek           │        │   flux:review         │
        │   relance read-only   │◀──ou──▶│   review formal       │
        │   não posta, não grava│        │   persiste no vault   │
        └───────────┬───────────┘        └───────────┬───────────┘
                    └──────────┬─────────────────────┘
                               ▼
                   ┌───────────────────────┐
                   │   flux:iterate        │  threads → correções → push → CI verde
                   └───────────┬───────────┘  ↻ fica vivo até a PR assentar
                               ▼
                   ┌───────────────────────┐
                   │   flux:land           │  N PRs → toposort → merge-ready → go/no-go
                   └───────────┬───────────┘  (não mergeia: humano decide)
                               ▼
                   ┌───────────────────────┐
                   │   flux:reply          │  comunica, embasado no que de fato mudou
                   └───────────────────────┘
```

Nenhum elo é obrigatório e nenhum chama o próximo sozinho. Cada um termina apontando o elo seguinte e devolvendo o volante para você.

## Os comandos

| Comando | Entrada | Saída | Escreve? |
|---------|---------|-------|----------|
| [`flux:issue`](plugins/flux/skills/issue/SKILL.md) | thread do Slack, texto livre, PR | issue de alta qualidade, embasada via specialists | rascunho no vault; cria no Linear só após aprovação |
| [`flux:build`](plugins/flux/skills/build/SKILL.md) | ticket Linear ou descrição + repo | código + PR draft | sim, via motor do repo |
| [`flux:peek`](plugins/flux/skills/peek/SKILL.md) | working tree, branch, range, PR, doc, path | parecer com badges no chat | não (exceto `--save`) |
| [`flux:review`](plugins/flux/skills/review/SKILL.md) | PR ou doc | review formal (holístico + specialists reconciliados) | vault; posta quando você manda |
| [`flux:iterate`](plugins/flux/skills/iterate/SKILL.md) | PR | correções aplicadas, réplicas postadas, threads resolvidas, CI vigiado | sim (`--dry` rascunha read-only) |
| [`flux:land`](plugins/flux/skills/land/SKILL.md) | issue/feature multi-PR | ordem de merge, validação de regressão, go/no-go | mantém PRs merge-ready; **nunca mergeia** |
| [`flux:reply`](plugins/flux/skills/reply/SKILL.md) | permalink de thread | rascunho Slack-safe + ata no vault | salva rascunho; **nunca posta sozinho** |

### Pares que parecem iguais e não são

- **`review` vs `iterate`** — `review` produz o parecer. `iterate` consome pareceres (inclusive de bots e humanos), verifica cada alegação **contra o código real**, aplica o que procede e defende o que não procede.
- **`build` vs `/workflow` do repo** — `build` é o dispatcher: resolve repo e motor. O `/workflow` do repo é o motor: conhece os próprios testes, gates e padrão de PR. `build` nunca reimplementa motor.
- **`iterate` vs `land`** — `iterate` fecha **uma** PR. `land` orquestra **N** PRs de uma entrega e delega o merge-ready de cada uma ao `iterate`.

## Arquitetura

```
flux/
├── README.md                       ← este arquivo (doc da família)
├── LICENSE                         MIT
├── examples/                       manifestos prontos: solo / time / pessoal
├── scripts/install-cursor.sh       instalação no Cursor (copia + prefixa os nomes)
├── .claude-plugin/marketplace.json o marketplace do Claude Code (o /plugin add lê este)
├── .cursor-plugin/marketplace.json o mesmo, para o Cursor
└── plugins/flux/                   ← ${FLUX_ROOT} quando instalado
    ├── .claude-plugin/plugin.json  manifesto Claude Code
    ├── .cursor-plugin/plugin.json  manifesto Cursor (mesmo corpo, outro harness)
    ├── agents/pr-reviewer.md       o holístico genérico (default universal)
    ├── skills/                     ← os verbos (globais, context-agnósticos)
    │   ├── issue/  build/  peek/
    │   └── review/  iterate/  land/  reply/
    └── shared/                     contratos compartilhados (fonte única, não duplicar nos verbos)
    ├── preflight.md               verificação de pré-requisitos, níveis de capacidade, banner
    ├── flux-context.md            resolução de contexto via manifesto
    ├── review-agents.md           descoberta + reconciliação de specialists
    ├── review-legend.md           badges canônicos dos findings
    ├── review-artifact-template.md formato do artefato de review no vault
    ├── review-body-template.md    formato do corpo da review postada no GitHub
    ├── issue-template.md          formato da issue do flux:issue
    ├── board-template.md          formato do board vivo (execução / iterate / delivery / conversa)
    ├── worktree-discipline.md     todo fluxo que escreve opera em worktree dedicado
    ├── fanout-discipline.md       todo trabalho pesado vai para subagente, em paralelo
    ├── context-budget.md          leitura sob demanda, um root por sessão, delegação
    └── quality-gate-api.md        diagnóstico de gates Sonar via API (consultar em vez de deduzir)
```

O harness resolve `skills/<verbo>/SKILL.md` como `/flux:<verbo>`. Adicionar um diretório em `skills/` publica um verbo novo, sem tocar em instalação.

**O nome invocável é montado pelo harness, não escrito por nós.** O mesmo `skills/iterate/SKILL.md` vira `/flux:iterate` num harness e pode virar outra forma em outro. Por isso o único elo que despacha um irmão (o `flux:land`, que roda o iterate por PR dentro de subagente) escreve `${FLUX_CMD}iterate`, com o prefixo resolvido **e verificado** pelo [Passo 1b do preflight](plugins/flux/shared/preflight.md). O rigor é o mesmo do agente holístico: um nome de comando resolvido sem confirmação vira um subagente que não acha o comando e improvisa a iteração fora do contrato.

`${FLUX_ROOT}` é resolvido pelo [`preflight`](plugins/flux/shared/preflight.md) na ordem: `${CLAUDE_PLUGIN_ROOT}` → `${CURSOR_PLUGIN_ROOT}` → dois níveis acima do verbo em execução, resolvendo symlink antes de subir (checkout direto, e a instalação local do Cursor) → `${FLUX_HOME}` do ambiente. Por isso os mesmos arquivos funcionam instalados como plugin nos dois harnesses ou clonados na mão.

Esses dois nomes de variável são **a única menção a harness específico em todo o flux**. Tudo abaixo do Passo 1 do preflight é escrito contra `${FLUX_ROOT}` e `${FLUX_CMD}`.

### O manifesto de contexto

Um `flux-context.json` num `.claude/` (ou `.cursor/`) de workspace ou repo. O comando procura o **mais próximo** subindo a árvore a partir do `cwd`, consultando `.claude/` antes de `.cursor/` em cada nível — mas proximidade sempre vence diretório. Achou → perfil declarado. Não achou → perfil genérico.

```json
{
  "name": "acme",
  "holistic_reviewer": "acme-pr-reviewer",
  "doc_reviewer": "acme-doc-reviewer",
  "answerer": "acme-pr-answerer",
  "slack_prospector": "acme-slack-prospector",
  "slack_answerer": "acme-slack-answerer",
  "specialists_root": "~/agents/acme/{repo}/repo-owner.md",
  "vault_root": "~/notes",
  "vault_context": "acme",
  "workspace_root": "~/code/acme",
  "linear_org": "acme",
  "repos": ["backoffice", "rf-monorepo", "communication-api", "..."],
  "exec_command": "workflow",
  "exec_fallback": "acme:implement",
  "no_emdash": true
}
```

Contrato completo dos campos: [`shared/flux-context.md`](plugins/flux/shared/flux-context.md).

### Perfil genérico (sem manifesto)

A família **funciona sem configuração nenhuma**. Sem manifesto, cada comando cai num default universal:

| Aspecto | Default sem manifesto |
|---------|----------------------|
| Reviewer holístico | genérico da família, resolvido pela cascata do preflight (detecta a stack dinamicamente) |
| Specialists | override local do repo: `<repo>/.claude/agents/reviewer.md`; sem isso, só holístico |
| Persistência | não persiste; imprime no chat (`--save <dir>` no `flux:review`) |
| Motor de execução | `/workflow` do repo; sem ele, o `exec_fallback` do perfil; sem ele, **modo autônomo** (worktree + `AGENTS.md`/`CLAUDE.md` do repo + checks + PR draft) |
| Travessão | permitido (`no_emdash: false`) |

Quem instala a família já tem review holístico e execução funcionando em qualquer repo GitHub. Declarar um `flux-context.json` é o que **soma** specialists, persistência no vault e integrações do time.

## Convenções transversais

- **Falhar bem em vez de rodar mal** — todo elo abre pelo [`preflight.md`](plugins/flux/shared/preflight.md): verifica os `requires` declarados no frontmatter, resolve **e confere a existência** do agente holístico, e classifica o nível de capacidade (`FULL` / `REDUCED` / `THIN` / `UNAVAILABLE`). Faltou requisito `hard` → aborta sem efeito colateral. Faltou `soft` → roda e **declara a perda no banner de perfil**, que abre todo output. Um elo nunca improvisa um reviewer inline nem produz artefato fora do contrato de saída.
- **Badges canônicos** — todo finding usa o vocabulário de [`review-legend.md`](plugins/flux/shared/review-legend.md): `request-change`, `breaking-change`, `question`, `suggestion`, `praise`, `note`. Cada um ancorado em `arquivo:linha` (código) ou `§seção + trecho verbatim` (doc).
- **Verificar antes de aceitar** — nenhuma alegação de review (de bot ou de humano) é aplicada sem ser conferida contra o código real. Defender uma decisão correta é resultado válido.
- **Worktree sempre** — todo fluxo que escreve código opera em git worktree dedicado à branch, nunca na árvore principal. Ver [`worktree-discipline.md`](plugins/flux/shared/worktree-discipline.md).
- **Fan-out sempre** — o contexto principal de um elo **orquestra**; investigar código, tocar repo, aplicar correção ou rodar outro `flux:*` vai para subagente, e unidades independentes vão em paralelo num único bloco. Na main ficam só parse, metadados baratos, HITL, board e watch. Regra pétrea, par simétrico do worktree: ver [`fanout-discipline.md`](plugins/flux/shared/fanout-discipline.md).
- **Humano no volante nas fronteiras externas** — nada é postado no GitHub, no Linear ou no Slack, nem mergeado, sem aprovação explícita.
- **pt-BR com acentuação correta** no output; EN no código.
- **`no_emdash`** — quando `true`, nada que possa acabar publicado (título/corpo de PR, comentário, mensagem de Slack) usa travessão ou en-dash.

## Modo de sessão

A maioria dos elos quer **workspace mode** (`cd <workspace_root> && claude`), porque precisa navegar cross-repo. O `flux:build` funciona nos dois: em workspace mode você passa o repo como primeiro argumento; em repo mode ele infere do `cwd`.

## Estender a família

Um verbo novo entra assim:

1. Crie `plugins/flux/skills/<verbo>/SKILL.md` com frontmatter `name` / `description` / `user-invocable: true`.
2. Abra com um **Step 0-context** que resolve o perfil via [`flux-context.md`](plugins/flux/shared/flux-context.md) — nada de path ou agente de time hardcoded.
3. Declare **Out of scope** explicitamente. A fronteira de cada elo é o que mantém o ciclo legível.
4. Aponte os shared que se aplicam em vez de reescrever a lógica deles.
5. Termine com **handoff**: qual elo vem depois, e por que.
6. Registre o verbo na tabela [Os comandos](#os-comandos) e, se ele mudar o ciclo, no diagrama.

## Contribuindo

Antes de abrir PR, valide os manifests. Este comando pega uma classe de erro que leitura não pega:

```
claude plugin validate .              # marketplace
claude plugin validate ./plugins/flux # plugin + frontmatter de cada skill
```

> **Sempre use aspas na `description` do frontmatter.** Um `: ` (dois-pontos seguido de espaço) num
> valor YAML sem aspas quebra o parse, e o skill carrega com **metadata vazia**, silenciosamente:
> sem `name`, sem `description`, sem `user-invocable`. O sintoma é um `1 error during load` genérico
> no `/reload-plugins`, sem dizer qual arquivo. O `validate` diz.

Duas regras que valem para qualquer contribuição:

1. **Nada de contexto de time hardcoded.** Se o seu time precisa de algo, isso vira campo do manifesto, nunca literal dentro de um verbo. O contrato está em [`shared/flux-context.md`](plugins/flux/shared/flux-context.md).
2. **Degradar bem em vez de rodar mal.** Toda capacidade nova entra com o caminho de ausência definido e declarado no banner de perfil.

## Licença

[MIT](LICENSE).
