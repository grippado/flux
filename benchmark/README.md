# Benchmark A/B — Step 0 mecânico (flux-cli) vs agentico

Mede quanto o atalho mecânico do Step 0 (`shared/step0-cli.md` + subcomandos `flux preflight` e
`flux gather pr`) economiza em custo, tokens e tool calls, para fundamentar a RFC de arquitetura
de fluxo. Insumos da pesquisa que desenhou este protocolo: `research/`.

## Hipóteses

- **H0:** o Step 0 via CLI não muda custo/latência de forma relevante (Δ < 10%).
- **H1:** reduz ≥ 15% do custo USD e ≥ 20% dos tool calls mecânicos em ≥ 2 de 3 cenários.

## Desenho

Os dois braços rodam com **prompt idêntico** — quem alterna é o ambiente:

| Braço | Ambiente | Efeito |
|---|---|---|
| A | stub `flux` que sai com exit 127 na frente do PATH | a skill cai no fallback agentico integral |
| B | binário `flux` real no PATH | a skill usa o atalho do `step0-cli.md` |

Isso elimina o viés de autor de prompt: não existe "prompt B" para calibrar.

- N = 8 runs medidas por braço por cenário, mais 1 run de aquecimento por braço (descartada).
- Braços intercalados (A, B, A, B, ...) para distribuir drift temporal.
- Modelo fixo por série (default `claude-sonnet-5`), `--strict-mcp-config` para não carregar MCPs,
  `claude --version` registrado no diretório de resultados.
- Alvos congelados por `freeze.sh` (diff + SHA256); verificar o hash antes de cada série.

## Pré-requisito da série real

O braço B só difere do A se a skill carregada na sessão headless tiver o bloco `Step 0-cli`
(branch `bench/step0-cli`). O plugin em cache (`~/.claude*/plugins/cache/flux/...`) é a versão
publicada — **sem** o bloco, os dois braços se comportam igual e o benchmark mede ruído. Antes da
série: instalar o checkout desta branch como marketplace local (`claude plugin marketplace add
<path-do-checkout>` + reinstalar o plugin flux a partir dele), e registrar no diretório de
resultados qual versão de skill a sessão carregou. O dry-run de plumbing (runner + parser) pode
rodar com a skill publicada.

## Como rodar

```bash
./freeze.sh C1 OlaIsaac/gravity-design-system 1053
./freeze.sh C3 OlaIsaac/gravity-design-system 1055
cp scenarios.example.json scenarios.json   # ajustar ids/dirs/prompts

./run.sh scenarios.json 8 claude-sonnet-5
python3 parse_phase.py results/<timestamp>
python3 analyze.py results/<timestamp>
```

`run.sh` grava um `results.jsonl` (custo, tokens, duração por run, via `claude -p
--output-format json`; no claude 2.1.240 esse formato emite um ARRAY de eventos com o `result` no
fim, e o extrator aceita array e objeto). `parse_phase.py` localiza o transcript de cada
`session_id` e segmenta a fase mecânica (até o primeiro dispatch de `Task`/`Agent` — `Agent` é o
nome real do tool no harness atual, verificado em transcript; `Task` cobre transcripts antigos; o
`SendMessage` citado em `research/benchmarkDesign.md` estava errado), deduplicando usage por
`requestId` — a mesma requisição aparece 2-3x no JSONL por streaming. `analyze.py` emite a tabela
final (mediana A vs B, Δ%, IC 95% via bootstrap) em `report.md`.

## Métricas

| Métrica | Fonte | Papel |
|---|---|---|
| `cost_usd` | result do `claude -p` | primária — pondera input/cache/output automaticamente |
| `output_tokens` | idem | proxy de latência de geração |
| `duration_api_ms` / `wall_s` | idem / runner | latência |
| tool calls mecânicos | `parse_phase.py` | volume de round-trips eliminado |
| % mecânico (não-cache) | `parse_phase.py` | quanto da sessão era pré-work |

## Critério de adoção (todos obrigatórios)

- Δ custo USD ≥ 15%
- Δ tool calls mecânicos ≥ 20%
- ≥ 2 de 3 cenários positivos
- IC 95% do Δ de custo não cruza zero

## Ameaças à validade

| Ameaça | Mitigação |
|---|---|
| Prompt caching entre runs | aquecimento descartado; braços intercalados; série contínua |
| Drift do alvo (threads novas em PR) | PRs mergeadas antigas; SHA256 do diff conferido por série |
| Drift de modelo/binário | modelo fixo; `claude --version` e schema do flux registrados |
| MCPs/config da máquina | `--strict-mcp-config`; mesmo cwd por cenário |
| Variância do modelo | mediana + IC 95% bootstrap, nunca média de poucos runs |
| Efeitos colaterais da skill | prompts pedem sem-vault/sem-post (igual nos dois braços); `--solo` no review para tirar a variância do fan-out de specialists |
| Custo do braço B fora do modelo | latência do CLI aparece em `wall_s`; manutenção do CLI entra como offset na narrativa da RFC |

Limitações a declarar na RFC: amostra de conveniência (3 PRs), benchmark mede exclusivamente
`claude -p` (Cursor/Codex ficam como extrapolação), e `--solo` remove o custo dos specialists dos
dois braços igualmente.
