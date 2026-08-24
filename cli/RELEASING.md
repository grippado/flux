# Checklist de release da CLI

A CLI tem versão própria em `cli/package.json`, **fora do array verificado por `check-manifests.sh`**
(decisão registrada na PR #31: a CLI não é plugin de harness e não compartilha a cadência de
versionamento com os cinco manifests do plugin).

Antes de publicar um binário novo:

1. Bumpe `version` em `cli/package.json` para a versão desejada.
2. Bumpe a mesma versão nos cinco manifests do plugin (`.claude-plugin/marketplace.json`,
   `plugins/flux/.claude-plugin/plugin.json`, `.cursor-plugin/marketplace.json`,
   `plugins/flux/.cursor-plugin/plugin.json`, `plugins/flux/.codex-plugin/plugin.json`)
   quando a release da CLI acompanhar um release de plugin — caso contrário, bumpe só o `cli/package.json`.
3. A versão embutida no binário (`CLI_VERSION` em `cli/src/prompt.ts`) é lida de `cli/package.json`
   no build — não há segundo lugar para bumpar.
4. Reconstrua o binário:
   ```bash
   cd cli && bun run build
   ```
5. Teste o binário gerado com `flux resolve . --json` e confirme que o campo `flux_root` resolve corretamente.
6. Distribua o binário `cli/flux` para os destinos de publicação.
