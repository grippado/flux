# Flux Run: contrato do registro local de execução

Fonte única do formato `flux-run/1`. Quem escreve é `${FLUX_ROOT}/scripts/run.sh`; a CLI e as skills só o chamam.

> **Local-first evidence. No telemetry. Publish only what you choose.** Um run nunca sai da máquina por conta própria: não há upload, nem endpoint, nem envio. Tudo o que está aqui é privado e local.

## O que é, e o que não é

Um **run** é uma unidade lógica de trabalho com identidade própria. Uma **session** é um processo de harness (`~/.flux/sessions/<id>.json`). `session != run`: um run pode atravessar várias stages, várias sessions, vários harnesses e vários modelos. O slice 1 cobre o caso mais simples (1 run, 1 stage de `review`, 1 session), mas o contrato não assume que seja o único.

Não é observability, nem event stream, nem banco. É identidade e evidência determinística para um trabalho que o Flux já executa: arquivos, frontmatter e git.

## Onde mora

```
~/.flux/runs/<run_id>/
├── run.md
├── 01-review.md
└── outcome.md
```

- Raiz padrão `~/.flux/runs`; `FLUX_RUNS_ROOT` ou `--root` a trocam. Fora de qualquer repo alvo (um `review` é read-only e não escreve dentro do repo revisado).
- Diretórios `0700`, arquivos `0600`.
- Layout plano. Não existem `stages/`, `artifacts/` nem `evals/` até haver necessidade real.
- `run_id`: `YYYYMMDDTHHMMSSZ_<slug>_<hex4>`, em UTC. O slug nunca depende do GitHub; o sufixo evita colisão.

## Quem escreve o quê

| O writer (`run.sh`) controla | O modelo informa |
|---|---|
| diretório, nomes de arquivo, `run_id`, `sequence`, `verb`, timestamps, `status`, `exit_code`, `session_id`, `writer`, versões, snapshot de capacidades, `gates`, `outputs`, `retry_of` | resumo da stage, conteúdo do review (que fica no artefato do vault), `model` e `effort` quando só o harness os sabe |

O modelo nunca edita arquivo de run: chama `run.sh`, que valida e grava de forma atômica.

**Dependências do `run.sh`.** Só `bash` (3.2 ou mais novo) e utilitários POSIX presentes em qualquer macOS ou Linux (`awk`, `sed`, `date`, `mktemp`, `od`, `tr`, `grep`, `stat`, `mv`), mais `iconv` para o resumo. Não exige `jq` nem `git`. Por isso nenhum `bin:` entra no `requires:` do `review`: o registro nunca é bloqueante, e a falta de uma ferramenta faz o `run.sh` sair com `2` e o review seguir sem registrar.

## Níveis de garantia

Cada stage declara `writer`. Nenhum nível promete mais do que mede.

| `writer` | Quem registrou | O que é garantido | O que não é |
|---|---|---|---|
| `cli` | A CLI abriu e fechou a stage em volta do harness (`flux review --record`, modo here) | Início, fim e `exit_code` medidos fora do modelo | Tudo o que o modelo informa depois (gates, outputs, `model`, `effort`, resumo): o `writer` rotula quem mediu o ciclo da stage, não a origem de cada campo |
| `script` | A skill, chamando `run.sh` | Metadado gerado por script, com schema validado | Que a skill tenha chamado o script: depende do modelo seguir o SKILL |
| `prose` | O modelo, escrevendo o arquivo | Nada além da intenção | Tudo |

O slice 1 só produz `cli`.

## Propagação

O run entra explicitamente no `PREFLIGHT RESOLVIDO` que a CLI monta (`run_id`, `run_stage`, `run_root`). Não há arquivo de "run corrente", nem estado global implícito, e nenhuma garantia depende de variável de ambiente atravessar o harness ou o ssh. `--record` cria o run; `run.sh --run <id>` só junta a um run existente.

## Ciclo de vida

- **Run:** `active`, `completed`, `failed`. `interrupted` e `abandoned` são derivados na leitura (run `active` cuja última stage continua `running` há mais tempo do que o leitor considera razoável), nunca gravados.
- **Stage:** `running`, `completed`, `failed`, `cancelled`. A primeira conclusão vale: `stage-end` numa stage já encerrada não altera nada.
- Depois do `end`, o run está fechado: `stage-start`, `gate`, `output`, `stage-set`, `stage-summary` e `stage-end` saem com `3`.
- `outcome.md` carrega `result` (`completed`, `failed` ou `cancelled`). `run.md` só distingue `completed` de `failed`: um run cujo resultado foi `cancelled` termina com `status: completed`.
- A CLI mapeia o exit code do harness: `0` completa, `130` e `143` cancelam, o resto falha. Um harness morto por sinal vira `128 + n` (a convenção do shell), nunca um `1` inventado. Se a própria CLI morrer antes do `finally` (ela não trata `SIGINT` nem `SIGTERM`), a stage fica `running`.
- Retry nunca sobrescreve: nova stage com `retry_of`.

## Schema `flux-run/1`

`run.md`:

```yaml
---
schema: flux-run/1
run_id: 20261001T204006Z_review-pr-184_ba64
status: active              # active | completed | failed
started_at: 2026-10-01T17:40:06-03:00
ended_at: null
flux_version: 1.43.0        # lida do plugin.json do próprio writer
cli_version: 1.30.0         # null sem CLI
---
```

`NN-<verbo>.md`:

```yaml
---
schema: flux-run/1
run_id: 20261001T204006Z_review-pr-184_ba64
sequence: 1
verb: review
retry_of: null
status: completed           # running | completed | failed | cancelled
started_at: 2026-10-01T17:40:07-03:00
finished_at: 2026-10-01T17:52:41-03:00
exit_code: 0                # null quando não observável
writer: cli
session_id: lq1x2y3z-9f8e7d6c
harness:
  value: claude-code        # claude-code | cursor | codex | unknown
  source: cli-launch        # cli-launch | default | plugin-root-env | unknown
model: unknown
effort: unknown
target: "github:pr/184"
capabilities:
  level_cli_hint: FULL-tentativo
  missing:
    - {name: vault, kind: soft}
  degradations:
    - "vault indisponivel — rodadas anteriores nao consultadas; artefato nao persistido"
gates:
  - kind: commit-push       # categoria de shared/hitl.md
    decision: approved      # approved | rejected | delegated | dismissed
    at: 2026-10-01T17:52:30-03:00
    via: askuser            # askuser | numbered-menu | proxy:--auto | proxy:--from-map
    option: "Aplicar correções em commits semânticos"
outputs:
  - kind: review
    ref: "vault:0-inbox/2026-10-01-1745-flux-PR184.md"
    head_sha: 9c1d2e3
---

## Resumo

(texto curto do modelo)
```

`outcome.md` consolida o que o writer mediu (`result`, contagem de stages por status, contagem de gates por decisão, `outputs` agregados com `stage`). Não duplica as stages.

Regras de campo:

- `harness.value` e `harness.source` são fatos da CLI, nunca inferência. `source: cli-launch` quando o harness foi escolhido (flag, `FLUX_HARNESS` ou manifesto) e lançado; `source: default` quando a CLI assumiu `claude` por falta de declaração (o valor é o que ela lançou, mas a escolha não foi do usuário); com `FLUX_CLAUDE_CMD` o que foi lançado é um comando arbitrário e o valor é `unknown`.
- `model` e `effort` só valem por autorrelato do harness (`shared/preflight.md`); senão ficam `unknown`. Nunca se inventa valor.
- `capabilities` é uma **projeção** do `PreflightResult` da CLI e nunca carrega path: o nível (`capability_level_hint`), só os requisitos que **faltaram** (nome e `kind: hard|soft`) e as degradações. O que estava presente não é listado: ausência de um nome significa que ele estava disponível.
- `gates` e `outputs` crescem por `append`; o writer recusa decisões, `via` e `kind` fora do vocabulário: gates `github-post`, `commit-push`, `issue-write`, `slack-write`, `pr-open`, `write-outside`, `write-manifest`, `ambiguous-target` (as categorias de `shared/hitl.md`); outputs `review`, `board`, `pr`, `issue`.
- `outputs[].ref` é referência, nunca conteúdo: `vault:<path relativo a VAULT_ROOT>`, `url:<url>` ou `git:<ref>`. Não se copia finding para o run.
- Gate: `requested` não se grava (existir o registro implica ter sido pedido); `not_applicable` é a ausência de registro.

## Privacidade

O writer recusa (exit `4`) path absoluto (`/…`, `~`, `file://`, `C:\`, UNC) em `target`, `capabilities`, `degradations`, `option`, `model`, `effort`, `ref` e `--slug`, `..` como componente de `ref`, e padrões de segredo (tokens do GitHub, chaves `sk-`, `AKIA…`, `Bearer …`, chave privada) em qualquer campo ou no resumo. O resumo é texto livre do modelo: o writer só barra caminhos conhecidos (`/Users/`, `/home/`, `~/`…) e segredos, então ele **não** é garantidamente limpo e só entra em `public-runs/` depois de revisão humana. O run **não tem campo** para: variáveis de ambiente, tokens, alvo de SSH, saída bruta de comando, transcript, hostname, `invocation` literal nem `session_sources`. A regra é: *store semantic evidence, not raw exhaust.*

Dados identificadores que ainda existem no run privado: `session_id`, `target` (`github:pr/N`), o slug do `run_id` e o resumo do modelo. Por isso o run privado não é publicável como está.

**Publicação** (`public-runs/`, sanitização por allowlist, revisão humana antes de publicar) é uma fronteira futura e explícita, fora do slice 1. Nada aqui publica nada.

## O que o slice 1 não cobre

`--new`, `--remote`, `flux run start|end|list`, `--run` como UX, `chain`, execução de skill sem CLI, `public-runs/`, evals, `level_session` no snapshot, tratamento de `SIGINT` na CLI, e verbos além de `review` (pipeline `pr`).
