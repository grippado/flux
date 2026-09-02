# Disciplina de fan-out — o orquestrador orquestra, os agentes trabalham

> Fonte única do protocolo "todo comando `flux:*` despacha o trabalho pesado para subagentes em
> fan-out, nunca executa no contexto principal". Referenciada por **todos** os elos da família
> (`issue`, `build`, `peek`, `review`, `iterate`, `land`, `reply`). **Não duplicar esta lógica**
> nos comandos: apontar para cá e declarar só o que for específico (qual é a unidade de fan-out
> daquele elo, qual o agente).
>
> **Adaptador Codex:** toda ocorrência de `Task tool` neste contrato significa a delegação nativa
> de subagentes quando a skill estiver rodando no Codex. Unidades independentes continuam em
> paralelo, com prompt autocontido, retorno curto e nenhum gate no subagente. Ver
> [`codex-compat.md`](codex-compat.md) para o contrato completo.
>
> É par simétrico de [`worktree-discipline.md`](worktree-discipline.md) — aquele isola a **escrita
> em disco**, este isola o **consumo de contexto**. E é o braço operacional de
> [`context-budget.md`](context-budget.md): o budget explica o custo, este documento diz o que fazer.

## Princípio (regra pétrea)

**O contexto principal de um comando `flux:*` não faz trabalho — ele orquestra.**

Investigar código, verificar alegação contra o repo, aplicar correção, varrer N repos, rodar outro
`flux:*`: nada disso acontece na main. Tudo vai para **subagente**, e sempre que houver mais de uma
unidade independente, os subagentes vão **em paralelo** (fan-out), num único bloco de tool calls.

Vale para todos os elos, em todas as passadas — inclusive **dentro do watch**, onde o custo se
acumula tick após tick e é justamente onde a tentação de "só dessa vez fazer inline" mais aparece.

### Por que é pétrea

Um subagente tem contexto próprio, **descartado ao terminar**. Ele paga o custo de carregar
`CLAUDE.md` + `.claude/rules/**` do repo dele + a skill que precisar, e esse custo **morre com ele**.
O contexto principal recebe só o retorno estruturado.

Fazer o mesmo trabalho inline carrega esse lastro **permanentemente** na main (10-20k tokens **por
repo**, ~14k por skill `flux:` viva, restaurados a cada compact — medições em `context-budget.md`).
Três PRs em dois repos feitas inline estouram a janela sozinhas e jogam a sessão em thrashing de
autocompact. Já aconteceu: uma entrega real de 3 PRs cross-repo.

O ganho secundário, mas real: fan-out é **paralelo**. N unidades independentes despachadas juntas
levam o wall-clock da mais lenta, não a soma.

## O que fica na main (e SÓ isto)

O contexto principal é fino por construção. Ele faz:

1. **Parse** de argumentos e flags, resolução de contexto (`flux-context.md`) e preflight.
2. **Chamadas baratas de metadados** — `gh pr view --json`, GraphQL de `reviewThreads`, `gh pr checks`:
   JSON pequeno, filtrado na origem, que alimenta decisão de roteamento.
3. **Roteamento** — decidir quais unidades existem e despachar os subagentes.
4. **Fan-in** — reconciliar os retornos e formar o veredito.
5. **HITL** — todo GATE com o usuário (protocolo em `${FLUX_ROOT}/shared/hitl.md`). Subagente **não tem canal com o
   usuário**: um gate dentro de subagente trava o fluxo em silêncio.
6. **Board / artefato no vault** — escrita serializada num só lugar, para não haver corrida entre
   subagentes escrevendo a mesma nota.
7. **Watch** — `ScheduleWakeup`, cadência, estado persistente.

Tudo o mais é fan-out.

### Lista fechada, não sugestão

Os sete itens acima são **exaustivos, com uma exceção nominada** — a do `flux:equip`, logo abaixo. Se
uma ação não está em nenhum deles nem na exceção, ela **não roda na main**, e a pergunta certa não é
"cabe aqui?" e sim "qual subagente faz isso?".

Em particular, e são as violações mais comuns:

| ação | onde a intuição erra | onde de fato roda |
|------|----------------------|-------------------|
| ler o `CLAUDE.md` do repo-alvo | "é um arquivo só" | subagente (carrega o root inteiro junto) |
| conferir se o subagente fez direito | "é rápido reler" | outro subagente, ou confia no retorno |
| abrir um segundo repo para comparar | "só uma olhada" | subagente por repo |
| rodar `grep`/`find` amplo no checkout | "é barato" | subagente (`Explore`) |
| reler o board para saber onde parou | "preciso do estado" | o board-keeper tem o estado |
| chamar outro `flux:*` | "é da família" | subagente, sempre — **exceto o `flux:equip`**, cujas duas formas estão abaixo |

### O `flux:equip` tem duas formas, e nenhuma delas é o despacho ingênuo

O `equip` é feito de gates, e é isso que o torna diferente de qualquer outro verbo despachável.
Mandá-lo para subagente **sem mais nada** travaria o fluxo em silêncio no primeiro gate, ou o faria
escrever no disco de alguém sem nunca ter perguntado. Daí as duas formas: ou ele roda na main, ou os
gates dele acontecem na main antes de o filho existir.

#### Forma 1: aceito numa oferta, roda na main

Quando `flux:review`, `flux:iterate`, `flux:land` ou `flux:build` oferecem o preparo que faltou
(`${FLUX_ROOT}/shared/bootstrap-specialists.md`) e o usuário **aceita**, o `flux:equip` roda no
contexto principal do elo que ofereceu, não em subagente. É a única exceção à linha "chamar outro
`flux:*` → subagente, sempre", e ela está escrita aqui porque uma exceção que só existe no documento
que a usa é uma exceção que ninguém encontra: um elo que consultasse só esta fonte concluiria, com
razão, que violou a regra pétrea.

**Não é relaxamento da regra: é consequência dela.** O item 5 da lista fechada diz que todo GATE
acontece na main, porque subagente não tem canal com o usuário (`${FLUX_ROOT}/shared/hitl.md`). O
`equip` é feito de gates — destino de escrita, arquivo existente, manifesto. Despachá-lo para
subagente não moveria o custo de lugar: travaria o fluxo em silêncio no primeiro gate, ou o faria
escrever no disco de alguém sem nunca ter perguntado. Entre as duas regras, a do HITL vence, e a
razão é assimétrica — violar o fan-out custa contexto, violar o HITL custa escrita não autorizada na
máquina do usuário.

O que **não** muda: o trabalho pesado do `equip` continua indo para subagente, despachado por ele
mesmo. Ler o repo, detectar a stack, autorar suite e motor — nada disso roda na main. O que fica é o
que já ficaria de qualquer jeito: gates, resolução de destino e registro.

**O custo de contexto é real, e a mitigação é o momento.** A main do elo que ofereceu carrega o
`write-destination.md`, o `review-agents.md` e a leitura do repo alvo — um custo que este documento
existe justamente para não pagar de graça. Ele é aceitável por uma razão de **ordem**: a oferta vem
sempre **depois** do trabalho principal, quando a main já produziu o parecer, já gravou o artefato e
já não vai fazer mais nada além de fechar. O lastro não contamina trabalho nenhum, porque não há
trabalho depois dele. É por isso que a tabela "Quando oferecer" do `bootstrap-specialists.md` fixa o
momento em todos os quatro elos, e é por isso que oferecer **antes** do trabalho seria violação de
verdade, não exceção.

Duas consequências práticas:

- **Um `equip` por execução do elo que ofereceu.** Aceita a oferta, o elo equipa e fecha; ele não
  volta ao trabalho principal depois, e não encadeia um segundo verbo.
- **Num watch, a oferta não se repete a cada tick.** Ela é do fechamento, uma vez. Carregar o preparo
  dentro de um loop é exatamente o acúmulo tick após tick contra o qual o princípio adverte.

#### Forma 2: despachado pelo `flux:map`, com os gates já resolvidos na main

O `${FLUX_CMD}map` é o único elo cujo produto é sobre a **máquina** e não sobre um trabalho, e o único
que encontra N repos precisando de preparo na mesma execução. Rodar N `equip` em série na main
inviabilizaria o verbo; despachá-los ingenuamente cairia na proibição acima. A saída é o `--from-map`,
e ele **não é uma exceção à regra do HITL: é a regra do HITL aplicada antes do fan-out.**

Só vale sob as três garantias abaixo, e as três juntas. Faltando qualquer uma, volta a valer a
proibição, e o `map` degrada para imprimir as invocações:

1. **Todo gate acontece na main, antes do despacho.** O escopo (quais consertos) é aceite item a item;
   o destino (`${FLUX_ROOT}/shared/write-destination.md`, cascata e três guardas) é resolvido uma vez e
   desce ao filho como fato dado. Nenhum filho abre gate, porque não sobrou gate para abrir.
2. **O filho nunca sobrescreve arquivo existente.** O gate por arquivo existente é, por natureza,
   posterior ao levantamento: o arquivo pode nascer entre o gate e o despacho. O filho que encontra um
   **para, devolve no campo `recusado:` do contrato de retorno, e a main abre o gate**. Não existe
   caminho em que um filho decida sobrescrever.
3. **O filho nunca escreve no manifesto.** Persistir em `flux-context.json` é categoria de gate
   sempre (`${FLUX_ROOT}/shared/hitl.md`), e há **um** manifesto por perfil: N filhos gravando nele é a
   mesma corrida do índice, agravada porque o contrato exige merge preservando campos desconhecidos.
   O filho devolve o que persistiria; quem grava é a main, na reconciliação, com gate.

O que o filho faz, então, é o trabalho pesado sem gate nenhum: ler o repo, detectar a stack, autorar
suite e motor, escrever **arquivo que não existia**. É exatamente o que a Forma 1 já manda ir para
subagente — a diferença é só quem é a main.

**Escritor único por recurso compartilhado.** Os destinos por repo são disjuntos por desenho; o
`flux-agents.json` e o `flux-context.json` não são. Os dois são escritos na reconciliação, uma vez, e
nunca pelos filhos.

### Auto-verificação (todo elo, antes de responder)

Antes de emitir a resposta final, o elo confere e o veredito é binário — com a exceção acima já
descontada, e ela é a **única** que desconta:

1. Todo trabalho que abriu repo, leu mais de 2 arquivos ou rodou outro `flux:*` foi para subagente,
   **ressalvado o `flux:equip` aceito numa oferta de fechamento**, que roda na main por força do
   item 5 (todo gate na main)?
2. A main recebeu apenas retornos estruturados curtos, e não conteúdo bruto (diff, log de CI,
   arquivo inteiro)?
3. A main escreveu só onde tem direito (board/artefato), e nenhum subagente escreveu no mesmo lugar?
4. Todo gate com o usuário aconteceu na main, nunca dentro de subagente?

Qualquer "não" é violação da regra pétrea. **Declarar no output** o que rodou fora do contrato, em vez
de esconder: um elo que violou e avisou é corrigível, um que violou calado vira precedente.

## Unidade de fan-out por elo

Cada elo declara a sua, mas o padrão é este:

| Elo | Unidade de fan-out | Agente típico |
|-----|--------------------|---------------|
| `flux:review` (pr) | Um agente por lente: holístico + cada specialist do repo | `<HOLISTIC>` + `SPECIALISTS_ROOT` |
| `flux:review` (doc) | Um agente por doc + um por repo citado | `<DOC_REVIEWER>` + prospectors |
| `flux:peek` | Um agente (o holístico) — alvo único, mas ainda fora da main | `<HOLISTIC>` |
| `flux:iterate` | **Verificação**: um agente por lente sobre o lote de threads. **Execução**: um agente para aplicar+quality gate no worktree | specialists / `general-purpose` |
| `flux:land` | **Uma PR** — um subagente rodando `${FLUX_CMD}iterate --auto --once` por PR | `general-purpose` |
| `flux:map` | **Duas unidades, e as duas por repo.** *Levantamento*: um agente por repo apurando as três lentes e os hashes. *Despacho*: um subagente rodando `${FLUX_CMD}equip <slug> --from-map` por repo, só para os consertos aceitos no gate (Forma 2, acima) | `general-purpose` |
| `flux:build` | O motor de execução do repo inteiro (a main mantém o board de execução) | `general-purpose` |
| `flux:equip` | Detecção de stack, leitura de L3 e autoria (suite e motor), em paralelo quando independentes — a main fica com gates, destino e registro | `general-purpose` |
| `flux:probe` | **Duas unidades.** *Coleta*: um alvo de telemetria por prospector, o da fonte que aquele alvo carimbou (fontes diferentes vão no mesmo bloco). *Cruzamento*: um repo por prospector. A síntese cross-fonte é fan-in e fica na main | `<SENTRY_PROSPECTOR>` / `<DATADOG_PROSPECTOR>` / specialists |
| `flux:issue` (prospecção) | **Um repo** por prospector | specialists / `Explore` |
| `flux:issue` (criação) | **Uma candidata** por agente, em levas de até 3, blockers primeiro | `issue-creator` (sonnet) |
| `flux:reply` | **Um repo** por prospector + o answerer | `<SLACK_PROSPECTOR>` / `<SLACK_ANSWERER>` |

Regra de composição: PRs/repos **diferentes** vão em paralelo; unidades que escrevem no **mesmo
worktree** vão em série (senão colidem).

## Quando o fan-out é obrigatório

Fan-out **obrigatório** se a unidade de trabalho tem qualquer um destes:

- Abre, lê ou escreve num **repo** (qualquer repo — o custo é o pacote inteiro daquele root).
- Precisa **ler mais de 2 arquivos** para concluir.
- Invoca **outro comando `flux:*`** (Regra 2 do orçamento de contexto: um orquestrador nunca chama
  outro inline).
- Existe em **mais de uma instância independente** (N threads, N repos, N PRs).

Fan-out **dispensável** (inline é aceitável) só quando: a resposta sai de metadados já em contexto,
ou de um único `gh`/`Grep` barato, sem abrir repo. Na dúvida, despache — o custo de um subagente a
mais é local; o de um root a mais é permanente.

## Contrato do subagente

Idêntico ao da Regra 3 do orçamento de contexto, valendo para todo elo:

- **Prompt auto-contido.** O subagente **não herda a conversa**. O prompt carrega tudo: URL/alvo,
  path do repo e do worktree, path do board pai, flags, e o formato de retorno esperado.
- **Retorno estruturado e curto — alvo `< 40 linhas`.** É o que alimenta o board/veredito, não a
  transcrição do trabalho. Proibido no retorno: diff, conteúdo de arquivo, log de CI cru, narrativa
  do que foi feito passo a passo.
- **A main não relê conteúdo — mas sempre verifica metadado.** São duas coisas diferentes, e confundi-las
  já custou caro. O contexto principal **não relê** os arquivos que o subagente tocou: isso é caro e é
  o que o fan-out existe para evitar; precisando de verificação de conteúdo, **despacha outro subagente**.
  **Consulta de metadado é o oposto**: é o item 2 da lista fechada acima, custa uma chamada e não carrega
  contexto nenhum. Onde o subagente produziu um **efeito externo verificável** (issue criada, label
  aplicada, PR aberta, relação de bloqueio), a main **confere o resultado real na fonte**, sempre, e não
  aceita o "ok" do retorno como prova.

  > **Por que a distinção é pétrea.** A autoconferência do subagente é feita pelo mesmo processo que
  > pode ter errado. Num lote real de criação de issues (2026-08-08), duas de 22 nasceram sem um label
  > obrigatório **e o agente reportou os campos como conferidos** — 9% de falha silenciosa. A query de
  > verificação da main custou dois segundos e pegou as duas. Verificação determinística de efeito
  > externo nunca é subagente: é comparação de conjuntos, e um modelo conferindo outro modelo troca uma
  > afirmação não verificada por duas.
- **Flags de autonomia.** Comando delegado a subagente vai sempre com as flags que evitam gate
  interativo (`--auto`) e watch aninhado (`--once`) — o HITL e o watch são da main.
- **Escolha do tipo:** análise com lente de repo → specialist de `review-agents.md`; varredura
  read-only ampla → `Explore`; execução (escrever/commitar/rodar comando) → `general-purpose`.

## O board-keeper — escritor único do board (só em fluxo com watch)

Nos elos que ficam vivos em watch (`flux:iterate` e `flux:land` sem `--once`), o board no vault
é mantido por **um subagente dedicado**, criado no início do fluxo e reaproveitado a cada tick.

**Como funciona de verdade (não é polling).** Subagente não fica rodando em segundo plano esperando
trabalho: um `Agent` roda e morre. O que sustenta o keeper é o `SendMessage` — mandar mensagem para
um agente pelo **nome** o **retoma a partir do transcript dele**, com a memória intacta. O efeito é
um escritor persistente com histórico; o que não existe é atividade entre os ticks.

**Por isso o ganho é de contexto, não de latência.** Nada acontece entre ticks de qualquer forma. O
que se ganha:

- o `CLAUDE.md` do vault (~11KB) + `board-template.md` (~2k tokens de regra de formatação) ficam no
  transcript do keeper e **nunca entram na main**.
- A main **nunca relê o board** (Regra 4 do orçamento de contexto, a mais violada num watch longo):
  o estado do board vive na memória do keeper.
- **Escritor único** — board com dois escritores concorrentes é corrida silenciosa. Aqui, por
  construção, só o keeper escreve.

### Quando criar

- **Watch ligado** → criar o keeper na fase em que o board nasce, antes do primeiro tick.
- **`--once` / passada única** → **não criar**. É uma escrita só; a main grava direto e o keeper
  seria overhead puro. (Inclui todo `/flux:iterate --auto --once` despachado por um delivery.)
- **`flux:build`** → **não criar**. O board de execução tem exatamente duas escritas (nascimento
  antes do despacho, fechamento no retorno do motor) e nenhum tick intermediário: a main grava
  direto. O que continua valendo com força total é o **escritor único**: o subagente que roda o
  motor recebe o path do board no prompt para poder citá-lo, e **nunca escreve nele**. Board escrito
  pelo executor e pela main ao mesmo tempo é a corrida que esta seção existe para evitar.

### Quem é dono de quê

O keeper é dono **apenas do board do elo que o criou**. Num delivery, os boards de iterate filhos
continuam sendo escritos pelo próprio filho — ele tem o detalhe e morre com ele. O keeper do
delivery só **registra o path** do board filho que veio no retorno. Serializar N filhos por um
escritor único não compra nada e cria gargalo.

### Contrato do tick

A main manda o delta; o keeper aplica e devolve **uma linha**. O delta é fixo — delta preguiçoso
produz board que diverge da realidade em silêncio, e o board é a memória durável do fluxo:

```
- tick: <horário local>
- mudou: <sim|não (tick quiet)>
- porPR|estado: <as métricas do painel: threads res/tot, CI, isDraft, SHA, veredito>
- eventos: <o que é digno de Timeline de Eventos Relevantes, ou nenhum>
- proximoMovimento: <uma linha>
```

Retorno do keeper (uma linha, **nunca** o board de volta):

```
board atualizado: <path> · seções tocadas: <lista> · carimbo: <horário>
```

**O eco é inventário do tick, não do board.** Ele lista o que *aquele* tick tocou — seção que já
estava correta de um tick anterior não reaparece. Logo, **ausência no eco não é ausência no board**:
a main nunca conclui que algo faltou só porque não veio no eco. Havendo dúvida real sobre o estado
de uma seção, o caminho é **perguntar ao keeper** (que relê e responde), nunca a main abrir o board.

### Guardrails

- **O board no disco é a verdade, não a memória do keeper.** Em watch longo o transcript dele
  cresce e degrada; na dúvida sobre o estado atual de uma seção, o keeper **relê aquela seção**
  antes de editar, em vez de confiar na lembrança.
- **Carimbo de data rola em todo tick**, inclusive quiet — é responsabilidade do keeper.
- **Fallback declarado:** se o keeper falhar ou não responder, a main volta a escrever o board
  direto e **avisa no chat** que o keeper caiu. Nunca seguir com o board parado.
- O keeper **não** decide nada: não emite veredito, não escolhe próximo movimento, não interpreta
  CI. Ele formata e persiste o que a main decidiu.

## Anti-padrões (sintomas de violação)

- Mais de **2 roots** de memória no rodapé dos tool results → já se abriu repo demais na main.
- Mais de **1 skill `flux:`** em `Skills restored` → um orquestrador chamou outro inline. A **única**
  combinação legítima é um elo mais o `equip` aceito na oferta de fechamento (ver a exceção acima);
  qualquer outro par é violação.
- Aviso de autocompact **duas vezes** na mesma sessão.
- Sequência de `Read` de arquivos de repo no contexto principal → é trabalho de subagente vazando.
- Subagentes independentes despachados em **mensagens separadas** → perdeu o paralelismo à toa.

A reação certa nunca é "continuar e torcer": fechar o estado no board (que é durável, em disco) e
delegar o resto. **O board é a memória do fluxo — o contexto da sessão não é.**
