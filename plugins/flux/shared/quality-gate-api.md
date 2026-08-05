# Diagnóstico de quality gates externos via API — dado consultável, não adivinhação

> Fonte única da mecânica de consulta a gates externos de qualidade de código (SonarCloud, SonarQube
> compatível) quando o CI falha num step que só loga `ERROR QUALITY GATE STATUS: FAILED` sem nomear
> a condição. Referenciada por `flux:iterate` (passo 2c, triagem de CI) e por `flux:land` (mini-tick
> de CI + go/no-go). **Não duplicar esta lógica** nos comandos: apontar para cá e declarar
> só o encaixe.
>
> Complementa `${FLUX_ROOT}/shared/merge-conflict-gate.md` (se pode escrever) e
> `${FLUX_ROOT}/shared/review-agents.md` (quem analisa). Este shared responde **o que falhou e por quê**.

## Princípio

Gate externo é dado consultável, não adivinhação. Quando o CI falha num quality gate do SonarCloud
ou SonarQube, a action só loga o resultado agregado — `FAILED` — sem nomear a condição que reprovou.
Deduzir a causa a partir desse log é trabalho de chute: um chute pode custar um SHA inteiro de
commits equivocados. O caso real que originou este shared: num projeto `OlaIsaac_arco-ai-plugins`,
dois pushes tentando corrigir cobertura enquanto a condição que reprovava era de vulnerabilidade em
arquivo de CI. Sem a API, a causa nunca apareceria no log.

A API do Sonar responde à mesma pergunta que o log faz silêncio — e com o token disponível na
máquina, a chamada é barata. **Consultar sempre que o step de quality gate falhar**, antes de
classificar a causa e antes de despachar qualquer executor.

**Uma tentativa por SHA continua valendo.** A API muda o diagnóstico, não a régua de tentativas.
Se consultou, classificou, tentou corrigir (quando atribuível) e a PR ganhou um push, a próxima
falha é uma nova tentativa com um SHA novo. A API não autoriza loop de auto-fix.

## O bloco `quality_gate` no manifesto

O `flux-context.json` pode declarar o bloco abaixo (todos os campos são opcionais):

```json
"quality_gate": {
  "provider": "sonarcloud",
  "host": "https://sonarcloud.io",
  "org": "olaisaac",
  "project_key_template": "OlaIsaac_{repo}",
  "token_env": "SONAR_TOKEN",
  "secrets_file": "~/.secrets"
}
```

| Campo | Default | Significado |
|-------|---------|-------------|
| `provider` | ausente | `"sonarcloud"` ou `"sonarqube"`. Ausente = sem consulta (degradação declarada). |
| `host` | `https://sonarcloud.io` quando provider=sonarcloud | URL base do servidor. |
| `org` | ausente | Organização do SonarCloud (parâmetro `organization=`). Ignorado para SonarQube. |
| `project_key_template` | ausente | Template com `{repo}` substituído pelo slug do repo, como `specialists_root` já faz. Ausente = sem chave de projeto = sem consulta. |
| `token_env` | `SONAR_TOKEN` | Nome da variável de ambiente com o token. |
| `secrets_file` | `~/.secrets` | Arquivo de secrets no formato `KEY=value`, sem `export`, uma chave por linha, comentários com `#`. |

Quando qualquer campo indispensável estiver ausente (sem `provider`, sem `project_key_template` ou
sem token encontrado), cair em **degradação declarada** (ver seção abaixo).

## Resolução do token — nunca ecoar, nunca gravar

A sessão de um subagente não herda variáveis de ambiente carregadas interativamente no shell do
usuário. Ler a chave diretamente do arquivo de secrets, assim (substituindo `SONAR_TOKEN` pelo
valor de `token_env` quando configurado diferente):

```bash
TOKEN=$(grep -E '^SONAR_TOKEN=' ~/.secrets | cut -d= -f2-)
```

Regras de segurança, sem exceção:

- **Nunca ecoar o valor** do token: nenhum `echo "$TOKEN"`, nenhum log de debug que o exponha.
- **Nunca gravar o token** no board, na PR, no vault, em nenhum arquivo de saída. Usar sempre o
  nome da variável ou o placeholder `<TOKEN>` ao exemplificar.
- **Autenticar via header**, não via `--user`:
  ```bash
  curl -s -H "Authorization: Bearer $TOKEN" "<url>"
  ```
  A flag `-u sonar:$TOKEN` expõe o token em `ps aux` e em logs de shell.
- **Avisar quando o arquivo de secrets for legível por outros** (permissão diferente de `600`
  ou `400`). Uma linha, sem travar o fluxo:
  ```bash
  PERM=$(stat -f "%OLp" ~/.secrets 2>/dev/null || stat -c "%a" ~/.secrets 2>/dev/null)
  [ "$PERM" != "600" ] && [ "$PERM" != "400" ] && \
    echo "⚠ ~/.secrets está com permissão $PERM — legível por outros. Considere: chmod 600 ~/.secrets"
  ```

## Sequência de diagnóstico

Duas etapas, em ordem. A segunda é guiada pelo resultado da primeira.

### Etapa 1 — Quais condições falharam e com que números

Resolver o `PROJECT_KEY` aplicando `{repo}` no `project_key_template` (mesmo mecanismo do
`specialists_root`). Codificar o nome da branch para URL:

```bash
PROJECT_KEY="OlaIsaac_${REPO_SLUG}"          # ou conforme project_key_template
BRANCH_ENC=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read().strip()))' <<< "$BRANCH")

curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "${HOST}/api/qualitygates/project_status?projectKey=${PROJECT_KEY}&branch=${BRANCH_ENC}"
```

A resposta traz, para cada condição que reprovou, os campos `status`, `metricKey`, `comparator`,
`errorThreshold` e `actualValue`. Extrair só as condições com `status == "ERROR"`:

```bash
curl -s ... | python3 -c "
import json,sys
d=json.load(sys.stdin)
for c in d.get('projectStatus',{}).get('conditions',[]):
    if c.get('status')=='ERROR':
        print(c['metricKey'], c['actualValue'], c['comparator'], c['errorThreshold'])
"
```

**Armadilha documentada (caso real):** sem token em projeto privado, a API responde:

```json
{"errors":[{"msg":"Project doesn't exist"}]}
```

Isso **não significa que o projeto não existe**: significa falta de credencial ou chave de projeto
errada. Ao ver `"Project doesn't exist"` com token configurado, verificar primeiro se o token está
correto e se o `project_key` bate com o da UI do Sonar. Nunca tratar essa resposta como "projeto
ausente" e parar a consulta: é sinal de autenticação, não de ausência.

### Etapa 2 — Detalhe guiado pela condição

Com a lista de condições em `ERROR`, chamar a API específica de cada uma:

**Vulnerabilidade ou bug (`new_vulnerabilities`, `new_bugs`):**

```bash
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "${HOST}/api/issues/search?componentKeys=${PROJECT_KEY}&branch=${BRANCH_ENC}&types=VULNERABILITY,BUG&inNewCodePeriod=true&ps=20" \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
for i in d.get('issues',[]):
    print(i.get('rule'), i.get('severity'), i.get('component'), i.get('line'))
"
```

Retorna: regra (`githubactions:S8541`), severidade, componente (path relativo ao projeto) e linha.
Com esses dados é possível ir direto ao arquivo e à linha sem leitura especulativa.

**Cobertura de código novo (`new_coverage`, `new_uncovered_lines`):**

```bash
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "${HOST}/api/measures/component_tree?component=${PROJECT_KEY}&branch=${BRANCH_ENC}&metricKeys=new_uncovered_lines,new_lines_to_cover&s=metric&metricSort=new_uncovered_lines&asc=false&qualifiers=FIL"
```

Retorna, por arquivo, quantas linhas novas há a cobrir (`new_lines_to_cover`) e quantas estão sem
cobertura (`new_uncovered_lines`). Com isso se vê quais arquivos puxam a métrica para baixo e se
são arquivos de teste sendo contados como código de produção (armadilha documentada abaixo).

**Hotspot de segurança (`new_security_hotspots`):**

```bash
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "${HOST}/api/hotspots/search?projectKey=${PROJECT_KEY}&branch=${BRANCH_ENC}&status=TO_REVIEW"
```

Retorna os hotspots pendentes de revisão na branch. Hotspot não é vulnerabilidade confirmada: é
ponto que requer revisão humana no dashboard do Sonar para ser marcado como revisado ou como falso
positivo. Não se resolve por código (ver mapa abaixo).

## Mapa condição → ação (a parte mais útil)

A condição que reprovou determina o caminho. O elo usa este mapa antes de despachar qualquer executor:

| Condição (`metricKey`) | Resolve por código? | Ação do elo |
|------------------------|---------------------|-------------|
| `new_vulnerabilities`, `new_bugs` | **Sim**, na maioria | Despachar executor com o `arquivo:linha` da Etapa 2. Verificar se a regra faz sentido no contexto (ver armadilha de Actions). Se o path do componente for `.github/workflows/`, a "vulnerabilidade" está no workflow de CI, não no código de produto — corrigir o workflow, não o código. |
| `new_coverage` | **Às vezes** — ver armadilhas | Se a queda vem de código não coberto (arquivo de produção), despachar executor para adicionar testes. Se `component_tree` mostrar o caminho num arquivo de teste medido como código de produção, a causa é configuração de análise e **não se resolve adicionando testes**: cada teste novo piora a métrica. Reportar ao usuário como pendência de configuração. |
| `new_duplicated_lines_density` | Sim | Despachar executor com os arquivos duplicados da Etapa 2. |
| `new_maintainability_rating`, `new_reliability_rating`, `new_security_rating` | Sim, quando há issue específica | Consultar a Etapa 2 (`issues/search`) para achar a issue que reprovou o rating. Tratar como vulnerabilidade/bug a partir daí. |
| `new_security_hotspots` | **Não** | Hotspot exige revisão humana no dashboard do Sonar (marcar como revisado ou falso positivo). Nenhum código elimina a pendência automaticamente. Reportar como `pendência humana: hotspot a revisar em <url-do-sonar>` e não tentar corrigir. |

**Regra da configuração de análise:** quando a causa raiz está em como o Sonar analisa o projeto
(arquivo de teste contado como código de produção, exclusão ausente, cobertura calculada sobre
arquivo gerado), a correção está em `sonar-project.properties` ou na configuração do projeto na UI,
não no código funcional. O elo reporta a causa com a evidência da API, declara como não atribuível
por código e trata como pendência humana.

## Armadilhas documentadas (caso real, 2026-08-05)

**Armadilha 1 — Fix de cobertura que introduz vulnerabilidades de Actions.** No projeto
`OlaIsaac_arco-ai-plugins`, branch `gripp-w-claude/aiprod-609-guardrail-push-main`: para satisfazer
o gate de cobertura, foi adicionado um step de CI no workflow do GitHub Actions. Esse step introduziu
duas vulnerabilidades detectadas pelo Sonar:

- `githubactions:S8541` — omissão de `--no-build` num step que constrói algo como efeito colateral.
- `githubactions:S8544` — invocação `uv run` sem versão travada, permitindo execução de código
  não auditado.

O gate passou de `new_coverage failing` para `new_vulnerabilities failing`, e a causa nova não
estava visível no log do CI — apenas no `issues/search` da API. Sem a API, a segunda tentativa de
correção teria atacado a cobertura de novo, produzindo um terceiro push equivocado.

**Lição:** mexer no arquivo de CI para satisfazer o gate cria código novo que o próprio gate
analisa. Esse código novo pode introduzir um tipo diferente de falha. O diagnóstico da API revela
qual é o tipo antes de qualquer tentativa de correção.

**Armadilha 2 — Arquivo de teste medido como código de produção.** Se `component_tree` mostrar
`new_uncovered_lines > 0` num arquivo cujo path contém `test`, `spec`, `__tests__`, `.test.`, ou
caminho de diretório `tests/`, suspeitar de configuração de análise incorreta. Nesse caso:
- Não adicionar testes para cobrir o arquivo de teste (piora a métrica porque aumenta linhas de
  "código de produção" sem cobertura).
- Não reportar como "cobertura de código insuficiente" (a descrição enganaria o executor).
- Reportar: `cobertura baixa em arquivo de teste medido como código de produção — causa é
  configuração de análise Sonar, não falta de teste`. Pendência humana.

## Degradação declarada

Sem token, sem manifesto, sem `provider` ou sem `project_key_template`, o elo volta ao comportamento
anterior a este shared:

1. Reporta o gate vermelho com link do log do CI.
2. Classifica como gate de qualidade externo não atribuível por código (comportamento conservador:
   quando a causa é desconhecida, conservador é melhor que equivocado).
3. Trata como pendência humana.
4. **Declara a perda no banner de perfil:**
   `quality gate: diagnóstico Sonar indisponível (sem manifesto / sem token) — gate tratado como pendência humana`.

A degradação é declarada, não silenciosa. O usuário sabe que o elo não pôde consultar a API e por
que o diagnóstico ficou impreciso, o que ainda é melhor que dizer que a causa é conhecida quando não é.
