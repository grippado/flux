---
name: refine
description: "Orquestrador `flux:refine` — refinamento numa rodada (fast SDD): recebe ideia, thread ou bug e produz PRD, TRD e plano de slices embasados em código real, no mesmo board que o `flux:issue` consome depois. Mede o escopo antes de trabalhar e recusa o que não cabe, entregando o corte proposto em vez de um refinamento raso. Opcional: quem não precisa refinar vai direto ao `flux:issue`. Global, resolve contexto via `flux-context.md`."
user-invocable: true
requires:
  hard:
    - file: shared/scope-gate.md
    - file: shared/board-template.md
    - file: shared/review-agents.md
    - file: shared/flux-context.md
    - bin: git
  soft:
    - checkout_local
    - vault
---

# /flux:refine

O **refinamento numa rodada** da família `flux:`. Recebe o mesmo tipo de entrada que o `flux:issue`
(ideia, thread do Slack, bug relatado) e, em vez de ir direto ao corpo da issue, produz antes as três
peças que o corpo pressupõe e quase nunca tem: **o problema (PRD)**, **como isso encosta no código
real (TRD)** e **em que ordem se entrega (plano de slices)**.

É um **fast SDD**: uma rodada, um documento, minutos. Não é o Spec Driven Development completo, e a
diferença não é de qualidade, é de tamanho — por isso ele **mede o escopo antes de trabalhar** e
recusa o que não cabe, em vez de produzir um refinamento raso com aparência de completo.

**Este elo é opcional, e opcional de verdade.** O ciclo funciona inteiro sem ele: quem já sabe o que
quer chama `flux:issue` direto. Ele existe para o caso em que o pedido chegou como ideia crua e
ninguém ainda escreveu por que aquilo importa, onde encosta e por onde começar.

Onde ele fica no ciclo:

```
        ideia / thread / bug relatado
                    │
        ┌───────────┴───────────┐
        │ (opcional)            │ (direto)
        ▼                       │
   /flux:refine                 │   escopo cabe   → PRD + TRD + plano no board
   fast SDD, 1 rodada           │   escopo grande → recusa + corte proposto
        └───────────┬───────────┘
                    ▼
              /flux:issue    →  /flux:build  →  peek/review  →  iterate  →  land  →  reply
```

**Gate de escopo (o que decide se ele roda):** `${FLUX_ROOT}/shared/scope-gate.md`
**Formato do board:** `${FLUX_ROOT}/shared/board-template.md`, **perfil exploração**
(`type: flux-issue`) — o **mesmo** board do `flux:issue`, e a seção 7-septies é a deste elo.
**Descoberta + fan-out de specialists:** `${FLUX_ROOT}/shared/review-agents.md`
**Disciplina de fan-out (regra pétrea da família):** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Orçamento de contexto:** `${FLUX_ROOT}/shared/context-budget.md`
**Gates com o usuário:** `${FLUX_ROOT}/shared/hitl.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`

> **Por que o board é o mesmo do `flux:issue`, e isto não é economia de arquivo.** O Step 1-bis do
> `${FLUX_ROOT}/skills/issue/SKILL.md` procura, antes de prospectar, um board de exploração cujo
> `source` case com o pedido — e, achando, **consulta a 🔬 Achados de codebase em vez de
> reprospectar**. Escrever o refinamento num board de outro `type` faria o `flux:issue` não encontrar
> nada, disparar o fan-out de novo e pagar duas vezes pela mesma investigação. O encaixe entre os dois
> elos já existia no contrato; este verbo entra por ele, sem contrato novo.

## Banner de perfil — gabarito (copiar VERBATIM)

Todo output deste elo **abre** com o banner. Ele não é decoração: é o que impede uma execução
degradada de se passar por uma completa. O gabarito mora aqui, no corpo do elo, porque um gabarito
que só existe num shared não chega ao contexto na hora de emitir — e o que sai é um banner
improvisado, com campos inventados e sem o `nivel`.

Copiar com as cercas, trocando só o que está entre chaves. Regras dos campos e casos de degradação
em `${FLUX_ROOT}/shared/preflight.md`, Passo 5; a linha `escopo` é definida em
`${FLUX_ROOT}/shared/scope-gate.md`, seção "Como o veredito é declarado".

````
```
perfil: {nome do manifesto | generico}{ (ancora: alvo <path>)} · nivel: {FULL|REDUCED|THIN}
escopo: {🟢 cabe | 🟡 cabe raso | 🔴 nao cabe} ({sinais lidos})
lentes: L1 n/a · L2 {lista|ausente|inalcancavel} · L3 {lista|ausente|inalcancavel}
degradacoes: {soft ausentes e o que se perde com cada um | nenhuma}
```
````

Como o `flux:build`, este elo **não** resolve reviewer holístico: ele não revisa nada, prospecta. O
campo `holistico:` não entra no banner e `L1` sai como `n/a`. A linha `lentes` entra porque a
qualidade do TRD depende inteiramente de haver specialists no repo, e quem lê o artefato precisa
saber com que lente ele foi apurado.

**A linha `escopo` aparece no primeiro banner com o veredito de T0** e é **reemitida com o de T1**,
quando ele existir. Um banner que mostrasse só o T0 e nunca fosse corrigido é pior que nenhum: o
número que vale é o apurado.

Abortagem segue o gabarito do "Formato da mensagem de abortagem" do preflight, também verbatim, e o
nome do elo na primeira linha usa `${FLUX_CMD}` já substituído (`/flux:refine` num harness,
`/flux-refine` em outro) — nunca `flux:` literal.

## Uso

```
/flux:refine <ideia | permalink do Slack | url de PR | ticket>
/flux:refine <alvo> --repo <slug>          # quando o pedido não nomeia o repo
```

| Flag | Efeito |
|------|--------|
| `--repo <slug>` | Fixa o repo alvo em vez de inferir do pedido. Repetível para dois repos. |
| `--dry` | Roda T0 e o diagnóstico, imprime o veredito de escopo e o plano de prospecção, e **para**. Nada é prospectado, nada é escrito. |
| `--no-prd` | Pula o PRD e produz só TRD + plano. Para pedido cujo "porquê" já está decidido e escrito. |

**Não existe flag que force um escopo 🔴 a ser refinado.** O motivo está em
`${FLUX_ROOT}/shared/scope-gate.md`, "Vermelho no `flux:refine` não tem override": a saída é cortar o
pedido, e o corte já vem proposto na recusa.

### Exemplos

```
/flux:refine "o build despacha issue grande demais e queima 40min sem commit"
/flux:refine https://acme.slack.com/archives/C0123/p1720012800123456
/flux:refine ENG-1234 --repo api-gateway
/flux:refine "trocar o provider de auth" --dry
```

## Out of scope (NUNCA faça)

- **Não crie issue.** Nem no Linear, nem em lugar nenhum. Quem cria é o `flux:issue`, que tem o gate
  de aprovação, o fan-out de criação e a verificação do lote. Este elo produz o insumo dele.
- **Não escreva código, não abra PR, não toque no repo alvo.** A prospecção é leitura.
- **Não despache o elo seguinte.** O handoff **aponta** o comando e devolve o volante, como todos os
  outros elos fazem. Ver "Por que aponta e não despacha", no fim.
- **Não produza os artefatos do SDD completo** (threat model, DESIGN a partir de Figma, issue-tree,
  plano por camada). Escopo que os exige é 🔴 por construção: recuse e encaminhe.
- **Não refine escopo 🔴 "só um pouco".** Meio refinamento de coisa grande é o artefato mais caro que
  este elo pode produzir, porque circula como se fosse spec.

---

## Step 0-context: resolver perfil de contexto

Seguir `${FLUX_ROOT}/shared/flux-context.md`. Extrair: `SPECIALISTS_ROOT`, `REPOS`, `VAULT_ROOT`,
`VAULT_CTX`, `NO_EMDASH`, `SCOPE_ESCALATION` (campo `scope_escalation`, o encaminhamento da recusa) e
os agentes de prospecção (`slack_prospector`, quando a fonte é Slack).

Sem manifesto: perfil genérico. Sem `VAULT_ROOT` o artefato sai no chat, e a perda é declarada no
banner — o board é capacidade que degrada, não requisito que trava.

---

## Step 1 — Resolver a fonte

**Não reimplementar:** a decomposição de fonte é a do `${FLUX_ROOT}/skills/issue/SKILL.md`, Step 1, e
vale inteira aqui — permalink do Slack, PR, ticket ou texto livre, com a extração de `SOURCE`,
`REQUEST` e `TARGET_REPOS`.

Só uma coisa muda: **onde o `flux:issue` pergunta qual é o repo, este elo aceita não saber ainda.**
Um pedido cru muitas vezes não nomeia repo — é justamente por isso que ele veio parar aqui. Sem repo
identificável e sem `--repo`, seguir para o T0 mesmo assim: o PRD não depende de repo, e o gate pode
recusar antes de a pergunta importar. A pergunta acontece no Step 3, quando ela passa a ter efeito.

---

## Step 2 — T0: medir o escopo antes de gastar qualquer coisa

Aplicar `${FLUX_ROOT}/shared/scope-gate.md`, tempo **T0**, lendo só o `REQUEST`. **Sem nenhuma
chamada de agente** — é leitura de texto, e o contrato proíbe medir com fan-out.

- **🔴 já em T0** → ir direto para o **Caminho vermelho**, abaixo. Não abrir board, não prospectar.
  Um pedido que bate sinal duro na entrada não encolhe com apuração.
- **🟢 ou 🟡** → emitir o banner com a linha `escopo` e seguir. O veredito de T0 é **provisório** e
  será reemitido em T1.

Com `--dry`, parar aqui: imprimir o veredito, os sinais lidos e quais repos seriam prospectados.

---

## Step 3 — Abrir (ou retomar) o board, antes do fan-out

Mesma disciplina do `flux:issue`, Steps 1-bis e 1-ter, e pelos mesmos motivos: procurar em
`<VAULT_ROOT>/linear/` um board de exploração cujo `source` case com o `SOURCE`; casou, retoma;
não casou, cria em `<VAULT_ROOT>/linear/YYYY-MM-DD-flux-issue-<slug>.md`. **Anunciar o path no chat.**

> **Por que antes do fan-out.** O mesmo motivo dos outros elos: a prospecção roda em N subagentes por
> minutos, e um board que nascesse depois não teria rastro de onde o trabalho parou. Board que nasce
> depois do trabalho é ata, não board.

Duas particularidades deste elo:

1. **O nome do arquivo continua sendo `flux-issue`**, mesmo tendo nascido aqui. O board é do *pedido*,
   não do verbo que o abriu, e é assim que o `flux:issue` o reencontra pelo `source`.
2. **É aqui que o repo alvo vira pergunta**, se ainda não estiver resolvido. Sem `TARGET_REPOS` não
   há prospecção, e sem prospecção não há TRD — o artefato sairia com o §2 vazio. Abrir um GATE
   (`${FLUX_ROOT}/shared/hitl.md`) oferecendo os `REPOS` do perfil, com a saída inócua de seguir
   **só com PRD**, que é um resultado legítimo e declarado como tal.

**Escritor único:** este elo não tem watch, então não há board-keeper. A main escreve, nenhum
subagente toca o arquivo (`${FLUX_ROOT}/shared/fanout-discipline.md`).

---

## Step 4 — Prospecção embasada em código

Idêntica à do `flux:issue`, Step 2: um fan-out por repo de `TARGET_REPOS`, seguindo
`${FLUX_ROOT}/shared/review-agents.md`, com o contrato de retorno do prospector
(`Veredito: confirma | refuta | parcial | sem-evidência` + `Evidência: arquivo:linha`).

**Retomando um board que já tem 🔬 Achados de codebase, não reprospectar o que já foi verificado** —
inclusive o que foi refutado. É a mesma regra do `flux:issue`, e ela vale nos dois sentidos: o que
este elo apura hoje é o que o `flux:issue` não vai refazer amanhã.

Fan-in conforme cada repo retorna, na 🔬 Achados de codebase, com os achados **inteiros**. As linhas
`🔧 APURANDO` do painel seguem o mesmo desfecho por repo do `flux:issue` (voltou com achados / voltou
vazio → `⚪ DESCARTADA` / falhou → `🔒 BLOQUEIA`). **Falha não é "sem achados"**: confundir as duas faz
o TRD nascer achando que investigou o que não investigou.

**Teto de tempo.** Prospecção que passa de ~10 minutos deixou de ser fast. Passando disso, parar o
que ainda não voltou, registrar no board quais repos ficaram sem apurar, e seguir com o que há —
declarando a lacuna por nome no §2. Um refinamento que demora como o SDD completo tem os custos dele
sem as garantias dele.

---

## Step 5 — T1: o veredito que vale

Com os achados na mão, reaplicar `${FLUX_ROOT}/shared/scope-gate.md`, tempo **T1**. Agora os sinais
são medidos, não estimados: quantos repos de fato têm escrita prevista, quantos diretórios de topo
aparecem no embasamento, quantas slices o trabalho tem.

- **🟢** → seguir para o Step 6, artefato completo.
- **🟡** → seguir, e **anotar desde já o que ficará raso**, por nome. Essa lista é obrigatória no §4
  e não pode virar texto vago.
- **🔴** → **Caminho vermelho**, abaixo. Sim, mesmo com a prospecção já paga: o custo dela não
  justifica produzir um refinamento que não cabe, e ela **não** é desperdiçada — vai inteira para o
  board e para o pré-refinamento.

Reemitir a linha `escopo` do banner com o veredito apurado, e registrar a mudança de faixa (quando
houver) como linha da Timeline de Eventos, tipo `escopo`.

---

## Step 6 — Redigir PRD e TRD (dois subagentes, em paralelo)

Regra pétrea de fan-out: redação longa não fica na main. Dois subagentes, **num único bloco de tool
calls**, porque são independentes entre si:

| agente | produz | insumo |
|---|---|---|
| PRD | problema, user story, regras de negócio, edge cases, fora de escopo | o `REQUEST` e a fonte |
| TRD | contrato efetivo, pontos de toque no código, decisões, riscos | o `REQUEST` **e** os achados |

Ambos recebem prompt auto-contido (não herdam a conversa), com o **path do board** para citar, o
`NO_EMDASH` quando o perfil o declara, e o idioma. Nenhum dos dois escreve no board: eles devolvem, a
main grava.

Duas instruções que vão em todo prompt de TRD, e são o que separa um TRD útil de uma redação:

- **Todo ponto de toque carrega `arquivo:linha` linkado e o veredito do achado que o sustenta.**
  Afirmação sem âncora não entra, mesmo que seja verdade.
- **O que não foi apurado é declarado como não apurado.** Um TRD que preenche a lacuna com o que
  provavelmente existe é exatamente o documento que este elo não pode produzir.

Com `--no-prd`, despachar só o TRD.

---

## Step 7 — O plano de slices (na main, e é fan-in)

O plano **não vai para subagente**: ele é reconciliação dos dois retornos com os achados, que é
trabalho de fan-in, e é a decisão mais importante do artefato. Item da lista fechada que fica na main
(`${FLUX_ROOT}/shared/fanout-discipline.md`).

Cada slice segue o contrato de vertical slice do `${FLUX_ROOT}/shared/issue-template.md`
(independentemente entregável, atravessa as camadas necessárias, 1 repo) e nasce com:

- **ordem** e **grafo de bloqueio** (`#2 ⟵ bloqueada por #1` + motivo);
- **AFK ou HITL**, pelo mesmo critério binário do `flux:issue` (Step 3) — quem refina é quem tem mais
  informação para classificar, e classificar aqui poupa a redescoberta na hora de executar;
- **os achados que a sustentam**, para a coluna Embasamento (`✔ ◐ ✘ ?`) da candidata.

**Cada slice vira uma linha do painel**, em `🟡 RASCUNHADA`, com `Linear: n/d`. É exatamente o estado
em que o `flux:issue` espera encontrá-las — ele assume dali, escreve os corpos e abre o gate de
criação.

---

## Step 8 — Consolidar o board e apontar o próximo elo

1. Escrever a seção **7-septies 📐 Refinamento** do `${FLUX_ROOT}/shared/board-template.md` com os
   quatro blocos: **§1 PRD-fast**, **§2 TRD-fast**, **§3 Plano** e **§4 Veredito de escopo** (a faixa,
   os sinais lidos e, no 🟡, a lista nominal do que ficou raso).
2. Rolar o carimbo de data (frontmatter `updated:`, TLDR, painel) e gravar `scope:` no frontmatter.
3. `execution_status: open` — o board segue vivo, com o rascunho por escrever. Ele só fecha em `done`
   quando a issue nasce no Linear, e quem faz isso é o `flux:issue`. **Este elo nunca grava `done`.**
4. 🎯 Próximo Movimento e resposta no chat apontando, com o `FLUX_CMD` resolvido:

```
${FLUX_CMD}issue <path do board>
```

O board já carrega a prospecção, as slices e a classificação AFK/HITL: o `flux:issue` não vai
reprospectar, vai escrever os corpos e abrir o gate de criação.

Sem `VAULT_ROOT`, imprimir o artefato no chat e apontar `${FLUX_CMD}issue "<REQUEST>"`, avisando que
sem board a prospecção **será refeita** — é a perda concreta de não ter vault, e ela tem que ser dita.

### Por que aponta e não despacha

Despachar um irmão obriga a resolver `${FLUX_CMD}` **e verificá-lo** (Passo 1b do preflight), e hoje
só o `flux:land` faz isso — ao custo de ficar **indisponível** num harness onde o prefixo não é
verificável, como está registrado em `${FLUX_ROOT}/shared/codex-compat.md`. Um elo de refinamento não
tem motivo para pagar esse preço: ele termina com um artefato que o usuário quer ler antes de
prosseguir. Apontar mantém o verbo disponível nos três harnesses e respeita a regra da família de que
**nenhum elo chama o próximo sozinho**.

---

## Caminho vermelho — a recusa

Disparado por 🔴 em T0 (antes de tudo) ou em T1 (com a prospecção paga). A forma é a mesma; muda só
quanto material existe para entregar junto.

**Não refinar é o resultado correto, e ele é anunciado como resultado, não como erro.** Nada de
mensagem de abortagem do preflight: aquilo é para requisito faltando. Aqui não faltou nada — o pedido
é grande, e isso é uma informação sobre o pedido.

Entregar, nesta ordem, conforme `${FLUX_ROOT}/shared/scope-gate.md`, "A recusa é útil, ou não é
recusa":

1. **os sinais que dispararam**, nomeados, com o valor lido de cada um;
2. **o que já foi apurado** — o T0, e a prospecção que tiver voltado;
3. **os artefatos que o escopo exige e este verbo não produz**, em tabela, com o porquê de cada um;
4. **o corte proposto**: quais frentes o pedido tem, qual é o blocker, e qual fatia provavelmente
   cabe numa rodada;
5. **o encaminhamento**: o `SCOPE_ESCALATION` do perfil, repetido **verbatim**. Sem o campo,
   recomendar genericamente um processo de refinamento completo e listar o que falta. **Nunca citar
   ferramenta que o manifesto não declarou.**

**Havendo board** (recusa em T1), tudo isso fica registrado nele: o pré-refinamento na 7-septies, com
o §3 substituído pelo corte proposto e o §4 explicando a recusa; `execution_status: open`; as
candidatas que chegaram a se formar em `🔒 BLOQUEIA`, com a causa. O trabalho apurado **não se perde**
— ele é o que torna a próxima tentativa, já cortada, mais barata que a primeira.

Fechar oferecendo a fatia, com o comando pronto:

```
${FLUX_CMD}refine "<a fatia 1 proposta>"
```

---

## Rules

- **Refinador, não executor e não criador de issue.** Se você se pegar escrevendo código ou chamando
  o tracker, o elo saiu da fronteira: pare e reporte.
- **Nenhuma afirmação sem âncora.** Todo ponto do TRD tem `arquivo:linha` e o veredito do achado que
  o sustenta. O que não foi apurado é declarado como não apurado.
- **Uma rodada.** Este elo não itera sobre o próprio artefato. Refinamento que precisa de várias
  rodadas é sinal de escopo que o gate deveria ter pego — e é assim que se descobre que um limiar
  está errado.
- **O gate mede tamanho, nunca valor.** Recusa nomeia sinais, nunca julga o mérito do pedido.
- PT-BR com acentuação correta; EN no código. Sem em-dash no que puder ir para fora quando
  `NO_EMDASH == true` (o board é doc interno do vault; travessão liberado lá).
