#!/usr/bin/env bash
#
# Instala a família flux: como plugin local do Cursor.
#
# Por que existe um script aqui, e não uma linha de symlink no README:
#
#   1. O Cursor não segue symlink em ~/.cursor/plugins/local/. Um symlink registra
#      o plugin e não carrega nada — falha silenciosa, sem erro em lugar nenhum.
#      Tem que ser diretório real.
#   2. O nome invocável de uma skill vem do campo `name` do frontmatter, nos DOIS
#      harnesses. Mas o Cursor não prefixa skill de plugin: `name: peek` vira `/peek`,
#      no mesmo namespace liso onde o Cursor já tem uma skill nativa chamada `review`.
#      Como o Claude Code também usa o `name` (lá `name: peek` vira `/flux:peek`),
#      prefixar na fonte estragaria o Claude Code (`/flux:flux-peek`).
#
#      Então o prefixo é aplicado AQUI, na cópia instalada. O repo mantém um nome só.
#
# Não há hot-reload: depois de rodar isto, encerre o Cursor por completo e abra de
# novo. Fechar a janela normalmente deixa o app rodando com a versão antiga em
# memória.
#
# Requisitos: bash, python3 e (opcionalmente) rsync. No Windows, rode a partir do
# WSL ou do Git Bash.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/plugins/flux"
DEST="${CURSOR_PLUGIN_DIR:-$HOME/.cursor/plugins/local/flux}"
PREFIX="${FLUX_CURSOR_PREFIX:-flux-}"

[ -f "$SRC/.cursor-plugin/plugin.json" ] || {
  echo "erro: $SRC/.cursor-plugin/plugin.json nao encontrado." >&2
  echo "rode este script de dentro do checkout do flux." >&2
  exit 1
}

# python3 faz o trabalho de renomeação; em alguns sistemas o executável é `python`.
PYTHON=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then PYTHON="$candidate"; break; fi
done
[ -n "$PYTHON" ] || { echo "erro: python3 nao encontrado (necessario para prefixar os nomes)." >&2; exit 1; }

# Cópia limpa: o destino é recriado do zero a cada run, para que arquivo removido
# do repo não sobreviva na instalação. rsync quando existir; senão, cp portável.
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
mkdir -p "$DEST"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --exclude '.git' "$SRC/" "$DEST/"
else
  (cd "$SRC" && tar cf - --exclude '.git' .) | (cd "$DEST" && tar xf -)
fi

# Prefixar o `name` do frontmatter E o nome do diretorio/arquivo na copia instalada.
#
# O diretorio importa: com os diretorios ainda chamados `skills/peek/`, o Cursor
# lista as skills certas em Customize mas nao as oferece no menu do chat, porque
# colide com a instalacao do flux pelo lado Claude Code (que o Cursor tambem le,
# e cujos diretorios tem os mesmos nomes). Prefixar os dois resolve a colisao.
"$PYTHON" - "$DEST" "$PREFIX" <<'PY'
import glob, os, re, sys

dest, prefix = sys.argv[1], sys.argv[2]
renamed = []

def bump(path, kind):
    """Prefixa o campo `name` do frontmatter. Devolve (antigo, novo) ou None."""
    text = open(path).read()
    if not text.startswith('---'):
        return None
    _, head, body = text.split('---', 2)
    match = re.search(r'^name:[ \t]*(.+?)[ \t]*$', head, re.M)
    if not match:
        return None
    old = match.group(1).strip().strip('"\'')
    if old.startswith(prefix):
        return None
    new = prefix + old
    head = head[:match.start(1)] + new + head[match.end(1):]
    open(path, 'w').write('---' + head + '---' + body)
    return (kind, old, new)

# Skills: renomeia o frontmatter e o diretorio que a contem.
for skill_dir in sorted(glob.glob(f'{dest}/skills/*')):
    if not os.path.isdir(skill_dir):
        continue
    result = bump(os.path.join(skill_dir, 'SKILL.md'), 'skill')
    if not result:
        continue
    renamed.append(result)
    target = os.path.join(os.path.dirname(skill_dir), result[2])
    if skill_dir != target:
        os.rename(skill_dir, target)

# Agents: renomeia o frontmatter e o proprio arquivo.
for agent_file in sorted(glob.glob(f'{dest}/agents/*.md')):
    result = bump(agent_file, 'agent')
    if not result:
        continue
    renamed.append(result)
    target = os.path.join(os.path.dirname(agent_file), result[2] + '.md')
    if agent_file != target:
        os.rename(agent_file, target)

for kind, old, new in renamed:
    print(f'  {kind:5}  {old:12} -> {new}')
print(f'{len(renamed)} nomes prefixados (frontmatter + caminho)')
PY

cat <<EOF

flux instalado em: $DEST
origem:            $SRC

Encerre o Cursor por completo, abra de novo, e confira em
Settings -> Customize -> Plugins.
Os verbos ficam como /${PREFIX}peek, /${PREFIX}review, /${PREFIX}iterate, etc.

Nao ha hot-reload: a cada mudanca no repo, rode este script de novo e reinicie.
EOF
