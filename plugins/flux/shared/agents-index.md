# Índice de agents da máquina — o mapa que a família não tinha

> Fonte única do formato, do ciclo de vida e dos limites do `flux-agents.json`. Quem **constrói** o
> índice é o `${FLUX_ROOT}/skills/map/SKILL.md`; o `${FLUX_ROOT}/skills/equip/SKILL.md` atualiza a
> entrada do repo que acabou de equipar. Quem **lê** são o
> `${FLUX_ROOT}/shared/review-agents.md` (resolução das três lentes) e o
> `${FLUX_ROOT}/shared/flux-context.md` (descoberta de manifestos).

## O problema que ele resolve

A família é cega para a máquina em que roda. Toda invocação redescobre do zero onde as suites vivem,
quais agents cada repo declara e se algum nome colide com outro — por varredura de filesystem, na
main, todo run. Isso custa três coisas, e as três já foram medidas:

1. **Contexto.** Varrer N repos × M agents na main é exatamente o que o
   `${FLUX_ROOT}/shared/context-budget.md` proíbe nas outras frentes e tolerava aqui por falta de
   alternativa.
2. **Colisão invisível.** Só se descobre que um `name:` está declarado em oito repos depois de abrir
   os oito. Sem isso, a família oferece remediações que quebram calado.
3. **Staleness indetectável.** Um espelho de suite desatualizado é indistinguível de um espelho em
   dia, então o parecer sai com a lente errada e nada acusa.

## A regra que impede o índice de virar mentira

> **O índice é fonte da verdade sobre o que EXISTE e ONDE. A lista de agentes da sessão continua
> sendo a única fonte sobre o que é INVOCÁVEL.**

Um índice não registra agente nenhum. Quem registra `subagent_type` é o harness, a partir dos
diretórios que ele varre. Um JSON afirmando `backend-dev` disponível não faz `backend-dev` existir na
sessão.

Ler disponibilidade do índice reconstruiria o falso positivo que o gate de identidade do
`review-agents.md` (passo 1a-bis) existe para matar — e numa versão pior, porque agora há um arquivo
com cara de autoridade afirmando a cobertura, e o banner citaria uma lente que nunca rodou.

Por isso: **o índice diz o que OFERECER; o gate de registro decide o que RODOU.** Os dois passos
continuam existindo, nessa ordem, e nenhum substitui o outro.

**Corolário: o índice é cache, não verdade.** Toda leitura valida barato (ver "Frescor") e, se estiver
velho, ou refresca ou **declara `indice stale` no banner**. Um mapa que mente calado é pior que
máquina nenhuma mapeada.

## Onde ele mora

Um índice chamado `flux-agents.json`, **um por raiz de agents que o harness varre**. Quais são essas
raízes não é lista deste contrato: elas são **descobertas** — cada harness declara onde procura
agents, e é ali que o índice daquele harness nasce. Enumerá-las aqui congelaria a família em dois
produtos e deixaria os demais sem destino.

O destino concreto de cada gravação passa pela cascata de `${FLUX_ROOT}/shared/write-destination.md`,
como qualquer arquivo que nasce na máquina do usuário; o que este contrato fixa é o **nome** e a
**relação** (um índice por raiz), não o path.

Não um arquivo único de máquina num dotdir próprio. O motivo é o de sempre nesta família: um
`~/.flux/` nomearia um produto onde o contrato precisa ser neutro, enquanto a raiz de agents é
convenção do próprio harness e portanto descoberta sem configuração. Duplicar entre raízes é barato
porque o arquivo é inteiramente regenerável.

O `.json` é inerte para o harness: a varredura de agents é por `**.md`, então um índice na raiz não
vira agente candidato nem entra em contagem nenhuma.

## Formato

```json
{
  "schema": 1,
  "generated_at": "<ISO>",
  "generated_by": "flux@<versao>",
  "root": "<raiz de agents do harness>",

  "manifests": [
    { "path": "~/code/acme/.claude/flux-context.json",
      "name": "acme",
      "workspace_root": "~/code/acme",
      "repos": ["api-gateway", "payments", "web-monorepo"] }
  ],

  "present_here": [
    { "name": "acme-api-gateway-repo-owner", "file": "acme/api-gateway/repo-owner.md", "sha256": "<sha>" }
  ],

  "repos": {
    "api-gateway": {
      "checkout": "~/code/acme/api-gateway",
      "manifest": "acme",
      "l1": { "holistic": "flux:pr-reviewer", "source": "cascata generica" },
      "l2": {
        "state": "ausente",
        "expected_path": "~/agents/acme/api-gateway/repo-owner.md"
      },
      "l3": {
        "state": "presente",
        "dir": "~/code/acme/api-gateway/.claude/agents",
        "dir_sha256": "<sha do conjunto>",
        "agents": [
          { "name": "self-reviewer", "file": "self-reviewer.md", "sha256": "<sha>" }
        ],
        "name_collision": false,
        "mirror": {
          "path": "<raiz de agents>/acme/api-gateway-l3",
          "prefix": "api-gateway-",
          "synced_from_sha256": "<dir_sha256 da vez em que espelhou>"
        }
      }
    }
  },

  "collisions": [
    { "name": "self-reviewer",
      "claimed_by": ["api-gateway", "payments", "web-monorepo", "notifications"] }
  ]
}
```

### Por que é indexado por repo, e não um catálogo plano de nomes

Um catálogo plano de "agents conhecidos" é justamente o que **não** distingue um `self-reviewer` de
uma dúzia de repos diferentes. O nome sozinho não identifica nada nesta família — a identidade é o par
(nome, procedência), e o custo de errar é invocar o auditor do repo errado contra o diff certo.
Indexar por repo, com `sha256` por arquivo, é o que torna a procedência verificável.

### O que o índice NÃO guarda

- **`reachable_via` estático.** Um dos degraus da escada depende do `cwd` da sessão, que muda a cada
  invocação. Congelar a decisão no arquivo produziria uma recomendação errada sempre que a
  sessão subisse de outro lugar. O índice guarda **fatos** (`checkout`, `name_collision`, existência do
  espelho); a **decisão** é computada em runtime pela escada do
  `${FLUX_ROOT}/shared/review-agents.md`.
- **Estado de registro na sessão.** Pela regra acima. `present_here` descreve o que existe **em disco**
  naquela raiz. O nome do campo é deliberado: `registered` convidaria exatamente à inversão que a
  regra acima existe para impedir.

## Frescor

O índice é validado, não confiado. Na leitura, conferir:

1. `generated_by` compatível com a versão da família em execução (schema divergente → tratar como
   ausente, não adivinhar).
2. Para cada repo que o elo vai de fato usar — **e só para esses** —, comparar `dir_sha256` com o
   estado atual do diretório de agents daquele repo.
3. **Quando o índice for usado para resolver âncora** (`${FLUX_ROOT}/shared/flux-context.md`, passo 2),
   conferir que cada `path` de `manifests` ainda existe. Um manifesto removido ou renomeado passa
   incólume pelos dois testes acima e faz o elo resolver o **contexto errado** — a mesma classe de
   falha silenciosa que o passo 2-bis foi escrito para matar, entrando pela porta do cache.

Divergiu, ou o índice não existe:

- O elo **não aborta**. Segue com a varredura direta daquele repo, como fazia antes, e declara
  `indice stale` (ou `indice ausente`) nas degradações do banner, oferecendo `${FLUX_CMD}map`.
- Nunca refrescar o índice inteiro no meio de outro elo: escrever na máquina do usuário é ação com
  gate próprio (`${FLUX_ROOT}/shared/write-destination.md`), e um elo de review que reescreve
  configuração global de passagem é exatamente o efeito colateral que a família não pode ter.

**O índice é `soft` em todo elo que o consome, sem exceção.** Ele acelera e desambigua; não habilita
nada que a varredura direta não fizesse antes. Declarar `hard` num elo de review faria a família parar
de rodar numa máquina que nunca invocou o `equip`, que é o oposto do que este contrato existe para
fazer. O único `hard` legítimo é no próprio `equip`, que o escreve.

A validação é por repo-que-será-usado justamente para que o custo seja proporcional: um `flux:peek`
numa PR de um repo confere um `dir_sha256`, não vinte.

## Quem escreve

Dois verbos, com escopos que não se sobrepõem, e só sob invocação explícita:

| invocação | efeito no índice |
|---|---|
| `${FLUX_CMD}map` | escopo máquina: varre raízes, manifestos e repos; **constrói** o índice |
| `${FLUX_CMD}map --repo <slug>` | releva só aquela entrada, mantendo o resto |
| `${FLUX_CMD}equip <slug>` | atualiza **a entrada daquele repo** (L1/L2/L3, hashes) e recomputa `collisions` |
| `${FLUX_CMD}equip <slug> --expose-l3` | o acima, mais o bloco `mirror` com `synced_from_sha256` |
| `${FLUX_CMD}equip <slug> --from-map` | **nada** — devolve os fatos, e quem carimba é a main do `map` |

**Um escritor por execução.** Quando o `map` despacha vários `equip` em paralelo, os destinos deles são
disjuntos (`<raiz>/<ctx>/<slug>/`), mas o índice **não é**: há um por raiz de agents. N filhos
carimbando o mesmo arquivo é race no único recurso compartilhado do fan-out, e o resultado seria um
índice descrevendo um subconjunto arbitrário do que acabou de acontecer. Por isso `--from-map` desliga
a escrita no filho e a reconciliação acontece na main, de uma vez — inclusive o `collisions`, que muda
com espelho novo e **não pode** ser recomputado por filho, porque cada um só enxerga a própria parte.

**O `equip` nunca cria o índice do zero.** Ele carimba o que equipou num índice que já existe; não
havendo, relata e oferece o `${FLUX_CMD}map`. Um índice nascido de um repo só seria indistinguível de
um índice completo, e os elos que o consomem passariam a confiar num mapa com um repo.

**Nunca na instalação do plugin, nunca como efeito colateral de outro elo.** Um plugin que escreve
numa raiz de agents ao ser instalado passa por cima do contrato de destino e surpreende o usuário no
pior lugar possível, que é a configuração global dele.
