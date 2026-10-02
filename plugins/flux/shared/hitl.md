# Gates com o usuário (HITL) — fonte única

> Fonte única de **quando** um elo `flux:` para para perguntar, **como** ele pergunta, e o que ele
> faz quando o harness não oferece o mecanismo preferido. Todo gate da família obedece este
> contrato. **Não duplicar esta lógica** dentro dos verbos: eles descrevem o menu, este arquivo
> descreve o protocolo.
>
> **Princípio:** ação que sai da máquina do usuário, ou que altera o trabalho dele, é decisão dele.
> O elo prepara tudo, mostra o que vai fazer, e espera escolha explícita. Nunca supõe consentimento
> por contexto, por urgência, ou por a resposta parecer óbvia.

## O que é um GATE

Um **GATE** é um ponto de parada obrigatório onde o elo apresenta opções e **não segue sem escolha
positiva do usuário**. Não é uma pergunta retórica nem um aviso: se o usuário não escolheu, nada
acontece.

### Ações que exigem GATE, sempre

| ação | onde aparece |
|------|--------------|
| postar comentário, review ou reação no GitHub | `flux:review` (8b), `flux:iterate` |
| criar ou editar issue no tracker | `flux:issue` |
| salvar rascunho ou reagir no Slack | `flux:reply` |
| commitar, pushar ou alterar o working tree | `flux:review` (8c), `flux:iterate` |
| abrir PR (mesmo draft) | `flux:build`, `flux:equip` (PR da suite) |
| escrever artefato gerado fora do repo alvo e fora do vault | `flux:equip`, via `${FLUX_ROOT}/shared/write-destination.md` |
| **escrever no manifesto de contexto** (`flux-context.json`) | `flux:equip`: a aprovação de destino (passo 9 do `write-destination.md`) e o `exec_fallback` do repo (Step 6) |
| escolher entre alvos ambíguos quando errar custa caro | `flux:issue` (qual board retomar), `flux-context.md` (qual perfil reivindica o slug) |

A lista é de **categorias**, não de call sites: uma ação nova que se encaixe numa dessas linhas nasce
com gate, sem precisar emendar esta tabela.

> **A linha do manifesto é a mais recente, e a única que altera a configuração da família.** Até o
> `flux:equip`, nenhum elo escrevia o `flux-context.json` — todos liam. Alterar o arquivo que governa
> os demais elos, num arquivo que costuma ser versionado nos dotfiles de alguém, é ação com
> gate, nunca consequência de ter equipado um repo.

### O que NÃO precisa de gate

- Ler qualquer coisa (repo, PR, doc, thread).
- Escrever no vault. O vault é o caderno do usuário e o board é o que torna o trabalho auditável;
  exigir confirmação para anotar transformaria cada elo numa entrevista.
- Imprimir parecer, plano ou prévia no chat.
- Confirmações leves de fluxo, onde uma frase direta no chat basta e o custo do erro é zero
  (ex.: `flux:peek` perguntando se classificou certo um artefato desconhecido). Continua valendo a
  regra de só agir após resposta, mas sem a cerimônia do menu.

## Como perguntar

**Mecanismo preferido:** `AskUserQuestion`, single-select, uma única question por gate.

- A opção **recomendada é a primeira**, e leva `(Recomendado)` no label.
- Toda opção tem descrição dizendo **o que vai acontecer**, incluindo o que ela **não** faz
  ("não posta nada", "sem push automático"). O usuário decide pelo efeito, não pelo nome.
- A última opção é sempre a saída inócua (`Não fazer nada`, `Não postar`). Um gate sem porta de saída
  não é um gate, é um pedágio.
- Multi-select só quando as escolhas forem de fato independentes. Na dúvida, single-select.

## Quando o harness não tem o mecanismo

`AskUserQuestion` é um tool do harness, não uma garantia da linguagem. Numa sessão que não o ofereça,
o gate **não desaparece** — muda de forma:

1. Imprimir a pergunta e as opções **numeradas** no chat, com as mesmas descrições, mantendo a
   recomendada em primeiro e a saída inócua por último.
2. **Parar e esperar a resposta.** Não seguir para o passo seguinte, não escolher a recomendada por
   iniciativa própria, não interpretar silêncio como consentimento. Numa execução headless não há
   quem responda: antes de encerrar, gravar o sinal da seção "Execução headless" abaixo.
3. Declarar a degradação no banner de perfil, como qualquer `soft` ausente
   (`${FLUX_ROOT}/shared/preflight.md`, Passo 5).

> **A degradação é de forma, nunca de rigor.** Um gate que vira "escolhi a recomendada porque não
> tinha como perguntar" é pior do que não ter gate nenhum: produz uma ação não autorizada com
> aparência de fluxo normal, e o usuário só descobre quando o comentário já está na PR.

## Execução headless: o sinal `flux-gate/1`

Um harness headless sai com código `0` mesmo quando o elo parou num gate esperando decisão humana, e
texto final não é contrato. A CLI entrega à skill um canal estruturado: a linha `gate_signal:` do bloco
`--- PREFLIGHT RESOLVIDO ---` da mensagem que invocou o elo (como `run_id`, só no bloco da invocação,
nunca no JSON de `flux preflight`; ver `${FLUX_ROOT}/shared/step0-cli.md`). O lado da CLI (caminho por
execução, exit code `10`, o que ela faz com o arquivo) está descrito em `cli/README.md`, seção "Gate
pendente em execução headless", e não se repete aqui.

**Gatilho exato.** O passo 2 acima foi alcançado (sem `AskUserQuestion`) **e** o bloco traz
`gate_signal: <caminho>`. Nesse ponto, e só nesse, gravar o sinal no caminho **antes** de encerrar. A
skill não tem como verificar se a sessão é headless: o critério é mecânico (o passo 2 foi alcançado),
e o passo seguinte cobre o caso de a resposta chegar depois.

- **Uma gravação, atômica:** escrever num arquivo temporário no mesmo diretório e renomear para o
  caminho do sinal. Nunca gravar parcial.
- **Não gravar** quando o gate foi respondido, nem quando `AskUserQuestion` abriu o gate normalmente.
  O sinal diz "parei sem resposta", não "passei por um gate".
- **Resposta que chega depois da gravação:** se a sessão receber a resposta humana ao gate depois de
  o sinal ter sido gravado, **apagar o arquivo antes de agir**. Isso não cria recibo: continua
  valendo que só a ausência do arquivo significa que não há gate pendente.
- **Gravação que falha** (diretório ausente, sem permissão, rename recusado): dizer numa linha no chat
  que o gate ficou pendente sem sinal, declarar no banner com o token `gate signal nao gravado`
  (`${FLUX_ROOT}/shared/preflight.md`, Passo 5) e **não** fingir cobertura. O sinal é melhor esforço:
  nunca bloqueia o elo nem substitui parar no gate.
- **Limite declarado:** um headless em que `AskUserQuestion` existe e ninguém responde não chega ao
  passo 2 e não grava. Nesse caso o sinal não cobre, e o gate continua dependendo do texto da saída.
- **Campo ausente, ou `gate_signal: indisponivel (<motivo>)`:** não há canal. Seguir o passo 2 como
  sempre, **não** prometer detecção mecânica de gate pendente, e declarar o motivo no banner (token
  `gate signal indisponivel`, `${FLUX_ROOT}/shared/preflight.md`, Passo 5). Campo ausente não gera
  token: é o caso comum fora da CLI, e declarar o default é ruído.

**Contrato do arquivo:**

```json
{"schema":"flux-gate/1","pending":true,"kind":"pr-open","question":"Abrir a PR draft?","options":["Abrir","Cancelar"]}
```

- `schema` (`flux-gate/1`), `pending` (sempre `true`) e `kind` são obrigatórios. Não existe recibo de
  gate resolvido: gate resolvido não grava nada, e só a **ausência** do arquivo significa que o elo
  não parou num gate. Qualquer arquivo existente que não seja um sinal pendente válido (vazio, JSON
  inválido, outro `schema`, sem `pending: true`, `kind` ausente, nulo ou fora do vocabulário) a CLI
  trata como gate pendente.
- `kind` é uma categoria de `GATE_KINDS` em `${FLUX_ROOT}/scripts/run.sh` (o vocabulário que
  `run.sh gate` valida, e que é o dono dele: a tabela abaixo o espelha, e a CLI tem teste de
  paridade), obtida da ação que pediu o gate, pela tabela "Ações que exigem GATE":

| ação da tabela | `kind` |
|---|---|
| postar comentário, review ou reação no GitHub | `github-post` |
| criar ou editar issue no tracker | `issue-write` |
| salvar rascunho ou reagir no Slack | `slack-write` |
| commitar, pushar ou alterar o working tree | `commit-push` |
| abrir PR (mesmo draft) | `pr-open` |
| escrever artefato fora do repo alvo e fora do vault | `write-outside` |
| escrever no manifesto de contexto | `write-manifest` |
| escolher entre alvos ambíguos | `ambiguous-target` |

- **Menu com opções de categorias diferentes** (por exemplo, "Aplicar correções" é `commit-push` e
  "Postar comentários inline" é `github-post` no mesmo gate): o `kind` é o da **opção recomendada**,
  a primeira do menu (seção "Como perguntar"). Num gate pendente ninguém escolheu, então o `kind`
  descreve o que a recomendada faria, e a skill não escolhe por precedência própria.
- `question` (texto) e `options` (lista de textos) são opcionais e só para exibição: a pergunta e os
  rótulos do menu numerado do passo 1. No máximo 200 caracteres cada e 8 opções; a CLI trunca e remove
  caracteres de controle. Nada de segredo, token nem trecho de código: o texto vai ao terminal e a CLI
  não o grava no run.

## Subagente não tem canal com o usuário

Regra herdada de `${FLUX_ROOT}/shared/fanout-discipline.md`: **subagente nunca abre gate.** Ele não
tem como perguntar, e uma pergunta feita lá dentro ou trava a execução ou é respondida pelo próprio
modelo — os dois desfechos são ruins.

Então:

- O gate vive no **contexto principal**, antes de despachar ou depois de colher o retorno.
- Quem despacha resolve o gate primeiro e passa a decisão já tomada ao subagente.
- Elos que rodam dentro de subagente recebem uma flag de procuração, que **pula os gates porque a
  decisão já foi tomada por quem despachou** — não porque gates sejam opcionais. São duas hoje, e a
  diferença entre elas não é cosmética:

| flag | quem despacha | o que a procuração cobre | o que ela **não** cobre |
|---|---|---|---|
| `--auto` | `flux:land` → `flux:iterate`, por PR | autonomia de iteração sobre uma PR que a main já escolheu | nada fora daquela PR |
| `--from-map` | `flux:map` → `flux:equip`, por repo | escopo do conserto e destino de escrita, ambos aceitos no gate da main | **arquivo existente** e **manifesto**: o filho para e devolve, e a main abre o gate |

**A segunda linha é a categoria mais forte que a família delega, e por isso ela vem com limite
explícito.** `--from-map` transfere consentimento de **escrita no disco do usuário, fora do repo
alvo** — a mesma categoria que a lista acima atribui nominalmente ao `flux:equip`. Ela só é legítima
sob as três garantias da Forma 2 do `${FLUX_ROOT}/shared/fanout-discipline.md`, e a terceira delas
existe justamente porque **consentimento dado antes não cobre fato surgido depois**: no instante do
gate, o arquivo que o filho encontrou não existia.

Uma procuração nova é **categoria**, não call site: ela nasce aqui, com a linha na tabela e o limite
declarado, antes de existir no corpo de qualquer verbo. Uma flag com semântica de gate que o contrato
de gates não conhece é um gate invisível.

`--auto` fora de subagente, pedido pelo usuário na linha de comando, é o usuário abrindo mão do gate
para aquela execução. Legítimo, e a única forma de renunciar: nenhum elo decide sozinho rodar em
modo automático.

## Modo watch

Num tick de watch (background), não há usuário assistindo. Vale a regra do subagente: o tick não abre
gate. Ele acumula o que precisa de decisão e apresenta no próximo ponto interativo, ou registra no
board como pendência explícita.

**O wake não é aprovação de gate.** O que reabre a sessão de um watch (o fim de um processo em
background, um wake agendado, uma mensagem enfileirada pelo invólucro de um adaptador) é sinal de que
há trabalho, nunca resposta a uma pergunta. Vale igual quando o wake chega com papel de mensagem de
usuário: o texto dele não é lido como decisão, gate pendente continua pendente, e só uma resposta do
usuário num ponto interativo o fecha.

Exceção já prevista: gatilho que muda o estado do trabalho de forma relevante (PR saindo de draft no
`flux:land`) pode interromper o watch e abrir um gate, porque aí existe uma decisão nova que não
estava na mesa quando o watch começou.
