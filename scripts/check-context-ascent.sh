#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN="$ROOT/plugins/flux"
SOURCE="$PLUGIN/shared/flux-context.md"
MARK='<!-- context-ascent: ignore -->'

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

list_near() {
    awk -v mark="$MARK" '
        { line[FNR] = index($0, mark) ? "" : $0 }
        END {
            for (i = 1; i <= FNR; i++) {
                if (!index(line[i], ".claude/flux-context.json")) continue
                near = 0
                for (j = i - 3; j <= i + 3; j++) {
                    if (j >= 1 && j <= FNR && index(line[j], ".cursor/flux-context.json")) near = 1
                }
                if (!near) print i
            }
        }
    ' "$1"
}

paragraphs() {
    awk -v mark="$MARK" -v verb="$2" '
        function flush() {
            if (buf != "") {
                claude = index(buf, ".claude/")
                cursor = index(buf, ".cursor/")
                if (verb && index(buf, "flux-context.json") && buf ~ /(subindo|sobem?|subir)/ && claude && !cursor)
                    print start ":ascent"
                if (verb && index(buf, "SPECIALISTS_ROOT") && index(buf, "agents/reviewer.md") && (!index(buf, "agents/review/*.md") || !index(buf, ".cursor/agents/")))
                    print start ":specialists"
                if (buf ~ /pai do/ && claude && !cursor)
                    print start ":root"
            }
            buf = ""
            start = 0
        }
        /^[[:space:]]*$/ { flush(); next }
        index($0, mark) { next }
        { if (!start) start = FNR; buf = buf " " $0 }
        END { flush() }
    ' "$1"
}

for file in "${verbs[@]}"; do
    while read -r line; do
        report "$file" "$line" "lista .claude/flux-context.json sem o .cursor/ correspondente a até 3 linhas; aponte para shared/flux-context.md (seção O manifesto)"
    done < <(list_near "$file")
done

for file in "${verbs[@]}" "${shared[@]}"; do
    is_verb=0
    case "$file" in "$PLUGIN"/skills/*|"$PLUGIN"/agents/*) is_verb=1 ;; esac
    while IFS=: read -r line rule; do
        case "$rule" in
            ascent) report "$file" "$line" "parágrafo descreve a subida do manifesto em .claude/ sem .cursor/; aponte para shared/flux-context.md (seção O manifesto)" ;;
            specialists) report "$file" "$line" "parágrafo copia o default de SPECIALISTS_ROOT sem os ramos agents/review/*.md e .cursor/agents/; aponte para shared/flux-context.md (seção Perfil genérico)" ;;
            root) report "$file" "$line" "parágrafo ancora a raiz do workspace só em .claude/; o manifesto pode estar em .cursor/" ;;
        esac
    done < <(paragraphs "$file" "$is_verb")
done

if [ ! -f "$SOURCE" ]; then
    report "$SOURCE" 0 "fonte da subida ausente"
else
    for want in '<âncora>/.claude/flux-context.json' '<âncora>/.cursor/flux-context.json' \
                '<parent>/.claude/flux-context.json' '<parent>/.cursor/flux-context.json'; do
        grep -qxF -- "$want" "$SOURCE" || report "$SOURCE" 0 "bloco canônico da subida perdeu a linha $want"
    done

    bullet="$(awk '
        /^- `specialists_root` = override local/ { on = 1; print; next }
        on && (/^[[:space:]]*$/ || /^[^[:space:]]/) { exit }
        on { print }
    ' "$SOURCE")"
    if [ -z "$bullet" ]; then
        report "$SOURCE" 0 "perfil genérico perdeu o default de specialists_root"
    else
        for want in '.claude/agents/reviewer.md' '.claude/agents/review/*.md' \
                    '.cursor/agents/reviewer.md' '.cursor/agents/review/*.md'; do
            case "$bullet" in
                *"$want"*) ;;
                *) report "$SOURCE" 0 "default de specialists_root perdeu o ramo $want" ;;
            esac
        done
    fi
fi

if [ "$fail" -ne 0 ]; then
    exit 1
fi

echo "check-context-ascent: ${#verbs[@]} skills e agents sobem por .claude/ e .cursor/ ou apontam para o shared; fonte íntegra."
