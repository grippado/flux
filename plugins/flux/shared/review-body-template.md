# Template do corpo da review postada no GitHub — fonte única

> Formato canônico do **`body` da review** que vai pro GitHub (o texto de abertura que o autor da PR lê
> antes de descer pros comentários inline). Referenciado por `flux:review` (Step 8b) e `review-pr`
> (Step 9b) — **não duplicar este template dentro do comando**; ele aponta pra cá e só passa os dados.
> Editar o formato do texto de abertura significa editar ESTE arquivo.
>
> **Não confundir com os irmãos:**
> - `review-legend.md` — os badges em si (vocabulário, cores, banners, regras de STATUS).
> - `review-artifact-template.md` — o `.md` completo que fica no vault. Rico, longo, com findings
>   inteiros e permalinks. É pro Gabriel.
> - **este arquivo** — o resumo curto que abre a review no GitHub. É pro autor da PR e pra quem passa
>   os olhos. Ele **não repete os findings inline**: aponta, contextualiza e dá o veredito.
>
> **Por que existe.** O corpo solto vira prosa: enterra o veredito, conta finding de cabeça (e erra),
> e some com os badges justo no lugar mais visível do review. O formato abaixo põe veredito no topo,
> contagem auditável e a legenda à mão, então quem lê aprende a taxonomia sem sair da PR.

## Esqueleto

```markdown
## Review da PR #{number}{", rodada {N}" se re-review}{" (pós commit `{sha:0:7}`)" se aplicável}

{1 frase: o que rodou e contra o quê. Ex.: "Rodei o pipeline `flux:review` (reviewer holístico +
specialists do {repo}: {lista curta})." ou "Verificação feita contra `{repo}@{branch}`."}

**Veredito: {status traduzido}.** {1 frase: o que trava, ou "Nada trava o merge."}

### Placar dos findings

| badge | qtd | onde |
|-------|-----|------|
| [![request-change](https://img.shields.io/badge/request--change-D73A49)](https://pullpo.io/cc?l=request-change) | {n} | {inline / no corpo / "-" se zero} |
| [![breaking-change](https://img.shields.io/badge/breaking--change-F97316)](https://pullpo.io/cc?l=breaking-change) | {n} | {...} |
| [![question](https://img.shields.io/badge/question-8B5CF6)](https://pullpo.io/cc?l=question) | {n} | {...} |
| [![suggestion](https://img.shields.io/badge/suggestion-3B82F6)](https://pullpo.io/cc?l=suggestion) | {n} | {...} |
| [![praise](https://img.shields.io/badge/praise-22C55E)](https://pullpo.io/cc?l=praise) | {n} | {...} |

Badges no estilo [Conventional Comments](https://conventionalcomments.org/): `request-change` e `breaking-change` bloqueiam, `question` {pede resposta / trava} antes do merge, `suggestion` é melhoria não bloqueante, `praise` é elogio.

### {O que verifiquei contra o código real e se sustenta}   <!-- opcional -->

- {bullets curtos das checagens que sustentam o parecer: contratos conferidos, premissas validadas,
  o que NÃO foi tocado (tRPC, env vars, migrations). É o que separa review de opinião.}

### {A sugestão mais relevante / A pergunta mais relevante}   <!-- opcional -->

[![{badge}](...)](...) **{título}**. {Por que esta é a que importa. Aponta pro inline, não repete ele
inteiro.}

### {Duas sugestões que não couberam inline}   <!-- opcional; só quando existem -->

[![{badge}](...)](...) **{título}**. {corpo}

### {Antes de mergear}   <!-- opcional -->

{Recado final: o que falta pro merge, checagem manual, screenshot ausente, decisão do autor.}
```

## Regras

1. **Veredito no topo, em negrito**, com o STATUS traduzido de `review-legend.md`: "Aprovar",
   "Aprovar com sugestões", "Aprovar com perguntas", "Solicitar mudanças". Nunca deixar o veredito
   implícito em prosa ("nenhum bloqueio duro" não é veredito).
2. **O placar é contado, não lembrado.** Os números vêm dos findings que de fato foram postados
   inline + os que ficaram no corpo. Antes de montar a tabela, confira contra o payload que você
   postou. Contar de cabeça é como o `praise` some do placar.
3. **Os zeros aparecem.** `request-change: 0` e `breaking-change: 0` são informação, não ruído: dizem
   ao autor que nada bloqueia. Linha com zero usa `-` na coluna "onde".
4. **`note` nunca entra** nem no placar nem no corpo: por `review-legend.md`, `note` fica só no vault.
   Se uma observação merece ir pra PR, ela é `suggestion` ou `question`, não `note`.
5. **Todo badge citado usa o banner-imagem** `[![...](img)](link)`, igual aos inline. Nunca `[badge](link)`
   (link de texto sem cor). Banners prontos em `review-legend.md`.
6. **A linha da legenda fica**, mesmo em review curto. É ela que ensina a taxonomia pra quem nunca viu.
7. **Findings do corpo têm banner também.** Achado que não ancora em linha (asset binário, nome de
   branch, body da PR vazio, `praise` de arquivo inteiro novo) vira seção com banner próprio e entra
   no placar marcado como "no corpo".
8. **Sem em-dash (—) nem en-dash (–)** quando `NO_EMDASH == true`: é texto publicado. Usar vírgula,
   dois-pontos, parênteses, ou quebrar a frase.
9. **Não repetir os inline.** O corpo aponta e prioriza; o detalhe mora no comentário ancorado.
10. **PT-BR com acentuação correta**, `code inline` em todo identificador.

## Blocker mitigado

Um `breaking-change` (ou `request-change`) cuja mitigação já está **na própria PR** (redirect
permanente, default compatível, feature flag, migração de dados incluída) continua no placar com seu
badge: a mudança de contrato aconteceu e merece registro. Mas o veredito não precisa ser
`request-changes`. Nesse caso:

- Manter o badge na contagem.
- Declarar o veredito real (ex.: "Aprovar com perguntas") e explicar em uma linha logo abaixo do
  placar: `O breaking-change de {x} está com mitigação completa ({o quê}), fica registrado para
  acknowledgment explícito e não bloqueia.`

Sem essa saída, o STATUS mecânico de `review-legend.md` contradiz o parecer real do revisor.

## Re-review (rodada N)

Quando é a segunda passada na mesma PR, o título leva `, rodada {N}` e o commit de referência, e o
corpo ganha uma seção curta de continuidade **antes** do placar:

```markdown
### O que a rodada {N-1} pediu e já está resolvido

- {ponto anterior} → {como foi endereçado}.
```

O placar da rodada N conta **só os findings da rodada N**, não o acumulado.
