# Manifestos de exemplo

Um `flux-context.json` vai num `.claude/` de workspace ou repo. O comando procura o **mais próximo**
subindo a árvore a partir do `cwd`. Sem manifesto nenhum, a família funciona no perfil genérico.

| arquivo | quando usar |
|---------|-------------|
| `solo.json` | um dev, repos próprios, sem time e sem tracker |
| `time.json` | time com reviewers próprios, suite de specialists curada e tracker |
| `pessoal.json` | projetos pessoais com vault de notas, sem tracker corporativo |

Contrato completo de cada campo: [`shared/flux-context.md`](../plugins/flux/shared/flux-context.md).

**Nenhum campo além de `name` é obrigatório.** Cada campo ausente cai no default do perfil genérico.

## O que você escreve e o que o `flux:equip` escreve

Quase todo campo é seu: você declara e os elos leem. **Dois são gravados pelo
[`flux:equip`](../plugins/flux/skills/equip/SKILL.md)**, o verbo de preparo que equipa um repo com o
motor de execução e a suite de specialists, e os dois só entram sob gate explícito:

| campo | quem escreve | para quê |
|---|---|---|
| `exec_fallback.<slug>` | `flux:equip` (Step 6) | o motor que ele autorou para aquele repo. Sem isso o motor existe e o `flux:build` continua caindo no modo autônomo |
| `write_destinations` | `flux:equip`, via [`write-destination.md`](../plugins/flux/shared/write-destination.md) | o destino de escrita já aprovado, com as guardas conferidas, para o gate não voltar a cada execução |

O `time.json` mostra os dois já preenchidos, como ficam **depois** de um `flux:equip` rodado. Num
manifesto novo eles simplesmente não existem, e isso é o estado correto: `write_destinations` ausente
significa "nada aprovado ainda", e o gate pergunta.

Repare também que ali o `exec_fallback` é um **mapa**, não um texto: `default` vale para o workspace
inteiro e `payments` sobrescreve para aquele repo. A forma de texto continua válida e equivale a um
mapa só com `default` — quem já tem um manifesto antigo não precisa mudar nada.

## `scope_escalation`, e por que ele é texto livre

Quando o [gate de escopo](../plugins/flux/shared/scope-gate.md) classifica um pedido como grande
demais para uma rodada, o `flux:refine` recusa e **encaminha**. Para onde, só o seu time sabe: pode
ser um comando, um repo de refinamento, um rito de produto ou uma pessoa. O campo é copiado verbatim
para a recusa.

Sem o campo, a recusa continua acontecendo e continua entregando o corte proposto, só que
recomendando genericamente um processo de refinamento completo. **Ela nunca cita uma ferramenta que
o manifesto não declarou** — mandar alguém para um processo que o time não tem é pior que não
encaminhar.
