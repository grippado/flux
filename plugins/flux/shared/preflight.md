# Preflight da família `flux:` — falhar bem em vez de rodar mal

> Fonte única do protocolo de verificação de pré-requisitos. Todo elo `flux:*` abre chamando este
> shared, **antes** de qualquer trabalho. Não duplicar esta lógica dentro dos comandos.
>
> **Princípio:** um elo só roda se o resultado for confiável. Quando não for, ele para e diz
> exatamente o que falta. Rodar em modo degradado silencioso é pior do que não rodar, porque produz
> um artefato que parece válido e não é.

> **Codex:** carregar [`codex-compat.md`](codex-compat.md) junto deste contrato. Onde os
> adaptadores Claude/Cursor dizem `Task tool`, o Codex usa sua delegação nativa de subagentes;
> nenhum nome de ferramenta é simulado.

> **Este passo roda depois da âncora.** O parse do alvo e a resolução do manifesto vêm antes, porque
> o agente holístico que o Passo 3 verifica vem do perfil. Ver `${FLUX_ROOT}/shared/flux-context.md`,
> seção "Ordem obrigatória". Verificar o holístico antes de saber o perfil valida o agente errado.

## Passo 1 — Resolver `FLUX_ROOT` e `FLUX_CMD`

### 1a — `FLUX_ROOT`

Todo path para `shared/` e `agents/` da família é escrito como `${FLUX_ROOT}/...`. Resolver nesta
ordem, parando no primeiro que existir:

1. `${CLAUDE_PLUGIN_ROOT}` — instalado como plugin no Claude Code.
2. `${CURSOR_PLUGIN_ROOT}` — instalado como plugin no Cursor.
3. `${CODEX_PLUGIN_ROOT}` — instalado como plugin no Codex, **quando a sessão expõe a variável**.
   Ela não é garantida: o Codex resolve plugin por caminho relativo ao marketplace, e a única
   variável que ele documenta é `CODEX_HOME`, que aponta para as *skills* e não para a raiz de um
   plugin. Por isso o candidato seguinte existe.
4. **A raiz do plugin Codex por marcador de manifesto**: subindo a partir do arquivo do verbo em
   execução, o primeiro diretório que contiver `.codex-plugin/plugin.json`. É determinístico e não
   depende de variável nenhuma, que é o que torna o Codex resolvível hoje.
5. O diretório dois níveis acima do arquivo do verbo em execução (de `skills/<verbo>/SKILL.md`
   sobe para a raiz da instalação). Se o arquivo foi carregado por symlink, resolver o alvo real
   antes de subir (`readlink -f`) — é o caminho da instalação local do Cursor, que é um symlink
   para o checkout.
6. `${FLUX_HOME}` — raiz declarada no ambiente, quando o instalador exporta a variável.

Se nenhum resolver, é `UNAVAILABLE`: abortar informando que a instalação da família não foi
localizada.

> **A família não sabe em qual harness roda, e não deve saber.** Os candidatos nomeados acima são a
> única menção a harness específico em todo o flux. Nomear um harness aqui só é legítimo quando o
> candidato é **verificável**: uma variável que a sessão de fato define, ou um marcador que existe
> no disco. Um candidato que nomeia um produto sem ter como confirmar a raiz não resolve nada e
> transforma este passo numa lista de boas intenções. Tudo abaixo deste passo é escrito contra
> `${FLUX_ROOT}` e `${FLUX_CMD}`, nunca contra o nome de um produto.

> **Um kit não entra nesta cascata.** Um kit é um plugin com raiz própria
> (`${FLUX_ROOT}/shared/kit-format.md`), e a raiz dele é resolvida à parte, no Passo 1d. Acrescentá-lo
> aqui faria um plugin instalado poder virar a raiz da família e redefinir `shared/` calado — e faria o
> `${FLUX_ROOT}` de cada elo depender de qual plugin foi instalado por último. `FLUX_ROOT` continua
> sendo uma raiz só, a do flux, e parando na primeira que existir.

### 1b — `FLUX_CMD`

Um elo `flux:` que despacha outro elo (o `flux:land`, que roda o iterate por PR dentro de subagente;
o `flux:map`, que despacha o equip por repo; e os elos com watch, `flux:iterate` e `flux:reply`, que
reinvocam a si mesmos pelo `prompt` do `ScheduleWakeup` — despacho pelo mesmo mecanismo e com o mesmo
risco) precisa escrever o **nome invocável** do irmão. Esse nome é montado pelo harness a partir
do nome do plugin e do verbo, não por nós: o mesmo `skills/iterate/SKILL.md` vira `/flux:iterate`
num harness e pode virar outra coisa em outro.

`FLUX_CMD` é o prefixo de invocação da família. Resolver **verificando qual forma a sessão de fato
expõe**, nesta ordem, parando na primeira que existir:

1. `/flux:` — plugin com namespace por `:` (Claude Code).
2. `/flux-` — plugin com namespace achatado por hífen.
3. `/` — skills registradas sem namespace de plugin.

Vale aqui o mesmo rigor do Passo 3: **resolver não é verificar**. Escrever `/flux:iterate` num
prompt de subagente sem confirmar que essa forma existe produz a pior falha possível — o subagente
não encontra o comando e improvisa uma iteração inline, fora do contrato de saída e sem nenhuma das
garantias do elo (worktree, verificação contra código real, disciplina de resposta).

Se **nenhuma** forma resolver, `FLUX_CMD` é `UNAVAILABLE`. Isso não derruba os elos que não
despacham irmãos; derruba só a fase que depende de despacho, e ela aborta com a mensagem do formato
padrão em vez de degradar para inline.

**E o texto que não é despacho?** A regra acima cobre a fase que despacha. Depois que a "Regra de
escrita" abaixo passou a valer também para mensagem de abortagem, sugestão de verbo e linha de board,
existe uma segunda pergunta que o contrato não respondia: o que sai impresso quando `FLUX_CMD` é
`UNAVAILABLE` e o texto não despacha nada?

Não é o placeholder cru, e não é o literal de um harness. Os dois são piores que o problema: o
primeiro imprime `${FLUX_CMD}review 790`, que não é comando em lugar nenhum; o segundo manda digitar
uma forma que naquela máquina não existe, que é exatamente o defeito que esta regra veio corrigir.

**Nomear o verbo, não a invocação.** Sem `FLUX_CMD`, o texto cita o elo pelo nome (`o verbo `review`
da família`) e, quando útil, diz que ele é invocado pela forma que aquela sessão expõe. É a mesma
disciplina de `${FLUX_ROOT}/shared/bootstrap-specialists.md`, que já manda oferecer o preparo sem
nomear uma forma que não pôde verificar.

Isso vale inclusive para o gabarito de abortagem do "Formato da mensagem de abortagem", onde a
circularidade é mais aguda: a mensagem que existe para dizer o que falta não pode depender da
resolução que faltou.

**Regra de escrita:** toda menção a um verbo irmão que sai **impressa para o usuário** — linha de
fechamento, sugestão de próximo elo, texto ao lado de um menu — usa `${FLUX_CMD}`. O `/flux:` literal
só é aceitável em prosa interna que o usuário nunca lê (comentário de arquitetura, tabela de
referência entre shareds).

> **Por que a distinção importa.** A linha de fechamento não é decoração: ela existe para o usuário
> digitar o próximo comando. Escrever ali a forma de outro harness manda alguém digitar um comando
> que não existe na máquina dele, e o erro chega no formato mais confuso possível — o elo funcionou
> perfeitamente e ainda assim entregou uma instrução quebrada.

### 1c — `ADDDIR_CMD`

O degrau 0 da escada de alcance da L3 (`${FLUX_ROOT}/shared/review-agents.md`, 1b-bis) depende de uma
capacidade que **nem todo harness tem**: acrescentar um diretório ao escopo da sessão, fazendo o
`.claude/agents/` dele ser varrido junto. Onde ela existe, é o único caminho que alcança a suite do
repo **sem criar cópia**, e por isso ela é o primeiro degrau.

Vale aqui o mesmo rigor dos Passos 1b e 3, e pela mesma razão: **resolver não é verificar**. Um
contrato que imprime o comando sem confirmar que a sessão o expõe manda o usuário digitar algo que
não existe na máquina dele — a falha que o Passo 1b nomeia, com um comando de harness no lugar do
verbo irmão.

Resolver `ADDDIR_CMD` **verificando qual forma a sessão de fato expõe**, parando na primeira:

1. `/add-dir` — comando de sessão.
2. A flag equivalente de invocação do harness, quando ele documenta uma.

**Com o que se verifica.** Vale o 3-bis abaixo, pela mesma razão: não há `command -v` para comando de
sessão. A fonte é o que a sessão expõe a este processo — a lista de comandos disponíveis —, e por isso
esta resolução é **introspecção, e privilégio da main**, feita uma vez e descida como fato dado a
quem precisar. Ler a documentação de um harness **não é** verificar: uma flag documentada e ausente
nesta sessão resolve para `UNAVAILABLE` como qualquer outra.

Nenhuma forma resolveu → `ADDDIR_CMD` é `UNAVAILABLE`. Isso **não** derruba elo nenhum: o degrau 0
simplesmente sai da escada, que segue para o degrau 1 (espelho namespaceado), e a ausência é
declarada como qualquer outra degradação.

> **Por que isto não é hardcode de produto.** A regra do Passo 1a é que nomear um harness só é
> legítimo quando o candidato é **verificável** e tem caminho de ausência. `ADDDIR_CMD` tem os dois,
> e é por tê-los que ele pode existir; a versão anterior deste contrato imprimia `/add-dir` cru, sem
> teste e sem ausência, e isso era hardcode.

### 1d — `KIT_ROOTS`

Um **kit** é um plugin com um `flux-kit.json` na raiz, e o contrato dele é
`${FLUX_ROOT}/shared/kit-format.md`. Este passo resolve **onde procurá-los**, e só isso: o que se faz
com o que for achado é de lá.

`KIT_ROOTS` é um **conjunto, não uma cascata**. Todas as origens abaixo são consultadas, a união é
deduplicada por path canônico, e nenhuma cancela a seguinte — duas origens podem apontar para o mesmo
kit, e um kit pode existir numa e não na outra:

1. `kits` do manifesto, quando há (`${FLUX_ROOT}/shared/flux-context.md`). Cada entrada é um caminho
   local: a raiz de um kit, ou um diretório de kits.
2. O **prefixo invariante** de `kits_root` — o trecho antes do primeiro `{repo}`. O campo é um template
   por repo, e o que interessa aqui é a raiz onde os kits daquela máquina vivem.
3. Os **irmãos de `${FLUX_ROOT}`**: o diretório pai da raiz da família — **só quando `FLUX_ROOT` veio
   dos candidatos 1 a 4 do Passo 1a**. Instalado como plugin, o flux é vizinho dos outros plugins, e é
   este degrau que enxerga um kit instalado do jeito recomendado.

   > **A guarda não é detalhe.** O degrau presume que o pai de `${FLUX_ROOT}` é um diretório de plugins,
   > e só os candidatos 1 a 4 garantem isso. No candidato 5 (checkout local) o pai é o `plugins/` do
   > próprio repo do flux, onde irmão não é plugin de ninguém; no 6 (`${FLUX_HOME}`) o pai é arbitrário,
   > e um `FLUX_HOME=~/flux` transformaria esta origem numa varredura de dois níveis do home inteiro, no
   > Step 0 de **todo** elo. O custo de errar não é só tempo: candidato que ninguém instalou vira
   > `kit ambiguo` no banner, ou seja, ruído vindo de layout de disco.

Em cada raiz, procurar `flux-kit.json` com profundidade máxima de 2 níveis. Nada além do nome do arquivo
é lido nesta fase, e este passo **localiza, não valida**: quem abre o `flux-kit.json` é quem vai usá-lo,
e é lá que os três tokens de kit da tabela do Passo 5 são emitidos (`${FLUX_ROOT}/shared/kit-format.md`,
"Kit inválido" e "Degradação"). O motivo de não validar aqui é que este passo roda no Step 0 de todo elo,
inclusive dos que nunca resolvem kit, e que o matcher precisa do `REPO_SLUG` e do checkout, que ainda
não existem nesta fase.

Nenhuma origem produziu raiz, ou nenhuma raiz tem kit: `KIT_ROOTS` é **vazio**. Isso **não é
degradação e não vai ao banner** — é o caso comum, e uma máquina sem kit se comporta como se comportava
antes de kits existirem. Só os três estados acionáveis da tabela de tokens abaixo são declarados.

> **Por que a busca é por marcador em disco.** Vale aqui o mesmo rigor do Passo 1a: enumerar os
> diretórios de plugin de cada harness nomearia produtos sem poder confirmar nada. O `flux-kit.json` é
> verificável — ou o arquivo está lá, ou não está —, e por isso este passo funciona no harness que ainda
> não existe.

## Passo 2 — Verificar os requisitos declarados

Cada elo declara no frontmatter:

```yaml
requires:
  hard:                          # ausente => UNAVAILABLE, aborta antes de trabalhar
    - file: shared/review-legend.md
    - bin: git
    - agent: ${HOLISTIC}
  soft:                          # ausente => degrada e DECLARA no output
    - bin: gh
    - checkout_local
    - vault
```

Tipos de requisito:

| tipo | como verificar |
|------|----------------|
| `file: <path>` | existe em `${FLUX_ROOT}/<path>` |
| `bin: <nome>` | `command -v <nome>` retorna zero |
| `agent: <nome>` | ver Passo 3 |
| `checkout_local` | o alvo tem checkout local acessível para leitura de contexto |
| `vault` | `VAULT_ROOT` resolvido e o diretório existe |
| `index` | o `flux-agents.json` existe e o `generated_by` é compatível. **Só isso**: o teste de frescor por repo é do elo, no momento em que ele sabe quais repos vai usar, e está em `${FLUX_ROOT}/shared/agents-index.md`. **Sempre `soft`, em elo nenhum `hard`** — nem nos que o escrevem, que abortariam na máquina onde são indispensáveis |
| `mcp: <prefixo>` | as tools daquele prefixo estão disponíveis na sessão |

**Regra de fronteira:**

- Faltou um `hard` → **abortar**. Não produzir artefato parcial, não gravar nada, não postar nada.
- Faltou um `soft` → **seguir**, e declarar a perda no banner do Passo 5.

## Passo 3 — Resolver e VERIFICAR o agente holístico

Este passo existe porque a falha mais perigosa da família é resolver um nome de agente e invocá-lo
sem checar se ele existe. Quando isso acontece, ou a invocação falha no meio do trabalho, ou o
modelo improvisa um parecer inline fora do contrato de saída.

Resolver `HOLISTIC` **nesta ordem**, parando no primeiro que existir:

1. `holistic_reviewer` do `flux-context.json`, quando há manifesto.
2. Override local do repositório: `<repo-checkout>/.claude/agents/reviewer.md`, e depois
   `<repo-checkout>/.cursor/agents/reviewer.md`.
3. Genérico da família, **tentando as formas nesta ordem**: `flux:pr-reviewer`, `flux-pr-reviewer`,
   `pr-reviewer`.

> **Por que várias formas do genérico.** Instalado via marketplace, o agent do plugin é registrado
> **com o prefixo do plugin** (`flux:pr-reviewer`, ou `flux-pr-reviewer` num harness que achata o
> namespace). Num checkout direto (ou com o agent copiado para `~/.claude/agents/` ou
> `~/.cursor/agents/`), ele é `pr-reviewer`, sem prefixo. Todas as instalações são legítimas, então o
> preflight aceita todas e para na primeira que existir. Resolver só a forma sem prefixo faria a
> família abortar em toda instalação por plugin, que é o caminho recomendado do README.

Depois de resolver, **verificar que o agente existe** antes de invocar.

- Existe → seguir.
- Não existe → `UNAVAILABLE`. Abortar nomeando **qual** agente foi procurado e **onde**. Quando o
  que falhou foi o genérico, dizer todas as formas tentadas (`flux:pr-reviewer`, `flux-pr-reviewer`,
  `pr-reviewer`), para que quem instalou de um jeito diferente saiba o que declarar no manifesto.

> **Nunca improvisar um reviewer inline.** Um parecer produzido fora do contrato de saída não é
> comparável com os demais e contamina qualquer métrica de qualidade agregada sobre os artefatos.

### 3-bis — Com o que se verifica, e quem tem direito de verificar

Este passo e o `1a-bis` de `${FLUX_ROOT}/shared/review-agents.md` mandam "verificar que o agente
existe" sem nunca dizer com o quê. A omissão não é inocente: **não há primitiva de shell que responda
se um `subagent_type` está registrado**. Não existe `command -v` para agente. A única fonte é a lista
de agentes que o harness injeta no contexto da sessão, o que faz desta verificação uma
**introspecção**, não uma medição. Duas consequências, e todo o resto do contrato depende das duas.

**Achar o arquivo responde outra pergunta.** Um `ls` em `.claude/agents/` diz que alguém escreveu um
agente, não que este processo consegue invocá-lo. Quem confunde as duas produz a falha do `1a-bis`:
lente listada no banner e nunca executada.

**A lista é da sessão, e a sessão do subagente não é a sua.** Um subagente pode receber um conjunto
diferente de agentes registrados, então uma verificação feita lá dentro não é comparável com a feita
aqui — e nada no output denuncia a divergência.

**O índice não substitui esta introspecção, e não pode ser lido como se substituísse.** O
`flux-agents.json` (`${FLUX_ROOT}/shared/agents-index.md`) diz o que existe em disco e onde — é com
ele que se decide **o que oferecer** quando falta lente. Quem decide **o que rodou** continua sendo a
lista da sessão. Inverter os dois troca uma degradação declarada por um arquivo com cara de
autoridade afirmando cobertura que não houve.

Por isso a verificação é **privilégio da main e acontece uma vez**. A main resolve o holístico,
resolve as lentes, registra as degradações e **desce o resultado já resolvido** dentro do prompt de
cada subagente que despacha, como fato dado. Nenhum subagente re-resolve lente, reconfere registro,
nem decide por conta própria que uma camada está ausente. Um fan-out em que cada braço chega à sua
própria conclusão sobre quais lentes existem emite um banner que não corresponde a execução nenhuma:
nem à da main, nem à de qualquer um dos braços.

Vale para todo despacho da família, inclusive os do
`${FLUX_ROOT}/shared/fanout-discipline.md` que não são de review.

> **Caminhos canônicos do override local:** `<repo-checkout>/.claude/agents/reviewer.md` e
> `<repo-checkout>/.cursor/agents/reviewer.md`, nessa ordem. São os únicos procurados; qualquer outro
> nome de arquivo é ignorado. `.claude/agents/` continua sendo o preferido por ser lido pelos dois
> harnesses — um repo que ponha o override só em `.cursor/agents/` fica sem reviewer contextual no
> Claude Code, e o Passo 3 vai detectar isso (o arquivo existe, o agente não está registrado) e cair
> para o genérico em vez de invocar um agente fantasma.

## Passo 4 — Classificar o nível de capacidade

| nível | condição | comportamento |
|-------|----------|---------------|
| `FULL` | manifesto + specialists disponíveis + checkout local | pipeline completo |
| `REDUCED` | holístico + checkout local, sem specialists | roda; marca o parecer como reduzido |
| `THIN` | só o diff, sem checkout local | roda; **viés obrigatório para `question`** em vez de `request-change` quando o veredito depender de contexto não verificável |
| `UNAVAILABLE` | falta requisito `hard` | **aborta** com instrução acionável |

O nível `THIN` não é licença para adivinhar. Ele existe para tornar explícito um estado que já
ocorre na prática, e a contrapartida é que o elo passa a preferir perguntar a afirmar.

## Passo 5 — Banner de perfil (obrigatório em todo output)

Todo elo abre seu output com o banner. Ele não é decoração: é o que impede um parecer degradado de
se passar por um parecer completo.

**Copiar o gabarito abaixo VERBATIM, cercas incluídas**, trocando só o que está entre chaves. As
cercas ```` ``` ```` fazem parte do que se emite, não são formatação deste documento.

````
```
perfil: {nome do manifesto | generico}{ (ancora: alvo <path>)} · nivel: {FULL|REDUCED|THIN} · holistico: {agente}
lentes: L1 {agente} · L2 {lista|ausente|inalcancavel} · L3 {lista|ausente|inalcancavel}
degradacoes: {lista dos soft ausentes e o que se perde com cada um | nenhuma}
```
````

### Tokens canônicos de `degradacoes:`

A linha `lentes:` tem enum fechado (`{lista|ausente|inalcancavel}`). Tudo que qualifica uma lente sem
ser um desses três estados vai para `degradacoes:`, e **com a grafia desta tabela** — um token de
banner escrito de três jeitos em quatro arquivos deixa de ser legível de relance, que é a única coisa
que o banner precisa ser.

| token | quando | quem emite |
|-------|--------|-----------|
| `L3 stale` | a lente L3 roda por espelho (degrau 1 da escada) e a origem mudou desde `synced_from_sha256` | o elo que resolveu as lentes |
| `indice ausente` | não há `flux-agents.json` na raiz de agents | idem |
| `indice stale` | há índice, e ele não passou o teste de frescor | idem |
| `kit ambiguo` | N kits, **já filtrados por `provides`** (a contagem é sempre depois do filtro), casaram com o mesmo repo, e ambiguidade não se resolve por adivinhação (`${FLUX_ROOT}/shared/kit-format.md`) — sai com a lista dos candidatos | o elo que **consome** `KIT_ROOTS`: hoje, só o degrau 4 da cascata de L2 (`${FLUX_ROOT}/shared/review-agents.md`), na leitura. **Na escrita: não implementado** (LAB-71) |
| `kit invalido` | há `flux-kit.json` e ele não vale pela seção "Kit inválido" de `${FLUX_ROOT}/shared/kit-format.md`, que é a fonte única do que invalida — sai com o path e o motivo | idem |
| `kit nao avaliado` | o kit casa por arquivo (`files`/`any_of`) e não há checkout local para testar | idem |

**Kit ausente ou não aplicável não é degradação e não vai ao banner.** É o caso comum, e declará-lo
encheria de ruído o banner de toda máquina que não usa kit. Só os três estados de kit acima são
acionáveis, e só o que é acionável se declara.

Os três tokens de índice (`L3 stale`, `indice ausente`, `indice stale`) acompanham a oferta
correspondente (`${FLUX_CMD}equip <repo> --expose-l3`, `${FLUX_CMD}map`) e **nenhum deles aborta**: os
elos caem para a varredura direta, que é o comportamento que existia antes do índice. Os três de kit não
acompanham oferta e também não abortam.

> **O emissor dos três de kit é um só, e é da leitura.** No caminho de escrita, o verbo de preparo
> resolve `<ref>` como caminho: ele não roda matcher (logo não alcança `kit ambiguo` nem
> `kit nao avaliado`) e **aborta** diante de kit inválido em vez de declará-lo. Por isso a coluna diz
> "não implementado" em vez de nomeá-lo: creditar emissor a quem não emite é o mesmo defeito que este
> parágrafo existe para evitar.

> **Um estado que só existe no shared não é emitido.** Os três tokens de índice nasceram descritos em
> `${FLUX_ROOT}/shared/agents-index.md` e em `${FLUX_ROOT}/shared/review-agents.md`, e sem esta tabela
> nenhum elo teria de onde copiá-los na hora de emitir — o mesmo motivo pelo qual o gabarito do banner
> é repetido no corpo de cada verbo.

> **`ausente` e `inalcancavel` não são sinônimos**, e a distinção está no contrato de
> `${FLUX_ROOT}/shared/review-agents.md` (passo 1a-bis). `ausente` é não existir suite para o repo.
> `inalcancavel` é a suite existir em disco e não ser invocável, tipicamente porque o `name:` do
> frontmatter não está registrado como `subagent_type` nesta instalação. Só entra em `lentes:` como
> nome de agente o que foi de fato **invocado**; achado e não invocado vai para `degradacoes`, com o
> motivo. Um banner que lista uma lente que não rodou é pior que um banner sem a lente, porque
> promete cobertura que não houve.

> **O gabarito também mora no corpo de cada elo, e isso não é duplicação por descuido.** Este passo
> rege as **regras** (quais campos, quando degradar, o que cada nível significa); o gabarito repetido
> no elo é o que garante que o template esteja em contexto **na hora de emitir**. Um elo que só
> referencia este arquivo improvisa: inventa campos, omite o `nivel`, e o banner deixa de cumprir a
> função. Foi observado nos elos — o único que acertava era o único que carregava o gabarito.
> Ao mudar o formato aqui, propagar para **todos** os verbos de `skills/`.

> **Por que a cerca é obrigatória, e não estilo.** As três linhas são separadas por quebra simples.
> Em markdown, quebra simples não quebra linha: as três viram um parágrafo corrido, `perfil` e
> `degradacoes` grudam numa frase só, e o banner perde exatamente o que o justifica, que é ser lido
> de relance. Já aconteceu em produção. Emitir as linhas soltas e confiar no renderizador **não
> funciona** — em nenhum dos harnesses.

O trecho `(ancora: alvo <path>)` sai **só quando a âncora não é o `cwd`**, ou seja, quando o perfil
veio do alvo. É o que torna auditável a pergunta "por que este elo rodou no contexto X se eu o chamei
de Y", que sem isso é indistinguível de um bug.

A linha `lentes` sai em todo elo que reconcilia review (`flux:review`, `flux:iterate`, `flux:land`)
**e também no `flux:build`**, com as três camadas de `${FLUX_ROOT}/shared/review-agents.md`. O build
não usa as lentes para executar, mas é frequentemente o primeiro elo a tocar um repo novo, e é onde
se descobre que ele está sem cobertura: sem a linha, a oferta de `${FLUX_CMD}equip` no fim chegaria
sem contexto nenhum. Ela sai também no **`flux:equip`**, onde o inventário das camadas é o próprio
produto do diagnóstico (e onde o campo `holistico:` não entra, porque o verbo não revisa).
**Camada ausente é
declarada, nunca omitida**: é a diferença entre "o repo não tem specialists" e "eu não procurei".

### Campos que não são de todos os elos

O gabarito acima é o **mínimo comum**. Três campos existem só onde há o que declarar, e estão listados
aqui para que nenhum elo os invente e nenhum elo com direito a eles os omita:

| campo | quem emite | o que declara |
|-------|-----------|---------------|
| `holistico:` | todos, **menos** `flux:build`, `flux:equip`, `flux:map`, `flux:refine` e `flux:reply` | o agente da lente L1, quando o elo resolve um |
| `motor:` | `flux:build` e `flux:equip` | `{nativo <cmd> \| exec_fallback <cmd> \| autonomo \| ausente}` |
| `destino:` | `flux:equip` e `flux:map` | `{path canonico aprovado \| nao resolvido}` |

`motor:` existe nesses dois porque são os únicos que têm relação com o motor de execução: o `build` o
**escolhe** (`${FLUX_ROOT}/skills/build/SKILL.md`, Step 2), o `equip` o **produz**. Nos dois casos,
qual motor rodou (ou faltou) é a informação que muda como se lê o resultado — um build em modo
autônomo rodou sem os gates do repo, e quem lê precisa saber disso de relance.

`destino:` existe nesses dois porque são os únicos cujo entregável é **um caminho no disco de alguém**
— a suite ou o motor, no `equip`; o índice, no `map`. Um elo que escreve fora do repo e não diz onde obriga o usuário a caçar o que apareceu;
enquanto o gate de destino não tiver acontecido, o campo sai como `nao resolvido`, que é a verdade
naquele instante e não uma omissão.

A regra do parágrafo abaixo vale para estes campos com a mesma força: um elo que só referencia este
arquivo inventa campos. Ao acrescentar, remover ou renomear qualquer um deles, propagar para **todos**
os verbos que o emitem — e esta tabela é a lista de quem são.

Exemplo em máquina sem configuração alguma:

```
perfil: generico · nivel: THIN · holistico: pr-reviewer
lentes: L1 pr-reviewer · L2 ausente (perfil sem specialists_root) · L3 ausente (repo sem agents de review)
degradacoes: sem checkout local (contexto arquitetural nao verificavel; findings dependentes de
contexto saem como question); sem vault (parecer nao persiste)
```

Exemplo num repo que tem suite própria mas nenhuma suite curada:

```
perfil: pessoal · nivel: REDUCED · holistico: pr-reviewer
lentes: L1 pr-reviewer · L2 ausente (sem suite curada para 'aiterm') · L3 ausente (repo sem agents de review)
degradacoes: sem specialists (scouters e auditors de dominio nao rodam; a review cobre o
cross-cutting mas nao os padroes especificos do repo) — rode /flux:equip --agents-only
```

> **Os dois blocos acima são output renderizado, não gabarito.** Por isso o comando neles aparece
> **já resolvido** (`/flux:equip --agents-only`), e não como `${FLUX_CMD}equip`: é exatamente o que o
> usuário leria na tela daquela máquina. Um exemplo que mostrasse o placeholder ensinaria a emitir o
> placeholder, que é o defeito que a "Regra de escrita" do Passo 1b existe para evitar. Nos gabaritos
> — os blocos que se copiam verbatim —, `${FLUX_CMD}` continua sendo o certo.

Quando o nível for `FULL` e não houver degradação, o banner ainda assim é impresso. A consistência é
o que permite comparar execuções.

## Formato da mensagem de abortagem

Ao abortar, dizer o que falta, onde foi procurado e o que fazer. Nunca abortar com mensagem genérica.

**Copiar o gabarito VERBATIM, cercas incluídas** (mesmo motivo do banner, no Passo 5): as cercas
```` ``` ```` fazem parte do que se emite. Uma lista de requisitos faltando, colada num parágrafo só,
é ilegível justo no momento em que o usuário mais precisa ler rápido.

A primeira linha **nomeia o elo com `${FLUX_CMD}` já substituído** — `/flux:reply` num harness,
`/flux-reply` em outro. Nunca escrever `flux:` literal aqui: quem lê um abort é quem vai reinvocar o
comando.

````
```
${FLUX_CMD}{verbo} nao pode rodar de forma confiavel.

Faltando (hard):
  - agent: pr-reviewer          procurado em ~/.claude/agents/, ~/.cursor/agents/ e no plugin
  - file: shared/review-legend.md   procurado em {FLUX_ROOT}/shared/

Como resolver:
  - instale a familia flux: (ver README do repo)

Nada foi lido, gravado ou postado.
```
````

A última linha importa: quem recebeu um abort precisa saber que nenhum efeito colateral ocorreu.
