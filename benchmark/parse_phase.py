#!/usr/bin/env python3
"""Segmenta a fase mecânica de cada run do benchmark a partir do transcript JSONL.

Fase mecânica = da primeira entrada assistant até (exclusive) o primeiro dispatch
de subagente (Task/Agent). Deduplica usage por requestId — a mesma requisição
aparece 2-3x no JSONL por streaming e somar linhas cruas triplica os totais.

Uso: parse_phase.py <results_dir>
Lê   <results_dir>/results.jsonl (precisa de session_id por run)
Grava <results_dir>/phases.jsonl
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

DISPATCH_MARKERS = {"Task", "Agent"}
PROJECT_ROOTS = [
    Path.home() / ".claude" / "projects",
    Path.home() / ".claude-personal" / "projects",
]


def find_transcript(session_id: str) -> Path | None:
    for root in PROJECT_ROOTS:
        if not root.exists():
            continue
        hits = list(root.glob(f"*/{session_id}.jsonl"))
        if hits:
            return hits[0]
    return None


def parse_session(jsonl_path: Path) -> dict:
    session = {"input": 0, "output": 0, "cache_read": 0, "cache_creation": 0}
    mech = {"input": 0, "output": 0, "cache_read": 0, "cache_creation": 0}
    session_tools: dict[str, int] = defaultdict(int)
    mech_tools: dict[str, int] = defaultdict(int)
    seen: set[str] = set()
    dispatch_found = False

    with jsonl_path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if obj.get("type") != "assistant":
                continue

            rid = obj.get("requestId")
            usage = obj.get("message", {}).get("usage", {})
            if rid and rid not in seen:
                seen.add(rid)
                vals = {
                    "input": usage.get("input_tokens", 0),
                    "output": usage.get("output_tokens", 0),
                    "cache_read": usage.get("cache_read_input_tokens", 0),
                    "cache_creation": usage.get("cache_creation_input_tokens", 0),
                }
                for k, v in vals.items():
                    session[k] += v
                    if not dispatch_found:
                        mech[k] += v

            for item in obj.get("message", {}).get("content", []):
                if not isinstance(item, dict) or item.get("type") != "tool_use":
                    continue
                name = item.get("name", "")
                session_tools[name] += 1
                if not dispatch_found:
                    if name in DISPATCH_MARKERS:
                        dispatch_found = True
                    else:
                        mech_tools[name] += 1

    total = sum(session.values())
    mech_total = sum(mech.values())
    uncached_total = session["input"] + session["output"]
    uncached_mech = mech["input"] + mech["output"]
    return {
        "session": session,
        "mechanical": mech,
        "session_tools": dict(session_tools),
        "mechanical_tools": dict(mech_tools),
        "mechanical_tool_calls": sum(mech_tools.values()),
        "dispatch_found": dispatch_found,
        "mechanical_pct_total": round(mech_total / total * 100, 1) if total else 0.0,
        "mechanical_pct_uncached": round(uncached_mech / uncached_total * 100, 1) if uncached_total else 0.0,
    }


def main() -> None:
    results_dir = Path(sys.argv[1])
    rows = [json.loads(l) for l in (results_dir / "results.jsonl").read_text().splitlines() if l.strip()]
    out = results_dir / "phases.jsonl"

    with out.open("w") as f:
        for row in rows:
            sid = row.get("session_id")
            entry = {k: row[k] for k in ("scenario", "arm", "run", "kind") if k in row}
            if not sid:
                entry["error"] = "sem session_id no result"
            else:
                transcript = find_transcript(sid)
                if transcript is None:
                    entry["error"] = f"transcript de {sid} não encontrado"
                else:
                    entry["transcript"] = str(transcript)
                    entry.update(parse_session(transcript))
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    print(f"fases gravadas em {out}")


if __name__ == "__main__":
    main()
