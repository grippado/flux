# flux

Família de comandos para agentes de IA, distribuída como plugin para Claude Code, Cursor e Codex. Este arquivo só guarda a regra que costuma ser esquecida; o resto está no [README](README.md).

## Regra pétrea: versão nova sem aprovação = landing desatualizada

A landing e a página de releases leem `docs/latest-release.json`, que só o workflow `.github/workflows/release.yml` atualiza. O merge de uma versão nova na `main` dispara o workflow sozinho, mas ele para no Environment `release` esperando aprovação: é ali que a tag anotada `v<versão>` é criada, a release publicada e o JSON commitado.

- Não crie a tag à mão no fluxo normal. Quem cria é o workflow, no commit do merge, com a mensagem tirada da PR.
- PR que bumpa versão pode trazer no corpo as linhas `Summary-en:` e `Summary-pt:` (até 180 caracteres, sem travessão). Sem elas, a landing mostra o título da PR nos dois idiomas.
- Depois do merge de um bump, conferir se a run foi aprovada e se a tag existe. Run rejeitada ou expirada não publica nada e não avisa ninguém.
- Reparo, tag de catch-up e como conferir: seção [Publicar uma versão](README.md#publicar-uma-versão) do README.

Checks antes de abrir PR: `scripts/check-manifests.sh` e `scripts/check-codex-agent-contract.sh` (ver "Contribuindo" no README).
