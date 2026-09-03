# flux CLI

O `flux` é um binário que **prepara e dispara** uma sessão de agente já sabendo onde você está.

Sem ele, invocar um verbo da família é digitar `/flux:review 8249` dentro de uma sessão e torcer para que ela descubra sozinha em que repo você está, qual manifesto vale, quais agentes existem e o que falta na máquina. O CLI faz essa descoberta **antes** da sessão existir, monta um bloco de diagnóstico com o resultado e entrega tudo pronto no primeiro prompt.

```bash
flux review 8249 --repo backoffice
```

Isso resolve o contexto, monta o prompt, mostra uma prévia, e abre a sessão com o verbo já invocado.

---

## Sumário

- [Por que um CLI](#por-que-um-cli)
- [Instalação](#instalação)
- [O modelo mental](#o-modelo-mental)
- [Uso: os verbos](#uso-os-verbos)
- [Uso: os subcomandos mecânicos](#uso-os-subcomandos-mecânicos)
- [Flags](#flags)
- [O manifesto de contexto](#o-manifesto-de-contexto)
- [Como o contexto é resolvido](#como-o-contexto-é-resolvido)
- [O bloco PREFLIGHT RESOLVIDO](#o-bloco-preflight-resolvido)
- [Rodar em outra máquina](#rodar-em-outra-máquina)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Desenvolvimento](#desenvolvimento)
- [Diagnóstico de problemas](#diagnóstico-de-problemas)

---

## Por que um CLI

Uma skill roda **dentro** de uma sessão. Ela não escolhe em que diretório a sessão nasceu, não sabe quais binários existem no PATH, e descobrir isso custa chamadas de ferramenta que consomem o contexto que deveria ser gasto no trabalho.

O CLI roda **antes** da sessão e tem acesso ao ambiente. Ele responde de graça três perguntas que a skill responderia caro:

1. **Onde estou?** Qual repo, qual manifesto de contexto vale aqui, onde ficam os checkouts.
2. **O que existe nesta máquina?** Quais agentes de review estão instalados, `gh` está disponível, o vault existe.
3. **O que falta?** Se falta um requisito duro do verbo, o CLI aborta **antes** de gastar uma sessão inteira para descobrir isso no meio do trabalho.

O resultado dessas três perguntas vai no primeiro prompt como um bloco de texto. A skill lê o bloco em vez de investigar.

> **Nota de desenho.** A família tem uma regra de neutralidade de harness: as skills não podem nomear produto nem assumir em qual agente estão rodando. O CLI é a exceção explícita, porque ele roda antes da sessão e o ambiente é justamente o que ele tem para oferecer.

---

## Instalação

O CLI vive em `cli/` dentro do repositório do flux e é compilado para um binário único com Bun.

```bash
cd cli
bun run setup
```

Isso roda `bun build --compile`, re-assina o binário e o instala em `~/.local/bin/flux`. Garanta que `~/.local/bin` está no seu `PATH`.

**Pré-requisitos:** [Bun](https://bun.sh) para compilar. Em runtime o binário não depende de Bun nem de Node.

**Por que o passo de re-assinatura existe:** em Macs com MDM e EndpointSecurity (JumpCloud, SentinelOne e afins), o ad-hoc signing padrão do Bun é rejeitado. O `setup.sh` roda `codesign --force --sign -` e depois faz um warm-up: o primeiro exec logo após assinar corre contra um scan assíncrono do daemon de segurança e pode morrer com `exit 137` sem que haja nada errado com o binário. O script absorve essa corrida ali, e não na primeira vez que você for usar o comando de verdade.

Confira:

```bash
flux            # abre o wizard interativo
flux resolve --json   # imprime o contexto resolvido
```

---

## O modelo mental

Três camadas, e vale entender a diferença porque as mensagens de erro falam nelas:

| camada | o que é | quem provê |
|---|---|---|
| **CLI** | o binário `flux`, que resolve contexto e dispara | este diretório |
| **Skills** | os verbos (`flux:review`, `flux:build`, …), em Markdown | `plugins/flux/skills/` |
| **Agentes** | os revisores e specialists que as skills despacham | sua máquina e seus repos |

O CLI **não implementa nenhum verbo**. Ele monta o prompt que invoca a skill do verbo e sai do caminho. Se você digitar o mesmo prompt à mão dentro de uma sessão, o resultado é o mesmo — o CLI só poupa a descoberta.

Os agentes vivem em três níveis, que o CLI chama de **lentes**:

- **L1** — o reviewer holístico, um só, que olha a mudança inteira.
- **L2** — a suite de specialists **da sua máquina** para aquele repo, instalada por você.
- **L3** — os agentes versionados **dentro** do repo, mantidos pelo time dele.

O CLI descobre L2 e L3 e reporta quais achou. Quando um repo não tem nenhuma, o comando `flux equip` existe para criar a L2.

---

## Uso: os verbos

```
flux <verbo> [alvo] [--repo <slug>] [flags]
```

| verbo | o que faz |
|---|---|
| `review` | revisão formal de PR ou doc (specialists + reviewer holístico), persiste no vault |
| `peek` | relance rápido e read-only de PR, diff ou doc; não persiste, não posta |
| `refine` | PRD e plano numa rodada, a partir de ideia, thread ou bug |
| `issue` | cria issue embasada em código, a partir de qualquer fonte |
| `build` | implementa um ticket e entrega PR draft |
| `iterate` | fecha o loop de uma PR: threads, CI, push |
| `land` | orquestra entrega multi-PR até o merge |
| `reply` | acompanha um caso do Slack embasado em código |
| `map` | levanta a instalação da família nesta máquina |
| `equip` | equipa um repo com motor de execução e specialists |

**Sem argumento nenhum**, o `flux` abre um modo interativo que pergunta o verbo (num menu com a descrição de cada um), o alvo, o repo e se você quer rodar em outra máquina. Ele monta o `argv` equivalente e segue pelo mesmo caminho de sempre, sem duplicar lógica. É o atalho para quando você não lembra o nome do verbo.

O modo interativo só abre quando o `stdin` é um TTY. Rodado dentro de um script ou com a saída redirecionada, `flux` sem argumentos imprime o usage e sai. Se você esperava o menu e recebeu o usage, é isso.

```bash
flux                              # wizard
flux peek                         # relance da working tree atual
flux peek 8249                    # relance da PR #8249 do repo do cwd
flux review 8249 --repo backoffice
flux build LAB-142 --repo flux
flux issue "thread do Slack sobre timeout no checkout"
```

### O alvo

O alvo é repassado ao verbo sem interpretação, com uma exceção: **ticket do Linear exige `--repo`**. Um `LAB-142` ou uma URL `linear.app/...` não diz em que repo o trabalho acontece, e o CLI recusa em vez de adivinhar:

```
Alvo de ticket Linear requer --repo. Exemplo: flux build LAB-142 --repo <slug-do-repo>
```

---

## Uso: os subcomandos mecânicos

Além dos verbos, o CLI tem três subcomandos que **não abrem sessão nenhuma**: eles imprimem JSON e saem. Servem para as próprias skills consumirem, e para você depurar.

### `flux resolve`

Imprime o contexto resolvido e nada mais. É o comando para responder "por que o flux acha que estou neste perfil?".

```bash
flux resolve --json
flux resolve --repo backoffice --json
```

```json
{
  "profile": "pessoal",
  "manifest_path": "/Users/voce/www/personal/.claude/flux-context.json",
  "anchor": "/Users/voce/www/personal/flux",
  "flux_root": "/Users/voce/.claude/plugins/cache/flux/flux/1.29.1/plugins/flux",
  "flux_root_source": "env:FLUX_HOME",
  "exec_command": "workflow",
  "exec_fallback": "flux-engine-flux",
  "lenses": {
    "l2_paths": ["/Users/voce/agents/personal/flux"],
    "l3_paths": []
  },
  "warnings": []
}
```

### `flux preflight`

Roda a verificação completa para um verbo específico: requisitos duros e moles, reviewer holístico, nível de capacidade.

```bash
flux preflight review 8249 --repo backoffice --json
```

Cada verbo declara o que precisa. `review` exige `shared/review-legend.md`, `shared/review-artifact-template.md` e `git` como **duros**; `gh`, vault e checkout local são **moles**. Duro ausente aborta; mole ausente degrada e o CLI declara o que se perde.

O nível de capacidade sai como:

| nível | quando |
|---|---|
| `FULL-tentativo` | manifesto presente e specialists encontrados |
| `REDUCED` | checkout local presente, sem os dois acima |
| `THIN` | sem checkout local |
| `UNAVAILABLE` | um requisito duro faltou |

`FULL` é **tentativo** porque o CLI vê o disco, não a sessão: ele sabe que o arquivo do agente existe, mas não se o harness o registrou como invocável. Quem confirma é a skill, dentro da sessão.

### `flux gather pr`

Coleta os dados de uma PR via `gh` e devolve JSON: metadados, diff, e opcionalmente as threads de review.

```bash
flux gather pr 8249 --repo owner/repo --json
flux gather pr 8249 --threads --json          # inclui as threads
flux gather pr https://github.com/owner/repo/pull/8249 --out ./coleta --json
```

`--threads` só é usado por quem vai responder threads (o `iterate`); o `peek` não pede, para não pagar por dado que não usa.

---

## Flags

| flag | efeito |
|---|---|
| `--repo <slug>` | repo alvo. Obrigatório quando o alvo é ticket do Linear |
| `--dry` | imprime o comando que seria executado e sai. Nada roda |
| `--safe` | tira o bypass de permissões da invocação |
| `--new` | abre em aba nova do terminal em vez da atual |
| `--remote [alias]` | roda em outra máquina via SSH. Sem alias, pergunta qual |
| `--yes` / `-y` | pula a prévia do banner |
| `--json` | saída JSON. Usado pelos subcomandos mecânicos |

### `--dry` é a ferramenta de inspeção

`--dry` imprime a linha de comando exata que seria disparada, incluindo o prompt inteiro. É como você confere o que o CLI descobriu sem gastar uma sessão:

```bash
flux review 8249 --repo backoffice --dry
```

### `--safe`

Por padrão a invocação carrega o bypass de permissões do harness, porque a sessão nasce para trabalhar e um gate a cada ferramenta anula o ponto. Com `--safe`, o bypass sai e a sessão pede aprovação normalmente.

### A prévia do banner

Antes de disparar, o CLI mostra o bloco que será enviado e abre um menu de três opções:

```
--- banner que será enviado pro Claude Code ---
...
--- fim do banner ---

O que fazer com esse banner?
(setas ou j/k pra navegar, numero ou Enter pra confirmar, Esc cancela)

  1. Enviar assim
  2. Anexar um comentário extra
  3. Cancelar
```

**Anexar um comentário extra** pergunta um texto e o acrescenta ao fim do prompt. É onde você põe "foca no parsing de data" sem reescrever o comando nem editar a skill.

`--yes` pula essa etapa. A prévia também não aparece quando o stdin não é um TTY, o que é o caso quando o `flux` roda dentro de um script.

---

## O manifesto de contexto

O `flux-context.json` é o arquivo que declara **o contexto de um workspace**: onde os repos vivem, qual vault usar, qual organização do Linear, quais agentes existem.

Ele é procurado em `.claude/flux-context.json` ou `.cursor/flux-context.json`, subindo a árvore de diretórios a partir da âncora.

```json
{
  "name": "acme",
  "workspace_root": "~/www/acme",
  "repos": ["api-gateway", "web-monorepo", "payments"],

  "vault_root": "~/.notes",
  "vault_context": "acme",
  "linear_org": "acme-eng",
  "no_emdash": true,

  "exec_command": "workflow",
  "exec_fallback": {
    "payments": "acme-engine-payments",
    "default": "acme-implement"
  },

  "specialists_root": "~/agents/{repo}/repo-owner.md",
  "holistic_reviewer": "acme:reviewer"
}
```

| campo | para que serve |
|---|---|
| `name` | nome do perfil, aparece no banner |
| `workspace_root` | onde os checkouts vivem. Sem ele, o diretório do manifesto |
| `repos` | lista de slugs conhecidos, usada para validar e sugerir |
| `vault_root` / `vault_context` | onde os verbos persistem boards e relatórios |
| `linear_org` | normaliza `LAB-142` em URL clicável |
| `no_emdash` | proíbe travessão em texto que vai para o GitHub |
| `exec_command` | nome do comando de execução nativo dos repos deste contexto |
| `exec_fallback` | motor de execução por repo, quando o repo não tem um nativo |
| `specialists_root` | template de caminho para a suite L2, com `{repo}` |
| `holistic_reviewer` | o reviewer L1 deste contexto |

**Sem manifesto o CLI funciona.** O perfil vira `generico`: a âncora é o `cwd`, os repos são os subdiretórios com `.git`, e nada é persistido em vault. O que se perde é declarado no banner, não descoberto no meio do caminho.

### `exec_fallback` aceita duas formas

Escalar, quando um comando serve para todos os repos do contexto:

```json
"exec_fallback": "acme-implement"
```

Mapa, quando repos diferentes têm motores diferentes:

```json
"exec_fallback": {
  "payments": "acme-engine-payments",
  "default": "acme-implement"
}
```

A resolução é **repo → `default` → nenhum**, nessa ordem. Um mapa que não nomeia o repo e não tem `default` faz o `build` cair em modo autônomo, e não usar o motor de outro repo: executar código com o pipeline errado, em silêncio, é pior do que executar sem pipeline.

---

## Como o contexto é resolvido

Esta é a parte que mais gera dúvida, então vale por extenso.

### A âncora é o alvo, não o `cwd`

```bash
cd ~
flux build LAB-142 --repo flux
```

Isso tem que achar o perfil do workspace onde `flux` vive, e não o do seu home. Então a resolução é:

1. **Parse do alvo** primeiro, sem abrir nada.
2. **Âncora**: se veio `--repo <slug>`, a âncora é o checkout daquele repo. Senão, o `cwd`.
3. **Manifesto**: subindo a árvore a partir da âncora.

Quando o slug não resolve perto, o CLI **varre os manifestos conhecidos** procurando qual reivindica aquele slug (pelo campo `repos` ou por ter `<workspace_root>/<slug>/.git`). Um reivindica, adota-se aquele perfil inteiro e sai um aviso. Mais de um, ele pergunta. Nenhum, ele ancora no `cwd` e avisa.

Esse aviso importa:

```
slug "flux" resolvido via varredura de manifestos (não por manifesto próximo) — verifique se o contexto está correto
```

Ele quer dizer: "achei, mas não pelo caminho normal, confira se é o contexto certo".

### `FLUX_ROOT`: onde as skills moram

O CLI precisa saber onde estão os arquivos de contrato (`shared/*.md`) para verificar os requisitos duros. A ordem:

1. `$FLUX_HOME`, se definido e existente. Sai como `env:FLUX_HOME`.
2. As variáveis de plugin do harness (`CLAUDE_PLUGIN_ROOT`, `CURSOR_PLUGIN_ROOT`, `CODEX_PLUGIN_ROOT`).
3. **Heurística**: varre `~/.claude*` e `~/.cursor` procurando `plugins/cache/flux/flux/<versao>/`, e escolhe a maior versão.

A heurística emite aviso, porque ela pode acertar o cache errado quando você tem mais de uma conta ou config dir:

```
FLUX_ROOT resolvido por heuristica-cli: instalação formal recomendada
```

Se você tem múltiplos config dirs, **defina `FLUX_HOME` explicitamente**. É o degrau que existe justamente para isso.

---

## O bloco PREFLIGHT RESOLVIDO

É o produto do CLI. Vai no começo do prompt, e a skill o lê em vez de investigar:

```
--- PREFLIGHT RESOLVIDO (flux-cli v1.29.1) ---
perfil: acme
manifesto: /Users/voce/www/acme/.claude/flux-context.json
ancora: /Users/voce/www/acme/payments
flux_root: /Users/voce/.claude/plugins/cache/flux/flux/1.29.1/plugins/flux
flux_root_source: env:FLUX_HOME
exec_command: workflow
exec_fallback: acme-engine-payments
lentes:
  l2_paths: /Users/voce/agents/payments
  l3_paths: ausente
avisos:
  - ...
flux_cmd: /flux: (session_revalidation_required)
--- FIM PREFLIGHT RESOLVIDO ---
```

**O bloco é ADVISORY, e isso é deliberado.** Ele é um ponto de partida, não a verdade final. O campo `session_revalidation_required` lista o que a skill precisa reconferir de dentro da sessão, porque depende de estado que o CLI não enxerga:

| campo | por que o CLI não decide |
|---|---|
| `flux_cmd` | a forma invocável (`/flux:review` ou `/flux-review`) depende do harness |
| `adddir_cmd` | idem |
| `holistic_verification` | o CLI vê o arquivo do agente no disco, não o registro dele como invocável |
| `capability_level` | por depender do anterior |

Um CLI que afirmasse esses quatro estaria mentindo com aparência de precisão. Ele afirma o que mediu e marca o resto.

---

## Rodar em outra máquina

```bash
flux review 8249 --repo backoffice --remote worzix
flux review 8249 --repo backoffice --remote          # pergunta qual
```

Sem alias, o CLI lê os `Host` do seu `~/.ssh/config`, **testa quais estão acessíveis agora** e mostra só esses num menu.

### O opt-out `flux:ignore`

Uma máquina pode ser tirada do jogo com um comentário logo acima do bloco `Host`:

```sshconfig
# flux:ignore
Host producao
  HostName ...
```

Serve para máquinas que estão no `~/.ssh/config` por conveniência de deploy e onde **nunca** se deve rodar um harness de agente.

### Duas armadilhas conhecidas

O `--remote` monta `ssh -t <host> zsh -lic 'flux ...'` e **não faz `cd`**: a sessão nasce no `$HOME` da máquina remota. Duas consequências:

1. **O manifesto não é encontrado** subindo a árvore a partir do home, então o contexto pode cair no perfil errado.
2. **O `FLUX_ROOT` é resolvido pela heurística** na máquina remota, que pode achar o cache de outro config dir.

Se você usa mais de uma conta ou contexto na máquina remota, envolva a chamada num wrapper que faça `cd` explícito e passe `FLUX_HOME` e `FLUX_CLAUDE_CMD`. É trabalho para uma função de shell, não para o CLI adivinhar.

---

## Variáveis de ambiente

| variável | efeito |
|---|---|
| `FLUX_HOME` | caminho do `plugins/flux/`. Vence a heurística. **Defina se você tem mais de um config dir** |
| `FLUX_CLAUDE_CMD` | substitui a invocação inteira. Serve para apontar a um wrapper próprio |
| `CLAUDE_PLUGIN_ROOT` / `CURSOR_PLUGIN_ROOT` / `CODEX_PLUGIN_ROOT` | raiz do plugin, quando o harness a exporta |
| `SHELL` | shell usado para executar. Default `/bin/zsh` |

### `FLUX_CLAUDE_CMD` e funções de shell

O CLI executa via `[$SHELL, "-i", "-c", ...]`, um shell **interativo**. Isso significa que o seu `.zshrc` é carregado, e portanto **funções de shell funcionam** como alvo:

```bash
FLUX_CLAUDE_CMD="minha-funcao arco" flux review 8249 --repo backoffice
```

É o mecanismo para rotear a sessão por um wrapper próprio: escolher conta, exportar variáveis, o que for. O CLI não valida o alvo de um override, porque não tem como: quem ditou a invocação sabe o que ela é.

---

## Desenvolvimento

```bash
cd cli
bun test              # a suíte
bun run build         # compila para ./flux
bun run setup         # compila, assina e instala em ~/.local/bin
bun run src/index.ts <args>   # roda direto do fonte, sem compilar
```

### Estrutura

| arquivo | responsabilidade |
|---|---|
| `index.ts` | parse de argumentos, wizard, roteamento dos subcomandos |
| `resolve.ts` | resolução de âncora, manifesto, `FLUX_ROOT` e lentes |
| `preflight.ts` | requisitos por verbo, nível de capacidade, reviewer holístico |
| `prompt.ts` | montagem do bloco `PREFLIGHT RESOLVIDO` e da linha de comando |
| `launch.ts` | execução local, em aba nova (AppleScript) e remota (SSH) |
| `gather.ts` | coleta de PR via `gh` |
| `github-url.ts` | parse de URL do GitHub |

Testes ficam **ao lado** do fonte (`resolve.ts` + `resolve.test.ts`). Mantenha o padrão.

### CI

O workflow `checks.yml` roda em toda PR, mas executa apenas os **checks de contrato** (`check-manifests.sh` e `check-codex-agent-contract.sh`). Ele **não roda `bun test`**. Um verde de CI na PR não significa que a suíte do CLI passou: rode localmente, senão ninguém roda.

### Sobre comentários no código

Este repositório mantém a justificativa de decisão na **mensagem de commit e na descrição da PR**, não em comentário inline. Comentários existentes explicando armadilhas medidas (o `codesign` do `setup.sh`, por exemplo) são deliberados e não devem ser removidos de passagem.

---

## Diagnóstico de problemas

### "Verbo desconhecido"

O primeiro argumento não é um verbo nem um subcomando mecânico. `flux` sem argumentos lista os verbos.

### "Alvo de ticket Linear requer --repo"

Um ticket não diz em que repo o trabalho acontece. Passe `--repo <slug>`.

### O perfil resolvido está errado

```bash
flux resolve --json
```

Olhe `anchor` e `manifest_path`. Se a âncora está no lugar errado, ou você esqueceu `--repo`, ou o manifesto não está onde você pensa. Se houver o aviso de "varredura de manifestos", o slug foi achado por busca ampla e vale conferir.

### `flux_root_source: heuristica-cli`

O CLI adivinhou onde as skills moram. Funciona, mas pode acertar o cache errado se você tem mais de um config dir. Defina `FLUX_HOME`.

### O binário morre com exit 137 logo após instalar

Corrida com o daemon de segurança do macOS (MDM e EndpointSecurity). O `setup.sh` já absorve isso; se acontecer fora dele, espere alguns segundos e rode de novo.

### `<binário> não encontrado no PATH`

O harness não está instalado, ou está instalado como função de shell e não como binário. Note que a verificação usa `/usr/bin/which`, que só enxerga o `PATH` — funções de shell não aparecem ali, embora funcionem na execução, que usa shell interativo. Se for o seu caso, use `FLUX_CLAUDE_CMD`.

---

## Relacionado

- [`../README.md`](../README.md) — a família `flux:` e os verbos
- [`../plugins/flux/shared/`](../plugins/flux/shared/) — os contratos que as skills seguem
- [`RELEASING.md`](RELEASING.md) — como publicar uma versão
