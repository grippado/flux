#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOC="$ROOT/plugins/flux/shared/flux-context.md"
CLI="$ROOT/cli/src/resolve.ts"

doc_block() {
    awk '/^find -L "\$HOME" -maxdepth/ { on = 1 } on { print } on && /-prune -o/ { exit }' "$DOC"
}

doc_any() {
    doc_block | grep -oE -- "-name [^ )]+" | awk '{ print $2 }' | sort -u
}

doc_root() {
    # shellcheck disable=SC2016
    doc_block | grep -oE -- '-path "\$HOME/[^"]+"' | sed -E 's|^-path "\$HOME/||; s|"$||' | sort -u
}

cli_set() {
    awk -v name="$1" '
        index($0, "const " name " = new Set([") { on = 1 }
        on { print }
        on && /\]\);/ { exit }
    ' "$CLI" | sed -E 's/^.*new Set\(\[//; s/\]\);.*$//' | grep -oE '"[^"]+"' | tr -d '"' | sort -u
}

fail=0

compare() {
    local label="$1" doc="$2" cli="$3"
    if [ -z "$doc" ] || [ -z "$cli" ]; then
        echo "FALHOU $label: lista vazia (doc: ${doc:-vazia}; cli: ${cli:-vazia})" >&2
        fail=1
        return
    fi
    if [ "$doc" != "$cli" ]; then
        echo "FALHOU $label: flux-context.md e cli/src/resolve.ts divergem" >&2
        diff <(printf '%s\n' "$doc") <(printf '%s\n' "$cli") | sed 's/^/  /' >&2 || true
        fail=1
        return
    fi
    echo "ok $label: $(printf '%s' "$doc" | tr '\n' ' ')"
}

compare "poda em qualquer nível" "$(doc_any)" "$(cli_set SKIP_ANY_DEPTH)"
compare "poda só na raiz" "$(doc_root)" "$(cli_set SKIP_AT_ROOT)"

exit "$fail"
