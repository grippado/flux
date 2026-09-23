# Carimbo de atribuição no corpo da PR — fonte única

> Regra do carimbo `flux:<verbo>@<versão>` na linha de atribuição (`🤖 Generated with ...`) do corpo
> de uma PR. Referenciada por `flux:build` (Step 4, depois que o motor abre a PR) e por `flux:iterate`
> (passo 8a, depois do push). **Não duplicar esta lógica** nos comandos: apontar para cá e declarar só
> em que momento o carimbo é aplicado.
>
> Complementa `${FLUX_ROOT}/shared/preflight.md`, seção "1a-harness — `HARNESS` e `FLUX_VERSION`",
> que é quem resolve os dois valores usados aqui. Este shared **não** resolve harness nem versão: ele
> só diz como escrevê-los na PR.

## Por que existe

A PR é o artefato mais visível do trabalho, e a linha de atribuição que o harness escreve só diz que
ela foi gerada por IA. Sem o verbo e a versão do flux, rastrear uma regressão de PR até a família (ou
descartá-la como causa) exige cruzar sessões na mão. O `stamp` do bloco `provenance`
(`${FLUX_ROOT}/shared/board-template.md`) resolve isso para os artefatos do vault; este carimbo é o
equivalente no artefato público.

## Formato

A linha de atribuição tem duas partes separadas pelo primeiro ` | ` (espaço, barra vertical, espaço):

```
🤖 Generated with <atribuição do harness> | <par>, <par>, ...
```

- **Atribuição do harness**: tudo o que vem antes do primeiro ` | `. Quando o harness escreveu a
  linha, é o texto dele, preservado byte a byte (inclusive o link markdown, como
  `[Claude Code](https://claude.com/claude-code)`).
- **Par**: `flux:<verbo>@<versão>`, com `<verbo>` o verbo que agiu sobre a PR (`build`, `iterate`) e
  `<versão>` o `FLUX_VERSION` do preflight. Usa `flux:` literal, pela mesma exceção que vale para o
  `stamp` (`${FLUX_ROOT}/shared/preflight.md`, exceção logo após a seção 1b): é rastro de auditoria,
  não comando para digitar.
- **Pares acumulam**, separados por `, `, na ordem de primeira aparição:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code) | flux:build@1.34.0, flux:iterate@1.35.0`.

## Algoritmo (idempotente)

Entrada: o body atual da PR (sempre lido do remoto, nunca regerado) e o par `P = flux:<verbo>@<versão>`.

1. **Localizar a linha**: a **última** linha do body que começa com `🤖 Generated with`. A última,
   porque um body pode citar outra PR ou colar um trecho que contém a mesma frase, e a atribuição
   própria é sempre a do rodapé.
2. **Linha existe e não tem ` | `** → acrescentar ` | P` ao fim dela.
3. **Linha existe e tem ` | `** → separar a lista de pares depois do primeiro ` | ` por `, `. Se `P`
   já está na lista (comparação exata de string), **não editar nada**. Senão, acrescentar `, P` ao fim.
4. **Linha não existe** (Cursor, Codex, ou body escrito sem atribuição) → acrescentar ao fim do body,
   depois de uma linha em branco, `🤖 Generated with <nome> | P`, com `<nome>` da tabela abaixo.

A comparação do passo 3 é por **par inteiro**: `flux:iterate@1.34.0` e `flux:iterate@1.35.0` são pares
diferentes, e os dois ficam. É o que permite ver que duas versões do mesmo verbo passaram pela PR.
Rodar o algoritmo duas vezes com o mesmo par produz o mesmo body.

### O nome do harness na linha própria

Só entra quando o harness não escreveu a linha (passo 4). Vem de `HARNESS`, resolvido no preflight:

| `HARNESS` | `<nome>` |
|---|---|
| `claude-code` | `Claude Code` |
| `cursor` | `Cursor` |
| `codex` | `Codex` |
| `unknown` | `AI agent` |

Com `HARNESS = unknown`, a linha **não nomeia produto**: a regra de verificabilidade do Passo 1a do
preflight proíbe nomear harness que não foi verificado, e o texto de uma PR pública é o pior lugar para
um nome adivinhado. `AI agent` é verdade em qualquer harness. O `unknown` literal também não entra,
porque na PR ele se lê como defeito e não como degradação declarada; a degradação já está no banner.

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
  localizada no passo 1 (ou do rodapé acrescentado no passo 4).
- **Não é drift.** Aplicar o carimbo não conta como reconciliação de descrição: não entra no changelog
  gerenciado do `flux:iterate`, não rola data, não emite evento de descrição reconciliada.
- **Sem travessão.** Os separadores são ` | ` e `, `, o que mantém a linha válida com `NO_EMDASH`.
