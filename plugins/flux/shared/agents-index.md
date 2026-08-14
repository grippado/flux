# Índice de agents da máquina — o mapa que a família não tinha

> Fonte única do formato, do ciclo de vida e dos limites do `flux-agents.json`. Quem **escreve** o
> índice é o `${FLUX_ROOT}/skills/equip/SKILL.md`; quem **lê** são o
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

Um índice **por raiz de agents que o harness varre**, no mesmo formato de path que o manifesto de
contexto já usa:

```
~/.claude/agents/flux-agents.json
~/.cursor/agents/flux-agents.json
```

Não um arquivo único de máquina num dotdir próprio. O motivo é o de sempre nesta família: um
`~/.flux/` nomearia um produto onde o contrato precisa ser neutro, e a raiz de agents é uma convenção
que o **próprio harness** define, então é descoberta sem configuração. Duplicar entre raízes é barato
porque o arquivo é inteiramente regenerável.

O `.json` é inerte para o harness: a varredura de agents é por `**.md`, então um índice na raiz não
vira agente candidato nem entra em contagem nenhuma.

## Formato

```json
{
  "schema": 1,
  "generated_at": "<ISO>",
  "generated_by": "flux@<versao>",
  "root": "~/.claude/agents",

  "manifests": [
    { "path": "~/cangaco/.ai/contexts/personal/.claude/flux-context.json",
      "name": "pessoal",
      "workspace_root": "~/www/personal",
      "repos": ["violeet", "violeeter", "guia-cumuru"] }
  ],

  "registered_here": [
    { "name": "violeet-repo-owner", "file": "personal/violeet/repo-owner.md", "sha256": "<sha>" }
  ],

  "repos": {
    "guia-cumuru": {
      "checkout": "~/www/personal/guia-cumuru",
      "manifest": "pessoal",
      "l1": { "holistic": "flux:pr-reviewer", "source": "cascata generica" },
      "l2": {
        "state": "ausente",
        "expected_path": "~/cangaco/.ai/claude/agents/personal/guia-cumuru/repo-owner.md"
      },
      "l3": {
        "state": "presente",
        "dir": "~/www/personal/guia-cumuru/.claude/agents",
        "dir_sha256": "<sha do conjunto>",
        "agents": [
          { "name": "backend-dev", "file": "backend-dev.md", "sha256": "<sha>" }
        ],
        "name_collision": false,
        "mirror": {
          "path": "~/.claude/agents/personal/guia-cumuru-l3",
          "prefix": "guia-cumuru-",
          "synced_from_sha256": "<dir_sha256 da vez em que espelhou>"
        }
      }
    }
  },

  "collisions": [
    { "name": "self-reviewer",
      "claimed_by": ["backoffice", "backoffice-bff", "communication-api", "e2e-tests"] }
  ]
}
```

### Por que é indexado por repo, e não um catálogo plano de nomes

Um catálogo plano de "agents conhecidos" é justamente o que **não** distingue os oito `self-reviewer`
de repos diferentes. O nome sozinho não identifica nada nesta família — a identidade é o par
(nome, procedência), e o custo de errar é invocar o auditor do repo errado contra o diff certo.
Indexar por repo, com `sha256` por arquivo, é o que torna a procedência verificável.

### O que o índice NÃO guarda

- **`reachable_via` estático.** Um dos degraus da escada (`--add-dir`) depende do `cwd` da sessão, que
  muda a cada invocação. Congelar a decisão no arquivo produziria uma recomendação errada sempre que a
  sessão subisse de outro lugar. O índice guarda **fatos** (`checkout`, `name_collision`, existência do
  espelho); a **decisão** é computada em runtime pela escada do
  `${FLUX_ROOT}/shared/review-agents.md`.
- **Estado de registro na sessão.** Pela regra acima. `registered_here` descreve o que existe **em
  disco** naquela raiz, não o que a sessão carregou.

## Frescor

O índice é validado, não confiado. Na leitura, conferir:

1. `generated_by` compatível com a versão da família em execução (schema divergente → tratar como
   ausente, não adivinhar).
2. Para cada repo que o elo vai de fato usar — **e só para esses** —, comparar `dir_sha256` com o
   estado atual do diretório de agents daquele repo.

Divergiu, ou o índice não existe:

- O elo **não aborta**. Segue com a varredura direta daquele repo, como fazia antes, e declara
  `indice stale` (ou `indice ausente`) nas degradações do banner, oferecendo `${FLUX_CMD}equip --index`.
- Nunca refrescar o índice inteiro no meio de outro elo: escrever na máquina do usuário é ação com
  gate próprio (`${FLUX_ROOT}/shared/write-destination.md`), e um elo de review que reescreve
  configuração global de passagem é exatamente o efeito colateral que a família não pode ter.

A validação é por repo-que-será-usado justamente para que o custo seja proporcional: um `flux:peek`
numa PR de um repo confere um `dir_sha256`, não vinte.

## Quem escreve

Só o `${FLUX_CMD}equip`, e só sob invocação explícita:

| invocação | efeito no índice |
|---|---|
| `${FLUX_CMD}equip --index` | escopo máquina: varre raízes, manifestos e repos; grava o índice inteiro |
| `${FLUX_CMD}equip <repo>` | atualiza **a entrada daquele repo** (L1/L2/L3, hashes) e recomputa `collisions` |
| `${FLUX_CMD}equip <repo> --expose-l3` | o acima, mais o bloco `mirror` com `synced_from_sha256` |

**Nunca na instalação do plugin, nunca como efeito colateral de outro elo.** Um plugin que escreve em
`~/.claude/agents/` ao ser instalado passa por cima do contrato de destino e surpreende o usuário no
pior lugar possível, que é a configuração global dele.
