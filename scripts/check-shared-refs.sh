#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

while [ "$#" -gt 0 ]; do
    case "$1" in
        --root)
            [ "$#" -ge 2 ] || { echo "check-shared-refs: --root exige um diretório" >&2; exit 2; }
            ROOT="$(cd "$2" && pwd)"
            shift 2
            ;;
        *)
            echo "check-shared-refs: argumento desconhecido: $1" >&2
            exit 2
            ;;
    esac
done

command -v awk >/dev/null 2>&1 || { echo "check-shared-refs: awk ausente" >&2; exit 2; }

PLUGIN="$ROOT/plugins/flux"
SECTION='Aviso no canal de PR: elegibilidade e declaração'

shopt -s nullglob
skills=("$PLUGIN"/skills/*/SKILL.md)
agents=("$PLUGIN"/agents/*.md)
shared=("$PLUGIN"/shared/*.md)
shopt -u nullglob

if [ "${#skills[@]}" -eq 0 ]; then
    echo "check-shared-refs: nenhum SKILL.md encontrado em ${PLUGIN#"$ROOT"/}" >&2
    exit 2
fi

fail=0
total=0
cited=""

report() {
    echo "check-shared-refs: ${1#"$ROOT"/}:$2: $3" >&2
    fail=1
}

refs_of() {
    awk '
        {
            rest = $0
            offset = 0
            while (match(rest, /shared\/[A-Za-z0-9_.-]+\.md/)) {
                start = offset + RSTART
                before = start > 1 ? substr($0, start - 1, 1) : ""
                ok = 0
                if (before == "" || before !~ /[A-Za-z0-9_.\/-]/) ok = 1
                if (before == "/" && start > 13 && substr($0, start - 13, 13) == "${FLUX_ROOT}/") ok = 1
                if (ok) print FNR "\t" substr(rest, RSTART + 7, RLENGTH - 7)
                offset += RSTART + RLENGTH - 1
                rest = substr(rest, RSTART + RLENGTH)
            }
        }
    ' "$1"
}

for file in "${skills[@]}" "${agents[@]}" "${shared[@]}"; do
    while IFS=$'\t' read -r line name; do
        [ -n "$name" ] || continue
        total=$((total + 1))
        if [ ! -f "$PLUGIN/shared/$name" ]; then
            report "$file" "$line" "referência a shared/$name, que não existe em ${PLUGIN#"$ROOT"/}/shared/"
        elif [ "$file" != "$PLUGIN/shared/$name" ]; then
            cited="$cited $name "
        fi
    done < <(refs_of "$file")
done

for file in "${skills[@]}"; do
    if grep -qF -- "$SECTION" "$file" && ! grep -qF -- 'aviso-slack:' "$file"; then
        report "$file" 0 "cita a seção '$SECTION' mas não contém 'aviso-slack:'; a declaração tem de aparecer no modelo de resposta do SKILL, não só no shared"
    fi
done

for file in "${shared[@]}"; do
    name="$(basename "$file")"
    case "$cited" in
        *" $name "*) ;;
        *) report "$file" 0 "shared órfão: nenhum SKILL.md, agent ou outro shared cita shared/$name" ;;
    esac
done

if [ "$fail" -ne 0 ]; then
    exit 1
fi

echo "check-shared-refs: $total referências a shared/ resolvidas em $(( ${#skills[@]} + ${#agents[@]} + ${#shared[@]} )) arquivos."
