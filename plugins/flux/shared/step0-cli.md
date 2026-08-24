# Step 0 mecânico via CLI — atalho determinístico do preflight

> Fonte única do atalho mecânico do Step 0. Um elo que importa este shared tenta resolver o
> pré-work por CLI **antes** de executar `preflight.md` e `flux-context.md` agenticamente. O
> contrato dos dois documentos continua normativo: este shared só muda **quem** executa a parte
> determinística, nunca o que ela significa.

## Passo único — tentar o CLI

```bash
flux preflight <VERBO> [ALVO] --json 2>/dev/null
```

Três resultados possíveis, e só três:

**1. JSON com `status: "abort"`** — exibir `abort_message` no chat e encerrar sem efeito
colateral. Não prosseguir para nenhum step. É a mesma abortagem do Passo 2 do preflight, com a
mensagem já montada.

**2. JSON com `status: "ok"` ou `"degraded"`** — o Step 0-preflight e o Step 0-context estão
**materialmente resolvidos** pelos campos do JSON. Usar direto, sem refazer por tool call:

- `flux_root`, `manifest_path`, `anchor`, `profile`, `exec_command`, `exec_fallback` → fatos.
- `lenses.l2_paths` / `lenses.l3_paths` → caminhos descobertos em disco (a verificação de
  registro na sessão continua sendo do 1a-bis de `review-agents.md`).
- `kit_roots` → resultado do Passo 1d, já com a guarda de origem aplicada.
- `holistic.candidate` + `holistic.source` → candidato resolvido em disco; a **verificação** é
  introspecção e continua obrigatória (Passo 3).
- `degradations[]` → entram verbatim na linha `degradacoes:` do banner (Passo 5), somadas às
  degradações que só a sessão enxerga.
- `capability_level_hint` → provisório; o nível definitivo sai da revalidação abaixo.

Revalidar **apenas** o que `session_revalidation_required` lista — tipicamente 4 itens, todos
introspecção de sessão que nenhum processo externo pode fazer (preflight.md, 3-bis):

1. `flux_cmd` — qual forma a sessão expõe (`/flux:` → `/flux-` → `/`), senão `UNAVAILABLE`.
2. `adddir_cmd` — se a sessão expõe `/add-dir` ou equivalente, senão `UNAVAILABLE`.
3. `holistic_verification` — o candidato está registrado na sessão? Não → seguir a cascata do
   Passo 3 com as formas de `holistic.generic_forms`; nenhuma → abortar como o Passo 3 manda.
4. `capability_level` — classificar FULL/REDUCED/THIN definitivo com os agents confirmados.

**3. CLI ausente (exit 127) ou saída que não parseia como JSON** — fallback integral: executar
`${FLUX_ROOT}/shared/preflight.md` e o Step 0-context como sempre. Nada muda, nenhum elo quebra
numa máquina sem o binário.

## Coleta de PR (elos que leem PR: review, peek, iterate)

Quando o Step 0 resolveu via CLI e o alvo é uma PR, a coleta mecânica também sai por uma chamada:

```bash
flux gather pr <N|URL> [--repo owner/repo] [--threads] --json 2>/dev/null
```

- `--threads` só nos elos que consomem threads (review, iterate); o peek não paga esse custo.
- O diff chega em `diff_path` (arquivo) e só vem inline (`diff`) até 32KB. **Ler o arquivo é
  decisão de quem analisa**: diff grande não entra inteiro no contexto por acidente.
- `is_own_pr`, `ticket`, `author`, contagens de threads/comments → fatos, sem re-coleta.
- `status: "degraded"` → as `degradations[]` nomeiam o que faltou; declarar no banner e seguir a
  regra do elo para aquela perda (ex.: threads indisponíveis no iterate é hard na prática).
- Falha do CLI (exit 127 / não-JSON) → fallback para a sequência `gh` que o pipeline do elo já
  descreve.

## O que este shared NÃO muda

- Nenhum julgamento migra para o CLI: triagem de thread, escolha de specialist, classificação de
  diff, redação — tudo continua no elo (fronteira em `${FLUX_ROOT}/shared/review-agents.md` e nos
  pipelines).
- O banner do Passo 5 continua obrigatório e com o gabarito verbatim — o JSON alimenta os campos,
  não substitui o banner.
- A disciplina de introspecção do 3-bis continua: main resolve uma vez, desce como fato aos
  subagentes.
