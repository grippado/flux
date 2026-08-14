# Contrato de agentes de review — descoberta + reconciliação

> Fonte única da mecânica das **três lentes** (holístico + specialists locais + specialists do repo),
> reconciliadas numa review só. Referenciada por
> `flux:review`, `flux:iterate` e `flux:land`. **Não duplicar esta lógica** dentro dos comandos —
> apontar para cá e declarar só os parâmetros específicos (inputs, o que fazer com o `FINAL_REPORT`).
>
> Isto substitui o antigo pipeline `--agents-on` / benchmark mode: os agentes agora rodam **por
> default**, e em vez de *comparar* baseline vs agents o fluxo **reconcilia** as duas revisões numa só.

## Princípio

Toda review madura soma **três lentes**, e elas são cumulativas: nenhuma substitui a outra.

| # | lente | o que é | onde vive |
|---|-------|---------|-----------|
| **L1** | **Holístico** | um reviewer sênior que lê o diff inteiro + checkout + docs e cobre correção, arquitetura, testes, observabilidade, segurança, tipos, breaking change. Enxerga o cross-cutting, não conhece a fundo cada padrão de domínio. | `<HOLISTIC>` do perfil |
| **L2** | **Specialists locais** | a suite que **você** cura por repo (Zod schemas, hooks/service, POM de e2e, contratos, a11y, boundaries de módulo). Vive fora do repo, então evolui no teu ritmo e não depende de PR no projeto. | `<SPECIALISTS_ROOT>`, path do perfil |
| **L3** | **Specialists do repo** | os agents de review que o **próprio repositório** versiona no `.claude/agents/`. Conhecimento do time que mantém o código. | `<repo-checkout>/.claude/agents/` |

**L1 sempre roda.** Não é fallback de nada: é a lente de síntese, e sem ela uma review vira um
apanhado de fatias sem visão de conjunto. Quando não há L2 nem L3, ele é tudo que se tem, e o elo
oferece criar a suite local — oferta cujo contrato é `${FLUX_ROOT}/shared/bootstrap-specialists.md`
e cuja execução é do `${FLUX_CMD}equip <repo> --agents-only`.

**União, nunca ou/ou.** Havendo L2 **e** L3, rodam as duas. Um repo pode ter suite curada por você e
suite própria do time, e as duas veem coisas diferentes: descartar uma porque a outra existe é perda
de cobertura silenciosa.

O comando roda o que existir e **reconcilia**: união dos findings, sem perder nada, com precedência
por domínio e proveniência anotada. `--solo` desliga L2 e L3 e roda só o holístico.

**Degradação é normal, não é erro.** Um repo sem L2 e sem L3 roda com L1 sozinho e produz uma review
válida. O que nunca acontece é degradar em silêncio: o banner de perfil (`preflight.md`, Passo 5)
declara quais camadas rodaram e quais faltaram, e o comando oferece o `${FLUX_CMD}equip` para criar
a que falta.

## Resolução de contexto

Antes de tudo, resolver o perfil de contexto conforme `${FLUX_ROOT}/shared/flux-context.md` (holistic
reviewer, doc reviewer, raiz dos specialists, repos conhecidos, vault). Os nomes de agente abaixo
(`<HOLISTIC>`, `<SPECIALISTS_ROOT>`) vêm desse perfil. Num perfil declarado resolvem para o reviewer
e a raiz de specialists locais do time; sem manifesto, `<HOLISTIC>` cai no genérico da família
(`flux:pr-reviewer` ou `pr-reviewer`, ver `preflight.md` Passo 3) e L2 fica ausente.

> **L3 independe do perfil.** Os agents de review do próprio repo são descobertos sempre, com ou sem
> manifesto. Eles não são o *fallback* de L2: são uma lente própria, que soma.

## Passo 1 — Descobrir specialists (L2 e L3)

```bash
REPO_SLUG=$(gh repo view --json name -q .name)   # ou derivar do git remote / cwd
```

As duas buscas abaixo são **independentes e cumulativas**. Rodar as duas sempre; o resultado de uma
não cancela a outra.

### 1a — L2, specialists locais

Resolver o caminho **nesta ordem**, parando no primeiro que existir:

1. `<SPECIALISTS_ROOT>` do perfil, com `{repo}` substituído pelo `REPO_SLUG`.
2. `<KITS_ROOT>` do perfil, com `{repo}` substituído pelo `REPO_SLUG` — degrau 3 da cascata de
   destino (`${FLUX_ROOT}/shared/write-destination.md`).
3. A entrada de `write_destinations` do manifesto **cujo `repos` contém o `REPO_SLUG`**, quando houver
   — é onde a suite de fato nasceu se o usuário ditou outro caminho no gate de destino. A chave da
   entrada é o diretório canônico; o `repos` é o que diz de quem ela é. Mais de uma entrada
   reivindicando o mesmo slug → **ambíguo**, e ambíguo não se resolve por adivinhação: tratar como
   ausente e dizer no banner.
4. `~/.claude/flux-specialists/<REPO_SLUG>/repo-owner.md` — o default da família, e o destino que o
   `flux:equip` propõe como recomendado quando não há manifesto
   (ver `${FLUX_ROOT}/shared/bootstrap-specialists.md`).

**Cada degrau resolve para um diretório, e o arquivo é anexado depois.** É a mesma normalização do
contrato de destino, aplicada aqui: valor terminado em `.md` (o caso do template de
`specialists_root`, e o do default acima) **já nomeia o orquestrador** e é usado tal como está; valor
que é diretório (o caso de `kits_root` e o das entradas de `write_destinations`) recebe
`/repo-owner.md`, que é o nome com que o Bootstrap escreve o orquestrador. Sem essa regra os degraus
2 e 3 apontariam para um diretório e o passo 1a-bis mandaria ler o frontmatter dele.

Achou → seguir para o passo 1a-bis. Não achou → **ausente**.

> **Por que os níveis 2, 3 e 4 existem.** Sem eles, uma suite gerada pelo `flux:equip` fora de
> `specialists_root` seria escrita em disco e **nunca carregada**: o elo ofereceria criá-la de novo a
> cada review, para um repo que já tem uma. Descoberta e escrita têm que olhar para o mesmo lugar — e
> é por isso que esta lista é a cascata de destino na **mesma ordem** (`specialists_root` → `kits_root`
> → o que o gate aprovou → default da família), com o degrau de perguntar omitido, porque descobrir
> não pergunta nada.

### 1a-bis — O arquivo existir não é o mesmo que o agente ser invocável

**Achar o arquivo não basta, e tratar como se bastasse é a falha silenciosa mais cara deste
contrato.** O que se resolve no passo 1a é um **caminho**; o que a Task tool aceita é um **nome
registrado** (`subagent_type`). Um não vira o outro sozinho.

Resolver o nome, nesta ordem:

1. O campo `name:` do frontmatter do arquivo achado. **É ele a identidade**, não o nome do arquivo:
   os dois podem divergir, e quando divergem quem vale é o `name:`.
2. Sem `name:` no frontmatter, o agente **não é invocável**. Não inventar um nome a partir do path.

Com o nome em mãos, **conferir que ele está registrado na sessão** antes de declarar a lente
disponível. Não está → o estado não é `ausente`, é **`inalcançável`**, e os dois são coisas
diferentes que precisam aparecer diferentes no banner:

```
degradacoes: L2 inalcancavel — <path> existe e declara `name: <nome>`, mas <nome> nao esta
             registrado como subagent_type nesta instalacao (o arquivo nao esta sob
             ~/.claude/agents/ nem sob <repo>/.claude/agents/)
```

A primitiva com que se confere isso, e quem na família tem direito de conferir, estão em
`${FLUX_ROOT}/shared/preflight.md`, Passo 3-bis. Em resumo: não existe `command -v` para agente, a
fonte é a lista de agentes da sessão, e quem verifica é a main, uma vez só.

**Registrado com este nome não é o mesmo que registrado a partir deste arquivo.** O gate acima
compara uma string; a pergunta é de identidade. Dois arquivos podem declarar o mesmo `name:`, e nesse
caso o harness carrega um só, sem precedência definida — então o nome aparecer na lista **não prova**
que o agente por trás dele é o que você achou em disco.

Este falso positivo é mais caro que o falso negativo que a seção documenta acima. O agente errado é
invocado, devolve findings plausíveis, e o banner registra uma verdade formal (`rodou <nome>`) sobre
um parecer que leu o repo com o conhecimento de outro. Nada no output denuncia.

Antes de declarar disponível, confrontar o que o registro descreve com o frontmatter do arquivo
achado — `description` e escopo declarado. Bate → disponível. Não bate, ou não há como saber →
**inalcançável por colisão de nome**, nunca disponível.

> **Também não é hipotético.** Um `<repo>/.claude/agents/module-boundary-auditor.md` e um
> `module-boundary-auditor` registrado vindo da suite curada de **outro** repo satisfazem os dois o
> gate de string. O que roda contra o diff é o auditor do repo errado, e o rodapé de cobertura
> declara a lente como coberta.

**Nunca declarar `lentes: L2 <nome>` para um agente que não se conseguiu invocar.** O banner existe
para impedir que uma execução degradada se passe por completa, e uma lente listada e não executada é
exatamente isso.

**Não improvisar com `general-purpose` carregando o corpo do specialist como prompt.** É tentador e
parece equivalente, mas não é: o resultado deixa de ser comparável com o de uma execução normal, e o
banner passaria a mentir de um jeito mais difícil de detectar. Registrar a degradação e seguir com o
que existe.

**O que fazer com a informação, no fechamento do elo:** um `inalcançável` é acionável e um `ausente`
não é. Ausente pede `${FLUX_CMD}equip --agents-only` (criar a suite). Inalcançável **não pede criar
nada**, porque a suite já existe e o trabalho de escrevê-la já foi feito — mas o que ele pede depende
da **causa**, e são três, com remediações que não se substituem:

| causa | como se reconhece | o que oferecer |
|---|---|---|
| **fora de diretório varrido** | o arquivo não está sob `~/.claude/agents/` (subdiretórios incluídos) nem sob `<repo>/.claude/agents/` — vive num repositório de dotfiles, por exemplo | expor, tipicamente por symlink, com **nome único entre todas as suites** |
| **âncora fora do repo** | o arquivo está no lugar canônico `<repo>/.claude/agents/`, e a sessão subiu num diretório **acima** do repo, que é o que um harness não varre | reinvocar o elo com a sessão ancorada no repo. **Nada a mexer em disco** |
| **colisão de `name:`** | o nome está registrado, e o que ele descreve é outro escopo (bloco anterior) | renomear com prefixo do repo, **do lado da suite que você cura** |

**Symlink não é remédio universal, e oferecê-lo como tal causa dano.** Na segunda linha da tabela o
arquivo está exatamente onde deveria estar: o que falta é a sessão, não a instalação. Symlinkar os
agents de um repositório para `~/.claude/agents/` promove nomes genéricos como `reviewer`,
`patterns`, `structural` ou `test-coverage` a nomes globais, e **fabrica a terceira causa da tabela**
em todos os outros repos da máquina — trocando uma degradação declarada por um falso positivo mudo.

> **Isto não é hipotético.** Um perfil com `specialists_root` apontando para uma suite de 9 agentes,
> todos em disco e nenhum registrado, produziu por semanas banners dizendo `L2 disponível` e reviews
> rodando só com o holístico. O teste de existência passava, a invocação nunca acontecia, e nada no
> output denunciava a diferença.

### 1b — L3, specialists do repo

Varrer `<repo-checkout>/.claude/agents/**.md` e **filtrar por intenção de review**. Um agent entra em
L3 quando satisfaz **qualquer** critério:

- está em `<repo-checkout>/.claude/agents/review/`;
- o nome do arquivo casa `reviewer`, `review`, `audit`, `auditor`, `scout`, `scouter`, `critic`,
  `repo-owner` — o último porque orquestrador de suite é o alvo **preferencial** desta lente e era o
  único que escapava do critério mais barato, entrando só pela leitura de frontmatter;
- a `description` do frontmatter declara análise **read-only** de código (revisar, auditar, inspecionar,
  diagnosticar) sem escrever;
- as `tools` do frontmatter não incluem `Edit`/`Write`/`NotebookEdit` **e** a descrição é de análise.

> **Por que o filtro existe.** Um `.claude/agents/` de repo normalmente mistura agents de review com
> agents de **execução** (`implementation.md`, `test-runner.md`, `db-migrations.md`, `executor.md`,
> `backend-dev.md`). Invocar um agent de execução dentro de um review não produz uma review ruim:
> produz efeito colateral no repo. **Na dúvida, ficar de fora.**

Se o repo tem um orquestrador único, preferi-lo e deixar que ele resolva os próprios subordinados, em
vez de invocar os agents individualmente. **Havendo mais de um candidato a orquestrador** — o caso
comum é `repo-owner.md` e `reviewer.md` coexistindo na raiz de `agents/` —, desempatar assim:

1. O que a `description` declarar como orquestrador (despacha specialists, sintetiza um relatório
   único) vence o que se descreve como reviewer de diff.
2. Persistindo o empate, `repo-owner.md` vence: é o nome com que a família escreve orquestrador
   (`${FLUX_ROOT}/shared/bootstrap-specialists.md`), e `reviewer.md` é também o nome do **override do
   holístico** do Passo 3 do preflight, então pode já estar rodando como L1.
3. Continuando ambíguo, **não escolher**: invocar os specialists individualmente e registrar a
   ambiguidade no banner. Errar o orquestrador roda a suite inteira pela cabeça errada.

**Registrar os excluídos.** Guardar a lista dos agents que existiam e não passaram no filtro, para o
banner. O usuário precisa poder discordar do filtro sem ter que ler o diretório na mão.

**O que não é agent não entra na lista de excluídos.** A varredura é `**.md`, então ela pega também
os arquivos que o diretório usa para outra coisa — `AGENT.md`, `README.md`, `CLAUDE.md`, um índice da
suite. Eles não têm `name:` porque não pretendem ser invocáveis, e listá-los como "excluídos" enche o
banner de ruído justamente onde ele precisa ser lido de relance. Excluído é agent candidato que ficou
de fora; o resto simplesmente não é candidato.

**O mesmo gate do 1a-bis vale aqui**, e a probabilidade de L3 ficar inalcançável **depende inteiramente
de onde a sessão subiu**. Ancorada no repo, agents de projeto são carregados pelo harness e L3
raramente falha. Ancorada acima dele — o caso de quem trabalha num diretório de workspace com vários
repos dentro —, o `.claude/` do repo alvo **não é carregado**, e aí L3 não é raramente inalcançável:
é sempre. É a segunda linha da tabela de causas, e é o estado normal de um elo rodando em modo
workspace, não uma anomalia de instalação.

Ainda assim, um arquivo sem `name:` no frontmatter não é invocável, e entra na lista dos excluídos
com esse motivo, não como "não passou no filtro de intenção" — desde que seja um agent candidato, e
não um dos arquivos-que-não-são-agent do parágrafo acima.

### 1c — Consolidar

```
LENTES = [L1] + ([L2] se INVOCÁVEL) + ([L3...] se INVOCÁVEIS)
```

Note o critério: **invocável**, não "existe". Um specialist que foi achado em disco e não pôde ser
invocado não entra em `LENTES`, entra em `degradacoes`.

**Fallback gracioso.** Sem L2 e sem L3, avisar no banner
(`sem specialists para <REPO_SLUG>: seguindo com o reviewer holístico sozinho`), pular o passo 2b e
seguir. Nunca travar por ausência de specialists.

**Os três estados, e eles não colapsam:**

| estado | significado | o que o banner diz | o que o elo oferece no fim |
|---|---|---|---|
| **disponível** | achado e invocável | `lentes: L2 <nome>` | nada |
| **ausente** | não há suite para este repo | `L2 ausente` | `${FLUX_CMD}equip --agents-only` (criar a suite) |
| **inalcançável** | a suite existe e não é invocável | `L2 inalcancavel — <motivo>` | o que a **causa** pedir (tabela do 1a-bis): expor, reancorar a sessão, ou desfazer colisão de nome |

Colapsar `inalcançável` em `ausente` faz o elo oferecer **criar de novo** uma suite que já foi
escrita, que é o mesmo erro que os níveis 2 a 4 do passo 1a existem para evitar, um degrau acima. Colapsar
em `disponível` é pior: promete uma cobertura que não houve.

Com `--solo`, pular este passo inteiro e o 2b, independentemente do que exista.

## Passo 2 — Rodar as lentes (em paralelo, via Task tool ou subagentes nativos do Codex)

- **2a — L1, holístico.** Task com `subagent_type: <HOLISTIC>` passando os inputs base do comando
  (diff, commits, metadados, checkout, revisões anteriores, threads). Guardar como `HOLISTIC_REPORT`.
- **2b — L2, specialists locais.** Task com o orquestrador de `SPECIALISTS_L2` passando diff +
  metadados (+ threads abertas, no caso do iterate). Ele orquestra os próprios specialists e devolve
  findings brutos por domínio (`[arquivo:linha] SEVERITY — descrição` + lista "specialists run").
  Guardar como `L2_REPORT`.
- **2c — L3, specialists do repo.** Mesma mecânica, com os agents descobertos em 1b. Havendo
  orquestrador único no repo, uma Task só; havendo agents soltos, uma Task por agent, em paralelo.
  Guardar como `L3_REPORT`.

**Todas as Tasks do passo 2 vão num único bloco, concorrentes** (regra pétrea de
`${FLUX_ROOT}/shared/fanout-discipline.md`). Esperar todas antes de reconciliar. Uma lente que falha
não derruba as outras: reconciliar o que voltou e registrar a falha **no rodapé de cobertura** do
Passo 4, que é onde ela cabe. O banner de abertura já foi impresso quando esta falha acontece.

## Passo 3 — Reconciliar (substitui o benchmark)

Fundir `HOLISTIC_REPORT` + `L2_REPORT` + `L3_REPORT` num único `FINAL_REPORT`:

1. **Chave de dedup:** `(arquivo, linha/bloco, tema)`. Findings que batem na chave são o mesmo finding.
2. **União, não interseção:** nenhum finding é descartado por aparecer em só uma das lentes. O que só
   o holístico viu entra; o que só um specialist viu entra.
3. **Precedência por domínio, quando duas lentes falam do mesmo ponto** (regra primária):
   - Claim de **domínio específico** (Zod/schema, hook/service, POM, contrato HTTP/tRPC, rota,
     segurança da stack) → vence a redação do **specialist** (mais preciso).
   - Claim **cross-cutting** (arquitetura, cobertura de teste, observabilidade, design geral) → vence
     a redação do **holístico**.
   - Quando corroboram, manter um único finding e anotar `(corroborado por <lente/specialist>)` no
     corpo. Quando se contradizem, manter como `question` explicitando a divergência.
4. **Ordem das lentes como desempate** (regra secundária), quando o domínio não decide, o tema é
   ambíguo, ou duas lentes dizem a mesma coisa com redações incompatíveis:

   ```
   L2 (specialists locais)  >  L3 (specialists do repo)  >  L1 (holístico)
   ```

   **O holístico é o último no desempate, e isso não o torna o menos importante.** Ele é a única
   lente que enxerga cross-cutting e a única que sintetiza, por isso **sempre roda**. Mas quando ele
   e um specialist falam do mesmo ponto, quem conhece o domínio estreito escreve melhor sobre ele:
   um specialist de schema é mais confiável que o holístico numa questão de schema, e essa é a razão
   de ter specialist.

   **L2 na frente de L3** porque a suite local é curada por você, evolui no seu ritmo e você responde
   por ela; a do repo evolui no ritmo do projeto e pode estar desatualizada sem aviso.

   **Desempate decide redação, nunca existência**: o finding perdedor não some, é absorvido pelo
   vencedor com a proveniência anotada.
5. **Mapear severidade → badge** conforme `${FLUX_ROOT}/shared/review-legend.md`. Os specialists usam
   `CRITICAL/IMPORTANT/NOTE`; mapear: `CRITICAL → request-change` (ou `breaking-change` se for
   contrato), `IMPORTANT → question` ou `suggestion` conforme bloqueie ou não, `NOTE → note`.
6. **Escopo:** finding em arquivo fora do diff da PR entra como `note` marcada `[dívida pré-existente]`,
   nunca como blocker da PR corrente.

O `FINAL_REPORT` resultante segue o mesmo formato de output do reviewer holístico (seções
`SUMARIO / COMENTARIOS / CHECKLIST / VEREDITO / STATUS / PRIORIDADE`). **O corpo de cada finding
reconciliado abre com o banner-imagem do badge** (ver `${FLUX_ROOT}/shared/review-legend.md` — Banner do
badge: é imagem `[![...]...]`, nunca link de texto `[...]()`, senão sai sem cor na PR).

## Passo 4 — Cobertura (substitui a seção Benchmark)

O comando anexa ao artefato um rodapé de proveniência (não um comparativo):

```markdown
## Cobertura

| lente | resolvida | invocada | devolveu findings |
|---|---|---|---|
| **L1 holístico** | <HOLISTIC> | sim/não | sim/não/vazio |
| **L2 specialists locais** | <nome, ou "ausente — repo sem suite curada", ou "inalcancavel — <causa>"> | | |
| **L3 specialists do repo** | <lista, ou "ausente — repo sem agents de review", ou "inalcancavel — <causa>"> | | |

- **Fora do filtro (L3):** <agents do repo excluídos por serem de execução, ou "nenhum">
```

**O rodapé é obrigatório sempre**, e não só quando faltou camada. Ele é a **verdade final** da
execução, enquanto o banner de abertura é a **intenção**: o banner sai antes do Passo 2, então ele
não pode saber o que aconteceu depois dele. Uma lente que foi resolvida e invocada e cujo agent
estourou, voltou vazio ou não devolveu findings **não aparece em lugar nenhum** se a única declaração
for a de abertura — e o `Passo 2` manda registrar essa falha justamente num banner que já foi
impresso.

Por isso as três colunas são distintas e nenhuma implica a seguinte. **Resolvida** é ter nome e
caminho. **Invocada** é a Task ter sido despachada e retornado. **Devolveu findings** distingue o
specialist que analisou e não achou nada (resultado legítimo) do que falhou em silêncio (resultado
nenhum) — os dois produzem zero findings no `FINAL_REPORT` e significam coisas opostas.

Quando o rodapé contradisser o banner de abertura, **o rodapé vence**, e a contradição é declarada
ali mesmo em vez de reescrever o banner: o que aconteceu entre um e outro é informação, não erro de
digitação.

Uma review que rodou com uma lente a menos e não diz isso é pior do que uma review que não rodou:
ela parece completa.

Sem `## Benchmark`, sem tabela "só_agents / só_baseline / ambos". A reconciliação já é o produto.
