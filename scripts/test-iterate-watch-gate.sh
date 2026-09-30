#!/usr/bin/env bash
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$HERE/../plugins/flux/scripts/iterate-watch-gate.sh"
BASH_ABS="$(command -v "${BASH_UNDER_TEST:-bash}")"

for tool in jq git shellcheck; do
    if ! command -v "$tool" > /dev/null 2>&1; then
        echo "test-iterate-watch-gate: $tool não encontrado no PATH." >&2
        exit 2
    fi
done

WORK="$(mktemp -d)"
STUB="$WORK/stub"
BASE_PATH="$PATH"
PASS=0
FAIL=0
CASE_N=0
BG_PIDS=""
TOUCHED=0

cleanup_all() {
    local p
    for p in $BG_PIDS; do
        kill -9 "$p" 2> /dev/null || true
    done
    rm -rf "$WORK"
}
trap cleanup_all EXIT

ok() {
    PASS=$((PASS + 1))
    printf 'ok   - %s\n' "$1"
}

bad() {
    FAIL=$((FAIL + 1))
    printf 'FAIL - %s (%s)\n' "$1" "$2"
}

t_eq() {
    if [ "$2" = "$3" ]; then
        ok "$1"
    else
        bad "$1" "esperado [$2] obtido [$3]"
    fi
}

t_has() {
    if grep -qF -- "$2" "$3"; then
        ok "$1"
    else
        bad "$1" "[$2] ausente em $3: $(head -c 300 "$3")"
    fi
}

t_true() {
    if eval "$2"; then
        ok "$1"
    else
        bad "$1" "falhou: $2"
    fi
}

mkdir -p "$STUB"
cat > "$STUB/gh" <<'EOF'
#!/bin/bash
FX="${FX:?}"
kind=""
case "$1 $2" in
    "pr view") kind=view ;;
    "pr checks") kind=checks ;;
    "api graphql") kind=threads ;;
    "api user") kind=user ;;
    "api --paginate") kind=comments ;;
    *)
        echo "gh stub: subcomando nao previsto: $*" >&2
        exit 99
        ;;
esac
n=$(cat "$FX/calls.$kind" 2> /dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$FX/calls.$kind"
echo "$kind" >> "$FX/calls.log"
if [ -f "$FX/hang.$kind" ]; then
    echo "$$" > "$FX/hang.pid"
    exec /bin/sleep 300
fi
if [ -f "$FX/failn.$kind" ]; then
    left=$(cat "$FX/failn.$kind")
    if [ "$left" -gt 0 ]; then
        echo $((left - 1)) > "$FX/failn.$kind"
        echo "HTTP 502: bad gateway" >&2
        exit 1
    fi
fi
if [ "$kind" = checks ] && [ -f "$FX/checks.noreport" ]; then
    echo "no checks reported on the 'feature' branch" >&2
    exit 1
fi
f="$FX/$kind.$n.json"
[ -f "$f" ] || f="$FX/$kind.json"
if [ ! -f "$f" ]; then
    echo "gh stub: sem fixture para $kind" >&2
    exit 98
fi
cat "$f"
if [ "$kind" = checks ] && [ -f "$FX/checks.rc" ]; then
    exit "$(cat "$FX/checks.rc")"
fi
exit 0
EOF
cat > "$STUB/sleep" <<'EOF'
#!/bin/bash
echo "$1" >> "$FX/sleeps.log"
case "$1" in
    270 | 1200)
        c=$(cat "$FX/sleepcount" 2> /dev/null || echo 0)
        c=$((c + 1))
        echo "$c" > "$FX/sleepcount"
        if [ -f "$FX/sleep_block" ]; then
            exec /bin/sleep 300
        fi
        if [ -f "$FX/sleep_kill_after" ] && [ "$c" -ge "$(cat "$FX/sleep_kill_after")" ]; then
            kill -TERM "$PPID"
            exec /bin/sleep 5
        fi
        ;;
esac
exit 0
EOF
chmod +x "$STUB/gh" "$STUB/sleep"

NOW_ISO() { date -u +%Y-%m-%dT%H:%M:%SZ; }

new_case() {
    CASE_N=$((CASE_N + 1))
    RUNDIR="$WORK/case.$CASE_N"
    FX="$RUNDIR/fx"
    STATE="$RUNDIR/flux-watch-pr-7.json"
    mkdir -p "$FX"
    echo '{"login":"me"}' > "$FX/user.json"
    fx_view OPEN MERGEABLE aaa bbb
    fx_checks pass
    fx_threads '[]'
    echo '[]' > "$FX/comments.json"
    mkstate '.'
}

fx_view() {
    jq -n --arg s "$1" --arg m "$2" --arg h "$3" --arg b "$4" \
        '{state: $s, mergedAt: null, headRefOid: $h, baseRefOid: $b, mergeable: $m, mergeStateStatus: "CLEAN", author: {login: "author"}}' \
        > "$FX/view.json"
}

fx_checks() {
    printf '%s\n' "$@" | jq -R '{name: "c", state: "X", bucket: ., link: "u"}' | jq -s . > "$FX/checks.json"
}

fx_threads() {
    jq -n --argjson n "$1" \
        '{data: {repository: {pullRequest: {reviewThreads: {pageInfo: {hasNextPage: false}, nodes: $n}}}}}' \
        > "$FX/threads.json"
}

thread() {
    jq -cn --arg id "$1" --argjson r "$2" --arg a "$3" --arg b "$4" --argjson t "$5" \
        '{id: $id, isResolved: $r, isOutdated: false, comments: {totalCount: $t, nodes: [{databaseId: 1, author: {login: $a}, body: $b}]}}'
}

comment() {
    jq -cn --argjson id "$1" --arg l "$2" --arg b "$3" \
        '{id: $id, user: {login: $l, type: "User"}, body: $b}'
}

mkstate() {
    jq -n --arg now "$(NOW_ISO)" \
        '{pr: 7, repo: "o/r", round: 1, lastHeadSha: "aaa", lastCiConclusion: "success", lastMergeable: "MERGEABLE",
          conflictAttemptedAtBaseSha: null, noRebase: false, bodySyncedAtSha: null, titleSyncedAtSha: null,
          quietTicks: 0, startedAt: $now, resolvedThreadIds: [], answeredCommentIds: []} | '"$1" > "$STATE"
}

red_idle_state() {
    fx_checks fail
    mkstate '.lastCiConclusion = "failure"'
}

run_gate() {
    OUT="$RUNDIR/out"
    ERR="$RUNDIR/err"
    local before after
    before="$(cksum < "$STATE" 2> /dev/null || echo none)"
    (cd "$RUNDIR" && env FX="$FX" PATH="$STUB:$BASE_PATH" "$BASH_ABS" "$GATE" "$@") > "$OUT" 2> "$ERR"
    RC=$?
    after="$(cksum < "$STATE" 2> /dev/null || echo none)"
    if [ "$before" != "$after" ]; then
        TOUCHED=$((TOUCHED + 1))
    fi
    LINES="$(wc -l < "$OUT" | tr -d ' ')"
    EV="$(head -n1 "$OUT" | jq -r '.event // empty' 2> /dev/null)"
}

once() {
    run_gate --pr 7 --repo o/r --state "$STATE" --once-poll
}

t_case() {
    local name=$1 rc=$2 ev=$3
    t_eq "$name: código de saída" "$rc" "$RC"
    if [ "$ev" = "-" ]; then
        t_eq "$name: stdout vazio" "0" "$LINES"
    else
        t_eq "$name: evento" "$ev" "$EV"
        t_eq "$name: uma linha" "1" "$LINES"
    fi
}

wait_for() {
    local i=0
    while [ $i -lt 100 ]; do
        if eval "$1"; then
            return 0
        fi
        /bin/sleep 0.1
        i=$((i + 1))
    done
    return 1
}

start_bg_gate() {
    "$BASH_ABS" -c "cd \"\$0\" && exec env \"\$@\"" "$RUNDIR" \
        FX="$FX" PATH="$STUB:$BASE_PATH" "$BASH_ABS" "$GATE" --pr 7 --repo o/r --state "$STATE" \
        > "$RUNDIR/bg.out" 2> "$RUNDIR/bg.err" &
    BG_PID=$!
    BG_PIDS="$BG_PIDS $BG_PID"
}

echo "== shellcheck"
if shellcheck -x "$GATE" "$HERE/test-iterate-watch-gate.sh"; then
    ok "shellcheck do gate e dos testes"
else
    bad "shellcheck do gate e dos testes" "avisos acima"
fi

echo "== eventos acionáveis (--once-poll)"

new_case
fx_threads "[$(thread PRRT_a false reviewer 'corrija isto' 1)]"
once
t_case "thread nova" 0 nova-rodada
t_eq "thread nova: delta.threads" '["PRRT_a"]' "$(jq -c .delta.threads "$OUT")"
t_eq "thread nova: campos do JSON" '["ci","delta","detail","event","mergeable","pr","sha","ts"]' "$(jq -c 'keys' "$OUT")"
t_eq "thread nova: pr, sha, mergeable, ci" '[7,"aaa","MERGEABLE","green"]' "$(jq -c '[.pr, .sha, .mergeable, .ci]' "$OUT")"
once
t_case "thread não tratada reaparece (reentrega)" 0 nova-rodada
t_eq "reentrega: mesmo delta" '["PRRT_a"]' "$(jq -c .delta.threads "$OUT")"

new_case
mkstate '.resolvedThreadIds = ["PRRT_done"]'
fx_threads "[$(thread PRRT_done false reviewer 'x' 1), $(thread PRRT_res true reviewer 'x' 1), $(thread PRRT_lgtm false reviewer 'LGTM' 1), $(thread PRRT_thumb false reviewer '👍' 1), $(thread PRRT_own false author 'nota minha' 1), $(thread PRRT_me false me 'nota minha' 1)]"
once
t_case "threads resolvidas, triviais e próprias não acordam" 0 -

new_case
fx_threads "[$(thread PRRT_own2 false author 'minha, com réplica' 3)]"
once
t_case "thread própria com réplica de terceiro acorda" 0 nova-rodada

new_case
echo "[$(comment 101 reviewer 'Falta tratar o caso X')]" > "$FX/comments.json"
once
t_case "issue comment novo" 0 nova-rodada
t_eq "issue comment novo: delta.comments" '[101]' "$(jq -c .delta.comments "$OUT")"

new_case
mkstate '.answeredCommentIds = [100]'
echo "[$(comment 100 reviewer 'já respondido'), $(comment 102 me 'minha réplica'), $(comment 103 author 'nota do autor'), $(comment 104 reviewer 'lgtm'), $(comment 105 reviewer ':+1:')]" > "$FX/comments.json"
once
t_case "issue comments respondidos, próprios e triviais não acordam" 0 -

new_case
echo "[$(comment 201 coderabbitai[bot] 'Rodei uma revisão automática')]" > "$FX/comments.json"
once
t_case "comentário de bot acorda (a LLM filtra)" 0 nova-rodada

new_case
printf '[%s]\n[%s]\n' "$(comment 301 reviewer 'pagina 1')" "$(comment 302 reviewer 'pagina 2')" > "$FX/comments.json"
once
t_eq "comentários paginados (páginas concatenadas)" '[301,302]' "$(jq -c .delta.comments "$OUT")"

new_case
fx_checks pass fail
once
t_case "CI vermelho" 0 ci-vermelho
t_eq "CI vermelho: ci" "red" "$(jq -r .ci "$OUT")"
new_case
fx_checks pass cancel
once
t_case "CI cancelado conta como vermelho" 0 ci-vermelho
new_case
red_idle_state
once
t_case "CI vermelho já reportado no mesmo sha não reacorda" 0 -
t_has "CI vermelho já reportado: log ocioso" "proximo=1200s" "$ERR"
new_case
red_idle_state
mkstate '.lastCiConclusion = "failure" | .lastHeadSha = "zzz"'
once
t_case "CI vermelho em sha novo reacorda" 0 ci-vermelho

new_case
fx_view OPEN CONFLICTING aaa base1
once
t_case "conflito novo" 0 conflito-novo
new_case
fx_view OPEN CONFLICTING aaa base1
mkstate '.conflictAttemptedAtBaseSha = "base1"'
once
t_case "conflito degradado (já tentado nesta base)" 12 conflito-bloqueado
new_case
fx_view OPEN CONFLICTING aaa base2
mkstate '.conflictAttemptedAtBaseSha = "base1"'
once
t_case "base andou: conflito é tentativa nova" 0 conflito-novo
new_case
fx_view OPEN CONFLICTING aaa base1
mkstate '.noRebase = true'
once
t_case "conflito com --no-rebase é degradado" 12 conflito-bloqueado
new_case
fx_view OPEN CONFLICTING aaa base1
mkstate '.conflictAttemptedAtBaseSha = "base1"'
fx_threads "[$(thread PRRT_c false reviewer 'x' 1)]"
once
t_case "conflito degradado com delta de threads ainda acorda" 0 nova-rodada

new_case
mkstate '.bodySyncedAtSha = "old"'
once
t_case "drift de descrição" 0 drift
t_has "drift de descrição: detalhe" "descricao" "$OUT"
new_case
mkstate '.titleSyncedAtSha = "old"'
once
t_case "drift de título" 0 drift
new_case
mkstate '.bodySyncedAtSha = "aaa" | .titleSyncedAtSha = "aaa"'
once
t_case "sincronizado no lastHeadSha não é drift" 0 -

new_case
fx_view MERGED MERGEABLE aaa bbb
once
t_case "mergeada" 10 mergeada
new_case
fx_view CLOSED MERGEABLE aaa bbb
once
t_case "fechada" 10 fechada

echo "== assentar e limites"

new_case
once
t_case "1º poll quieto" 0 -
t_eq "1º poll quieto: quietTicks do gate" "1" "$(jq -r .quietTicks "$RUNDIR/flux-watch-gate-pr-7.json")"
once
t_case "2º poll quieto assenta" 11 assentou
new_case
once
fx_view OPEN MERGEABLE ccc bbb
once
t_case "sha mudou: a contagem de quietTicks reinicia" 0 -
new_case
fx_view OPEN UNKNOWN aaa bbb
once
once
t_case "mergeable UNKNOWN nunca assenta" 0 -
t_has "mergeable UNKNOWN usa 270s" "proximo=270s" "$ERR"
new_case
fx_checks pending
once
t_case "CI pendente não conta quiet tick" 0 -
t_has "CI pendente usa 270s" "proximo=270s" "$ERR"
new_case
echo '[]' > "$FX/checks.json"
once
t_eq "sem checks: ci none" "0" "$RC"
t_has "sem checks: ci none no log" "ci=none" "$ERR"
new_case
touch "$FX/checks.noreport"
once
t_case "gh pr checks sem checks reportados não é erro" 0 -
t_eq "gh pr checks sem checks: sem retry" "1" "$(cat "$FX/calls.checks")"
new_case
fx_checks pending
echo 8 > "$FX/checks.rc"
once
t_case "gh pr checks rc 8 (pendente) com JSON válido" 0 -
t_eq "rc 8: sem retry" "1" "$(cat "$FX/calls.checks")"
new_case
fx_checks fail
echo 1 > "$FX/checks.rc"
once
t_case "gh pr checks rc 1 (falha) com JSON válido" 0 ci-vermelho

new_case
mkstate '.round = 9'
once
t_case "limite por round > 8" 13 limite
new_case
mkstate '.round = 8'
once
t_case "round 8 ainda não é limite" 0 -
new_case
mkstate ".startedAt = \"$(jq -rn 'now - 25200 | todate')\""
once
t_case "limite por ~6h" 13 limite
new_case
mkstate ".startedAt = \"$(jq -rn 'now - 3600 | todate')\""
once
t_case "1h de watch não é limite" 0 -

echo "== erro do gh e retry"

new_case
echo 3 > "$FX/failn.view"
once
t_case "gh falha 3 vezes" 3 erro-gh
t_eq "gh falha 3 vezes: 3 tentativas" "3" "$(cat "$FX/calls.view")"
t_eq "gh falha 3 vezes: backoff curto" "2 4" "$(tr '\n' ' ' < "$FX/sleeps.log" | sed 's/ $//')"
t_has "gh falha 3 vezes: detalhe do erro" "502" "$OUT"
new_case
echo 2 > "$FX/failn.threads"
once
t_case "gh falha 2 vezes e recupera" 0 -
t_eq "recuperou: 3ª tentativa" "3" "$(cat "$FX/calls.threads")"
new_case
echo 3 > "$FX/failn.user"
once
t_case "falha de gh api user esgota tentativas" 3 erro-gh
new_case
echo 1 > "$FX/failn.checks"
once
t_case "falha única em pr checks é absorvida" 0 -

new_case
red_idle_state
echo 1 > "$FX/failn.threads"
echo 3 > "$FX/sleep_kill_after"
run_gate --pr 7 --repo o/r --state "$STATE"
t_eq "erro do gh no meio do loop não encerra o loop: termina só pelo sinal" "143" "$RC"
t_eq "loop seguiu: intervalos após o erro" "2 1200 1200 1200" "$(tr '\n' ' ' < "$FX/sleeps.log" | sed 's/ $//')"
t_eq "loop seguiu: nenhum evento" "0" "$LINES"

echo "== cadência"

new_case
red_idle_state
for i in 1 2 3 4 5 6; do
    cp "$FX/view.json" "$FX/view.$i.json"
done
fx_view MERGED MERGEABLE aaa bbb
cp "$FX/view.json" "$FX/view.7.json"
run_gate --pr 7 --repo o/r --state "$STATE"
t_case "6 polls ociosos depois mergeada" 10 mergeada
t_eq "6 polls ociosos: intervalos observados" "1200 1200 1200 1200 1200 1200" "$(tr '\n' ' ' < "$FX/sleeps.log" | sed 's/ $//')"
t_eq "6 polls ociosos: log mostra os intervalos" "6" "$(grep -c 'dormindo 1200s' "$ERR")"
t_eq "6 polls ociosos: nenhum 270" "0" "$(grep -c '^270$' "$FX/sleeps.log")"
t_eq "6 polls ociosos: gh consultado 7 vezes" "7" "$(cat "$FX/calls.view")"
t_true "lock liberado ao sair" "[ ! -e '$RUNDIR/flux-watch-gate-pr-7.lock' ]"

new_case
fx_checks pending
echo 4 > "$FX/sleep_kill_after"
run_gate --pr 7 --repo o/r --state "$STATE"
t_eq "CI pendente: encerra só por sinal" "143" "$RC"
t_eq "CI pendente: nenhuma saída acorda a LLM" "0" "$LINES"
t_eq "CI pendente: intervalos observados" "270 270 270 270" "$(tr '\n' ' ' < "$FX/sleeps.log" | sed 's/ $//')"

new_case
red_idle_state
echo 3 > "$FX/sleep_kill_after"
run_gate --pr 7 --repo o/r --state "$STATE" --fast
t_eq "--fast mantém 270 até o primeiro poll quieto" "270 270 270" "$(tr '\n' ' ' < "$FX/sleeps.log" | sed 's/ $//')"

new_case
echo 2 > "$FX/sleep_kill_after"
run_gate --pr 7 --repo o/r --state "$STATE" --fast
t_case "--fast: 1º poll quieto volta a 1200 e o 2º assenta" 11 assentou
t_eq "--fast: só um sono, de 1200" "1200" "$(tr '\n' ' ' < "$FX/sleeps.log" | sed 's/ $//')"

in_gate_env() {
    env FX="$FX" PATH="$STUB:$BASE_PATH" "$BASH_ABS" -c ". \"$GATE\"; $1"
}

new_case
in_gate_env "printf '%s %s\\n' \"\$FAST_INTERVAL\" \"\$SLOW_INTERVAL\"" > "$RUNDIR/consts" 2>&1
t_eq "constantes configuradas" "270 1200" "$(cat "$RUNDIR/consts")"
in_gate_env 'gate_sleep 300' > "$RUNDIR/o300" 2> "$RUNDIR/e300"
t_eq "gate_sleep 300 é recusado" "64" "$?"
t_has "gate_sleep 300: mensagem" "300s recusado" "$RUNDIR/e300"
t_true "gate_sleep 300: nada dormiu" "[ ! -s '$FX/sleeps.log' ]"
for v in 299 301 600 0 1 ''; do
    in_gate_env "gate_sleep '$v'" > /dev/null 2>&1
    t_eq "gate_sleep '$v' é recusado" "64" "$?"
done
in_gate_env 'gate_sleep 270; gate_sleep 1200' > /dev/null 2>&1
t_eq "gate_sleep 270 e 1200 passam" "270 1200" "$(tr '\n' ' ' < "$FX/sleeps.log" | sed 's/ $//')"
t_true "nenhum caminho do script passa 300 ao sleep" "! grep -nE 'gate_sleep +300|sleep +300' '$GATE'"

echo "== dependências"

mkcurated() {
    local dir=$1 skip=$2 t p
    mkdir -p "$dir"
    for t in date mkdir rm mv mktemp cat tr cut dirname grep git jq sed head wc; do
        if [ "$t" = "$skip" ]; then
            continue
        fi
        p="$(command -v "$t")"
        ln -sf "$p" "$dir/$t"
    done
    if [ "$skip" != gh ]; then
        ln -sf "$STUB/gh" "$dir/gh"
    fi
    ln -sf "$STUB/sleep" "$dir/sleep"
}

new_case
mkcurated "$WORK/bin_nojq" jq
(cd "$RUNDIR" && env FX="$FX" PATH="$WORK/bin_nojq" "$BASH_ABS" "$GATE" --pr 7 --repo o/r --state "$STATE" --once-poll) > "$RUNDIR/out" 2> "$RUNDIR/err"
t_eq "sem jq: código 2" "2" "$?"
t_has "sem jq: diz qual faltou" "dependencia ausente: jq" "$RUNDIR/err"
mkcurated "$WORK/bin_nogh" gh
(cd "$RUNDIR" && env FX="$FX" PATH="$WORK/bin_nogh" "$BASH_ABS" "$GATE" --pr 7 --repo o/r --state "$STATE" --once-poll) > "$RUNDIR/out" 2> "$RUNDIR/err"
t_eq "sem gh: código 2" "2" "$?"
t_has "sem gh: diz qual faltou" "dependencia ausente: gh" "$RUNDIR/err"
mkdir -p "$WORK/bin_empty"
(cd "$RUNDIR" && env FX="$FX" PATH="$WORK/bin_empty" "$BASH_ABS" "$GATE" --pr 7 --repo o/r --state "$STATE" --once-poll) > "$RUNDIR/out" 2> "$RUNDIR/err"
t_eq "sem gh nem jq: código 2" "2" "$?"
t_has "sem gh nem jq: lista os dois" "dependencia ausente: gh jq" "$RUNDIR/err"
t_eq "sem dependência: nada no stdout" "0" "$(wc -l < "$RUNDIR/out" | tr -d ' ')"

new_case
run_gate --repo o/r --state "$STATE" --once-poll
t_eq "sem --pr: uso inválido" "64" "$RC"
run_gate --pr abc --repo o/r --state "$STATE" --once-poll
t_eq "--pr não numérico: uso inválido" "64" "$RC"
run_gate --pr 7 --repo semrepo --state "$STATE" --once-poll
t_eq "--repo sem barra: uso inválido" "64" "$RC"
echo '{not json' > "$STATE"
run_gate --pr 7 --repo o/r --state "$STATE" --once-poll
t_eq "estado da LLM ilegível: não adivinha" "64" "$RC"

echo "== lock"

new_case
red_idle_state
touch "$FX/sleep_block"
start_bg_gate
A_PID=$BG_PID
wait_for "[ -s '$FX/sleeps.log' ]"
t_true "gate A dormindo com o lock" "[ -d '$RUNDIR/flux-watch-gate-pr-7.lock' ]"
t_eq "lock guarda o pid do dono" "$A_PID" "$(cat "$RUNDIR/flux-watch-gate-pr-7.lock/pid")"
run_gate --pr 7 --repo o/r --state "$STATE" --once-poll
t_eq "segundo gate na mesma PR é recusado" "14" "$RC"
t_has "segundo gate informa o pid do dono" "pid=$A_PID" "$ERR"
t_eq "segundo gate não escreve stdout" "0" "$LINES"
kill -TERM "$A_PID"
wait "$A_PID" 2> /dev/null
t_eq "SIGTERM: gate A sai com 143" "143" "$?"
t_true "SIGTERM: lock liberado" "[ ! -e '$RUNDIR/flux-watch-gate-pr-7.lock' ]"
run_gate --pr 7 --repo o/r --state "$STATE" --once-poll
t_eq "depois de liberado, novo gate roda" "0" "$RC"

new_case
red_idle_state
touch "$FX/sleep_block"
start_bg_gate
wait_for "[ -s '$FX/sleeps.log' ]"
kill -HUP "$BG_PID"
wait "$BG_PID" 2> /dev/null
t_eq "SIGHUP: gate sai com 129" "129" "$?"
t_true "SIGHUP: lock liberado" "[ ! -e '$RUNDIR/flux-watch-gate-pr-7.lock' ]"

new_case
red_idle_state
run_gate --pr 7 --repo o/r --state "$STATE" --once-poll
t_true "saída normal: lock liberado" "[ ! -e '$RUNDIR/flux-watch-gate-pr-7.lock' ]"
new_case
fx_view MERGED MERGEABLE aaa bbb
run_gate --pr 7 --repo o/r --state "$STATE" --once-poll
t_true "saída com evento terminal: lock liberado" "[ ! -e '$RUNDIR/flux-watch-gate-pr-7.lock' ]"

echo "== crash e reentrega"

new_case
fx_threads "[$(thread PRRT_crash false reviewer 'trate isto' 1)]"
touch "$FX/hang.threads"
before_state="$(cksum < "$STATE")"
start_bg_gate
A_PID=$BG_PID
wait_for "[ -s '$FX/hang.pid' ]"
t_true "gate A parado no meio do poll, com o lock" "[ -d '$RUNDIR/flux-watch-gate-pr-7.lock' ]"
{
    kill -9 "$A_PID"
    kill -9 "$(cat "$FX/hang.pid")" 2> /dev/null
    wait "$A_PID"
} 2> /dev/null
t_eq "SIGKILL: gate A morre sem entregar nada" "0" "$(wc -c < "$RUNDIR/bg.out" | tr -d ' ')"
t_true "SIGKILL: lock órfão fica para trás" "[ -d '$RUNDIR/flux-watch-gate-pr-7.lock' ]"
t_eq "estado da LLM intacto depois da morte" "$before_state" "$(cksum < "$STATE")"
rm -f "$FX/hang.threads"
run_gate --pr 7 --repo o/r --state "$STATE" --once-poll
t_case "reinício entrega o evento que a morte interrompeu" 0 nova-rodada
t_eq "reinício: mesmo delta" '["PRRT_crash"]' "$(jq -c .delta.threads "$OUT")"
t_has "reinício recupera o lock órfão" "lock orfao" "$ERR"
t_true "reinício: lock liberado ao sair" "[ ! -e '$RUNDIR/flux-watch-gate-pr-7.lock' ]"

echo "== caminho do estado em worktree"

REPO_MAIN="$WORK/wt-main"
REPO_TREE="$WORK/wt-tree"
git init -q "$REPO_MAIN"
git -C "$REPO_MAIN" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
git -C "$REPO_MAIN" worktree add -q "$REPO_TREE" -b wt-branch
mkdir -p "$REPO_TREE/sub/dir"
COMMON="$(cd "$REPO_MAIN/.git" && pwd -P)"
t_true "no worktree, .git é arquivo e não diretório" "[ -f '$REPO_TREE/.git' ] && [ ! -d '$REPO_TREE/.git' ]"
t_eq "git-common-dir no checkout principal é relativo" ".git" "$(git -C "$REPO_MAIN" rev-parse --git-common-dir)"
t_eq "git-common-dir no worktree aponta para o .git do principal" "$COMMON" "$(cd "$(git -C "$REPO_TREE" rev-parse --git-common-dir)" && pwd -P)"

new_case
jq -n '{round: 9, startedAt: "2026-01-01T00:00:00Z"}' > "$COMMON/flux-watch-pr-7.json"
for where in "$REPO_TREE" "$REPO_TREE/sub/dir" "$REPO_MAIN"; do
    (cd "$where" && env FX="$FX" PATH="$STUB:$BASE_PATH" "$BASH_ABS" "$GATE" --pr 7 --repo o/r --once-poll) > "$RUNDIR/out" 2> "$RUNDIR/err"
    t_eq "estado lido de git-common-dir a partir de ${where#"$WORK"/}" "13" "$?"
done
t_eq "evento de limite veio do estado no .git comum" "limite" "$(head -n1 "$RUNDIR/out" | jq -r .event)"
jq -n --arg now "$(NOW_ISO)" '{round: 1, lastHeadSha: "aaa", lastCiConclusion: "success", startedAt: $now}' > "$COMMON/flux-watch-pr-7.json"
(cd "$REPO_TREE" && env FX="$FX" PATH="$STUB:$BASE_PATH" "$BASH_ABS" "$GATE" --pr 7 --repo o/r --once-poll) > "$RUNDIR/out" 2> "$RUNDIR/err"
t_eq "poll ocioso a partir do worktree" "0" "$?"
t_true "estado do gate gravado no .git comum" "[ -f '$COMMON/flux-watch-gate-pr-7.json' ]"
t_true "lock criado e liberado no .git comum" "[ ! -e '$COMMON/flux-watch-gate-pr-7.lock' ]"
t_eq "gate não tocou no estado da LLM" "null" "$(jq -c '.quietTicks // null' "$COMMON/flux-watch-pr-7.json")"
(cd "$WORK" && env FX="$FX" PATH="$STUB:$BASE_PATH" "$BASH_ABS" "$GATE" --pr 7 --repo o/r --once-poll) > "$RUNDIR/out" 2> "$RUNDIR/err"
t_eq "fora de repositório git e sem --state: uso inválido" "64" "$?"

echo "== o gate nunca escreve o estado da LLM"
t_eq "estado da LLM inalterado em todos os runs" "0" "$TOUCHED"

echo
echo "resultado: $PASS ok, $FAIL falhas"
[ "$FAIL" -eq 0 ]
