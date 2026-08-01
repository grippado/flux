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

- **Feature / Improvement:** `## Motivação` · `## O que fazer` · `## Embasamento no código` · `## Critério de aceite` · `## Validações necessárias` · `## Abordagem sugerida` *(opcional)* · `## Prompt para IA`
- **Bug:** `## Problema` · `## Passos para reproduzir` · `## Comportamento esperado` · `## Embasamento no código` · `## Critério de aceite` · `## Validações necessárias` · `## Abordagem sugerida` *(opcional)* · `## Prompt para IA`
- **Spike:** `## Objetivo` · `## Escopo` · `## Embasamento no código` · `## Entregável` · `## Validações necessárias` · `## Abordagem sugerida` *(opcional)* · `## Prompt para IA`

### Conteúdo das seções

- **Motivação / Problema / Objetivo:** 1 parágrafo não-técnico com o valor de produto/usuário (ou o
  sintoma, no bug).
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

## Rascunho no vault (antes do Linear)

O `flux:issue` grava o rascunho revisável em `<VAULT_ROOT>/linear/YYYY-MM-DD-<slug>.md`:

```yaml
---
date: "YYYY-MM-DD"
type: issue-draft
context: "{VAULT_CTX}"
source: "{slack-permalink | pr-url | texto}"
repos: [{repos envolvidos}]
labels_propostas: { tipo: "...", application: "...", agent_autonomy: "AFK|HITL", prioridade: N }
linear_ids: []           # preenchido após criação
pending_organize: true
tags: [issue-draft, {repo}, {tema}]
---
```

O corpo é a(s) issue(s) já no formato acima. Só após aprovação (HITL) o comando cria no Linear e
grava os `linear_ids`/URLs de volta neste arquivo.
