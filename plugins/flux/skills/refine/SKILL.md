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

O **refinamento numa rodada** da família (fast SDD): recebe o mesmo tipo de entrada do `flux:issue`
(ideia, thread, bug) e produz antes as três peças que o corpo da issue pressupõe: **o problema (PRD)**,
**onde isso encosta no código real (TRD)** e **em que ordem se entrega (plano de slices)**. Uma rodada,
um documento, minutos; por isso **mede o escopo antes de trabalhar** e recusa o que não cabe, em vez de
produzir um refinamento raso com cara de completo. É **opcional**: quem já sabe o que quer vai direto
ao `flux:issue`.

**Gate de escopo (o que decide se ele roda):** `${FLUX_ROOT}/shared/scope-gate.md`
**Formato do board:** `${FLUX_ROOT}/shared/board-template.md`, **perfil exploração**
(`type: flux-issue`) — o **mesmo** board do `flux:issue`, e a seção 7-septies é a deste elo.
**Descoberta + fan-out de specialists:** `${FLUX_ROOT}/shared/review-agents.md`
**Disciplina de fan-out (regra pétrea da família):** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Orçamento de contexto:** `${FLUX_ROOT}/shared/context-budget.md`
**Gates com o usuário:** `${FLUX_ROOT}/shared/hitl.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`

O board é o mesmo do `flux:issue` porque é por ele (`source`) que o `issue` acha a 🔬 Achados e não
reprospecta.

## Banner de perfil — gabarito (copiar VERBATIM)

Todo output deste elo **abre** com o banner, copiado com as cercas, trocando só o que está entre
chaves (regras e degradações: `${FLUX_ROOT}/shared/preflight.md`, Passo 5; a linha `escopo`:
`${FLUX_ROOT}/shared/scope-gate.md`, "Como o veredito é declarado"). O gabarito mora no corpo do elo de
propósito: num shared, ele não chega ao contexto na hora de emitir.

````
```
perfil: {nome do manifesto | generico}{ (ancora: alvo <path>)} · nivel: {FULL|REDUCED|THIN}
escopo: {🟢 cabe | 🟡 cabe raso | 🔴 nao cabe} ({sinais lidos})
lentes: L1 n/a · L2 {lista|ausente|inalcancavel} · L3 {lista|ausente|inalcancavel}
degradacoes: {soft ausentes e o que se perde com cada um | nenhuma}
carimbo: {harness} | flux:refine@{flux_version}
```
````

`holistico:` **não entra** e `L1` sai `n/a`: este elo prospecta, não revisa. A linha `lentes` entra
porque a qualidade do TRD depende de haver specialists no repo.

**A linha `escopo` sai com o T0 e é reemitida com o T1**, e também com o T0 intermediário quando o
Caminho grill resolve o sinal duro (com os sinais já mostrando o resolvido): o número que vale é o
apurado.

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
| `--grill` | Só documenta a intenção: o Caminho grill (Step 2) roda sozinho sempre que o único motivo do 🔴 é "decisão de produto em aberto sem dono". Sem esse gatilho, é no-op **declarado em `degradacoes:`**. Sob `--dry`, o grill não roda, com ou sem a flag. |

**Não existe flag que force um escopo 🔴 a ser refinado** (`scope-gate.md`, "Vermelho no `flux:refine`
não tem override"): a saída é cortar, e o corte vem proposto na recusa. O `--grill` não força nada:
resolve o sinal duro antes de o gate medir de novo (`scope-gate.md`, "O Caminho grill do
`flux:refine`").

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
- **Não despache o elo seguinte**: o handoff aponta o comando. A única exceção é o encadeamento
  fatia-por-fatia do Caminho vermelho, que reinvoca este mesmo elo, nunca o seguinte.
- **Não produza os artefatos do SDD completo** (threat model, DESIGN a partir de Figma, issue-tree,
  plano por camada). Escopo que os exige é 🔴 por construção: recuse e encaminhe.
- **Não refine escopo 🔴 "só um pouco".** Meio refinamento de coisa grande é o artefato mais caro que
  este elo pode produzir, porque circula como se fosse spec.

---

## Step 0-context: resolver perfil de contexto

Seguir `${FLUX_ROOT}/shared/flux-context.md`. Extrair: `SPECIALISTS_ROOT`, `REPOS`, `VAULT_ROOT`
(raiz compartilhada, onde fica o `0-inbox/`), `VAULT_CTX`, `VAULT_CTX_ROOT` (raiz do contexto, onde o
eixo por tipo vive; só leitura, ausente → `VAULT_ROOT`), `NO_EMDASH`, `SCOPE_ESCALATION` (campo `scope_escalation`, o encaminhamento da recusa) e
os agentes de prospecção (`slack_prospector`, quando a fonte é Slack).

Sem manifesto: perfil genérico. Sem `VAULT_ROOT` o artefato sai no chat, e a perda é declarada no
banner — o board é capacidade que degrada, não requisito que trava.

---

## Step 1 — Resolver a fonte

**Não reimplementar:** a decomposição de fonte é a do `${FLUX_ROOT}/skills/issue/SKILL.md`, Step 1, e
vale inteira aqui — permalink do Slack, PR, ticket ou texto livre, com a extração de `SOURCE`,
`REQUEST` e `TARGET_REPOS`.

Só uma coisa muda: **sem repo identificável e sem `--repo`, seguir para o T0 mesmo assim** (o PRD não
depende de repo, e o gate pode recusar antes). A pergunta de repo fica para o Step 3.

---

## Step 2 — T0: medir o escopo antes de gastar qualquer coisa

Aplicar `${FLUX_ROOT}/shared/scope-gate.md`, tempo **T0**, lendo só o `REQUEST`. **Sem nenhuma
chamada de agente** — é leitura de texto, e o contrato proíbe medir com fan-out.

- **🔴 já em T0, e removendo o sinal duro "decisão de produto em aberto sem dono" o veredito deixaria
  de ser 🔴** (ou seja: esse sinal é a única coisa segurando o vermelho, sem outro sinal duro
  concorrente e com no máximo 1 sinal mole) → **Caminho grill**, abaixo, em vez de ir direto para o
  Caminho vermelho. Com `--dry`, ver a ressalva logo adiante: o grill não roda mesmo neste caso.
- **🔴 já em T0, por qualquer outro motivo** (o sinal da decisão em aberto acompanhado de outro sinal
  duro, outro sinal duro sozinho, ou ≥2 sinais moles) → ir direto para o **Caminho vermelho**, abaixo.
  Não abrir board, não prospectar. Um pedido que bate 🔴 na entrada não encolhe com apuração.
- **🟢 ou 🟡** → emitir o banner com a linha `escopo` e seguir o fluxo normal, abaixo. `--grill`,
  presente ou não, não muda o comportamento aqui; presente, é no-op declarado em `degradacoes:` (ver
  a tabela de flags).

O veredito de T0 é **provisório** em todos os três casos acima e será reemitido em T1 — inclusive
quando o Caminho grill resolveu o sinal duro e produziu o T0 intermediário (ver item 4 do Caminho
grill, abaixo).

**Com `--dry`, parar aqui, sempre — inclusive quando o primeiro bullet acima dispararia o Caminho
grill.** Imprimir o veredito, os sinais lidos, e que o Caminho grill seria o próximo passo (nomeando
o gap, sem buscar evidência nem abrir GATE). Nada é prospectado, nada é escrito, nada é perguntado.

### Caminho grill — decidir com evidência antes de recusar

Disparado por 🔴 em T0 quando "decisão de produto em aberto sem dono" é a única coisa segurando o
vermelho (critério exato no bullet acima): uma escolha não tomada, e o pedido não nomeia quem a toma.

1. **Nomear o gap**, exatamente como o Caminho vermelho nomearia: qual escolha está em aberto e por
   que o pedido não decide sozinho.
2. **Identificar as alternativas.** Vêm do que o próprio `REQUEST` já menciona ou implica — grill
   nunca inventa uma alternativa que o pedido não sugeriu. **O pedido não sugere nenhuma** (o sinal
   duro é lido de um `REQUEST` que só declara a escolha em aberto, sem nomear os lados — ex.:
   "precisamos decidir como fazer auth"): não há o que grelhar. Nomear o gap (item 1) e seguir direto
   para o **Caminho vermelho**, como qualquer outro 🔴 em T0: sem alternativa, o gate teria só a saída
   inócua.

   **Havendo alternativas, buscar evidência real por cada uma.** Despachar **um** subagente `Explore`
   (prompt auto-contido com as alternativas e os repos do domínio citados no pedido): despacho único,
   não o fan-out do Step 4, mas investigar código não é da main (`fanout-discipline.md`). Pedir: grep no(s)
   repo(s) do domínio por uma ferramenta ou padrão equivalente já existente, e checar doc relacionado
   quando houver (`shared/`, README, ADR referenciado). Dois rótulos possíveis por alternativa, e eles
   não são o mesmo fato:
   - **achou** → a alternativa carrega a evidência (`arquivo:linha` ou caminho de doc);
   - **procurou e não achou** → "sem precedente encontrado" — é informação real, o usuário decide
     sabendo que não há caso equivalente no código;
   - **não teve onde procurar** (sem `TARGET_REPOS` resolvido, ou sem `checkout_local`) → "não apurável,
     sem repo/checkout", que não é "procurei e não achei"; o rótulo vai na **descrição da opção do
     gate** (item 3), não só no banner.

   **Nunca inventar motivo** para preencher a lacuna de nenhum dos dois casos de ausência. A ausência
   de repo/checkout também é declarada em `degradacoes:` no banner (`${FLUX_ROOT}/shared/preflight.md`,
   Passo 5) — mesmo tratamento que qualquer outro `soft` ausente recebe.
3. **Abrir um GATE** (`${FLUX_ROOT}/shared/hitl.md`, "Como perguntar"): uma opção por alternativa, com
   a evidência (ou a ausência dela) na descrição, e a saída inócua ("nenhuma das opções, seguir para a
   recusa") por último. A primeira é a recomendada e leva `(Recomendado)`: a de evidência mais forte,
   ou, sem uma mais forte, a primeira na ordem em que o `REQUEST` as menciona.
4. **Usuário escolhe uma alternativa** → primeiro garantir que o board de exploração existe: se o
   Caminho grill chegou até aqui antes do Step 3, **abrir ou retomar o board agora** (só essa parte do
   Step 3; o grill nunca antecipa a pergunta de repo). Registrar duas linhas
   novas na Timeline do board (perfil exploração, `${FLUX_ROOT}/shared/board-template.md`):
   tipo `decisão`, citando a opção escolhida e a evidência que a sustentou; e tipo `escopo`, com o
   veredito de T0 mudando de 🔴 para o que ele vira a seguir. Não criar seção nova no board: os dois
   tipos já existem para isto. Sem `VAULT_ROOT` (perfil genérico), a mesma degradação do Step 3 se
   aplica: as duas linhas saem só no chat, declaradas no banner.

   Incorporar a decisão ao `REQUEST` **como adendo** (senão o T1 acha o mesmo gap de novo) e marcar,
   como estado interno da rodada, que o pedido **passou pelo Caminho grill**: é o que decide, lá na
   frente, se o Caminho vermelho pode encadear fatia-por-fatia.

   O sinal duro que disparou o gate está resolvido — **reaplicar o gate de escopo normalmente** a
   partir daqui (T0 intermediário e, depois, T1), com os sinais moles restantes ainda valendo. Pela
   própria definição do bullet que disparou o grill (sem outro sinal duro, no máximo 1 mole), este T0
   intermediário não pode dar 🔴 de novo por conta própria — só o T1, mais adiante, com sinais
   medidos em vez de estimados, ou um sinal novo que o próprio adendo da decisão introduza (ex.: a
   alternativa escolhida implica um terceiro repo). Reemitir a linha `escopo` do banner com o veredito
   do T0 intermediário.
5. **Usuário escolhe "nenhuma das opções"** → cai no Caminho vermelho normal (recusa), sem fatiar.
   Nenhum board nasce (o item 4, que abriria board, não roda nesta escolha), igual a qualquer outra
   recusa em T0. Grill ofereceu evidência; não decidiu por ninguém, e recusar continua sendo um
   resultado legítimo. **A evidência levantada não se perde**: as alternativas apuradas (com ou sem
   achado) entram no pré-refinamento que a recusa já entrega (`${FLUX_ROOT}/shared/scope-gate.md`, "A
   recusa é útil, ou não é recusa", item 2 — "o que já foi apurado até ali") como uma alternativa
   descartada a mais, não um passo perdido.

**Fora de escopo deste ramo:** o grill nunca decide sozinho (o gate sempre espera o usuário); não
substitui os specialists do Step 4 (a busca é rasa, só sobre a alternativa); não é modo de review de
PR; e **não encadeia fatia-por-fatia**: resolvida a decisão, ele termina, e o fluxo normal segue do T0
intermediário. Quem pode encadear, se o T1 ainda sair 🔴, é o Caminho vermelho.

---

## Step 3 — Resolver o board, antes do fan-out

Resolver conforme `${FLUX_ROOT}/shared/board-template.md`, "Resolver o board", com a mesma
chave `source:` da tabela de `case_keys` do template: o board desta sessão; senão o do caso pela
`case_key` `source:...`, no inbox ou já promovido; senão um novo em
`<VAULT_ROOT>/0-inbox/YYYY-MM-DD-HHMM-flux-issue-<slug>.md`, perfil exploração,
`generator: "flux-refine"`. **Anunciar o path no chat.** O board nasce antes do fan-out porque a
prospecção roda em N subagentes por minutos.

Duas particularidades deste elo:

1. **O nome do arquivo é `flux-issue`**, mesmo nascendo aqui: o board é do pedido.
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

**Teto de tempo: ~10 minutos.** Passando disso, parar o que não voltou, registrar no board quais repos
ficaram sem apurar e seguir com o que há, declarando a lacuna por nome no §2.

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
houver) como linha da Timeline, tipo `escopo`.

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

O plano **não vai para subagente**: é fan-in (reconciliar os retornos com os achados), da lista fechada
que fica na main (`${FLUX_ROOT}/shared/fanout-discipline.md`).

Cada slice segue o contrato de vertical slice do `${FLUX_ROOT}/shared/issue-template.md`
(independentemente entregável, atravessa as camadas necessárias, 1 repo) e nasce com:

- **ordem** e **grafo de bloqueio** (`#2 ⟵ bloqueada por #1` + motivo);
- **AFK ou HITL**, pelo mesmo critério binário do `flux:issue` (Step 3);
- **os achados que a sustentam**, para a coluna Embasamento (`✔ ◐ ✘ ?`) da candidata.

**Cada slice vira uma linha do painel**, em `🟡 RASCUNHADA`, com `Linear: n/d`. É exatamente o estado
em que o `flux:issue` espera encontrá-las — ele assume dali, escreve os corpos e abre o gate de
criação.

---

## Step 8 — Consolidar o board e apontar o próximo elo

1. Escrever a seção **7-septies 📐 Refinamento** do `${FLUX_ROOT}/shared/board-template.md` com os
   quatro blocos: **§1 PRD-fast**, **§2 TRD-fast**, **§3 Plano** e **§4 Veredito de escopo** (a faixa,
   os sinais lidos e, no 🟡, a lista nominal do que ficou raso).
2. Rolar o carimbo de data (frontmatter `updated:` e o `**Agora:**` do TL;DR) e gravar `scope:` no frontmatter.
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

Despachar um irmão exigiria resolver e verificar `${FLUX_CMD}` (Passo 1b do preflight), com o risco de
abortar ou degradar onde o prefixo não é verificável (`codex-compat.md`); um elo que termina num
artefato a ler não paga esse preço, e **nenhum elo chama o próximo sozinho**. **Exceção única:** o
encadeamento fatia-por-fatia, em que o elo se reinvoca a si mesmo, e por isso resolve e verifica
`${FLUX_CMD}` antes (o mesmo custo que `flux:reply` e o fallback agendado do `flux:iterate` pagam).

---

## Caminho vermelho — a recusa

Disparado por 🔴 em T0 (antes de tudo) ou em T1 (com a prospecção paga). A forma é a mesma; muda só
quanto material existe para entregar junto.

**Não refinar é o resultado correto, anunciado como resultado, não como erro**: nada de mensagem de
abortagem do preflight, que é para requisito faltando.

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

**Por padrão, fechar oferecendo a fatia 1**, com o comando pronto:

```
${FLUX_CMD}refine "<a fatia 1 proposta>"
```

Isto é o fim do Caminho vermelho **exceto** no caso coberto pela seção seguinte.

### Encadeamento fatia-por-fatia (só quando o pedido veio do Caminho grill)

Este 🔴 pode, num caso específico e estreito, encadear as fatias sozinho em vez de só oferecer a
fatia 1. As três condições são **todas** necessárias:

1. o `REQUEST` que chegou até aqui **passou pelo Caminho grill nesta mesma rodada** (marcado no item 4
   dele); a marca não sobrevive entre execuções, então board retomado de execução anterior não conta;
2. este 🔴 é o **T1** reavaliado depois do grill, nunca o T0 intermediário, nem quando ele sai 🔴 por um
   sinal novo do adendo (é estimado, e o T1 medido poderia desmentir o corte inteiro);
3. o corte proposto tem **2 ou mais fatias**.

Faltando qualquer uma das três, segue o fechamento padrão acima. Dadas as três:

1. **Resolver e verificar `${FLUX_CMD}`** (Passo 1b do preflight). Não verificável nesta sessão: **não
   encadear**; fechamento padrão (oferecer a fatia 1), com a degradação no banner.
2. **Teto duro de 8 fatias** (o mesmo limiar de "`>8 slices previstas`" de `scope-gate.md`, seção
   "Sinais moles"). Corte com mais de 8 fatias: o encadeamento **não roda nenhuma fatia** — cai no
   fechamento padrão, com o corte inteiro nomeado, degradação declarada no banner. Corte com 8 ou
   menos, segue para o item 3.
3. **Encadear sequencial, nunca paralelo, na própria main** (subagente não abre gate, e uma fatia pode
   precisar do próprio Caminho grill; e uma fatia pode mudar o que a próxima decide). Ordem: a do **grafo de bloqueio** das fatias
   (`#2 ⟵ bloqueada por #1`, Step 7), blockers primeiro; entre fatias sem dependência entre si (grafo
   parcial), a ordem em que elas aparecem no plano do Step 7 desempata. Para cada fatia, repetir os
   **Steps 0 a 8 deste mesmo skill**, com `REQUEST` = o texto da fatia — é uma rodada nova e completa,
   não uma continuação (banner próprio, T0/T1 próprios, seção própria `## 📐 Refinamento · fatia N de M`
   no mesmo board desta sessão, com a `case_key` `source:` da fatia acrescentada). **Uma fatia encadeada
   nunca encadeia de novo**, mesmo caindo nas três condições: fecha oferecendo a fatia 1 dela. O teto de
   8 é da cadeia que começou aqui, não cumulativo.
4. **Fatia que não produz artefato** — por qualquer motivo: sai 🔴 por conta própria (motivo dela, não
   relacionado à decisão original do grill), aborta por requisito `hard` faltando no meio da cadeia
   (checkout que sumiu, vault indisponível — abortagem continua sendo abortagem, não 🔴, `Caminho
   vermelho` acima), ou abre o próprio Caminho grill e o usuário escolhe "nenhuma das opções" ali. Em
   qualquer um desses casos: a cadeia **para ali**. As já rodadas ficam com suas seções no board; as que
   não rodaram entram nomeadas no handoff final, com a causa da parada. Uma fatia **pode** abrir o
   próprio Caminho grill, inclusive o GATE dele (roda na main).
5. **As fatias ficam no mesmo board**, uma seção por fatia, na ordem da cadeia, cada uma com a
   linha `> Fatia N de M desta cadeia.` logo abaixo do H2. As candidatas de todas as fatias entram no
   mesmo painel, numeradas em sequência. O `flux:issue` de cada fatia acha o board pela `case_key`
   dela.
6. **Gate de confirmação antes da 4ª fatia.** As três primeiras rodam direto (são continuação do que o
   usuário já decidiu no gate do grill). Antes da 4ª, e só ali: GATE (`${FLUX_ROOT}/shared/hitl.md`,
   "Como perguntar") perguntando se continua ou para.
   - **"continuar"** → segue até o fim ou até o teto de 8, sem novo gate.
   - **"parar"** → as já rodadas ficam com suas seções no board; as restantes entram nomeadas no handoff, no
     mesmo formato que o corte proposto normal usa.
7. **Handoff único ao final.** As rodadas **intermediárias** da cadeia não emitem o Step 8 item 4 (o
   `${FLUX_CMD}issue <board>` de cada uma) — cada rodada intermediária ainda faz o resto do próprio
   Step 8 (escrever a 7-septies, rolar o carimbo, `execution_status`) normalmente, só o item 4 (o
   aviso no chat) fica suprimido. Quem emite o handoff final, cobrindo todas as fatias do board:
   - **rodou tudo, ou parou numa fatia sem artefato (item 4)** → a última rodada que de fato executou
     emite o handoff final no lugar do seu próprio item 4 suprimido;
   - **parou no teto de 8, ou o usuário respondeu "parar" no gate** → nenhuma rodada nova chega a
     rodar depois da decisão de parar, então quem emite o handoff final é o próprio encadeamento (a
     orquestração da cadeia, não uma rodada individual), logo após a última fatia que rodou.

---

## Rules

- **Refinador, não executor e não criador de issue.** Se você se pegar escrevendo código ou chamando
  o tracker, o elo saiu da fronteira: pare e reporte.
- **Nenhuma afirmação sem âncora.** Todo ponto do TRD tem `arquivo:linha` e o veredito do achado que
  o sustenta. O que não foi apurado é declarado como não apurado.
- **Uma rodada.** Este elo não itera sobre o próprio artefato: PRD, TRD e plano não se reabrem depois
  de escritos (precisar de várias rodadas é sinal de escopo que o gate deveria ter pego). Não são
  segunda rodada: o Caminho grill remedindo o gate antes de qualquer artefato existir, nem o
  encadeamento fatia-por-fatia, que são **N execuções completas e independentes**, cada uma com seu
  PRD, TRD e plano do zero, numa seção nova do mesmo board.
- **O gate mede tamanho, nunca valor.** Recusa nomeia sinais, nunca julga o mérito do pedido.
- PT-BR com acentuação correta; EN no código. Sem em-dash no que puder ir para fora quando
  `NO_EMDASH == true` (o board é doc interno do vault; travessão liberado lá).
