# Carimbo e conciliação de atribuição no corpo da PR — fonte única

> Regra para a proveniência pública de uma PR. Referenciada por `flux:build` depois que o motor abre
> a PR e por `flux:iterate` depois de cada push. **Não duplicar esta lógica** nos verbos: eles só
> declaram quando a aplicam.

## Objetivo

O motor do repositório pode registrar `Gerado por: core:implement-task@<versão>` e fechar o corpo com
`Co-Authored-By`. O Flux precisa registrar harness e verbo sem produzir uma terceira linha visual
para a mesma proveniência. Este contrato reconcilia os dois carimbos numa linha canônica e preserva
o trailer final.

## Formato canônico

```
🤖 Generated with <atribuição do harness> | <par-do-motor>, flux:<verbo>@<versão>, ...

Co-Authored-By: <modelo> <noreply@domínio>
```

- **Atribuição do harness**: tudo antes do último ` | `. Quando a linha já foi escrita pelo harness,
  preservar byte a byte. Quando não existe, usar `HARNESS_LABEL` do preflight: `Claude Code`,
  `Cursor`, `Codex` ou `AI agent`. Portanto o algoritmo não depende de um harness específico.
- **Par de proveniência**: `namespace:verbo@versão`, em que `namespace` e `verbo` usam letras,
  números e hífens; a versão é qualquer token sem espaço. O primeiro pode ser do motor, por exemplo
  `core:implement-task@0.62.10`; os seguintes podem ser `flux:build@1.39.0` e
  `flux:iterate@1.39.0`.
- **Ordem e idempotência**: o par do motor vem primeiro quando existir. Pares do Flux acumulam na
  ordem da primeira aparição. Reaplicar o mesmo par não altera o corpo.

O `Co-Authored-By` continua o último parágrafo isolado para permanecer reconhecível por
`git interpret-trailers --parse --no-divider`.

## Entrada de motor legada

Um motor pode fechar o body assim:

```
---

Gerado por: core:implement-task@0.62.10

Co-Authored-By: Codex <noreply@openai.com>
```

`Gerado por:` é uma entrada de conciliação, não um segundo rodapé canônico. O Flux só a remove após
incorporar seu par na linha `🤖 Generated with ...`; se não puder provar que a entrada é estrutural e
semanticamente válida, não a toca.

## Algoritmo conservador e idempotente

Entrada: body remoto da PR e o par `P = flux:<verbo>@<versão>`.

1. Trabalhar apenas fora de blocos cercados e blockquotes. Localizar a última linha que começa com
   `🤖 Generated with` e o último parágrafo isolado de trailers. Nunca regerar o body inteiro.
2. Reconhecer um par como `^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*@\S+$`. Uma lista após o último ` | ` é
   válida somente quando todos os itens, separados por `, `, são pares válidos.
3. Procurar uma única linha isolada `Gerado por: E` antes do parágrafo final de trailers que contém
   `Co-Authored-By`. Ignorar linhas vazias e permitir atravessar **no máximo uma** linha
   `🤖 Generated with`: precisa ser a atribuição selecionada no passo 1, ocupar sozinha seu
   parágrafo, ter atribuição de harness não vazia e não ter ` | ` ou ter uma lista válida pelo passo
   2. Assim, tanto `atribuição → Gerado por → trailer` quanto `Gerado por → atribuição → trailer`
   são reconhecidos. Não atravessar texto livre, cercas nem blockquotes, mesmo que seus conteúdos
   sejam ignorados no passo 1. Duas ou mais entradas legadas ou linhas de atribuição no rodapé,
   texto adicional nos parágrafos, ausência do trailer final, lista inválida ou `E` inválido tornam
   a entrada **ambígua**: não a remover nem a mover. `E` precisa ser um par válido.
4. Se a atribuição existente não tem lista ou tem uma lista válida, montar a lista de pares sem
   repetição: primeiro `E`, se a entrada legada foi reconhecida, **mesmo se já estiver na lista**;
   depois os pares existentes sem `E`, preservando a ordem; por último `P`, se ainda não estiver
   presente. Sem `E` reconhecido, preservar a ordem dos pares existentes. Comparar sempre o par
   inteiro, inclusive a versão. Se não há linha de atribuição,
   criar `🤖 Generated with <HARNESS_LABEL> | E, P` (omitindo `E` quando ausente) imediatamente antes
   do trailer final, ou no fim se não houver trailer.
5. Só depois de confirmar que `E` apareceu na linha canônica, remover exatamente a linha legada
   `Gerado por: E` e uma única linha vazia adjacente. O `---` e o trailer não mudam de posição.
6. Se a atribuição existente tem texto livre depois de ` | ` ou qualquer forma ambígua, preservar
   tudo como está: acrescentar apenas ` | P` ao fim quando necessário e não conciliar `Gerado por:`.
   Segurança de conteúdo vence compactação visual.
7. Publicar apenas se o diff for não vazio. Depois, verificar que a última linha não vazia ainda é
   `Co-Authored-By` quando esse trailer existia antes.

### Exemplos de regressão

| Entrada do motor | Resultado após `flux:build@1.39.0` |
| --- | --- |
| `Gerado por: core:implement-task@0.62.10` + trailer | `🤖 Generated with Codex \| core:implement-task@0.62.10, flux:build@1.39.0` + trailer |
| `🤖 Generated with Claude Code` + `Gerado por: core:implement-task@0.62.10` + trailer | `🤖 Generated with Claude Code \| core:implement-task@0.62.10, flux:build@1.39.0` + trailer |
| `Gerado por: core:implement-task@0.62.10` + `🤖 Generated with Codex \| flux:build@1.38.0` + trailer | `🤖 Generated with Codex \| core:implement-task@0.62.10, flux:build@1.38.0, flux:build@1.39.0` + trailer |
| `Gerado por: core:implement-task@0.62.10` + `🤖 Generated with Cursor \| flux:build@1.38.0, core:implement-task@0.62.10` + trailer | `🤖 Generated with Cursor \| core:implement-task@0.62.10, flux:build@1.38.0, flux:build@1.39.0` + trailer |
| linha canônica com `flux:build@1.39.0` | nenhuma mudança |
| `Gerado por:` ambíguo ou inválido | preserva a entrada e não a compacta |
| `Gerado por: E` + atribuição com texto livre após ` \| ` + trailer | preserva a entrada legada; só acrescenta ` \| flux:build@1.39.0` quando necessário |
| duas entradas `Gerado por:` ou duas linhas de atribuição no rodapé | preserva as entradas legadas; não compacta |
| texto livre, cerca ou blockquote entre `Gerado por:` e trailer | preserva a entrada legada; não atravessa o conteúdo |

Nos casos válidos, reaplicar o mesmo par deixa o body intacto. Preservar byte a byte a atribuição
existente, inclusive links como `[Claude Code](https://claude.com/claude-code)`, e o parágrafo final
de trailers, inclusive múltiplos coautores e modelos diferentes. Exemplos de carimbos dentro de
cercas e blockquotes ficam intactos. Sem atribuição existente, os mesmos casos usam `HARNESS_LABEL`,
inclusive `AI agent` para harness não verificável; com versão ilegível, o par usa `@unknown`.

## Mecânica

Ler sempre do remoto e editar uma cópia, com diff antes da publicação:

```bash
gh pr view $PR_NUMBER --repo $REPO_FULL --json body -q .body > "$SCRATCH/pr-$PR_NUMBER-body-before.md"
cp "$SCRATCH/pr-$PR_NUMBER-body-before.md" "$SCRATCH/pr-$PR_NUMBER-body-after.md"
diff -u "$SCRATCH/pr-$PR_NUMBER-body-before.md" "$SCRATCH/pr-$PR_NUMBER-body-after.md"
gh pr edit $PR_NUMBER --repo $REPO_FULL --body-file "$SCRATCH/pr-$PR_NUMBER-body-after.md"
```

## Guardrails

- **Só PR própria.** Aplicar o mesmo guard de autoria do `flux:iterate`; em PR de terceiro, não
  editar atribuição.
- **Reconciliação mínima.** Além da linha `🤖 Generated with`, só pode remover a única linha legada
  `Gerado por:` validada pelo passo 3. Não alterar seções, texto livre, `---` nem trailers.
- **Sem adivinhação de harness.** Usar somente `HARNESS_LABEL` já resolvido pelo preflight; nunca
  inferir produto a partir do motor, do modelo ou de uma string do body.
- **Não é drift.** A conciliação não atualiza data, changelog ou seções gerenciadas do `iterate`.
- **Sem travessão.** Os separadores públicos são ` | ` e `, `, compatíveis com `NO_EMDASH`.
