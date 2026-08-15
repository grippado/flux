# Formato de kit — `flux-kit.json` e como um kit é descoberto

> Fonte única do **contrato de kit**: o que um kit é, o shape do `flux-kit.json` campo a campo, como um
> repo é resolvido para zero, um ou N kits, e **onde a família procura kits**. Referenciada por
> `${FLUX_ROOT}/shared/review-agents.md` (descoberta da L2), por
> `${FLUX_ROOT}/shared/write-destination.md` (degrau 3 da cascata de destino) e pelo
> `${FLUX_ROOT}/skills/equip/SKILL.md` (`--from-kit`). **Não duplicar esta lógica** nos verbos: apontar
> para cá e declarar só o que é específico (quando resolver, o que fazer com o resultado).

## O que um kit é

Um kit é um **plugin do harness com uma convenção extra**: um `flux-kit.json` na raiz. Ele empacota o
que a família consome e não produz sozinha — o **motor de execução** (L0) e a **suite de specialists**
(L2) —, já escritos, aplicáveis a um grupo de repos que se parecem.

Duas consequências, e as duas são o motivo de o formato ser tão magro:

- **Distribuição não é problema nosso.** Kit é plugin: quem distribui é git e o marketplace do harness,
  com o versionamento, a instalação e a atualização que eles já têm. A família **nunca baixa nada** — não
  há URL em lugar nenhum deste contrato, e uma `ref` de kit é sempre um caminho no disco.
- **O que o flux resolve é o binding repo → kit.** Dado um repo, quais kits se aplicam, onde eles estão,
  e o que eles fornecem. Só isso.

> **Um kit não é uma raiz da família.** Um kit tem raiz própria, e nenhum arquivo dele é
> endereçável como `${FLUX_ROOT}/...`: kit não sobrescreve `shared/` e não acrescenta verbo. Por que ele
> fica fora da cascata de `${FLUX_ROOT}` está no Passo 1a de `${FLUX_ROOT}/shared/preflight.md`, que é
> quem rege a cascata.

## O arquivo

`flux-kit.json`, na **raiz do kit** — é a presença dele que transforma um plugin comum em kit, e é o que
a descoberta procura. Todo path declarado dentro dele é **relativo à raiz do kit**, sempre; path
absoluto, `~` ou `..` em qualquer campo invalida o kit (ver "Kit inválido").

```json
{
  "schema": 1,
  "kit": "node-service",
  "version": "1.2.0",
  "provides": ["engine", "specialists"],
  "engine": "commands/workflow.md",
  "specialists": "agents/",
  "matches": {
    "repos": ["api-gateway", "notifications"],
    "files": ["package.json"],
    "any_of": ["fastify.config.ts", "src/server.ts"]
  },
  "manifest_fragment": { "exec_fallback": "node-service:workflow" },
  "verified_against": {
    "date": "2026-08-09",
    "repos": ["api-gateway@a1b2c3d"]
  }
}
```

### Campos

| campo | obrigatório | tipo | o que é |
|---|---|---|---|
| `schema` | não (default `1`) | inteiro | versão do formato. Desconhecido → o kit é **ignorado** e a ausência é declarada, nunca adivinhada |
| `kit` | **sim** | string | identificador estável do kit: é o nome que aparece no banner, nos gates e em qualquer lugar onde o kit é referido. **Não é um endereço** — resolver uma `<ref>` por este nome não está especificado, e hoje `<ref>` é sempre um caminho (`${FLUX_ROOT}/skills/equip/SKILL.md`) |
| `version` | **sim** | string | versão do kit. **Opaca para a família**: nunca é comparada por ordem, só exibida e comparada por igualdade |
| `provides` | **sim** | array não vazio | o que o kit fornece. Enum fechado: `engine`, `specialists` |
| `engine` | sim se `provides` contém `engine` | string | path relativo do arquivo do motor de execução |
| `specialists` | sim se `provides` contém `specialists` | string | path relativo do **diretório** da suite |
| `matches` | não | objeto | o matcher. **Ausente → o kit nunca casa sozinho** (ver abaixo) |
| `manifest_fragment` | não | objeto | fatia de manifesto **sugerida**, nunca aplicada por conta própria |
| `verified_against` | não | objeto | contra o que este kit foi verificado, e quando |

**`kit` e `version` são os dois únicos obrigatórios incondicionais**, mais `provides`. Um kit sem
identidade não é referenciável e um kit sem `provides` não fornece nada — os três juntos são o mínimo
para o arquivo significar alguma coisa.

**`provides` é enum fechado, e a fatia de manifesto deliberadamente não está nele.** Escrever no
`flux-context.json` é ação com gate próprio (`${FLUX_ROOT}/shared/write-destination.md`, "Escrever no
manifesto também é escrita"), e um kit que declarasse `manifest` em `provides` estaria pedindo para que
instalar um plugin alterasse a configuração global de quem instalou. Por isso o campo separado e o nome
diferente: `manifest_fragment` é uma **sugestão inerte**, que o verbo de instalação pode oferecer sob o
gate que ele já tem, e que nenhum elo aplica sozinho.

**Quem aplica a fatia é o verbo de preparo**, sob o gate de manifesto que ele já tem
(`${FLUX_ROOT}/skills/equip/SKILL.md`, `--from-kit`), e **quem aplica é quem valida**: a lista das
chaves aceitas é de lá, não daqui, e ampliá-la é da issue que implementar a escrita do fragmento
(LAB-71). Nenhum outro elo toca no fragmento.

**A fatia sugere valores, não a forma final do arquivo.** Onde cada valor cai dentro do
`flux-context.json` é decisão do aplicador, e o autor do kit não tem como saber: ele escreve um
artefato genérico e não conhece o `<slug>` do repo que será equipado. O `exec_fallback` do exemplo
acima é **o motor deste kit**, e o verbo de preparo grava esse valor **na chave do repo equipado**,
promovendo o campo a mapa se preciso — ele nunca escreve `exec_fallback` escalar no manifesto de
ninguém, porque isso trocaria o motor de todos os repos pelo motor deste. Ler o exemplo como o shape
que o manifesto vai ganhar é lê-lo errado.

**`specialists` é um diretório e o orquestrador dele chama-se `repo-owner.md`**, o mesmo nome com que o
Bootstrap escreve orquestrador (`${FLUX_ROOT}/shared/bootstrap-specialists.md`). É a convenção que
permite à descoberta anexar o nome do arquivo ao diretório sem ler o conteúdo de nada — a mesma
normalização do passo 1a de `${FLUX_ROOT}/shared/review-agents.md`.

### `verified_against`

```json
"verified_against": { "date": "2026-08-09", "repos": ["api-gateway@a1b2c3d"] }
```

- `date` — data ISO em que a verificação aconteceu.
- `repos` — os repos contra os quais o kit foi verificado, cada um como `<slug>@<sha>`.

O campo existe porque um kit é escrito lendo repos reais, e **envelhece contra eles**: um motor
verificado contra um `api-gateway` de agosto pode não descrever mais o `api-gateway` de dezembro. Aqui
ele é só **declarado**; quem revalida o kit contra o repo e declara a idade no banner é outro contrato,
e este campo é o insumo dele. Ausente → não há o que revalidar, e isso não é erro: é um kit que nunca
afirmou ter sido verificado.

### Kit inválido

`flux-kit.json` que não parseia, sem `kit`, sem `version`, com `provides` vazio ou fora do enum, com
`schema` desconhecido, com path absoluto/`~`/`..` em qualquer campo, ou declarando `engine`/`specialists`
que não existem em disco: **o kit é ignorado**, e a família segue como se ele não estivesse lá.

Ignorado **não é silencioso**, e este é o único caso em que kit aparece no banner sem ter sido pedido: um
arquivo que alguém escreveu de propósito e que não vale nada precisa dizer por quê, senão a única pista
é a ausência de um comportamento que a pessoa esperava. Vai para `degradacoes:`, com o path e o motivo.

Nunca "consertar" um kit inválido, nunca completar campo faltando por inferência, nunca instalar
parcialmente o que sobrou de um kit quebrado.

**Quem valida, e quando.** Esta seção é a **fonte única** do que invalida um kit, e a validação roda
**no consumidor**, sobre os candidatos que ele foi olhar: o sub-passo 1a-kit
(`${FLUX_ROOT}/shared/review-agents.md`) na leitura, e o verbo de preparo
(`${FLUX_ROOT}/skills/equip/SKILL.md`) sobre a `<ref>` que lhe apontaram. **Os dois vereditos não são o
mesmo:** na leitura o kit inválido é ignorado e declarado, como descrito acima; no verbo de preparo ele
**aborta**, porque quem passou `--from-kit` pediu aquele kit e não outra coisa. Não roda no Passo 1d do
preflight, que localiza e não lê — o porquê mora lá
(`${FLUX_ROOT}/shared/preflight.md`, Passo 1d) e só lá.

## O matcher

`matches` responde uma pergunta só: **este kit se aplica a este repo?** Três chaves, todas opcionais:

| chave | casa quando |
|---|---|
| `repos` | o `REPO_SLUG` está na lista, por **igualdade exata** de string |
| `files` | **todos** os globs existem no checkout (AND) |
| `any_of` | **pelo menos um** dos globs existe no checkout (OR) |

Os globs de `files` e `any_of` são relativos à **raiz do checkout do repo**, nunca à raiz do kit.

Combinação, e a ordem importa:

1. `repos` presente e casou → **casa**, sem consultar as outras chaves. Declaração explícita vence
   inferência: quem nomeou o repo já respondeu a pergunta.
2. Não casou por `repos` → `files` e `any_of` são avaliados e, estando **as duas presentes**, as duas
   precisam passar (AND entre as chaves, com a semântica de cada uma preservada dentro dela).
3. `matches` ausente, ou presente e sem nenhuma das três chaves → **não casa nunca**.

**Ausência não casa com tudo, casa com nada.** Um `matches` ausente lido como "serve para qualquer repo"
faria todo kit instalado na máquina se aplicar a todo repo dela — e o modo de falha seria instalar o
motor de outra stack, calado, num repo que só tinha o azar de não ter kit próprio. Um kit sem matcher
continua perfeitamente utilizável: ele é instalado **explicitamente**, por nome, e é assim que kits
novos nascem antes de alguém confiar neles o suficiente para dar-lhes um matcher.

**Sem checkout local, `files` e `any_of` não casam.** Não há como testar a existência de um arquivo num
repo que não está no disco, e "não pude testar" não é "passou". Nesse estado só `repos` decide, e a
limitação é declarada em `degradacoes:` — um kit que casaria por arquivo e não foi avaliado é uma
degradação, não um kit ausente.

### Zero, um, N

| resultado | leitura (descoberta de L2) | escrita (instalação) |
|---|---|---|
| **0 kits** | nada acontece, **em silêncio**. É o caso comum, e é o comportamento de antes de kits existirem | nada, salvo `--from-kit` explícito, que aborta se a `<ref>` não resolver |
| **1 kit** | é o candidato; segue para a descoberta | é o candidato; segue para o gate de destino |
| **N kits** | **ambíguo**: nenhum é escolhido, a lente é tratada como ausente e o banner declara `kit ambiguo` com a lista | **ambíguo**: abre GATE (`${FLUX_ROOT}/shared/hitl.md`) listando os candidatos com `kit`, `version` e path |

**N é contado depois de filtrar por `provides`, não antes.** Quem conta está sempre atrás de uma coisa
específica — a L2 quer `specialists`, o `flux:build` quer `engine` —, e dois kits casando com o mesmo
repo dos quais só um declara o que se procura não são ambíguos para aquele efeito: há exatamente um
candidato. Filtrar antes de contar resolve boa parte dos N sem nenhuma heurística de desempate, que é
justamente o que o parágrafo abaixo recusa.

**Os dois lados divergem de propósito.** Descoberta é leitura, roda dentro de um elo que foi chamado
para outra coisa e **não pode parar para perguntar** — um review que abre um menu no meio da resolução
de lentes trocou um parecer por uma entrevista. Instalação é o oposto: o usuário pediu para equipar, o
gate é o produto, e adivinhar qual dos N kits ele quis é a única resposta pior que perguntar.

> **A coluna da escrita está especificada e ainda não implementada.** O verbo de preparo resolve `<ref>`
> como caminho, e quem passa um caminho já escolheu um kit — o GATE de N só passa a ser alcançável
> quando `<ref>` puder ser o **nome** do kit, resolvido contra as `KIT_ROOTS`. A coluna fica aqui porque
> ela é o contrato que essa resolução vai consumir, e não o contrário; o estado atual está declarado em
> `${FLUX_ROOT}/skills/equip/SKILL.md`.

**Não existe desempate automático, e a tentação é escrever um.** "O kit mais específico vence" não é
computável: especificidade de glob não é ordenável de forma confiável, e um kit que casa por `repos`
não é comparável com um que casa por três arquivos. Qualquer critério aqui seria uma regra plausível
escolhendo o motor errado em silêncio, que é a classe de falha mais cara desta família — ela produz
código.

## Onde a família procura kits — `KIT_ROOTS`

O problema que este contrato precisou resolver: **um kit instalado corretamente como plugin era
invisível.** A cascata do `FLUX_ROOT` para na primeira raiz, e a descoberta de L2 varria só caminhos de
suite. Um plugin irmão do flux, com um `flux-kit.json` na raiz, não era alcançado por nenhum dos dois.

`KIT_ROOTS` é a resposta, e ele é **um conjunto, não uma cascata**: as origens abaixo são todas
consultadas, a união é deduplicada por path canônico, e nenhuma delas cancela a seguinte. A resolução é
do Passo 1d de `${FLUX_ROOT}/shared/preflight.md`; o que este contrato fixa é o que se faz com ela.

Em cada raiz, um kit é **um diretório que contém `flux-kit.json`** — é essa a única coisa que este
contrato fixa sobre a busca. Como uma raiz é varrida (com que profundidade, e o que é lido enquanto se
varre) é do Passo 1d do preflight, e o número mora lá.

### O kit e a L2

Um kit que declara `specialists` em `provides` fornece uma suite, e **suite é L2** — a mesma camada da
suite que você cura, pela mesma razão: ela vive fora do repo, evolui no seu ritmo e não depende de PR no
projeto. Isso é semântica, e sempre foi; o que faltava era a mecânica.

A mecânica está no `${FLUX_ROOT}/shared/review-agents.md`, em duas partes: o sub-passo **1a-kit**, que
lê e casa os kits e roda independente da cascata, e o **degrau 4** do passo 1a, que conta o resultado —
inclusive a posição dele na ordem e por que ela é essa. É lá também que vale o gate do 1a-bis:
achar o arquivo do orquestrador do kit **não** é o mesmo que o agente ser invocável, e um kit instalado
como plugin tem seus agents registrados pelo harness tipicamente **com o prefixo do plugin**, o que é a
razão de a resolução de nome tentar as formas prefixadas antes de desistir.

## Degradação

**Kit ausente ou não aplicável é o caso comum, e o caso comum é silencioso.** Nenhum elo aborta por não
achar kit, nenhum banner ganha linha para dizer que não havia kit nenhum, e uma máquina sem kit nenhum
se comporta exatamente como se comportava antes de kits existirem.

Só três estados são declarados, porque só três são acionáveis:

| estado | quando | quem emite |
|---|---|---|
| `kit ambiguo` | N kits, já filtrados por `provides`, casaram com o mesmo repo, **e o degrau que ia escolher foi alcançado** | o degrau 4 da cascata de L2 (`${FLUX_ROOT}/shared/review-agents.md`), em `degradacoes:` com a lista |
| `kit invalido` | há `flux-kit.json` e ele não vale por "Kit inválido" acima | o sub-passo 1a-kit, em `degradacoes:` com o path e o motivo |
| `kit nao avaliado` | há kit com matcher por arquivo (`files`/`any_of`) e não há checkout local | idem, com o path |

**Os três saem de quem consome `KIT_ROOTS`, nunca do Passo 1d** — que localiza e não lê (ver "Kit
inválido"). Hoje todos vêm da leitura, e de dois pontos diferentes de propósito: os dois últimos são
sobre o **estado dos kits da máquina** e saem do 1a-kit, que roda mesmo quando a cascata de L2 nem
chega ao degrau do kit; `kit ambiguo` é sobre uma **escolha não feita** e só é acionável para quem ia
escolher, então sai do degrau 4. O porquê está em `${FLUX_ROOT}/shared/review-agents.md`, 1a-kit.

> **O lado da escrita não emite nenhum dos três, e isto não é omissão.** O verbo de preparo resolve
> `<ref>` como caminho, então `kit ambiguo` não é um estado que ele alcance; ele nunca roda o matcher,
> então `kit nao avaliado` também não; e kit inválido ali **aborta** em vez de degradar. Um emissor de
> escrita só passa a existir quando a resolução por nome contra as `KIT_ROOTS` existir, o que é da
> LAB-71.

Os tokens são os do Passo 5 de `${FLUX_ROOT}/shared/preflight.md`, e a grafia é a de lá.
