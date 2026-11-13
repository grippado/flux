---
name: tell
description: "Orquestrador `flux:tell` — conta um caso de trabalho pra fora: lê um ou mais boards do vault e redige uma página de caso (o que entrou, que verbos rodaram, o que o gate pegou, o que saiu), neutraliza tudo que é do time (pessoas, org, repos, tickets, hosts) e entrega um HTML autocontido. Publica como Artifact no Claude Code e como site no Codex (Sites), e degrada para o HTML local no Cursor ou sem canal. Nunca inventa número, nunca publica com suspeita de vazamento aberta, nunca publica sem gate. Global, resolve contexto via `flux-context.md`."
user-invocable: true
requires:
  hard:
    - file: shared/flux-context.md
    - file: shared/publish-channel.md
    - file: shared/hitl.md
    - file: shared/board-template.md
  soft:
    - vault
    - publish_channel
---

# /flux:tell

Todo caso que passa pela família deixa um board: o que entrou, o que cada verbo achou, onde o gate
parou, o que saiu. O `tell` pega esse rastro e conta a história pra quem não estava lá, numa página
que dá pra mandar. É o elo que faz o trabalho virar exemplo sem ninguém reescrever do zero.

**Canal de publicação:** `${FLUX_ROOT}/shared/publish-channel.md`
**Gates:** `${FLUX_ROOT}/shared/hitl.md`
**Formato do board lido:** `${FLUX_ROOT}/shared/board-template.md`
**Resolução de contexto:** `${FLUX_ROOT}/shared/flux-context.md`
**Preflight:** `${FLUX_ROOT}/shared/preflight.md`

> **O que este verbo não faz.** Não posta em canal de time, não manda link pra ninguém, não muda
> compartilhamento da página, não edita o board de origem. Lê o vault, escreve um HTML e uma nota
> companheira, e publica privado depois do gate.

## Step 0-alvo: parsear o alvo

```
/flux:tell <board>            → um board do vault (path, nome do arquivo ou slug)
/flux:tell <board> <board>…   → um caso que atravessou vários boards (refine → issue → build → review)
/flux:tell <run-id>           → os boards ligados a uma run de ~/.flux/runs
/flux:tell <html>             → republicar um HTML que o próprio tell gerou (sem redigir de novo)
/flux:tell                    → perguntar qual caso, listando os boards mais recentes do 0-inbox
```

Só classificar a string. A âncora de contexto é o board (o `context:` do frontmatter dele), não o
`cwd`: um board de trabalho contado a partir do home continua usando o perfil de trabalho, e é o
perfil que alimenta a lista de neutralização.

Vários boards de perfis diferentes → abortar. Um caso que mistura trabalho e pessoal não é um caso.

## Step 0-preflight

Seguir `${FLUX_ROOT}/shared/preflight.md`. Neste verbo:

1. Resolver `FLUX_ROOT`, `HARNESS`, `FLUX_VERSION`, `MODEL` e `EFFORT` (1a-harness).
2. Resolver o perfil pela âncora e extrair `VAULT_ROOT`, `NO_EMDASH` e o bloco `publish` do
   manifesto (ver "Manifesto" abaixo). Todos os outros campos do perfil entram **só como insumo da
   lista de neutralização**, nunca como conteúdo.
3. Resolver `PUBLISH_CHANNEL` por `${FLUX_ROOT}/shared/publish-channel.md`, "Resolver o canal".
4. Nível: `FULL` com vault e canal hospedado; `REDUCED` com vault e canal `local`; `THIN` sem
   vault (alvo veio por path e o destino do HTML precisa de `--save <dir>` ou do GATE de destino).

Banner, primeira linha sempre:

```
perfil: {nome|generico} · nivel: {FULL|REDUCED|THIN} · boards: {n}
canal: {artifact|sites|local} · arquivo: {path} · degradacao: {…|nenhuma}
carimbo: {harness} | flux:tell@{flux_version}
```

## Step 1: colher o caso (read-only)

Ler cada board inteiro. Extrair, **com a linha de origem de cada item**:

- o **gatilho**: o que entrou (pedido, thread, bug, mock) e quando;
- a **linha do tempo**: cada verbo que rodou, em ordem, com horário;
- os **gates**: onde parou, o que foi apresentado, o que a pessoa escolheu;
- os **achados que mudaram o rumo**: recusa de escopo, finding de review, causa real de um probe;
- o **resultado**: o que saiu (PR, issues, decisão), e o que ficou pendente;
- os **números** que o board registra (tempo, contagem de issues, diff, findings).

Guardar como `CASE` em memória. Nada é escrito nesta etapa.

**Regra pétrea: só o que o board diz.** Número, horário, citação e resultado vêm do board, com
linha de origem. Dado ausente fica ausente; não se estima, não se arredonda pra cima, não se
completa com "provavelmente". Uma página de caso com um número inventado é marketing; com um
número verdadeiro, é evidência, e é por isso que ela convence.

## Step 2: redigir a história

Montar o texto da página a partir do `CASE`, nesta ordem fixa:

1. **Título** que nomeia o caso pelo efeito, não pelo verbo ("Do mock ao PR numa tarde").
2. **Abertura** em duas ou três frases: o que precisava acontecer e por que não era trivial.
3. **O caminho**: a linha do tempo, um item por verbo, cada um com o que entrou e o que saiu.
   Gates marcados como gates.
4. **O que o gate pegou**: o momento em que a pessoa decidiu algo que o agente não decidiria. É o
   coração da página: mostra o desenho de "o agente propõe, a pessoa decide" funcionando.
5. **O resultado**, com os números do board.
6. **Como repetir**: os comandos do caso, na forma do `FLUX_CMD` resolvido, e o link do flux.

Escrita: frases curtas, voz ativa, sem jargão interno sem explicação. Com `NO_EMDASH == true`, sem
travessão (a página é texto público). Língua: a do board, salvo `--lang <xx>`.

## Step 3: neutralizar (o passo que protege o time)

A página sai do contexto do time. Tudo que identifica o time, as pessoas ou a infraestrutura dele
é trocado **antes** de o HTML existir. A troca é determinística e registrada, nunca um "dei uma
limpada".

**De onde vem a lista do que trocar:**

| fonte | exemplos do que entra |
|---|---|
| manifesto do perfil | `linear_org`, cada item de `repos`, o basename de `workspace_root`, `vault_context`, a org de `specialists_repo`, as orgs de `telemetry`, as chaves de `tracker_repo_map` |
| `publish.redact` do manifesto | termos extras que o usuário declarou, com o substituto de cada um |
| o próprio board | pessoas (autores, menções, participantes da thread), nomes de canal |
| detectores | chave de ticket (`[A-Z][A-Z0-9]+-\d+`), URL de GitHub/Linear/Slack/Sentry/Datadog com org, e-mail, path absoluto de home, hostname interno, número de PR/issue, SHA, qualquer coisa com cara de segredo |

**Para o que trocar** (o mesmo termo vira sempre o mesmo substituto na página inteira):

- org, empresa, time → `acme` (ou o `publish.alias` do manifesto);
- repo → nome genérico pelo papel (`api-gateway`, `web-app`, `design-system`), estável no caso;
- pessoa → papel, nunca nome nem inicial ("um colega", "a pessoa revisora", "eu" para o dono do
  vault quando ele mesmo conta);
- ticket → `TICKET-1`, `TICKET-2`, na ordem de aparição; PR → `PR #1`, `#2`;
- URL interna, host, path, e-mail, SHA → removidos (o texto fica, o endereço sai);
- segredo ou credencial → **abortar a execução** e apontar a linha do board. Não é caso de trocar.

**Suspeitas.** O que os detectores acham e a lista não cobre (um nome próprio que não está no
manifesto, um termo em caixa alta que pode ser produto interno) vira **suspeita aberta**: fica
marcado na nota companheira com a linha, e a página não pode ser publicada enquanto houver uma. A
pessoa resolve cada uma no gate: trocar (e por quê), manter (é público), ou remover.

Guardar o resultado como `REDACTION_REPORT`: cada troca (original → substituto, contagem) e cada
suspeita (trecho, linha, estado).

## Step 4: gravar o HTML e a nota companheira

Montar o HTML seguindo `${FLUX_ROOT}/shared/publish-channel.md`, "O HTML que serve aos três":
arquivo único, sem rede, claro e escuro, legível no celular.

**Destino:**

- com vault: `<VAULT_ROOT>/0-inbox/YYYY-MM-DD-HHMM-flux-tell-<slug>.html` e a nota companheira
  `…-flux-tell-<slug>.md` ao lado. Escrever no vault não tem gate (`hitl.md`, "O que NÃO precisa
  de gate");
- sem vault: `--save <dir>` (degrau 1 de `${FLUX_ROOT}/shared/write-destination.md`), ou o GATE
  de destino daquele contrato. Nunca dentro do repo de onde o caso veio.

Alvo `<html>` (republicar): pular os Steps 1 a 3, reler o arquivo e a nota companheira, e reabrir
só as suspeitas que a nota ainda tem abertas.

**A nota companheira** é interna (vai pro vault, não pro canal) e guarda:

- frontmatter com o bloco `provenance` de `${FLUX_ROOT}/shared/board-template.md`
  (`generator: "flux-tell"`, verbo `tell` no `stamp`) e `source_boards:` com os paths lidos;
- o `REDACTION_REPORT` completo, com as suspeitas e o que se decidiu sobre cada uma;
- o mapa de afirmações: cada número e cada horário da página ao lado da linha de board que o
  sustenta;
- a seção "Publicações" (canal, link, data, harness), preenchida no Step 5.

**Cross-link:** acrescentar no board de origem, seção de proveniência, a linha
`contado em: <path da nota companheira>`. É a única escrita no board, e é anotação, não edição do
conteúdo.

## Step 5: publicar (GATE)

| `PUBLISH_CHANNEL` | o que acontece |
|---|---|
| `artifact` | GATE `publish` de `publish-channel.md`; aprovado → publicar o HTML pela ferramenta de Artifact da sessão, **privado**; já publicado antes neste canal → atualizar o mesmo link |
| `sites` | GATE `publish`; aprovado → publicar o HTML pelo plugin Sites da sessão; já publicado antes neste canal → atualizar o mesmo site |
| `local` | sem GATE: não há o que publicar. Imprimir o path e o `file://` do HTML |

O GATE usa a `GateSpec` de `publish-channel.md` e acrescenta ao `state` o título, os boards de
origem e o total de trocas. A recusa do canal (plano, permissão, rede) não vira tentativa em outro
lugar: registrar o motivo literal na nota, cair para `local` e declarar no banner.

Depois de publicar: gravar canal, link e data em "Publicações" na nota companheira.

## Fechamento

Imprimir no chat, nesta ordem:

1. o banner;
2. título da página e o link (ou o path local);
3. o resumo da redação: `trocas: {n} · suspeitas: {abertas}/{total}`;
4. esta linha, com `FLUX_CMD` resolvido no preflight, nunca `/flux:` literal:

```
A página foi publicada privada. Compartilhar, abrir ao público ou mandar o link é com você, pela interface do {canal}. Para refazer depois de editar o HTML à mão, rode `${FLUX_CMD}tell <path do html>`.
```

No canal `local`, a primeira frase vira: `O arquivo está só na sua máquina; abra no navegador para ver.`

## Manifesto

Bloco opcional no perfil. Sem ele, o verbo funciona com os defaults abaixo.

```json
"publish": {
  "channel": "auto",
  "alias": "acme",
  "redact": { "Nome Real Do Produto": "o app", "nome-de-um-canal": "o canal do time" },
  "lang": "pt"
}
```

- `channel` — `auto` (default: resolver por `publish-channel.md`) ou `local` (nunca publicar
  daqui). Não aceita forçar `artifact` nem `sites`: o canal é o que a sessão expõe.
- `alias` — substituto da org/empresa. Default `acme`.
- `redact` — termos extras e o substituto de cada um. Soma à lista automática, não a substitui.
- `lang` — língua da página quando difere da do board.

## Flags

| Flag | Efeito |
|------|--------|
| `--local` | Não publica; entrega só o HTML local (rebaixa o canal, nunca promove) |
| `--save <dir>` | Destino do HTML e da nota quando não há vault, ou quando você quer outro lugar |
| `--lang <xx>` | Língua da página |
| `--no-redact` | **Não existe.** Uma página sem neutralização é o board copiado; para isso, abra o board |
