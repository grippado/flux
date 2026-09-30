# flux

Família de comandos para agentes de IA, distribuída como plugin para Claude Code, Cursor e Codex. Este arquivo só guarda a regra que costuma ser esquecida; o resto está no [README](README.md).

## Regra pétrea: bump de versão sem tag = landing desatualizada

A landing e a página de releases leem `docs/latest-release.json`, que só o workflow `.github/workflows/release.yml` atualiza, disparado por push de tag anotada `v*`. Bumpar os cinco manifests não dispara nada.

- PR que bumpa versão deve listar, na descrição, o passo pós-merge: criar e publicar a tag anotada `v<versão>`.
- Depois do merge de um bump, conferir se a tag existe; se não existir, criar (com `Summary-en:` e `Summary-pt:` na mensagem) e publicar.
- Comando, formato da mensagem, tag de catch-up e como conferir: seção [Publicar uma versão](README.md#publicar-uma-versão) do README.

Checks antes de abrir PR: `scripts/check-manifests.sh` e `scripts/check-codex-agent-contract.sh` (ver "Contribuindo" no README).
