#!/usr/bin/env python3
"""Consolida results.jsonl (+ phases.jsonl quando existir) na tabela final da RFC.

Mediana por braço, Δ% B vs A e IC 95% do Δ da mediana via bootstrap.
Runs de aquecimento (kind != "measured") e runs com erro ficam de fora.

Uso: analyze.py <results_dir> [--boot 10000]
"""

import json
import random
import sys
from pathlib import Path

METRICS = [
    ("cost_usd", "custo USD"),
    ("output_tokens", "output tokens"),
    ("duration_api_ms", "api ms"),
    ("wall_s", "wall s"),
]
PHASE_METRICS = [
    ("mechanical_tool_calls", "tool calls mec."),
    ("mechanical_pct_uncached", "% mec. (não-cache)"),
]


def median(xs: list[float]) -> float:
    s = sorted(xs)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2


def bootstrap_delta(a: list[float], b: list[float], n_boot: int) -> tuple[float, float]:
    deltas = []
    for _ in range(n_boot):
        am = median(random.choices(a, k=len(a)))
        bm = median(random.choices(b, k=len(b)))
        if am:
            deltas.append((bm - am) / am * 100)
    deltas.sort()
    lo = deltas[int(0.025 * len(deltas))]
    hi = deltas[int(0.975 * len(deltas))]
    return lo, hi


def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()]


def main() -> None:
    results_dir = Path(sys.argv[1])
    n_boot = int(sys.argv[sys.argv.index("--boot") + 1]) if "--boot" in sys.argv else 10_000

    rows = load_jsonl(results_dir / "results.jsonl")
    phases = load_jsonl(results_dir / "phases.jsonl")
    phase_by_key = {(p.get("scenario"), p.get("arm"), p.get("run")): p for p in phases}

    measured = [r for r in rows if r.get("kind") == "measured" and not r.get("is_error") and r.get("cost_usd") is not None]
    for r in measured:
        p = phase_by_key.get((r["scenario"], r["arm"], r["run"]))
        if p and "error" not in p:
            for key, _ in PHASE_METRICS:
                r[key] = p.get(key)

    scenarios = sorted({r["scenario"] for r in measured})
    all_metrics = METRICS + PHASE_METRICS

    lines = ["| Cenário | Métrica | A (mediana) | B (mediana) | Δ% | IC 95% Δ | n |",
             "|---|---|---:|---:|---:|---|---:|"]

    for sc in scenarios:
        arm_a = [r for r in measured if r["scenario"] == sc and r["arm"] == "A"]
        arm_b = [r for r in measured if r["scenario"] == sc and r["arm"] == "B"]
        for key, label in all_metrics:
            a_vals = [r[key] for r in arm_a if r.get(key) is not None]
            b_vals = [r[key] for r in arm_b if r.get(key) is not None]
            if not a_vals or not b_vals:
                continue
            ma, mb = median(a_vals), median(b_vals)
            delta = (mb - ma) / ma * 100 if ma else 0.0
            lo, hi = bootstrap_delta(a_vals, b_vals, n_boot)
            crosses = " ⚠️ cruza zero" if lo <= 0 <= hi and key != "mechanical_pct_uncached" else ""
            lines.append(
                f"| {sc} | {label} | {ma:,.4g} | {mb:,.4g} | {delta:+.1f}% | [{lo:+.1f}%, {hi:+.1f}%]{crosses} | {len(a_vals)}+{len(b_vals)} |"
            )
        lines.append("| | | | | | | |")

    report = "\n".join(lines)
    out = results_dir / "report.md"
    out.write_text(report + "\n")
    print(report)
    print(f"\nrelatório gravado em {out}")

    excluded = [r for r in rows if r.get("kind") == "measured" and (r.get("is_error") or r.get("cost_usd") is None)]
    if excluded:
        print(f"\natenção: {len(excluded)} run(s) medida(s) excluída(s) por erro — ver results.jsonl")


if __name__ == "__main__":
    main()
