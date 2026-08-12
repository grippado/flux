# Template do artefato de review — fonte única

> Formato canônico do `.md` de review que o `flux:review` grava no vault, nos perfis **PR** e **doc**.
> Referenciado pelo comando (Step 6) — **não duplicar este template dentro do comando**; ele aponta
> para cá e só passa os dados coletados. Editar o formato do artefato significa editar ESTE arquivo.
>
> A legenda de badges vem de `${FLUX_ROOT}/shared/review-legend.md` (banners coloridos).
> Este arquivo é o irmão do `board-template.md` (que serve o iterate/delivery): mesmo apego visual,
> intuito diferente. O board é uma nota **viva** de orquestração; o review é um **parecer read-only**,
> um snapshot de uma rodada. Por isso: sem timeline viva, sem carimbo que rola, sem "próximo movimento"
> reescrito a cada tick.

## Regra de ouro do painel

O **Painel de findings** (seção 📊) é a ÚNICA tabela que lista findings no documento. Nenhuma outra
seção pode ter tabela paralela de findings — o resto é prosa. (A tabela de arquivos em 📎 Escopo é outra
coisa, permitida.)

## Âncoras internas (vale para os dois perfis)

O artefato é lido **no Obsidian**, que ancora por texto de heading. Âncora de Pandoc não resolve lá.

- ❌ `{#f1}` no heading · ❌ `[f1](#f1)` no link (rende "Unable to find f1 in ..." ao clicar)
- ✅ heading curto e estável: `### f1 · {rótulo curto do problema}`
- ✅ link: `[[#f1 · {rótulo curto}|f1]]`, ou com alias descritivo nas prioridades

Detalhe completo (headers estáveis, alias sem backtick, unicidade) na subseção "Âncoras internas" do
perfil doc, mais abaixo. As regras são as mesmas nos dois perfis.

## Disciplina de links (regra de ouro de links)

Nada de citação nua. Se o texto aponta para código, PR, thread, ticket ou doc, **tem link**:

- **Código:** todo `arquivo:linha` citado vira permalink estável no `head_sha` da PR:
  `https://github.com/{owner}/{repo}/blob/{head_sha}/{path}#L{n}` (range: `#L{a}-L{b}`). O SHA no path
  garante que o link não quebra quando a PR receber novos pushes. Montar a partir de `REPO_FULL` +
  `head_sha` + path do diff.
- **PRs:** `#{n}` → `https://github.com/{owner}/{repo}/pull/{n}`.
- **Threads do bot / comentários:** o permalink (`url`) já coletado no GraphQL das threads.
- **Ticket:** `{TICKET}` → Linear. Sem URL conhecida, usar `https://linear.app/{org}/issue/{TICKET}`
  (`LINEAR_ORG` do perfil; sem o campo, omitir o link).
- **Docs / RFCs:** URL direto. **Reviews anteriores** (`-vN` da mesma PR): wikilink `[[nome-do-arquivo]]`.

## Regras de escrita

- PT-BR com acentuação correta. Termos técnicos em EN quando for o uso natural (`middleware`, `hook`).
- Título de cada finding é uma **frase descritiva** do problema, não "problema 1" ou "finding N".
- `code inline` para todo identificador (função, flag, variável, path). Bloco cercado ```ts / ```diff
  para separar o trecho de código do texto corrido.
- Sem em-dash (—) em qualquer campo que o usuário possa colar/postar quando `NO_EMDASH == true`.

---

## Perfil PR

### Frontmatter

```yaml
---
context: "{VAULT_CTX}"
type: pr-review
repo: "{repo-slug}"          # slug puro (web-monorepo), nunca acme/web-monorepo
pending_organize: true       # a review nasce no 0-inbox/; context + repo é o que o /organize usa pra rotear
pr: {number}
pr_url: "{url da PR}"
ticket: "{TICKET-XXX ou null}"
ticket_url: "{url Linear ou null}"
author: "{gh-login}"
reviewer: "{gh-login do revisor}"
own_pr: {true|false}
status: "{approved | approved-with-suggestions | approved-with-questions | request-changes}"
head_sha: "{sha completo do head}"
date: "{YYYY-MM-DD}"
counts: { request-change: N, breaking-change: N, question: N, suggestion: N, praise: N, note: N }
pipeline: "flux:review (holistico {HOLISTIC} + specialists {lista}, reconciliados)"
tags: [pr-review, {repo-slug}, {area-opcional}, {ticket-slug}]
---
```

### Corpo

```markdown
# Review PR #{number} — [{TICKET}] {título da PR}

[#{number}]({pr_url}) · `{repo-slug}` · @{author} · [{TICKET}]({ticket_url}) · +{adds}/-{dels} (size_{x}) · head [`{head_sha:0:7}`](https://github.com/{owner}/{repo}/commit/{head_sha}) · **{status traduzido}**

> Read-only. Nada foi commitado, aplicado ou postado no GitHub. {"Reconciliação de N pareceres (holístico + specialists)." quando houve specialists.}

## 🎯 Veredito & prioridades

> **{status traduzido}.** {1-2 frases: o que está sólido + o que trava o merge.}

**Antes do merge:**
1. [![{badge}]({banner-img})]({banner-link}) [[#f{n} · {rótulo curto}|{resumo curto}]] — {motivo}, [`arquivo:linha`]({permalink}).

**Melhorias (não bloqueiam):**
2. [![{badge}]({banner-img})]({banner-link}) [[#f{n} · {rótulo curto}|{resumo}]] — {motivo}.

(Se não há bloqueadores nem questions, "Antes do merge" vira "Nada trava o merge." Prioridades sempre
linkam pro finding `#fN` e pro código.)

## 📊 Painel de findings

{tabela de legenda colorida de `review-legend.md`}

**Contagem:** {n} request-change · {n} breaking-change · {n} question · {n} suggestion · {n} praise · {n} note

| # | badge | local | resumo | bloqueia? |
|---|-------|-------|--------|-----------|
| [[#f1 · footer só publicado\|f1]] | [![question]({img})]({link}) | [`RecordEdit/index.tsx:74`]({permalink}) | footer só publicado | trava até responder |
| [[#f2 · fidelidade do mock\|f2]] | [![suggestion]({img})]({link}) | [`...test.tsx:96`]({permalink}) | mock perde fidelidade | não |

## 🔎 Findings

### f1 · {rótulo curto do problema}

**Local:** [`caminho/arquivo.ts:74,198`]({permalink})

[![{badge}]({banner-img})]({banner-link}) **{título descritivo em negrito}**

```ts
{trecho de código citado, curto}   // L74
```

{Corpo em PT-BR. `code inline` nos identificadores. Confronto com o código real, links para a
[thread anterior do bot]({url}), [PR relacionada](#{n}) e [doc]({url}) quando citados. Termina com o
fix/decisão concreta. Convergência entre lentes: anotar "(corroborado por {specialist})".}

### f2 · {rótulo curto}

**Local:** [`.../index.test.tsx:96`]({permalink})

[![suggestion]({img})]({link}) **{título}**

{...}

## 📎 Escopo & contexto

- {N} arquivos, +{adds}/-{dels}, {resumo do escopo}. {Sem/Com mudança de API/BFF, env vars, flags.}
- **Fora de escopo:** {o que não entrou e por quê, linkado quando aplicável}.
- **Threads anteriores:** {resolvidas/abertas, com [link]({url}) para as relevantes}.
- **Reviews anteriores:** {[[YYYY-MM-DD-repo-PRn]] quando re-run, senão omitir}.

| arquivo | +/- |
|---|---|
| `pages/RecordEdit/index.tsx` | +63/-18 |

## ✅ Ação

- [ ] {item acionável HITL — ex.: levar a #f1 ao PO: draft preenchido entra em modo edição?}
- [ ] {alinhar description × código, etc.}

(Checklist do que o usuário precisa fazer na parte humana. Marcar `- [x]` quando resolver, não apagar.)

## 🔗 Cobertura & referências

- **Holístico:** {HOLISTIC} · **Specialists:** {lista dos que rodaram, ou "nenhum — repo sem suite", ou "modo --solo"}
- **PR:** [#{number}]({pr_url}) · **Ticket:** [{TICKET}]({ticket_url})
- **Docs/RFCs:** {links, ou omitir se nenhum}
```

Tradução do STATUS (conforme `review-legend.md`): `approved` → "Aprovar"; `approved-with-suggestions`
→ "Aprovar com sugestões"; `approved-with-questions` → "Aprovar com perguntas"; `request-changes` →
"Solicitar mudanças". Cálculo do `size_*`: xs <50, s 50-199, m 200-499, l 500-1999, xl ≥2000.

---

## Perfil doc

Mesma espinha visual, adaptada a documento (sem `head_sha`/permalink de código; a âncora é a seção +
trecho verbatim). Diferenças em relação ao perfil PR:

- **Frontmatter:** `type: doc-review`, `source_url` (URL do doc) no lugar de `pr_url`/`head_sha`,
  `execution_status: open`, `own_doc: {true|false}`.
- **Linha de metadados:** `[{DOC_TITLE}]({source_url}) · autor · última atualização · {status}`.
- **Findings:** a âncora é `§seção "trecho verbatim"` (ver **Amarração de trechos** abaixo, é regra,
  não estilo). Links de código quando o doc afirma algo sobre um repo (permalink no branch default do
  repo citado, já que doc não tem `head_sha`).
- **Painel de findings:** coluna `local` = `§seção` **mais** o trecho verbatim curto entre aspas.
- **Seções extras** (mantidas do doc-reviewer): `## TL;DR` e `## Resumo Executivo` ao final, para quem
  não vai ler o doc inteiro.
- **📎 Escopo** vira "Repos referenciados" (lista linkada) em vez de tabela de arquivos.
- **Seção obrigatória quando `own_doc == true`:** `## ⚡ Ações no documento`, entre o painel e os
  findings (ver abaixo). Ela é a fonte única de execução: edições, respostas às threads e perguntas
  pendentes, numeradas na ordem de execução.

### Amarração de trechos (regra de ouro do perfil doc)

Um review de doc só serve se o autor consegue **encontrar** o ponto no documento sem caçar. Por isso
todo finding tem o trecho amarrado em **três** lugares, e nenhum deles é opcional:

1. **Campo `**Trecho no doc:**`** logo abaixo do header: a citação verbatim **completa** (a frase ou
   célula inteira, não um fragmento), com link para o doc:
   `**Trecho no doc:** [§{seção}]({source_url}) "{trecho verbatim}"`
   Quando o `read_file_content` expõe o id da âncora (heading ou comentário, ex.: `kix.abc123`),
   linkar direto no ponto: `{source_url}#heading=h.{id}` para heading. Sem id conhecido, linkar o
   `source_url` puro, nunca deixar sem link.
2. **Linha `**Trecho para Ctrl+F:**`** com o fragmento curto e único que o autor cola na busca do
   Google Docs para pular direto ao ponto. É o campo mais usado na prática, não omitir.
3. **Painel de findings**, coluna `local`: `§{seção} · "{trecho curto}"`. Só a seção não basta, porque
   seção de postmortem/RFC costuma ter dezenas de linhas.

O **header** fica fora dessa lista de propósito: ele precisa ser curto e estável, porque é o alvo dos
links internos (ver "Âncoras internas" abaixo). Formato: `### f{n} · {rótulo curto do problema}`, tipo
`### f3 · janela de impacto`. Trecho verbatim no header cria header longo e frágil, que quebra todo
link interno quando o trecho é reformulado.

### Âncoras internas: wikilink do Obsidian, nunca âncora de Pandoc

O artefato é lido **no Obsidian**, que ancora por **texto de heading**. As duas sintaxes abaixo são
proibidas porque não resolvem lá (rendem "Unable to find ..." ao clicar):

- ❌ `{#f3}` como atributo de heading (sintaxe Pandoc/markdown-it)
- ❌ `[f3](#f3)` como link markdown para essa âncora

Usar wikilink com alias, apontando para o **texto exato do heading**:

- ✅ `[[#f3 · janela de impacto|f3]]`
- ✅ `[[#c7 · Alessandra · §Timeline|c7]]`
- ✅ `[[#⚡ Ações no documento]]` (quando o alias seria igual ao heading, omitir o alias)

Regras:

- **Headers únicos e estáveis.** O prefixo `f{n}` / `c{n}` garante unicidade mesmo quando dois
  findings tratam da mesma seção do doc (`c3 · Alessandra · §Impacto causado` e
  `c4 · Alessandra · §Impacto causado` convivem).
- **Sem backtick no alias.** Dentro de wikilink o backtick não vira `code`, só polui: escrever
  `[[#f6 · gatilho da divergência|Confirmar o gatilho do @playwright/test]]`.
- **Alias descritivo é bem-vindo** nas prioridades e no roteiro (`[[#f1 · mecanismo da causa raiz|Mecanismo da causa raiz está errado]]`);
  no painel e nas listas de referência, alias curto (`f1`).
- Ao renomear um header, atualizar os wikilinks que apontam para ele. Um wikilink órfão é erro de
  formatação, não detalhe estético.

Regras do trecho verbatim:

- **Verbatim de verdade.** Copiado do `DOC_TEXT`, com a grafia original, **inclusive erros** (é o que
  torna o trecho localizável por Ctrl+F, que é como o autor vai usar). Nunca corrigir, normalizar
  acento nem reescrever o trecho citado.
- Trecho curto (header/painel): até ~60 caracteres, o suficiente para ser único no doc.
- Trecho completo (campo `Trecho no doc`): a unidade semântica inteira (frase, item de lista, célula
  de tabela). Se passar de ~3 linhas, cortar com `[...]` no meio, preservando início e fim exatos.
- **Marcadores de comentário** (`<comment_start id=...>`) presentes no `DOC_TEXT` são artefato de
  extração: removê-los do trecho citado, mas usar o `id` para amarrar a **thread irmã**.
- Quando o finding coincide com comentário existente, acrescentar
  `**Thread irmã:** comentário {n} ({autor})` logo após o campo `Trecho no doc`.
### `## ⚡ Ações no documento` (doc próprio: fonte única de execução)

Em doc próprio o artefato tem dois públicos, e eles querem coisas diferentes:

- os **achados** (`## 📊 Painel` + `## 🔎 Findings`) explicam **o que está errado e por quê**;
- as **ações** dizem **o que executar no documento**, na ordem, sem interpretação.

Misturar os dois infla o artefato e obriga o autor a reler análise para descobrir se era troca de
palavra ou parágrafo novo. Por isso, em `own_doc == true`, toda instrução de execução vive numa
**única seção numerada**, `## ⚡ Ações no documento`, colocada logo depois do painel e **antes** de
`## 🔎 Findings`. Ela substitui, e portanto proíbe, as três seções que antes se repetiam: roteiro de
edição, respostas em bloco separado, e bloco de comentários para colar.

Consequência para os findings: eles **não** carregam ficha de edição nem texto de resposta. Cada
finding fica curto (o problema, a evidência, e o link para a ação que o resolve), e a ação carrega o
texto colável.

Vocabulário fechado de ação (termo em maiúsculas, sem sinônimo):

| ação | quando | campos |
|---|---|---|
| `SUBSTITUIR` | trecho existente vira outro texto | `Onde`, `Remover`, `Inserir` |
| `ACRESCENTAR` | texto novo, nada sai | `Onde` (ponto de inserção), `Inserir` |
| `DELETAR` | trecho sai e nada entra | `Onde`, `Remover` |
| `RESPONDER` | réplica a uma thread aberta do Doc | `Thread`, `Depende de`, `Resposta` |
| `PERGUNTAR` | falta dado que só outra pessoa tem; a edição fica pendente da resposta | `A quem`, `Pergunta`, `Destrava` |

### Ordem: edição antes da resposta que ela sustenta

**Regra dura.** Responder uma thread notifica quem comentou, e essa pessoa vai abrir o documento na
hora. Então toda edição que sustenta uma resposta é executada **antes** dela: quando a notificação
chega, a mudança já está no texto, e a resposta descreve fato consumado, não promessa.

Isso define a ordenação da lista:

1. Ordem base: **ordem de aparição no documento** (o autor edita de cima para baixo).
2. Quando um grupo de edições sustenta uma resposta, a `RESPONDER` vem **imediatamente depois da
   última edição do grupo**, e declara quais ações ela consome em `Depende de`.
3. `PERGUNTAR` vem antes das ações que dependem da resposta, e essas ações ficam marcadas como
   pendentes, com a variante de texto para cada resposta possível.
4. Numeração contínua e única (`1`, `2`, `3`, ...), para o autor conseguir dizer "parei na 9".

Formato:

```markdown
## ⚡ Ações no documento

> {N} ações, na ordem de execução. Edições antes das respostas que elas sustentam, para que a notificação chegue com a alteração já no texto. Achado correspondente linkado em cada uma.

### 1 · SUBSTITUIR em §{seção}

- **Remover:** "{verbatim que sai}"
- **Inserir:** "{texto final que entra}"
- **Achado:** [[#f{n} · {rótulo}|f{n}]]

### 2 · ACRESCENTAR em §{seção}

- **Onde:** depois de "{trecho verbatim}"
- **Inserir:** "{texto final que entra}"
- **Achado:** [[#f{n} · {rótulo}|f{n}]]

### 3 · RESPONDER {autor} (thread {n}, §{seção})

- **Comentário:** "{verbatim do comentário}"
- **Depende de:** ações 1 e 2 (executar antes de responder)
- **Veredito:** procede | procede parcialmente | não procede | precisa de dado que não tenho

```text
{réplica pronta, primeira pessoa, no tom do usuário. Descreve a edição já feita, não a intenção.}
```
```

Regras:

- **`Inserir` é texto final, não descrição.** Nunca "explicar melhor o motivo": escrever a frase que o
  autor cola. Quando falta dado, marcar o buraco com `{preencher: ...}` dizendo qual dado o fecha, e
  abrir uma ação `PERGUNTAR` correspondente.
- **`Remover` é verbatim**, com a grafia original, inclusive erros (mesma disciplina da amarração).
- **Cobertura total das threads abertas.** Toda thread `OPEN` tem sua ação `RESPONDER`, inclusive as
  que não têm resposta boa ainda (essas viram `Veredito: precisa de dado que não tenho`, e a réplica é
  o pedido explícito do dado). Thread aberta sem ação é output incompleto.
- **Nada de ação órfã:** toda ação linka o achado que a justifica (`Achado:`), e todo finding
  acionável é citado por pelo menos uma ação. Divergência entre os dois lados é erro de formatação.
- `praise` e `note` não geram ação; ficam só nos findings.
- Quando `own_doc == false`, esta seção não entra: o revisor não edita nem responde thread de
  terceiro. Nesse caso o artefato mantém as sugestões em prosa nos findings, e o pós-review oferece o
  bloco de comentários para colar.
