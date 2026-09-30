#!/usr/bin/env bash
set -euo pipefail

FAST_INTERVAL=270
SLOW_INTERVAL=1200
MAX_ROUND=8
MAX_SECONDS=21600
QUIET_TO_SETTLE=2
GH_ATTEMPTS=3
GH_BACKOFF_STEP=2

EX_ACTION=0
EX_DONE=10
EX_SETTLED=11
EX_BLOCKED=12
EX_LIMIT=13
EX_LOCK=14
EX_DEPS=2
EX_GH=3
EX_USAGE=64

PR=""
REPO=""
STATE=""
FAST=0
ONCE_POLL=0

STATE_DIR=""
GATE_STATE=""
LOCK=""
LOCK_HELD=0
ERRF=""
SLEEP_PID=""
GH_LAST_ERR=""

VIEW_STATE=""
SHA=""
BASE_SHA=""
MERGEABLE=""
PR_AUTHOR=""
CI=""
ME=""
LLM="{}"
DELTA_THREADS="[]"
DELTA_COMMENTS="[]"

log() {
    printf 'iterate-watch-gate: %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

usage() {
    cat >&2 <<'EOF'
uso: iterate-watch-gate.sh --pr N --repo owner/repo [--state arquivo] [--fast] [--once-poll]

stdout: um JSON por linha {ts,event,pr,sha,ci,mergeable,delta,detail}; diagnostico em stderr.

codigos de saida:
   0  evento acionavel (nova-rodada, ci-vermelho, conflito-novo, drift) ou, com --once-poll, poll ocioso
  10  PR mergeada ou fechada
  11  assentou
  12  conflito degradado sem saida
  13  limite (round > 8 ou ~6h)
   2  falta gh ou jq
   3  gh falhou depois de 3 tentativas (evento erro-gh)
  14  ja existe um gate rodando nesta PR
  64  uso invalido, estado ilegivel ou intervalo recusado
EOF
}

die_usage() {
    log "$*"
    usage
    exit "$EX_USAGE"
}

cleanup() {
    local rc=$?
    trap - EXIT
    if [ -n "$SLEEP_PID" ]; then
        kill "$SLEEP_PID" 2>/dev/null || true
    fi
    if [ "$LOCK_HELD" = 1 ]; then
        rm -rf "$LOCK"
    fi
    if [ -n "$ERRF" ]; then
        rm -f "$ERRF" "$ERRF.detail"
    fi
    exit "$rc"
}

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --pr)
                [ $# -ge 2 ] || die_usage "--pr exige um valor"
                PR="$2"
                shift 2
                ;;
            --repo)
                [ $# -ge 2 ] || die_usage "--repo exige um valor"
                REPO="$2"
                shift 2
                ;;
            --state)
                [ $# -ge 2 ] || die_usage "--state exige um valor"
                STATE="$2"
                shift 2
                ;;
            --fast)
                FAST=1
                shift
                ;;
            --once-poll)
                ONCE_POLL=1
                shift
                ;;
            -h | --help)
                usage
                exit 0
                ;;
            *)
                die_usage "argumento desconhecido: $1"
                ;;
        esac
    done
    case "$PR" in
        '' | *[!0-9]*) die_usage "--pr deve ser um numero inteiro" ;;
    esac
    case "$REPO" in
        */*/* | /* | */ | '') die_usage "--repo deve ter a forma owner/repo" ;;
        */*) ;;
        *) die_usage "--repo deve ter a forma owner/repo" ;;
    esac
}

check_deps() {
    local missing=""
    local tool
    for tool in gh jq; do
        if ! command -v "$tool" > /dev/null 2>&1; then
            missing="$missing $tool"
        fi
    done
    if [ -z "$STATE" ] && ! command -v git > /dev/null 2>&1; then
        missing="$missing git"
    fi
    if [ -n "$missing" ]; then
        log "dependencia ausente:$missing"
        exit "$EX_DEPS"
    fi
}

resolve_paths() {
    local common
    if [ -z "$STATE" ]; then
        if ! common=$(git rev-parse --git-common-dir 2> /dev/null); then
            die_usage "fora de um repositorio git e sem --state"
        fi
        common=$(cd "$common" && pwd -P)
        STATE="$common/flux-watch-pr-$PR.json"
    fi
    STATE_DIR=$(dirname "$STATE")
    GATE_STATE="$STATE_DIR/flux-watch-gate-pr-$PR.json"
    LOCK="$STATE_DIR/flux-watch-gate-pr-$PR.lock"
}

acquire_lock() {
    local owner=""
    if ! mkdir "$LOCK" 2> /dev/null; then
        owner=$(cat "$LOCK/pid" 2> /dev/null || true)
        if [ -z "$owner" ]; then
            sleep 1
            owner=$(cat "$LOCK/pid" 2> /dev/null || true)
        fi
        if [ -n "$owner" ] && kill -0 "$owner" 2> /dev/null; then
            log "ja existe um gate na PR #$PR (dono pid=$owner); recusado"
            exit "$EX_LOCK"
        fi
        log "lock orfao de pid=${owner:-desconhecido}; recuperando"
        rm -rf "$LOCK"
        if ! mkdir "$LOCK" 2> /dev/null; then
            log "outro gate assumiu o lock da PR #$PR; recusado"
            exit "$EX_LOCK"
        fi
    fi
    LOCK_HELD=1
    printf '%s\n' "$$" > "$LOCK/pid"
}

pause() {
    sleep "$1"
}

gate_sleep() {
    local n=$1
    case "$n" in
        "$FAST_INTERVAL" | "$SLOW_INTERVAL") ;;
        300)
            log "intervalo 300s recusado: pior dos dois mundos (validos: $FAST_INTERVAL, $SLOW_INTERVAL)"
            exit "$EX_USAGE"
            ;;
        *)
            log "intervalo ${n}s recusado (validos: $FAST_INTERVAL, $SLOW_INTERVAL)"
            exit "$EX_USAGE"
            ;;
    esac
    log "dormindo ${n}s"
    sleep "$n" &
    SLEEP_PID=$!
    wait "$SLEEP_PID" || true
    SLEEP_PID=""
}

ghx() {
    local mode=$1 check=$2
    shift 2
    local attempt=1 out rc err
    while :; do
        rc=0
        out=$(gh "$@" 2> "$ERRF") || rc=$?
        err=$(tr '\n' ' ' < "$ERRF" | cut -c1-200)
        if [ "$mode" = loose ] && [ -z "$out" ] && printf '%s' "$err" | grep -q "no checks reported"; then
            printf '[]\n'
            return 0
        fi
        if { [ "$rc" -eq 0 ] || [ "$mode" = loose ]; } && printf '%s' "$out" | jq -e "$check" > /dev/null 2>&1; then
            printf '%s\n' "$out"
            return 0
        fi
        GH_LAST_ERR="gh $1 $2 rc=$rc: ${err:-saida invalida}"
        printf '%s' "$GH_LAST_ERR" > "$ERRF.detail"
        if [ "$attempt" -ge "$GH_ATTEMPTS" ]; then
            return 1
        fi
        log "gh falhou (tentativa $attempt/$GH_ATTEMPTS): $GH_LAST_ERR"
        pause $((GH_BACKOFF_STEP * attempt))
        attempt=$((attempt + 1))
    done
}

gh_fail() {
    GH_LAST_ERR=$(cat "$ERRF.detail" 2> /dev/null || true)
    log "gh falhou apos $GH_ATTEMPTS tentativas: $GH_LAST_ERR"
    emit erro-gh "$GH_LAST_ERR"
    exit "$EX_GH"
}

emit() {
    local event=$1 detail=$2
    jq -cn \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg event "$event" \
        --argjson pr "$PR" \
        --arg sha "$SHA" \
        --arg ci "$CI" \
        --arg mergeable "$MERGEABLE" \
        --argjson threads "$DELTA_THREADS" \
        --argjson comments "$DELTA_COMMENTS" \
        --arg detail "$detail" \
        '{ts: $ts, event: $event, pr: $pr,
          sha: (if $sha == "" then null else $sha end),
          ci: (if $ci == "" then null else $ci end),
          mergeable: (if $mergeable == "" then null else $mergeable end),
          delta: {threads: $threads, comments: $comments},
          detail: $detail}'
}

lf() {
    jq -r "$1" <<< "$LLM"
}

load_llm_state() {
    if [ -f "$STATE" ]; then
        if ! jq -e 'type == "object"' "$STATE" > /dev/null 2>&1; then
            log "estado da LLM ilegivel ou invalido: $STATE"
            exit "$EX_USAGE"
        fi
        LLM=$(cat "$STATE")
    else
        log "aviso: estado da LLM ausente ($STATE); tratando como vazio"
        LLM="{}"
    fi
}

gate_get() {
    if [ -f "$GATE_STATE" ] && jq -e 'type == "object"' "$GATE_STATE" > /dev/null 2>&1; then
        jq -r "$1" "$GATE_STATE"
    else
        jq -rn "$2"
    fi
}

save_gate_state() {
    local quiet=$1 quiet_sha=$2 first_seen=$3 tmp
    tmp=$(mktemp "$STATE_DIR/.flux-watch-gate-pr-$PR.XXXXXX")
    jq -n \
        --argjson quietTicks "$quiet" \
        --arg quietSha "$quiet_sha" \
        --argjson firstSeenAt "$first_seen" \
        --argjson lastPollAt "$(date +%s)" \
        '{quietTicks: $quietTicks, quietSha: $quietSha, firstSeenAt: $firstSeenAt, lastPollAt: $lastPollAt}' > "$tmp"
    mv -f "$tmp" "$GATE_STATE"
}

classify_ci() {
    jq -r '
        def cls:
            (.bucket // "") as $b
            | if $b != "" then $b
              else ((.state // "") | ascii_downcase) as $s
                | if ($s == "failure" or $s == "timed_out" or $s == "cancelled" or $s == "error" or $s == "startup_failure") then "fail"
                  elif ($s == "pending" or $s == "in_progress" or $s == "queued" or $s == "waiting" or $s == "requested") then "pending"
                  else "pass" end
              end;
        if length == 0 then "none"
        elif any(.[]; cls == "fail" or cls == "cancel") then "red"
        elif any(.[]; cls == "pending") then "pending"
        else "green" end' <<< "$1"
}

read -r -d '' THREADS_QUERY <<'EOF' || true
query($owner: String!, $name: String!, $pr: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 1) {
            totalCount
            nodes { databaseId author { login } body }
          }
        }
      }
    }
  }
}
EOF

TRIVIAL_DEF='def trivial: ((. // "") | ascii_downcase | test("^\\s*(lgtm|👍|:\\+1:|✅)[\\s.!]*$"));'

thread_delta() {
    jq -c \
        --argjson resolved "$(jq -c '.resolvedThreadIds // []' <<< "$LLM")" \
        --argjson mine "$(jq -cn --arg a "$PR_AUTHOR" --arg b "$ME" '[$a, $b] | map(ascii_downcase)')" \
        "$TRIVIAL_DEF"'
        [ .data.repository.pullRequest.reviewThreads.nodes[]?
          | select(.isResolved == false)
          | select(.id as $i | ($resolved | any(. == $i)) | not)
          | (.comments.nodes[0] // {}) as $c
          | select(($c.body | trivial) | not)
          | select((($c.author.login // "" | ascii_downcase) as $l
                    | ($mine | any(. == $l)) and ((.comments.totalCount // 1) <= 1)) | not)
          | .id ]' <<< "$1"
}

comment_delta() {
    jq -c \
        --argjson answered "$(jq -c '.answeredCommentIds // []' <<< "$LLM")" \
        --argjson mine "$(jq -cn --arg a "$PR_AUTHOR" --arg b "$ME" '[$a, $b] | map(ascii_downcase)')" \
        "$TRIVIAL_DEF"'
        [ .[]
          | select(.id as $i | ($answered | any(. == $i)) | not)
          | select(((.user.login // "") | ascii_downcase) as $l | ($mine | any(. == $l)) | not)
          | select((.body | trivial) | not)
          | .id ]' <<< "$1"
}

poll_once() {
    local view checks threads comments owner name
    local round no_rebase last_ci last_head attempted body_sync title_sync started_epoch
    local quiet quiet_sha first_seen now elapsed drift next_quiet interval

    view=$(ghx strict 'type == "object" and has("state")' pr view "$PR" --repo "$REPO" \
        --json state,mergedAt,headRefOid,baseRefOid,mergeable,mergeStateStatus,author) || gh_fail
    VIEW_STATE=$(jq -r '.state // ""' <<< "$view")
    SHA=$(jq -r '.headRefOid // ""' <<< "$view")
    BASE_SHA=$(jq -r '.baseRefOid // ""' <<< "$view")
    MERGEABLE=$(jq -r '.mergeable // ""' <<< "$view")
    PR_AUTHOR=$(jq -r '.author.login // ""' <<< "$view")
    CI=""
    DELTA_THREADS="[]"
    DELTA_COMMENTS="[]"

    case "$VIEW_STATE" in
        MERGED)
            emit mergeada "PR mergeada"
            exit "$EX_DONE"
            ;;
        CLOSED)
            emit fechada "PR fechada sem merge"
            exit "$EX_DONE"
            ;;
    esac

    load_llm_state
    round=$(lf '.round // 0')
    no_rebase=$(lf '.noRebase // false')
    last_ci=$(lf '.lastCiConclusion // ""')
    last_head=$(lf '.lastHeadSha // ""')
    attempted=$(lf '.conflictAttemptedAtBaseSha // ""')
    body_sync=$(lf '.bodySyncedAtSha // ""')
    title_sync=$(lf '.titleSyncedAtSha // ""')
    started_epoch=$(lf '(.startedAt // "") | sub("\\.[0-9]+"; "") | try fromdateiso8601 catch empty')

    now=$(date +%s)
    first_seen=$(gate_get '.firstSeenAt // empty' "$now")
    if [ -z "$first_seen" ]; then
        first_seen=$now
    fi
    quiet=$(gate_get '.quietTicks // 0' 0)
    quiet_sha=$(gate_get '.quietSha // ""' '""')
    if [ -z "$started_epoch" ]; then
        started_epoch=$first_seen
    fi
    elapsed=$((now - started_epoch))

    if [ "$round" -gt "$MAX_ROUND" ] || [ "$elapsed" -gt "$MAX_SECONDS" ]; then
        emit limite "round=$round elapsed=${elapsed}s (limites: round>$MAX_ROUND ou ${MAX_SECONDS}s); pedir olhada manual"
        exit "$EX_LIMIT"
    fi

    checks=$(ghx loose 'type == "array"' pr checks "$PR" --repo "$REPO" --json name,state,bucket,link) || gh_fail
    CI=$(classify_ci "$checks")

    owner=${REPO%%/*}
    name=${REPO#*/}
    threads=$(ghx strict '.data.repository.pullRequest.reviewThreads.nodes | type == "array"' api graphql \
        -f query="$THREADS_QUERY" -F owner="$owner" -F name="$name" -F pr="$PR") || gh_fail
    if [ "$(jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage // false' <<< "$threads")" = true ]; then
        log "aviso: mais de 100 reviewThreads; o gate enxerga so as 100 primeiras"
    fi
    comments=$(ghx strict 'type == "array"' api --paginate "repos/$REPO/issues/$PR/comments") || gh_fail
    comments=$(jq -cs 'add // []' <<< "$comments")

    DELTA_THREADS=$(thread_delta "$threads")
    DELTA_COMMENTS=$(comment_delta "$comments")

    if [ "$MERGEABLE" = CONFLICTING ] && [ "$no_rebase" != true ] && [ "$attempted" != "$BASE_SHA" ]; then
        save_gate_state 0 "" "$first_seen"
        emit conflito-novo "PR CONFLICTING com a base em $BASE_SHA (ultima tentativa: ${attempted:-nenhuma})"
        exit "$EX_ACTION"
    fi

    if [ "$DELTA_THREADS" != "[]" ] || [ "$DELTA_COMMENTS" != "[]" ]; then
        save_gate_state 0 "" "$first_seen"
        if [ "$MERGEABLE" = CONFLICTING ]; then
            emit nova-rodada "delta de threads ou issue comments com conflito em modo degradado"
        else
            emit nova-rodada "delta de threads ou issue comments"
        fi
        exit "$EX_ACTION"
    fi

    if [ "$CI" = red ] && { [ "$last_ci" != failure ] || [ "$SHA" != "$last_head" ]; }; then
        save_gate_state 0 "" "$first_seen"
        emit ci-vermelho "CI vermelho em $SHA (lastCiConclusion=${last_ci:-null})"
        exit "$EX_ACTION"
    fi

    if [ "$MERGEABLE" = CONFLICTING ]; then
        save_gate_state 0 "" "$first_seen"
        emit conflito-bloqueado "conflito em modo degradado e nada mais a fazer; precisa de resolucao humana"
        exit "$EX_BLOCKED"
    fi

    next_quiet=0
    if { [ "$CI" = green ] || [ "$CI" = none ]; } && [ "$MERGEABLE" = MERGEABLE ]; then
        drift=""
        if [ -n "$body_sync" ] && [ "$body_sync" != "$last_head" ]; then
            drift="descricao"
        fi
        if [ -n "$title_sync" ] && [ "$title_sync" != "$last_head" ]; then
            drift="${drift:+$drift e }titulo"
        fi
        if [ -n "$drift" ]; then
            save_gate_state 0 "" "$first_seen"
            emit drift "drift de $drift: sincronizado em ${body_sync:-null}/${title_sync:-null}, lastHeadSha=$last_head"
            exit "$EX_ACTION"
        fi
        if [ "$quiet_sha" = "$SHA" ]; then
            next_quiet=$((quiet + 1))
        else
            next_quiet=1
        fi
        FAST=0
        if [ "$next_quiet" -ge "$QUIET_TO_SETTLE" ]; then
            save_gate_state "$next_quiet" "$SHA" "$first_seen"
            emit assentou "CI $CI, sem delta, integrando, $next_quiet polls quietos"
            exit "$EX_SETTLED"
        fi
    fi

    if [ "$next_quiet" -gt 0 ]; then
        save_gate_state "$next_quiet" "$SHA" "$first_seen"
    else
        save_gate_state 0 "" "$first_seen"
    fi

    if [ "$CI" = pending ] || [ "$MERGEABLE" = UNKNOWN ] || [ "$FAST" = 1 ]; then
        interval=$FAST_INTERVAL
    else
        interval=$SLOW_INTERVAL
    fi
    NEXT_INTERVAL=$interval
    log "poll ocioso pr=$PR sha=${SHA:0:7} ci=$CI mergeable=$MERGEABLE quietTicks=$next_quiet proximo=${interval}s"
}

main() {
    parse_args "$@"
    check_deps
    resolve_paths
    trap cleanup EXIT
    trap 'exit 129' HUP
    trap 'exit 130' INT
    trap 'exit 143' TERM
    ERRF=$(mktemp)
    acquire_lock
    local me_json
    me_json=$(ghx strict 'type == "object" and has("login")' api user) || gh_fail
    ME=$(jq -r '.login' <<< "$me_json")
    NEXT_INTERVAL=$SLOW_INTERVAL
    while :; do
        poll_once
        if [ "$ONCE_POLL" = 1 ]; then
            exit 0
        fi
        gate_sleep "$NEXT_INTERVAL"
    done
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
