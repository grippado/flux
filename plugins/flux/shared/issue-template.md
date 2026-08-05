# Template de issue — fonte única (to-issue enriquecido)

> Formato canônico da issue que o `flux:issue` gera. Referenciado pelo comando — **não duplicar aqui
> dentro do comando**. É o `to-issue` (formato ad-hoc do time) **enriquecido** com uma seção de
> embasamento em código real e a disciplina de links/escrita do flux. Irmão do
> `review-artifact-template.md`: mesmo apego a links e escrita correta, intuito de issue acionável.
>
> A mecânica de criação no Linear (team routing, cache, prioridade, labels) vive em
> o `LINEAR_OPS` do perfil (campo `linear_ops` do manifesto) — apontar, não reimplementar.

## Título

`[contexto]: [verbo de ação] [assunto]`, em PT-BR. Ex.: `backoffice: garantir registro duplo de
componente Gravity`, `flux: mostrar banners coloridos nos comentários de review`. Sem em-dash.

**Gate de legibilidade do título.** O título é o que aparece na lista do board, e é por ele que alguém
de produto decide se a issue interessa. Ele continua técnico — não vira marketing — mas tem que
entregar o contexto sozinho. Antes de propor o título, checar:

- **Passa no teste da lista:** lido fora da issue, sem o corpo ao lado, dá pra dizer o que muda e onde.
- **Diz o assunto, não só a operação.** `ajustar handler` e `corrigir bug do fluxo` reprovam: dizem que
  algo muda, não o quê. `bloquear envio duplicado no agendamento de comunicado` passa.
- **Sigla e nome interno só quando são o vocabulário real do time.** `BFF`, `SDD` passam; um nome de
  símbolo (`useFooBarProvider`) ou de arquivo no título reprova — isso é corpo, não título.
- **Sem número de ticket, sem prefixo de tipo** (`[BUG]`, `feat:`): o tracker já carrega isso, e no
  título eles roubam o espaço do que interessa.

## Seção obrigatória em toda issue: Embasamento no código

É o que distingue a issue do `flux:issue` de uma issue comum. Vem dos achados dos specialists
(Step 2 do comando), no contrato do prospector. Cada achado carrega evidência **linkada**:

```markdown
## Embasamento no código

- **{claim/ponto}** — `confirma`: [`caminho/arquivo.ts:42`]({permalink}) {o que o código mostra}.
- **{outro ponto}** — `parcial`: [`outro.ts:88`]({permalink}) {o que bate e o que não bate}.
- **{ponto sem prova}** — `sem-evidência`: {o que não deu pra verificar e por quê}.
```

Regra: todo `confirma`/`refuta`/`parcial` tem `arquivo:linha` como **permalink** (nada de citação nua).
Sem citação, é `sem-evidência`. Isso ancora o "O que fazer" e o "Critério de aceite" em código real.

## Seções por tipo

Herdadas do `to-issue` (`.../core/skills/to-issue/references/{tipo}.md`), com a seção de embasamento
inserida logo após a principal. Todas terminam em `## Prompt para IA`.

- **Feature / Improvement:** `## Resumo executivo` · `## Motivação` · `## O que fazer` · `## Embasamento no código` · `## Critério de aceite` · `## Validações necessárias` · `## Abordagem sugerida` *(opcional)* · `## Prompt para IA`
- **Bug:** `## Resumo executivo` · `## Problema` · `## Passos para reproduzir` · `## Comportamento esperado` · `## Embasamento no código` · `## Critério de aceite` · `## Validações necessárias` · `## Abordagem sugerida` *(opcional)* · `## Prompt para IA`
- **Spike:** `## Resumo executivo` · `## Objetivo` · `## Escopo` · `## Embasamento no código` · `## Entregável` · `## Validações necessárias` · `## Abordagem sugerida` *(opcional)* · `## Prompt para IA`

### Conteúdo das seções

- **Resumo executivo:** blockquote de 1-2 frases dizendo **o que muda e para quem**, na língua de
  produto. Sem nome de arquivo, sem nome de símbolo, sem sigla não expandida, sem link. É a única
  seção escrita para quem **não** vai ler o resto da issue: alguém de produto tem que fechar a issue
  depois dela e saber do que se trata. Mesmo formato do TLDR dos boards
  ([`board-template.md`](board-template.md)), para não inventar estilo novo.
- **Motivação / Problema / Objetivo:** 1 parágrafo não-técnico com o valor de produto/usuário (ou o
  sintoma, no bug). **Não repetir o resumo executivo:** o resumo diz *o que muda*, esta seção diz *por
  que agora* — o custo de não fazer, o que originou o pedido. No bug, o resumo carrega o impacto
  sentido pelo usuário e o `## Problema` fica com o sintoma técnico. Escrever as duas com o mesmo
  conteúdo é o erro mais fácil de cometer aqui, e deixa a issue pior do que era sem o resumo.
- **O que fazer / Passos / Escopo:** o trabalho concreto, ancorado nos achados (`ver Embasamento`).
- **Critério de aceite:** checklist técnico verificável.
- **Validações necessárias:** teste, feature flag, migração reversível, e2e — o que provar antes de fechar.
- **Abordagem sugerida** *(opcional, omitir se vazia)*: caminho de implementação embasado no código
  real (padrão do módulo, arquivo a tocar), com permalinks.
- **Prompt para IA:**
  ```
  Implemente a issue `{título}`.
  Contexto: {1-2 frases}.
  Considerações:
  - {constraint / risco / convenção real do repo, linkada}
  Carregue a descrição completa da issue para os critérios de aceite.
  ```

## Disciplina de links (igual ao review)

Nada de citação nua. Ver `${FLUX_ROOT}/shared/review-legend.md` e `review-artifact-template.md`:

- **Código:** `https://github.com/{owner}/{repo}/blob/{sha-ou-branch}/{path}#L{n}` (permalink no `HEAD_SHA`
  quando há PR; senão no branch default do repo).
- **PRs:** `#{n}` → `.../pull/{n}`. **Threads/Slack:** o permalink coletado. **Ticket:** `{TICKET}` →
  `https://linear.app/{linear_org}/issue/{TICKET}`. **Docs/RFCs:** URL direto.

## Regras de escrita

PT-BR com acentuação correta; termos técnicos em EN quando naturais; sem em-dash quando `no_emdash`;
`code inline` em todo identificador; blocos ```ts/```diff pra separar código; título descritivo (não
"issue 1").

## Labels (conforme LINEAR-OPS.md)

Toda issue leva, no mínimo:

- **Tipo** (obrigatório): `Feature` | `Bug` | `Improvement` | `Spike`.
- **Application** = repo alvo (um por issue).
- **Agent autonomy**: `AFK` (autônoma) ou `HITL` (precisa de humano no loop).
- Prioridade como número 1-4 (1=Urgent … 4=Low), quando o pedido indicar urgência.

## Decomposição (vertical slices)

Quando o pedido tem ≥2 critérios de aceite independentes ou toca >1 repo, decompor em issues, cada
uma **independentemente entregável** (tracer bullet, atravessa as camadas necessárias — não agrupar por
camada), **1 repo por issue**. Criar os blockers primeiro (pra ter IDs reais nos `blockedBy`). Propor a
lista numerada e aprovar em lote, nunca por issue.

## Onde este corpo é gravado

Este documento define **o corpo da issue**, e só isso. O corpo é escrito na seção
**📝 Rascunho da issue** (7-sexies) do **board de exploração** do `flux:issue` — uma subseção por
candidata do painel. O frontmatter, o caminho no vault (`<VAULT_ROOT>/linear/YYYY-MM-DD-flux-issue-<slug>.md`), o
versionamento entre rodadas do gate e o ciclo de vida da nota vivem em
[`board-template.md`](board-template.md), **perfil exploração**. Não duplicar nada disso aqui: definir
frontmatter em dois lugares é garantir que os dois divirjam.

Só após aprovação (HITL) o comando cria no Linear e grava os `linear_ids`/URLs de volta no board.
