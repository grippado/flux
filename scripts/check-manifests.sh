#!/usr/bin/env bash
#
# Confere que os cinco manifests do flux declaram a mesma versão e o mesmo nome.
#
# Os dois `claude plugin validate` do README validam a forma de cada manifesto
# isoladamente, e recebem alvos disjuntos (`.` e `./plugins/flux`), então nenhuma
# invocação enxerga os dois lados nem olha para .cursor-plugin/ e .codex-plugin/.
# Um bump que esquece parte dos cinco passa verde nos dois, e o mesmo corpo de
# skills chega com versão diferente conforme o harness.
#
# A lista de caminhos abaixo é literal de propósito. Derivá-la iterando o
# marketplace do Claude compararia claude com claude e passaria verde exatamente
# no cenário dos incidentes conhecidos (e47f167, 7b115b4).
#
# Compara `version` e `name` por string exata, tomando o primeiro arquivo como
# referência. NÃO compara `description` (o manifesto do Codex é intencionalmente
# em inglês), `keywords` (o Codex tem `codex` a mais) nem o bloco `interface`
# (exclusivo dele). O contrato é sobre versão e identidade, não sobre paridade
# de conteúdo.
#
# Uso:
#   scripts/check-manifests.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MANIFESTS=(
    ".claude-plugin/marketplace.json"
    ".cursor-plugin/marketplace.json"
    "plugins/flux/.claude-plugin/plugin.json"
    "plugins/flux/.cursor-plugin/plugin.json"
    "plugins/flux/.codex-plugin/plugin.json"
)

if ! command -v jq > /dev/null 2>&1; then
    echo "check-manifests: jq não encontrado no PATH." >&2
    exit 2
fi

names=()
versions=()
errors=()

for rel in "${MANIFESTS[@]}"; do
    abs="$ROOT/$rel"

    if [[ ! -f "$abs" ]]; then
        errors+=("manifesto ausente: $rel")
        names+=("-")
        versions+=("-")
        continue
    fi

    if ! parsed="$(jq -er '(if has("plugins") then .plugins[0] else . end)
                           | [(.name // "«sem name»"), (.version // "«sem version»")]
                           | @tsv' "$abs" 2> /dev/null)"; then
        errors+=("JSON inválido ou sem entrada de plugin: $rel")
        names+=("-")
        versions+=("-")
        continue
    fi

    names+=("$(printf '%s' "$parsed" | cut -f1)")
    versions+=("$(printf '%s' "$parsed" | cut -f2)")
done

divergent=()
ref_index=-1
for i in "${!MANIFESTS[@]}"; do
    if [[ "${names[$i]}" != "-" ]]; then
        ref_index=$i
        break
    fi
done

if [[ $ref_index -lt 0 ]]; then
    echo "check-manifests: nenhum dos 5 manifests pôde ser lido." >&2
    for e in "${errors[@]}"; do
        echo "  erro: $e" >&2
    done
    exit 1
fi

ref_name="${names[$ref_index]}"
ref_version="${versions[$ref_index]}"

for i in "${!MANIFESTS[@]}"; do
    [[ "${names[$i]}" == "-" ]] && continue
    if [[ "${names[$i]}" != "$ref_name" || "${versions[$i]}" != "$ref_version" ]]; then
        divergent+=("${MANIFESTS[$i]}")
    fi
done

if [[ ${#errors[@]} -eq 0 && ${#divergent[@]} -eq 0 ]]; then
    echo "check-manifests: 5 manifests em $ref_name@$ref_version."
    exit 0
fi

echo "check-manifests: os 5 manifests não estão em acordo." >&2
echo >&2
for i in "${!MANIFESTS[@]}"; do
    printf '  %-40s name=%-14s version=%s\n' \
        "${MANIFESTS[$i]}" "${names[$i]}" "${versions[$i]}" >&2
done
echo >&2

if [[ ${#errors[@]} -gt 0 ]]; then
    for e in "${errors[@]}"; do
        echo "  erro: $e" >&2
    done
fi

if [[ ${#divergent[@]} -gt 0 ]]; then
    echo "  divergem da referência ($ref_name@$ref_version, ${MANIFESTS[$ref_index]}):" >&2
    for d in "${divergent[@]}"; do
        echo "    - $d" >&2
    done
    echo >&2
    echo "  A tabela acima lista os cinco: leve os que estão atrás até a versão mais" >&2
    echo "  recente entre elas. Cardinalidade não é o critério: quem está atrás sobe," >&2
    echo "  mesmo que os atrasados sejam a maioria. Nunca regrida uma versão já publicada." >&2
fi

exit 1
