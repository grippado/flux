# Orçamento de contexto — disciplina compartilhada da família `flux:`

> Fonte única. Todo comando `flux:*` (e qualquer orquestrador longo do cangaço) segue este
> documento. Editar a disciplina de contexto = editar este arquivo.

## O problema que isto resolve

Sessões longas de `/flux:land` e `/flux:iterate` entram em **thrashing de autocompact**:
o contexto enche, compacta, e volta a encher em 2-3 turnos, repetidamente. A causa não é o
volume de trabalho — é o **lastro estático**: material que o compact **não consegue comprimir**
porque é reinjetado inteiro depois do resumo.

Três fontes de lastro, medidas numa sessão real (uma entrega real de 3 PRs cross-repo):

| Fonte | Custo medido |
|-------|--------------|
| CLAUDE.md + `.claude/rules/**` de **cada root tocado** | ~10-20k tokens **por root**, permanente |
| Skills `flux:*` ativas simultaneamente (`delivery` + `iterate`) | ~14k tokens, **restaurados a cada compact** |
| Boards / notas do vault relidos a cada tick | 2-5k tokens por tick |

Naquela sessão havia **4 roots de memória ativos** (worktree do backoffice, backoffice de novo por
outro caminho, rf-monorepo raiz, worktree do rf-monorepo) + `apps/home/CLAUDE.md`: **~45k tokens só
de memória de repo**, boa parte duplicada. Somado às duas skills, o contexto pós-compact **nascia
com ~60-70k tokens ocupados**. Daí o thrash.

**Fato não óbvio, verificado empiricamente (2026-07-24, rf-monorepo e backoffice):** o frontmatter
dos arquivos em `.claude/rules/` **filtra muito menos do que parece**. Ler **um único** arquivo
(`packages/feature-flag/src/flags.ts`) trouxe para o contexto o `CLAUDE.md` do repo **mais 8 rules**,
incluindo `i18n.md` (glob `**/components/**/*.tsx`), `testing-guidelines.md` (glob `**/*.test.tsx`)
e `modular-architecture.md` (glob `modules/**`) — **nenhum** deles casa com o arquivo lido.
As duas chaves de frontmatter em uso (`globs:` e `paths:`) funcionam para ativar o rule; nenhuma
delas serve como garantia de que o rule vai ficar fora do contexto.

Consequência prática, e é ela que governa o orçamento:

> **Tocar um repo custa aproximadamente o pacote inteiro de contexto daquele repo**
> (`CLAUDE.md` + a maior parte dos `.claude/rules/**`), não o pedacinho relevante ao arquivo.
> Ao estimar custo, **conte 1 root = CLAUDE.md + todos os rules**, e assuma que é permanente.

Corolário para quem escreve rules: enxugar `.claude/rules/**` (movendo detalhe para `docs/`
referenciado por link, lido sob demanda) reduz o custo de **toda** sessão que tocar o repo.
Afinar `globs:`/`paths:` **não** reduz — não é um mecanismo de exclusão confiável.

## Regra 1 — Um root de escrita por sessão (a mais importante)

**Cada novo diretório-raiz de repo tocado custa 10-20k tokens permanentes.** Eles nunca saem
do contexto, nem depois do compact.

- O contexto principal escreve em **no máximo um repo por sessão**.
- Trabalho em um **segundo repo** vai para **subagente** (Regra 3) ou para **outra sessão**.
- **Nunca** tocar a árvore principal de um repo que já tem worktree ativa nesta sessão: isso
  carrega o mesmo CLAUDE.md + rules **duas vezes**, por dois caminhos diferentes, sem ganho
  nenhum. Ver `${FLUX_ROOT}/shared/worktree-discipline.md`.
- Sintoma de violação, visível no rodapé dos tool results: o mesmo `CLAUDE.md` aparecendo com
  dois prefixos de caminho distintos (`Loaded ../../../CLAUDE.md` **e** `Loaded CLAUDE.md`).
  Ao ver isso, **pare e reavalie** antes de continuar — o custo já foi pago, mas não pague de novo.

## Regra 2 — Uma skill `flux:` viva por vez no contexto principal

`flux:land` invocando `flux:iterate` **inline** mantém as duas skills carregadas e
restauradas a cada compact (~14k tokens de imposto fixo).

- Um orquestrador `flux:*` **não invoca outro `flux:*` inline**. Ele **delega** (Regra 3).
- O contexto principal fica com a skill do orquestrador; a skill delegada vive e morre
  dentro do subagente.

## Regra 3 — Delegar unidade de trabalho pesada a subagente

> Esta regra tem um documento próprio, com o protocolo operacional (o que fica na main, qual é a
> unidade de fan-out de cada elo, contrato do subagente, anti-padrões):
> [`fanout-discipline.md`](fanout-discipline.md). O que segue aqui é o núcleo.

A unidade natural de delegação é **uma PR** (no delivery) ou **um repo** (em qualquer varredura).

Um subagente tem **contexto próprio, que é descartado ao terminar**. Ele paga o custo de
carregar CLAUDE.md + rules + skill do repo dele, e esse custo **morre junto com ele**. O
contexto principal recebe só o retorno.

Contrato de delegação:

- O prompt do subagente carrega **tudo que ele precisa** (URL da PR, path do board pai, flags):
  ele não herda a conversa.
- O retorno é **estruturado e curto** — o que alimenta o board, não a transcrição do trabalho.
  Alvo: **< 40 linhas**. Nada de despejar diffs, logs de CI ou conteúdo de arquivo no retorno.
- O contexto principal **não relê** os arquivos que o subagente tocou para "conferir". Confia
  no retorno ou pede um segundo subagente para verificar.

## Regra 4 — Leitura sob demanda, nunca preventiva

- **Nunca** `Read` de arquivo inteiro para "ter contexto". Ler o trecho necessário (`offset`/`limit`)
  ou usar `Grep` com `-n`.
- Boards e notas do vault: reler **só a seção que vai ser atualizada**, não a nota inteira a cada tick.
- Saída de comando longo (`type-check`, `test`, `gh run view`) **sempre** filtrada na origem:
  `| tail -20`, `| grep -E 'error|fail'`. Nunca despejar build log cru no contexto.
- Um arquivo já lido nesta sessão **não é relido** para confirmar uma edição: o `Edit` teria
  falhado se não tivesse aplicado.

## Regra 5 — Sinal de alarme e reação

Ao perceber **qualquer** destes sinais, parar e aplicar a Regra 3 (delegar o resto do trabalho)
em vez de seguir empurrando na mesma sessão:

- Aviso de autocompact **duas vezes na mesma sessão**.
- Mais de **2 roots** de memória no rodapé dos tool results.
- Mais de **1 skill `flux:`** listada em `Skills restored`.
- Board relido mais de **3 vezes** no mesmo run.

A reação certa **nunca** é "continuar e torcer". É: fechar o estado no board (que é durável, em
disco) e delegar ou pedir sessão nova. **O board no vault é a memória do delivery — o contexto
da sessão não é.** Se o board está atualizado, perder a sessão não custa nada.

## Checklist rápido (para o orquestrador consultar antes de cada fase)

- [ ] Estou prestes a escrever num repo diferente do desta sessão? → subagente.
- [ ] Estou prestes a invocar outro `flux:*`? → subagente.
- [ ] Estou prestes a ler um arquivo inteiro? → `offset`/`limit` ou `Grep`.
- [ ] Estou prestes a rodar comando de saída longa? → filtrar na origem.
- [ ] O board está atualizado com o que já sei? → se sim, posso perder a sessão sem prejuízo.
