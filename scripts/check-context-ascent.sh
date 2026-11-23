#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN="$ROOT/plugins/flux"

command -v awk >/dev/null 2>&1 || { echo "check-context-ascent: awk ausente" >&2; exit 2; }

shopt -s nullglob
verbs=("$PLUGIN"/skills/*/SKILL.md "$PLUGIN"/agents/*.md)
shared=("$PLUGIN"/shared/*.md)
shopt -u nullglob

if [ "${#verbs[@]}" -eq 0 ]; then
    echo "check-context-ascent: nenhum SKILL.md encontrado em ${PLUGIN#"$ROOT"/}" >&2
    exit 2
fi

fail=0

report() {
    echo "check-context-ascent: ${1#"$ROOT"/}:$2: $3" >&2
    fail=1
}

for file in "${verbs[@]}"; do
    if grep -qF '.claude/flux-context.json' "$file" && ! grep -qF '.cursor/flux-context.json' "$file"; then
        line="$(grep -nF '.claude/flux-context.json' "$file" | head -1 | cut -d: -f1)"
        report "$file" "$line" "lista .claude/flux-context.json na subida sem o .cursor/ correspondente; aponte para shared/flux-context.md (seção O manifesto)"
    fi

    while IFS=: read -r line _; do
        report "$file" "$line" "subida do manifesto em .claude/ sem .cursor/; aponte para shared/flux-context.md (seção O manifesto)"
    done < <(awk '/flux-context\.json/ && /subindo/ && /\.claude\// && !/\.cursor\// { print FNR ":" }' "$file")

    while IFS=: read -r line _; do
        report "$file" "$line" "default de SPECIALISTS_ROOT sem o ramo agents/review/*.md; aponte para shared/flux-context.md (seção Perfil genérico)"
    done < <(awk '/SPECIALISTS_ROOT/ && /agents\/reviewer\.md/ && !/agents\/review\/\*\.md/ { print FNR ":" }' "$file")
done

for file in "${verbs[@]}" "${shared[@]}"; do
    while IFS=: read -r line _; do
        report "$file" "$line" "raiz do workspace ancorada só em .claude/; o manifesto pode estar em .cursor/"
    done < <(awk '/pai do/ && /\.claude\// && !/\.cursor\// { print FNR ":" }' "$file")
done

if [ "$fail" -ne 0 ]; then
    exit 1
fi

echo "check-context-ascent: ${#verbs[@]} skills e agents sobem por .claude/ e .cursor/ ou apontam para o shared."
