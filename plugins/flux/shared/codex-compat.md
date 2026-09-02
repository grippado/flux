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

**Consequência para kits, e ela é do caso ordinário.** O degrau 3 do `KIT_ROOTS` (irmãos de
`${FLUX_ROOT}`, Passo 1d do [`preflight.md`](preflight.md)) só vale quando a raiz veio dos candidatos
1 a 3, porque são os únicos em que o harness declarou ter instalado o plugin. Resolvendo pelo
candidato 4 — que é o caminho normal aqui —, essa origem **não é consultada**, e o elo declara
`kit origem nao consultada` em `degradacoes:`. Um kit irmão instalado ao lado do flux fica invisível
até que se declare `kits` no manifesto, que é a remediação completa. O motivo de o candidato 4 não
servir de guarda está no Passo 1d: o marcador `.codex-plugin/plugin.json` existe igual no checkout de
trabalho do próprio flux, e não distingue instalação de checkout. Reabrir o degrau é a
[LAB-107](https://linear.app/g-lab-s/issue/LAB-107).

## Delegação

Onde um contrato Claude/Cursor disser `Task tool`, o adaptador Codex deve usar a delegação nativa
de subagentes do Codex. Cada unidade independente vai em uma chamada de subagente separada e,
quando puder rodar sem depender de outra, todas são despachadas em paralelo. Não simular a Task
tool, não executar investigação pesada na conversa principal e não pedir ao subagente para abrir
um gate com o usuário.

O resto do protocolo não muda e não é repetido aqui: vale
[`fanout-discipline.md`](fanout-discipline.md) como está escrito.

### Adaptador de instruções de agente

Claude Code e Cursor resolvem um agente pelo `subagent_type` que o harness registrou. O Codex
despacha subagentes nativos genéricos: um nome declarado no manifesto **não é** uma capacidade
registrada e não deve ser passado como se fosse. Nesta seção, portanto, toda ocorrência de
`subagent_type: <AGENT>` nos contratos compartilhados é substituída pelo procedimento abaixo.

1. A main resolve uma **fonte de instruções**, isto é, um arquivo regular e legível de agent. Para
   L1, a ordem é: `holistic_reviewer` do manifesto **somente se for um path explícito e legível**,
   override do checkout (`.claude/agents/reviewer.md`, depois `.cursor/agents/reviewer.md`), e
   `${FLUX_ROOT}/agents/pr-reviewer.md`. Para L2 e L3, é o arquivo já encontrado por
   `review-agents.md`. Nunca derive um path de um nome nem procure por semelhança.
2. Se uma fonte configurada não existir, registrar a tentativa em `degradacoes:` com o token
   `fonte L1 por nome` da tabela de tokens canônicos do `preflight.md`. No caso de L1,
   o genérico da família é um fallback explícito e válido; se ele também não existir, é `hard` e o
   elo aborta. Para L2/L3 e para papéis sem genérico correspondente (answerer, prospector e
   reviewer de documento), fonte ausente ou ilegível significa lente/capacidade indisponível, sem
   substituição inventada.
3. Despachar um subagente nativo genérico por unidade independente, com o path absoluto resolvido
   e a instrução: ler esse arquivo integralmente antes da análise, obedecer seu contrato de saída,
   e devolver o resultado estruturado ao orquestrador. O prompt inclui os inputs já resolvidos pela
   main e proíbe re-resolver agentes, trocar a fonte ou alegar cobertura de uma lente não recebida.
4. Registrar no rodapé de cobertura o path da fonte e se o despacho retornou. `invocada: sim` só
   vale quando esse subagente foi de fato despachado; arquivo legível sem despacho continua sendo
   `invocada: não`.

O nome configurado continua útil como documentação para Claude/Cursor, mas no Codex o identificador
auditável é o caminho da fonte efetivamente lida. Assim, um manifesto que declare
`arco-pr-reviewer` sem arquivo correspondente não bloqueia nem finge executar esse agente: o
banner declara a configuração indisponível e, quando presente, o `pr-reviewer.md` genérico é a
L1 que realmente rodou.

Esta é uma exceção limitada ao runtime Codex. Não criar cópias, symlinks, registros artificiais nem
arquivos `commands/` para simular a descoberta dos outros harnesses; Claude Code e Cursor preservam
exatamente sua resolução por `subagent_type`.

## Capacidades ausentes

O perfil genérico continua válido sem MCP, vault, Linear, Slack ou specialists. O preflight deve
declarar cada ausência como degradação: `reply` fica em modo rascunho sem Slack; `review`/`peek`
não persistem sem vault; `issue` não cria no Linear sem integração; e sem specialists só a lente
holística é usada. Nenhuma dessas ausências autoriza inventar dados, endpoints ou agentes.

### Alcance da L3 e índice de agents

O degrau 0 da escada de alcance ([`review-agents.md`](review-agents.md), 1b-bis) depende de
`ADDDIR_CMD`, resolvido no Passo 1c do [`preflight.md`](preflight.md). Onde o Codex não expuser a
capacidade de acrescentar um diretório à sessão, `ADDDIR_CMD` fica `UNAVAILABLE` e **o degrau 0 sai da
escada**: o alcance da L3 passa pelo degrau 1 (espelho namespaceado via `equip --expose-l3`), que não
depende de capacidade nenhuma do harness. A escada foi escrita para sobreviver a essa ausência, e não
há nada a fazer além de declará-la.

O `flux-agents.json` ([`agents-index.md`](agents-index.md)) nasce **na raiz de agents que o harness
declara**, e por isso não é lista de produto: onde o Codex declarar a sua, o índice mora lá. Não
havendo raiz declarada, o `flux:map` não tem destino, e o verbo diz isso em vez de escolher um path por
analogia com outro harness — os elos que consomem o índice já o declaram `soft` e caem para a varredura
direta com `indice ausente` no banner.

As ofertas novas (`equip --expose-l3`, `map`) são ofertas de **verbo irmão** e caem na mesma carve-out
da seção seguinte: sem `FLUX_CMD`, imprimem a instrução em vez de executar. Vale nos dois sentidos —
o `flux:map` é oferecido por outros elos e ele próprio oferece o `equip`, e nenhuma das duas pontas
executa sem `FLUX_CMD`.

### `land` degrada no Codex

`${FLUX_CMD}` não resolve no Codex hoje. O Passo 1b do [`preflight.md`](preflight.md) verifica
`/flux:`, `/flux-` e `/`, e nenhuma dessas formas corresponde ao modo como o Codex expõe a skill.
Pela regra do próprio passo, `FLUX_CMD` fica `UNAVAILABLE`.

Isso atinge os elos que **despacham um irmão**, e são dois — mas eles reagem de formas diferentes, e a
diferença é o que importa aqui:

- **`flux:land`** roda o `iterate` por PR dentro de subagente, e sem esse despacho não há entrega
  multi-PR: a fase **aborta**, e com ela o verbo. É o único indisponível no Codex.
- **`flux:map`** despacha o `equip` por repo na fase de conserto, que é a segunda metade do verbo. Sem
  `FLUX_CMD` ele **degrada**: o levantamento, o delta, a integridade e o índice saem inteiros, e as
  remediações são impressas para o usuário rodar à mão. Continua sendo um verbo útil, com uma metade a
  menos e a perda declarada no banner.

Os demais funcionam normalmente.

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
