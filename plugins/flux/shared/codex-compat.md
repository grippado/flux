# Adaptador Codex

Este arquivo é a ponte entre os contratos compartilhados do Flux e o runtime do Codex. As
skills, agents e templates continuam sendo uma única fonte; o harness só troca a forma de
descobrir recursos, delegar trabalho e anunciar limitações.

## Recursos

Resolver `${FLUX_ROOT}` pela raiz do plugin em que esta skill foi carregada. O manifesto Codex
declara `skills: ./skills/`, portanto `shared/`, `agents/` e `assets/` são irmãos desse diretório.
Não copiar nem duplicar os contratos compartilhados. Se o plugin estiver em uma instalação
empacotada, usar a raiz fornecida pelo ambiente; se estiver em checkout, resolver a partir do
caminho da skill.

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

## Limites

Worktrees, aprovação humana e verificação externa continuam obrigatórios. O Codex não deve usar
nomes Claude/Cursor para invocar skills; resolver `${FLUX_CMD}` pela forma que a sessão expõe e
usar `UNAVAILABLE` quando não houver uma forma verificável. Claude Code e Cursor continuam usando
seus próprios adaptadores, com `${FLUX_ROOT}` e `${FLUX_CMD}` preservados.
