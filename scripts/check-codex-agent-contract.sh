#!/usr/bin/env bash
# Verifica as invariantes do adaptador Codex sem exigir uma sessão Codex real.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX="$ROOT/plugins/flux/shared/codex-compat.md"
PREFLIGHT="$ROOT/plugins/flux/shared/preflight.md"
REVIEW="$ROOT/plugins/flux/shared/review-agents.md"

require() {
    local pattern="$1"
    local file="$2"
    if ! rg -q --fixed-strings "$pattern" "$file"; then
        echo "check-codex-agent-contract: faltou '$pattern' em ${file#$ROOT/}" >&2
        exit 1
    fi
}

require 'Adaptador de instruções de agente' "$CODEX"
require 'arquivo regular e legível' "$CODEX"
require '${FLUX_ROOT}/agents/pr-reviewer.md' "$CODEX"
require 'Nunca derive um path de um nome' "$CODEX"
require 'proíbe re-resolver agentes' "$CODEX"
require 'Claude Code e Cursor preservam' "$CODEX"
require 'Exceção Codex' "$PREFLIGHT"
require 'Exceção Codex' "$REVIEW"
require 'subagente nativo genérico' "$REVIEW"

echo 'check-codex-agent-contract: contrato Codex de fontes de instrução íntegro.'
