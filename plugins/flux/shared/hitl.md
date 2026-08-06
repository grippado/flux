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
| abrir PR (mesmo draft) | `flux:build`, Bootstrap de specialists |
| escolher entre alvos ambíguos quando errar custa caro | `flux:issue` (qual board retomar), `flux-context.md` (qual perfil reivindica o slug) |

A lista é de **categorias**, não de call sites: uma ação nova que se encaixe numa dessas linhas nasce
com gate, sem precisar emendar esta tabela.

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
   iniciativa própria, não interpretar silêncio como consentimento.
3. Declarar a degradação no banner de perfil, como qualquer `soft` ausente
   (`${FLUX_ROOT}/shared/preflight.md`, Passo 5).

> **A degradação é de forma, nunca de rigor.** Um gate que vira "escolhi a recomendada porque não
> tinha como perguntar" é pior do que não ter gate nenhum: produz uma ação não autorizada com
> aparência de fluxo normal, e o usuário só descobre quando o comentário já está na PR.

## Subagente não tem canal com o usuário

Regra herdada de `${FLUX_ROOT}/shared/fanout-discipline.md`: **subagente nunca abre gate.** Ele não
tem como perguntar, e uma pergunta feita lá dentro ou trava a execução ou é respondida pelo próprio
modelo — os dois desfechos são ruins.

Então:

- O gate vive no **contexto principal**, antes de despachar ou depois de colher o retorno.
- Quem despacha resolve o gate primeiro e passa a decisão já tomada ao subagente.
- Elos que rodam dentro de subagente recebem `--auto`, que **pula os gates porque a decisão já foi
  tomada por quem despachou** — não porque gates sejam opcionais. É o caso do `flux:iterate` quando
  o `flux:land` o roda por PR.

`--auto` fora de subagente, pedido pelo usuário na linha de comando, é o usuário abrindo mão do gate
para aquela execução. Legítimo, e a única forma de renunciar: nenhum elo decide sozinho rodar em
modo automático.

## Modo watch

Num tick de watch (background), não há usuário assistindo. Vale a regra do subagente: o tick não abre
gate. Ele acumula o que precisa de decisão e apresenta no próximo ponto interativo, ou registra no
board como pendência explícita.

Exceção já prevista: gatilho que muda o estado do trabalho de forma relevante (PR saindo de draft no
`flux:land`) pode interromper o watch e abrir um gate, porque aí existe uma decisão nova que não
estava na mesa quando o watch começou.
