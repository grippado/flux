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
    - file: shared/slack-directory.md
    - bin: git
  soft:
    - bin: gh
    - checkout_local
    - vault
---

# /flux:equip

O **verbo de preparo** da família: garante que um repo tenha o que os outros elos consomem e não
produzem, o **motor de execução** (L0) que o `flux:build` despacha e a **suite de specialists locais**
(L2) que `review`, `iterate` e `land` reconciliam. Fica **fora do ciclo**: entra quando falta uma das
duas camadas, e sai. As ofertas de Bootstrap dos outros elos chamam este verbo em vez de carregar a
lógica.

**Contrato de destino de escrita (onde qualquer arquivo pode nascer):** `${FLUX_ROOT}/shared/write-destination.md`
**Bootstrap de specialists (o que a suite L2 é e como se escreve):** `${FLUX_ROOT}/shared/bootstrap-specialists.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Descoberta das lentes (o que já existe antes de equipar):** `${FLUX_ROOT}/shared/review-agents.md`
**Gates com o usuário:** `${FLUX_ROOT}/shared/hitl.md`
**Disciplina de fan-out (a main orquestra, os agentes autoram):** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Preflight:** `${FLUX_ROOT}/shared/preflight.md`

## Banner de perfil — gabarito (copiar VERBATIM)

Todo output deste elo **abre** com o banner, copiado com as cercas, trocando só o que está entre
chaves (regras e degradações: `${FLUX_ROOT}/shared/preflight.md`, Passo 5). O gabarito mora no corpo
do elo de propósito: num shared, ele não chega ao contexto na hora de emitir.

````
```
perfil: {nome do manifesto | generico}{ (ancora: alvo <path>)} · nivel: {FULL|REDUCED|THIN}
lentes: L1 n/a · L2 {lista|ausente|inalcancavel} · L3 {lista|ausente|inalcancavel}
motor: {nativo <cmd> | exec_fallback <cmd> | ausente}
destino: {path canonico aprovado | nao resolvido}
degradacoes: {soft ausentes e o que se perde com cada um | nenhuma}
carimbo: {harness} | flux:equip@{flux_version}
```
````

Três particularidades, também declaradas em "Campos que não são de todos os elos" (preflight, Passo 5):

- **`holistico:` não entra**: o `equip` não revisa. A linha `lentes` fica, porque o inventário das
  camadas é o produto do diagnóstico.
- **`motor:` entra**, com o vocabulário do `flux:build` (`nativo` / `exec_fallback` / `ausente`): aqui,
  o motor que existe ou vai passar a existir.
- **`destino:` só existe aqui**, e sai `nao resolvido` até o gate de destino acontecer.

Abortagem segue o gabarito do "Formato da mensagem de abortagem" do preflight, verbatim, com
`${FLUX_CMD}` já substituído (`/flux:equip` num harness, `/flux-equip` em outro).

## Uso

```
/flux:equip <repo> [--engine-only] [--agents-only] [--expose-l3] [--from-kit <ref>] [--dry]
/flux:equip --slack-directory [--dry]          # sem repo: cria o diretório de alias do Slack
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
| `--slack-directory` | **Modo próprio, sem `<repo>`:** cria o esqueleto do diretório de alias de pessoas e canais do Slack, ao lado do manifesto, e oferece registrá-lo em `slack_directory`. Ignora todas as outras flags de camada e não toca em motor nem em suite. Ver "Step 4d". Ignorado sob `--from-map`. |
| `--dry` | Faz o diagnóstico completo, imprime o plano de equipagem e **para**. Nada é escrito, nenhum gate abre. Com `--slack-directory`, mostra só o caminho resolvido e o esqueleto. |

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
/flux:equip notifications --from-kit ~/agents/acme/kits/node-service
/flux:equip payments --expose-l3              # L3 do repo alcançável fora dele
/flux:equip                                   # dentro de <WORKSPACE_ROOT>/api-gateway
/flux:equip --slack-directory                 # diretório de alias do Slack, sem repo
```

## Out of scope (NUNCA faça)

- **Não escreva dentro do checkout do repo alvo.** Nem `.claude/agents/`, nem `.claude/commands/`, nem
  `AGENTS.md`: equipar a sua máquina não é mudar o ferramental do time, que é PR revisada no projeto
  (`${FLUX_ROOT}/shared/bootstrap-specialists.md`, "cria L2, nunca L3").
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
- `KITS` = `kits` — caminhos locais de kit, origem 1 do `KIT_ROOTS` (Passo 1d do preflight), opcional.
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

2. **Sem checkout local e sem `--from-kit`, abortar aqui**, nomeando a causa: uma suite ou um motor
   autorado sem ler o repo é arquivo genérico com nome específico, que a descoberta acharia e o próximo
   `review` invocaria como real. `checkout_local` continua `soft` no frontmatter porque, com
   `--from-kit`, o verbo faz trabalho completo sem abrir o repo; por isso o preflight segue, o banner
   declara a degradação, e a parada acontece aqui. Ao contrário de `review`, `iterate` e `land`, não há
   `THIN` para onde degradar.

3. Levantar o inventário das camadas. É este levantamento que vira o banner e o plano:

| camada | como verificar | estado |
|---|---|---|
| **L0 motor** | `<repo>/.claude/commands/<EXEC_COMMAND>.md` existe? Senão, o `EXEC_FALLBACK` que resolve **para este repo** (chave do slug, senão `default`) está declarado **e** invocável na sessão? | `nativo` / `exec_fallback` / `ausente` |
| **L2 specialists locais** | cascata de descoberta do `${FLUX_ROOT}/shared/review-agents.md`, passo 1a, **incluindo o 1a-bis** | `disponivel` / `ausente` / `inalcancavel` |
| **L3 specialists do repo** | varredura filtrada do `review-agents.md`, passo 1b | `disponivel` / `ausente` |

Três leituras do inventário mudam o que o verbo faz:

- **L2 `inalcancavel` não vira autoria**: a suite existe e não está registrada; escrever outra cria um
  segundo `name:` igual. O que falta é instalação (expor o diretório, desfazer colisão), não geração.
- **L3 presente não dispensa L2** (as lentes somam, `review-agents.md`); ela muda o conteúdo da suite
  gerada, que complementa em vez de repetir.
- **Motor `nativo` encerra a metade L0**: não se propõe fallback ao lado de motor nativo.

4. Com `--dry`, imprimir banner + inventário + plano de equipagem (o que seria escrito, onde, com que
   nome) e **parar**. Nenhum gate abre no `--dry`: uma pergunta feita numa execução que não escreve
   treina o usuário a responder no automático.

   **O "onde" nem sempre existe ainda.** Quando a cascata de destino
   (`${FLUX_ROOT}/shared/write-destination.md`) não produz valor até o degrau 4 (o caso comum do perfil
   genérico), o plano imprime o default da família (`~/.claude/flux-specialists/<slug>/`) **marcado como
   não confirmado**, dizendo que numa execução real ele seria a opção recomendada de um GATE. O motor tem
   a linha equivalente (Step 3.2, ou `nao resolvido`). A linha `destino:` do banner segue
   `nao resolvido`.

---

## Step 2 — Plano de equipagem e gate único de escopo

O plano é uma lista curta, uma linha por artefato pretendido (o que é, para que serve, qual estado do
inventário o justificou), e vai para o chat **antes** de qualquer gate de destino.

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

A cascata acima aponta para raízes de specialists, e nenhum harness varre aquelas raízes procurando
comandos: um motor escrito ali seria um `EXEC_FALLBACK` não invocável.

Um motor só é invocável se nascer num diretório que o harness varre **como comando**. Resolver o
destino do motor nesta ordem, parando no primeiro que existir na instalação:

1. `~/.claude/commands/` — diretório de comandos de usuário do Claude Code.
2. `~/.cursor/commands/` — o equivalente no Cursor.
3. Nenhum dos dois existe → **perguntar** ao usuário onde os comandos dele são varridos, com a mesma
   mecânica do GATE de destino (opção "informar outro caminho"). Não inventar um diretório: um motor
   num lugar que o harness não lê é trabalho jogado fora com aparência de trabalho feito.

Achado mais de um, escrever **em um só**, o do harness em que a sessão roda (o único em que o Step 7
confere a invocabilidade); dois comandos com o mesmo nome não têm precedência definida.

Este destino entra como path ditado (degrau 1 da cascata) e passa pelo contrato inteiro (normalização,
F1, canonização, F2, F3, arquivo existente). F2 dispara com frequência aqui, porque `~/.claude/`
costuma ser symlink para um repositório de dotfiles.

### 3.3 — O que é deste verbo e não do contrato

1. **No máximo um gate de destino por camada**, e só quando a camada for equipada. O da suite vale para
   tudo que ela escreve; o do motor só vira pergunta quando nenhum diretório de comandos existe.
2. **Destino resolvido no contexto principal, antes do despacho** (subagente não abre gate). Os autores
   recebem o path canônico já aprovado e escrevem ali e em mais lugar nenhum.
3. **O que o `equip` escreve tem que ser o que a descoberta acha depois.** A suite é achada pela cascata
   do `review-agents.md` (passo 1a, que percorre a mesma cascata de destino, inclusive
   `write_destinations`, mais o degrau do kit no fim); o motor, pelo Step 2 do `flux:build` (nativo →
   `exec_fallback` do repo → `default` → autônomo). Destino fora disso é arquivo escrito e elo seguinte
   oferecendo criar de novo. O Step 7.3 confere as duas.

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

**Com `--from-map`, este Step não roda** (nem o `collisions`): há um `flux-agents.json` por raiz de
agents, o `map` despacha vários `equip` em paralelo, e cada filho só enxerga a própria parte. Os fatos
voltam no contrato de retorno, e a main do `map` reconcilia (um escritor por execução).

Invocado direto, sem `--from-map`: ao equipar um repo (Steps 4, 4b e 5), **atualizar a entrada dele**
no `flux-agents.json` e recomputar `collisions`.

### Arquivo existente sob `--from-map`

O arquivo pode ter nascido entre o gate da main e o despacho. Encontrando um, este processo **não
escreve, não sobrescreve, não faz backup e não decide**: devolve o caminho em `recusado:` e segue. A
main do `map` abre o gate que falta. A invariante "nenhum arquivo existente é sobrescrito em silêncio"
é adiada para quem tem canal com o usuário, nunca relaxada: no instante do consentimento, o arquivo
não existia.

O escopo é **um repo**: o `map` levanta, o `equip` equipa e carimba o que equipou.

- **Quando o índice pode ser escrito, e por quem, é do `agents-index.md`** (seção "Quem escreve"). Este
  Step **executa** aquele contrato; não o reenuncia.
- Não havendo índice na máquina, **não criar um** a partir de um repo só: um índice parcial seria
  indistinguível de um índice completo e faria os outros elos confiarem num mapa com um repo. Relatar
  a ausência e oferecer o `${FLUX_CMD}map`.

---

## Step 4d — Criar o diretório do Slack (`--slack-directory`)

Modo próprio: roda **no lugar** dos Steps 1 a 5, sem repo, sem inventário e sem gate de escopo do
Step 2. O artefato é de **contexto**, não de repo, e é consumido pelo `flux:reply`
(`${FLUX_ROOT}/shared/slack-directory.md`, que é a fonte do formato).

**Banner e `--dry`.** O output abre com o banner do elo, **sem** `lentes:` e **sem** `motor:`: não houve
inventário, e campo que o elo não resolveu não entra (mesma regra do `holistico:` no `reply`). `destino:`
segue a regra do banner do verbo: `nao resolvido` até o gate de criação ser respondido (sempre sob
`--dry`), e o diretório do arquivo depois da aprovação. Com `--dry`: imprimir o banner, o caminho
resolvido e o esqueleto, e **parar**; nenhum gate abre e nada é escrito.

1. **Exige manifesto.** O caminho do diretório é relativo ao manifesto, então sem `flux-context.json`
   resolvido no Step 0 não há onde ancorá-lo: dizer isso em uma linha, entregar o esqueleto no chat
   para colar e parar. Nenhum gate abre.
2. **Já existe?** Manifesto com `slack_directory` apontando para arquivo existente: reportar o caminho
   e a contagem de pessoas, canais e grupos, e **parar**. Arquivo existente nunca é reescrito por este
   verbo; evoluir o conteúdo é do usuário. Campo declarado e arquivo ausente: criar o arquivo no caminho
   declarado (vale o item 3).
3. **Destino.** O caminho declarado em `slack_directory` vence (relativo ao manifesto, ou `~/`). Sem o
   campo, o default é `slack-directory.json` no diretório do manifesto, ao lado dele, para o caminho
   relativo valer entre máquinas. Não há cascata. As guardas de
   `${FLUX_ROOT}/shared/write-destination.md` valem para o **diretório do arquivo resolvido** (symlink,
   repositório que não é o alvo, diretório gerenciado por dotfiles), e o contrato de arquivo existente
   também.
4. **Esqueleto**, com `workspace` igual ao `name` do manifesto e as quatro tabelas vazias:

```json
{
  "version": 1,
  "workspace": "<name do manifesto>",
  "_doc": "Alias de pessoas e canais do Slack. Formato: shared/slack-directory.md do flux.",
  "people": {},
  "usergroups": {},
  "channels": {},
  "groups": {}
}
```

5. **Gate de criação** (`${FLUX_ROOT}/shared/hitl.md`), depois de mostrar o caminho e o conteúdo:
   `Criar o diretório do Slack?`, com `Criar (Recomendado)`, `Só mostrar o esqueleto` e `Não criar`.
6. Escrito o arquivo, seguir ao **Step 6** com o campo `slack_directory` (caminho relativo ao
   manifesto) como único candidato à persistência, se o manifesto ainda não o declara.
7. **Handoff:** dizer como preencher uma entrada (o `user_id` de pessoa e o `channel_id` de canal vêm do
   perfil ou do permalink no Slack) e que `purpose` e `intents` do canal é o que permite ao
   `flux:reply` responder curto onde o canal pede. O verbo **não preenche entradas** por conta própria:
   nome e id de gente real são do usuário.

---

## Step 5 — Equipar L0 (o motor de execução)

Roda quando o escopo aprovado inclui motor e o inventário disse `motor ausente`.

Como não se escreve no repo, equipar L0 é preencher o **segundo** degrau da busca do `flux:build`
(nativo → `exec_fallback` do repo → `exec_fallback.default` → autônomo): autorar um comando de execução
no destino do Step 3.2 e, no Step 6, declarar o nome dele em `exec_fallback` **sob a chave deste repo**.
O nome nasce único (`flux-engine-<slug>`, ou o que o gate por arquivo existente permitir), para equipar
o segundo repo sem desequipar o primeiro.

O motor autorado carrega, sem negociação, a disciplina que um motor nativo daria:

- worktree dedicado, nunca a árvore principal (`${FLUX_ROOT}/shared/worktree-discipline.md`);
- ler `AGENTS.md`/`CLAUDE.md` do repo antes de escrever, com as convenções do repo vencendo qualquer
  default;
- rodar os checks que o repo **declarar** (lint/typecheck/test), e reportar verde/total;
- abrir a PR sempre como **draft**.

Autorar exige ler o repo (stack, scripts, convenção de branch e de commit, o que o CI roda): **vai para
subagente**, com o destino já aprovado, e volta com a lista do que pretende escrever; o gate por arquivo
existente é da main. Abrir PR com um motor nativo no repo alvo fica fora do escopo pelo mesmo motivo da
suite em L2: promover o motor local a nativo é uma PR feita à mão, revisada pelo time.

Sem `EXEC_FALLBACK` declarável (perfil genérico), o motor continua sendo escrito e continua
invocável à mão; o que se perde é a descoberta automática pelo `build`. Dizer isso ao usuário no
mesmo instante, não no fim.

---

## Step 6 — Persistir no manifesto (gate próprio, e este é novo)

**Com `--from-map`, este Step não escreve**: apura o que persistiria (inclusive o que veio de
`manifest_fragment`, já filtrado pela tabela abaixo e marcado como vindo de kit) e devolve em
`manifesto_pendente:`. Quem grava é a main do `map`, com o gate: escrever no manifesto é categoria de
gate **sempre**, subagente não abre gate, e há um `flux-context.json` por perfil.

Este é o único verbo que altera o `flux-context.json`, e o arquivo costuma ser a configuração versionada
que a pessoa carrega entre máquinas; por isso a escrita é **ação com gate explícito**, nunca efeito
colateral de ter equipado.

Até três coisas podem ser persistidas, e **cada uma é uma escolha separada**:

| campo | o que grava | por que persistir |
|---|---|---|
| `exec_fallback.<slug>` | o nome do motor autorado no Step 5 **ou o sugerido pelo `manifest_fragment` do kit instalado**, sempre **sob a chave deste repo** | sem ele, o `flux:build` não acha o motor e continua caindo no modo autônomo — o motor existe e não é usado |
| `write_destinations` | o destino canônico aprovado + o estado das guardas | sem ele, o gate de destino volta a cada execução, e o `review-agents.md` perde o degrau que encontra a suite fora do manifesto |
| `slack_directory` | o caminho do diretório criado no Step 4d, relativo ao manifesto | sem ele, o `flux:reply` não resolve alias de pessoa e canal e volta a pedir permalink. **Só o Step 4d grava esta chave; nunca via `manifest_fragment`** |

**A tabela é fechada: é tudo que este verbo persiste. A allowlist do `manifest_fragment` é o subconjunto dela alcançável por kit.** O `${FLUX_ROOT}/shared/kit-format.md`
delega a este verbo a validação das chaves da fatia, porque **quem aplica é quem valida**; a lista é
esta, e hoje ela tem **um** item alcançável pelo fragmento: `exec_fallback`. `slack_directory` está na tabela, mas é
gravada só pelo Step 4d, que é a ação direta do usuário; um fragmento de kit que a sugira é ignorado e declarado. Chave fora da tabela é
**ignorada e declarada** — nunca oferecida no gate, nunca gravada, nem com aprovação, porque o gate
pergunta se pode escrever e não se aquela chave era legítima.

A tabela é fechada porque um `flux-kit.json` pode ser de terceiros: sem ela, instalar um kit passaria a
propor escrever contexto de time alheio no manifesto (`${FLUX_ROOT}/shared/kit-format.md`, `provides`
contra `manifest_fragment`).

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

- **Edição cirúrgica, nunca regeneração**: só as chaves aprovadas, preservando comentários, ordem e
  campos que a família não conhece.
- **Nunca sobrescrever o motor de outro repo.** `exec_fallback` aceita escalar e mapa
  (`${FLUX_ROOT}/shared/flux-context.md`), e este verbo grava **sempre** na chave do repo equipado:
  campo ausente → mapa com uma chave só; mapa → acrescentar ou atualizar **apenas** `<slug>`,
  preservando `default` e as outras chaves; **escalar** → promover a mapa, movendo o valor para
  `default` e acrescentando a chave deste repo, com essa mudança de forma **escrita por extenso no diff
  do gate**. Gravar num escalar trocaria o motor de todos os repos pelo deste.
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
3. **Conferir que o que foi escrito é encontrável, nas duas camadas.**
   - **L2**: o teste do `1a-bis` do `review-agents.md` (o `name:` está registrado como `subagent_type`
     nesta instalação?). Não está → dizer agora, com os caminhos de instalação.
   - **L0**: o teste do Step 1 deste verbo (o nome gravado em `exec_fallback` está declarado **e
     invocável na sessão**?). Não está → dizer onde o arquivo nasceu, qual diretório o harness varre como
     comando (Step 3.2), e que o `build` segue caindo no modo autônomo. **Nunca declarar sucesso de L0 sem
     esta conferência.**

   Camada que reprova o próprio teste sai do inventário como `inalcancavel`, nunca como equipada.
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
  há, é **oferecido** no gate de manifesto que este verbo já tem, nunca aplicado por consequência — e
  **pelas regras de escrita daquele gate**, não pela forma em que o fragmento veio escrito: o
  `exec_fallback` sugerido é o valor do motor daquele kit, e ele é gravado na chave do repo equipado,
  nunca como escalar no manifesto do usuário. É aqui que a validação das chaves do fragmento acontece,
  porque **quem aplica é quem valida** (`${FLUX_ROOT}/shared/kit-format.md`).
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
