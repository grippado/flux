#!/usr/bin/env bash
set -euo pipefail

# Congela o alvo de um cenário: salva o diff da PR e o SHA256 para verificação
# antes de cada série. Uso: ./freeze.sh <id> <owner/repo> <pr_number>

ID="${1:?id do cenário}"
REPO="${2:?owner/repo}"
PR="${3:?número da PR}"

BENCH_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$BENCH_DIR/fixtures"

OUT="$BENCH_DIR/fixtures/${ID}_diff.patch"
gh pr diff "$PR" --repo "$REPO" > "$OUT"
gh pr view "$PR" --repo "$REPO" --json number,title,state,mergeCommit,additions,deletions,changedFiles \
  > "$BENCH_DIR/fixtures/${ID}_meta.json"
shasum -a 256 "$OUT" | tee "$BENCH_DIR/fixtures/${ID}_diff.sha256"

echo "congelado: $ID = $REPO#$PR"
echo "antes de cada série: shasum -a 256 -c fixtures/${ID}_diff.sha256"
