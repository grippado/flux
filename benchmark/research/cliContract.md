---

# flux-cli CLI Mecânico — Contrato RFC (Fase 1)

---

## 1. Subcomandos — Fase 1 do Benchmark

### 1.1 `flux preflight <verb> [target] --json`

**Responsabilidade:** Resolver tudo que é determinístico de disco sem introspecção de sessão. Emitir JSON estruturado com `session_revalidation_required` sinalizando o que a skill deve completar.

**Status possíveis:** `ok` (todos hard satisfeitos), `degraded` (hard ok, um ou mais soft ausentes), `abort` (um ou mais hard ausentes).

**Schema JSON completo:**

```json
{
  "schema_version": "1.0.0",
  "status": "ok",
  "abort_message": null,
  "verb": "review",
  "target": "247",
  "resolved_at": "2026-08-22T10:14:32Z",

  "flux_root": "/Users/gabriel/projects/flux",
  "flux_root_source": "env:CLAUDE_PLUGIN_ROOT",
  "manifest_path": "/Users/gabriel/projects/myrepo/.claude/flux-context.json",
  "anchor": "/Users/gabriel/projects/myrepo",

  "profile": "arco",
  "exec_command": "flux:build",
  "exec_fallback": {},

  "holistic_reviewer": "flux:pr-reviewer",
  "kit_roots": ["/Users/gabriel/projects/flux/kits/arco"],

  "capability_level_hint": "REDUCED",

  "lenses": {
    "l2_paths": ["/Users/gabriel/projects/flux/specialists/ts-reviewer.md"],
    "l3_paths": ["/Users/gabriel/projects/myrepo/.claude/agents/api-guard.md"]
  },

  "requirements": {
    "hard": [
      {
        "name": "review-legend.md",
        "type": "file",
        "path": "/Users/gabriel/projects/flux/shared/review-legend.md",
        "ok": true
      },
      { "name": "git", "type": "bin", "ok": true }
    ],
    "soft": [
      { "name": "gh", "type": "bin", "ok": true },
      {
        "name": "vault",
        "type": "vault",
        "ok": false,
        "reason": "VAULT_ROOT não configurado"
      }
    ]
  },

  "degradations": [
    "vault indisponível — vault_ctx nulo; rodadas anteriores não consultadas"
  ],

  "session_revalidation_required": [
    "flux_cmd",
    "adddir_cmd",
    "holistic_verification",
    "capability_level"
  ],

  "warnings": [],

  "scratchpad": {
    "manifest_dump": null
  }
}
```

**Exemplo abort:**

```json
{
  "schema_version": "1.0.0",
  "status": "abort",
  "abort_message": "Hard requirement ausente: review-legend.md não encontrado em /Users/gabriel/projects/flux/shared/. Verifique FLUX_ROOT ou reinstale o plugin.",
  "verb": "review",
  "target": "247",
  "resolved_at": "2026-08-22T10:14:32Z",
  "flux_root": "/Users/gabriel/projects/flux",
  "flux_root_source": "env:CLAUDE_PLUGIN_ROOT",
  "requirements": {
    "hard": [
      {
        "name": "review-legend.md",
        "type": "file",
        "path": "/Users/gabriel/projects/flux/shared/review-legend.md",
        "ok": false,
        "reason": "arquivo não encontrado"
      }
    ],
    "soft": []
  },
  "degradations": [],
  "session_revalidation_required": [],
  "warnings": []
}
```

**Campos novos que precisam ser implementados (delta vs. estado atual):**

| Campo | Situação atual | Mudança |
|---|---|---|
| `holistic_reviewer` | Existe em FluxManifest mas não é extraído para ResolvedContext | Extrair e adicionar ao output |
| `kit_roots` | GAP total | Implementar Passo 1d: union de kits do manifesto + prefixo kits_root + irmãos de FLUX_ROOT |
| `capability_level_hint` | GAP total | Calcular parcialmente: THIN (sem checkout local), REDUCED (checkout + sem specialists_root), FULL-tentativo (manifesto + specialists + checkout) |
| `session_revalidation_required` | Texto livre no bloco advisory | Tornar campo estruturado do JSON |
| `degradations[]` | Ausente como campo estruturado | Derivar de soft requirements falhos e warnings |
| `abort_message` | Não existe — CLI apenas imprime para stderr | Novo campo no JSON para status abort |

---

### 1.2 `flux gather pr <n|URL> [--repo owner/repo] [--threads] --json`

**Responsabilidade:** Coletar metadados, diff, threads e issue comments de uma PR via `gh`. Flag `--threads` ativa coleta via GraphQL com REST fallback para bodies truncados (>200 chars). Sem `--threads`, o campo `threads` é omitido do output.

**Schema JSON completo:**

```json
{
  "schema_version": "1.0.0",
  "status": "ok",
  "abort_message": null,
  "gathered_at": "2026-08-22T10:14:35Z",

  "pr_number": 247,
  "repo_full": "acme/api-service",
  "pr_url": "https://github.com/acme/api-service/pull/247",
  "commit_url": "https://github.com/acme/api-service/commit/a4f8e12c3d9b",

  "title": "feat(auth): add token refresh endpoint",
  "body": "## Summary\n\nAdds `/auth/refresh` endpoint with sliding window TTL.",

  "author": {
    "login": "marcelino",
    "name": "Marcelino Souza"
  },
  "is_own_pr": false,
  "assignees": [],

  "head_ref": "feat/auth-refresh",
  "base_ref": "main",
  "head_oid": "a4f8e12c3d9b7f1e2a0c8d4b6f3e9a2c",

  "state": "OPEN",
  "is_draft": false,

  "additions": 247,
  "deletions": 38,
  "changed_files": 9,

  "mergeable": "MERGEABLE",
  "merge_state_status": "CLEAN",

  "ticket": {
    "id": "PROJ-891",
    "url": "https://linear.app/acme/issue/PROJ-891"
  },

  "diff": "--- a/src/auth/routes.ts\n+++ b/src/auth/routes.ts\n@@ -12,6 +12,18 @@\n...",

  "threads": [
    {
      "database_id": 1823945,
      "url": "https://github.com/acme/api-service/pull/247#discussion_r1823945",
      "path": "src/auth/token.ts",
      "line": 84,
      "is_resolved": false,
      "author": "senior-dev",
      "body": "Este token TTL deveria ser configurável via env.",
      "replies": []
    }
  ],

  "issue_comments": [
    {
      "id": 9823471,
      "author": "marcelino",
      "body": "Adicionei o TTL como env var conforme sugerido.",
      "created_at": "2026-08-21T16:30:00Z",
      "is_bot": false
    }
  ],

  "commits": [
    {
      "sha": "a4f8e12",
      "message": "feat(auth): add token refresh endpoint",
      "author": "marcelino"
    }
  ]
}
```

**Notas de implementação do gather pr:**

- `is_own_pr`: comparar `gh api user -q .login` com `author.login` e `assignees[].login`. O campo `author.name` requer `gh api users/{login} -q .name` (chamada separada, cacheável por sessão).
- `ticket`: extrair via regex `[A-Z]{2,5}-\d+` do título e do `head_ref`. Se `LINEAR_ORG` estiver no manifesto, montar URL completa; caso contrário, `url: null`.
- Bots em `issue_comments`: filtrar por autor que case com lista de logins conhecidos (configurável no manifesto como `bot_logins[]`) ou por ausência de conteúdo substantivo (body < 20 chars ou body começa com "sync" / "CI").
- `threads[].body` truncado: se o body retornado pela query GraphQL tem comprimento exato de 200 chars, buscar via `gh api repos/{repo}/pulls/comments/{database_id} -q .body`.

---

## 2. Generalização — Um binário, família como dado

**Recomendação: único binário `flux`, subcomandos de coleta família-agnósticos, flag `--family` no preflight.**

Não criar `mech` como binário separado. A lógica de resolução de manifesto e cascata de FLUX_ROOT é idêntica em todos os contextos. O custo de manutenção de dois binários (atualização de schema, distribuição, documentação) supera o benefício de naming. O binário `flux` já existe e está instalado.

**Tabela de cobertura por família:**

| Subcomando | flux | core | sdd |
|---|---|---|---|
| `flux preflight <verb> --family <f> --json` | sim | sim | sim |
| `flux gather pr <n> --json` | sim | sim | sim |
| `flux gather slack <permalink> --json` | sim (reply/land) | sim (to-issue) | sim (grill) |
| `flux gather linear <ticket-id> --json` | sim (issue/land) | sim (to-issue) | sim |
| `flux scan-agents --json` | sim | sim | sim |
| `flux scan-repos --json` | sim | sim | sim |
| `flux find-board <source> --json` | sim | sim | sim |
| `flux open-board <template> --json` | sim | sim | sim |
| `flux filename <pattern> --json` | sim | sim | sim |

**Semântica da flag `--family`:**

`flux preflight <verb> --family flux|core|sdd --json`

O manifesto pode declarar `"family": "core"` e o CLI usa esse valor quando a flag está ausente. A família determina qual conjunto de hard requirements verificar (cada família tem seu próprio arquivo de requirements no FLUX_ROOT). Default: `flux` para compatibilidade com instalações existentes.

**Por que não flags no binário principal:** `flux` já tem subcomandos com nomes de verbo (`review`, `iterate`, etc.). Os novos subcomandos de coleta são distintos por nome (`gather`, `scan`, `find-board`) — não há colisão. A família como flag de `preflight` e não como subcomando separado evita proliferação de sub-subcomandos.

---

## 3. Braço B — Padrão de Step 0 com Fallback Agêntico

**Mudança mínima nos SKILL.md dos elos da família flux (e equivalente para core/sdd):**

Substituir o Step 0 atual (cascata de resolução em prosa de ~4 tool calls) pelo bloco abaixo. Nenhum outro passo muda.

```markdown
## Step 0 — bootstrap

Execute o CLI mecânico:

\`\`\`bash
flux preflight <VERB> [TARGET] --json 2>/dev/null
\`\`\`

Leia o JSON de saída e siga o caminho correspondente ao `status`:

**`abort`** — Exibir `abort_message` no chat e encerrar sem continuar. Não prosseguir para Step 1.

**`ok` ou `degraded`** — Usar os campos como valores resolvidos:
- `flux_root`, `manifest_path`, `anchor`, `profile`, `exec_command`, `exec_fallback` → direto
- `holistic_reviewer` → candidato; revalidar conforme `session_revalidation_required`
- `capability_level_hint` → provisório; substituir por valor definitivo após revalidação
- `lenses.l2_paths`, `lenses.l3_paths` → caminhos descobertos; verificar se agents estão registrados na sessão
- `degradations[]` → usar verbatim no banner (Passo 5)

Revalidar apenas os itens em `session_revalidation_required` (tipicamente 4 campos):
- `flux_cmd`: verificar qual forma a sessão expõe — `/flux:` → `/flux-` → `/`; se nenhuma, `UNAVAILABLE`
- `adddir_cmd`: verificar se `/add-dir` ou equivalente está disponível na sessão
- `holistic_verification`: confirmar que o agente em `holistic_reviewer` está registrado; se não, tentar cascata (override local `.claude/agents/reviewer.md` → `flux-pr-reviewer` → `pr-reviewer`)
- `capability_level`: calcular nível definitivo com base nos agents confirmados como registrados

**CLI ausente (exit 127) ou saída não-JSON** — Fallback agêntico:
1. Cascata FLUX_ROOT: `$CLAUDE_PLUGIN_ROOT` → `$CURSOR_PLUGIN_ROOT` → `$CODEX_PLUGIN_ROOT` → marcador `.codex-plugin/plugin.json` (dois níveis acima, com `readlink -f` se symlink) → `$FLUX_HOME` → heurística de versão em `.claude` e `.claude-personal`
2. Subir árvore a partir do target/cwd procurando `flux-context.json` em `.claude/` e `.cursor/`
3. Verificar hard requirements manualmente: `test -f <path>` para arquivos, `command -v <bin>` para binários
4. Continuar para Step 1 com os valores resolvidos agenticamente
```

**Compatibilidade:** O fallback agêntico é idêntico ao Step 0 atual. Nenhuma skill quebra se o CLI não estiver instalado — o braço B apenas acrescenta o caminho feliz.

---

## 4. Fronteira de Julgamento — O que NÃO entra no CLI

Lista definitiva para a RFC. Tudo abaixo permanece exclusivamente no LLM/subagente.

**Análise e síntese de conteúdo:**
- Leitura e interpretação do diff (o que mudou, por que, implicações de segurança/arquitetura)
- Redação de comentários de review (texto, tom, profundidade, exemplos de código)
- Classificação de escopo T0/T1 (flux:refine) — análise de sinais de escopo
- Redação de PRD-fast, TRD-fast, plano de slices
- Triagem de threads: acionável vs. ignorável vs. bot (requer leitura de contexto)
- Síntese de rodadas anteriores com a rodada atual
- Identificação do que é alegação verificável vs. já verificada

**Decisões de fluxo:**
- Decidir se uma thread requer commit, reply ou nenhuma ação
- Escolher entre opções HITL (merge, request changes, comment)
- Determinar cadência de watch (quente vs. morno) — depende de leitura qualitativa do estado
- Escalonamento de escopo (AFK vs. HITL) — julgamento sobre risco/autonomia
- Escolher qual specialist L2/L3 delegar dado o conteúdo específico do diff (o CLI descobre quais existem no disco; o modelo escolhe qual acionar)
- Classificação final FULL/REDUCED/THIN/UNAVAILABLE (depende de agents registrados + julgamento sobre degradações aceitáveis)

**Agência e interação:**
- Abertura de qualquer gate HITL
- Redação de mensagens Slack (flux:reply — tom, Maria Bonita, formatação Slack-safe)
- Posting de replies e reviews no GitHub
- Criação e atualização de tickets Linear
- `ScheduleWakeup` com cadência calculada
- Decisão de merge

**Introspecção de sessão (arquitetural — nunca entra no CLI por design):**
- Qual forma `flux_cmd` a sessão expõe — o CLI não tem acesso à lista de comandos registrados no harness
- Se `adddir_cmd` está disponível — idem
- Se agents estão registrados (`holistic_verification`, specialists L2/L3) — idem
- Nível de capacidade definitivo (depende dos agents registrados)
- Lista de degradações completa (a lista definitiva inclui estado de sessão que o CLI não vê)

---

## Notas de Implementação para o Benchmark

**Métricas a instrumentar:**

| Fluxo | Tool calls Step 0 (Braço A) | Tool calls Step 0 (Braço B) | Redução esperada |
|---|---|---|---|
| peek | 9-12 | 1 Bash + 4 revalidação | ~60% |
| review | 13-17 | 1 Bash + 4 revalidação | ~75% |
| iterate | 13-17 | 1 Bash + 4 revalidação | ~75% |
| land | 9-11 | 1 Bash + 4 revalidação | ~65% |

**Riscos a instrumentar no benchmark:**

1. **Risco 2 (formato banner):** No braço B, a skill deve construir o banner canônico do Passo 5 a partir dos campos `degradations[]` e `capability_level_hint` do JSON — não copiar o bloco de texto do `buildPromptBody` atual. Instrumentar se o banner emitido no braço B contém `nivel:`, `holistico:` e `degradacoes:`.

2. **Risco 1 (versão):** No benchmark, verificar que `schema_version` do JSON bate com `CLI_VERSION` no binário. Se divergirem, o teste é inválido.

3. **Latência do CLI:** O subcomando `flux preflight` faz I/O de disco (cascata de caminhos, leitura de manifesto, `test -f` e `command -v` para requirements). Em máquinas com muitos projetos, a heurística pode ser lenta. Medir o walltime do subcomando e adicionar ao total do braço B antes de comparar com braço A.

4. **`flux gather pr --threads`:** A flag `--threads` dispara a chamada GraphQL que no braço A custa 3 tool calls (GraphQL + REST fallback para bodies truncados + issue comments). No braço B, esse custo some do contexto do modelo mas o walltime continua. Separar métricas de "tool calls do modelo" e "tempo de coleta de dados".