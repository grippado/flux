Estou em plan mode — o artifact está pronto mas aguardando saída do mode para publicar. O arquivo fonte já está em:

`/private/tmp/claude-503/-Users-gabriel-gripp/e48c241e-3323-4c7e-9978-49933f87dc9e/scratchpad/benchmark-protocol.html`

Abaixo está o protocolo completo, que o artifact vai renderizar com sidebar de navegação, blocos de código com header, tabelas com `tabular-nums` e sistema de tokens claro/escuro.

---

## Protocolo de Benchmark A/B — flux-cli Step 0

### Hipóteses

**H₀ (nula):** mover o Step 0 para um CLI Bun não reduz custo ou latência de forma relevante (Δ custo < 10%, Δ latência < 10%).

**H₁ (alternativa):** o Step 0 CLI elimina pelo menos **15% do custo USD** e **20% dos tool calls mecânicos** em relação ao braço A (skill pura), em pelo menos dois dos três fluxos testados.

---

### 01 — Unidades de medida

**Métrica primária:** `total_cost_usd` reportado pelo braço headless (`--output-format stream-json`). Pondera automaticamente o preço diferenciado entre input, cache_read, cache_creation e output. É a única métrica que captura o custo end-to-end sem fórmula manual.

**Métricas secundárias:**

| Métrica | Fonte | Por que medir |
|---|---|---|
| `output_tokens` | `usage.output_tokens` | Proxy de latência — o modelo é mais lento quando gera mais tokens de raciocínio |
| tool_calls mecânicos | Contagem de `Bash` + `Read` antes do primeiro `SendMessage` | Volume de round-trips eliminados pelo CLI |
| `wall_time_ms` | `duration_api_ms` no stream-json | Latência percebida; cada Bash call acrescenta 200–800 ms |
| `cache_read_input_tokens` | `usage.cache_read_input_tokens` | Isola quanto do "input" é cache (~10× mais barato) |
| tokens de contrato | Primeira entrada `assistant` — soma `cache_creation` + `cache_read` | Deve ser igual em A e B; diferença sinaliza contaminação |
| `thinking_tokens` | `usage.output_tokens_details.thinking_tokens` | Reportar separadamente: caro e invisível no output |

**Armadilha crítica:** um mesmo `requestId` aparece 2–3× no JSONL por streaming. Nunca some linhas diretamente. Agrupar por `requestId` e contar cada ID apenas uma vez. Em sessões reais, somar sem deduplicar triplica os totais.

---

### 02 — Cenários e alvos fixos

Cada cenário é um tripla **(skill, repo, PR SHA)** congelada antes de qualquer run.

| ID | Skill | Repo | Critério | Prioridade |
|---|---|---|---|---|
| C1 | `flux:review` | `gravity-design-system` | PR mergeada, diff 200–400L, ≥ 2 arquivos TS | Alta |
| C2 | `flux:review` | `arco-ai-plugins` ou `backoffice` | PR mergeada, diff 400–800L | Alta |
| C3 | `flux:peek` | `gravity-design-system` | PR mergeada, diff < 150L | Alta |
| C4 | `sdd:plan` | qualquer repo com RFC | Arquivo de texto congelado por SHA | Média |

**Como congelar:**
```bash
TARGET_SHA=$(gh pr view $PR_NUMBER --json mergeCommit -q .mergeCommit.oid)
gh pr diff $PR_NUMBER > "benchmark/fixtures/C1_diff.patch"
sha256sum "benchmark/fixtures/C1_diff.patch"  # verificar antes de cada série
```

---

### 03 — Braços A / B

| Braço | Step 0 | Descrição |
|---|---|---|
| **A** | Modelo (Bash, Read, gh) | Skill pura atual — o modelo resolve contexto via tool calls agenticos antes de despachar |
| **B** | CLI Bun (zero tokens) | `flux-cli context` gera JSON com diff, reviewers, git root, CLAUDE.md; JSON é injetado no prompt antes do dispatch |

**Script principal:**
```bash
MODEL="claude-sonnet-4-5"
N=8  # 4 cold + 4 warm por braço

run_once() {
  local arm="$1" prompt="$2" n="$3"
  printf '%s' "$prompt" | claude -p \
    --output-format stream-json \
    --no-session-persistence \
    --bare \
    --model "$MODEL" \
    --mcp-config /dev/null \
    2>&1 \
  | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        o = json.loads(line)
        if o.get('type') == 'result': print(json.dumps(o))
    except: pass
" \
  | jq --arg arm "$arm" --argjson n "$n" \
    '{arm:$arm,run:$n,cost_usd:.total_cost_usd,
      output_tokens:.usage.output_tokens,
      cache_read:.usage.cache_read_input_tokens,
      duration_ms:.duration_api_ms}'
}

# Aquecimento (descartado — popula cache)
printf '%s' "$PROMPT_A" | claude -p --output-format stream-json \
  --no-session-persistence --bare --model "$MODEL" --mcp-config /dev/null > /dev/null

# Intercalar A e B para distribuir drift temporal
for i in $(seq 1 $N); do
  run_once "A" "$PROMPT_A" "$i"
  run_once "B" "$PROMPT_B" "$i"
  sleep 3
done
```

**Protocolo de N runs e variância:**
- **N = 8 por braço** — suficiente para IC 95% via bootstrap sem assumir normalidade.
- **Run de aquecimento descartada** — sem ela, a run 1 do braço A teria `cache_creation_input_tokens` incomparável com as demais.
- **Intercalar A e B** — nunca rodar todos os A antes de todos os B. Distribui drift temporal igualmente.
- **TTL do cache** — cada série de 8 runs em menos de 5 min. Verificar `cache_creation.ephemeral_5m_input_tokens`: se > 0 inesperado, descartar a run.
- **Separar cold vs warm** — runs 1–2 de cada braço tendem a ser cold. Reportar grupos separados; usar somente as warm na comparação principal.

**Variante B' (anti-viés):** testar B' sem a instrução "não faça tool calls de descoberta". Se B e B' diferirem em < 5% de tool calls, o efeito é estrutural. Se diferirem em > 20%, reportar como limitação.

---

### 04 — Parser de transcript (pseudo-spec)

```python
import json
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

DISPATCH_MARKERS = {"SendMessage", "Task"}

@dataclass
class Phase:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read: int = 0
    cache_creation: int = 0
    tool_calls: dict = field(default_factory=lambda: defaultdict(int))

    @property
    def total(self):
        return self.input_tokens + self.output_tokens + self.cache_read + self.cache_creation

def parse(jsonl_path: str) -> dict:
    lines = [json.loads(l) for l in Path(jsonl_path).read_text().splitlines() if l.strip()]
    seen = set()
    session, mech = Phase(), Phase()
    dispatch_found = False

    for obj in lines:
        if obj.get("type") != "assistant": continue
        rid = obj.get("requestId")
        u   = obj.get("message", {}).get("usage", {})

        if rid and rid not in seen:
            seen.add(rid)
            it, ot, cr, cc = (
                u.get("input_tokens", 0), u.get("output_tokens", 0),
                u.get("cache_read_input_tokens", 0),
                u.get("cache_creation_input_tokens", 0))
            session.input_tokens  += it;  session.output_tokens  += ot
            session.cache_read    += cr;  session.cache_creation += cc
            if not dispatch_found:
                mech.input_tokens += it;  mech.output_tokens  += ot
                mech.cache_read   += cr;  mech.cache_creation += cc

        for item in obj.get("message", {}).get("content", []):
            if not isinstance(item, dict) or item.get("type") != "tool_use": continue
            name = item.get("name", "")
            session.tool_calls[name] += 1
            if not dispatch_found:
                if name in DISPATCH_MARKERS: dispatch_found = True
                else: mech.tool_calls[name] += 1

    pct = round(mech.total / session.total * 100, 1) if session.total else 0
    return {"session": vars(session), "mechanical": vars(mech),
            "mechanical_pct": pct, "dispatch_found": dispatch_found}
```

**Localização dos JSONLs:** `~/.claude-personal/projects/<proj-slug>/<session-id>.jsonl` e `~/.claude/projects/<proj-slug>/<session-id>.jsonl`

**Atenção:** com `--no-session-persistence`, o JSONL não persiste após o processo terminar. Para análise de fase, rodar sem essa flag. Usar stream-json apenas para os totais de custo das runs de produção.

---

### 05 — Ameaças à validade

| Ameaça | Mitigação |
|---|---|
| Cache ephemeral TTL | Executar cada bloco de 8 runs em < 5 min; verificar `ephemeral_5m_input_tokens`; descartar runs onde recriar o cache |
| Drift de modelo/binário | Registrar `claude --version` início e fim; todas as 16 runs em uma sessão sem atualizações intermediárias |
| CLAUDE.md variável | `--bare` + `--system-prompt-file benchmark/minimal.md` fixo em todas as runs |
| MCP servers ativos | `--mcp-config /dev/null` em todas as runs |
| Viés de autor no Prompt B | Testar variante B'; delta > 20% = reportar como limitação |
| Variabilidade do modelo | N = 8 + IC 95% bootstrap; usar mediana não média; `--temperature 0` se disponível |
| Harness externo | Nomear explicitamente: benchmark mede exclusivamente `claude -p` |
| Tamanho do diff domina | Estratificar por faixa (C1: 200–400L, C2: 400–800L, C3: < 150L); reportar Δ% por estrato |
| Amostra de conveniência | Nomear na RFC: "3 PRs de conveniência; generalização requer benchmarks adicionais" |

---

### 06 — Formato dos resultados para a RFC

**Tabela por cenário:**

| Cenário | Skill | Braço | Custo $ (med.) | Output tok (med.) | Tool calls mec. | Wall time (ms) | IC 95% custo |
|---|---|---|---:|---:|---:|---:|---:|
| C1 gravity ~300L | `flux:review` | A | $0.0XX | XX,XXX | 14 | X,XXX | [X – X] |
| C1 gravity ~300L | `flux:review` | B | $0.0XX | XX,XXX | 0 | X,XXX | [X – X] |
| **C1 Δ%** | | | **—X%** | **—X%** | **—100%** | **—X%** | ± X% |
| C2 plugins ~600L | `flux:review` | A | $0.0XX | XX,XXX | 19 | X,XXX | [X – X] |
| C2 plugins ~600L | `flux:review` | B | $0.0XX | XX,XXX | 0 | X,XXX | [X – X] |
| **C2 Δ%** | | | **—X%** | **—X%** | **—100%** | **—X%** | ± X% |
| C3 gravity <150L | `flux:peek` | A | $0.0XX | X,XXX | 7 | X,XXX | [X – X] |
| C3 gravity <150L | `flux:peek` | B | $0.0XX | X,XXX | 0 | X,XXX | [X – X] |
| **C3 Δ%** | | | **—X%** | **—X%** | **—100%** | **—X%** | ± X% |

**Critério de adoção (todos obrigatórios):**
- Δ custo USD ≥ 15%
- Δ tool calls mecânicos ≥ 20%
- ≥ 2 de 3 cenários positivos
- IC 95% custo não cruza zero

**IC 95% via bootstrap de mediana:**
```python
def bootstrap_delta(a_vals, b_vals, n_boot=10_000, ci=0.95):
    deltas = []
    for _ in range(n_boot):
        a = sorted(random.choices(a_vals, k=len(a_vals)))
        b = sorted(random.choices(b_vals, k=len(b_vals)))
        a_med, b_med = a[len(a)//2], b[len(b)//2]
        if a_med > 0: deltas.append((b_med - a_med) / a_med * 100)
    deltas.sort()
    lo, hi = int((1-ci)/2*n_boot), int((1+ci)/2*n_boot)
    return deltas[lo], deltas[hi]
```

**Aviso para a RFC:** "tool calls mecânicos = 0 no braço B é garantido por design, não por medição. O custo computacional do CLI Bun — latência de `gh` calls, manutenção do CLI — precisa ser somado ao custo total do braço B na narrativa."

---

**Checklist antes de publicar os números:**
- Mesmo `--model` em todas as runs
- Versão do binário registrada e idêntica em A e B
- Runs cold identificadas e excluídas
- Diff fixture verificado por SHA256
- IC 95% calculado e não cruza zero
- Variante B' testada e delta documentado
- Custo do CLI Bun mencionado como offset