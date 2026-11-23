#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN="$ROOT/plugins/flux"
SOURCE="$PLUGIN/shared/review-agents.md"
SECTION='### 1b — L3, specialists do repo'
LEAD='**Receita do hash do conjunto.**'
POINTER='receita do hash do conjunto'

command -v awk >/dev/null 2>&1 || { echo "check-agents-hash: awk ausente" >&2; exit 2; }

fail=0

report() {
    echo "check-agents-hash: ${1#"$ROOT"/}:$2: $3" >&2
    fail=1
}

section_block() {
    awk -v sec="$SECTION" -v want="$1" '
        /^##/ { on = ($0 == sec) }
        on && /^```bash$/ { n++; inb = (n == want); next }
        inb && /^```$/ { inb = 0; next }
        inb { print }
    ' "$SOURCE"
}

pointed() {
    awk -v term="$2" -v pointer="$POINTER" '
        function flush() {
            if (buf != "" && index(buf, term) && index(tolower(buf), pointer) && index(buf, "review-agents.md")) n++
            buf = ""
        }
        /^[[:space:]]*$/ { flush(); next }
        { buf = buf " " $0 }
        END { flush(); print n + 0 }
    ' "$1"
}

if [ ! -f "$SOURCE" ]; then
    report "$SOURCE" 0 "fonte da descoberta de agents ausente"
else
    canonical="$(section_block 1 | grep -m1 '^find -L "<raiz>" ' || true)"
    recipe="$(section_block 2)"
    if [ -z "$canonical" ]; then
        report "$SOURCE" 0 "o 1b perdeu o comando canônico de descoberta (find -L \"<raiz>\" ...)"
    fi
    grep -qF -- "$LEAD" "$SOURCE" || report "$SOURCE" 0 "o 1b perdeu o parágrafo $LEAD"
    if [ -z "$recipe" ]; then
        report "$SOURCE" 0 "o 1b perdeu o bloco da receita do hash do conjunto"
    else
        if [ -n "$canonical" ]; then
            relative="find -L . ${canonical#find -L \"<raiz>\" }"
            case "$recipe" in
                *"$relative"*) ;;
                *) report "$SOURCE" 0 "a receita do hash não usa o comando canônico com path relativo ($relative)" ;;
            esac
        fi
        for want in 'LC_ALL=C sort' 'sha256sum' 'shasum -a 256' 'AGENTS_SHA256='; do
            case "$recipe" in
                *"$want"*) ;;
                *) report "$SOURCE" 0 "a receita do hash perdeu $want" ;;
            esac
        done
    fi
fi

while read -r rel term min; do
    file="$PLUGIN/$rel"
    if [ ! -f "$file" ]; then
        report "$file" 0 "arquivo ausente"
        continue
    fi
    got="$(pointed "$file" "$term")"
    if [ "$got" -lt "$min" ]; then
        report "$file" 0 "esperava $min parágrafo(s) com $term apontando para a receita do hash do conjunto (1b do review-agents.md), achou $got"
    fi
done <<'TARGETS'
shared/agents-index.md dir_sha256 2
skills/map/SKILL.md dir_sha256 1
skills/map/SKILL.md synced_from_sha256 1
skills/equip/SKILL.md synced_from_sha256 1
skills/equip/SKILL.md dir_sha256 1
shared/preflight.md synced_from_sha256 1
TARGETS

shopt -s nullglob
docs=("$PLUGIN"/skills/*/SKILL.md "$PLUGIN"/agents/*.md "$PLUGIN"/shared/*.md)
shopt -u nullglob

for file in "${docs[@]}"; do
    [ "$file" = "$SOURCE" ] && continue
    while IFS=: read -r line _; do
        report "$file" "$line" "paráfrase da descoberta de agents (**.md); aponte para o comando canônico do 1b do review-agents.md"
    done < <(grep -nF -- '**.md' "$file" || true)
    while IFS=: read -r line _; do
        report "$file" "$line" "hash de agents improvisado; aponte para a receita do hash do conjunto (1b do review-agents.md)"
    done < <(grep -nE -- 'sha256sum|shasum' "$file" || true)
done

if [ "$fail" -ne 0 ]; then
    exit 1
fi

echo "check-agents-hash: receita do hash no 1b derivada do comando canônico; agents-index, map, equip e preflight apontam para ela."
