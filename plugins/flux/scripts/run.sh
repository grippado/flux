#!/usr/bin/env bash
set -euo pipefail

umask 077

SCHEMA="flux-run/1"

EX_DEPS=2
EX_STATE=3
EX_INVALID=4
EX_USAGE=64

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCK_DIR=""
TMP_FILE=""

usage() {
    cat << 'EOF'
Uso: bash "${FLUX_ROOT}/scripts/run.sh" <comando> [flags]

Writer determinístico do Flux Run (schema flux-run/1). Grava em
~/.flux/runs/<run_id>/ (ou na raiz de --root / FLUX_RUNS_ROOT): run.md,
NN-<verbo>.md por stage e outcome.md. Permissões 0700 nos diretórios, 0600 nos
arquivos. Não envia nada para fora da máquina.

Comandos:
  start        [--slug S] [--goal TEXTO] [--cli-version V]        imprime o run_id
  stage-start  --run ID --verb V [--writer cli|script|prose]
               [--session-id S] [--pid N] [--target T] [--retry-of N]
               [--harness-value claude-code|cursor|codex|unknown]
               [--harness-source cli-launch|plugin-root-env|unknown]
               [--cap-hint H] [--cap-hard nome:ok|fail]... [--cap-soft nome:ok|fail]...
               [--cap-degradation TEXTO]...                      imprime a sequence (NN)
  stage-set    --run ID --seq N [--model M] [--effort E]
  gate         --run ID --seq N --kind K --decision approved|rejected|delegated|dismissed
               --via askuser|numbered-menu|proxy:--auto|proxy:--from-map [--option TEXTO]
  output       --run ID --seq N --kind K --ref vault:<rel>|url:<url>|git:<ref> [--head-sha SHA]
  stage-summary --run ID --seq N          (texto do resumo no stdin, até 4096 bytes)
  stage-end    --run ID --seq N --status completed|failed|cancelled [--exit-code N]
  end          --run ID [--result completed|failed|cancelled]

Flags comuns: --root DIR (padrão: $FLUX_RUNS_ROOT ou ~/.flux/runs).

Códigos de saída: 0 ok; 2 dependência ausente; 3 estado inválido (run ou stage
inexistente, run já encerrado); 4 valor recusado (path absoluto, enum inválido);
64 uso inválido.
EOF
}

die() {
    local code="$1"
    shift
    printf 'run.sh: %s\n' "$*" >&2
    exit "$code"
}

cleanup() {
    if [ -n "$TMP_FILE" ] && [ -e "$TMP_FILE" ]; then
        rm -f "$TMP_FILE"
    fi
    if [ -n "$LOCK_DIR" ] && [ -d "$LOCK_DIR" ]; then
        rm -rf "$LOCK_DIR"
    fi
}
trap cleanup EXIT

for tool in awk sed date mktemp od tr; do
    command -v "$tool" > /dev/null 2>&1 || die "$EX_DEPS" "$tool não encontrado no PATH."
done

now_iso() {
    date +%Y-%m-%dT%H:%M:%S%z | sed -E 's/([+-][0-9]{2})([0-9]{2})$/\1:\2/'
}

rand_hex4() {
    od -An -N2 -tx1 /dev/urandom | tr -d ' \n'
}

slugify() {
    printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' | cut -c1-40 | sed -E 's/-+$//'
}

yaml_str() {
    local s
    s="$(printf '%s' "$1" | tr '\n\r\t' '   ' | LC_ALL=C tr -d '\000-\010\013\014\016-\037\177' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
    printf '"%s"' "$s"
}

yaml_scalar() {
    local lower
    lower="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
    if [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]] && ! [[ "$lower" =~ ^(null|true|false|yes|no|on|off|y|n)$ ]] && ! [[ "$1" =~ ^[-+]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][-+]?[0-9]+)?$ ]]; then
        printf '%s' "$1"
    else
        yaml_str "$1"
    fi
}

plugin_version() {
    local manifest="$HERE/../.claude-plugin/plugin.json" v=""
    if [ -r "$manifest" ]; then
        v="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest" | head -1)"
    fi
    printf '%s' "${v:-unknown}"
}

PATH_DELIM='(^|[[:space:]"'"'"'(,=[])'
DRIVE_RE='(^|[^A-Za-z])[A-Za-z]:[\\/]'
UNC_RE="\\\\\\\\"
RE_ABS_PATH="${PATH_DELIM}(/([^[:space:]]|\$)|~(/|\$))|file://|${DRIVE_RE}|${UNC_RE}"
RE_NARROW_PATH="${PATH_DELIM}(/(Users|home|var|private|tmp|etc|opt|root|mnt|srv)/|~/)|file://|${DRIVE_RE}|${UNC_RE}"
RE_SECRET='gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY|[Bb]earer [A-Za-z0-9._~+/=-]{20,}'

reject_secret() {
    if printf '%s\n' "$2" | grep -Eq -e "$RE_SECRET"; then
        die "$EX_INVALID" "$1 parece conter um segredo: recusado."
    fi
}

reject_abs_path() {
    if printf '%s\n' "$2" | grep -Eq -e "$RE_ABS_PATH"; then
        die "$EX_INVALID" "$1 contém path absoluto: recusado (o run guarda só referências relativas)."
    fi
    reject_secret "$1" "$2"
}

reject_unsafe_text() {
    if printf '%s\n' "$2" | grep -Eq -e "$RE_NARROW_PATH"; then
        die "$EX_INVALID" "$1 contém path absoluto: recusado (descreva sem citar o caminho)."
    fi
    reject_secret "$1" "$2"
}

GATE_KINDS=" github-post commit-push issue-write slack-write pr-open write-outside write-manifest ambiguous-target "
OUTPUT_KINDS=" review board pr issue "

require_kind() {
    case "$3" in
        gate) [[ "$GATE_KINDS" == *" $2 "* ]] || die "$EX_INVALID" "$1 fora do vocabulário de gates:$GATE_KINDS" ;;
        output) [[ "$OUTPUT_KINDS" == *" $2 "* ]] || die "$EX_INVALID" "$1 fora do vocabulário de outputs:$OUTPUT_KINDS" ;;
    esac
}

REQUIRE_ACTIVE=1
ROOT=""
RUN=""
SEQ=""
VERB=""
SLUG=""
GOAL=""
CLI_VERSION=""
WRITER="script"
SESSION_ID=""
PID_VALUE=""
TARGET=""
RETRY_OF=""
HARNESS_VALUE="unknown"
HARNESS_SOURCE="unknown"
CAP_HINT=""
CAP_HARD=""
CAP_SOFT=""
CAP_DEG=""
MODEL=""
EFFORT=""
KIND=""
DECISION=""
VIA=""
OPTION=""
REF=""
HEAD_SHA=""
STATUS=""
EXIT_CODE=""
RESULT=""

need_value() {
    [ "$#" -ge 2 ] || die "$EX_USAGE" "flag $1 requer um valor."
}

parse_flags() {
    while [ "$#" -gt 0 ]; do
        need_value "$@"
        case "$1" in
            --root) ROOT="$2" ;;
            --run) RUN="$2" ;;
            --seq) SEQ="$2" ;;
            --verb) VERB="$2" ;;
            --slug) SLUG="$2" ;;
            --goal) GOAL="$2" ;;
            --cli-version) CLI_VERSION="$2" ;;
            --writer) WRITER="$2" ;;
            --session-id) SESSION_ID="$2" ;;
            --pid) PID_VALUE="$2" ;;
            --target) TARGET="$2" ;;
            --retry-of) RETRY_OF="$2" ;;
            --harness-value) HARNESS_VALUE="$2" ;;
            --harness-source) HARNESS_SOURCE="$2" ;;
            --cap-hint) CAP_HINT="$2" ;;
            --cap-hard) CAP_HARD="${CAP_HARD}${2}"$'\n' ;;
            --cap-soft) CAP_SOFT="${CAP_SOFT}${2}"$'\n' ;;
            --cap-degradation) CAP_DEG="${CAP_DEG}${2}"$'\n' ;;
            --model) MODEL="$2" ;;
            --effort) EFFORT="$2" ;;
            --kind) KIND="$2" ;;
            --decision) DECISION="$2" ;;
            --via) VIA="$2" ;;
            --option) OPTION="$2" ;;
            --ref) REF="$2" ;;
            --head-sha) HEAD_SHA="$2" ;;
            --status) STATUS="$2" ;;
            --exit-code) EXIT_CODE="$2" ;;
            --result) RESULT="$2" ;;
            *) die "$EX_USAGE" "flag desconhecida: $1" ;;
        esac
        shift 2
    done
}

runs_root() {
    printf '%s' "${ROOT:-${FLUX_RUNS_ROOT:-$HOME/.flux/runs}}"
}

ensure_root() {
    local root
    root="$(runs_root)"
    if [ ! -d "$root" ]; then
        mkdir -p "$root"
        chmod 700 "$root"
    fi
}

require_run() {
    [ -n "$RUN" ] || die "$EX_USAGE" "--run é obrigatório."
    [[ "$RUN" =~ ^[0-9]{8}T[0-9]{6}Z_[a-z0-9-]+_[0-9a-f]{4}$ ]] || die "$EX_INVALID" "run_id inválido: $RUN"
    RUN_DIR="$(runs_root)/$RUN"
    [ -d "$RUN_DIR" ] || die "$EX_STATE" "run inexistente: $RUN"
    if [ "$REQUIRE_ACTIVE" = "1" ]; then
        [ -f "$RUN_DIR/run.md" ] || die "$EX_STATE" "run.md ausente em $RUN"
        [ "$(fm_get status "$RUN_DIR/run.md")" = "active" ] || die "$EX_STATE" "run já encerrado: $RUN"
    fi
}

require_seq() {
    [ -n "$SEQ" ] || die "$EX_USAGE" "--seq é obrigatório."
    [[ "$SEQ" =~ ^[0-9]{1,3}$ ]] || die "$EX_INVALID" "sequence inválida: $SEQ"
}

stage_file() {
    local n f
    n="$(printf '%02d' "$((10#$1))")"
    for f in "$RUN_DIR/$n"-*.md; do
        if [ -e "$f" ]; then
            printf '%s\n' "$f"
            return 0
        fi
    done
    return 1
}

require_stage() {
    require_run
    require_seq
    STAGE_FILE="$(stage_file "$SEQ")" || die "$EX_STATE" "stage inexistente: $SEQ em $RUN"
}

write_atomic() {
    local dest="$1"
    TMP_FILE="$(mktemp "$(dirname "$dest")/.tmp.XXXXXX")"
    cat > "$TMP_FILE"
    mv "$TMP_FILE" "$dest"
    TMP_FILE=""
}

fm_lines() {
    awk '
        NR == 1 && $0 == "---" { fm = 1; next }
        fm == 1 && $0 == "---" { exit }
        fm == 1 { print }
    ' "$1"
}

fm_get() {
    fm_lines "$2" | sed -n "s/^$1: *//p" | head -1
}

set_scalar() {
    local file="$1" key="$2" value="$3" out
    out="$(mktemp "$(dirname "$file")/.tmp.XXXXXX")"
    TMP_FILE="$out"
    K="$key" V="$value" awk '
        BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"]; fm = 0; done = 0 }
        NR == 1 && $0 == "---" { fm = 1; print; next }
        fm == 1 && $0 == "---" { fm = 2 }
        fm == 1 && !done && index($0, k ":") == 1 { print k ": " v; done = 1; next }
        { print }
        END { if (!done) exit 3 }
    ' "$file" > "$out" || die "$EX_STATE" "campo $key ausente em $file"
    mv "$out" "$file"
    TMP_FILE=""
}

append_item() {
    local file="$1" key="$2" item="$3" out
    out="$(mktemp "$(dirname "$file")/.tmp.XXXXXX")"
    TMP_FILE="$out"
    K="$key" ITEM="$item" awk '
        BEGIN { k = ENVIRON["K"]; item = ENVIRON["ITEM"]; fm = 0; st = 0 }
        NR == 1 && $0 == "---" { fm = 1; print; next }
        fm == 1 && st == 0 && $0 == k ": []" { print k ":"; print item; st = 2; next }
        fm == 1 && st == 0 && $0 == k ":" { print; st = 1; next }
        fm == 1 && st == 1 && /^[ \t]/ { print; next }
        fm == 1 && st == 1 { print item; st = 2 }
        fm == 1 && $0 == "---" { fm = 2 }
        { print }
        END { if (st == 0) exit 3 }
    ' "$file" > "$out" || die "$EX_STATE" "campo $key ausente em $file"
    mv "$out" "$file"
    TMP_FILE=""
}

mtime_of() {
    stat -c '%Y' "$1" 2> /dev/null || stat -f '%m' "$1" 2> /dev/null || printf '0'
}

drop_stale_lock() {
    if mv "$RUN_DIR/.lock" "$RUN_DIR/.lock.stale.$$" 2> /dev/null; then
        rm -rf "$RUN_DIR/.lock.stale.$$"
    fi
}

acquire_lock() {
    local tries=0 holder age
    LOCK_DIR=""
    while ! mkdir "$RUN_DIR/.lock" 2> /dev/null; do
        holder="$(cat "$RUN_DIR/.lock/pid" 2> /dev/null || true)"
        if [ -n "$holder" ]; then
            if ! kill -0 "$holder" 2> /dev/null; then
                drop_stale_lock
                continue
            fi
        else
            age=$(($(date +%s) - $(mtime_of "$RUN_DIR/.lock")))
            if [ "$age" -ge 5 ]; then
                drop_stale_lock
                continue
            fi
        fi
        tries=$((tries + 1))
        [ "$tries" -le 100 ] || die "$EX_STATE" "lock do run ocupado (pid $holder)."
        sleep 0.1
    done
    LOCK_DIR="$RUN_DIR/.lock"
    printf '%s\n' "$$" > "$LOCK_DIR/pid"
}

release_lock() {
    if [ -n "$LOCK_DIR" ]; then
        rm -rf "$LOCK_DIR"
        LOCK_DIR=""
    fi
}

next_sequence() {
    local f base n max=0
    for f in "$RUN_DIR"/[0-9][0-9]*-*.md; do
        [ -e "$f" ] || continue
        base="$(basename "$f")"
        n="${base%%-*}"
        [[ "$n" =~ ^[0-9]+$ ]] || continue
        if [ "$((10#$n))" -gt "$max" ]; then
            max="$((10#$n))"
        fi
    done
    printf '%s' "$((max + 1))"
}

cap_list() {
    local items="$1" line name state ok
    if [ -z "$items" ]; then
        printf ' []\n'
        return
    fi
    printf '\n'
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        name="${line%:*}"
        state="${line##*:}"
        [[ "$name" =~ ^[A-Za-z0-9_./-]+$ ]] || die "$EX_INVALID" "nome de capacidade inválido: $name"
        [[ "$name" != /* && "$name" != "~"* ]] || die "$EX_INVALID" "nome de capacidade com path absoluto: $name"
        case "$state" in
            ok) ok=true ;;
            fail) ok=false ;;
            *) die "$EX_INVALID" "estado de capacidade inválido: $line (use nome:ok|fail)" ;;
        esac
        printf '    - {name: %s, ok: %s}\n' "$name" "$ok"
    done <<< "$items"
}

deg_list() {
    local line
    if [ -z "$CAP_DEG" ]; then
        printf ' []\n'
        return
    fi
    printf '\n'
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        reject_abs_path "degradação" "$line"
        printf '    - %s\n' "$(yaml_str "$line")"
    done <<< "$CAP_DEG"
}

cmd_start() {
    parse_flags "$@"
    local slug id dir started goal cli_version
    [[ "$SLUG" != *[/\\~]* ]] || die "$EX_INVALID" "--slug com path ou til: recusado."
    slug="$(slugify "${SLUG:-run}")"
    [ -n "$slug" ] || slug="run"
    ensure_root
    id="$(date -u +%Y%m%dT%H%M%SZ)_${slug}_$(rand_hex4)"
    dir="$(runs_root)/$id"
    mkdir -m 700 "$dir" || die "$EX_STATE" "não foi possível criar $dir (colisão de run_id?)"
    started="$(now_iso)"
    if [ -n "$GOAL" ]; then goal="$(yaml_str "$GOAL")"; else goal="null"; fi
    if [ -n "$CLI_VERSION" ]; then cli_version="$(yaml_scalar "$CLI_VERSION")"; else cli_version="null"; fi
    {
        printf -- '---\n'
        printf 'schema: %s\n' "$SCHEMA"
        printf 'run_id: %s\n' "$id"
        printf 'status: active\n'
        printf 'goal: %s\n' "$goal"
        printf 'started_at: %s\n' "$started"
        printf 'ended_at: null\n'
        printf 'flux_version: %s\n' "$(yaml_scalar "$(plugin_version)")"
        printf 'cli_version: %s\n' "$cli_version"
        printf -- '---\n'
    } | write_atomic "$dir/run.md"
    printf '%s\n' "$id"
}

cmd_stage_start() {
    parse_flags "$@"
    require_run
    [[ "$VERB" =~ ^[a-z]+$ ]] || die "$EX_USAGE" "--verb inválido ou ausente."
    case "$WRITER" in cli | script | prose) ;; *) die "$EX_INVALID" "--writer inválido: $WRITER" ;; esac
    case "$HARNESS_VALUE" in claude-code | cursor | codex | unknown) ;; *) die "$EX_INVALID" "--harness-value inválido: $HARNESS_VALUE" ;; esac
    case "$HARNESS_SOURCE" in cli-launch | plugin-root-env | unknown) ;; *) die "$EX_INVALID" "--harness-source inválido: $HARNESS_SOURCE" ;; esac
    [ -z "$SESSION_ID" ] || [[ "$SESSION_ID" =~ ^[a-z0-9]+-[0-9a-f]{8}$ ]] || die "$EX_INVALID" "--session-id inválido: $SESSION_ID"
    [ -z "$PID_VALUE" ] || [[ "$PID_VALUE" =~ ^[0-9]+$ ]] || die "$EX_INVALID" "--pid inválido: $PID_VALUE"
    [ -z "$TARGET" ] || reject_abs_path "--target" "$TARGET"
    [ -z "$CAP_HINT" ] || [[ "$CAP_HINT" =~ ^[A-Za-z-]+$ ]] || die "$EX_INVALID" "--cap-hint inválido: $CAP_HINT"
    local hard_block soft_block deg_block seq file started session pid target retry hint
    hard_block="$(cap_list "$CAP_HARD")"
    soft_block="$(cap_list "$CAP_SOFT")"
    deg_block="$(deg_list)"
    acquire_lock
    seq="$(next_sequence)"
    if [ -n "$RETRY_OF" ]; then
        [[ "$RETRY_OF" =~ ^[0-9]{1,3}$ ]] || die "$EX_INVALID" "--retry-of inválido: $RETRY_OF"
        stage_file "$RETRY_OF" > /dev/null || die "$EX_STATE" "--retry-of aponta para stage inexistente: $RETRY_OF"
        retry="$((10#$RETRY_OF))"
    else
        retry="null"
    fi
    file="$RUN_DIR/$(printf '%02d' "$seq")-$VERB.md"
    started="$(now_iso)"
    if [ -n "$SESSION_ID" ]; then session="$SESSION_ID"; else session="null"; fi
    if [ -n "$PID_VALUE" ]; then pid="$PID_VALUE"; else pid="null"; fi
    if [ -n "$TARGET" ]; then target="$(yaml_str "$TARGET")"; else target="null"; fi
    if [ -n "$CAP_HINT" ]; then hint="$CAP_HINT"; else hint="unknown"; fi
    {
        printf -- '---\n'
        printf 'schema: %s\n' "$SCHEMA"
        printf 'run_id: %s\n' "$RUN"
        printf 'sequence: %s\n' "$seq"
        printf 'verb: %s\n' "$VERB"
        printf 'retry_of: %s\n' "$retry"
        printf 'status: running\n'
        printf 'started_at: %s\n' "$started"
        printf 'finished_at: null\n'
        printf 'exit_code: null\n'
        printf 'writer: %s\n' "$WRITER"
        printf 'session_id: %s\n' "$session"
        printf 'pid: %s\n' "$pid"
        printf 'harness:\n'
        printf '  value: %s\n' "$HARNESS_VALUE"
        printf '  source: %s\n' "$HARNESS_SOURCE"
        printf 'model: unknown\n'
        printf 'effort: unknown\n'
        printf 'target: %s\n' "$target"
        printf 'capabilities:\n'
        printf '  level_cli_hint: %s\n' "$hint"
        printf '  hard:%s\n' "$hard_block"
        printf '  soft:%s\n' "$soft_block"
        printf '  degradations:%s\n' "$deg_block"
        printf 'gates: []\n'
        printf 'outputs: []\n'
        printf -- '---\n'
        printf '\n## Resumo\n\n_sem resumo registrado_\n'
    } | write_atomic "$file"
    release_lock
    printf '%s\n' "$(printf '%02d' "$seq")"
}

cmd_stage_set() {
    parse_flags "$@"
    require_stage
    [ -n "$MODEL" ] || [ -n "$EFFORT" ] || die "$EX_USAGE" "informe --model e/ou --effort."
    [ -z "$MODEL" ] || [ "${#MODEL}" -le 80 ] || die "$EX_INVALID" "--model longo demais."
    [ -z "$EFFORT" ] || [ "${#EFFORT}" -le 80 ] || die "$EX_INVALID" "--effort longo demais."
    [ -z "$MODEL" ] || reject_abs_path "--model" "$MODEL"
    [ -z "$EFFORT" ] || reject_abs_path "--effort" "$EFFORT"
    acquire_lock
    if [ -n "$MODEL" ]; then
        set_scalar "$STAGE_FILE" model "$(yaml_scalar "$MODEL")"
    fi
    if [ -n "$EFFORT" ]; then
        set_scalar "$STAGE_FILE" effort "$(yaml_scalar "$EFFORT")"
    fi
    release_lock
}

cmd_gate() {
    parse_flags "$@"
    require_stage
    require_kind "--kind" "$KIND" gate
    case "$DECISION" in approved | rejected | delegated | dismissed) ;; *) die "$EX_INVALID" "--decision inválida: $DECISION" ;; esac
    case "$VIA" in askuser | numbered-menu | proxy:--auto | proxy:--from-map) ;; *) die "$EX_INVALID" "--via inválido: $VIA" ;; esac
    [ "${#OPTION}" -le 120 ] || die "$EX_INVALID" "--option longo demais."
    local item
    item="  - kind: $KIND"$'\n'"    decision: $DECISION"$'\n'"    at: $(now_iso)"$'\n'"    via: $VIA"
    if [ -n "$OPTION" ]; then
        reject_abs_path "--option" "$OPTION"
        item="$item"$'\n'"    option: $(yaml_str "$OPTION")"
    fi
    acquire_lock
    append_item "$STAGE_FILE" gates "$item"
    release_lock
}

cmd_output() {
    parse_flags "$@"
    require_stage
    require_kind "--kind" "$KIND" output
    case "$REF" in
        vault:* | url:* | git:*) ;;
        *) die "$EX_INVALID" "--ref deve começar com vault:, url: ou git: (recebido: $REF)" ;;
    esac
    local rest="${REF#*:}"
    [ -n "$rest" ] || die "$EX_INVALID" "--ref vazio."
    case "$REF" in
        vault:* | git:*)
            [[ "$rest" != /* && "$rest" != "~"* ]] || die "$EX_INVALID" "--ref com path absoluto: $REF"
            [[ ! "$rest" =~ (^|/)\.\.(/|$) ]] || die "$EX_INVALID" "--ref com '..': $REF"
            ;;
    esac
    rest="${rest#http://}"
    rest="${rest#https://}"
    reject_abs_path "--ref" "$rest"
    [ -z "$HEAD_SHA" ] || [[ "$HEAD_SHA" =~ ^[0-9a-f]{7,40}$ ]] || die "$EX_INVALID" "--head-sha inválido: $HEAD_SHA"
    local item
    item="  - kind: $KIND"$'\n'"    ref: $(yaml_str "$REF")"
    if [ -n "$HEAD_SHA" ]; then
        item="$item"$'\n'"    head_sha: $HEAD_SHA"
    fi
    acquire_lock
    append_item "$STAGE_FILE" outputs "$item"
    release_lock
}

cmd_stage_summary() {
    parse_flags "$@"
    require_stage
    local text out
    text="$(head -c 4096)"
    if command -v iconv > /dev/null 2>&1; then
        text="$(printf '%s' "$text" | iconv -f UTF-8 -t UTF-8 -c 2> /dev/null || printf '%s' "$text")"
    fi
    text="$(printf '%s' "$text" | LC_ALL=C tr -d '\000-\010\013\014\016-\037\177')"
    [ -n "$text" ] || die "$EX_USAGE" "resumo vazio no stdin."
    reject_unsafe_text "resumo" "$text"
    acquire_lock
    out="$(mktemp "$(dirname "$STAGE_FILE")/.tmp.XXXXXX")"
    TMP_FILE="$out"
    {
        awk '
            NR == 1 && $0 == "---" { fm = 1; print; next }
            fm == 1 && $0 == "---" { print; exit }
            fm == 1 { print }
        ' "$STAGE_FILE"
        printf '\n## Resumo\n\n%s\n' "$text"
    } > "$out"
    mv "$out" "$STAGE_FILE"
    TMP_FILE=""
    release_lock
}

cmd_stage_end() {
    parse_flags "$@"
    require_stage
    case "$STATUS" in completed | failed | cancelled) ;; *) die "$EX_INVALID" "--status inválido: $STATUS" ;; esac
    [ -z "$EXIT_CODE" ] || [[ "$EXIT_CODE" =~ ^[0-9]{1,3}$ ]] || die "$EX_INVALID" "--exit-code inválido: $EXIT_CODE"
    acquire_lock
    if [ "$(fm_get status "$STAGE_FILE")" != "running" ]; then
        release_lock
        printf 'run.sh: stage %s já encerrada (%s); a primeira conclusão vale.\n' "$SEQ" "$(fm_get status "$STAGE_FILE")" >&2
        return 0
    fi
    set_scalar "$STAGE_FILE" status "$STATUS"
    set_scalar "$STAGE_FILE" finished_at "$(now_iso)"
    set_scalar "$STAGE_FILE" exit_code "${EXIT_CODE:-null}"
    release_lock
}

stage_files() {
    local f
    for f in "$RUN_DIR"/[0-9][0-9]*-*.md; do
        [ -e "$f" ] && printf '%s\n' "$f"
    done
    return 0
}

cmd_end() {
    parse_flags "$@"
    require_run
    local f s n_completed=0 n_failed=0 n_cancelled=0 n_running=0 total=0
    local g_approved=0 g_rejected=0 g_delegated=0 g_dismissed=0 d
    local outputs_block="" seq base ended result run_status
    while IFS= read -r f; do
        [ -n "$f" ] || continue
        total=$((total + 1))
        s="$(fm_get status "$f")"
        case "$s" in
            completed) n_completed=$((n_completed + 1)) ;;
            failed) n_failed=$((n_failed + 1)) ;;
            cancelled) n_cancelled=$((n_cancelled + 1)) ;;
            *) n_running=$((n_running + 1)) ;;
        esac
        while IFS= read -r d; do
            case "$d" in
                approved) g_approved=$((g_approved + 1)) ;;
                rejected) g_rejected=$((g_rejected + 1)) ;;
                delegated) g_delegated=$((g_delegated + 1)) ;;
                dismissed) g_dismissed=$((g_dismissed + 1)) ;;
            esac
        done < <(fm_lines "$f" | sed -n 's/^    decision: //p')
        base="$(basename "$f")"
        seq="$((10#${base%%-*}))"
        outputs_block="${outputs_block}$(fm_lines "$f" | STAGE_SEQ="$seq" awk '
            /^outputs:/ { inb = 1; next }
            inb && /^[ \t]/ {
                if ($0 ~ /^  - /) { print "  - stage: " ENVIRON["STAGE_SEQ"]; print "    " substr($0, 5) }
                else { print }
                next
            }
            inb { inb = 0 }
        ')"$'\n'
    done < <(stage_files)
    if [ -n "$RESULT" ]; then
        case "$RESULT" in completed | failed | cancelled) result="$RESULT" ;; *) die "$EX_INVALID" "--result inválido: $RESULT" ;; esac
    elif [ "$n_failed" -gt 0 ] || [ "$n_running" -gt 0 ]; then
        result="failed"
    elif [ "$n_cancelled" -gt 0 ]; then
        result="cancelled"
    else
        result="completed"
    fi
    if [ "$result" = "failed" ]; then run_status="failed"; else run_status="completed"; fi
    ended="$(now_iso)"
    outputs_block="$(printf '%s' "$outputs_block" | sed '/^$/d')"
    {
        printf -- '---\n'
        printf 'schema: %s\n' "$SCHEMA"
        printf 'run_id: %s\n' "$RUN"
        printf 'result: %s\n' "$result"
        printf 'ended_at: %s\n' "$ended"
        printf 'stages:\n'
        printf '  completed: %s\n  failed: %s\n  cancelled: %s\n  running: %s\n' "$n_completed" "$n_failed" "$n_cancelled" "$n_running"
        printf 'gates:\n'
        printf '  approved: %s\n  rejected: %s\n  delegated: %s\n  dismissed: %s\n' "$g_approved" "$g_rejected" "$g_delegated" "$g_dismissed"
        if [ -n "$outputs_block" ]; then
            printf 'outputs:\n%s\n' "$outputs_block"
        else
            printf 'outputs: []\n'
        fi
        printf -- '---\n'
        printf '\n## Resultado\n\n'
        printf 'Run %s terminou como **%s**: %s stage(s), %s gate(s) humano(s).\n' "\`$RUN\`" "$result" "$total" "$((g_approved + g_rejected + g_delegated + g_dismissed))"
        printf 'Este arquivo só consolida o que está nas stages: início, fim e exit code vêm de quem abriu a stage (campo writer); gates, outputs, model, effort e resumo são informados pelo modelo e gravados pelo writer.\n'
        if [ "$n_running" -gt 0 ]; then
            printf '\nHavia %s stage(s) ainda em running no encerramento: tratadas como interrompidas.\n' "$n_running"
        fi
    } | write_atomic "$RUN_DIR/outcome.md"
    set_scalar "$RUN_DIR/run.md" status "$run_status"
    set_scalar "$RUN_DIR/run.md" ended_at "$ended"
}

main() {
    if [ "$#" -eq 0 ]; then
        usage >&2
        exit "$EX_USAGE"
    fi
    local cmd="$1"
    shift
    case "$cmd" in
        -h | --help | help) usage ;;
        start) cmd_start "$@" ;;
        stage-start) cmd_stage_start "$@" ;;
        stage-set) cmd_stage_set "$@" ;;
        gate) cmd_gate "$@" ;;
        output) cmd_output "$@" ;;
        stage-summary) cmd_stage_summary "$@" ;;
        stage-end) cmd_stage_end "$@" ;;
        end) cmd_end "$@" ;;
        *) die "$EX_USAGE" "comando desconhecido: $cmd" ;;
    esac
}

main "$@"
