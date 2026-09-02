---
name: peek
description: "Relance read-only de working tree / branch / diff / PR / doc; roda só o reviewer holístico; imprime parecer com badges no chat; não posta, não aplica, não grava no vault (exceto `--save`). Para review formal que persiste e posta, use o verbo `review` da família."
user-invocable: true
requires:
  hard:
    - file: shared/review-legend.md
    - file: shared/flux-context.md
    - bin: git
    - agent: ${HOLISTIC}
  soft:
    - bin: gh
    - checkout_local
    - index
---

# /flux:peek

Relance rápido de código ou artefato. Sem cerimônia, sem persistência, sem postagem. Você pede, lê o parecer no chat e decide o que fazer.

**Legenda canônica de badges:** `${FLUX_ROOT}/shared/review-legend.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Preflight:** `${FLUX_ROOT}/shared/preflight.md`
**Disciplina de fan-out (o contexto principal orquestra, os agentes trabalham):** `${FLUX_ROOT}/shared/fanout-discipline.md`

## Step 0-alvo: parsear o alvo (antes de tudo)

Fazer **só o parse** dos argumentos para identificar o alvo, conforme "Detecção de alvo" abaixo. Não
abrir repo, não buscar PR, não ler arquivo: nesta etapa o alvo é só uma string classificada.

O parse vem primeiro porque a **âncora de contexto é o alvo**, não o `cwd`
(`${FLUX_ROOT}/shared/flux-context.md`, seção "Qual é a âncora"): um `/flux:peek ~/code/acme/api`
rodado do home tem que usar o perfil do `acme`, e é o perfil que decide qual reviewer holístico o
preflight vai verificar no passo seguinte.

## Step 0-cli: atalho mecânico (tentar primeiro)

Seguir `${FLUX_ROOT}/shared/step0-cli.md`: tentar `flux preflight peek [alvo] --json` logo após o
parse do alvo. JSON válido resolve os itens 1, 2, 4 e a parte de disco do 3 e do 5 abaixo —
revalidar só o que `session_revalidation_required` lista; alvo PR usa `flux gather pr <n> --json`
(sem `--threads`: o peek não consome threads). CLI ausente ou saída inválida → seguir o step
abaixo como sempre.

## Step 0-preflight: verificar antes de trabalhar

Seguir `${FLUX_ROOT}/shared/preflight.md` **antes de ler o conteúdo do alvo**. Ele resolve `FLUX_ROOT`, verifica
os `requires` do frontmatter, resolve e **confere a existência** do agente holístico, e classifica o
nível de capacidade.

Neste comando, especificamente:

1. Resolver `FLUX_ROOT` (Passo 1 do preflight).
2. Verificar os `hard`. Faltou algum → **abortar** no formato do preflight. Não ler o alvo, não
   invocar agente, não gravar nada.
3. Resolver `HOLISTIC` na ordem canônica do Passo 3 (manifesto → override local do repo → genérico
   da família pela cascata) e **verificar que existe**. Não existe → abortar.
4. Extrair `NO_EMDASH` do manifesto quando houver, e `MCP_DOCS` (`mcp.docs`) **só quando o alvo for
   um doc**. Os demais campos (vault, specialists) não são usados neste comando.
5. Classificar o nível: `REDUCED` com checkout local, `THIN` sem checkout local. Este comando nunca
   atinge `FULL`, porque por definição não roda specialists.

> **Sem improviso.** Se o agente holístico não for encontrado, abortar. Nunca produzir o parecer
> inline sem o agente: um parecer fora do contrato de saída não é comparável com os demais.

## Detecção de alvo

```
/flux:peek              → working tree (git diff HEAD + staged)
/flux:peek <branch>     → diff da branch vs main
/flux:peek main..feat   → range explícito de commits
/flux:peek <n>          → PR #n do repo do pwd (busca o diff, NÃO persiste)
/flux:peek <github-url> → URL de PR (busca o diff, NÃO persiste)
/flux:peek <doc-url>    → URL de Google Docs / Drive (pipeline leve de doc)
/flux:peek <path>       → arquivo ou diretório local
/flux:peek <texto>      → artefato indefinido (classificação + parecer)
```

**Resolução do alvo:**

1. Sem argumento → working tree: `git diff HEAD` (unstaged + staged). Se `git diff HEAD` vier vazio, checar `git diff --cached` (só staged). Se ambos vazios, avisar e terminar.
2. Numérico → PR do repo atual (`gh pr diff <n>`).
3. URL `github.com/.../pull/...` → buscar diff via `gh pr diff` com o repo do URL.
4. URL `docs.google.com` ou `drive.google.com` → pipeline leve de doc (ver abaixo).
5. String com `..` → `git diff <range>`.
6. Nome de branch existente → `git diff main..<branch>` (ou `master` se `main` não existir).
7. Path local existente → ler o arquivo/diretório e tratar como artefato de código.
8. Qualquer outra coisa → classificar o artefato (ver "Artefato desconhecido" abaixo) e propor o que revisar.

## Análise: só o reviewer holístico

Rodar **uma única Task** com `subagent_type: <HOLISTIC>`; no Codex, despachar um subagente nativo
genérico com a fonte de instruções L1 validada por `codex-compat.md`, passando:
- O diff / conteúdo / texto do alvo resolvido
- Instrução de modo read-only: **não sugerir commits, não editar arquivos, não postar — só analisar**
- Para PR: título, número, repo, branches (se disponíveis)
- Para branch/working tree: resultado de `git log main..HEAD --oneline` (contexto de commits)

O subagent retorna `SUMARIO` e `COMENTARIOS` (com badges conforme `review-legend.md`). Guardar como `LOOK_REPORT`.

Não rodar specialists. Não reconciliar. Não esperar `AGENT_REPORT`.

**No nível `THIN`** (sem checkout local), instruir o subagent explicitamente: findings cujo veredito
dependa de contexto não verificável saem como `question`, nunca como `request-change`.

## Saída no chat

Imprimir diretamente no chat, sem gravar em arquivo. **O banner de perfil é a primeira linha, sempre**
(formato em `${FLUX_ROOT}/shared/preflight.md`, Passo 5):

```
perfil: {nome|generico} · nivel: {REDUCED|THIN} · holistico: {agente} · specialists: nenhum
degradacoes: {soft ausentes e o que se perde | nenhuma}

## Parecer: {alvo}

### Resumo

{SUMARIO do LOOK_REPORT}

### Comentários

{COMENTARIOS do LOOK_REPORT — cada finding com o corpo abrindo pelo banner-imagem do badge
(conforme `review-legend.md`), título em **negrito**, `code inline` nos identificadores e bloco
```ts/```diff pra separar o trecho de código. Sem painel, sem permalink no head_sha, sem âncoras: o
look é o relance rápido; o formato completo (painel, permalinks, ação) é do `${FLUX_CMD}review`.}
```

- Badges conforme `review-legend.md` (sem emojis).
- Sem em-dashes quando `NO_EMDASH == true`.
- Sem seção `## Decisão` formal, sem checklist, sem cobertura de specialists.
- Se `LOOK_REPORT` vier vazio (sem findings): imprimir só o `SUMARIO` com a conclusão do subagent.

**Com `--save <dir>`:** gravar o parecer em `<dir>/YYYY-MM-DD-flux-peek-{alvo-slug}.md` além de imprimir no chat. Não persiste no vault automaticamente (escolha explícita do usuário).

## Pipeline leve de doc (target = URL de Google Docs / Drive)

Para um relance rápido num documento, sem o pipeline completo do `flux:review doc`:

1. Buscar metadados e conteúdo via MCP de documentos, no prefixo `${MCP_DOCS}` do manifesto
   (campo `mcp.docs`; sem o campo, descobrir a capacidade na sessão — ver
   `${FLUX_ROOT}/shared/flux-context.md`):
   ```
   ${MCP_DOCS}__get_file_metadata  { fileId: docId }
   ${MCP_DOCS}__read_file_content  { fileId: docId }
   ```
   Sem canal de documentos, ou se a leitura falhar: avisar e abortar (não gravar nada).

2. Rodar `<HOLISTIC>` em modo doc com o conteúdo obtido. Instrução: parecer rápido, sem profundidade de spec-review — identificar inconsistências, ambiguidades e pontos de atenção.

3. Imprimir `SUMARIO` + `COMENTARIOS` no chat (mesma estrutura acima).

## Artefato desconhecido

Quando o alvo não se encaixa em nenhuma categoria:

1. Classificar: tentar inferir o tipo (diff de código, doc, planilha, apresentação, texto livre, URL desconhecida).
2. Propor ao usuário: "Reconheci isso como {tipo}. Posso fazer {o que}. Quer continuar?"
3. Só rodar após confirmação. Sem GATE formal — uma mensagem direta no chat basta neste fluxo leve (é o caso previsto em `${FLUX_ROOT}/shared/hitl.md`, "o que NÃO precisa de gate").
4. Usar `<HOLISTIC>` em qualquer caso textual. Para formatos sem suporte real (Figma, planilha como dado puro), dizer com honestidade e propor o encaixe mais próximo.

## Flags

| Flag | Efeito |
|------|--------|
| `--save <dir>` | Grava o parecer em `<dir>/` além de imprimir no chat |
| (nenhuma outra) | — |

`flux:peek` é intencionalmente simples. Sem `--solo` (já roda só o holístico), sem specialists, sem verbos. O que não couber aqui tem `/flux:review`.

## Fechamento

Ao final do parecer no chat, sempre incluir esta linha:

```
Para review formal que persiste e posta/aplica no GitHub, use `${FLUX_CMD}review`. Para fechar o loop de uma PR (responder threads, aplicar + commitar), use `${FLUX_CMD}iterate`.
```

Montar a linha com o `FLUX_CMD` resolvido no preflight, **nunca** com `/flux:` literal. Esta linha é
lida por quem vai digitar o comando em seguida: escrever a forma de outro harness manda o usuário
digitar algo que não existe na máquina dele.
