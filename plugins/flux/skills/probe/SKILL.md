---
name: probe
description: "Orquestrador `flux:probe` — investiga telemetria de produção (Sentry e Datadog) e devolve um dossiê quantificado: agrega os alvos em paralelo, testa a explicação corrente contra a física dos números, confronta o lado do cliente com o do servidor, cruza com o código real via specialists, e grava tudo no mesmo board que o `flux:issue` consome depois. Não cria issue, não posta, não muda estado na fonte. Global, resolve contexto via `flux-context.md`."
user-invocable: true
requires:
  hard:
    - file: shared/board-template.md
    - file: shared/review-agents.md
    - file: shared/flux-context.md
    - file: shared/fanout-discipline.md
    - bin: git
  soft:
    - bin: sentry
    - agent: sentry-prospector
    - agent: datadog-prospector
    - checkout_local
    - vault
---

# /flux:probe

O elo de **investigação de produção** da família `flux:`. Recebe um ou mais alvos de telemetria e
devolve o que eles **provam**, não o que o título deles sugere: distribuições com denominador,
percentis, correlações, o teste de plausibilidade que derruba a explicação errada, e o cruzamento com
o código que emite aquele sinal.

**Duas fontes, e elas cobrem lados diferentes da mesma falha.** Um rastreador de erros (Sentry) entrega
o alvo **já agrupado**: alguém decidiu que aqueles milhares de eventos são o mesmo defeito, e a
pergunta é o que a distribuição dentro dele mostra. Uma plataforma de observabilidade (Datadog) não
agrupa nada: o alvo é uma **pergunta**, e o agrupamento é construído na hora. A primeira costuma ver o
cliente; a segunda vê o servidor. A pergunta que só sai do par é a mais decisiva que este elo faz: **o
servidor viu o que o cliente relatou?**

Ele existe porque bug de produção quase nunca chega refinável. Chega como um link, um contador e uma
mensagem de erro que descreve o **último** passo da falha, raramente o primeiro. Entre esse link e uma
issue que valha a pena existir há um trabalho específico: agregar, medir e desconfiar. É esse trabalho.

Onde ele fica no ciclo:

```
        bug de produção (link de telemetria, alerta, "a escola reclamou")
                    │
                    ▼
             /flux:probe          dossiê quantificado + cruzamento com código
                    │             (não cria issue, não posta)
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   /flux:issue  /flux:refine  /flux:reply
   vira issue   escopo grande  comunica ao time
```

**Formato do board:** `${FLUX_ROOT}/shared/board-template.md`, **perfil exploração**
(`type: flux-issue`) — o **mesmo** board do `flux:issue` e do `flux:refine`, e a seção 7-octies é a
deste elo.
**Descoberta + fan-out de specialists:** `${FLUX_ROOT}/shared/review-agents.md`
**Disciplina de fan-out (regra pétrea da família):** `${FLUX_ROOT}/shared/fanout-discipline.md`
**Orçamento de contexto:** `${FLUX_ROOT}/shared/context-budget.md`
**Gates com o usuário:** `${FLUX_ROOT}/shared/hitl.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`

> **Por que o board é o mesmo do `flux:issue`.** Pelo mesmo motivo do `flux:refine`: o Step 1-bis do
> `${FLUX_ROOT}/skills/issue/SKILL.md` procura um board de exploração cujo `source` case com o pedido
> e, achando, consulta a 🔬 Achados de codebase **em vez de reprospectar**. Um board de `type` próprio
> faria o `flux:issue` disparar de novo o fan-out que este elo acabou de pagar. Uma nota por pedido,
> não uma por verbo.

## Banner de perfil — gabarito (copiar VERBATIM)

Todo output deste elo **abre** com o banner. Ele não é decoração: é o que impede uma execução
degradada de se passar por uma completa. O gabarito mora aqui, no corpo do elo, porque um gabarito
que só existe num shared não chega ao contexto na hora de emitir — e o que sai é um banner
improvisado, com campos inventados e sem o `nivel`.

Copiar com as cercas, trocando só o que está entre chaves. Regras dos campos e casos de degradação
em `${FLUX_ROOT}/shared/preflight.md`, Passo 5.

````
```
perfil: {nome do manifesto | generico}{ (ancora: alvo <path>)} · nivel: {FULL|REDUCED|THIN}
fontes: {provider} {escopo} {cobertura} [· {provider} {escopo} {cobertura}]
lentes: L1 n/a · L2 {lista|ausente|inalcancavel} · L3 {lista|ausente|inalcancavel}
degradacoes: {soft ausentes e o que se perde com cada um | nenhuma}
```
````

Como o `flux:refine`, este elo **não** resolve reviewer holístico: ele não revisa nada, investiga. O
campo `holistico:` não entra no banner e `L1` sai como `n/a`. A linha `lentes` entra porque a
qualidade do cruzamento com código depende inteiramente de haver specialists no repo.

A linha `fontes` é exclusiva deste elo e declara **o que foi de fato coletado**, uma entrada por
provider consultado. O que preenche `escopo` e `cobertura` depende da fonte, e a diferença é o ponto:

- **rastreador de erros**: `org <org> · <N> issue(s) · amostra <M de C eventos>`. Com `M < C` o dossiê
  é de amostra, e **toda** estatística do artefato herda essa ressalva. Um banner que omitisse isso
  deixaria um percentual de 100 eventos passar por percentual de 4 mil.
- **observabilidade**: `site <site> · <serviços> · janela <from → to>` e a janela de controle, quando
  houve. Aqui não existe amostra de um universo fechado: existe **janela**, e um número sem ela não é
  reproduzível.

Fonte declarada no perfil e **não consultada** entra em `degradacoes:` com o motivo, nunca some da
linha. É a diferença entre "o servidor não viu" e "eu não perguntei ao servidor".

Abortagem segue o gabarito do "Formato da mensagem de abortagem" do preflight, também verbatim, e o
nome do elo na primeira linha usa `${FLUX_CMD}` já substituído (`/flux:probe` num harness,
`/flux-probe` em outro) — nunca `flux:` literal.

## Uso

```
/flux:probe <alvo> [<mais alvos>...]
/flux:probe <alvo> --repo <slug> --window 24h
```

Um alvo é uma destas quatro formas, e o **roteamento é pela forma**, nunca por flag:

| Forma do alvo | Fonte | Prospector |
|---|---|---|
| `https://<org>.sentry.io/issues/<id>/` | rastreador de erros | `SENTRY_PROSPECTOR` |
| `<PROJETO>-<SUFIXO>` (short id) | rastreador de erros | `SENTRY_PROSPECTOR` |
| `https://app.<site>/logs?query=...` ou `/apm/traces?query=...` | observabilidade | `DATADOG_PROSPECTOR` |
| `dd:<query>` ou texto entre aspas começando por `dd:` | observabilidade | `DATADOG_PROSPECTOR` |

| Flag | Efeito |
|------|--------|
| `--repo <slug>` | Fixa o repo do cruzamento em vez de derivá-lo do projeto/serviço. Repetível. |
| `--sample <N>` | Teto de eventos agregados por alvo de rastreador. Default 100. |
| `--window <dur>` | Janela dos alvos de observabilidade. Default 24h; ignorada pelos de rastreador, que têm janela própria. |
| `--service <nome>` | Restringe os alvos de observabilidade a um serviço. Repetível. |
| `--no-code` | Só a telemetria: pula o Step 5. Para quando não há checkout ou a pergunta é só de volume. |
| `--dry` | Resolve os alvos, imprime o plano de coleta e **para**. Nada é coletado, nada é escrito. |

**Vários alvos na mesma execução são o caso interessante, não a exceção**, e isso vale nos dois eixos:

- **Mesma fonte, alvos diferentes.** Duas issues que parecem independentes e compartilham device, rota
  ou janela costumam ser o mesmo defeito visto de dois pontos do fluxo.
- **Fontes diferentes, mesmo caso.** O erro no cliente mais o log do servidor na mesma janela é o que
  responde se o request chegou. **Ausência do lado do servidor é o achado mais forte deste elo**: se o
  cliente tentou N vezes e o backend registrou zero, a falha é anterior ao servidor, e isso fecha meia
  investigação sozinho.

Testar as duas coisas é o Step 6, e ele só existe se os alvos entrarem juntos.

### Exemplos

```
/flux:probe https://acme.sentry.io/issues/7666833805/
/flux:probe PROJ-RPX PROJ-RQN --repo web-monorepo
/flux:probe PROJ-RPX "dd:service:media-api @http.status_code:5*" --window 7d
/flux:probe "dd:service:payments-api @error.type:timeout" --window 48h --service payments-api
```

## Out of scope (NUNCA faça)

- **Não crie issue.** Nem no tracker, nem em lugar nenhum. Quem cria é o `flux:issue`, que tem o gate
  de aprovação e a verificação do lote. Este elo produz o insumo dele.
- **Não mude estado na fonte.** Nada de resolver, arquivar, atribuir, comentar ou mexer em alerta.
  Investigação que altera o objeto investigado destrói a própria evidência, e é irreversível para os
  outros times que olham a mesma issue.
- **Não poste no Slack.** Comunicar é do `flux:reply`, que tem o gate de rascunho.
- **Não escreva código, não abra PR, não toque no repo alvo.** O cruzamento é leitura.
- **Não conclua com um evento.** Um evento ilustra o que a distribuição provou. Sozinho, não prova.
- **Não despache o elo seguinte.** O handoff aponta o comando e devolve o volante.

---

## Step 0-context: resolver perfil de contexto

Seguir `${FLUX_ROOT}/shared/flux-context.md`. Extrair: `TELEMETRY` (o bloco `telemetry` do manifesto,
um mapa por provider), e dele `SENTRY_PROSPECTOR` e `DATADOG_PROSPECTOR` (campo `prospector` de cada
provider; ausente → o agente da família de mesmo nome; ausente esse → `general-purpose`, com a perda
declarada). Extrair também `SPECIALISTS_ROOT`, `REPOS`, `WORKSPACE_ROOT`, `VAULT_ROOT`, `VAULT_CTX`,
`VAULT_CTX_ROOT` e `NO_EMDASH`.

Sem manifesto: perfil genérico. O que não estiver declarado é derivado do alvo quando ele é uma URL (a
org, no rastreador; a query, a janela e o site, na observabilidade) e, não sendo, **perguntado** —
nunca chutado. Sem `VAULT_ROOT` o dossiê sai no chat, e a perda é declarada no banner.

---

## Step 1 — Resolver os alvos

Parse de `"$@"`: cada argumento que casar com uma das quatro formas da tabela de Uso entra em
`TARGETS`, **carimbado com a fonte que a forma implica**. Flags conforme a mesma tabela.

- **Rastreador, URL** → `ORG` é o subdomínio, `ISSUE_ID` é o segmento numérico depois de `/issues/`.
- **Rastreador, short id** → o id resolve na coleta; a org vem do manifesto ou da pergunta.
- **Observabilidade, URL do app** → `SITE` é o domínio, e `query` e janela saem dos parâmetros da URL.
  Uma URL de app costuma trazer a janela como epoch em milissegundos: converter, e **declarar a janela
  convertida** no board, porque epoch não é legível em nota que alguém reabre em dezembro.
- **Observabilidade, `dd:<query>`** → a janela vem de `--window` (default 24h).

Sem nenhum alvo válido: **abortar** pedindo o alvo (`${FLUX_CMD}probe <url da issue | dd:<query>>`).

---

## Step 2 — Verificar a fonte antes de prometer coleta

Barato, e evita um board que nasce e não é preenchido. **Verificar só as fontes que os alvos exigem**:
uma fonte declarada no perfil e não usada nesta execução não é degradação.

**Rastreador de erros:**

```bash
command -v sentry                                        # o binário existe?
sentry auth status                                       # identidade e orgs alcançáveis
```

- **Sem binário** → declarar no banner e abortar **os alvos daquela fonte**, não o elo inteiro.
- **Autenticado, org fora da lista** → abortar dizendo qual org a sessão alcança. Perfil apontando para
  org que a credencial não serve é o erro mais confuso possível aqui.
- **Erro de TLS** (`unable to get local issuer certificate`) nos subcomandos ricos → **não é falta de
  acesso**. O caminho de coleta é `sentry api`, que passa; declarar a queda em `degradacoes:` e seguir.

**Observabilidade:**

```bash
DD=$(grep "^${TOKEN_ENV}=" "${SECRETS_FILE}" | cut -d= -f2-)      # nunca ecoar o valor
curl -s -H "Authorization: Bearer $DD" "https://api.${SITE}/api/v2/current_user"
```

- **Autenticação é `Authorization: Bearer`** com o token de usuário, não os headers de chave de org. E
  **`/api/v1/validate` responde 403 para esse token**: ele valida API key. Usar `/validate` como teste
  de acesso faz o elo concluir "sem credencial" numa máquina que tem credencial, que é a falha mais
  cara possível neste passo.
- **Sem a variável no ambiente nem no `secrets_file`** → abortar os alvos daquela fonte, dizendo qual
  variável faltou. Nunca pedir o token no chat.

Com `--dry`, parar aqui: imprimir alvos resolvidos por fonte, escopo, janela e os repos que seriam
cruzados.

---

## Step 3 — Abrir (ou retomar) o board, antes do fan-out

`source` é a chave de identidade: a lista de alvos **ordenada e normalizada** (URLs canônicas,
separadas por espaço). Procurar board de exploração cujo `source` case, nos dois lugares onde ele pode
estar (`<VAULT_ROOT>/0-inbox/`, ainda não triado, e `<VAULT_CTX_ROOT>/linear/`, já promovido pelo
`/organize`). Casou: retoma aquele. Não casou: cria em
`<VAULT_ROOT>/0-inbox/YYYY-MM-DD-HHMM-flux-probe-<slug>.md`. **Anunciar o path no chat.**

> **O infixo é `flux-probe` porque é o verbo que abriu o board**, e o `type` continua `flux-issue`
> porque o perfil é o de exploração. Os dois convivem pela mesma regra que já vale para o `flux:refine`:
> o nome do arquivo diz de onde a nota veio, o `type` diz o que ela é.

**Um alvo a mais não é um board novo.** Rodar de novo com uma issue extra sobre o mesmo caso é
retomada: acrescentar o alvo ao `source`, registrar na Timeline e seguir. Só a coleta do alvo novo é
paga.

O board nasce com uma linha em `🔧 APURANDO` por alvo de telemetria, antes do fan-out. Board que nasce
depois do trabalho é ata, não board.

**Escritor único:** a main escreve, nenhum subagente toca o arquivo
(`${FLUX_ROOT}/shared/fanout-discipline.md`).

---

## Step 4 — Coleta: um prospector por issue, em paralelo

Fan-out obrigatório. **Um prospector por alvo**, o da fonte que aquele alvo carimbou, **num único
bloco de tool calls** — alvos de fontes diferentes vão no mesmo bloco, porque são independentes entre
si e é a paralelização que torna a comparação cliente contra servidor barata.

Prompt auto-contido (o subagente não herda a conversa), com o que cada fonte precisa: para o
rastreador, a issue, a `ORG` e o `SAMPLE`; para a observabilidade, a pergunta em uma linha, a query, a
janela, a janela de controle, o `SITE`, o `TOKEN_ENV` e o `SECRETS_FILE`. Nos dois casos, a hipótese em
teste quando já houver uma.

> **A pergunta que vai ao prospector de observabilidade não é a query.** Ele constrói a query; o que
> ele precisa receber é o que se quer saber ("o backend registrou os PUTs que o cliente diz ter feito
> entre 21/08 e hoje?"). Mandar só a query devolve um número que ninguém sabe interpretar depois.

O contrato de retorno é o do agente. Duas coisas que a main confere ao receber, e que decidem se o
dossiê vale:

1. **Todo número tem denominador.** Retorno com percentual sem `n` volta como incompleto, e a linha do
   painel fica `🔧 APURANDO`, não `🟡 RASCUNHADA`.
2. **Todo achado tem veredito** (`confirma` / `refuta` / `parcial` / `sem-evidência`). Achado sem
   veredito é lido como `confirma` por quem passa os olhos, e é assim que uma suspeita vira fato.

Fan-in conforme cada alvo retorna, na **🔬 Achados de codebase** (7-quater) e na **🔭 Telemetria**
(7-octies). Prospector que falhou → `🔒 BLOQUEIA` com a causa. **Falhou não é "sem achados"**: confundir
os dois faz o dossiê afirmar que investigou o que não investigou.

---

## Step 5 — Cruzamento com o código (pulado por `--no-code`)

A telemetria diz *o quê*. O código diz *quem* e *desde quando*. Sem este passo o dossiê é um relatório
de monitoramento, não uma investigação.

**Derivar o repo** nesta ordem, parando no primeiro que resolver:

1. `--repo`, quando passado.
2. O mapa da fonte no manifesto, lido ao contrário: `TELEMETRY.sentry.projects` para um alvo de
   rastreador, `TELEMETRY.datadog.services` para um de observabilidade. O valor pode ser lista, e no
   caso de serviço pode terminar em `*`, casando por prefixo. **É o passo que mais paga**: o nome na
   fonte quase nunca é o nome do repo — no rastreador costuma ser um nome que o produto abandonou anos
   atrás, e na observabilidade o mesmo repo publica vários serviços com sufixo (`-worker`, `-consumer`,
   `-grpc`).
3. Perguntar, oferecendo os `REPOS` do perfil. Nunca inferir repo por semelhança de nome.

**Despachar um subagente por repo**, em paralelo, seguindo `${FLUX_ROOT}/shared/review-agents.md` (os
specialists do repo quando existirem; o genérico quando não). Cada um recebe perguntas **derivadas dos
achados**, nunca genéricas:

- **Quem emite este sinal?** O arquivo e a linha do `captureException` que carrega aquela tag, e o que
  está no `try` que o cerca. O nome da tag é a melhor chave de busca que existe, e é literal no código.
- **Desde quando?** O `git log` do arquivo que emite, cruzado com o `firstSeen` da issue. Issue que
  nasce dias depois de uma entrega aponta para ela — e às vezes a entrega não **causou** o defeito,
  só passou a **detectá-lo** mais cedo. As duas leituras são achados diferentes e não podem ser
  confundidas.
- **O que o código faz com a falha?** Retry, fallback, mensagem ao usuário. É onde se descobre que a
  mitigação existente não cobre o caso real, e é a recomendação mais barata do dossiê.
- **O caminho existe do lado que a outra fonte não viu?** Quando um alvo de observabilidade mostrou
  ausência no servidor, a pergunta ao specialist é onde o request morre antes de sair do cliente. É a
  ponte entre as duas fontes, e ela só se pergunta depois de ter as duas.
- **A hipótese bate com o caminho de código?** Veredito explícito contra o que a telemetria sugeriu.

Retorno com `arquivo:linha`, como todo prospector da família, **mais o SHA que o subagente de fato leu**
(`git rev-parse` do ref lido). Achado sem âncora não entra, e âncora sem SHA não vira permalink: as duas
coisas são pedidas no mesmo prompt porque, separadas, a segunda é sempre a que falta na hora de escrever.

Ao fan-in, **toda** citação de código que entrar na 🔬 Achados de codebase é permalink de blob naquele
SHA, conforme "Disciplina de links / O caso do código" do `${FLUX_ROOT}/shared/board-template.md`. Um
board de investigação é justamente o artefato que alguém reabre semanas depois, de outra máquina, e sem
o checkout: `index.ts:145` nu ali não prova nada a quem lê, e ainda envelhece em silêncio.

---

## Step 6 — Síntese na main (é fan-in, e não vai para subagente)

Item da lista fechada que fica na main (`${FLUX_ROOT}/shared/fanout-discipline.md`), porque é a decisão
mais importante do artefato: reconciliar N dossiês de telemetria com N retornos de código.

Quatro perguntas, nesta ordem:

1. **A explicação corrente sobrevive aos números?** Refazer o teste de plausibilidade do prospector com
   o código na mão. Quando ele derrubar a leitura que o time tem hoje, isso é o **primeiro** parágrafo
   do dossiê, não uma nota de rodapé.
2. **Os alvos são o mesmo defeito?** Só afirme causa comum com evidência de sobreposição: mesma
   plataforma, mesma rota, mesma janela, mesmo caminho de código. Coincidência de sintoma não basta, e
   unificar cedo demais faz duas correções virarem uma que não corrige nenhuma. Não havendo evidência,
   diga que são independentes até prova em contrário — isso também é resultado.
2-bis. **O servidor viu o que o cliente relatou?** Só existe quando as duas fontes entraram, e é a
   pergunta que mais estreita a busca. Três desfechos, e os três são achados:
   - **Viu, e falhou** → o defeito está no servidor ou entre os dois, e a próxima pergunta é o status.
   - **Viu, e respondeu bem** → o cliente falhou depois da resposta, ou a falha é de leitura do que ele
     mesmo ia enviar. Foi assim que se soube que um upload morria antes de transmitir.
   - **Não viu** → a falha é anterior ao servidor. **Antes de afirmar isso, confirme com o prospector
     que a ausência não é query errada, janela errada ou índice de log**: ausência mal apurada é a
     conclusão falsa mais convincente que este elo pode produzir, porque parece uma descoberta.

   Sem as duas fontes, esta pergunta **não é respondida**, e o dossiê diz isso em vez de deduzir.
3. **O que muda de direcional?** O que o time acredita hoje e a evidência contradiz. Frases curtas,
   cada uma com o número que a sustenta.
4. **O que a telemetria não diz?** As lacunas dos prospectors, consolidadas, com o que instrumentar
   para fechar cada uma. Lacuna não declarada vira conclusão inventada por quem lê depois.

Dessa síntese saem as **candidatas** do painel: uma linha por correção proposta, em `🟡 RASCUNHADA`,
com `Linear: n/d` e a coluna Embasamento apontando os achados que a sustentam. É o estado em que o
`flux:issue` espera encontrá-las.

**Não escreva o corpo das issues aqui.** A 7-sexies é do `flux:issue`; forçá-la neste elo é escrever
issue sem o gate que a governa.

---

## Step 7 — Consolidar e apontar o próximo elo

1. Escrever a seção **7-octies 🔭 Telemetria** do `${FLUX_ROOT}/shared/board-template.md`.
2. Rolar o carimbo de data (frontmatter `updated:`, TLDR, painel).
3. `execution_status: open` — o board segue vivo, com o rascunho por escrever. **Este elo nunca grava
   `done`**: quem fecha é o `flux:issue`, quando a issue nasce.
4. 🎯 Próximo Movimento e resposta no chat, escolhendo **um** destino conforme o que a síntese produziu,
   com o `FLUX_CMD` resolvido:

| Situação | Handoff |
|---|---|
| Correções nomeadas e cabendo em slices | `${FLUX_CMD}issue <path do board>` |
| Achado grande, sem plano de entrega ainda | `${FLUX_CMD}refine <path do board>` |
| O time precisa saber antes de qualquer código | `${FLUX_CMD}reply <permalink> --board <path>` |

Sem `VAULT_ROOT`, imprimir o dossiê no chat e avisar que sem board a coleta **será refeita** pelo elo
seguinte — é a perda concreta de não ter vault, e ela tem que ser dita.

### Por que aponta e não despacha

Despachar um irmão obriga a resolver `${FLUX_CMD}` **e verificá-lo** (Passo 1b do preflight), e hoje só
o `flux:land` paga esse preço, ao custo de ficar indisponível onde o prefixo não é verificável
(`${FLUX_ROOT}/shared/codex-compat.md`). Um elo de investigação termina com um artefato que o usuário
quer ler antes de decidir o que fazer com ele. Apontar mantém o verbo disponível nos três harnesses.

---

## Rules

- **Nenhuma conclusão sem denominador.** "A maioria falha rápido" não é achado; "728 de 756 falharam em
  menos de 1s" é. Vale para o dossiê inteiro, inclusive o TLDR.
- **Amostra é amostra.** Coletando 100 de 4 mil eventos, toda estatística carrega a ressalva, e o banner
  a declara na linha `fonte`.
- **Desconfie do título.** Ele foi escrito pela mensagem do erro, que é o último passo da falha e quase
  nunca o primeiro. O elo existe em boa parte para isso.
- **Investigar é ler.** Nada de mudar estado na fonte, no repo ou no tracker. Na observabilidade isso
  inclui monitor, dashboard, notebook e incidente: nenhum é criado, editado ou silenciado.
- **Vazio não é zero.** Ausência só vira achado depois de confirmadas a faceta, o escopo e a janela.
- **Uma rodada.** Este elo não itera sobre o próprio dossiê. O que sobrou vira lacuna declarada e
  instrumentação proposta, não uma segunda passada.
- PT-BR com acentuação correta; identificadores, nomes de tag e comandos em inglês. Sem em-dash no que
  puder ir para fora quando `NO_EMDASH == true` (o board é doc interno do vault; travessão liberado lá).
