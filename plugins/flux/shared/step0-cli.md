# Step 0 mecânico via CLI — atalho determinístico do preflight

> Fonte única do atalho mecânico do Step 0. Um elo que importa este shared tenta resolver o
> pré-work por CLI **antes** de executar `preflight.md` e `flux-context.md` agenticamente. O
> contrato dos dois documentos continua normativo: este shared só muda **quem** executa a parte
> determinística, nunca o que ela significa.

## Passo 0 — ler o bloco da invocação

Se a mensagem que invocou o elo traz o bloco `--- PREFLIGHT RESOLVIDO (flux-cli ...) ---` (o
`flux <verbo>` o prepende ao comando), ele foi resolvido pela CLI **antes** da sessão, com o repo e o
harness já conhecidos. Guardar dele, como fatos: `perfil`, `manifesto`, `ancora`, `flux_root`,
`flux_root_source`, `exec_command`, `exec_fallback`, `lentes` (`l2_paths`, `l3_paths`), `avisos`,
`harness` e `harness_source`. Guardar também o slug da linha de invocação (`--repo <slug>`), que
a CLI acrescenta sempre que resolveu o repo.

Sem o bloco (execução direta, sem CLI), este passo não faz nada e o Passo único segue como antes.

## Passo único — tentar o CLI

```bash
flux preflight <VERBO> [ALVO] [--repo <slug>] --json 2>/dev/null
```

**Passar `--repo <slug>` sempre que a invocação o trouxer.** Sem ele o CLI não sabe de qual repo se
trata: ancora no cwd, pode tomar o próprio alvo (`87`) por slug, e devolve `exec_fallback: null`,
lentes vazias e `capability_level_hint: THIN`, uma resolução mais pobre que a do bloco.

**O bloco vence o JSON.** Com bloco, o `flux preflight` só complementa o que o bloco não traz
(`holistic`, `kit_roots`, `degradations[]`, `capability_level_hint`, `requirements`). Em campo que os
dois trazem, valem os valores do bloco, e uma divergência não é refeita por tool call. Isso inclui
`harness`: o bloco o declara, então `HARNESS` vem dele e não da tabela de `flux_root_source` abaixo.

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
- `HARNESS` e `FLUX_VERSION` (campos do banner e do bloco `provenance`) **não chegam prontos no
  JSON** e são derivados localmente (`HARNESS`: o `harness:` do bloco, se houver; senão): `HARNESS` é lido de `flux_root_source` pela tabela de
  `preflight.md §1a-harness` (`env:CLAUDE_PLUGIN_ROOT` → `claude-code`,
  `env:CURSOR_PLUGIN_ROOT` → `cursor`, `env:CODEX_PLUGIN_ROOT` → `codex`, qualquer outra fonte
  incluindo `env:FLUX_HOME` → `unknown`); `FLUX_VERSION` é lido do campo `version` de
  `${flux_root}/.claude-plugin/plugin.json` — a mesma regra do Passo 1a-harness do preflight.
- `gate_signal` **também não vem no JSON** de `flux preflight`: a CLI sorteia o caminho por execução (também com
  `--dry`; o diretório só é criado ao lançar o harness) e o entrega **somente** no bloco `--- PREFLIGHT RESOLVIDO ---` da mensagem que
  invocou o elo (como `run_id`, `run_stage` e `run_root`). A ausência dele no JSON não desliga nada. O
  que fazer com o campo está em `${FLUX_ROOT}/shared/hitl.md`, seção "Execução headless".
- `MODEL` e `EFFORT` também não vêm no JSON e o CLI não tem como obtê-los: são resolvidos pela
  sessão, pela regra de autorrelato do harness em `preflight.md §1a-harness` (sem afirmação
  explícita do harness sobre si mesmo, `unknown`).

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
