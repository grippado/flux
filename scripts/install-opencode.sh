#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/plugins/flux"
DEST="${FLUX_OPENCODE_DIR:-$HOME/.config/opencode}"

if [ ! -f "$SRC/.claude-plugin/plugin.json" ] || [ ! -d "$SRC/skills" ]; then
  echo "erro: $SRC não parece o plugin do flux." >&2
  echo "rode este script de dentro do checkout do flux." >&2
  exit 1
fi

if command -v opencode >/dev/null 2>&1; then
  OC_VERSION="$(opencode --version 2>/dev/null | head -n 1 || true)"
  OC_MAJOR="$(printf '%s\n' "$OC_VERSION" | sed -n 's/^[^0-9]*\([0-9][0-9]*\)\..*/\1/p')"
  if [ -z "$OC_MAJOR" ]; then
    echo "aviso: não consegui ler a versão do OpenCode ('$OC_VERSION'); o flux exige OpenCode 2.x." >&2
  elif [ "$OC_MAJOR" -lt 2 ]; then
    echo "erro: OpenCode $OC_VERSION detectado. O flux só suporta OpenCode 2.x (V2)." >&2
    echo "atualize o OpenCode e rode este script de novo. Nada foi instalado." >&2
    exit 1
  fi
else
  echo "aviso: binário 'opencode' não encontrado no PATH; instalando mesmo assim (o flux exige OpenCode 2.x)." >&2
fi

PYTHON=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then PYTHON="$candidate"; break; fi
done
[ -n "$PYTHON" ] || { echo "erro: python3 não encontrado (necessário para gerar commands e agents)." >&2; exit 2; }

"$PYTHON" - "$SRC" "$DEST" "$HOME" <<'PY'
import glob, json, os, re, shutil, sys, tempfile

src, dest, home = sys.argv[1], sys.argv[2], sys.argv[3]
MANIFEST = '.flux-install.json'
STAGING_PREFIX = '.flux-install-'
OWNED_PATTERNS = {
    'skills': re.compile(r'^skills/flux-[^/]+$'),
    'commands': re.compile(r'^commands/flux/[^/]+\.md$'),
    'agents': re.compile(r'^agents/flux-[^/]+\.md$'),
}
KEY_LINE = re.compile(r'^([A-Za-z_][A-Za-z0-9_-]*):(?:[ \t]+(.*?))?[ \t]*$')
BLOCK_SCALAR = re.compile(r'^[>|][-+0-9]*[ \t]*(#.*)?$')
NAME_RE = re.compile(r'^[a-z0-9][a-z0-9-]*$')
warnings = []


class Refused(Exception):
    pass


def parse_frontmatter(path):
    with open(path, encoding='utf-8') as handle:
        text = handle.read()
    lines = text.split('\n')
    if not lines or lines[0] != '---':
        raise Refused(f'{path}: não começa com frontmatter (---)')
    try:
        close = lines.index('---', 1)
    except ValueError:
        raise Refused(f'{path}: frontmatter sem a linha --- de fechamento')
    head = lines[1:close]
    body = '\n'.join(lines[close + 1:]).lstrip('\n')
    fields = {}
    nested_ok = False
    for number, line in enumerate(head, start=2):
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        if line[0] in ' \t':
            if not nested_ok:
                raise Refused(f'{path}:{number}: linha indentada fora de um bloco aninhado; o parser só entende escalar em uma linha')
            continue
        match = KEY_LINE.match(line)
        if not match:
            raise Refused(f'{path}:{number}: linha de frontmatter que o parser não entende: {line!r}')
        key, value = match.group(1), match.group(2) or ''
        if key in fields:
            raise Refused(f'{path}:{number}: chave {key} repetida')
        if BLOCK_SCALAR.match(value):
            raise Refused(f'{path}:{number}: {key} em bloco > ou | não é suportado; use escalar entre aspas numa linha')
        fields[key] = (number, value)
        nested_ok = value == ''
    return fields, body


def utf8(where, value):
    try:
        value.encode('utf-8')
    except UnicodeEncodeError as exc:
        raise Refused(f'{where} com caractere que não é UTF-8 válido ({exc.reason})')
    return value


def scalar(path, fields, key):
    if key not in fields:
        return None
    number, raw = fields[key]
    where = f'{path}:{number}: {key}'
    return utf8(where, scalar_value(where, raw))


def scalar_value(where, raw):
    if raw == '':
        raise Refused(f'{where} não é um escalar em uma linha')
    if raw.startswith('"'):
        if len(raw) < 2 or not raw.endswith('"'):
            raise Refused(f'{where} entre aspas duplas sem fechamento, ou com algo depois das aspas')
        try:
            value = json.loads(raw)
        except ValueError as exc:
            raise Refused(f'{where} com escape inválido ({exc})')
        if not isinstance(value, str):
            raise Refused(f'{where} não é uma string')
        return value
    if raw.startswith("'"):
        inner = raw[1:-1]
        if len(raw) < 2 or not raw.endswith("'") or "'" in inner.replace("''", ''):
            raise Refused(f'{where} entre aspas simples malformado')
        return inner.replace("''", "'")
    if raw[0] in '[{&*!%@`':
        raise Refused(f'{where} começa com {raw[0]!r}, forma YAML que o parser não entende')
    if ' #' in raw or '\t#' in raw:
        raise Refused(f'{where} com comentário inline; tire o comentário ou ponha o valor entre aspas')
    if ': ' in raw or ':\t' in raw or raw.endswith(':'):
        raise Refused(f'{where} sem aspas contém dois-pontos seguido de espaço; ponha o valor entre aspas')
    return raw


def flag(path, fields, key):
    if key not in fields:
        return False
    number, raw = fields[key]
    if raw not in ('true', 'false'):
        raise Refused(f'{path}:{number}: {key} precisa ser true ou false, sem comentário (recebi {raw!r})')
    return raw == 'true'


def command_template(skill_id):
    return (
        f'Carregue a skill `{skill_id}` com a tool `skill` e siga-a integralmente.\n\n'
        'Argumentos do usuário: $ARGUMENTS\n'
    )


def command_content(skill_id, description):
    return (
        '---\n'
        'description: ' + json.dumps(description, ensure_ascii=False) + '\n'
        '---\n\n' + command_template(skill_id)
    )


readonly_rules = [
    ('*', 'deny'),
    ('read', 'allow'),
    ('grep', 'allow'),
    ('glob', 'allow'),
    ('shell', 'allow'),
    ('external_directory', 'allow'),
]


def agent_content(description, readonly, body):
    out = ['---\n', 'description: ' + json.dumps(description, ensure_ascii=False) + '\n', 'mode: subagent\n']
    if readonly:
        out.append('permissions:\n')
        for action, effect in readonly_rules:
            out.append(f'  - action: {json.dumps(action)}\n')
            out.append('    resource: "*"\n')
            out.append(f'    effect: {effect}\n')
    out.append('---\n\n')
    out.append(body)
    return ''.join(out)


def skill_link_is_ours(abs_path, verb):
    if not os.path.islink(abs_path):
        return False
    target = os.readlink(abs_path).rstrip('/')
    return target.endswith(os.path.join('plugins', 'flux', 'skills', verb))


def read_text(abs_path):
    try:
        with open(abs_path, encoding='utf-8') as handle:
            return handle.read()
    except (OSError, UnicodeDecodeError):
        return None


def load_manifest():
    path = os.path.join(dest, MANIFEST)
    if not os.path.lexists(path):
        return None
    try:
        with open(path, encoding='utf-8') as handle:
            data = json.load(handle)
    except (OSError, ValueError) as exc:
        raise Refused(f'{path}: manifesto de instalação ilegível ({exc}); corrija ou remova o arquivo e rode de novo')
    if not isinstance(data, dict):
        raise Refused(f'{path}: manifesto de instalação não é um objeto JSON')
    listed = set()
    for kind, pattern in OWNED_PATTERNS.items():
        entries = data.get(kind, [])
        if not isinstance(entries, list):
            raise Refused(f'{path}: campo {kind} não é uma lista')
        for rel in entries:
            if (not isinstance(rel, str) or os.path.isabs(rel) or '..' in rel.split('/')
                    or os.path.normpath(rel) != rel or not pattern.match(rel)):
                warnings.append(f'entrada {rel!r} do manifesto ignorada: fora dos caminhos que o instalador gera')
                continue
            listed.add(rel)
    return listed


try:
    verbs = sorted(
        os.path.basename(d) for d in glob.glob(os.path.join(src, 'skills', '*'))
        if os.path.isfile(os.path.join(d, 'SKILL.md'))
    )
    desired = {}
    skill_of_command = {}
    for verb in verbs:
        skill_id = 'flux-' + verb
        skill_md = os.path.join(src, 'skills', verb, 'SKILL.md')
        fields, _ = parse_frontmatter(skill_md)
        description = scalar(skill_md, fields, 'description') or f'flux {verb}'
        link_rel = 'skills/' + skill_id
        command_rel = f'commands/flux/{verb}.md'
        desired[link_rel] = ('link', os.path.join(src, 'skills', verb))
        desired[command_rel] = ('file', command_content(skill_id, description))
        skill_of_command[command_rel] = link_rel
    for agent_file in sorted(glob.glob(os.path.join(src, 'agents', '*.md'))):
        fields, body = parse_frontmatter(agent_file)
        name = scalar(agent_file, fields, 'name') or os.path.splitext(os.path.basename(agent_file))[0]
        if not NAME_RE.match(name):
            raise Refused(f'{agent_file}: name {name!r} não serve como nome de arquivo de agent')
        description = scalar(agent_file, fields, 'description') or name
        readonly = flag(agent_file, fields, 'readonly')
        desired[f'agents/flux-{name}.md'] = ('file', agent_content(description, readonly, body))
    listed = load_manifest()
except Refused as exc:
    print(f'erro: {exc}', file=sys.stderr)
    print(f'nada foi alterado em {dest}.', file=sys.stderr)
    sys.exit(1)


def existing_namespace():
    found = set()
    for entry in glob.glob(os.path.join(dest, 'skills', 'flux-*')):
        found.add('skills/' + os.path.basename(entry))
    for entry in glob.glob(os.path.join(dest, 'commands', 'flux', '*.md')):
        found.add('commands/flux/' + os.path.basename(entry))
    for entry in glob.glob(os.path.join(dest, 'agents', 'flux-*.md')):
        found.add('agents/' + os.path.basename(entry))
    return found


def already_current(rel):
    kind, payload = desired[rel]
    abs_path = os.path.join(dest, rel)
    if kind == 'link':
        return os.path.islink(abs_path) and os.readlink(abs_path) == payload
    return not os.path.islink(abs_path) and os.path.isfile(abs_path) and read_text(abs_path) == payload


def is_ours(rel):
    if listed is None or rel not in listed:
        return False
    abs_path = os.path.join(dest, rel)
    if not os.path.lexists(abs_path):
        return False
    if rel.startswith('skills/'):
        return skill_link_is_ours(abs_path, rel[len('skills/flux-'):])
    return not os.path.islink(abs_path) and os.path.isfile(abs_path)


foreign_items = []


def foreign(abs_path):
    foreign_items.append(abs_path)
    if listed is None:
        return (f'{abs_path} já existe e não há manifesto de instalação em {dest} para provar que é do flux; '
                'tratado como de terceiro')
    return f'{abs_path} já existe e não consta do manifesto de instalação; tratado como de terceiro'


present = existing_namespace()
writes, kept, blocked, orphans = [], [], set(), []
for rel in sorted(desired, key=lambda item: (not item.startswith('skills/'), item)):
    if rel in skill_of_command and skill_of_command[rel] in blocked:
        if is_ours(rel):
            orphans.append(rel)
        continue
    abs_path = os.path.join(dest, rel)
    if not os.path.lexists(abs_path) or (is_ours(rel) and not already_current(rel)):
        writes.append(rel)
    elif already_current(rel):
        kept.append(rel)
    else:
        blocked.add(rel)
        if rel.startswith('skills/'):
            verb = rel[len('skills/flux-'):]
            warnings.append(f'{foreign(abs_path)}; mantido, /flux/{verb} não instalado')
        else:
            warnings.append(f'{foreign(abs_path)}; mantido sem sobrescrever')

for verb in verbs:
    skill_id = 'flux-' + verb
    for other in (os.path.join(home, '.claude', 'skills', skill_id), os.path.join(home, '.agents', 'skills', skill_id)):
        if os.path.lexists(other):
            warnings.append(f'skill {skill_id} também existe em {other}; no OpenCode a última carregada vence')

for rel in sorted(present - set(desired)):
    if is_ours(rel):
        orphans.append(rel)
    else:
        warnings.append(f'{foreign(os.path.join(dest, rel))}; mantido')
if listed is not None:
    for rel in sorted(listed - present - set(desired)):
        warnings.append(f'{rel} consta do manifesto mas não existe mais; esquecido')

for sub in ('skills', os.path.join('commands', 'flux'), 'agents'):
    os.makedirs(os.path.join(dest, sub), exist_ok=True)
for stale in glob.glob(os.path.join(dest, STAGING_PREFIX + '*')):
    if os.path.isdir(stale) and not os.path.islink(stale):
        shutil.rmtree(stale, ignore_errors=True)

staging = tempfile.mkdtemp(prefix=STAGING_PREFIX, dir=dest)
try:
    for index, rel in enumerate(writes):
        kind, payload = desired[rel]
        staged = os.path.join(staging, str(index))
        if kind == 'link':
            os.symlink(payload, staged)
        else:
            with open(staged, 'w', encoding='utf-8') as out:
                out.write(payload)
        os.replace(staged, os.path.join(dest, rel))
    for rel in orphans:
        os.remove(os.path.join(dest, rel))
    installed = set(writes) | set(kept)
    record = {
        'generated_by': 'scripts/install-opencode.sh',
        'source': src,
    }
    for kind in OWNED_PATTERNS:
        record[kind] = sorted(rel for rel in installed if rel.startswith(kind + '/'))
    staged = os.path.join(staging, MANIFEST)
    with open(staged, 'w', encoding='utf-8') as out:
        json.dump(record, out, ensure_ascii=False, indent=2)
        out.write('\n')
    os.replace(staged, os.path.join(dest, MANIFEST))
finally:
    shutil.rmtree(staging, ignore_errors=True)

if listed is None and foreign_items:
    warnings.append(
        f'{dest} não tinha manifesto de instalação, e {len(foreign_items)} item(ns) flux-* que já estavam lá ficaram '
        'como de terceiro. Se vieram de uma instalação anterior do flux, apague-os e rode este script de novo'
    )
for message in warnings:
    print('aviso: ' + message, file=sys.stderr)
if listed is not None:
    origin = 'pelo manifesto anterior'
elif present:
    origin = 'sem manifesto anterior: só o que já era idêntico ao gerado foi adotado'
else:
    origin = 'instalação nova'
print(f'{len(writes)} itens escritos, {len(kept)} já atualizados, {len(orphans)} removidos por não serem mais gerados ({origin})')
print(f"{len(record['skills'])} skills ligadas por symlink, {len(record['commands'])} commands, {len(record['agents'])} agents")
print(f'manifesto de instalação: {os.path.join(dest, MANIFEST)}')
installed_verbs = ['/flux/' + os.path.splitext(os.path.basename(rel))[0] for rel in record['commands']]
if installed_verbs:
    print('verbos instalados: ' + ', '.join(installed_verbs))
else:
    print('nenhum command de verbo instalado')
PY

cat <<EOF

flux instalado em: $DEST
origem:            $SRC

Fallback de raiz, se a sessão não resolver FLUX_ROOT pelo symlink:
  export FLUX_HOME="$SRC"

Reinicie o OpenCode. Se mover o checkout, rode este script de novo.
EOF
