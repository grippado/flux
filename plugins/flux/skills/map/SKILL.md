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

Vale o mesmo para o que ele diagnostica: `map` **relata, oferece e despacha**. O único arquivo que ele
escreve com as próprias mãos é o índice; suite, espelho e motor são escritos pelo
`${FLUX_CMD}equip`, que o `map` chama sob consentimento (seção "Despacho dos consertos"). A diferença
importa: cada escrita continua sob o contrato que a governa, e recusar todos os consertos deixa o
`map` sendo exatamente o que ele era, um levantamento.

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
/flux:map --no-fix                # levanta e relata; não oferece despachar conserto nenhum
```

| Flag | Efeito |
|------|--------|
| `--repo <slug>` | Restringe o levantamento a um repo. Útil depois de mexer numa suite; barato o bastante para rodar sempre que a suspeita for pontual. |
| `--dry` | Diagnóstico completo e relatório, **sem escrever nada e sem abrir gate**. |
| `--apply` | Escreve sem o gate de confirmação. O contrato de destino continua valendo por inteiro. |
| `--no-fix` | Desliga a fase de despacho: o relatório sai com as invocações de remediação impressas, e nada é oferecido. É o modo "só quero olhar". |

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
8. **Despacho dos consertos**, quando o usuário aceitar algum no gate (seção própria abaixo), e
   **reconciliação** do índice depois que os filhos voltarem.

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

**Nenhuma dessas remediações é executada por este verbo.** O `map` não escreve suite, não escreve
espelho, não mexe em manifesto. O que ele faz é **despachar** o verbo que é dono de cada gate, o que é
outra coisa — e é o assunto da seção seguinte.

## Despacho dos consertos (fan-out de `equip`)

Um doctor que só reclama é meio doctor. Depois do relatório, o `map` oferece rodar as remediações, e
as executa **chamando o `${FLUX_CMD}equip`** — nunca escrevendo por conta própria. Quem escreve segue
sendo o dono do gate; o `map` vira a porta de entrada única.

Isto não é exceção: `review`, `iterate`, `land` e `build` já oferecem o `equip` no fechamento em vez
de gerar suite por conta. O `map` faz o mesmo, com a diferença de enxergar a máquina inteira em vez de
um repo.

### O gate acontece na main, antes do despacho

**Item a item, nunca um "consertar tudo".** Um comando de diagnóstico que aplica N escritas de uma
tacada é o mais destrutivo da família, não o mais útil. O gate lista cada remediação com o repo e a
invocação exata, e o usuário escolhe quais entram.

Duas razões para o gate ser aqui e não dentro de cada filho:

- **Subagente não tem canal com o usuário.** Um `equip` despachado que abrisse gate travaria. É a
  mesma razão pela qual o `flux:land` passa `--auto` ao `iterate`.
- **O gate de destino é de escopo máquina, e este é o verbo de escopo máquina.** Resolver a cascata do
  `${FLUX_ROOT}/shared/write-destination.md` **uma vez**, aqui, é melhor do que N filhos perguntando N
  vezes onde escrever na mesma máquina. O destino resolvido desce no prompt de cada filho como fato
  dado, no mesmo espírito do Passo 3-bis do preflight.

O que o usuário aprovou no gate **é** o consentimento; nenhum filho re-pergunta nada.

### O fan-out é seguro porque os destinos são disjuntos

Um `equip` por repo, todos no mesmo bloco (`${FLUX_ROOT}/shared/fanout-discipline.md`). Repos
diferentes escrevem em `<raiz de agents>/<ctx>/<slug>/` diferentes, então não colidem **por desenho**.

**Menos num ponto, e é o ponto que decide a corretude desta fase:** há **um** `flux-agents.json` por
raiz de agents, e ele é compartilhado por todos os filhos. Se cada `equip` carimbasse a própria
entrada, N filhos escreveriam o mesmo arquivo em paralelo — última escrita vence, e o índice sai
descrevendo um subconjunto arbitrário do que acabou de acontecer.

Por isso, **despachado pelo `map`, o `equip` não escreve o índice**: ele devolve os fatos, e a main
reconcilia. Um único escritor por execução, que é a mesma disciplina do board-keeper do `flux:land`.

### Contrato de retorno de cada `equip` despachado

Invocação: `${FLUX_CMD}equip <slug> <flags da remediação> --from-map`.

O `--from-map` diz ao `equip` duas coisas: o consentimento já foi dado (não abrir gate) e **o carimbo
no índice é do chamador** (não escrever `flux-agents.json`). Fora isso ele roda normalmente, com o
contrato de destino inteiro valendo.

Retorno curto exigido, e nada além dele:

```
- repo: <slug>
- fez: <lista curta do que foi escrito, ou nada>
- paths: <caminhos criados, ou nenhum>
- l2: <path da suite | inalterado | n/a>
- l3_mirror: <path do espelho + sha256 da origem | inalterado | n/a>
- motor: <nome do comando criado | inalterado | n/a>
- recusado: <o que o contrato de destino barrou, ou nada>
- bloqueios: <lista curta, ou nenhum>
```

Proibido no retorno: conteúdo de arquivo, transcrição do que foi feito, diff. A main **não relê** o
que o filho escreveu para conferir; confia no retorno, e se precisar verificar, despacha outra
apuração.

### Reconciliação (a main, depois que os filhos voltam)

1. Juntar os retornos e **atualizar o índice de uma vez só**: as entradas dos repos equipados, os
   `synced_from_sha256` dos espelhos novos, e o recálculo de `collisions` — que muda com espelho novo
   e por isso **só pode ser computado depois de todos**, nunca por filho.
2. Escrever o `flux-agents.json`, uma vez, no destino já resolvido.
3. Reemitir a seção **Integridade** com o estado depois dos consertos: o que saiu da lista, o que
   continua, e o que foi recusado por gate de destino.

`FLUX_CMD` em `UNAVAILABLE` (Passo 1b do preflight) **desliga esta fase inteira**, e ela degrada para
o que o verbo já fazia: imprimir as invocações para o usuário rodar à mão. Nada de executar o
Bootstrap inline como consolo — vale aqui o precedente do `land` em
`${FLUX_ROOT}/shared/codex-compat.md`.

## Out of scope (NUNCA faça)

- **Não conserte nada com as próprias mãos.** Nem suite, nem manifesto, nem agent, nem espelho. O
  `map` diagnostica e **despacha**; quem escreve reparo é o `equip`, que é o dono dos gates. A
  distinção não é formalidade: despachar mantém cada escrita sob o contrato que a governa, enquanto
  reimplementar o reparo aqui duplicaria os gates em dois verbos e faria um comando de escopo máquina
  escrever em N repos por conta própria.
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
