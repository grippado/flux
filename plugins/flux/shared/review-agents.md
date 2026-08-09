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
oferece criar a suite local (ver `${FLUX_ROOT}/shared/bootstrap-specialists.md`).

**União, nunca ou/ou.** Havendo L2 **e** L3, rodam as duas. Um repo pode ter suite curada por você e
suite própria do time, e as duas veem coisas diferentes: descartar uma porque a outra existe é perda
de cobertura silenciosa.

O comando roda o que existir e **reconcilia**: união dos findings, sem perder nada, com precedência
por domínio e proveniência anotada. `--solo` desliga L2 e L3 e roda só o holístico.

**Degradação é normal, não é erro.** Um repo sem L2 e sem L3 roda com L1 sozinho e produz uma review
válida. O que nunca acontece é degradar em silêncio: o banner de perfil (`preflight.md`, Passo 5)
declara quais camadas rodaram e quais faltaram, e o comando oferece o Bootstrap para criar a que
falta.

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
2. `~/.claude/flux-specialists/<REPO_SLUG>/repo-owner.md` — o default da família, e o mesmo destino
   que o Bootstrap usa quando não há manifesto (ver `${FLUX_ROOT}/shared/bootstrap-specialists.md`).

Achou → seguir para o passo 1a-bis. Não achou → **ausente**.

> **Por que o nível 2 existe.** Sem ele, uma suite gerada pelo Bootstrap no perfil genérico seria
> escrita em disco e **nunca carregada**: o elo ofereceria criá-la de novo a cada review, para um repo
> que já tem uma. Descoberta e escrita têm que olhar para o mesmo lugar.

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

**Nunca declarar `lentes: L2 <nome>` para um agente que não se conseguiu invocar.** O banner existe
para impedir que uma execução degradada se passe por completa, e uma lente listada e não executada é
exatamente isso.

**Não improvisar com `general-purpose` carregando o corpo do specialist como prompt.** É tentador e
parece equivalente, mas não é: o resultado deixa de ser comparável com o de uma execução normal, e o
banner passaria a mentir de um jeito mais difícil de detectar. Registrar a degradação e seguir com o
que existe.

**O que fazer com a informação, no fechamento do elo:** um `inalcançável` é acionável e um `ausente`
não é. Ausente pede Bootstrap (criar a suite). Inalcançável pede **instalação**, porque a suite já
existe e o trabalho de escrevê-la já foi feito. Ofereça o caminho certo:

- Suite sob um diretório que o harness varre (`~/.claude/agents/`, incluindo subdiretórios) → conferir
  se o `name:` está lá e se não colide com outro agente de mesmo nome.
- Suite fora desses diretórios (num repositório de dotfiles, por exemplo) → ela precisa ser exposta,
  tipicamente por symlink, e **o nome precisa ser único entre todas as suites**, porque a identidade é
  o `name:` e não o caminho: dois arquivos com o mesmo `name` fazem o harness carregar só um, sem
  precedência definida.

> **Isto não é hipotético.** Um perfil com `specialists_root` apontando para uma suite de 9 agentes,
> todos em disco e nenhum registrado, produziu por semanas banners dizendo `L2 disponível` e reviews
> rodando só com o holístico. O teste de existência passava, a invocação nunca acontecia, e nada no
> output denunciava a diferença.

### 1b — L3, specialists do repo

Varrer `<repo-checkout>/.claude/agents/**.md` e **filtrar por intenção de review**. Um agent entra em
L3 quando satisfaz **qualquer** critério:

- está em `<repo-checkout>/.claude/agents/review/`;
- o nome do arquivo casa `reviewer`, `review`, `audit`, `auditor`, `scout`, `scouter`, `critic`;
- a `description` do frontmatter declara análise **read-only** de código (revisar, auditar, inspecionar,
  diagnosticar) sem escrever;
- as `tools` do frontmatter não incluem `Edit`/`Write`/`NotebookEdit` **e** a descrição é de análise.

> **Por que o filtro existe.** Um `.claude/agents/` de repo normalmente mistura agents de review com
> agents de **execução** (`implementation.md`, `test-runner.md`, `db-migrations.md`, `executor.md`,
> `backend-dev.md`). Invocar um agent de execução dentro de um review não produz uma review ruim:
> produz efeito colateral no repo. **Na dúvida, ficar de fora.**

Se o repo tem um orquestrador único (`reviewer.md` na raiz de `agents/`), preferi-lo e deixar que ele
resolva os próprios subordinados, em vez de invocar os agents individualmente.

**Registrar os excluídos.** Guardar a lista dos agents que existiam e não passaram no filtro, para o
banner. O usuário precisa poder discordar do filtro sem ter que ler o diretório na mão.

**O mesmo gate do 1a-bis vale aqui**, com uma diferença de probabilidade: agents versionados no
próprio repositório costumam ser registrados pelo harness por serem agents de projeto, então L3
raramente fica inalcançável. Ainda assim, um arquivo sem `name:` no frontmatter não é invocável, e
entra na lista dos excluídos com esse motivo, não como "não passou no filtro de intenção".

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
| **ausente** | não há suite para este repo | `L2 ausente` | Bootstrap (criar a suite) |
| **inalcançável** | a suite existe e não é invocável | `L2 inalcancavel — <motivo>` | instalar/expor a suite que já existe |

Colapsar `inalcançável` em `ausente` faz o elo oferecer **criar de novo** uma suite que já foi
escrita, que é o mesmo erro que o nível 2 do passo 1a existe para evitar, um degrau acima. Colapsar
em `disponível` é pior: promete uma cobertura que não houve.

Com `--solo`, pular este passo inteiro e o 2b, independentemente do que exista.

## Passo 2 — Rodar as lentes (em paralelo, via Task tool)

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
não derruba as outras: registrar a falha no banner e reconciliar o que voltou.

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

Opcionalmente, o comando anexa ao artefato um rodapé de proveniência (não um comparativo):

```markdown
## Cobertura

- **L1 holístico:** <HOLISTIC>
- **L2 specialists locais:** <lista dos que rodaram, ou "ausente — repo sem suite curada">
- **L3 specialists do repo:** <lista dos que rodaram, ou "ausente — repo sem agents de review">
- **Fora do filtro (L3):** <agents do repo excluídos por serem de execução, ou "nenhum">
```

O rodapé é **obrigatório quando alguma camada faltou**. Uma review que rodou com uma lente a menos e
não diz isso é pior do que uma review que não rodou: ela parece completa.

Sem `## Benchmark`, sem tabela "só_agents / só_baseline / ambos". A reconciliação já é o produto.
