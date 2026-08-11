# Adaptador Codex

Este arquivo é a ponte entre os contratos compartilhados do Flux e o runtime do Codex. As
skills, agents e templates continuam sendo uma única fonte; o harness só troca a forma de
descobrir recursos, delegar trabalho e anunciar limitações.

## Recursos

Resolver `${FLUX_ROOT}` pelos candidatos 3 e 4 do Passo 1a do
[`preflight.md`](preflight.md), nesta ordem: `${CODEX_PLUGIN_ROOT}` quando a sessão o define e,
não havendo, o primeiro diretório acima da skill que contenha `.codex-plugin/plugin.json`.

O segundo é o caminho que de fato funciona hoje, e é por isso que ele existe: o Codex resolve
plugin por caminho relativo ao marketplace e **não documenta uma variável de raiz de plugin** —
`CODEX_HOME` aponta para as skills, não para cá. Achado o root, o manifesto declara
`skills: ./skills/`, portanto `shared/`, `agents/` e `assets/` são irmãos desse diretório.

Não copiar nem duplicar os contratos compartilhados.

## Delegação

Onde um contrato Claude/Cursor disser `Task tool`, o adaptador Codex deve usar a delegação nativa
de subagentes do Codex. Cada unidade independente vai em uma chamada de subagente separada e,
quando puder rodar sem depender de outra, todas são despachadas em paralelo. Não simular a Task
tool, não executar investigação pesada na conversa principal e não pedir ao subagente para abrir
um gate com o usuário.

O resto do protocolo não muda e não é repetido aqui: vale
[`fanout-discipline.md`](fanout-discipline.md) como está escrito.

## Capacidades ausentes

O perfil genérico continua válido sem MCP, vault, Linear, Slack ou specialists. O preflight deve
declarar cada ausência como degradação: `reply` fica em modo rascunho sem Slack; `review`/`peek`
não persistem sem vault; `issue` não cria no Linear sem integração; e sem specialists só a lente
holística é usada. Nenhuma dessas ausências autoriza inventar dados, endpoints ou agentes.

### `land` degrada no Codex

`${FLUX_CMD}` não resolve no Codex hoje. O Passo 1b do [`preflight.md`](preflight.md) verifica
`/flux:`, `/flux-` e `/`, e nenhuma dessas formas corresponde ao modo como o Codex expõe a skill.
Pela regra do próprio passo, `FLUX_CMD` fica `UNAVAILABLE`.

Isso atinge **um** elo, e só um: o `flux:land`, que é o único que despacha um irmão (ele roda o
`iterate` por PR dentro de subagente). Os demais verbos da família funcionam normalmente.

A oferta de Bootstrap de specialists (`review`, `iterate`, `land` e `build`) **não** entra nesta
conta, e o motivo mudou: sem `FLUX_CMD`, a oferta **imprime a instrução e não executa**. Ela deixa de
ser um gate com opções que escrevem e passa a ser uma linha honesta — qual camada falta, que o verbo
de preparo é o `equip`, e que ele precisa ser invocado à mão pela forma que aquela sessão expõe.
Invocado à mão, o `equip` funciona normalmente no Codex; o que não funciona é montar o nome dele
dentro de outro elo.

**Por que o modo degradado não é "o elo faz por si".** Uma versão anterior deste arquivo mandava o elo
seguir o [`bootstrap-specialists.md`](bootstrap-specialists.md) direto, tratando a delegação por nome
como comodidade de organização. Isso deixou de ser verdade em três frentes ao mesmo tempo, e nenhuma
delas é cosmética:

- Aquele documento passou a dizer, literalmente, que **um elo que ofereceu o Bootstrap não roda estes
  passos: ele chama o verbo**. Seguir o procedimento por si contraria a fonte que se está citando.
- A escrita de artefato gerado fora do repo e a escrita no manifesto estão atribuídas, em
  [`hitl.md`](hitl.md), **ao `flux:equip`**. São ações com gate, e o dono do gate é o verbo.
- `review`, `iterate` e `land` **não declaram** `write-destination.md` em `requires`. O preflight
  deles nunca verificou o contrato de destino, então executá-lo seria escrever no disco de alguém a
  partir de um elo que não tem o contrato em contexto — sem cascata, sem as três guardas, sem gate
  por arquivo existente.

Somadas, elas invertem o sinal do degradado: um elo que executa por si no Codex não é uma versão mais
autônoma da oferta, é uma versão **mais perigosa** dela, porque escreve com menos verificação do que a
execução normal. E este arquivo já tem o precedente certo, três parágrafos abaixo, no `land`: quando o
despacho não é possível, o caminho é dizer que não é, nunca degradar para uma execução inline fora do
contrato. Preparo não feito custa uma invocação manual; preparo feito errado custa um arquivo no disco
de alguém, possivelmente através de um symlink, possivelmente dentro de um repositório git.

O comportamento correto, e ele já está escrito no Passo 1b, é abortar a fase de despacho com a
mensagem padrão — **nunca** degradar para uma iteração inline fora do contrato. Um `land` que
"quase" roda é pior que um `land` que diz que não roda: ele produziria PRs iteradas sem worktree,
sem verificação contra código real e sem disciplina de resposta.

Enquanto isso valer, o `flux:land` é o único verbo da família indisponível no Codex, e o banner de
perfil deve declarar a ausência. Quem precisa de entrega multi-PR no Codex usa o `iterate` PR a PR e
coordena a ordem de merge à mão.

Isto é **débito técnico registrado**, não desenho definitivo:
[LAB-77](https://linear.app/g-lab-s/issue/LAB-77).

## Limites

Worktrees, aprovação humana e verificação externa continuam obrigatórios. O Codex não deve usar
nomes Claude/Cursor para invocar skills; resolver `${FLUX_CMD}` pela forma que a sessão expõe e
usar `UNAVAILABLE` quando não houver uma forma verificável. Claude Code e Cursor continuam usando
seus próprios adaptadores, com `${FLUX_ROOT}` e `${FLUX_CMD}` preservados.
