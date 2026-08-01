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

Antes de tudo, resolver o perfil de contexto conforme `claude/shared/flux-context.md` (holistic
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

`SPECIALISTS_L2 = <SPECIALISTS_ROOT>` com `{repo}` substituído pelo `REPO_SLUG`. Achou o arquivo →
L2 disponível (é um orquestrador: ele resolve os próprios specialists). Não achou → L2 ausente.

Sem `specialists_root` no perfil, L2 é sempre ausente. Isso é esperado no perfil genérico.

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

### 1c — Consolidar

```
LENTES = [L1] + ([L2] se disponível) + ([L3...] se disponível)
```

**Fallback gracioso.** Sem L2 e sem L3, avisar no banner
(`sem specialists para <REPO_SLUG>: seguindo com o reviewer holístico sozinho`), pular o passo 2b e
seguir. Nunca travar por ausência de specialists.

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
   ambíguo, ou dois specialists de camadas diferentes dizem a mesma coisa com redações incompatíveis:

   ```
   L1 (holístico)  >  L2 (specialists locais)  >  L3 (specialists do repo)
   ```

   L3 fica por último de propósito: é a camada que você menos controla e a que mais envelhece sem
   aviso, porque evolui no ritmo do repo e não no seu. **Desempate decide redação, nunca existência**:
   o finding perdedor não some, ele é absorvido pelo vencedor com a proveniência anotada.
5. **Mapear severidade → badge** conforme `claude/shared/review-legend.md`. Os specialists usam
   `CRITICAL/IMPORTANT/NOTE`; mapear: `CRITICAL → request-change` (ou `breaking-change` se for
   contrato), `IMPORTANT → question` ou `suggestion` conforme bloqueie ou não, `NOTE → note`.
6. **Escopo:** finding em arquivo fora do diff da PR entra como `note` marcada `[dívida pré-existente]`,
   nunca como blocker da PR corrente.

O `FINAL_REPORT` resultante segue o mesmo formato de output do reviewer holístico (seções
`SUMARIO / COMENTARIOS / CHECKLIST / VEREDITO / STATUS / PRIORIDADE`). **O corpo de cada finding
reconciliado abre com o banner-imagem do badge** (ver `claude/shared/review-legend.md` — Banner do
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
