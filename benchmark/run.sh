#!/usr/bin/env bash
set -euo pipefail

# Benchmark A/B do Step 0 mecânico (flux-cli) vs agentico.
# Braços com prompt IDÊNTICO; o que muda é o ambiente:
#   A = `flux` indisponível (stub exit 127) → skill segue o caminho agentico
#   B = `flux` real no PATH → skill usa o atalho de step0-cli.md
#
# Uso: ./run.sh <scenarios.json> [N] [modelo]
#   scenarios.json: [{"id":"C1","dir":"/abs/checkout","prompt":"/flux:review 1053 --solo ..."}]

SCENARIOS_FILE="${1:?informe o scenarios.json}"
N="${2:-8}"
MODEL="${3:-claude-sonnet-5}"

BENCH_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$BENCH_DIR/results/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RESULTS_DIR"

STUB_DIR="$(mktemp -d)"
cat > "$STUB_DIR/flux" <<'STUB'
#!/bin/sh
exit 127
STUB
chmod +x "$STUB_DIR/flux"

FLUX_BIN="$(command -v flux || true)"
if [ -z "$FLUX_BIN" ]; then
  echo "erro: binário flux não está no PATH — o braço B precisa dele" >&2
  exit 1
fi

claude --version | tee "$RESULTS_DIR/claude-version.txt"
"$FLUX_BIN" preflight peek --json 2>/dev/null | python3 -c "import json,sys; print('flux schema', json.load(sys.stdin)['schema_version'])" | tee "$RESULTS_DIR/flux-version.txt"

run_once() {
  local scenario_id="$1" arm="$2" run_n="$3" dir="$4" prompt="$5" kind="$6"
  local path_prefix
  if [ "$arm" = "A" ]; then path_prefix="$STUB_DIR"; else path_prefix="$(dirname "$FLUX_BIN")"; fi

  local out_file="$RESULTS_DIR/${scenario_id}_${arm}_${run_n}.json"
  local started ended
  started=$(python3 -c 'import time; print(time.time())')

  (cd "$dir" && env PATH="$path_prefix:$PATH" \
    claude -p "$prompt" \
      --output-format json \
      --model "$MODEL" \
      --dangerously-skip-permissions \
      --strict-mcp-config \
      > "$out_file" 2> "$out_file.err") || true

  ended=$(python3 -c 'import time; print(time.time())')

  python3 - "$out_file" "$scenario_id" "$arm" "$run_n" "$kind" "$started" "$ended" <<'PYEOF' >> "$RESULTS_DIR/results.jsonl"
import json, sys
out_file, scenario, arm, run_n, kind, started, ended = sys.argv[1:8]
row = {"scenario": scenario, "arm": arm, "run": int(run_n), "kind": kind,
       "wall_s": round(float(ended) - float(started), 1)}
try:
    d = json.load(open(out_file))
    if isinstance(d, list):
        results = [e for e in d if isinstance(e, dict) and e.get("type") == "result"]
        d = results[-1] if results else {}
    u = d.get("usage", {})
    row.update({
        "cost_usd": d.get("total_cost_usd"),
        "duration_api_ms": d.get("duration_api_ms"),
        "num_turns": d.get("num_turns"),
        "session_id": d.get("session_id"),
        "input_tokens": u.get("input_tokens"),
        "output_tokens": u.get("output_tokens"),
        "cache_read": u.get("cache_read_input_tokens"),
        "cache_creation": u.get("cache_creation_input_tokens"),
        "is_error": d.get("is_error", False),
    })
except Exception as e:
    row["parse_error"] = str(e)
print(json.dumps(row, ensure_ascii=False))
PYEOF
}

python3 -c "import json;[print(s['id'],s['dir'],s['prompt'],sep='\t') for s in json.load(open('$SCENARIOS_FILE'))]" |
while IFS=$'\t' read -r sid sdir sprompt; do
  echo "== cenário $sid =="

  if [ "${FLUX_BENCH_NO_WARMUP:-0}" != "1" ]; then
    echo "-- aquecimento (descartado)"
    run_once "$sid" "A" 0 "$sdir" "$sprompt" "warmup"
    run_once "$sid" "B" 0 "$sdir" "$sprompt" "warmup"
  fi

  for i in $(seq 1 "$N"); do
    echo "-- run $i/$N (A e B intercalados)"
    run_once "$sid" "A" "$i" "$sdir" "$sprompt" "measured"
    run_once "$sid" "B" "$i" "$sdir" "$sprompt" "measured"
    sleep 3
  done
done

rm -rf "$STUB_DIR"
echo "resultados em $RESULTS_DIR/results.jsonl"
echo "próximo passo: python3 $BENCH_DIR/parse_phase.py $RESULTS_DIR && python3 $BENCH_DIR/analyze.py $RESULTS_DIR"
