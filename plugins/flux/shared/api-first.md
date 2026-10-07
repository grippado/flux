# API primeiro, MCP como degrau declarado

Contrato de transporte para qualquer elo que fala com um serviço externo que tem **dois caminhos**:
a API direta e um servidor MCP. A regra é uma só: **a API é o default, o MCP é o degrau de baixo, e a
descida é sempre declarada e nunca presumida.**

O contrato nasceu no `flux:issue` (Step 6-pre) e foi extraído para cá quando `build` e `land` passaram a
ler o mesmo tracker pelo caminho lento. Um elo que só cita este arquivo não repete a escada.

## Por que a API ganha

1. **Custo de ida e volta.** O MCP expõe uma operação por chamada de tool; a API GraphQL aceita N
   operações num request. Medição do `flux:issue` (2026-08-08): 6 issues atualizadas num request em
   0,71s, com 0,43s de custo fixo por request. O custo é quase todo de ida e volta.
2. **Leitura em uma query.** Ler um ticket pelo MCP é `get_issue`, mais comentários, mais relações, mais
   time: três a quatro round-trips sequenciais antes de o motor começar. Pela API são um documento só
   (query em "O canal Linear", abaixo).
3. **Determinismo de workspace.** O MCP autentica pelo OAuth da conta da sessão e serve o workspace
   dela. Quem tem dois workspaces recebe `Could not find referenced Issue` para um ticket que existe,
   e o sintoma parece ID errado. O token do manifesto aponta para exatamente um workspace.

Nenhum dos três vale para todo canal. **Onde não há segundo caminho, o contrato é vazio**, e o elo não
finge que há (tabela de canais).

## A escada

Para no primeiro "não". Cada degrau que falha tem um destino declarado.

1. **Existe token?** O nome da variável vem do manifesto (`<canal>_token_env`); o valor vem do ambiente
   e, faltando lá, do `secrets_file` (default `~/.secrets`, `KEY=value`). Regras de manuseio em
   `${FLUX_ROOT}/shared/quality-gate-api.md`, seção "Resolução do token". Ausente nos dois: **gate de
   token ausente** (abaixo). **Nunca cai para MCP em silêncio.**
2. **O token autentica?** Uma query barata de identidade (`{ viewer { id name } }` no Linear). Status diferente de `200` **ou payload com `errors`**: MCP, porque GraphQL costuma devolver falha de auth com `200`. Na leitura, este degrau e o seguinte se fundem na própria query de leitura, que prova as duas coisas em um request só.
3. **O token enxerga o alvo?** Para leitura, a própria query de leitura é a sonda: alvo nulo ou erro de
   escopo cai para MCP. Para escrita, é a query que resolve os identificadores do destino.
4. **O token escreve?** Só para escrita. Não existe dry run de mutation, então o teste é um **canário**:
   executar a primeira operação sozinha. Nasceu: seguir pela API com o resto em lote. Falhou por
   autenticação ou permissão: MCP para tudo, inclusive essa primeira. Leitura é idempotente e **pula
   este degrau**.

O canário existe porque descobrir falta de permissão no meio de um lote deixa estado ambíguo: parte do
documento pode ter sido aplicada. Uma operação sozinha falha limpa.

### Gate de token ausente

Antes de perguntar, **ler o cache** (abaixo): `"mcp"` salvo pula direto para o MCP. Sem cache, o elo
abre um gate de uma pergunta (`${FLUX_ROOT}/shared/hitl.md`, single-select). As duas
opções prosseguem com o trabalho: o que se escolhe é só o canal, então não há opção de abortar.

1. **Gerar a chave agora** *(Recomendado)*: guiar a criação da chave no serviço, instruir a gravar
   `<TOKEN_VAR>=<valor>` no `secrets_file` (criando o arquivo se não existe), **nunca pedir o valor no
   chat**, reler o arquivo e retomar a escada do degrau 2. Ainda sem token legível: MCP nesta execução,
   sem gravar preferência, porque a tentativa falhou e isso não foi uma escolha.
2. **Não usar API, seguir por MCP**: grava a preferência no cache e segue direto pelo MCP nas próximas.

Sem round-trip estruturado comprovado, siga o fallback numerado de `${FLUX_ROOT}/shared/hitl.md`,
na mesma ordem, com a degradação no banner.

**Sem interação possível** (`--once`, watch, subagente de fan-out): não há a quem perguntar. Sem cache,
o elo segue por MCP nesta execução, sem gravar preferência, e o banner sai com `transporte mcp (<canal>:
sem token)`. É descida declarada, não silenciosa; a pergunta fica para a próxima execução interativa.

**Cache da preferência.** Para `linear`, o nome normativo é o legado `flux-issue-linear-transport.json`; o modelo
`flux-<canal>-transport.json` vale só para canais futuros. Fica em `<REPO_PATH>/.claude/cache/` (um por
canal, não por verbo): a escolha é da máquina e do serviço, e um opt-out feito no `issue` vale para o `build`.

```json
{ "transport": "mcp", "reason": "usuário optou por não configurar <TOKEN_VAR>" }
```

**Onde vive.** Preferência de máquina, não de repo, mas gravada no repo-alvo por não haver outro lugar
neutro. Elo sem `REPO_PATH` (o `land` roda em workspace) usa `<WORKSPACE_ROOT>/.claude/cache/`; ele não
enxerga o opt-out gravado no repo pelo `issue` e pergunta uma vez por workspace. Harness sem a convenção
`.claude/`: sem cache, e a opção 2 vale só para esta execução, com o texto da opção dizendo isso. **Nunca no `flux-context.json`**: esse manifesto
só é escrito pelo `flux:equip`, e empurrar a preferência para ele quebra a invariante de escritor único
(`${FLUX_ROOT}/shared/flux-context.md`, "Só um elo escreve este arquivo"). O cache não passa pelo gate
de destino de escrita: é preferência de transporte, não artefato de trabalho.

O cache só é lido dentro do degrau 1, quando o token já está ausente. Token presente vence um cache
de `"mcp"` antigo sem lógica extra de prioridade. Se `.claude/cache/` não está no `.gitignore` do
repo-alvo, o banner avisa que o arquivo vai aparecer como untracked. Mudar o nome legado do `linear`
reperguntaria a quem já optou.

## Declarar no banner

O banner tem um só lugar para isso: `degradacoes:`, com o token canônico `transporte mcp (<canal>: <motivo>)`.
A grafia e a lista fechada de motivos moram na tabela do Passo 5 de `${FLUX_ROOT}/shared/preflight.md`, que é a
fonte única. Caminho por API não gera token, porque é o default. Não existe linha `transporte:` própria:
campo fora do gabarito é campo inventado.

Ausência de token nunca vira o motivo `sem token` sozinha: ela abre o gate, e o token declara o
**desfecho** (`opt-out` se o usuário escolheu MCP, `sem token` só se o setup guiado falhou ou não havia
interação possível). Um cache-hit de `"mcp"` sai como `opt-out`: é a mesma escolha, relembrada, e o
banner não pode apagá-la fingindo omissão. Ao citar a variável, citar o **nome**, nunca o valor.
**Nunca imprimir o token**, nem em log, nem ao ecoar erro da API, nem no board.

## Manifesto

Todo elo que aplica o contrato resolve, no seu Step 0-context, `linear_token_env` e `secrets_file`
(sem eles, quem tem dois workspaces cai em `LINEAR_API_KEY` e lê a chave errada). Um campo por canal,
sempre com o **nome** da variável, nunca o valor: `<canal>_token_env`. Hoje existe
`linear_token_env` (default `LINEAR_API_KEY`) e o bloco `quality_gate`. Um canal novo só ganha campo
quando um elo adota este contrato para ele; campo sem consumidor é contrato morto. O nome da variável
não é hardcoded no corpo de nenhum elo, porque quem tem dois workspaces tem duas chaves.

## Canais

| Canal | API | MCP | Leitura em lote | Estado |
|---|---|---|---|---|
| `linear` | GraphQL, `https://api.linear.app/graphql` | sim | uma query no lugar de 3 a 4 chamadas | **adotado**: `issue` (escrita), `build` e `land` (leitura) |
| `github` | `gh` já é a API | não é usado | n/a | **vazio**: não há segundo caminho |
| `sonar` | REST | não existe | n/a | **vazio**: só API, degrada para pendência humana (`quality-gate-api.md`) |
| `slack` | exigiria bot token | sim (`mcp.slack`) | n/a | **fora**: o `reply` só rascunha, e rascunho é capacidade do MCP |
| `sentry`, `datadog` | CLI e REST | varia | n/a | **fora desta versão**: o `probe` decide seu próprio transporte |

Uma linha "adotado" só existe quando o corpo do elo cita este arquivo.

## O canal Linear

**Criar a chave:** `https://linear.app/settings/account/security` (Settings, Security & access, Personal
API keys), com um label que identifique a máquina e o verbo (`flux-<verbo>-<hostname>`). No
`secrets_file`, uma linha `<TOKEN_VAR>=<valor>`, sem `export`.

Autenticação por header, sem prefixo `Bearer` (a chave pessoal do Linear vai crua):

```bash
TOKEN_VAR="${LINEAR_TOKEN_ENV:-LINEAR_API_KEY}"      # linear_token_env do manifesto
SECRETS_FILE="${SECRETS_FILE:-$HOME/.secrets}"       # secrets_file do manifesto
TOKEN=$(printenv "$TOKEN_VAR")
[ -z "$TOKEN" ] && TOKEN=$(grep -E "^${TOKEN_VAR}=" "$SECRETS_FILE" 2>/dev/null | cut -d= -f2-)
```

**Leitura de ticket, um request.** Aceita o identificador (`ENG-123`); a URL é reduzida ao
identificador antes:

```graphql
query Ticket($id: String!, $after: String) {
  issue(id: $id) {
    identifier title description url branchName priority
    state { name type }
    team { key name }
    project { name }
    labels { nodes { name } }
    assignee { name }
    parent { identifier title }
    children { nodes { identifier title state { name } } }
    relations { nodes { type relatedIssue { identifier title state { name } } } }
    inverseRelations { nodes { type issue { identifier title state { name } } } }
    attachments { nodes { title url sourceType } }
    comments(first: 50, after: $after) { pageInfo { hasNextPage endCursor } nodes { body createdAt user { name } } }
  }
}
```

`comments(first: 50)` trunca: `hasNextPage: true` obriga a paginar com `after` até esgotar, porque o
`build` lê a issue inteira e comentário perdido em silêncio é contexto perdido em silêncio. A página
seguinte repete a query com `$after` = `endCursor` da anterior, e pode ser uma query enxuta só de
`comments`.

**Relações têm dois lados.** `relations` traz só as arestas em que esta issue é a origem; o "sou
bloqueada por X" vem em `inverseRelations` (verificado contra a API: uma issue bloqueada tinha
`relations` vazio e o `blocks` só em `inverseRelations`). O `land` monta o toposort com os dois.

Ticket que o token não enxerga (workspace errado, sem acesso ou ID inexistente) volta como erro
`Entity not found: Issue` (`INPUT_ERROR`, verificado contra a API), não como `issue: null`. Tratar os
dois como o mesmo sinal: cair para MCP **e dizer isso no banner**, porque o MCP pode responder o mesmo
erro por outro motivo. Esse sinal usa o motivo `alvo nao enxergado`; erro de rede, 5xx ou timeout usa
`leitura falhou`. `attachments` é onde a integração GitHub do Linear pendura as PRs da issue, que é o que
o `land` procura.

**Armadilhas que já custaram tempo:** o payload de `issueRelationCreate` vem em `issueRelation`, não em
`relation`; `labelIds` **substitui** o conjunto inteiro de labels, então mandar só o novo apaga os
outros; a URL canônica usa o `urlKey` do workspace, não o nome da organização.

## Quem adota

| Elo | Uso | Onde |
|---|---|---|
| `issue` | escrita em lote com canário e resolução de UUIDs | Step 6-pre |
| `build` | leitura do ticket antes de despachar ao motor | Step 2-ter |
| `land` | leitura da issue, sub-issues e anexos na descoberta | Passo 1, "Descoberta das PRs" |

Elo novo que passe a falar com serviço externo de dois caminhos adota este arquivo em vez de
reescrever a escada, e entra na tabela acima no mesmo PR.
