#!/usr/bin/env bash
# Confere que skills, shared, agents e docs públicos não carregam resíduo pessoal do autor.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGETS=(plugins docs README.md cli/README.md)
PATTERN='CPU-|MOM-|Maria Bonita|cangaço|cangaco|~/\.notes'

if hits="$(grep -rInE "$PATTERN" "${TARGETS[@]}")"; then
    echo "check-public-residue: resíduo pessoal em arquivo público:" >&2
    printf '%s\n' "$hits" >&2
    exit 1
fi

echo "check-public-residue: nenhum resíduo em ${TARGETS[*]}."
