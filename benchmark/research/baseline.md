Tenho os dados completos. Aqui está o resultado:

---

## Baseline de custo: fase mecânica de skills de review

### Arquivos analisados

| # | Arquivo JSONL | Skill | Data |
|---|---|---|---|
| S1 | `.claude-personal/projects/-Users-gabriel-gripp/6799e6b4...jsonl` | `flux:review` | 2026-08-21 |
| S2 | `.claude/projects/...-gravity-design-system/dae76bf4...jsonl` | `flux:review` | 2026-08-18 |
| S3 | `.claude/projects/...-gravity-design-system/455d70af...jsonl` | `flux:peek` | 2026-08-20 |

---

### Tabela principal (tokens não-cacheados, conforme solicitado)

| Sessão | Skill | Tool calls mecânicos | Tokens mec. in | Tokens mec. out | Tokens mec. total | Tokens sessão total | % mecânico |
|---|---|---|---|---|---|---|---|
| S1 | `flux:review` | 9 (Skill×1, Bash×7, Agent×1) | 32 | 12.746 | **12.778** | 123.270 | **10,4%** |
| S2 | `flux:review` | 20 (Bash×19, Agent×1) | 64 | 40.156 | **40.220** | 172.591 | **23,3%** |
| S3 | `flux:peek` | 7 (Skill×1, Bash×5, Agent×1) | 22 | 4.766 | **4.788** | 14.782 | **32,4%** |

> Fase mecânica = da invocação da skill até (inclusive) o primeiro `Agent`/`SendMessage` dispatch.

---

### Incluindo tokens cacheados (visão completa de custo real)

| Sessão | Skill | Mec. total (incl. cache) | Sessão total (incl. cache) | % mecânico |
|---|---|---|---|---|
| S1 | `flux:review` | 3.046.390 | 55.113.514 | **5,5%** |
| S2 | `flux:review` | 4.394.757 | 17.693.570 | **24,8%** |
| S3 | `flux:peek` | 1.315.490 | 4.054.569 | **32,4%** |

---

### Breakdown das Bash calls mecânicas por categoria

**S1 — flux:review (7 Bash calls):**
- Localização de contexto: `pwd`, localiza git root (2 calls)
- Descoberta de specialists: `ls agents/personal/flux/` (1 call)
- Dados da PR: `gh pr view`, `gh pr diff` (2 calls)
- Identidade do usuário + checagem de vault: `gh api user` + `ls ~/.notes/` (1 call)
- Leitura de contexto repo: `ls AGENTS.md/CLAUDE.md` (1 call)

**S2 — flux:review (19 Bash calls — versão 1.23.1, leu docs do skill diretamente):**
- Plugin discovery + manifesto: 2 calls
- Leitura de docs do skill (preflight, review-agents, legend, artifact template): 6 calls
- Descoberta de specialists L2/L3: 2 calls
- Dados da PR: `gh pr view`, `gh pr diff`, commits, 2x GraphQL (review threads): 6 calls
- Identidade + checkout: 1 call
- Leitura do diff (split em 2 arquivos): 2 calls

**S3 — flux:peek (5 Bash calls):**
- Plugin discovery + manifesto: 1 call
- Leitura preflight: 2 calls (cat + sed)
- Checagem de reviewer override + diff stat: 1 call
- Dump do diff para scratchpad: 1 call

---

### Observações

1. **Variação grande (10% a 32%)**: S1 é menor % porque a sessão incluiu muito trabalho antes da skill (contexto longo); S3 é a maior % porque a sessão foi quase dedicada ao peek.
2. **Fator dominante no output mecânico**: são os `output_tokens` (12k, 40k, 4.7k), não os input. O modelo gera bastante texto durante a fase de resolução de contexto da skill — especialmente lendo docs e raciocinando sobre specialists.
3. **S2 tem 2.7x mais Bash calls** que S1 para a mesma skill: a versão 1.23.1 lia docs do skill via `cat`/`sed` inline; a versão mais recente delega mais via cache.
4. **Baseline conservador**: 7 a 20 Bash calls mecânicos, ~5k a 40k tokens de output antes do primeiro subagente ser despachado.