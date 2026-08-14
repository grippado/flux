---
name: equip
description: "Verbo de preparo `flux:equip` — equipa um repo com o que a família consome mas não produz sozinha: o motor de execução (L0) e a suite de specialists locais (L2). Único lugar onde o Bootstrap de specialists roda de fato; os outros elos passaram a oferecer este verbo em vez de duplicar a lógica. Toda escrita passa pelo contrato de destino (`write-destination.md`), nunca dentro do checkout do repo alvo, e escrever no manifesto é ação com gate próprio. Global, resolve contexto via `flux-context.md`."
user-invocable: true
requires:
  hard:
    - file: shared/write-destination.md
    - file: shared/bootstrap-specialists.md
    - file: shared/agents-index.md
    - file: shared/flux-context.md
    - file: shared/kit-format.md
    - bin: git
  soft:
    - bin: gh
    - checkout_local
    - vault
---

# /flux:equip

O **verbo de preparo** da família `flux:`. Ele garante que um repo tenha as duas coisas que os
outros elos **consomem e não produzem**: o **motor de execução** (L0) que o `flux:build` despacha, e
a **suite de specialists locais** (L2) que `flux:review`, `flux:iterate` e `flux:land` reconciliam.

Ele **não faz parte do ciclo**. `issue → build → review → iterate → land → reply` é o que se faz com
um repo; `equip` é o que se faz **ao** repo, uma vez, para que o ciclo rode com todas as lentes e sem
cair no modo autônomo. Por isso ele não tem elo anterior nem elo seguinte obrigatório: entra quando
falta alguma das duas camadas, e sai.

```
             ┌──────────────────┐
             │   flux:equip     │  L0 motor · L2 specialists      ← este
             └────────┬─────────┘  (fora do ciclo, preparo do terreno)
                      │ equipa
                      ▼
   issue → build → review/peek → iterate → land → reply
```

**Metade deste verbo já existia, embutida como oferta pós-trabalho.** O Bootstrap de specialists é
acionado hoje por `review`, `iterate`, `land` e `build`, sempre depois do trabalho principal. Essas
ofertas continuam existindo, nos mesmos momentos — o que mudou é que elas **chamam este verbo** em
vez de carregar a lógica cada uma por si. A outra metade (o motor) não existia em lugar nenhum, e é o
buraco que faz um repo sem `/workflow` cair no modo autônomo toda vez.

**Contrato de destino de escrita (onde qualquer arquivo pode nascer):** `${FLUX_ROOT}/shared/write-destination.md`
**Bootstrap de specialists (o que a suite L2 é e como se escreve):** `${FLUX_ROOT}/shared/bootstrap-specialists.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Descoberta das lentes (o que já existe antes de equipar):** `${FLUX_ROOT}/shared/review-agents.md`
**Gates com o usuário:** `${FLUX_ROOT}/shared/hitl.md`
**Disciplina de fan-out (a main orquestra, os agentes autoram):** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Preflight:** `${FLUX_ROOT}/shared/preflight.md`

## Banner de perfil — gabarito (copiar VERBATIM)

Todo output deste elo **abre** com o banner. Ele não é decoração: é o que impede uma execução
degradada de se passar por uma completa. O gabarito mora aqui, no corpo do elo, porque um gabarito
que só existe num shared não chega ao contexto na hora de emitir — e o que sai é um banner
improvisado, com campos inventados e sem o `nivel`.

Copiar com as cercas, trocando só o que está entre chaves. Regras dos campos e casos de degradação
em `${FLUX_ROOT}/shared/preflight.md`, Passo 5.

````
```
perfil: {nome do manifesto | generico}{ (ancora: alvo <path>)} · nivel: {FULL|REDUCED|THIN}
lentes: L1 n/a · L2 {lista|ausente|inalcancavel} · L3 {lista|ausente|inalcancavel}
motor: {nativo <cmd> | exec_fallback <cmd> | ausente}
destino: {path canonico aprovado | nao resolvido}
degradacoes: {soft ausentes e o que se perde com cada um | nenhuma}
```
````

Três particularidades deste elo, e as três são deliberadas. Elas estão declaradas também na tabela
"Campos que não são de todos os elos" do Passo 5 do preflight, que é a lista de quem emite o quê — o
gabarito aqui garante o template em contexto, aquela tabela garante que nenhum elo invente campo:

- **`holistico:` não entra.** O `equip` não revisa nada, então resolver um reviewer aqui seria
  verificar um agente que não vai ser invocado. A linha `lentes` fica, porque o inventário das
  camadas **é o produto do diagnóstico**: é lendo `L2 ausente · motor ausente` que o usuário entende
  o que este verbo vai fazer com a máquina dele.
- **`motor:` entra, e é compartilhada com o `flux:build`.** Lá o campo diz qual motor **foi
  escolhido**; aqui, qual motor **existe ou vai passar a existir**. É a mesma informação vista dos dois
  lados do preparo, e por isso o vocabulário é o mesmo (`nativo` / `exec_fallback` / `ausente`).
- **`destino:` é uma linha própria, e só existe aqui.** O `equip` é o único verbo cujo entregável é
  um caminho no disco de alguém. Um elo que escreve fora do repo e não diz **onde** obriga o usuário
  a caçar o que apareceu; enquanto o gate de destino não tiver acontecido, a linha sai como
  `nao resolvido`, que é a verdade naquele instante.

Abortagem segue o gabarito do "Formato da mensagem de abortagem" do preflight, verbatim, com
`${FLUX_CMD}` já substituído (`/flux:equip` num harness, `/flux-equip` em outro).

## Uso

```
/flux:equip <repo> [--engine-only] [--agents-only] [--expose-l3] [--from-kit <ref>] [--dry]
/flux:equip                                   # repo mode: infere o repo do cwd
```

| Argumento | Descrição |
|-----------|-----------|
| `<repo>` | Slug do repo a equipar. Obrigatório em workspace mode; omitido em repo mode (inferido do `cwd`). |

| Flag | Efeito |
|------|--------|
| `--engine-only` | Equipa **só L0** (o motor). Não toca em specialists, não oferece o Bootstrap. |
| `--agents-only` | Equipa **só L2** (a suite de specialists). Não toca em motor nem em `exec_fallback`. |
| `--expose-l3` | Torna a **L3 do repo alcançável** de qualquer sessão, pelo degrau 1 da escada (`${FLUX_ROOT}/shared/review-agents.md`, 1b-bis): espelho namespaceado, `name:` prefixado com o slug do repo. Ver "Step 4b". |
| `--from-kit <ref>` | Em vez de autorar do zero, instala a partir de um kit já pronto. Ver "Kits", abaixo. |
| `--from-map` | **Uso interno: despachado pelo `${FLUX_CMD}map`**, sob as três garantias da Forma 2 do `${FLUX_ROOT}/shared/fanout-discipline.md`: escopo e destino já consentidos no gate da main dele (nenhum gate abre aqui, porque não sobrou gate); índice carimbado pelo chamador; e **arquivo existente e manifesto não são deste processo** — encontrados, o verbo para, não escreve, e devolve no retorno. Ver "Step 4c" e "Step 6". |
| `--dry` | Faz o diagnóstico completo, imprime o plano de equipagem e **para**. Nada é escrito, nenhum gate abre. |

Sem `--engine-only` nem `--agents-only`, o verbo cuida das duas camadas — mas **só do que falta**.
Uma camada que já existe não é reescrita nem "atualizada" por iniciativa própria: o diagnóstico
reporta que ela está lá e o verbo segue para a outra.

Passar `--engine-only` **e** `--agents-only` juntos é o mesmo que não passar nenhum. Não é erro, mas
diga isso ao usuário em uma linha, porque quem escreveu os dois provavelmente esperava outra coisa.

### Exemplos

```
/flux:equip api-gateway                       # as duas camadas, só o que falta
/flux:equip api-gateway --agents-only         # só a suite de specialists
/flux:equip payments --engine-only            # só o motor (o repo já tem suite)
/flux:equip web-monorepo --dry                # diagnóstico + plano, sem escrever
/flux:equip notifications --from-kit node-fastify
/flux:equip payments --expose-l3              # L3 do repo alcançável fora dele
/flux:equip                                   # dentro de <WORKSPACE_ROOT>/api-gateway
```

## Out of scope (NUNCA faça)

- **Não escreva dentro do checkout do repo alvo.** Nem `.claude/agents/`, nem
  `.claude/commands/`, nem `AGENTS.md`. A regra do Bootstrap ("cria L2, nunca L3") vale para as duas
  camadas deste verbo, pelas mesmas três razões — autoridade, ritmo e sobrevivência
  (`${FLUX_ROOT}/shared/bootstrap-specialists.md`). Equipar a **sua** máquina para trabalhar num repo
  é diferente de mudar o ferramental de todo mundo que trabalha nele; a segunda coisa é uma PR no
  projeto, com revisão do time.
- **Não implemente task nenhuma.** Este verbo prepara o terreno; quem executa é o `flux:build`.
- **Não revise nada.** Sem holístico, sem specialists rodando sobre diff. As lentes aparecem aqui
  como **inventário**, não como execução.
- **Não escreva no manifesto sem o gate do Step 6.** Nem "de passagem", nem porque a resposta do
  usuário no gate de destino "já implicava" a persistência.
- **Não sobrescreva o que já existe.** Motor nativo, suite L2 e agents L3 encontrados são reportados
  e preservados. Substituir artefato existente é decisão de autoria, e sai pelo gate de arquivo
  existente do contrato de destino, nunca por default.
- **Um repo por invocação.** Equipar N repos são N invocações, e é assim mesmo: cada uma tem gates
  próprios sobre a máquina do usuário.

---

## Step 0-context: resolver perfil de contexto

Seguir o protocolo de `${FLUX_ROOT}/shared/flux-context.md`, inclusive a ordem obrigatória (parse do
alvo → âncora → manifesto → preflight → trabalho). Aqui o alvo é quase sempre explícito, então **a
âncora é o repo, não o `cwd`**.

Do perfil, extrair:

- `WORKSPACE_ROOT` / `REPOS` — para resolver o checkout do slug.
- `SPECIALISTS_ROOT` / `KITS_ROOT` / `WRITE_DESTINATIONS` — degraus 2, 3 e o registro de aprovações da
  cascata de destino.
- `SPECIALISTS_SPEC` / `SPECIALISTS_REPO` — espec que rege a autoria da suite e repo das suites
  versionadas.
- `EXEC_COMMAND` (default `workflow`) / `EXEC_FALLBACK` (sem default; escalar **ou** mapa por repo,
  resolvido como `repo` → `default` → nenhum) — o que o `flux:build` procura.
- `VAULT_ROOT` / `VAULT_CTX` — só para registrar o que foi escrito, quando houver board por perto.
- `NO_EMDASH`.

Sem manifesto (perfil genérico) o verbo **funciona igual**, com duas diferenças que precisam ser
ditas em voz alta no Step 6: não há onde persistir a aprovação de destino, e não há onde declarar o
`exec_fallback`. Um motor autorado sem manifesto continua servindo para invocação manual, e o verbo
diz isso em vez de deixar o usuário descobrir sozinho que o `build` não o acha.

---

## Step 1 — Resolver o repo e **diagnosticar antes de escrever**

1. Resolver o checkout do slug com a mesma mecânica do `flux:build` (Step 1): candidato como
   diretório-filho com `.git`, depois `WORKSPACE_ROOT/<slug>`, depois os manifestos que reivindicam o
   slug. Nenhum resolveu → parar e listar os checkouts disponíveis. **Não improvise um repo por
   similaridade de nome.**

2. **Sem checkout local e sem `--from-kit`, abortar aqui.** Autorar uma suite ou um motor para um
   repo que não se pode ler produziria arquivo genérico com nome específico, que é pior do que a
   ausência: ele passa a ser encontrado pela descoberta e a ocupar o lugar de uma suite real.

   > **Por que `checkout_local` é `soft` no frontmatter e ainda assim o verbo para aqui.** Não é
   > incoerência, e a distinção importa o bastante para estar escrita. A fronteira do
   > `${FLUX_ROOT}/shared/preflight.md` é **binária de propósito** — hard ausente aborta, soft ausente
   > segue e declara — e ela responde a uma pergunta só: *este elo consegue rodar de forma confiável?*
   > A resposta aqui é **sim**: com `--from-kit`, o verbo faz trabalho real e completo sem nunca
   > abrir o repo, porque instalar um kit já escrito não depende de ler a stack de ninguém. Um
   > requisito `hard` mataria essa execução legítima antes do parse dos argumentos, e ensinar ao
   > preflight uma categoria "hard condicional" cobraria de todos os elos o preço de um caso de um só.
   >
   > O que este passo responde é outra pergunta: *este trabalho específico pode ser feito?* Sem
   > checkout e sem kit, não pode, e quem sabe disso é o verbo, no ponto do fluxo em que já conhece as
   > flags. Por isso o preflight segue, o banner é emitido com a degradação declarada, e a parada
   > acontece **aqui**, nomeando a causa.
   >
   > **A divergência com os outros elos é real e é deliberada.** Em `review`, `iterate` e `land`, sem
   > checkout local significa degradar para `THIN`: eles ainda têm o diff, e um parecer mais cauteloso
   > sobre menos contexto continua valendo alguma coisa. Aqui não existe versão fraca do entregável:
   > uma suite autorada sem ler o repo não é uma suite pior, é uma suite **errada**, com nome
   > específico e conteúdo genérico, que a descoberta vai encontrar e o próximo `review` vai invocar
   > como se fosse real. Não há `THIN` para onde degradar, então o verbo para.

3. Levantar o inventário das camadas. É este levantamento que vira o banner e o plano:

| camada | como verificar | estado |
|---|---|---|
| **L0 motor** | `<repo>/.claude/commands/<EXEC_COMMAND>.md` existe? Senão, o `EXEC_FALLBACK` que resolve **para este repo** (chave do slug, senão `default`) está declarado **e** invocável na sessão? | `nativo` / `exec_fallback` / `ausente` |
| **L2 specialists locais** | cascata de descoberta do `${FLUX_ROOT}/shared/review-agents.md`, passo 1a, **incluindo o 1a-bis** | `disponivel` / `ausente` / `inalcancavel` |
| **L3 specialists do repo** | varredura filtrada do `review-agents.md`, passo 1b | `disponivel` / `ausente` |

Três leituras deste inventário mudam o que o verbo faz, e nenhuma é óbvia:

- **L2 `inalcancavel` não vira trabalho de autoria.** A suite existe em disco e não está registrada
  como `subagent_type`; escrever outra por cima é criar o segundo arquivo com o mesmo `name:`, que é
  exatamente o que faz o harness carregar um só, sem precedência definida. O que falta é
  **instalação**, e é isso que o verbo oferece (expor o diretório, conferir colisão de nome), não
  geração.
- **L3 presente não dispensa L2.** As duas lentes somam, e a razão está no princípio do
  `review-agents.md`. O que o L3 muda é o **conteúdo** da suite gerada: ela complementa o que o repo
  já cobre em vez de repetir.
- **Motor `nativo` encerra a metade L0.** Não há nada a equipar, e propor um fallback ao lado de um
  motor nativo é propor que o `build` deixe de usar quem conhece os próprios testes e gates.

4. Com `--dry`, imprimir banner + inventário + plano de equipagem (o que seria escrito, onde, com que
   nome) e **parar**. Nenhum gate abre no `--dry`: uma pergunta feita numa execução que não escreve
   treina o usuário a responder no automático.

   **O "onde" nem sempre existe ainda, e o dry diz isso em vez de inventar.** A cascata de destino
   (`${FLUX_ROOT}/shared/write-destination.md`) resolve sozinha até o degrau 4; quando nenhum deles
   produz valor — sem `specialists_root`, sem `kits_root`, sem entrada aprovada para este slug —, o
   próximo degrau é **perguntar**, e a pergunta é justamente o que o `--dry` não faz. Esse é o perfil
   genérico, que é quem mais roda `--dry`, então o caso é a regra e não a borda.

   Nesse caso, o plano imprime o **default da família** (`~/.claude/flux-specialists/<slug>/`) como
   candidato, marcado como **não confirmado** — e diz, na mesma linha, que numa execução real ele
   seria a opção recomendada de um GATE, não um destino assumido. O motor tem a linha equivalente,
   com o diretório de comandos resolvido pelo Step 3.2, ou `nao resolvido` quando nenhum existe.
   Imprimir o default sem a marca faria o dry prometer um caminho que a execução real ainda pode não
   tomar; omitir o "onde" faria o dry descumprir o que ele mesmo promete. A linha `destino:` do banner
   continua saindo como `nao resolvido`, porque nenhum gate aconteceu, e essa é a verdade do instante.

---

## Step 2 — Plano de equipagem e gate único de escopo

O plano é uma lista curta, com uma linha por artefato pretendido: o que é, para que serve, e por que
ele está na lista (qual estado do inventário o justificou). Ele vai para o chat **antes** de qualquer
gate de destino, porque a pergunta "onde escrever" só é respondível por quem já sabe **o que** vai
ser escrito.

GATE (`${FLUX_ROOT}/shared/hitl.md`), single-select:

- **Header:** `Equipar o repo?`
- **Question:** `\`<slug>\`: {resumo do inventário}. Equipar o quê?`
- **Options** (montar só com o que o inventário justificou; a última é sempre a saída inócua):
  1. `Motor + specialists (Recomendado)` — as duas camadas que faltam. Não escreve dentro do repo e
     não altera o manifesto sem o gate do Step 6.
  2. `Só a suite de specialists` — equivalente a `--agents-only`.
  3. `Só o motor` — equivalente a `--engine-only`.
  4. `Não fazer nada` — encerra sem escrever. O plano fica impresso no chat, para rodar depois.

Com `--engine-only` ou `--agents-only` na invocação, o escopo **já foi declarado** e este gate vira
uma confirmação de uma opção só (seguir / não fazer nada). O usuário que digitou a flag não precisa
escolher de novo o que já escolheu.

---

## Step 3 — Resolver os destinos (um por camada, e são camadas diferentes)

**Antes de qualquer `mkdir`, `touch` ou write**, seguir `${FLUX_ROOT}/shared/write-destination.md`
na íntegra e na ordem obrigatória que ele fixa (a lista de 10 passos do fim daquele documento):
cascata → normalização a diretório → F1 symlink sobre o path **bruto** → canonização por `realpath` →
F2 repo git → F3 diretório de dotfiles → gate por arquivo existente → escrita → persistência (com
gate próprio) → registro.

### 3.1 — L2, a suite: o destino vem da cascata

A cascata do contrato (path ditado → `specialists_root` → `kits_root` → `write_destinations` →
perguntar → default da família) resolve o destino **dos agents**, e é o único destino que passa por
gate nesta execução no caso comum.

### 3.2 — L0, o motor: destino próprio, porque invocabilidade depende de onde o arquivo mora

**A cascata acima é orientada a agents, e um motor não é um agent.** Todos os cinco degraus dela
apontam para raízes de specialists — e um comando escrito em `~/.claude/flux-specialists/payments/`
não é comando nenhum: nenhum harness varre aquele diretório procurando comandos. Escrever o motor ali
produziria exatamente o desfecho que o Step 1 rejeita, o de um `EXEC_FALLBACK` declarado e **não
invocável**, com o agravante de o próprio verbo ter acabado de criá-lo.

Um motor só é invocável se nascer num diretório que o harness varre **como comando**. Resolver o
destino do motor nesta ordem, parando no primeiro que existir na instalação:

1. `~/.claude/commands/` — diretório de comandos de usuário do Claude Code.
2. `~/.cursor/commands/` — o equivalente no Cursor.
3. Nenhum dos dois existe → **perguntar** ao usuário onde os comandos dele são varridos, com a mesma
   mecânica do GATE de destino (opção "informar outro caminho"). Não inventar um diretório: um motor
   num lugar que o harness não lê é trabalho jogado fora com aparência de trabalho feito.

Achado mais de um, escrever **em um só** — o do harness em que a sessão roda, que é o único onde a
invocabilidade pode ser conferida no Step 7. Escrever nos dois cria dois comandos com o mesmo nome e
nenhuma precedência definida, que é o mesmo defeito do `name:` duplicado em L2.

Este destino **não dispensa o contrato**: ele entra como path ditado (degrau 1 da cascata) e volta ao
início, passando por normalização, F1, canonização, F2, F3 e gate por arquivo existente como qualquer
outro. Ditar o destino escolhe o lugar, não dispensa a verificação — e aqui F2 dispara com frequência,
porque `~/.claude/` costuma ser um symlink para dentro de um repositório de dotfiles.

### 3.3 — O que é deste verbo e não do contrato

1. **Um gate de destino por camada, no máximo, e só quando a camada for equipada.** O destino da
   suite é perguntado uma vez e vale para tudo que a suite escreve; o do motor é resolvido pela lista
   acima e só vira pergunta quando nenhum diretório de comandos existe. Abrir o gate de destino duas
   vezes para a **mesma** camada é transformar o preparo numa entrevista, e a segunda resposta não
   seria mais informada que a primeira.
2. **Tudo acontece no contexto principal, antes do despacho.** Subagente não abre gate
   (`${FLUX_ROOT}/shared/hitl.md`), então um destino resolvido lá dentro é um destino resolvido sem
   ninguém para perguntar. Os autores recebem o path canônico **já aprovado** e a instrução de
   escrever ali e em lugar nenhum além dali.
3. **O que o `equip` escreve é o que a descoberta tem que achar depois.** O passo 1a do
   `review-agents.md` percorre a mesma cascata de destino, na mesma ordem, incluindo os destinos
   aprovados em `write_destinations`, justamente para que uma suite escrita fora do manifesto não
   fique órfã. Um destino escolhido aqui que não apareça naquela cascata produz o pior desfecho
   possível: arquivo escrito, trabalho feito, e o elo seguinte oferecendo criar a suite de novo. A
   simetria vale para as duas camadas, com o descobridor certo para cada uma: a suite é achada pela
   cascata do `review-agents.md`, o motor é achado pelo Step 2 do `flux:build` (motor nativo →
   `exec_fallback` do repo → `default` → autônomo). **Conferir a coerência é parte do passo, não um
   detalhe de implementação**, e é o que o Step 7.3 vai reafirmar para as duas.

---

## Step 4 — Equipar L2 (a suite de specialists)

Roda quando o escopo aprovado inclui specialists e o inventário disse `L2 ausente`.

A mecânica inteira — o que a suite contém, o checklist mínimo quando não há `SPECIALISTS_SPEC`, o
fan-out obrigatório, o PR draft opcional em `SPECIALISTS_REPO` — está em
`${FLUX_ROOT}/shared/bootstrap-specialists.md`. **Não duplicar aqui.** O que este verbo acrescenta:

- **É aqui que aquele contrato executa.** Os outros elos passaram a oferecer o `equip`; a geração
  acontece neste Step, com os gates no lugar certo.
- **Autoria vai para subagente, sempre.** Detecção de stack, leitura dos agents L3 e escrita dos
  arquivos são unidades independentes e vão em paralelo num único bloco
  (`${FLUX_ROOT}/shared/fanout-discipline.md`). A main fica com gates, destino e registro.
- **L2 `inalcancavel` não passa por aqui.** Vai para o Step 7 como oferta de instalação, com a
  remediação que a **causa** pedir na tabela do `review-agents.md` (1a-bis) — mover para um diretório
  varrido pelo harness, percorrer a escada de alcance, ou desfazer colisão de `name:` —, nunca
  "symlink" como resposta única.

---

## Step 4b — Expor a L3 (`--expose-l3`)

Roda quando a invocação pediu `--expose-l3`, ou quando o usuário aceitou a oferta do degrau 1 da
escada de alcance (`${FLUX_ROOT}/shared/review-agents.md`, 1b-bis) no fechamento de outro elo.

**O que é.** Um espelho dos agents de review de `<repo>/.claude/agents/` dentro de uma raiz que o
harness varre, com o `name:` de cada arquivo reescrito para `<slug>-<name>`. Isso é o que torna a
suite do repo invocável de uma sessão ancorada acima dele, que é o modo normal de trabalho de quem
tem vários repos sob um diretório de workspace.

**Por que espelho com prefixo, e não symlink do diretório:** o argumento de colisão de `name:` está
no 1b-bis, e é lá que ele se mantém. Não repetir aqui.

**Regras:**

- **Só agents que passam o filtro de intenção de review do 1b.** Agent de execução
  (`implementation`, `test-runner`, `backend-dev`, `db-migrations`) **não** é espelhado: promovê-lo a
  global é criar efeito colateral em repo alheio a um `Task` de distância. Os excluídos são listados
  no relatório.
- **Destino pela cascata do Step 3.1**, sob `<raiz de agents>/<ctx>/<slug>-l3/`. Nunca dentro do
  checkout do repo alvo — a regra do "Out of scope" vale aqui inteira.
- **Nada além do `name:` é reescrito.** O corpo do agent é do time que o mantém; reescrever conteúdo
  transformaria um espelho em fork, e o próximo `--expose-l3` teria que decidir entre duas verdades.
- **Proveniência obrigatória.** Gravar no índice o `sha256` do conjunto de origem
  (`l3.mirror.synced_from_sha256`). É o que permite a um elo declarar a degradação `L3 stale`
  (`${FLUX_ROOT}/shared/preflight.md`, Passo 5) em vez de rodar uma cópia velha em silêncio.
- **Re-executar é idempotente**: origem inalterada ⇒ nada a escrever, e diga isso em uma linha.

**A pergunta que o usuário precisa responder antes**, porque a resposta muda o que fica na máquina
dele: espelho é cópia, e cópia envelhece. Abrir o gate de destino declarando isso, e oferecendo o
degrau 0 no lugar quando ele for aplicável (condições no 1b-bis), porque lá não há cópia nenhuma.

---

## Step 4c — Atualizar a entrada do repo no índice

**Com `--from-map`, este Step não roda, e o `collisions` em especial fica interditado:** ele muda com
espelho novo e cada filho só enxerga a própria parte, então recomputá-lo aqui produziria um mapa de
colisões cego para os outros repos da mesma execução. O `map` despacha vários `equip` em paralelo, e
há **um** `flux-agents.json` por raiz de agents: N filhos carimbando o mesmo arquivo é race no único recurso
que o fan-out compartilha, e o índice sairia descrevendo um subconjunto arbitrário do que aconteceu.
Nesse modo, devolver os fatos no contrato de retorno e deixar a reconciliação com a main do `map`
(um escritor por execução, a mesma disciplina do board-keeper do `flux:land`). O resto do verbo roda
igual, com o contrato de destino inteiro valendo.

Invocado direto, sem `--from-map`: ao equipar um repo (Steps 4, 4b e 5), **atualizar a entrada dele**
no `flux-agents.json` e recomputar `collisions`.

### Arquivo existente sob `--from-map`

O gate por arquivo existente do `${FLUX_ROOT}/shared/write-destination.md` é **posterior ao
levantamento por natureza**: o arquivo pode ter nascido entre o gate da main e o despacho. Encontrando
um, este processo **não escreve, não sobrescreve, não faz backup e não decide** — devolve o caminho em
`recusado:` e segue para os demais arquivos. A main do `map` abre o gate que falta.

A invariante do contrato de destino ("nenhum arquivo existente é sobrescrito em silêncio") não é
relaxada pelo `--from-map`; ela é **adiada** para quem tem canal com o usuário. Não existe caminho em
que um filho decida sobrescrever, e "o consentimento já foi dado" **não** cobre este caso, porque no
instante do consentimento o arquivo não existia. Um índice que descreve a máquina de antes da equipagem faz o próximo elo oferecer o que
acabou de ser feito.

O escopo aqui é **um repo**, e só ele: o levantamento da máquina inteira é do `${FLUX_CMD}map`, que é
o verbo de sanidade da família. Esta é a divisão inteira entre os dois — o `map` **levanta**, o `equip`
**equipa e carimba o que equipou**.

- **Quando o índice pode ser escrito, e por quem, é do `agents-index.md`** (seção "Quem escreve"). Este
  Step **executa** aquele contrato; não o reenuncia.
- Não havendo índice na máquina, **não criar um** a partir de um repo só: um índice parcial seria
  indistinguível de um índice completo e faria os outros elos confiarem num mapa com um repo. Relatar
  a ausência e oferecer o `${FLUX_CMD}map`.

---

## Step 5 — Equipar L0 (o motor de execução)

Roda quando o escopo aprovado inclui motor e o inventário disse `motor ausente`.

**O que é equipar um motor, dado que não se escreve dentro do repo.** O `flux:build` procura, nesta
ordem: motor nativo do repo → `exec_fallback` **do repo** → `exec_fallback.default` → modo autônomo. O
primeiro degrau é do time que mantém o repo e está fora do nosso alcance. Então equipar L0 é preencher
o **segundo**: autorar um comando de execução para este repo, no destino de comandos resolvido no
Step 3.2, e (Step 6) declarar o nome dele em `exec_fallback` **sob a chave deste repo** para que o
`build` o encontre.

O nome do comando autorado é derivado do slug e nasce único (`flux-engine-<slug>`, ou o que o gate por
arquivo existente permitir). Um motor por repo com nome por repo é o que torna possível equipar o
segundo repo sem desequipar o primeiro.

O motor autorado carrega a disciplina que um motor nativo daria de graça, e ela não é negociável
porque é o que separa "executou" de "executou bem":

- worktree dedicado, nunca a árvore principal (`${FLUX_ROOT}/shared/worktree-discipline.md`);
- ler `AGENTS.md`/`CLAUDE.md` do repo antes de escrever, com as convenções do repo vencendo qualquer
  default;
- rodar os checks que o repo **declarar** (lint/typecheck/test), e reportar verde/total;
- abrir a PR sempre como **draft**.

Autorar isso exige ler o repo de verdade: stack, scripts declarados, convenção de branch e de
mensagem de commit, o que o CI roda. **Vai para subagente**, com o destino já aprovado, e volta com a
lista do que pretende escrever — o gate por arquivo existente é da main.

> **Por que não abrir PR no repo alvo com um `/workflow` nativo.** Seria o melhor resultado possível
> e é, deliberadamente, fora do escopo deste verbo: um motor versionado no repo é ferramental de todo
> mundo que trabalha nele, e nasce por PR revisada pelo time, não como efeito colateral de alguém ter
> pedido para equipar a própria máquina. O mesmo argumento que mantém a suite em L2. Quando o motor
> local amadurecer, promovê-lo a nativo é uma boa PR — feita à mão, por quem responde por ela.

Sem `EXEC_FALLBACK` declarável (perfil genérico), o motor continua sendo escrito e continua
invocável à mão; o que se perde é a descoberta automática pelo `build`. Dizer isso ao usuário no
mesmo instante, não no fim.

---

## Step 6 — Persistir no manifesto (gate próprio, e este é novo)

**Com `--from-map`, este Step não escreve.** Ele apura o que persistiria e devolve no campo
`manifesto_pendente:` do contrato de retorno; quem grava é a main do `map`, com o gate, na
reconciliação. Duas razões, e as duas são das mesmas famílias que já governam este verbo: escrever no
manifesto é categoria de gate **sempre** (`${FLUX_ROOT}/shared/hitl.md`), e um subagente não tem canal
para abri-lo; e há **um** `flux-context.json` por perfil, então N filhos gravando nele é a mesma
corrida do índice, agravada porque a escrita aqui é merge preservando campos desconhecidos, não
substituição.

**Nenhum elo da família escreveu o `flux-context.json` até agora.** Todos os demais leem o manifesto e
resolvem contra ele; nenhum o altera. Este verbo é o primeiro que precisa alterar, e por isso a
escrita do manifesto é **ação com gate explícito**, nunca efeito colateral de ter equipado.

A razão é a mesma do contrato de destino, um degrau acima: o manifesto é a configuração que a pessoa
carrega entre máquinas e, com frequência, um arquivo versionado num repositório de dotfiles.
Reescrevê-lo em silêncio suja um `git status` que o usuário vai atribuir a outra coisa — e desta vez
o arquivo sujo é justamente o que governa todos os outros elos.

Duas coisas podem ser persistidas, e **cada uma é uma escolha separada**:

| campo | o que grava | por que persistir |
|---|---|---|
| `exec_fallback.<slug>` | o nome do motor autorado no Step 5, **sob a chave deste repo** | sem ele, o `flux:build` não acha o motor e continua caindo no modo autônomo — o motor existe e não é usado |
| `write_destinations` | o destino canônico aprovado + o estado das guardas | sem ele, o gate de destino volta a cada execução, e o `review-agents.md` perde o degrau que encontra a suite fora do manifesto |

GATE (`${FLUX_ROOT}/shared/hitl.md`), single-select, aberto **depois** de os arquivos estarem
escritos e **antes** de tocar o manifesto:

- **Header:** `Registrar no manifesto?`
- **Question:** `Gravar {campos} em \`<path do flux-context.json>\`? Sem isso, {o que deixa de funcionar}.`
- **Options:**
  1. `Gravar (Recomendado)` — edita **apenas** os campos listados, preservando o resto do arquivo e a
     formatação. Mostra o diff antes.
  2. `Só mostrar o trecho para eu colar` — imprime o JSON a acrescentar e não toca no arquivo.
  3. `Não gravar` — nada é escrito; o verbo registra a recusa e segue.

Regras da escrita, quando autorizada:

- **Edição cirúrgica, nunca regeneração.** Acrescentar/atualizar as chaves aprovadas e mais nada. Um
  manifesto reescrito por nós perde comentários de quem o escreveu, ordem de campos e qualquer coisa
  que a família ainda não conheça.
- **Nunca sobrescrever o motor de outro repo.** `exec_fallback` aceita escalar e mapa
  (`${FLUX_ROOT}/shared/flux-context.md`), e este verbo grava **sempre** na chave do repo equipado:
  - campo ausente → criar o mapa com uma chave só, a deste repo;
  - já é um mapa → acrescentar/atualizar **apenas** `<slug>`, preservando `default` e as chaves dos
    outros repos;
  - já é um **escalar** → promovê-lo a mapa, movendo o valor existente para `default` e acrescentando
    a chave deste repo. A promoção preserva o comportamento anterior para todos os repos que já
    dependiam dele, e por isso não é uma quebra — mas é uma mudança de forma no arquivo do usuário, e
    portanto **entra no diff mostrado no gate**, escrita por extenso, nunca como detalhe silencioso.

  Gravar num escalar seria trocar o motor de todos os repos pelo motor deste, e um repo sem motor
  próprio passaria a ser executado pelo pipeline de outro em vez de cair no modo autônomo: falha
  silenciosa que produz código.
- **O manifesto é o mesmo que foi resolvido no Step 0.** Não criar um novo, não escolher outro nível
  da árvore, não "promover" o manifesto para mais perto do repo.
- **Sem manifesto, não há degrau.** No perfil genérico este gate **não abre**: não existe arquivo a
  editar. Em vez dele, uma linha honesta dizendo que declarar um `flux-context.json` é o que torna o
  que acabou de ser escrito reutilizável e descobrível, com o trecho pronto para colar.

---

## Step 7 — Registro e handoff

1. **Registrar o que foi criado**, conforme exige `${FLUX_ROOT}/shared/write-destination.md`: paths
   absolutos escritos, renomeados (com o nome do `.bak-`) e pulados. Sempre no chat; no board do elo
   que chamou, quando houver. Sem essa lista não existe rollback — existe caça ao arquivo.
2. **Reafirmar o inventário depois da equipagem**, com o mesmo vocabulário do banner. É o que permite
   ver, em uma linha, que `L2 ausente` virou `L2 <nome>` e que o motor saiu de `ausente` para
   `exec_fallback <cmd>`.
3. **Conferir que o que foi escrito é encontrável — nas duas camadas, com o mesmo rigor.** O arquivo
   existir não é o mesmo que ele ser usável, e o verbo que acabou de escrevê-lo é quem tem a
   informação para verificar isso barato. Deixar para o elo seguinte descobrir é entregar uma
   falha silenciosa com aparência de sucesso.

   - **L2, a suite** — o teste do `1a-bis` do `review-agents.md`: o `name:` do frontmatter está
     registrado como `subagent_type` nesta instalação? Não está → dizer isso **agora**, com os
     caminhos de instalação, em vez de deixar o próximo `review` declarar `L2 inalcancavel`.
   - **L0, o motor** — o teste equivalente, e ele é o do **Step 1 deste próprio verbo**: o nome
     gravado em `exec_fallback` está declarado **e invocável na sessão**? A pergunta é a mesma que o
     inventário faz, e um motor recém-escrito que a reprova é o pior resultado possível — o
     `flux:build` vai encontrar a declaração, tentar invocar e não achar comando nenhum, tarde demais,
     no meio de uma implementação. Não está invocável → dizer **onde** o arquivo nasceu, **qual**
     diretório o harness varre como comando (Step 3.2), e que enquanto isso o `build` continua caindo
     no modo autônomo. **Nunca declarar sucesso de equipagem de L0 sem esta conferência.**

   Uma camada que reprova o próprio teste sai do inventário do item 2 como `inalcancavel`, nunca como
   equipada. O banner é o que impede uma equipagem degradada de se passar por completa.
4. **Handoff.** O `equip` devolve o volante ao ciclo, escolhendo **um** próximo elo conforme o que se
   estava fazendo quando a falta apareceu:

   - Equipou motor e havia trabalho a fazer → `${FLUX_CMD}build <repo> <ticket>`.
   - Equipou suite e há PR aberta → `${FLUX_CMD}review <pr>`.
   - Equipou por manutenção, sem trabalho pendente → nada. Preparar terreno é entrega completa.

   Montar com o `FLUX_CMD` resolvido no preflight, **nunca** com `/flux:` literal.

Não rode o próximo elo automaticamente.

---

## Kits (`--from-kit <ref>`)

Um kit é um conjunto de artefatos **já escritos** que se instala em vez de autorar do zero. O formato
dele é `${FLUX_ROOT}/shared/kit-format.md` — o que um kit é, o shape do `flux-kit.json`, o que invalida
um kit e como um repo resolve para zero, um ou N kits. Este verbo **não reenuncia** nada disso: aponta
para lá e declara só o que é específico da instalação.

O que vale hoje, e só isto:

- `<ref>` resolve como **caminho**: literal (absoluto ou relativo ao `cwd`) ou, quando o perfil
  declara `kits_root`, o template resolvido com `{repo}` — o mesmo mecanismo de `specialists_root`.
- Resolveu para um diretório existente → **validar o `flux-kit.json` dele** pela seção "Kit inválido"
  do `kit-format.md` antes de qualquer escrita. Inválido → abortar com o path e o motivo; nunca
  instalar parcialmente o que sobrou de um kit quebrado.
- Válido → o conteúdo é instalado no destino aprovado, passando **integralmente** pelo contrato de
  destino, arquivo por arquivo, incluindo o gate por arquivo existente. O `manifest_fragment`, quando
  há, é **oferecido** no gate de manifesto que este verbo já tem, nunca aplicado por consequência.
- Não resolveu → **abortar**. Não cair na autoria do zero silenciosamente: quem passou `--from-kit`
  pediu um kit específico, e entregar outra coisa com o mesmo nome é a pior resposta possível.

**O que ainda não é feito aqui**, e é da issue seguinte da cadeia: resolver `<ref>` pelo **nome** do
kit (o campo `kit`) contra as `KIT_ROOTS` do preflight — hoje `<ref>` é sempre caminho —, e o GATE de
desambiguação com N kits que o `kit-format.md` prescreve para o lado da escrita. Enquanto isso não
existe, N kits não é um estado que este verbo alcança: quem passou um caminho já escolheu um.

---

## Rules

- **Preparo, não execução.** Este verbo equipa; quem trabalha é o resto da família.
- **Fora do repo alvo, sempre.** L2 e L0 nascem no destino aprovado, nunca dentro do checkout.
- **Nada é escrito sem o contrato de destino.** Cascata, canonização, três guardas, gate por arquivo
  existente e registro. Sem exceção, sem "só um arquivinho ao lado".
- **Manifesto tem gate próprio.** Escrever no `flux-context.json` é ação, não consequência.
- **Só o que falta.** Camada existente é reportada e preservada; substituir é decisão do usuário, no
  gate de arquivo existente.
- **Diagnóstico primeiro.** Nenhuma escrita antes do inventário, e o inventário sai no banner mesmo
  quando o verbo não escreve nada.
- Quando `NO_EMDASH` é `true`, nada que possa ir para o GitHub (título/corpo do PR draft de suite,
  comentário) usa travessão ou en-dash.
