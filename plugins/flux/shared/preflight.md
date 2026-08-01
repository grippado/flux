# Preflight da família `flux:` — falhar bem em vez de rodar mal

> Fonte única do protocolo de verificação de pré-requisitos. Todo elo `flux:*` abre chamando este
> shared, **antes** de qualquer trabalho. Não duplicar esta lógica dentro dos comandos.
>
> **Princípio:** um elo só roda se o resultado for confiável. Quando não for, ele para e diz
> exatamente o que falta. Rodar em modo degradado silencioso é pior do que não rodar, porque produz
> um artefato que parece válido e não é.

## Passo 1 — Resolver `FLUX_ROOT`

Todo path para `shared/` e `agents/` da família é escrito como `${FLUX_ROOT}/...`. Resolver nesta
ordem, parando no primeiro que existir:

1. `${CLAUDE_PLUGIN_ROOT}` — quando a família roda instalada como plugin.
2. O diretório dois níveis acima do arquivo do comando em execução (de `commands/flux/<verbo>.md`
   sobe para a raiz da instalação). Se o comando foi carregado por symlink, resolver o alvo real
   antes de subir (`readlink -f`).
3. `${FLUX_HOME}` — raiz declarada no ambiente, quando o instalador exporta a variável.

Se nenhum resolver, é `UNAVAILABLE`: abortar informando que a instalação da família não foi
localizada.

## Passo 2 — Verificar os requisitos declarados

Cada elo declara no frontmatter:

```yaml
requires:
  hard:                          # ausente => UNAVAILABLE, aborta antes de trabalhar
    - file: shared/review-legend.md
    - bin: git
    - agent: ${HOLISTIC}
  soft:                          # ausente => degrada e DECLARA no output
    - bin: gh
    - checkout_local
    - vault
```

Tipos de requisito:

| tipo | como verificar |
|------|----------------|
| `file: <path>` | existe em `${FLUX_ROOT}/<path>` |
| `bin: <nome>` | `command -v <nome>` retorna zero |
| `agent: <nome>` | ver Passo 3 |
| `checkout_local` | o alvo tem checkout local acessível para leitura de contexto |
| `vault` | `VAULT_ROOT` resolvido e o diretório existe |
| `mcp: <prefixo>` | as tools daquele prefixo estão disponíveis na sessão |

**Regra de fronteira:**

- Faltou um `hard` → **abortar**. Não produzir artefato parcial, não gravar nada, não postar nada.
- Faltou um `soft` → **seguir**, e declarar a perda no banner do Passo 5.

## Passo 3 — Resolver e VERIFICAR o agente holístico

Este passo existe porque a falha mais perigosa da família é resolver um nome de agente e invocá-lo
sem checar se ele existe. Quando isso acontece, ou a invocação falha no meio do trabalho, ou o
modelo improvisa um parecer inline fora do contrato de saída.

Resolver `HOLISTIC` **nesta ordem**, parando no primeiro que existir:

1. `holistic_reviewer` do `flux-context.json`, quando há manifesto.
2. Override local do repositório: `<repo-checkout>/.claude/agents/reviewer.md`.
3. Genérico da família, **tentando as duas formas nesta ordem**: `flux:pr-reviewer` e depois
   `pr-reviewer`.

> **Por que duas formas do genérico.** Instalado via marketplace, o agent do plugin é registrado
> **com o prefixo do plugin**: `flux:pr-reviewer`. Num checkout direto (ou com o agent copiado para
> `~/.claude/agents/`), ele é `pr-reviewer`, sem prefixo. As duas instalações são legítimas, então o
> preflight aceita as duas e para na primeira que existir. Resolver só a forma sem prefixo faria a
> família abortar em toda instalação por plugin, que é o caminho recomendado do README.

Depois de resolver, **verificar que o agente existe** antes de invocar.

- Existe → seguir.
- Não existe → `UNAVAILABLE`. Abortar nomeando **qual** agente foi procurado e **onde**. Quando o
  que falhou foi o genérico, dizer as duas formas tentadas (`flux:pr-reviewer` e `pr-reviewer`), para
  que quem instalou de um jeito diferente saiba o que declarar no manifesto.

> **Nunca improvisar um reviewer inline.** Um parecer produzido fora do contrato de saída não é
> comparável com os demais e contamina qualquer métrica de qualidade agregada sobre os artefatos.

> **Caminho canônico do override local:** `<repo-checkout>/.claude/agents/reviewer.md`. Este é o
> único caminho válido. Qualquer outro nome de arquivo não é procurado.

## Passo 4 — Classificar o nível de capacidade

| nível | condição | comportamento |
|-------|----------|---------------|
| `FULL` | manifesto + specialists disponíveis + checkout local | pipeline completo |
| `REDUCED` | holístico + checkout local, sem specialists | roda; marca o parecer como reduzido |
| `THIN` | só o diff, sem checkout local | roda; **viés obrigatório para `question`** em vez de `request-change` quando o veredito depender de contexto não verificável |
| `UNAVAILABLE` | falta requisito `hard` | **aborta** com instrução acionável |

O nível `THIN` não é licença para adivinhar. Ele existe para tornar explícito um estado que já
ocorre na prática, e a contrapartida é que o elo passa a preferir perguntar a afirmar.

## Passo 5 — Banner de perfil (obrigatório em todo output)

Todo elo abre seu output com o banner. Ele não é decoração: é o que impede um parecer degradado de
se passar por um parecer completo.

```
perfil: {nome do manifesto | generico} · nivel: {FULL|REDUCED|THIN} · holistico: {agente}
lentes: L1 {agente} · L2 {lista|ausente} · L3 {lista|ausente}
degradacoes: {lista dos soft ausentes e o que se perde com cada um | nenhuma}
```

A linha `lentes` sai em todo elo que reconcilia review (`flux:review`, `flux:iterate`, `flux:land`)
**e também no `flux:build`**, com as três camadas de `${FLUX_ROOT}/shared/review-agents.md`. O build
não usa as lentes para executar, mas é frequentemente o primeiro elo a tocar um repo novo, e é onde
se descobre que ele está sem cobertura: sem a linha, a oferta de Bootstrap no fim chegaria sem
contexto nenhum. **Camada ausente é
declarada, nunca omitida**: é a diferença entre "o repo não tem specialists" e "eu não procurei".

Exemplo em máquina sem configuração alguma:

```
perfil: generico · nivel: THIN · holistico: pr-reviewer
lentes: L1 pr-reviewer · L2 ausente (perfil sem specialists_root) · L3 ausente (repo sem agents de review)
degradacoes: sem checkout local (contexto arquitetural nao verificavel; findings dependentes de
contexto saem como question); sem vault (parecer nao persiste)
```

Exemplo num repo que tem suite própria mas nenhuma suite curada:

```
perfil: pessoal · nivel: REDUCED · holistico: pr-reviewer
lentes: L1 pr-reviewer · L2 ausente (sem suite curada para 'aiterm') · L3 ausente (repo sem agents de review)
degradacoes: sem specialists (scouters e auditors de dominio nao rodam; a review cobre o
cross-cutting mas nao os padroes especificos do repo) — rode o Bootstrap para criar a suite
```

Quando o nível for `FULL` e não houver degradação, o banner ainda assim é impresso. A consistência é
o que permite comparar execuções.

## Formato da mensagem de abortagem

Ao abortar, dizer o que falta, onde foi procurado e o que fazer. Nunca abortar com mensagem genérica.

```
flux:{verbo} nao pode rodar de forma confiavel.

Faltando (hard):
  - agent: pr-reviewer          procurado em ~/.claude/agents/ e no plugin
  - file: shared/review-legend.md   procurado em {FLUX_ROOT}/shared/

Como resolver:
  - instale a familia flux: (ou rode /flux:bootstrap)

Nada foi lido, gravado ou postado.
```

A última linha importa: quem recebeu um abort precisa saber que nenhum efeito colateral ocorreu.
