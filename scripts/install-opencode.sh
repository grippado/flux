#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/plugins/flux"
DEST="${FLUX_OPENCODE_DIR:-$HOME/.config/opencode}"

if [ ! -f "$SRC/.claude-plugin/plugin.json" ] || [ ! -d "$SRC/skills" ]; then
  echo "erro: $SRC nao parece o plugin do flux." >&2
  echo "rode este script de dentro do checkout do flux." >&2
  exit 1
fi

if command -v opencode >/dev/null 2>&1; then
  OC_VERSION="$(opencode --version 2>/dev/null | head -n 1 || true)"
  OC_MAJOR="$(printf '%s\n' "$OC_VERSION" | sed -n 's/^[^0-9]*\([0-9][0-9]*\)\..*/\1/p')"
  if [ -z "$OC_MAJOR" ]; then
    echo "aviso: nao consegui ler a versao do OpenCode ('$OC_VERSION'); o flux exige OpenCode 2.x." >&2
  elif [ "$OC_MAJOR" -lt 2 ]; then
    echo "erro: OpenCode $OC_VERSION detectado. O flux so suporta OpenCode 2.x (V2)." >&2
    echo "atualize o OpenCode e rode este script de novo. Nada foi instalado." >&2
    exit 1
  fi
else
  echo "aviso: binario 'opencode' nao encontrado no PATH; instalando mesmo assim (o flux exige OpenCode 2.x)." >&2
fi

PYTHON=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then PYTHON="$candidate"; break; fi
done
[ -n "$PYTHON" ] || { echo "erro: python3 nao encontrado (necessario para gerar commands e agents)." >&2; exit 1; }

mkdir -p "$DEST/skills" "$DEST/commands" "$DEST/agents"

"$PYTHON" - "$SRC" "$DEST" "$HOME" <<'PY'
import glob, json, os, re, shutil, sys

src, dest, home = sys.argv[1], sys.argv[2], sys.argv[3]
skills_dest = os.path.join(dest, 'skills')
commands_dest = os.path.join(dest, 'commands', 'flux')
agents_dest = os.path.join(dest, 'agents')
warnings = []

def split_frontmatter(path):
    text = open(path, encoding='utf-8').read()
    if not text.startswith('---'):
        return '', text
    _, head, body = text.split('---', 2)
    return head, body.lstrip('\n')

def field(head, name):
    match = re.search(r'^' + name + r':[ \t]*(.*?)[ \t]*$', head, re.M)
    if not match:
        return None
    value = match.group(1)
    if value.startswith('"') and value.endswith('"') and len(value) >= 2:
        return json.loads(value)
    if value.startswith("'") and value.endswith("'") and len(value) >= 2:
        return value[1:-1].replace("''", "'")
    return value

def ours(link, verb):
    target = os.readlink(link).rstrip('/')
    return target.endswith(os.path.join('plugins', 'flux', 'skills', verb))

verbs = sorted(
    os.path.basename(d) for d in glob.glob(os.path.join(src, 'skills', '*'))
    if os.path.isfile(os.path.join(d, 'SKILL.md'))
)

removed = 0
for entry in sorted(glob.glob(os.path.join(skills_dest, 'flux-*'))):
    verb = os.path.basename(entry)[len('flux-'):]
    if os.path.islink(entry) and ours(entry, verb):
        os.remove(entry)
        removed += 1
if os.path.isdir(commands_dest):
    shutil.rmtree(commands_dest)
for entry in sorted(glob.glob(os.path.join(agents_dest, 'flux-*.md'))):
    if os.path.isfile(entry) or os.path.islink(entry):
        os.remove(entry)
        removed += 1

os.makedirs(commands_dest, exist_ok=True)

linked, commands, agents = 0, 0, 0
for verb in verbs:
    skill_id = 'flux-' + verb
    link = os.path.join(skills_dest, skill_id)
    for other in (os.path.join(home, '.claude', 'skills', skill_id), os.path.join(home, '.agents', 'skills', skill_id)):
        if os.path.lexists(other):
            warnings.append(f'skill {skill_id} tambem existe em {other}; no OpenCode a ultima carregada vence')
    if os.path.lexists(link):
        warnings.append(f'{link} ja existe e nao foi criado por este script; mantido, /flux/{verb} nao instalado')
        continue
    os.symlink(os.path.join(src, 'skills', verb), link)
    linked += 1

    head, _ = split_frontmatter(os.path.join(src, 'skills', verb, 'SKILL.md'))
    description = field(head, 'description') or f'flux {verb}'
    with open(os.path.join(commands_dest, verb + '.md'), 'w', encoding='utf-8') as out:
        out.write('---\n')
        out.write('description: ' + json.dumps(description, ensure_ascii=False) + '\n')
        out.write('---\n\n')
        out.write(f'Carregue a skill `{skill_id}` com a tool `skill` e siga-a integralmente.\n\n')
        out.write('Argumentos do usuário: $ARGUMENTS\n')
    commands += 1

readonly_rules = [
    ('*', 'deny'),
    ('read', 'allow'),
    ('grep', 'allow'),
    ('glob', 'allow'),
    ('shell', 'allow'),
    ('external_directory', 'allow'),
]

for agent_file in sorted(glob.glob(os.path.join(src, 'agents', '*.md'))):
    head, body = split_frontmatter(agent_file)
    name = field(head, 'name') or os.path.splitext(os.path.basename(agent_file))[0]
    description = field(head, 'description') or name
    readonly = (field(head, 'readonly') or '').lower() == 'true'
    with open(os.path.join(agents_dest, 'flux-' + name + '.md'), 'w', encoding='utf-8') as out:
        out.write('---\n')
        out.write('description: ' + json.dumps(description, ensure_ascii=False) + '\n')
        out.write('mode: subagent\n')
        if readonly:
            out.write('permissions:\n')
            for action, effect in readonly_rules:
                out.write(f'  - action: {json.dumps(action)}\n')
                out.write('    resource: "*"\n')
                out.write(f'    effect: {effect}\n')
        out.write('---\n\n')
        out.write(body)
    agents += 1

for message in warnings:
    print('aviso: ' + message, file=sys.stderr)
print(f'{removed} itens gerados antes removidos')
print(f'{linked} skills ligadas por symlink, {commands} commands, {agents} agents')
PY

cat <<EOF

flux instalado em: $DEST
origem:            $SRC

Os verbos ficam como /flux/peek, /flux/review, /flux/iterate, etc.
Fallback de raiz, se a sessao nao resolver FLUX_ROOT pelo symlink:
  export FLUX_HOME="$SRC"

Reinicie o OpenCode. Se mover o checkout, rode este script de novo.
EOF
