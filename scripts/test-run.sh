#!/usr/bin/env bash
# shellcheck disable=SC2016,SC2034
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_SH="$HERE/../plugins/flux/scripts/run.sh"
BASH_ABS="$(command -v "${BASH_UNDER_TEST:-bash}")"

WORK="$(mktemp -d)"
PASS=0
FAIL=0

cleanup_all() {
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
        bad "$1" "[$2] ausente em $3: $(head -c 400 "$3")"
    fi
}

t_not_has() {
    if grep -qF -- "$2" "$3"; then
        bad "$1" "[$2] presente em $3"
    else
        ok "$1"
    fi
}

t_true() {
    if eval "$2"; then
        ok "$1"
    else
        bad "$1" "falhou: $2"
    fi
}

mode_of() {
    stat -c '%a' "$1" 2> /dev/null || stat -f '%Lp' "$1"
}

rs() {
    "$BASH_ABS" "$RUN_SH" "$@"
}

fm_value() {
    awk -v k="$1" '
        NR == 1 && $0 == "---" { fm = 1; next }
        fm == 1 && $0 == "---" { exit }
        fm == 1 && index($0, k ":") == 1 { sub("^" k ": *", ""); print; exit }
    ' "$2"
}

export FLUX_RUNS_ROOT="$WORK/runs"

echo "# start"
RUN="$(rs start --slug "Review PR 184!" --cli-version 1.30.0)"
RUN_DIR="$FLUX_RUNS_ROOT/$RUN"
t_true "run_id no formato YYYYMMDDTHHMMSSZ_slug_hex4" '[[ "$RUN" =~ ^[0-9]{8}T[0-9]{6}Z_review-pr-184_[0-9a-f]{4}$ ]]'
t_eq "raiz 0700" "700" "$(mode_of "$FLUX_RUNS_ROOT")"
t_eq "diretório do run 0700" "700" "$(mode_of "$RUN_DIR")"
t_eq "run.md 0600" "600" "$(mode_of "$RUN_DIR/run.md")"
t_eq "run.md schema" "flux-run/1" "$(fm_value schema "$RUN_DIR/run.md")"
t_eq "run.md nasce active" "active" "$(fm_value status "$RUN_DIR/run.md")"
t_eq "run.md ended_at nasce null" "null" "$(fm_value ended_at "$RUN_DIR/run.md")"
t_eq "run.md cli_version" "1.30.0" "$(fm_value cli_version "$RUN_DIR/run.md")"
t_true "run.md started_at ISO 8601 com offset" '[[ "$(fm_value started_at "$RUN_DIR/run.md")" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[+-][0-9]{2}:[0-9]{2}$ ]]'
t_true "run.md flux_version lida do plugin.json" '[[ "$(fm_value flux_version "$RUN_DIR/run.md")" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]'

RUN_NOSLUG="$(rs start)"
t_true "sem --slug usa o slug run" '[[ "$RUN_NOSLUG" =~ ^[0-9]{8}T[0-9]{6}Z_run_[0-9a-f]{4}$ ]]'

echo "# raiz padrão sob HOME"
HOME_T="$WORK/home"
mkdir -p "$HOME_T"
RUN_HOME="$(env -u FLUX_RUNS_ROOT HOME="$HOME_T" "$BASH_ABS" "$RUN_SH" start --slug h)"
t_true "default grava em \$HOME/.flux/runs/<id>" '[ -f "$HOME_T/.flux/runs/$RUN_HOME/run.md" ]'
t_eq "raiz default 0700" "700" "$(mode_of "$HOME_T/.flux/runs")"

echo "# stage-start"
SEQ="$(rs stage-start --run "$RUN" --verb review --writer cli --session-id lq1x2y3z-9f8e7d6c \
    --target github:pr/184 --harness-value claude-code --harness-source default --cap-hint FULL-tentativo \
    --cap-missing vault:soft --cap-missing shared/flux-context.md:hard \
    --cap-degradation "vault indisponivel — rodadas anteriores nao consultadas; artefato nao persistido" \
    --cap-degradation "gh indisponivel — sem coleta de PR/threads via GitHub")"
STAGE="$RUN_DIR/01-review.md"
t_eq "primeira sequence é 01" "01" "$SEQ"
t_true "arquivo 01-review.md existe" '[ -f "$STAGE" ]'
t_eq "stage 0600" "600" "$(mode_of "$STAGE")"
t_eq "stage status running" "running" "$(fm_value status "$STAGE")"
t_eq "stage sequence" "1" "$(fm_value sequence "$STAGE")"
t_eq "stage verb" "review" "$(fm_value verb "$STAGE")"
t_eq "stage writer" "cli" "$(fm_value writer "$STAGE")"
t_eq "stage session_id" "lq1x2y3z-9f8e7d6c" "$(fm_value session_id "$STAGE")"
t_true "stage não tem pid nem goal" '! grep -qE "^(pid|goal):" "$STAGE" "$RUN_DIR/run.md"'
t_eq "stage exit_code nasce null" "null" "$(fm_value exit_code "$STAGE")"
t_eq "stage finished_at nasce null" "null" "$(fm_value finished_at "$STAGE")"
t_eq "stage model nasce unknown" "unknown" "$(fm_value model "$STAGE")"
t_eq "stage effort nasce unknown" "unknown" "$(fm_value effort "$STAGE")"
t_eq "stage target" '"github:pr/184"' "$(fm_value target "$STAGE")"
t_eq "stage retry_of null" "null" "$(fm_value retry_of "$STAGE")"
t_has "harness.value" "  value: claude-code" "$STAGE"
t_has "harness.source" "  source: default" "$STAGE"
t_has "capabilities.level_cli_hint" "  level_cli_hint: FULL-tentativo" "$STAGE"
t_has "capabilities lista só o que faltou: soft" "    - {name: vault, kind: soft}" "$STAGE"
t_has "capabilities lista só o que faltou: hard com nome relativo" "    - {name: shared/flux-context.md, kind: hard}" "$STAGE"
t_true "capabilities não tem lista de hard/soft ok" '! grep -qE "^  (hard|soft):" "$STAGE"'
t_has "harness.source default é aceito" "  source: default" "$STAGE"
t_has "capabilities degradations" '    - "gh indisponivel — sem coleta de PR/threads via GitHub"' "$STAGE"
t_eq "gates nasce vazio" "[]" "$(fm_value gates "$STAGE")"
t_eq "outputs nasce vazio" "[]" "$(fm_value outputs "$STAGE")"
t_true "capabilities sem path absoluto" '! sed -n "/^capabilities:/,/^gates:/p" "$STAGE" | grep -Eq "(^|[[:space:]\"(,=])/[A-Za-z0-9._-]+"'
t_not_has "stage não grava /Users nem /home" "/Users/" "$STAGE"

echo "# sequence"
SEQ2="$(rs stage-start --run "$RUN" --verb iterate --writer script --retry-of 1)"
t_eq "segunda sequence é 02" "02" "$SEQ2"
t_eq "retry_of aponta para a stage original" "1" "$(fm_value retry_of "$RUN_DIR/02-iterate.md")"
t_true "stage anterior não foi sobrescrita" '[ "$(fm_value verb "$STAGE")" = "review" ]'

echo "# stage-start em paralelo aloca sequences únicas"
RUN_P="$(rs start --slug paralelo)"
for _ in 1 2 3 4 5 6; do
    rs stage-start --run "$RUN_P" --verb review > /dev/null &
done
wait
t_eq "6 stages em paralelo geram 6 arquivos" "6" "$(find "$FLUX_RUNS_ROOT/$RUN_P" -name '[0-9][0-9]-review.md' | wc -l | tr -d ' ')"
t_eq "sequences distintas" "6" "$(find "$FLUX_RUNS_ROOT/$RUN_P" -name '[0-9][0-9]-review.md' -exec basename {} \; | sort -u | wc -l | tr -d ' ')"
t_true "lock removido" '[ ! -e "$FLUX_RUNS_ROOT/$RUN_P/.lock" ]'

echo "# gate"
rs gate --run "$RUN" --seq 1 --kind github-post --decision approved --via askuser --option "Postar e aprovar"
rs gate --run "$RUN" --seq 1 --kind commit-push --decision dismissed --via numbered-menu
rs gate --run "$RUN" --seq 1 --kind inventado --decision approved --via askuser 2> /dev/null
t_eq "kind fora do vocabulário sai 4" "4" "$?"
t_has "primeiro gate gravado" "  - kind: github-post" "$STAGE"
t_has "decision approved" "    decision: approved" "$STAGE"
t_has "via askuser" "    via: askuser" "$STAGE"
t_has "option registrada" '    option: "Postar e aprovar"' "$STAGE"
t_has "segundo gate gravado" "  - kind: commit-push" "$STAGE"
t_has "decision dismissed" "    decision: dismissed" "$STAGE"
t_true "gate com timestamp ISO" 'grep -Eq "^    at: [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]+[+-][0-9]{2}:[0-9]{2}$" "$STAGE"'
t_true "campo gates deixou de ser [] e virou bloco" '[ "$(grep -c "^gates: \[\]$" "$STAGE")" = "0" ] && grep -q "^gates:$" "$STAGE"'
t_true "outputs seguiu intacto após gates" '[ "$(grep -c "^outputs: \[\]$" "$STAGE")" = "1" ]'
rs gate --run "$RUN" --seq 1 --kind github-post --decision maybe --via askuser 2> /dev/null
t_eq "decision inválida sai 4" "4" "$?"
rs gate --run "$RUN" --seq 1 --kind github-post --decision approved --via telepatia 2> /dev/null
t_eq "via inválido sai 4" "4" "$?"

echo "# output"
rs output --run "$RUN" --seq 1 --kind review --ref "vault:0-inbox/2026-10-01-1645-flux-PR184.md" --head-sha 9c1d2e3
t_has "output kind" "  - kind: review" "$STAGE"
t_has "output ref relativo" '    ref: "vault:0-inbox/2026-10-01-1645-flux-PR184.md"' "$STAGE"
t_has "output head_sha" "    head_sha: 9c1d2e3" "$STAGE"
rs output --run "$RUN" --seq 1 --kind review --ref "vault:/Users/x/vault/n.md" 2> /dev/null
t_eq "ref com path absoluto sai 4" "4" "$?"
rs output --run "$RUN" --seq 1 --kind review --ref "vault:~/vault/n.md" 2> /dev/null
t_eq "ref com til sai 4" "4" "$?"
rs output --run "$RUN" --seq 1 --kind review --ref "vault:../fora.md" 2> /dev/null
t_eq "ref com .. sai 4" "4" "$?"
rs output --run "$RUN" --seq 1 --kind inventado --ref "vault:x.md" 2> /dev/null
t_eq "output kind fora do vocabulário sai 4" "4" "$?"
rs output --run "$RUN" --seq 1 --kind pr --ref "url:https://github.com/acme/flux/pull/184"
t_has "url https é aceita" '    ref: "url:https://github.com/acme/flux/pull/184"' "$STAGE"
rs output --run "$RUN" --seq 1 --kind board --ref "vault:0-inbox/a..b.md"
t_has "nome com .. embutido é aceito" '    ref: "vault:0-inbox/a..b.md"' "$STAGE"
rs output --run "$RUN" --seq 1 --kind review --ref "/etc/passwd" 2> /dev/null
t_eq "ref sem prefixo sai 4" "4" "$?"
rs output --run "$RUN" --seq 1 --kind review --ref "vault:x.md" --head-sha NAO 2> /dev/null
t_eq "head_sha inválido sai 4" "4" "$?"

echo "# resolve-ref"
VAULT="$WORK/vault"
mkdir -p "$VAULT/0-inbox" "$VAULT/personal/pr-reviews" "$VAULT/.git"
printf -- '---\ncontext: "pessoal"\nrun_id: "%s"\nprovenance:\n  machine: "x"\n---\n\ncorpo\n' "$RUN" > "$VAULT/0-inbox/nota.md"
rs resolve-ref --run "$RUN" --vault-root "$VAULT" --ref "vault:0-inbox/nota.md" > "$WORK/rr.txt"
t_eq "dica ainda válida resolve sem varrer" "0" "$?"
t_has "dica devolvida" "0-inbox/nota.md" "$WORK/rr.txt"
mv "$VAULT/0-inbox/nota.md" "$VAULT/personal/pr-reviews/2026-10-01-1836-flux-PR78.md"
rs resolve-ref --run "$RUN" --vault-root "$VAULT" --ref "vault:0-inbox/nota.md" > "$WORK/rr.txt"
t_eq "nota promovida e renomeada resolve por run_id" "0" "$?"
t_has "path novo devolvido" "personal/pr-reviews/2026-10-01-1836-flux-PR78.md" "$WORK/rr.txt"
printf -- '---\nrun_id: "%s"\n---\n' "$RUN" > "$VAULT/.git/lixo.md"
printf -- '---\ncontext: x\n---\n\nrun_id: "%s"\n' "$RUN" > "$VAULT/0-inbox/so-no-corpo.md"
rs resolve-ref --run "$RUN" --vault-root "$VAULT" > "$WORK/rr.txt"
t_true "run_id no corpo e em .git não contam" '[ "$(wc -l < "$WORK/rr.txt" | tr -d " ")" = "1" ]'
rm -f "$VAULT/personal/pr-reviews/2026-10-01-1836-flux-PR78.md"
rs resolve-ref --run "$RUN" --vault-root "$VAULT" --ref "vault:0-inbox/so-no-corpo.md" > "$WORK/rr.txt" 2> /dev/null
t_eq "nota sem run_id no frontmatter, só com a dica, ainda resolve pela dica" "0" "$?"
rs resolve-ref --run "$RUN" --vault-root "$VAULT" 2> /dev/null
t_eq "sem nota alguma sai 3" "3" "$?"
rs resolve-ref --run "$RUN" --vault-root "$VAULT" --ref "vault:../fora.md" 2> /dev/null
t_eq "dica com .. sai 4" "4" "$?"
rs resolve-ref --run "$RUN" 2> /dev/null
t_eq "sem --vault-root sai 64" "64" "$?"

echo "# recusa de dados sensíveis"
rs stage-start --run "$RUN" --verb review --cap-degradation "falhou em /Users/grippado/repo/x" 2> /dev/null
t_eq "degradação com path absoluto sai 4" "4" "$?"
rs stage-start --run "$RUN" --verb review --target "/Users/grippado/repo" 2> /dev/null
t_eq "target com path absoluto sai 4" "4" "$?"
rs stage-start --run "$RUN" --verb review --cap-missing "/usr/bin/git:hard" 2> /dev/null
t_eq "capacidade com path absoluto sai 4" "4" "$?"
rs stage-start --run "$RUN" --verb review --cap-missing "gh:talvez" 2> /dev/null
t_eq "tipo de capacidade inválido sai 4" "4" "$?"
rs stage-start --run "$RUN" --verb review --harness-source inventado 2> /dev/null
t_eq "harness-source inválido sai 4" "4" "$?"
rs start --cli-version "1.30.0 /Users/x" 2> /dev/null
t_eq "cli-version com path sai 4" "4" "$?"
rs start --cli-version "ghp_abcdefghijklmnopqrstuvwxyz0123" 2> /dev/null
t_eq "cli-version com segredo sai 4" "4" "$?"
rs start --goal "x" 2> /dev/null
t_eq "--goal deixou de existir (64)" "64" "$?"
t_eq "recusas não criaram stages extras" "2" "$(find "$RUN_DIR" -name '[0-9][0-9]-*.md' | wc -l | tr -d ' ')"

echo "# contornos do guard de path e segredo"
for bad in 'file:///Users/x/secret' 'C:/Users/x' 'C:\Users\x' '\\\\srv\share\x' '/ü/x' '~' '/' 'foo /bar' 'tente (/etc/passwd)' 'ghp_abcdefghijklmnopqrstuvwxyz0123' 'Bearer abcdefghijklmnopqrstuvwxyz0123456789'; do
    rs gate --run "$RUN" --seq 1 --kind github-post --decision approved --via askuser --option "$bad" 2> /dev/null
    t_eq "option [$bad] sai 4" "4" "$?"
done
for good in 'PR/threads via GitHub' 'a / b' 'Aplicar correções em commits semânticos' 'github:pr/184'; do
    rs gate --run "$RUN" --seq 1 --kind github-post --decision dismissed --via askuser --option "$good" 2> /dev/null
    t_eq "option [$good] passa" "0" "$?"
done
rs stage-start --run "$RUN" --verb review --target "file:///Users/x/repo" 2> /dev/null
t_eq "target file:// sai 4" "4" "$?"
rs start --slug "review-/Users/x/segredo" 2> /dev/null
t_eq "slug com / sai 4" "4" "$?"
rs start --slug 'a\b' 2> /dev/null
t_eq "slug com barra invertida sai 4" "4" "$?"
rs start --slug '~casa' 2> /dev/null
t_eq "slug com til sai 4" "4" "$?"
t_eq "recusas não criaram stages extras" "2" "$(find "$RUN_DIR" -name '[0-9][0-9]-*.md' | wc -l | tr -d ' ')"

echo "# YAML válido: aspas, barra, controle, tipos"
rs gate --run "$RUN" --seq 1 --kind github-post --decision approved --via askuser --option $'a "b" \\c\there\x1bfim'
t_has "aspas e barra escapadas, controle removido" '    option: "a \"b\" \\c herefim"' "$STAGE"
t_true "nenhum caractere de controle no arquivo" '! LC_ALL=C grep -q "[$(printf "\001-\010\013\014\016-\037\177")]" "$STAGE"'
rs stage-set --run "$RUN" --seq 1 --model null --effort true
t_eq "null vira string" '"null"' "$(fm_value model "$STAGE")"
t_eq "true vira string" '"true"' "$(fm_value effort "$STAGE")"
rs stage-set --run "$RUN" --seq 1 --model 1.30
t_eq "número vira string" '"1.30"' "$(fm_value model "$STAGE")"
rs stage-set --run "$RUN" --seq 1 --model claude-opus-5-5 --effort high
t_eq "id de modelo segue plano" "claude-opus-5-5" "$(fm_value model "$STAGE")"
t_eq "versão com dois pontos segue plana" "1.30.0" "$(fm_value cli_version "$RUN_DIR/run.md" | tr -d '"')"

echo "# stage-set"
rs stage-set --run "$RUN" --seq 1 --model claude-opus-5-5 --effort high
t_eq "model gravado" "claude-opus-5-5" "$(fm_value model "$STAGE")"
t_eq "effort gravado" "high" "$(fm_value effort "$STAGE")"
rs stage-set --run "$RUN" --seq 1 --model "modelo com espaço"
t_eq "valor com espaço vai entre aspas" '"modelo com espaço"' "$(fm_value model "$STAGE")"

echo "# stage-summary não toca o frontmatter"
printf 'PR 184: approved-with-suggestions.\nstatus: falso dentro do corpo\n' | rs stage-summary --run "$RUN" --seq 1
t_has "resumo no corpo" "PR 184: approved-with-suggestions." "$STAGE"
t_eq "status do frontmatter intacto" "running" "$(fm_value status "$STAGE")"
t_eq "gates seguem presentes" "approved" "$(awk '/^    decision: approved/ {print "approved"; exit}' "$STAGE")"

echo "# resumo recusa path e segredo, aceita texto comum"
printf 'ver /Users/x/.ssh/id_rsa\n' | rs stage-summary --run "$RUN" --seq 1 2> /dev/null
t_eq "resumo com path sai 4" "4" "$?"
printf 'token ghp_abcdefghijklmnopqrstuvwxyz0123\n' | rs stage-summary --run "$RUN" --seq 1 2> /dev/null
t_eq "resumo com segredo sai 4" "4" "$?"
printf 'rodei /flux:review em ~5 minutos, 3 findings\n' | rs stage-summary --run "$RUN" --seq 1 2> /dev/null
t_eq "resumo comum com /comando e ~5 passa" "0" "$?"
printf 'acentuação: ação, é, ü\n' | rs stage-summary --run "$RUN" --seq 1
t_has "UTF-8 preservado" "acentuação: ação, é, ü" "$STAGE"
RUN_U="$(rs start --slug utf8)"
rs stage-start --run "$RUN_U" --verb review > /dev/null
python3 -c "import sys; sys.stdout.write('a'*4095+'é fim\n')" | rs stage-summary --run "$RUN_U" --seq 1
STAGE_U="$FLUX_RUNS_ROOT/$RUN_U/01-review.md"
t_true "corte no meio de um caractere gera UTF-8 válido" 'iconv -f UTF-8 -t UTF-8 "$STAGE_U" 2>&1 | cat > /dev/null'
t_eq "corte multibyte não duplica o corpo" "1" "$(grep -c '^## Resumo$' "$STAGE_U")"
t_true "corte multibyte respeita o teto de 4096 bytes no corpo" '[ "$(sed -n "/^## Resumo$/,\$p" "$STAGE_U" | wc -c | tr -d " ")" -le 4120 ]'
t_eq "corte multibyte descarta só o caractere partido" "4095" "$(sed -n '/^## Resumo$/,$p' "$STAGE_U" | tr -cd 'a' | wc -c | tr -d ' ')"
printf 'texto com acento no limite: %s\n' "$(python3 -c "print('é'*3000)")" | rs stage-summary --run "$RUN_U" --seq 1
t_true "texto todo acentuado cortado em 4096 bytes segue válido" 'iconv -f UTF-8 -t UTF-8 "$STAGE_U" 2>&1 | cat > /dev/null'
t_eq "e não duplica o cabeçalho do resumo" "1" "$(grep -c '^## Resumo$' "$STAGE_U")"
printf 'PR 184: approved-with-suggestions.\nstatus: falso dentro do corpo\n' | rs stage-summary --run "$RUN" --seq 1

echo "# stage-end"
rs stage-end --run "$RUN" --seq 1 --status completed --exit-code 0
t_eq "status completed" "completed" "$(fm_value status "$STAGE")"
t_eq "exit_code 0" "0" "$(fm_value exit_code "$STAGE")"
t_true "finished_at preenchido" '[[ "$(fm_value finished_at "$STAGE")" =~ ^[0-9]{4}- ]]'
t_eq "a linha status: do corpo não foi editada" "1" "$(grep -c '^status: falso dentro do corpo$' "$STAGE")"
rs stage-end --run "$RUN" --seq 1 --status failed --exit-code 1 2> /dev/null
t_eq "segunda conclusão sai 0" "0" "$?"
t_eq "primeira conclusão vale" "completed" "$(fm_value status "$STAGE")"
t_eq "exit_code não mudou" "0" "$(fm_value exit_code "$STAGE")"
rs stage-end --run "$RUN" --seq 2 --status cancelled --exit-code 130
t_eq "stage cancelled" "cancelled" "$(fm_value status "$RUN_DIR/02-iterate.md")"
t_eq "exit_code 130" "130" "$(fm_value exit_code "$RUN_DIR/02-iterate.md")"
rs stage-end --run "$RUN" --seq 9 --status completed 2> /dev/null
t_eq "stage inexistente sai 3" "3" "$?"

echo "# end e outcome"
rs end --run "$RUN"
t_eq "run completed" "completed" "$(fm_value status "$RUN_DIR/run.md")"
t_true "ended_at preenchido" '[[ "$(fm_value ended_at "$RUN_DIR/run.md")" =~ ^[0-9]{4}- ]]'
OUT="$RUN_DIR/outcome.md"
t_eq "outcome 0600" "600" "$(mode_of "$OUT")"
t_eq "outcome result cancelled" "cancelled" "$(fm_value result "$OUT")"
t_has "outcome conta completed" "  completed: 1" "$OUT"
t_has "outcome conta cancelled" "  cancelled: 1" "$OUT"
t_has "outcome conta gate approved" "  approved: $(grep -c '^    decision: approved$' "$STAGE")" "$OUT"
t_has "outcome conta gate dismissed" "  dismissed: $(grep -c '^    decision: dismissed$' "$STAGE")" "$OUT"
t_has "outcome agrega output com stage" "  - stage: 1" "$OUT"
t_has "outcome agrega o ref" '    ref: "vault:0-inbox/2026-10-01-1645-flux-PR184.md"' "$OUT"
t_has "outcome agrega head_sha" "    head_sha: 9c1d2e3" "$OUT"
rs end --run "$RUN" 2> /dev/null
t_eq "end repetido sai 3" "3" "$?"
rs stage-start --run "$RUN" --verb land 2> /dev/null
t_eq "run encerrado recusa stage-start (3)" "3" "$?"
rs gate --run "$RUN" --seq 1 --kind github-post --decision approved --via askuser 2> /dev/null
t_eq "run encerrado recusa gate (3)" "3" "$?"
rs output --run "$RUN" --seq 1 --kind review --ref "vault:x.md" 2> /dev/null
t_eq "run encerrado recusa output (3)" "3" "$?"
rs stage-set --run "$RUN" --seq 1 --model x 2> /dev/null
t_eq "run encerrado recusa stage-set (3)" "3" "$?"
printf 'x\n' | rs stage-summary --run "$RUN" --seq 1 2> /dev/null
t_eq "run encerrado recusa stage-summary (3)" "3" "$?"
t_true "nenhuma stage nova depois do end" '[ ! -e "$RUN_DIR/03-land.md" ]'

echo "# lock órfão"
RUN_L="$(rs start --slug lock)"
rs stage-start --run "$RUN_L" --verb review > /dev/null
mkdir "$FLUX_RUNS_ROOT/$RUN_L/.lock"
touch -t 202001010000 "$FLUX_RUNS_ROOT/$RUN_L/.lock"
rs gate --run "$RUN_L" --seq 1 --kind github-post --decision approved --via askuser 2> /dev/null
t_eq "lock sem pid e antigo é recuperado" "0" "$?"
mkdir "$FLUX_RUNS_ROOT/$RUN_L/.lock"
printf '999999\n' > "$FLUX_RUNS_ROOT/$RUN_L/.lock/pid"
rs gate --run "$RUN_L" --seq 1 --kind github-post --decision dismissed --via askuser 2> /dev/null
t_eq "lock de pid morto é recuperado" "0" "$?"
mkdir "$FLUX_RUNS_ROOT/$RUN_L/.lock" "$FLUX_RUNS_ROOT/$RUN_L/.lock.break"
touch -t 202001010000 "$FLUX_RUNS_ROOT/$RUN_L/.lock" "$FLUX_RUNS_ROOT/$RUN_L/.lock.break"
rs gate --run "$RUN_L" --seq 1 --kind github-post --decision approved --via askuser 2> /dev/null
t_eq "quebra de lock órfã (.lock.break antigo) é recuperada" "0" "$?"
t_true "nenhum .lock, .lock.break nem .lock.stale sobrando" '[ -z "$(find "$FLUX_RUNS_ROOT/$RUN_L" -name ".lock*" | head -1)" ]'

echo "# end e escritas concorrentes não deixam o outcome desatualizado"
for i in 1 2 3 4 5; do
    RUN_C="$(rs start --slug conc)"
    rs stage-start --run "$RUN_C" --verb review > /dev/null
    rs stage-end --run "$RUN_C" --seq 1 --status completed --exit-code 0
    for _ in 1 2 3 4; do
        rs stage-start --run "$RUN_C" --verb land > /dev/null 2>&1 &
    done
    rs end --run "$RUN_C" > /dev/null 2>&1 &
    wait
    FILES="$(find "$FLUX_RUNS_ROOT/$RUN_C" -name '[0-9][0-9]-*.md' | wc -l | tr -d ' ')"
    COUNTED=0
    for k in completed failed cancelled running; do
        n="$(sed -n "s/^  $k: //p" "$FLUX_RUNS_ROOT/$RUN_C/outcome.md" | head -1)"
        COUNTED=$((COUNTED + n))
    done
    t_eq "rodada $i: o outcome contou todas as stages que existem" "$FILES" "$COUNTED"
done
RUN_D="$(rs start --slug dois-end)"
rs end --run "$RUN_D" > /dev/null 2>&1 &
rs end --run "$RUN_D" > /dev/null 2>&1 &
wait
t_eq "dois end simultâneos deixam um outcome só e run encerrado" "completed" "$(fm_value status "$FLUX_RUNS_ROOT/$RUN_D/run.md")"
t_true "e nenhum lock sobrando" '[ -z "$(find "$FLUX_RUNS_ROOT/$RUN_D" -name ".lock*" | head -1)" ]'

echo "# resultado derivado"
RUN_F="$(rs start --slug falha)"
rs stage-start --run "$RUN_F" --verb review > /dev/null
rs stage-end --run "$RUN_F" --seq 1 --status failed --exit-code 1
rs end --run "$RUN_F"
t_eq "stage failed gera result failed" "failed" "$(fm_value result "$FLUX_RUNS_ROOT/$RUN_F/outcome.md")"
t_eq "stage failed gera run failed" "failed" "$(fm_value status "$FLUX_RUNS_ROOT/$RUN_F/run.md")"
RUN_R="$(rs start --slug orfao)"
rs stage-start --run "$RUN_R" --verb review > /dev/null
rs end --run "$RUN_R"
t_eq "stage ainda running no end vira result failed" "failed" "$(fm_value result "$FLUX_RUNS_ROOT/$RUN_R/outcome.md")"
t_has "outcome avisa interrompida" "ainda em running" "$FLUX_RUNS_ROOT/$RUN_R/outcome.md"
RUN_E="$(rs start --slug vazio)"
rs end --run "$RUN_E"
t_eq "run sem stages termina completed" "completed" "$(fm_value result "$FLUX_RUNS_ROOT/$RUN_E/outcome.md")"
t_has "outcome sem outputs" "outputs: []" "$FLUX_RUNS_ROOT/$RUN_E/outcome.md"
RUN_O="$(rs start --slug override)"
rs end --run "$RUN_O" --result failed
t_eq "--result sobrepõe a derivação" "failed" "$(fm_value result "$FLUX_RUNS_ROOT/$RUN_O/outcome.md")"

echo "# validação de identidade e uso"
rs stage-start --run "../escape" --verb review 2> /dev/null
t_eq "run_id com .. sai 4" "4" "$?"
rs stage-start --run "20261001T000000Z_nada_0000" --verb review 2> /dev/null
t_eq "run inexistente sai 3" "3" "$?"
RUN_V="$(rs start --slug verbo)"
rs stage-start --run "$RUN_V" --verb "Review" 2> /dev/null
t_eq "verbo inválido sai 64" "64" "$?"
rs 2> /dev/null
t_eq "sem comando sai 64" "64" "$?"
rs inventado 2> /dev/null
t_eq "comando desconhecido sai 64" "64" "$?"
rs start --nao-existe x 2> /dev/null
t_eq "flag desconhecida sai 64" "64" "$?"
rs --help > "$WORK/help.txt"
t_eq "--help sai 0" "0" "$?"
t_has "--help descreve os comandos" "stage-start" "$WORK/help.txt"

echo "# nenhum dado bruto no run"
t_true "nenhum arquivo do run cita o diretório de trabalho" '! grep -rqF "$WORK" "$RUN_DIR"'
t_true "nenhum arquivo do run cita HOME do usuário" '! grep -rqF "$HOME" "$RUN_DIR"'

echo "# shellcheck"
if command -v shellcheck > /dev/null 2>&1; then
    shellcheck "$RUN_SH" > "$WORK/sc.txt" 2>&1
    t_eq "shellcheck limpo em run.sh" "0" "$?"
else
    printf 'skip - shellcheck não encontrado\n'
fi

printf '\n%s passaram, %s falharam\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
