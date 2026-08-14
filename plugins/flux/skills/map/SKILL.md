---
name: map
description: "Verbo de sanidade `flux:map` — levanta a instalação inteira da família nesta máquina (raízes de agents, manifestos de contexto, repos conhecidos, as três lentes por repo, colisões de `name:`) e grava o índice que os demais elos consomem. Roda fora de qualquer trabalho: não revisa, não implementa, não toca repo alvo. Executando de novo, mostra o que mudou desde a última vez — agents novos, repos novos, lentes que quebraram — e só escreve depois do gate. Sugerido antes de tudo; obrigatório para nada."
user-invocable: true
requires:
  hard:
    - file: shared/agents-index.md
    - file: shared/write-destination.md
    - file: shared/flux-context.md
    - bin: git
  soft:
    - bin: gh
    - vault
---

# /flux:map

O **verbo de sanidade** da família `flux:`. Ele responde uma pergunta que nenhum outro elo responde,
porque nenhum outro tem escopo para isso: **o que esta máquina tem, e o que está torto?**

Todo elo verifica, no preflight, o que *ele* precisa para *aquele* trabalho. Ninguém olha o conjunto.
O resultado é que uma suite quebrada, um manifesto renomeado ou uma colisão de `name:` só aparece no
meio de uma entrega, um elo por vez, e sempre como degradação — nunca como diagnóstico.

O `map` é esse diagnóstico, feito de uma vez, fora de qualquer trabalho. O artefato que ele deixa é o
`flux-agents.json` (`${FLUX_ROOT}/shared/agents-index.md`), que é o que torna o levantamento
reaproveitável em vez de descartável.

```
             ┌──────────────────┐
             │    flux:map      │  levanta a instalação · grava o índice     ← este
             └────────┬─────────┘  (fora do ciclo, sanidade da família)
                      │ informa
                      ▼
             ┌──────────────────┐
             │   flux:equip     │  L0 motor · L2 specialists · expõe L3
             └────────┬─────────┘  (fora do ciclo, preparo do terreno)
                      │ equipa
                      ▼
   issue → build → review/peek → iterate → land → reply
```

**Contrato do índice (formato, frescor, quem escreve):** `${FLUX_ROOT}/shared/agents-index.md`
**As três lentes e a escada de alcance da L3:** `${FLUX_ROOT}/shared/review-agents.md`
**Contrato de destino de escrita:** `${FLUX_ROOT}/shared/write-destination.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Gates com o usuário:** `${FLUX_ROOT}/shared/hitl.md`
**Disciplina de fan-out:** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Preflight:** `${FLUX_ROOT}/shared/preflight.md`

## Sugerido antes de tudo, obrigatório para nada

**Esta é a regra que mais importa neste verbo, e ela é fácil de perder.**

O `map` melhora o resultado dos outros elos; ele **não os habilita**. Sem índice, todo elo cai na
varredura direta — o comportamento que existia antes deste verbo — e declara `indice ausente` nas
degradações. Nada aborta, nada é bloqueado, nada exige setup.

Por isso o índice é `soft` em todo elo que o consome, e `hard` apenas aqui e no `equip`, que são os
dois que o escrevem. Uma família que exige um comando de preparo para funcionar deixou de funcionar
na máquina de quem acabou de instalá-la, que é o oposto do que este verbo existe para fazer.

Vale o mesmo para o que ele diagnostica: `map` **relata** e **oferece**. Ele não conserta suite, não
escreve agent, não mexe em repo. Quem repara é o `${FLUX_CMD}equip`.

## Fronteira com o preflight (os dois olham os mesmos fatos)

Sem esta regra escrita, os dois divergem, e passam a discordar sobre a mesma máquina:

| | preflight | `flux:map` |
|---|---|---|
| **escopo** | o que **este elo** precisa | a instalação inteira |
| **momento** | na invocação de um trabalho | fora de qualquer trabalho |
| **saída** | banner + nível de capacidade daquela execução | relatório de instalação + índice |
| **efeito de falta** | degrada ou aborta aquele elo | vira item do relatório |

O `map` **não substitui** o preflight de ninguém: um elo que rodou depois de um `map` verde ainda
resolve e confere as próprias lentes, porque a lista de agentes é da sessão e a sessão do `map` não é
a dele (`${FLUX_ROOT}/shared/preflight.md`, Passo 3-bis).

## Uso

```
/flux:map                         # levanta tudo, mostra o plano, escreve após o gate
/flux:map --repo <slug>           # só a entrada daquele repo
/flux:map --dry                   # levanta e relata; nunca escreve, nenhum gate abre
/flux:map --apply                 # pula o gate de escrita (automação)
```

| Flag | Efeito |
|------|--------|
| `--repo <slug>` | Restringe o levantamento a um repo. Útil depois de mexer numa suite; barato o bastante para rodar sempre que a suspeita for pontual. |
| `--dry` | Diagnóstico completo e relatório, **sem escrever nada e sem abrir gate**. |
| `--apply` | Escreve sem o gate de confirmação. O contrato de destino continua valendo por inteiro. |

**Escrever sempre passa pelo gate, e é isso que produz o dry-run natural.** Na primeira execução o
plano é "criar o índice"; nas seguintes, é o **diff** contra o que já está lá — agents novos, repos
novos, suites que sumiram, colisões que apareceram. Não há regra de "segunda execução é diferente":
há uma regra só, a de que escrever na máquina de alguém pede confirmação, e o diff é a consequência
de haver algo com que comparar.

## Ordem de execução

1. **Preflight** (`${FLUX_ROOT}/shared/preflight.md`), com a ressalva da fronteira acima.
2. **Descobrir as raízes de agents** que este harness varre. Não é lista deste contrato: cada harness
   declara as suas. Nenhuma raiz declarada ⇒ não há onde o índice morar; relatar e parar, sem inventar
   path por analogia com outro harness.
3. **Descobrir os manifestos de contexto** (`flux-context.json`), pela varredura do
   `${FLUX_ROOT}/shared/flux-context.md`. Para cada um: `name`, `workspace_root`, `repos`.
4. **Levantar os repos** — os declarados nos manifestos e os detectados sob cada `workspace_root`. Por
   repo, as três lentes: L1 (holístico resolvido), L2 (suite curada, pela cascata de
   `specialists_root`), L3 (`<checkout>/.claude/agents/`, filtro de intenção de review do 1b).
5. **Computar colisões** de `name:` entre tudo que foi levantado, e o `sha256` de cada conjunto.
6. **Relatar** (formato abaixo).
7. **Gate de escrita** e, aceito, gravar o índice conforme o contrato de destino.

**Os passos 4 e 5 vão para subagentes**, um por repo, em paralelo num único bloco
(`${FLUX_ROOT}/shared/fanout-discipline.md`). É o passo caro deste verbo — e o motivo de ele existir é
justamente concentrar esse custo aqui, uma vez, em vez de espalhá-lo por toda invocação de todo elo.
Na main ficam a descoberta de raízes e manifestos (barata), o relatório e o gate.

## O relatório

Aberto pelo banner do preflight, com `destino:` (é um verbo que escreve) e sem `holistico:` (não
revisa), como o `equip`.

O corpo tem três seções, e **a terceira é a razão de o verbo existir**:

1. **Inventário** — raízes, manifestos, repos, e por repo o estado das três lentes.
2. **Delta** — o que mudou desde o `generated_at` do índice anterior. Vazio na primeira execução, e
   dizer que está vazio por ser a primeira, não por não haver mudanças.
3. **Integridade** — o que está torto, com a remediação de cada caso:

| achado | remediação a oferecer |
|---|---|
| repo com `L2 ausente` | `${FLUX_CMD}equip <slug> --agents-only` |
| repo com `L3` presente e inalcançável | o degrau aplicável da escada (`${FLUX_ROOT}/shared/review-agents.md`, 1b-bis) |
| espelho L3 defasado (`synced_from_sha256` ≠ atual) | `${FLUX_CMD}equip <slug> --expose-l3` |
| colisão de `name:` entre suites | desfazer do lado da suite curada, nunca do lado do repo alheio |
| manifesto declarando repo sem checkout local | clonar, ou remover do `repos` — dizer as duas, não escolher |
| agent sem `name:` no frontmatter | não é invocável; apontar o arquivo |
| repo sem motor de execução (L0) | `${FLUX_CMD}equip <slug> --engine-only` |

**Nenhuma dessas remediações é executada aqui.** Todas são ofertas, e todas apontam para o `equip`.

## Out of scope (NUNCA faça)

- **Não conserte nada.** Nem suite, nem manifesto, nem agent, nem espelho. O `map` diagnostica; o
  `equip` repara. Um verbo de diagnóstico que também conserta deixa de poder ser rodado sem medo, que
  é a única coisa que ele precisa ser.
- **Não escreva dentro de checkout nenhum.** O índice mora na raiz de agents; nada é escrito em repo
  alvo, por nenhum motivo.
- **Não invoque agente de repo para "testar se funciona".** Invocar um agent de execução por engano
  tem efeito colateral no repo de outra pessoa. Presença e invocabilidade se apuram por leitura e pela
  lista da sessão, nunca por execução de teste.
- **Não revise, não implemente, não abra PR.**
- **Não escreva no manifesto de contexto.** Sugerir campo faltando (`tracker_repo_map`, `repos`
  desatualizado) é relatório; escrever é gate do `equip`.
- **Não trate a ausência do índice como erro do usuário.** Ele é opcional por desenho.

## Rules

- PT-BR com acentuação correta, como todo output da família.
- Toda contagem do relatório sai de leitura real (filesystem, `git`, lista de agentes da sessão).
  Sem fonte, `n/d` — nunca estimativa.
- O índice gravado carrega `generated_at` e `generated_by`, que **são** o carimbo: não inventar
  arquivo de marcação separado.
- Rodar o `map` é barato de repetir e caro de errar: na dúvida entre relatar e agir, relate.
