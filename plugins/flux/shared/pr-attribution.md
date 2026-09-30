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
3. Procurar uma única linha `Gerado por: E` imediatamente antes do parágrafo final que contém
   `Co-Authored-By`, ignorando somente linhas vazias. `E` precisa ser um par válido. Duas ou mais
   candidatas, texto adicional no mesmo parágrafo, ausência do trailer final ou `E` inválido tornam a
   entrada **ambígua**: não a remover nem a mover.
4. Se a atribuição existente não tem lista ou tem uma lista válida, montar a lista de pares sem
   repetição: primeiro `E`, se a entrada legada foi reconhecida e ainda não estiver presente; depois
   os pares existentes; por último `P`, se ainda não estiver presente. Se não há linha de atribuição,
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
| linha canônica com `flux:build@1.39.0` | nenhuma mudança |
| `Gerado por:` ambíguo ou inválido | preserva a entrada e não a compacta |

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
