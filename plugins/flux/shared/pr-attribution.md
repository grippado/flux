# Carimbo de atribuição no corpo da PR — fonte única

> Regra do carimbo `flux:<verbo>@<versão>` na linha de atribuição (`🤖 Generated with ...`) do corpo
> de uma PR. Referenciada por `flux:build` (Step 4, depois que o motor abre a PR) e por `flux:iterate`
> (passo 8a, depois do push). **Não duplicar esta lógica** nos comandos: apontar para cá e declarar só
> em que momento o carimbo é aplicado.
>
> Complementa `${FLUX_ROOT}/shared/preflight.md`, seção 1a-harness,
> que é quem resolve os dois valores usados aqui. Este shared **não** resolve harness nem versão: ele
> só diz como escrevê-los na PR.

## Por que existe

A PR é o artefato mais visível do trabalho, e a linha de atribuição que o harness escreve só diz que
ela foi gerada por IA. Sem o verbo e a versão do flux, rastrear uma regressão de PR até a família (ou
descartá-la como causa) exige cruzar sessões na mão. O `stamp` do bloco `provenance`
(`${FLUX_ROOT}/shared/board-template.md`) resolve isso para os artefatos do vault; este carimbo é o
equivalente no artefato público.

## Formato

A linha de atribuição tem duas partes separadas pelo ` | ` que abre a lista de pares (espaço, barra vertical, espaço):

```
🤖 Generated with <atribuição do harness> | <par>, <par>, ...
```

- **Atribuição do harness**: tudo o que vem antes do ` | ` que abre a lista de pares. Quando o
  harness escreveu a linha, é o texto dele, preservado byte a byte (inclusive o link markdown, como
  `[Claude Code](https://claude.com/claude-code)`).
- **Par**: `flux:<verbo>@<versão>`, com `<verbo>` o verbo que agiu sobre a PR (`build`, `iterate`) e
  `<versão>` o `FLUX_VERSION` do preflight. Usa `flux:` literal, pela mesma exceção que vale para o
  `stamp` (`${FLUX_ROOT}/shared/preflight.md`, exceção logo após a seção 1b): é rastro de auditoria,
  não comando para digitar.
- **Pares acumulam**, separados por `, `, na ordem de primeira aparição:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code) | flux:build@1.34.0, flux:iterate@1.35.0`.

**Reconhecimento da lista de pares**: a lista é reconhecida como tal quando **todos** os itens depois
do **último** ` | ` da linha casam o padrão `flux:[a-z-]+@\S+`, com trim em cada item antes da
comparação. Quando isso não acontece (sem ` | `, ou com um ` | ` que faz parte do texto do harness e
não precede pares), a linha é tratada como sem lista e o passo 2 acrescenta ` | P`. Por exemplo, se o
harness escreveu `🤖 Generated with X | texto livre`, os itens depois do ` | ` não casam o padrão,
então é passo 2.

## Algoritmo (idempotente)

Entrada: o body atual da PR (sempre lido do remoto, nunca regerado) e o par `P = flux:<verbo>@<versão>`.

1. **Localizar a linha**: a **última** linha do body que começa com `🤖 Generated with`,
   considerando apenas linhas fora de bloco de código cercado (` ``` ` ou `~~~`) e fora de blockquote
   (`>`): um exemplo de atribuição citado no body, como numa PR que documenta o próprio formato, não
   pode ser carimbado nem impedir a criação do rodapé.
2. **Linha existe e a lista de pares não é reconhecida** (sem ` | `, ou com ` | ` que pertence ao
   texto do harness) → acrescentar ` | P` ao fim dela.
3. **Linha existe e a lista de pares é reconhecida** → separar a lista depois do **último** ` | ` por
   `, `. Se `P` já está na lista (comparação exata de string), **não editar nada**. Senão, acrescentar
   `, P` ao fim.
4. **Linha não existe** (harness que não escreve a linha, ou body escrito sem atribuição, ou toda
   linha `🤖 Generated with` encontrada está dentro de cerca ou blockquote) → localizar o **último
   parágrafo não vazio** do body, fora de bloco de código cercado e de blockquote. Se **toda** linha
   desse parágrafo casar `^[A-Za-z][A-Za-z-]*: .+$` (chave sem distinção de maiúsculas, espaço e `\r`
   finais descartados antes de comparar) e **pelo menos uma** casar a chave `co-authored-by` — um
   trailer isolado, de um ou mais coautores — **inserir antes dele**, com uma linha em branco de cada
   lado, preservando o terminador de linha que o body já usa: `🤖 Generated with <nome> | P`, com
   `<nome>` = `HARNESS_LABEL` (`${FLUX_ROOT}/shared/preflight.md`, seção 1a-harness). Senão,
   acrescentar ao fim do body, depois de uma linha em branco, o mesmo rodapé.

   > **Por que este desvio existe.** Um motor de execução pode terminar o corpo da PR com
   > `Co-Authored-By: <modelo> <noreply@<domínio>>` como o **último parágrafo isolado**, exigência de
   > quem escreveu aquele body para que a linha siga reconhecível como trailer Git
   > (`git interpret-trailers --parse --no-divider`) — é o caso do `pr-creator` do plugin `core` do
   > `arco-ai-plugins`. Acrescentar sempre no fim absoluto, sem olhar o que já está lá, quebra essa
   > invariante de um motor alheio: o carimbo do flux passaria a ser o último parágrafo, e o trailer
   > deixaria de ser reconhecido como tal. O flux não pode presumir a convenção de todo motor que
   > despacha, mas pode reconhecer o formato de trailer mais comum e não pisar nele. Achado em
   > produção: PR #520 de `arco-ai-plugins`, carimbada pelo `flux:build` depois do
   > `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` do `core:implement-task`.

A comparação do passo 3 é por **par inteiro**: `flux:iterate@1.34.0` e `flux:iterate@1.35.0` são pares
diferentes, e os dois ficam. É o que permite ver que duas versões do mesmo verbo passaram pela PR.
Rodar o algoritmo duas vezes com o mesmo par produz o mesmo body — inclusive quando foi o passo 2 que
inseriu o ` | P` na rodada anterior: a próxima rodada reconhece a lista (único item casa
`flux:[a-z-]+@\S+`) e o passo 3 encontra `P` já presente.

### O nome do harness na linha própria

Só entra quando o harness não escreve a linha (passo 4). Vem de `HARNESS_LABEL`, resolvido no
preflight (`${FLUX_ROOT}/shared/preflight.md`, seção 1a-harness), que mapeia o `HARNESS` para o nome
legível com a justificativa de `AI agent` (degradação declarada, não produto não verificado).

Com `FLUX_VERSION = unknown`, o par sai `flux:<verbo>@unknown`. Não omitir o par: a versão ilegível é
informação, e o verbo continua rastreável.

## Mecânica

Mesma disciplina de edição do passo 8a do `flux:iterate`: ler o body do remoto, editar sobre ele,
conferir o diff, publicar com `--body-file`.

```bash
gh pr view $PR_NUMBER --repo $REPO_FULL --json body -q .body > "$SCRATCH/pr-$PR_NUMBER-body-before.md"
cp "$SCRATCH/pr-$PR_NUMBER-body-before.md" "$SCRATCH/pr-$PR_NUMBER-body-after.md"
diff -u "$SCRATCH/pr-$PR_NUMBER-body-before.md" "$SCRATCH/pr-$PR_NUMBER-body-after.md"
gh pr edit $PR_NUMBER --repo $REPO_FULL --body-file "$SCRATCH/pr-$PR_NUMBER-body-after.md"
```

Entre o `cp` e o `diff`, aplicar o algoritmo no `-after.md` com edição cirúrgica. Diff vazio (par já
presente) → não chamar `gh pr edit`.

## Guardrails

- **Só PR própria.** Mesmo guard de autoria do `flux:iterate` (`IS_OWN_PR`): em PR de terceiro o
  carimbo não entra, nem como sugestão em comentário. A atribuição de uma PR alheia não é do flux.
- **Só a linha de atribuição.** O carimbo não reescreve, move nem reformata nada fora da linha
  localizada no passo 1 (ou do rodapé acrescentado no passo 4). Inserir antes de um trailer final
  (passo 4) também não move o trailer: ele continua o último parágrafo, só ganha um vizinho novo
  acima.
- **Não é drift.** Aplicar o carimbo não conta como reconciliação de descrição: não entra no changelog
  gerenciado do `flux:iterate`, não rola data, não emite evento de descrição reconciliada.
- **Sem travessão.** Os separadores são ` | ` e `, `, o que mantém a linha válida com `NO_EMDASH`.
