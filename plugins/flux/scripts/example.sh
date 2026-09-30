#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v jq > /dev/null 2>&1; then
    echo "example: jq não encontrado no PATH." >&2
    exit 2
fi

jq -r '"\(.name)@\(.version)"' "$ROOT/.claude-plugin/plugin.json"
