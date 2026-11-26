#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK="$ROOT/scripts/check-shared-refs.sh"
SECTION='Aviso no canal de PR: elegibilidade e declaração'

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0
total=0

make_fixture() {
    local dir="$1"
    mkdir -p "$dir/plugins/flux/skills/alfa" "$dir/plugins/flux/agents" "$dir/plugins/flux/shared"
    printf 'Veja %s/shared/um.md e shared/dois.md.\n' "\${FLUX_ROOT}" >"$dir/plugins/flux/skills/alfa/SKILL.md"
    printf 'Veja shared/dois.md.\n' > "$dir/plugins/flux/agents/agente.md"
    printf 'um\n' > "$dir/plugins/flux/shared/um.md"
    printf 'dois\n' > "$dir/plugins/flux/shared/dois.md"
}

expect() {
    local name="$1" want="$2" out="$3" rc="$4"
    shift 4
    total=$((total + 1))
    local ok=1
    [ "$rc" -eq "$want" ] || ok=0
    local needle
    for needle in "$@"; do
        case "$out" in *"$needle"*) ;; *) ok=0 ;; esac
    done
    if [ "$ok" -eq 1 ]; then
        pass=$((pass + 1))
    else
        echo "test-check-shared-refs: FALHOU $name (rc=$rc, esperado $want)" >&2
        echo "$out" >&2
    fi
}

run() {
    local rc=0
    OUT="$(bash "$CHECK" --root "$1" 2>&1)" || rc=$?
    RC=$rc
}

d="$TMP/ok"; make_fixture "$d"
run "$d"
expect "tudo certo" 0 "$OUT" "$RC" "3 referências"

d="$TMP/quebrada"; make_fixture "$d"
printf 'Veja shared/ausente.md.\n' >> "$d/plugins/flux/skills/alfa/SKILL.md"
run "$d"
expect "referência quebrada" 1 "$OUT" "$RC" "skills/alfa/SKILL.md:2" "shared/ausente.md"

d="$TMP/outro-plugin"; make_fixture "$d"
printf 'Veja ~/code/acme/plugins/core/shared/LINEAR-OPS.md.\n' >> "$d/plugins/flux/skills/alfa/SKILL.md"
run "$d"
expect "shared de outro plugin é ignorado" 0 "$OUT" "$RC" "3 referências"

d="$TMP/sem-aviso"; make_fixture "$d"
printf 'Siga a seção "%s".\n' "$SECTION" >> "$d/plugins/flux/skills/alfa/SKILL.md"
run "$d"
expect "seção de aviso sem aviso-slack" 1 "$OUT" "$RC" "skills/alfa/SKILL.md" "aviso-slack:"

d="$TMP/com-aviso"; make_fixture "$d"
printf 'Siga a seção "%s".\naviso-slack: nenhum\n' "$SECTION" >> "$d/plugins/flux/skills/alfa/SKILL.md"
run "$d"
expect "seção de aviso com aviso-slack" 0 "$OUT" "$RC"

d="$TMP/orfao"; make_fixture "$d"
printf 'solto\n' > "$d/plugins/flux/shared/solto.md"
run "$d"
expect "shared órfão" 1 "$OUT" "$RC" "shared/solto.md" "órfão"

if [ "$pass" -ne "$total" ]; then
    echo "test-check-shared-refs: $pass/$total" >&2
    exit 1
fi

echo "test-check-shared-refs: $pass/$total"
