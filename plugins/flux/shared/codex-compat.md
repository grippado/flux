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

## Limites

Worktrees, aprovação humana e verificação externa continuam obrigatórios. O Codex não deve usar
nomes Claude/Cursor para invocar skills; resolver `${FLUX_CMD}` pela forma que a sessão expõe e
usar `UNAVAILABLE` quando não houver uma forma verificável. Claude Code e Cursor continuam usando
seus próprios adaptadores, com `${FLUX_ROOT}` e `${FLUX_CMD}` preservados.
