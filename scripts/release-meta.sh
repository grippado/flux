#!/usr/bin/env bash
#
# O que uma release diz sobre si mesma, resolvido uma vez e lido de dois lugares.
#
# O corpo da release e o docs/latest-release.json descrevem as mesmas tags, então
# os dois resolvem o changelog pela mesma cadeia aqui, em vez de por duas cópias
# que divergem na primeira vez que uma delas for corrigida.
#
# Uso:
#   scripts/release-meta.sh changelog <tag>   o changelog da tag, como publicado
#   scripts/release-meta.sh json <tag>        o conteúdo de docs/latest-release.json
#
# O `json` lê metadados de release com o `gh`, então precisa de GH_TOKEN (ou de um
# gh logado) para preencher published_at e html_url. Sem release para a tag, esses
# dois degradam para null e para a página da tag, nunca para uma data inventada.

set -euo pipefail

# O resumo é cortado por contagem de caracteres, e `${#s}` conta caracteres sob um
# locale UTF-8 e bytes fora de um. Sem isto a mesma tag é truncada em dois lugares
# diferentes, e um corte que caia dentro de um caractere multibyte deixa um byte
# órfão na página.
export LC_ALL=en_US.UTF-8

# Normalmente o repositório é aquele onde este arquivo vive. O workflow de release
# copia o script para fora do checkout antes de trocar de branch, e essa cópia não
# tem repositório acima dela, então cai no repositório de onde foi chamada.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! git -C "$ROOT" rev-parse --git-dir > /dev/null 2>&1; then
    ROOT="$(git rev-parse --show-toplevel)"
fi
cd "$ROOT"

SUMMARY_MAX=180
NO_CHANGELOG="Sem changelog registrado para esta tag."

# A página troca de idioma inteira, e o resumo é a única linha dela que vem de
# fora. Uma tag declara as quatro versões em trailers no fim da mensagem:
#
#   Summary-en: The contract now verifies identity, not a name string.
#   Summary-pt: O contrato passa a verificar identidade, não uma string de nome.
#
# Uma tag sem trailers não quebra nada: os idiomas caem na primeira linha, que é
# o comportamento que toda tag anterior a esta convenção já tinha.
#
# Só entra nesta lista idioma cujo texto passou por revisão de quem fala a
# língua. As tags declaram também `Summary-es` e `Summary-de`, e eles ficam de
# fora de propósito: foram escritos por quem não fala nenhum dos dois, e uma
# frase errada publicada com cara de oficial é pior que a página mostrar inglês.
# Uma releitura já pegou um `sich auflöst` que dizia "se dissolve" onde devia
# dizer "resolve", o que é o argumento de que pode haver outro.
#
# A página cai no inglês sozinha para todo idioma ausente daqui. Revisado um
# deles, basta acrescentá-lo nesta linha: o texto já está na tag.
SUMMARY_LANGS=(en pt)

CHANGELOG=""
CHANGELOG_SOURCE="none"

# A cadeia: o que um humano escreveu na tag, senão o assunto do commit para onde
# ela aponta, senão uma afirmação simples de que não há nada. Ela lê, nunca
# escreve: sem resumir, sem inventar prosa.
resolve_changelog() {
    local tag="$1"
    CHANGELOG=""
    CHANGELOG_SOURCE="none"

    if git rev-parse -q --verify "refs/tags/$tag" > /dev/null; then
        # O teste é o tipo do objeto, e não se a string voltou vazia: numa tag
        # leve o `%(contents)` não devolve nada, ele devolve silenciosamente a
        # mensagem inteira do commit abaixo dela — que sairia publicada como se
        # fosse changelog, trailer de co-autoria incluído.
        if [[ "$(git cat-file -t "$tag")" == "tag" ]]; then
            CHANGELOG="$(git for-each-ref --format='%(contents)' "refs/tags/$tag")"
            if [[ "$CHANGELOG" =~ [^[:space:]] ]]; then
                CHANGELOG_SOURCE="tag_message"
            fi
        fi
        if [[ ! "$CHANGELOG" =~ [^[:space:]] ]]; then
            CHANGELOG="$(git log -1 --format=%s "$tag")"
            if [[ "$CHANGELOG" =~ [^[:space:]] ]]; then
                CHANGELOG_SOURCE="commit_subject"
            fi
        fi
    fi

    if [[ ! "$CHANGELOG" =~ [^[:space:]] ]]; then
        CHANGELOG="$NO_CHANGELOG"
        CHANGELOG_SOURCE="none"
    fi
}

ltrim() {
    local s="$1"
    printf '%s' "${s#"${s%%[![:space:]]*}"}"
}

rtrim() {
    local s="$1"
    printf '%s' "${s%"${s##*[![:space:]]}"}"
}

# "flux 1.21.0 — x", "v1.21.0: x" e "1.21.0 - x" carregam o mesmo cabeçalho, e a
# página já mostra a versão ao lado do resumo. Só a parte depois do cabeçalho
# vale a pena repetir.
strip_version_header() {
    local line="$1"
    local rest="$line"

    if [[ "$rest" == flux\ * ]]; then
        rest="$(ltrim "${rest#flux }")"
    fi
    rest="${rest#v}"

    if [[ ! "$rest" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?(.*)$ ]]; then
        printf '%s' "$line"
        return
    fi
    rest="$(ltrim "${BASH_REMATCH[2]}")"

    local sep found=""
    for sep in ':' '—' '–' '-' '|'; do
        if [[ "$rest" == "$sep"* ]]; then
            found="$sep"
            break
        fi
    done
    if [[ -z "$found" ]]; then
        printf '%s' "$line"
        return
    fi

    rest="$(ltrim "${rest#"$found"}")"
    if [[ -z "$rest" ]]; then
        printf '%s' "$line"
        return
    fi
    printf '%s' "$rest"
}

# Os trailers são endereço da página, não conteúdo da release: publicá-los no
# corpo poria quatro traduções da mesma frase embaixo do texto que elas resumem.
strip_summary_trailers() {
    printf '%s\n' "$1" | awk '
        /^Summary-[a-z][a-z]:/ { next }
        { lines[n++] = $0 }
        END {
            last = -1
            for (i = 0; i < n; i++) if (lines[i] ~ /[^[:space:]]/) last = i
            for (i = 0; i <= last; i++) print lines[i]
        }
    '
}

trailer_for() {
    local lang="$1" text="$2"
    printf '%s\n' "$text" \
        | sed -n "s/^Summary-${lang}:[[:space:]]*//p" \
        | head -n 1
}

# O JSON carrega uma linha; o corpo inteiro fica na release, que é o único lugar
# onde ele pode crescer sem a página ter que renderizá-lo.
summarize() {
    local text="$1"
    local line
    line="$(printf '%s\n' "$text" | head -n 1)"
    line="$(rtrim "$(ltrim "$line")")"
    line="$(strip_version_header "$line")"
    if (( ${#line} > SUMMARY_MAX )); then
        line="$(rtrim "${line:0:SUMMARY_MAX-1}")…"
    fi
    printf '%s' "$line"
}

repo_url() {
    if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
        printf '%s/%s' "${GITHUB_SERVER_URL:-https://github.com}" "$GITHUB_REPOSITORY"
        return
    fi
    local remote
    remote="$(git remote get-url origin)"
    remote="${remote%.git}"
    remote="${remote#git@github.com:}"
    remote="${remote#https://github.com/}"
    printf 'https://github.com/%s' "$remote"
}

# Ordem semver, nunca cronológica. Uma tag criada hoje pode apontar para um commit
# antigo, então ordenar por data entregaria à página uma release histórica como a
# "anterior" de uma versão cortada depois dela.
previous_tag() {
    local current="$1"
    local seen_current=0 first_other="" tag

    while read -r tag; do
        [[ -z "$tag" ]] && continue
        if [[ "$tag" == "$current" ]]; then
            seen_current=1
            continue
        fi
        # Uma prerelease não é uma versão que a página oferece, então também não é
        # uma versão de onde a página veio.
        [[ "$tag" == *-* ]] && continue
        if (( seen_current )); then
            printf '%s' "$tag"
            return
        fi
        [[ -z "$first_other" ]] && first_other="$tag"
    done < <(git tag --list 'v[0-9]*' --sort=-v:refname)

    # A tag sendo lançada é normalmente a mais alta que existe; quando ela não
    # está na lista (um dispatch para uma tag que ninguém pushou), a versão mais
    # alta já lançada continua sendo a resposta honesta.
    if (( ! seen_current )); then
        printf '%s' "$first_other"
    fi
}

entry_json() {
    local tag="$1"
    local fallback published_at html_url meta lang value summary

    resolve_changelog "$tag"
    fallback="$(summarize "$(strip_summary_trailers "$CHANGELOG")")"

    summary="$(jq -n '{}')"
    for lang in "${SUMMARY_LANGS[@]}"; do
        value="$(trailer_for "$lang" "$CHANGELOG")"
        [[ -z "$value" ]] && value="$fallback"
        summary="$(printf '%s' "$summary" \
            | jq --arg k "$lang" --arg v "$value" '. + {($k): $v}')"
    done

    if meta="$(gh release view "$tag" --json publishedAt,url 2> /dev/null)"; then
        published_at="$(printf '%s' "$meta" | jq -r '.publishedAt')"
        html_url="$(printf '%s' "$meta" | jq -r '.url')"
    else
        published_at=""
        html_url="$(repo_url)/releases/tag/$tag"
    fi

    jq -n \
        --arg version "${tag#v}" \
        --arg tag "$tag" \
        --arg published_at "$published_at" \
        --arg html_url "$html_url" \
        --argjson summary "$summary" \
        --arg changelog_source "$CHANGELOG_SOURCE" \
        '{
            version: $version,
            tag: $tag,
            published_at: (if $published_at == "" then null else $published_at end),
            html_url: $html_url,
            summary: $summary,
            changelog_source: $changelog_source
        }'
}

# Dois campos nomeados e não uma lista: a página mostra as duas últimas versões e
# manda todo mundo para a lista de tags. Uma lista seria um convite a crescer.
release_json() {
    local tag="$1"
    local latest previous_ref previous

    latest="$(entry_json "$tag")"
    previous_ref="$(previous_tag "$tag")"
    if [[ -n "$previous_ref" ]]; then
        previous="$(entry_json "$previous_ref")"
    else
        previous="null"
    fi

    jq -n \
        --argjson latest "$latest" \
        --argjson previous "$previous" \
        --arg all_tags_url "$(repo_url)/tags" \
        '{latest: $latest, previous: $previous, all_tags_url: $all_tags_url}'
}

main() {
    local command="${1:-}"
    local tag="${2:-}"

    if [[ -z "$command" || -z "$tag" ]]; then
        echo "uso: scripts/release-meta.sh {changelog|json} <tag>" >&2
        exit 2
    fi

    case "$command" in
        changelog)
            resolve_changelog "$tag"
            strip_summary_trailers "$CHANGELOG"
            ;;
        json)
            release_json "$tag"
            ;;
        *)
            echo "comando desconhecido: $command" >&2
            exit 2
            ;;
    esac
}

main "$@"
