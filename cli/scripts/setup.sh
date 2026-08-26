#!/usr/bin/env bash
# Build + instala o binário flux localmente: bun build --compile, re-assina
# (necessário em Macs com MDM/EndpointSecurity que rejeitam o ad-hoc signing
# padrão do Bun — ver LAB-139) e copia pra ~/.local/bin/flux.
set -euo pipefail

cd "$(dirname "$0")/.."

bun run build

if command -v codesign >/dev/null 2>&1; then
  codesign --force --sign - flux
fi

mkdir -p "$HOME/.local/bin"
cp flux "$HOME/.local/bin/flux"

# Warm-up: em Macs com MDM/EndpointSecurity (JumpCloud + SentinelOne, ver LAB-139),
# o primeiro exec logo após assinar corre contra um scan assíncrono do daemon de
# segurança e pode morrer com exit 137 (AppleSystemPolicy) — sem indicar nada
# errado com o binário. Absorve essa corrida aqui, não na primeira vez que o
# usuário for usar o comando de verdade.
status=0
"$HOME/.local/bin/flux" >/dev/null 2>&1 || status=$?
if [ "$status" -eq 137 ]; then
  sleep 2
  "$HOME/.local/bin/flux" >/dev/null 2>&1 || true
fi

echo "flux instalado em $HOME/.local/bin/flux"
