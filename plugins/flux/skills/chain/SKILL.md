---
name: chain
description: "Orquestrador `flux:chain` — encadeia elos da família por artefato (`review>iterate`): valida a gramática antes de rodar, recusa chain ilegal com o corte legal, passa o baton (PR, ticket, board) entre os elos e abre com um banner próprio. Cada elo mantém os próprios gates. Executa `review>iterate`; os demais chains legais valida e imprime o plano. Global, resolve contexto via `flux-context.md`."
user-invocable: true
requires:
  hard:
    - file: shared/chain.md
    - file: shared/flux-context.md
    - bin: git
    - bin: gh
    - agent: ${HOLISTIC}
  soft:
    - vault
---

# /flux:chain

Encadeia elos `flux:` numa só invocação e remove a pergunta "e agora?". A família já encadeia por
artefato: o chain declara essa relação, valida antes de gastar tempo e passa o baton. **Não abole
nenhum gate**, não vira procuração e não roda elo como subagente.

**Gramática, legalidade, baton, falha e o que não está implementado:** `${FLUX_ROOT}/shared/chain.md`
**Gates (HITL):** `${FLUX_ROOT}/shared/hitl.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Preflight:** `${FLUX_ROOT}/shared/preflight.md`
**Gate de escopo:** `${FLUX_ROOT}/shared/scope-gate.md`

## Banner de perfil — gabarito (copiar VERBATIM)

Todo output deste elo **abre** com o banner. Ele não é decoração: é o que impede uma execução
degradada de se passar por uma completa. O gabarito mora aqui, no corpo do elo, porque um gabarito
que só existe num shared não chega ao contexto na hora de emitir — e o que sai é um banner
improvisado, com campos inventados e sem o `nivel`.

Copiar com as cercas, trocando só o que está entre chaves. Regras dos campos e casos de degradação
em `${FLUX_ROOT}/shared/preflight.md`, Passo 5. Este é o banner **do chain**: `nivel` é o pior entre
os elos e `degradacoes:` é a união sem repetir token. Cada elo emite o próprio banner ao rodar
(`chain.md`, "Banner").

````
```
perfil: {nome do manifesto | generico}{ (ancora: alvo <path>)} · nivel: {FULL|REDUCED|THIN} · holistico: {agente}
lentes: L1 {agente} · L2 {lista|ausente|inalcancavel} · L3 {lista|ausente|inalcancavel}
degradacoes: {soft ausentes e o que se perde com cada um | nenhuma}
carimbo: {harness} | flux:chain@{flux_version}
```
````

Recusa e plano de chain fora da v1 (Steps 0-alvo a 2) seguem o gabarito de "Recusa útil" do `chain.md`; a abortagem do preflight (Step 3 em diante) segue o gabarito do preflight. Todos saem **antes** do preflight e não
têm perfil resolvido para carimbar: seguem o formato de abortagem, sem banner, e nomeiam **verbos**,
nunca um prefixo de invocação, porque `FLUX_CMD` ainda não foi verificado. O banner abre o output do
chain que executa.

O andamento por elo vai no corpo, abaixo do banner. Abortagem segue o gabarito do "Formato da
mensagem de abortagem" do preflight, também verbatim, e o nome do elo na primeira linha usa
`${FLUX_CMD}` já substituído (`/flux:chain` num harness, `/flux-chain` em outro) — nunca `flux:` literal.

## Step 0-alvo: parsear o chain (antes de tudo)

Fazer **só o parse**: separar o primeiro token não-flag em elos por `>`, o resto em `<alvo>` e flags.
Não abrir repo, não buscar PR. Regras de sintaxe em `${FLUX_ROOT}/shared/chain.md`, seção "Sintaxe".

- Um elo só, elo desconhecido, `map`, `equip` ou `reply` em qualquer posição: recusar, citar o verbo avulso.
- `--auto`: recusar. O chain não é procuração (`chain.md`, invariante 2); dizer que `--auto` vale só
  rodando o elo avulso.
- Flag que nenhum elo do chain declara: recusar, nunca ignorar.

## Step 1: validar a gramática

Aplicar a "Regra de legalidade" de `${FLUX_ROOT}/shared/chain.md` ao chain inteiro, **antes de qualquer
efeito**. Ilegal: emitir a "Recusa útil" (aresta que falhou, o que faltava no baton, os cortes legais
na ordem ponte, prefixo) e **encerrar**. Nada foi rodado, nada foi gravado.

O alvo do chain classifica o baton inicial como o primeiro elo classificaria o próprio alvo.

## Step 2: cobertura da v1

Chain legal que **não** é `review>iterate`: imprimir o plano (um elo por linha, com o baton que cada um
recebe e entrega) e a sequência de **verbos** avulsos na ordem, e **terminar sem rodar nenhum elo**. É o degrau honesto da tabela "O que a v1 executa" do `chain.md`: o usuário recebe o que o
chain resolveu, sem que o executor finja capacidade que não tem. Não gravar nada.

## Step 3: preflight, uma vez para o chain inteiro (Step 0-cli e Step 0-preflight)

Só chega aqui um chain executável (hoje, `review>iterate`).

Seguir `${FLUX_ROOT}/shared/step0-cli.md`: `flux preflight chain [alvo] --json`. O CLI resolve o
perfil padrão para `chain` (sem união dos elos: `chain.md`, "O que não está implementado"), então o
requisito de cada elo é verificado aqui, à mão. CLI ausente ou saída inválida → `preflight.md` inteiro.

1. Resolver `FLUX_ROOT` e os `hard` do próprio chain (Passo 1 do preflight).
2. Verificar `FLUX_CMD` (Passo 1b do preflight), porque o chain despacha irmãos. `UNAVAILABLE`
   (hoje, o Codex): **abortar** no formato do preflight nomeando `FLUX_CMD`. Nunca executar o
   pipeline de um elo inline (`codex-compat.md`).
3. Verificar os `hard` **de cada elo** (`review`: `shared/review-legend.md`,
   `shared/review-artifact-template.md`, `shared/flux-context.md`, `git`, agente `${HOLISTIC}`; `iterate`: os do
   `requires` do `SKILL.md` dele, fonte única da lista, com os binários `git` e `gh`, os mesmos de
   `VERB_REQUIREMENTS` em `cli/src/preflight.ts`).
   **Falta um: abortar antes do primeiro elo**, no formato do preflight, nomeando qual elo o exigia.
   Com `iterate` no chain, conferir também `command -v jq`: é `soft` dele e não aborta. Sem `jq`, a
   perda entra em `degradacoes:` do banner do chain, na redação que o `SKILL.md` do `iterate` usa para
   ela (o watch fica no modo agendado; seção `WATCH_WAKE` de lá), porque o banner do chain reflete a
   união dos `hard` e `soft` dos elos (`chain.md`, "Banner").
4. Resolver `HOLISTIC` na ordem canônica do Passo 3 e verificar que existe.
5. Resolver a PR do `<alvo>` em URL (`gh pr view <alvo> --json url,headRefName`). Sem PR aberta
   (alvo vazio, branch local): abortar antes do primeiro elo. Resolver o perfil (`flux-context.md`) com a âncora no `<alvo>`. `NO_EMDASH` vale para todo texto
   externo que o chain gerar.
6. Classificar o nível: o **pior** entre os elos, com o que o preflight do chain mediu.

Este preflight é **do chain**. Cada elo roda o próprio Step 0 ao ser invocado, porque nada o dispensa
disso: o custo é conhecido e o resultado, o mesmo.

## Step 4: banner do chain e plano

Emitir o banner do gabarito acima, depois uma linha por elo (`1/2 review`, `2/2 iterate`) com o alvo
já resolvido. Só então rodar o primeiro elo.

## Step 5: rodar os elos, na main, em sequência

Cada elo é invocado como o harness invoca uma skill, **na main**, recebendo o baton e rodando o
**próprio pipeline com os próprios gates**. Nunca como subagente (`hitl.md`, "Subagente não tem canal
com o usuário"). Elo invocado pelo chain emite o próprio banner, como avulso.

Para `review>iterate <PR>`:

1. **`review`**, verbo `pr`, alvo `<PR>` (mais `--solo`, se passada). Roda até o Step 8,
   **incluindo o gate de ação pós-review**. O usuário escolhe postar, aplicar ou não fazer nada, e
   essa escolha é dele, não do chain.
2. **Baton.** A **URL da PR** já foi resolvida pelo chain no Step 3 (`gh pr view`); do resultado do
   `review` só se lê o path do vault, quando houve vault. Registrar no estado. Em seguida, se a branch
   da PR tem commits sem push (`chain.md`, "Exceção: commits locais sem push"), **parar antes do
   `iterate`** com o bloco de estado. Não resumir nem reescrever o que o `review` entregou.
3. **`iterate`**, alvo a URL da PR, com as flags declaradas para ele. É o **último** elo: vale o
   default de watch, ou o `--once` que o usuário passou. `iterate` lê as threads da PR, **não** o
   arquivo do review (`chain.md`, "`review>iterate` e o gate de postagem").

PR sem threads novas porque o usuário não postou é o baton mais magro, **não** falha e **não** para o
chain: o `iterate` segue acionável por CI ou conflito, e reporta que não há o que fazer quando não há.

## Step 6: parar no elo que falhou

Regras e critérios em `${FLUX_ROOT}/shared/chain.md`, seção "Falha no meio". Resumo operacional:

- Elo aborta, erra, ou deixa decisão sem resposta: **parar**, não tentar o próximo, não desfazer o que
  o anterior já fez.
- Usuário escolhe a saída inócua num gate do elo: **encerrar** e dizer qual elo ele parou. Sem token
  de degradação, porque é decisão.
- Parada por falha: imprimir o bloco de estado (`chain`, `parou em`, `concluidos`, `baton`, `retomar`, este com o prefixo `${FLUX_CMD}` já verificado)
  e **reemitir o banner** com `chain interrompido` em `degradacoes:`, seguido do elo e do motivo.

Retomar é rodar o elo que parou com o baton do estado. **Não há `flux resume`** hoje; não sugerir.

## Out of scope (NUNCA faça)

- **Não** abrir gate por conta própria, escolher opção de gate de elo, nem aceitar `--auto`.
- **Não** rodar elo como subagente nem em paralelo com outro.
- **Não** executar chain além de `review>iterate` na v1, nem fingir que o fez.
- **Não** rodar `map` ou `equip` dentro de chain: são setup, e o chain recusa.
- **Não** gravar arquivo de estado nem inventar o comando `flux resume`: ambos não existem.
- **Não** escrever fora do que o próprio elo escreve. O chain não grava nada no vault.
- **Não** hardcodar contexto de time nem `/flux:` literal: o nome do comando vem de `${FLUX_CMD}`.

## Handoff

- Terminou `review>iterate` com a PR assentada e o usuário quer entregar N PRs de uma feature:
  `${FLUX_CMD}land`.
- Chain legal fora da v1: rodar os verbos avulsos na ordem que o plano imprimiu.
- Falta specialist ou motor no repo: `${FLUX_CMD}equip`, e `${FLUX_CMD}map` para a visão da instalação.
