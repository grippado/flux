Tenho todos os dados necessários. Aqui está o relatório:

---

## Mecânica de medição de tokens no Claude Code — relatório técnico

### 1. Estrutura dos campos `usage` no JSONL

Cada chamada à API gera entradas `type: "assistant"` no JSONL. A estrutura relevante:

```json
{
  "type": "assistant",
  "requestId": "req_011CeGb8VEjbXtwSHaLJpvtS",
  "uuid": "2fbe2811-d92b-4983-b81c-29c6dec306e3",
  "parentUuid": "3c1778b8-...",
  "message": {
    "model": "claude-sonnet-5",
    "usage": {
      "input_tokens": 2,
      "cache_creation_input_tokens": 84703,
      "cache_read_input_tokens": 0,
      "output_tokens": 280,
      "output_tokens_details": { "thinking_tokens": 160 },
      "cache_creation": {
        "ephemeral_1h_input_tokens": 84703,
        "ephemeral_5m_input_tokens": 0
      },
      "iterations": [{ ... }]
    }
  },
  "timestamp": "2026-08-21T21:17:29.566Z"
}
```

**Localização exata:** `obj["message"]["usage"]` em entradas com `obj["type"] == "assistant"`.

**Armadilha crítica — duplicatas por streaming:** Um mesmo `requestId` aparece 2 a 3 vezes no JSONL (chunks de streaming: thinking, tool\_use, text final). O campo `usage` é idêntico em todas as cópias do mesmo `requestId`. **Nunca some as linhas diretamente — agrupe por `requestId` e some apenas uma vez por ID.** Em uma sessão de 284 entradas `assistant`, havia apenas 160 `requestId` únicos; somar sem deduplicar triplicaria os totais.

---

### 2. Identificar tool calls por tipo e atribuí-los a fases

Tool calls ficam em `message.content[]` de entradas `assistant`:

```json
{
  "type": "tool_use",
  "name": "Bash",          // Bash | Read | Edit | Write | Skill | ...
  "id": "toolu_01FmwwBq...",
  "input": { "command": "grep -rl ..." },
  "caller": { "type": "direct" }
}
```

Tool results ficam em entradas `type: "user"` logo após (via `parentUuid`):

```json
{
  "type": "user",
  "message": {
    "content": [{
      "type": "tool_result",
      "tool_use_id": "toolu_01FmwwBq...",
      "content": "...",
      "is_error": false
    }]
  },
  "toolUseResult": { "stdout": "...", "stderr": "..." }
}
```

**Segmentação por fase via grafo de `parentUuid`:**  
O JSONL é uma árvore de mensagens. Entradas `type: "user"` com `promptId` não nulo marcam o início de um turno humano. Tudo que flui como `assistant` -> `user(tool_result)` -> `assistant` dentro do mesmo `promptId` compõe um turno. Não existe campo `phase` nativo — a fase precisa ser inferida por posição relativa ao primeiro `Skill` ou `Task` dispatch:

- Entradas antes do primeiro `Skill` ou `SendMessage` (agente filho) = preflight
- Entradas sob o UUID do subagente (rastreável por `isSidechain: true` ou `parentUuid` de um `Task`) = delegação

Exemplo de Skill identificada nos dados reais:
```json
{ "name": "Skill", "input": { "skill": "flux:build", "args": "..." } }
```

---

### 3. Segmentação por skill invocada

O campo `input.skill` do tool\_use `Skill` contém o nome exato:

```json
// linha 354 do transcript
{
  "name": "Skill",
  "input": {
    "skill": "flux:build",
    "args": "repo: flux ..."
  }
}
```

**Para segmentar:** registre o `uuid` do assistant que invocou o Skill. Todos os `requestId` de entradas assistant cujo `parentUuid` pertence à cadeia downstream desse uuid pertencem àquela skill. O grafo precisa ser construído — não há campo `skill_phase` nativo.

---

### 4. Alternativas de medição

#### 4a. Leitura do JSONL pós-sessão (mais confiável para A/B)

Script mínimo de aggregação correta:

```python
import json
from collections import defaultdict

def session_tokens(jsonl_path):
    seen = set()
    totals = defaultdict(int)
    tools = defaultdict(int)
    
    with open(jsonl_path) as f:
        for line in f:
            obj = json.loads(line)
            if obj.get("type") == "assistant":
                rid = obj.get("requestId")
                if rid and rid not in seen:
                    seen.add(rid)
                    u = obj["message"].get("usage", {})
                    totals["input"]          += u.get("input_tokens", 0)
                    totals["output"]         += u.get("output_tokens", 0)
                    totals["cache_creation"] += u.get("cache_creation_input_tokens", 0)
                    totals["cache_read"]     += u.get("cache_read_input_tokens", 0)
                for item in obj.get("message", {}).get("content", []):
                    if isinstance(item, dict) and item.get("type") == "tool_use":
                        tools[item["name"]] += 1
    return dict(totals), dict(tools)
```

O JSONL fica em:
- `~/.claude-personal/projects/<proj-slug>/<session-id>.jsonl`
- `~/.claude/projects/<proj-slug>/<session-id>.jsonl`

#### 4b. `claude -p --output-format stream-json` (headless, benchmark reprodutível)

O objeto `result` final emitido contém tudo de uma vez — **incluindo `total_cost_usd`**:

```json
{
  "type": "result",
  "total_cost_usd": 0.013803,
  "num_turns": 1,
  "duration_api_ms": 1673,
  "usage": {
    "input_tokens": 2,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 68245,
    "output_tokens": 15
  },
  "modelUsage": {
    "claude-sonnet-5": {
      "inputTokens": 2,
      "outputTokens": 15,
      "cacheReadInputTokens": 68245,
      "costUSD": 0.013803
    }
  }
}
```

Comando de benchmark:
```bash
echo "$PROMPT" | claude -p \
  --output-format stream-json \
  --no-session-persistence \
  --bare \
  2>&1 | tail -1 | jq '{cost: .total_cost_usd, usage: .usage}'
```

`--bare` é importante para o benchmark: desativa hooks, LSP, auto-memory, skill sync, keychain. Reduz ruído de overhead variável entre runs.

Para N repetições reprodutíveis:
```bash
for i in $(seq 1 5); do
  echo "$PROMPT" | claude -p --output-format stream-json --no-session-persistence --bare \
    2>&1 | grep '"type":"result"' | jq '{run: '$i', cost: .total_cost_usd, usage: .usage}'
done
```

#### 4c. OTEL / `CLAUDE_CODE_ENABLE_TELEMETRY`

O binário expõe um subcomando `gateway` para telemetria enterprise. A variável `CLAUDE_CODE_ENABLE_TELEMETRY=1` existe na documentação pública mas não foi localizada no ambiente atual. Para o benchmark local, o JSONL ou o stream-json são suficientes e mais diretos.

#### 4d. `/cost` no REPL interativo

O comando `/cost` exibe o custo acumulado da sessão atual. Útil para inspeção manual, mas não scriptável.

---

### 5. Confounders a controlar no A/B

| Confounder | Impacto | Controle |
|---|---|---|
| **Prompt caching** | `cache_read_input_tokens` pode dominar 99% do "input" real (no exemplo real: 54 M tokens lidos do cache vs 568 input direto). O custo de cache read é ~10x menor que input normal. | Medir custo em USD (`total_cost_usd`) além de tokens. Na primeira run do dia, o cache não existe — aquecer com uma run descartada ou usar `--no-session-persistence` + ambiente fresco. |
| **Variabilidade do modelo** | Versão do binário muda (2.1.237 a 2.1.240 em 3 dias) e pode mudar modelo default. | Fixar com `--model claude-sonnet-4-5` (ou o alvo) explicitamente. |
| **Estado do repo/PR** | `git diff`, número de arquivos, tamanho do context lido mudam entre runs. | Fixar commit hash antes de cada série de runs: `git stash && git checkout <sha>`. |
| **CLAUDE.md e system reminders** | O CLAUDE.md do usuário (global + projeto) é carregado e consome tokens; skills carregam mais. `--bare` desativa auto-discovery de CLAUDE.md. | Usar `--bare` + `--system-prompt-file minimal.md` para controle explícito. |
| **MCP servers** | Cada MCP server ativo adiciona tokens ao system prompt. | `--mcp-config /dev/null` (ou arquivo vazio) para isolar. |
| **Cache ephemeral TTL** | `ephemeral_5m` vs `ephemeral_1h` — TTL curto pode expirar entre runs espaçadas. | Executar batches dentro de 5 min ou verificar qual TTL está sendo usado no campo `cache_creation`. |
| **Thinking tokens** | `output_tokens_details.thinking_tokens` pode representar fração grande do custo de output. | Reportar separadamente; `--effort low` reduz thinking. |

---

### Recomendação de mecânica para o benchmark A/B

**Setup:**
```bash
# Fixar ambiente
export MODEL="claude-sonnet-4-5"
export PROMPT_FILE="benchmark_prompt.txt"

# Run de aquecimento (descartada — popula cache)
cat $PROMPT_FILE | claude -p --output-format stream-json \
  --no-session-persistence --bare --model $MODEL > /dev/null

# 5 runs medidas
for i in $(seq 1 5); do
  result=$(cat $PROMPT_FILE | claude -p \
    --output-format stream-json \
    --no-session-persistence --bare \
    --model $MODEL 2>&1 | python3 -c "
import sys,json
for l in sys.stdin:
    try:
        o=json.loads(l)
        if o.get('type')=='result': print(json.dumps(o))
    except: pass
")
  echo "run=$i $(echo $result | jq '{cost:.total_cost_usd, input:.usage.input_tokens, output:.usage.output_tokens, cache_read:.usage.cache_read_input_tokens, cache_cr:.usage.cache_creation_input_tokens}')"
done
```

**Métrica primária:** `total_cost_usd` (já pondera os diferentes preços de input/cache\_read/output/cache\_creation).

**Métricas secundárias para breakdown:**
- `output_tokens` (trabalho gerado, correlaciona com latência)
- `cache_read_input_tokens` (overhead de contexto reutilizado — esperado ser alto nas runs 2+)
- número de tool calls por tipo (extraído do JSONL pós-run, não do stream-json)

**Para segmentar preflight vs delegação:** ler o JSONL gerado pela sessão (mesmo com `--no-session-persistence` um arquivo temporário é criado durante a run; sem essa flag, persiste normalmente) e iterar o grafo de `parentUuid` a partir do UUID do primeiro `Skill`/`Task` dispatch.