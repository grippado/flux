---
name: map
description: "Verbo de sanidade `flux:map` — levanta a instalação inteira da família nesta máquina (raízes de agents, manifestos de contexto, repos conhecidos, as três lentes por repo, colisões de `name:`) e grava o índice que os demais elos consomem. Roda fora de qualquer trabalho: não revisa, não implementa, não toca repo alvo. Executando de novo, mostra o que mudou desde a última vez — agents novos, repos novos, lentes que quebraram — e só escreve depois do gate. Sugerido antes de tudo; obrigatório para nada."
user-invocable: true
requires:
  hard:
    - file: shared/agents-index.md
    - file: shared/review-agents.md
    - file: shared/write-destination.md
    - file: shared/flux-context.md
    - bin: git
  soft:
    - checkout_local
    - index
---

# /flux:map

O **verbo de sanidade** da família `flux:`. Ele responde uma pergunta que nenhum outro elo responde,
porque nenhum outro tem escopo para isso: **o que esta máquina tem, e o que está torto?**

Todo elo verifica, no preflight, o que *ele* precisa para *aquele* trabalho. Ninguém olha o conjunto.
O resultado é que uma suite quebrada, um manifesto renomeado ou uma colisão de `name:` só aparece no
meio de uma entrega, um elo por vez, e sempre como degradação — nunca como diagnóstico.

O `map` é esse diagnóstico, feito de uma vez, fora de qualquer trabalho. O artefato que ele deixa é o
`flux-agents.json` (`${FLUX_ROOT}/shared/agents-index.md`), que é o que torna o levantamento
reaproveitável em vez de descartável.

```
             ┌──────────────────┐
             │    flux:map      │  levanta a instalação · grava o índice     ← este
             └────────┬─────────┘  (fora do ciclo, sanidade da família)
                      │ informa
                      ▼
             ┌──────────────────┐
             │   flux:equip     │  L0 motor · L2 specialists · expõe L3
             └────────┬─────────┘  (fora do ciclo, preparo do terreno)
                      │ equipa
                      ▼
   issue → build → review/peek → iterate → land → reply
```

**Contrato do índice (formato, frescor, quem escreve):** `${FLUX_ROOT}/shared/agents-index.md`
**As três lentes e a escada de alcance da L3:** `${FLUX_ROOT}/shared/review-agents.md`
**Contrato de destino de escrita:** `${FLUX_ROOT}/shared/write-destination.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Gates com o usuário:** `${FLUX_ROOT}/shared/hitl.md`
**Disciplina de fan-out:** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Preflight:** `${FLUX_ROOT}/shared/preflight.md`

## Sugerido antes de tudo, obrigatório para nada

**Esta é a regra que mais importa neste verbo, e ela é fácil de perder.**

O `map` melhora o resultado dos outros elos; ele **não os habilita**. Sem índice, todo elo cai na
varredura direta — o comportamento que existia antes deste verbo — e declara `indice ausente` nas
degradações. Nada aborta, nada é bloqueado, nada exige setup.

A regra de onde o requisito `index` pode ser `hard` (em lugar nenhum, inclusive aqui) está em
`${FLUX_ROOT}/shared/agents-index.md` e não é repetida: este verbo declara `file: shared/agents-index.md`
em `hard`, que é o **contrato**, e não declara o **artefato**, porque abortar por falta do índice seria
abortar exatamente na máquina onde este verbo é indispensável.

Uma família que exige um comando de preparo para funcionar deixou de funcionar na máquina de quem
acabou de instalá-la, que é o oposto do que este verbo existe para fazer.

Vale o mesmo para o que ele diagnostica: `map` **relata, oferece e despacha**. O único arquivo que ele
escreve com as próprias mãos é o índice; suite, espelho e motor são escritos pelo
`${FLUX_CMD}equip`, que o `map` chama sob consentimento (seção "Despacho dos consertos"). A diferença
importa: cada escrita continua sob o contrato que a governa, e recusar todos os consertos deixa o
`map` sendo exatamente o que ele era, um levantamento.

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
destino: {path canonico aprovado | nao resolvido}
degradacoes: {soft ausentes e o que se perde com cada um | nenhuma}
```
````

Duas particularidades, declaradas também na tabela "Campos que não são de todos os elos" do Passo 5 do
preflight — o gabarito aqui garante o template em contexto, aquela tabela garante que nenhum elo
invente campo:

- **`holistico:` não entra**, pelo mesmo motivo do `equip`: este verbo não revisa nada, então resolver
  um reviewer seria verificar um agente que não vai ser invocado. A linha `lentes` fica, e aqui ela é
  ainda mais central que lá: o inventário das camadas **é o produto** deste verbo. Quando o
  levantamento cobre vários repos, `lentes:` traz o agregado (quantos repos em cada estado) e o
  detalhe por repo vai no relatório, que é onde ele cabe.
- **`destino:` entra**, porque este verbo escreve um arquivo no disco de alguém — o índice. Vale a
  regra do `equip`: enquanto o gate de destino não tiver acontecido, a linha sai como `nao resolvido`.
- **`motor:` não entra.** Este verbo não escolhe nem produz motor; quando um repo está sem L0, isso é
  linha do relatório de integridade, não campo de banner.

O gabarito é copiado verbatim, inclusive o trecho `(ancora: alvo <path>)` — que **este verbo nunca
emite**, porque ele não recebe alvo e a âncora é sempre o `cwd` (ver Step 0-context). Manter o
template íntegro vale mais que podá-lo por elo.

Abortagem segue o gabarito do "Formato da mensagem de abortagem" do preflight, verbatim, com
`${FLUX_CMD}` já substituído.

## Fronteira com o preflight (os dois olham os mesmos fatos)

Sem esta regra escrita, os dois divergem, e passam a discordar sobre a mesma máquina:

| | preflight | `flux:map` |
|---|---|---|
| **escopo** | o que **este elo** precisa | a instalação inteira |
| **momento** | na invocação de um trabalho | fora de qualquer trabalho |
| **saída** | banner + nível de capacidade daquela execução | relatório de instalação + índice |
| **efeito de falta** | degrada ou aborta aquele elo | vira item do relatório |

O `map` **não substitui** o preflight de ninguém: um elo que rodou depois de um `map` verde ainda
resolve e confere as próprias lentes, porque a lista de agentes é da sessão e a sessão do `map` não é
a dele (`${FLUX_ROOT}/shared/preflight.md`, Passo 3-bis).

## Uso

```
/flux:map                         # levanta tudo, mostra o plano, escreve após o gate
/flux:map --repo <slug>           # só a entrada daquele repo
/flux:map --dry                   # levanta e relata; nunca escreve, nenhum gate abre
/flux:map --apply                 # pula o gate de escrita (automação)
/flux:map --no-fix                # levanta e relata; não oferece despachar conserto nenhum
```

| Flag | Efeito |
|------|--------|
| `--repo <slug>` | Restringe o levantamento a um repo. Útil depois de mexer numa suite; barato o bastante para rodar sempre que a suspeita for pontual. |
| `--dry` | Diagnóstico completo e relatório, **sem escrever nada e sem abrir gate**. |
| `--apply` | Pula **o gate do índice, e só ele**. Ver a matriz abaixo: o despacho de consertos exige aceite item a item, sempre, sem exceção e sem flag que o desligue. |
| `--no-fix` | Desliga a fase de despacho: o relatório sai com as invocações de remediação impressas, e nada é oferecido. É o modo "só quero olhar". |

### Matriz de flags (as combinações, explicitamente)

Há **dois** gates neste verbo, e eles não são intercambiáveis: um autoriza escrever o índice, outro
autoriza cada conserto. A tabela existe porque `--apply` foi cunhado quando havia um gate só.

| invocação | grava o índice | gate do índice | despacha consertos | gate do despacho |
|---|---|---|---|---|
| (nenhuma flag) | sim | **sim** | sim | **sim, item a item** |
| `--dry` | não | não abre | **não** | não abre |
| `--apply` | sim | **pulado** | sim | **sim, item a item** |
| `--no-fix` | sim | sim | **não** | n/a |
| `--apply --no-fix` | sim | pulado | não | n/a |
| `--dry --apply` | **erro de invocação** | — | — | — |

Três regras que a tabela codifica:

- **Nenhuma flag pula o gate de despacho.** Um `map` que escrevesse suites, espelhos, motores e
  manifesto em N repos sem uma única confirmação humana em ponto nenhum da cadeia é exatamente o que a
  seção de despacho chama de o comportamento mais destrutivo da família. `--apply` existe para
  automação de **levantamento**, não de reparo.
- **`--dry` desliga o despacho junto**, e não só a escrita do índice: relatar sem escrever nada é o
  ponto inteiro da flag.
- **`--dry --apply` é contradição, não precedência.** Dizer qual das duas o usuário quis e parar, em
  vez de escolher uma.

**Escrever o índice sempre passa pelo gate, e é isso que produz o dry-run natural.** Na primeira execução o
plano é "criar o índice"; nas seguintes, é o **diff** contra o que já está lá — agents novos, repos
novos, suites que sumiram, colisões que apareceram. Não há regra de "segunda execução é diferente":
há uma regra só, a de que escrever na máquina de alguém pede confirmação, e o diff é a consequência
de haver algo com que comparar.

## Step 0-context: resolver perfil

**Seguir `${FLUX_ROOT}/shared/flux-context.md`.** Este verbo tem uma particularidade que nenhum outro
tem, e ela precisa estar dita: ele **não recebe alvo**, então a âncora é sempre o `cwd` (passo 3
daquele contrato), e o perfil resolvido dali é o do banner.

Mas o levantamento **não se restringe a esse perfil**: o passo 3 da Ordem de execução descobre *todos*
os manifestos da máquina, porque mapear só o contexto de onde você sentou seria mapear um pedaço e
chamar de máquina. O perfil do `cwd` decide o banner; os
manifestos descobertos decidem o que entra no índice. Não confundir os dois é o que impede este verbo
de escrever um índice que descreve menos do que o nome dele promete.

Sem manifesto nenhum: perfil genérico, e o levantamento cobre os repos detectados sob o `cwd`.

## Ordem de execução

1. **Preflight** (`${FLUX_ROOT}/shared/preflight.md`), com a ressalva da fronteira acima.
2. **Descobrir as raízes de agents** que este harness varre. Não é lista deste contrato: cada harness
   declara as suas. Nenhuma raiz declarada ⇒ **não há onde o índice morar, e só isso**: o levantamento,
   o delta e o relatório de integridade não dependem de destino, então eles rodam e saem normalmente;
   o que não acontece é a gravação, declarada em `destino: nao resolvido` e nas degradações. Nunca
   inventar path por analogia com outro harness.
3. **Descobrir os manifestos de contexto** (`flux-context.json`), pela varredura do
   `${FLUX_ROOT}/shared/flux-context.md`. Para cada um: `name`, `workspace_root`, `repos`.
4. **Levantar os repos** — os declarados nos manifestos e os detectados sob cada `workspace_root`. Por
   repo, as três lentes: L1 (holístico resolvido), L2 (suite curada, pela cascata de
   `specialists_root`), L3 (o diretório de agents do repo e o filtro de intenção de review, ambos definidos no 1b do
   `${FLUX_ROOT}/shared/review-agents.md` — não reenunciar o path aqui).
5. **Computar colisões** de `name:` entre tudo que foi levantado, e o `sha256` de cada conjunto.
6. **Relatar** (formato abaixo).
7. **Gate de escrita** e, aceito, gravar o índice conforme o contrato de destino.
8. **Despacho dos consertos**, quando o usuário aceitar algum no gate (seção própria abaixo), e
   **reconciliação** do índice depois que os filhos voltarem.

**Os passos 4 e 5 vão para subagentes**, um por repo, em paralelo num único bloco
(`${FLUX_ROOT}/shared/fanout-discipline.md`). É o passo caro deste verbo — e o motivo de ele existir é
justamente concentrar esse custo aqui, uma vez, em vez de espalhá-lo por toda invocação de todo elo.
Na main ficam a descoberta de raízes e manifestos (barata), o relatório e o gate.

## O relatório

Aberto pelo banner do preflight, com `destino:` (é um verbo que escreve) e sem `holistico:` (não
revisa), como o `equip`.

O corpo tem três seções, e **a terceira é a razão de o verbo existir**:

1. **Inventário** — raízes, manifestos, repos, e por repo o estado das três lentes.
2. **Delta** — o que mudou desde o `generated_at` do índice anterior. Vazio na primeira execução, e
   dizer que está vazio por ser a primeira, não por não haver mudanças.
3. **Integridade** — o que está torto, com a remediação de cada caso:

| achado | remediação a oferecer |
|---|---|
| repo com `L2 ausente` | `${FLUX_CMD}equip <slug> --agents-only` |
| repo com `L3` presente e inalcançável | o degrau aplicável da escada (`${FLUX_ROOT}/shared/review-agents.md`, 1b-bis) |
| espelho L3 defasado (`synced_from_sha256` ≠ atual) | `${FLUX_CMD}equip <slug> --expose-l3` |
| colisão de `name:` entre suites | a remediação da terceira causa do 1a-bis (`${FLUX_ROOT}/shared/review-agents.md`) |
| manifesto declarando repo sem checkout local | clonar, ou remover do `repos` — dizer as duas, não escolher |
| agent sem `name:` no frontmatter | apontar o arquivo; por que ele não é invocável está no item 2 do 1a-bis |
| repo sem motor de execução (L0) | `${FLUX_CMD}equip <slug> --engine-only` |

**Nenhuma dessas remediações é executada por este verbo.** O `map` não escreve suite, não escreve
espelho, não mexe em manifesto. O que ele faz é **despachar** o verbo que é dono de cada gate, o que é
outra coisa — e é o assunto da seção seguinte.

## Despacho dos consertos (fan-out de `equip`)

Um doctor que só reclama é meio doctor. Depois do relatório, o `map` oferece rodar as remediações, e
as executa **chamando o `${FLUX_CMD}equip`** — nunca escrevendo por conta própria. Quem escreve segue
sendo o dono do gate; o `map` vira a porta de entrada única.

Esta é a **Forma 2** do `${FLUX_ROOT}/shared/fanout-discipline.md`, e ela só existe sob as três
garantias declaradas lá: todo gate na main antes do despacho, filho que nunca sobrescreve, filho que
nunca escreve no manifesto. Não confundir com o que `review`, `iterate`, `land` e `build` fazem: eles
**oferecem** o `equip` e o rodam na main (Forma 1), um por execução. Este verbo despacha N, e é por
isso que ele precisa das garantias.

### O gate acontece na main, antes do despacho

**Item a item, nunca um "consertar tudo".** Um comando de diagnóstico que aplica N escritas de uma
tacada é o mais destrutivo da família, não o mais útil.

O gate segue o gabarito do `${FLUX_ROOT}/shared/hitl.md` — header curto, uma opção por remediação com
o repo e a invocação exata, e **a saída inócua por último**, nunca omitida: "não consertar nada agora,
só o relatório". Um gate sem porta de saída não é gate, é pedágio, e este é o único ponto da família
onde N escritas são autorizadas de uma vez.

Duas razões para o gate ser aqui e não dentro de cada filho:

- **Subagente não tem canal com o usuário.** Um `equip` despachado que abrisse gate travaria. É a
  mesma razão pela qual o `flux:land` passa `--auto` ao `iterate`.
- **O gate de destino é de escopo máquina, e este é o verbo de escopo máquina.** Resolver a cascata do
  `${FLUX_ROOT}/shared/write-destination.md` **uma vez**, aqui, é melhor do que N filhos perguntando N
  vezes onde escrever na mesma máquina. O destino resolvido desce no prompt de cada filho como fato
  dado, no mesmo espírito do Passo 3-bis do preflight.

O que o usuário aprovou no gate **é** o consentimento; nenhum filho re-pergunta nada.

### O fan-out é seguro porque os destinos são disjuntos

Um `equip` por repo, todos no mesmo bloco (`${FLUX_ROOT}/shared/fanout-discipline.md`). Repos
diferentes escrevem em `<raiz de agents>/<ctx>/<slug>/` diferentes, então não colidem **por desenho**.

**Menos num ponto, e é o ponto que decide a corretude desta fase:** há **um** `flux-agents.json` por
raiz de agents, e ele é compartilhado por todos os filhos. Se cada `equip` carimbasse a própria
entrada, N filhos escreveriam o mesmo arquivo em paralelo — última escrita vence, e o índice sai
descrevendo um subconjunto arbitrário do que acabou de acontecer.

Por isso, **despachado pelo `map`, o `equip` não escreve o índice**: ele devolve os fatos, e a main
reconcilia. Um único escritor por execução, que é a mesma disciplina do board-keeper do `flux:land`.

### Contrato de retorno de cada `equip` despachado

Invocação: `${FLUX_CMD}equip <slug> <flags da remediação> --from-map`.

O `--from-map` diz ao `equip` três coisas, e são exatamente as três garantias da Forma 2:

1. **O consentimento de escopo e de destino já foi dado** no gate desta main; não abrir gate.
2. **O carimbo no índice é do chamador**; não escrever `flux-agents.json`.
3. **Arquivo existente e manifesto não são dele.** O gate por arquivo existente
   (`${FLUX_ROOT}/shared/write-destination.md`) é posterior ao levantamento por natureza — o arquivo
   pode ter nascido entre o gate e o despacho —, e persistir no `flux-context.json` é categoria de
   gate sempre (`${FLUX_ROOT}/shared/hitl.md`). Nos dois casos o filho **para, não escreve, e devolve**;
   quem decide é esta main.

Fora isso ele roda normalmente: a cascata e as três guardas do contrato de destino continuam valendo,
já resolvidas.

Retorno curto exigido, e nada além dele:

```
- repo: <slug>
- fez: <lista curta do que foi escrito, ou nada>
- paths: <caminhos criados, ou nenhum>
- l2: <path da suite | inalterado | n/a>
- l3_mirror: <path do espelho + sha256 da origem | inalterado | n/a>
- motor: <nome do comando criado | inalterado | n/a>
- recusado: <arquivos que já existiam e NÃO foram tocados, ou nada>
- manifesto_pendente: <o que persistiria em flux-context.json, ou nada>
- status: <ok | parcial | falhou>
- bloqueios: <lista curta, ou nenhum>
```

Proibido no retorno: conteúdo de arquivo, transcrição do que foi feito, diff. A main **não relê** o
que o filho escreveu para conferir; confia no retorno, e se precisar verificar, despacha outra
apuração.

### Filho que falha, não volta, ou volta incoerente

Um fan-out sem caminho para o filho que morre produz o pior resultado possível aqui: o item some do
relatório e a Integridade reemitida diz que ele "continua", sem distinguir **tentou e falhou** de
**nem foi tentado**. Regras:

- **Sem retorno, ou retorno fora do contrato** ⇒ tratar como `status: falhou` com motivo
  `sem retorno`. Nunca inferir sucesso de silêncio.
- **`status: falhou` ou `parcial`** ⇒ a entrada daquele repo **não** é atualizada no índice; ela fica
  como estava, e o item permanece na Integridade **marcado como tentado sem êxito**, que é um terceiro
  estado e precisa aparecer como tal.
- **A main não relê o disco para conferir** (contrato de retorno). Precisando verificar, despacha
  outra apuração — nunca abre o arquivo aqui.
- Falha de um filho **não cancela os outros**: destinos disjuntos, resultados independentes.

### Reconciliação (a main, depois que os filhos voltam)

1. Juntar os retornos e **atualizar o índice de uma vez só**: as entradas dos repos equipados, os
   `synced_from_sha256` dos espelhos novos, e o recálculo de `collisions` — que muda com espelho novo
   e por isso **só pode ser computado depois de todos**, nunca por filho.
2. Escrever o `flux-agents.json`, uma vez, no destino já resolvido.
3. **Arquivo existente devolvido em `recusado:`** ⇒ abrir aqui o gate por arquivo existente que o
   filho não podia abrir, com as saídas do `${FLUX_ROOT}/shared/write-destination.md`. Aceito, a
   escrita daquele arquivo acontece nesta main.
4. **`manifesto_pendente:` não vazio** ⇒ abrir o gate de manifesto (`${FLUX_ROOT}/shared/hitl.md`) e,
   aceito, gravar o `flux-context.json` **uma vez**, com todos os pendentes juntos. Há um manifesto
   por perfil: é o mesmo recurso compartilhado do índice, e vale a mesma regra de escritor único.
5. Reemitir a seção **Integridade** com o estado depois dos consertos: o que saiu da lista, o que
   continua, o que foi tentado sem êxito, e o que ficou pendente de gate.

`FLUX_CMD` em `UNAVAILABLE` (Passo 1b do preflight) **desliga esta fase inteira**, e ela degrada para
o que o verbo já fazia: imprimir as invocações para o usuário rodar à mão. **Isso vai para
`degradacoes:` no banner**, com esta grafia: `despacho indisponivel — FLUX_CMD nao resolveu; as
remediacoes saem impressas`. Sem a linha, o output fica indistinguível do caso em que o usuário
recusou os consertos, que é outro estado e leva a outra conclusão sobre a máquina.

**Fan-out parcial também é degradação de banner**, não só linha de relatório: filhos com
`status: falhou` ou `parcial` saem como `consertos parciais — <n> de <m> falharam`. Nada de executar o
Bootstrap inline como consolo — vale aqui o precedente do `land` em
`${FLUX_ROOT}/shared/codex-compat.md`.

## Out of scope (NUNCA faça)

- **Não conserte nada com as próprias mãos.** Nem suite, nem manifesto, nem agent, nem espelho. O
  `map` diagnostica e **despacha**; quem escreve reparo é o `equip`, que é o dono dos gates. A
  distinção não é formalidade: despachar mantém cada escrita sob o contrato que a governa, enquanto
  reimplementar o reparo aqui duplicaria os gates em dois verbos e faria um comando de escopo máquina
  escrever em N repos por conta própria.
- **Não escreva dentro de checkout nenhum.** O índice mora na raiz de agents; nada é escrito em repo
  alvo, por nenhum motivo.
- **Não invoque agente de repo para "testar se funciona".** Invocar um agent de execução por engano
  tem efeito colateral no repo de outra pessoa. Presença e invocabilidade se apuram por leitura e pela
  lista da sessão, nunca por execução de teste.
- **Não revise, não implemente, não abra PR.**
- **Não aborte por `FLUX_CMD UNAVAILABLE`.** O Passo 1b do preflight manda a fase que depende de
  despacho abortar, e o `flux:land` de fato aborta inteiro. Aqui a divergência é deliberada e está
  declarada: o produto deste verbo é o **relatório**, não o despacho, então a fase cai e o verbo
  entrega o resto. Divergir sem dizer que diverge é o que faz dois elos tratarem a mesma condição de
  formas diferentes sem ninguém notar.
- **Não escreva no manifesto de contexto.** Sugerir campo faltando (`tracker_repo_map`, `repos`
  desatualizado) é relatório; escrever é gate do `equip`.
- **Não trate a ausência do índice como erro do usuário.** Ele é opcional por desenho.

## Rules

- PT-BR com acentuação correta, como todo output da família.
- Toda contagem do relatório sai de leitura real (filesystem, `git`, lista de agentes da sessão).
  Sem fonte, `n/d` — nunca estimativa.
- O índice gravado carrega `generated_at` e `generated_by`, que **são** o carimbo: não inventar
  arquivo de marcação separado.
- Rodar o `map` é barato de repetir e caro de errar: na dúvida entre relatar e agir, relate.

## Handoff

Terminar apontando o próximo passo, como todo elo da família — e aqui ele sai do próprio relatório:

- **Integridade com itens abertos e o usuário recusou o despacho** → imprimir as invocações do
  `${FLUX_CMD}equip` que resolveriam cada uma, para ele rodar quando quiser.
- **Integridade limpa** → dizer isso em uma linha e apontar o ciclo (`${FLUX_CMD}issue` ou
  `${FLUX_CMD}build`, conforme o que ele tiver em mãos). Máquina mapeada não é entrega: é o que
  torna a próxima entrega melhor.
- **Nada a mapear** (nenhuma raiz de agents, nenhum manifesto, nenhum repo) → dizer que a família roda
  assim mesmo, em perfil genérico, e que este verbo passa a ter serventia quando houver ao menos um
  repo com suite ou um manifesto de contexto.

Nunca chamar o elo seguinte sozinho. Como todos, este verbo termina devolvendo o volante.
