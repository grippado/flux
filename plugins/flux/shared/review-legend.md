# Legenda canônica de review — badges textuais

> Fonte única da legenda de findings de review da família `flux:`. Referenciada pelos agentes
> reviewers (o `pr-reviewer` genérico e os reviewers declarados no perfil) e pelos comandos
> (`flux:review`, `flux:iterate`, `flux:land`, e os shims). **Não duplicar esta tabela** dentro
> de agente ou comando — apontar para cá. Editar a legenda significa editar ESTE arquivo, e todos
> herdam.

Substitui a antiga legenda emoji (🔴🟡🔵🟢⚠️💭). Os findings agora usam **badges textuais** no
estilo [Conventional Comments](https://conventionalcomments.org/), renderizados como shields.io e
linkados quando postados no GitHub.

## Os seis badges

| badge | cor (hex) | quando usar | posta na PR? | bloqueia merge? |
|-------|-----------|-------------|--------------|-----------------|
| `request-change` | `D73A49` | Bug que vai pra produção, regressão silenciosa, vulnerabilidade, viola "MUST"/"NEVER" do CLAUDE.md, perda de cobertura em código crítico, mudança de código exigida antes do merge | sim, obrigatório | **sim** |
| `breaking-change` | `F97316` | Mudança que quebra contrato com consumers (API, schema, env var obrigatória sem default, dependência removida) | sim, obrigatório | **sim** (contrato) |
| `question` | `8B5CF6` | Dúvida legítima que precisa de resposta antes do merge; decisão ambígua que só o autor resolve; falta de contexto que impede o veredito | sim | **trava até responder** |
| `suggestion` | `3B82F6` | Melhoria não-bloqueante: nit estilístico, refactor opcional, alternativa possivelmente melhor, teste desejável em caminho secundário | a critério | não |
| `praise` | `22C55E` | Boa prática aplicada, padrão correto seguido, decisão acertada não óbvia. Use quando agregar valor, não force | opcional | não |
| `note` | `6B7280` | Observação interna que não vale comentar na PR mas é útil registrar (contexto, decisão arquitetural, dúvida pra investigar depois). Fica só no vault | **não** | não |

**Nota de design.** A antiga severidade 🟡 "necessário" era sobrecarregada (misturava "você deveria
arrumar isto" com "tenho uma dúvida"). Ela **quebra** em três badges conforme a intenção real:
`request-change` (mudança exigida), `question` (dúvida que trava), `suggestion` (melhoria opcional).
Isso separa o *tipo* do comentário do fato de ele *bloquear* — mais expressivo que o eixo único de
severidade anterior.

## Banner do badge — IMAGEM colorida, obrigatória em todo finding

**REGRA CRÍTICA (a regressão a evitar).** O badge é um **banner-imagem** do shields.io, não texto.
O corpo de todo finding COMEÇA com o banner, no formato imagem-dentro-de-link:

```markdown
[![suggestion](https://img.shields.io/badge/suggestion-3B82F6)](https://pullpo.io/cc?l=suggestion) **título curto e direto** — corpo do comentário em PT-BR.
```

O `!` na frente é o que transforma em **imagem colorida**. Sem ele, `[suggestion](url)` vira um link
de texto azul, sem cor — foi exatamente a regressão que apareceu na PR. **Sempre** `[![badge](img-url)](link-url)`,
**nunca** `[badge](link-url)`. Isso vale igual no comentário postado no GitHub e no relatório do vault
(o Obsidian também renderiza a imagem remota, então o vault sai colorido).

- **Escaping shields.io:** hífen no label vira `--`: `request-change` → `request--change`,
  `breaking-change` → `breaking--change`. Os demais vão diretos.
- **Banner pronto por badge** (copie o bloco `[![...]...]` inteiro — é isto que abre o corpo do finding):
  - `request-change` → `[![request-change](https://img.shields.io/badge/request--change-D73A49)](https://pullpo.io/cc?l=request-change)`
  - `breaking-change` → `[![breaking-change](https://img.shields.io/badge/breaking--change-F97316)](https://pullpo.io/cc?l=breaking-change)`
  - `question` → `[![question](https://img.shields.io/badge/question-8B5CF6)](https://pullpo.io/cc?l=question)`
  - `suggestion` → `[![suggestion](https://img.shields.io/badge/suggestion-3B82F6)](https://pullpo.io/cc?l=suggestion)`
  - `praise` → `[![praise](https://img.shields.io/badge/praise-22C55E)](https://pullpo.io/cc?l=praise)`
  - `note` → não vai pra PR; no vault, `[![note](https://img.shields.io/badge/note-6B7280)]()` (sem link).

## Output dos agentes (seções por badge)

Findings agrupados por badge, nesta ordem: `request-change` → `breaking-change` → `question` →
`suggestion` → `praise` → `note`. **Cada finding tem um header legível (pro índice do vault) e um
corpo que ABRE com o banner-imagem.** O corpo é exatamente o que o comando posta como body do
comentário inline, então já sai colorido em qualquer caminho de postagem (comando `flux:`, bot de CI,
ou cópia manual):

```markdown
## COMENTARIOS

### suggestion `caminho/arquivo.ts:L42` — título curto

[![suggestion](https://img.shields.io/badge/suggestion-3B82F6)](https://pullpo.io/cc?l=suggestion) **título curto** — descrição em PT-BR. Use bloco ```ts ou ```diff quando ilustrar o código. Termina com o fix concreto.

### request-change `outro/arquivo.ts:L88-L95` — título

[![request-change](https://img.shields.io/badge/request--change-D73A49)](https://pullpo.io/cc?l=request-change) **título** — descrição...

### breaking-change ...
### question ...
### praise ...
### note ...
```

Regras de formatação do corpo (pra não ficar pobre visualmente):

- Banner-imagem primeiro, título em **negrito**, depois o corpo.
- Todo identificador de código no texto vem em `code inline` (nomes de função, flags, paths).
- Quando ilustrar código ou o fix, use bloco cercado ```ts / ```diff — separa o trecho do texto.
- Uma linha em branco entre o header e o corpo, e entre parágrafos.

## Regras de STATUS

Calculadas a partir dos badges presentes (substituem as regras da legenda emoji):

- **`request-changes`** — ≥1 `request-change` ou `breaking-change`
- **`approved-with-questions`** — 0 blocker, ≥1 `question` (aguarda resposta antes do merge)
- **`approved-with-suggestions`** — 0 blocker, 0 `question`, ≥1 `suggestion`
- **`approved`** — só `praise`/`note`, ou nada

Tradução do STATUS para PT-BR (título da seção Decisão):

- `approved` → "Aprovar"
- `approved-with-suggestions` → "Aprovar com sugestões"
- `approved-with-questions` → "Aprovar com perguntas"
- `request-changes` → "Solicitar mudanças"

## Tabela de legenda no artefato do vault

Os comandos que persistem review no vault incluem esta tabela compacta como seção `## Legenda`. A
coluna `badge` usa o **banner-imagem** (mesmo `[![...]...]` dos findings), pra a legenda sair colorida
no Obsidian e casar visualmente com os comentários:

```markdown
## Legenda

| badge | tipo | posta na PR? |
|-------|------|--------------|
| [![request-change](https://img.shields.io/badge/request--change-D73A49)](https://pullpo.io/cc?l=request-change) | mudança exigida (bloqueia) | sim, obrigatório |
| [![breaking-change](https://img.shields.io/badge/breaking--change-F97316)](https://pullpo.io/cc?l=breaking-change) | quebra de contrato (bloqueia) | sim, obrigatório |
| [![question](https://img.shields.io/badge/question-8B5CF6)](https://pullpo.io/cc?l=question) | dúvida (trava até responder) | sim |
| [![suggestion](https://img.shields.io/badge/suggestion-3B82F6)](https://pullpo.io/cc?l=suggestion) | melhoria não-bloqueante | a critério |
| [![praise](https://img.shields.io/badge/praise-22C55E)](https://pullpo.io/cc?l=praise) | elogio | opcional |
| [![note](https://img.shields.io/badge/note-6B7280)]() | nota interna | não |
```
