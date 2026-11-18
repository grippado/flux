# Diretório do Slack — alias de pessoa e canal resolvido pelo manifesto

> Fonte única do formato do diretório e da regra que transforma "falar com o fulano no canal tal" em
> alvo Slack resolvido. Consumido pelo `flux:reply` e oferecido pelo `flux:equip` (`--slack-directory`).
> **Não duplicar esta lógica** nos verbos: apontar para cá.
>
> **Aqui só vive o formato.** Nome, `user_id` e `channel_id` reais são dado do time e moram no arquivo
> que o manifesto aponta, nunca no flux. Exemplo sanitizado: `examples/slack-directory.example.json`.

## Por que existe

Sem ele, cada "responde o fulano no canal X" começa com o usuário abrindo o Slack, copiando um
permalink e colando. O alvo é sempre o mesmo para as mesmas pessoas e canais, então a cópia é trabalho
que a família pode fazer uma vez.

## Como é achado

Campo opcional `slack_directory` do `flux-context.json` (ver `${FLUX_ROOT}/shared/flux-context.md`):
caminho de um arquivo JSON, **relativo ao diretório do manifesto** ou com `~/`. Relativo é o que
funciona em mais de uma máquina sem path hardcoded. Campo ausente, arquivo ausente ou JSON inválido
é o mesmo estado: **sem diretório**, caminho de degradação abaixo.

## Formato

```json
{
  "version": 1,
  "workspace": "acme",
  "people": {
    "maria": {
      "user_id": "U0AAAAAAA",
      "name": "Maria Souza",
      "aliases": ["maria souza", "msouza"]
    }
  },
  "usergroups": {
    "time-plataforma": {
      "usergroup_id": "S0EEEEEEE",
      "name": "@time-plataforma",
      "aliases": ["time de plataforma", "o time"]
    }
  },
  "channels": {
    "plataforma": {
      "channel_id": "C0BBBBBBB",
      "name": "#plataforma",
      "aliases": ["plataforma", "canal de plataforma"],
      "purpose": "Dúvidas e avisos do time de plataforma. Mensagem curta, direta.",
      "intents": {
        "triagem-recebida": {
          "match": ["triagem", "recebi o ticket"],
          "in_thread_of_target": true,
          "use_default_mentions": false,
          "template": "Recebi, obrigado! Vamos analisar e aviso por aqui."
        }
      }
    },
    "pull-requests": {
      "channel_id": "C0DDDDDDD",
      "name": "#pull-requests",
      "aliases": ["prs", "canal de pr"],
      "purpose": "Só pedido de review e aviso de review feita. Uma linha, com o link da PR.",
      "rules": ["Uma PR por pedido de review.", "Manter o status da PR atualizado pela legenda de reações."],
      "default_mentions": ["time-plataforma"],
      "status_reactions": {
        "merged": "merged",
        "reviewing": "eyes",
        "approved": "white_check_mark",
        "commented": "speech_balloon"
      },
      "intents": {
        "pedir-review": {
          "match": ["pedir review", "review pra", "olhar a pr"],
          "max_prs": 1,
          "template": "{pr_title_link} {mentions}"
        },
        "review-feita": {
          "match": ["review feita", "terminei a review", "avisar review"],
          "in_thread_of_pr_post": true,
          "use_default_mentions": false,
          "template": "Terminei a review por aqui."
        }
      }
    }
  },
  "groups": {
    "sre": {
      "channel_id": "G0CCCCCCC",
      "name": "grupo-sre",
      "aliases": ["sre", "plantão"]
    }
  }
}
```

- `version` é `1`. Ausente, menor ou maior que o conhecido: tratar como sem diretório e declarar.
- Chaves de `people`, `channels` e `groups` são o **slug** da entrada: minúsculas, sem acento, sem
  espaço. É o que aparece nos gates de ambiguidade.
- `people.<slug>.user_id` é obrigatório (`U…` ou `W…`). `dm_channel_id` (`D…`) é opcional, e só vale
  guardar quando o usuário já colou um link de DM: serve para o board reencontrar a superfície pelo
  mesmo id que o permalink traria.
- `channels.<slug>.channel_id` é obrigatório (`C…`); `groups.<slug>.channel_id` é `G…` (canal privado
  ou grupo antigo).
- `name` é só rótulo para exibir. `aliases` é opcional e aceita qualquer forma como a pessoa fala.
- `purpose` (canal e grupo, opcional) é a **direção do canal** em uma ou duas frases: para que ele
  serve e que tipo de mensagem cabe ali. É contexto de redação, não regra de roteamento.
- `intents` (canal e grupo, opcional) são os **pedidos rápidos** daquele canal. Cada chave é o slug do
  intent; `match` lista as frases que o usuário usa para pedi-lo; `template` é o texto do rascunho,
  com os placeholders da tabela em "Intents rápidos". Campos opcionais do intent: `max_prs` (inteiro,
  quantas PRs cabem num pedido), `in_thread_of_pr_post` (o rascunho é réplica na mensagem do canal que
  contém a PR, ver abaixo), `in_thread_of_target` (o rascunho é réplica na thread do permalink que o
  usuário passou, ver abaixo) e `use_default_mentions` (padrão `true`; `false` não adiciona as menções
  padrão do canal).
- `rules` (canal e grupo, opcional) é uma lista de regras do canal em texto. Vão ao answerer junto do
  `PURPOSE_CANAL` e valem também no caminho normal. Regra que o flux sabe aplicar mecanicamente tem
  campo próprio (`max_prs`); o resto é contexto de redação.
- `default_mentions` (canal e grupo, opcional) é a lista de slugs (de `people` ou `usergroups`)
  mencionados por padrão nos intents do canal, quando o pedido não cita ninguém.
- `status_reactions` (canal e grupo, opcional) mapeia o status de uma PR (`merged`, `reviewing`,
  `approved`, `commented`) ao **nome** da reação, sem os dois-pontos. É a legenda do canal.
- `usergroups.<slug>.usergroup_id` (`S…`) é um grupo de usuários do Slack (`@time`). A menção é
  `<!subteam^ID>`. Grupo de usuários não tem DM.
- Chave que o flux não conhece é preservada e ignorada. Chave que começa com `_` é comentário.
- **Nenhum conteúdo de mensagem, transcrição ou dado de DM entra aqui.** O arquivo guarda quem e onde,
  não o que foi dito.

## Resolução

Entrada: o pedido do usuário em linguagem natural ("falar com o maria no plataforma") ou tokens soltos.

1. **Normalizar** o texto do pedido e cada chave e alias: minúsculas, sem acento, hífen e sublinhado contam como espaço, espaços colapsados.
2. **Casar** cada candidato a entidade contra os slugs e aliases, nas quatro tabelas. Casamento é o alias
   normalizado aparecer no pedido normalizado delimitado por início, fim ou espaço; **nunca por prefixo
   parcial** ("mat" não casa "matta"). Só slugs e aliases casam: o `name` (com `#` ou `@`) é rótulo e
   não participa.
   **O casamento mais longo vence:** alias que está contido, no mesmo trecho do pedido, num alias maior
   que também casou é descartado ("ai productivity" não disputa com "ai productivity interno"). Só
   empate real, dois acertos distintos no mesmo trecho, vira gate.
3. **Classificar cada acerto** como pessoa, grupo de usuários, canal ou grupo (`groups`).
4. **Compor o alvo**, e é aqui que a regra vive:

| pedido contém | superfície | menção |
|---|---|---|
| pessoa **e** canal ou grupo ("com X em Y") | o canal ou grupo (`kind: channel`) | `<@user_id>` da pessoa |
| só pessoa ("com X") | DM, `channel_id = user_id` (`kind: dm`) | nenhuma |
| só grupo de usuários | **gate**: grupo não tem DM, perguntar em que canal | |
| grupo de usuários **e** canal ou grupo | o canal ou grupo | `<!subteam^ID>` do grupo de usuários |
| pessoa **e** grupo de usuários, sem canal | **gate**: perguntar em que canal | |
| duas ou mais pessoas, sem canal | **gate**: uma DM por rascunho ou outro canal | |
| só canal ou grupo ("em Y") | o canal ou grupo | nenhuma |
| mais de uma pessoa e um canal | o canal | uma menção por pessoa, na ordem dita |
| mais de um canal | **gate**, nunca escolher | |

5. **Ambiguidade vira gate** (`${FLUX_ROOT}/shared/hitl.md`): termo que casa mais de uma entrada, ou
   dois canais no mesmo pedido. Opções são as entradas candidatas, com `name` e slug. Escolher por
   conta própria é o erro que este contrato existe para evitar, porque o rascunho vai para o lugar
   errado sem aviso.
6. **Termo sem acerto** nunca é inventado: dizer qual termo não casou e pedir um permalink. O
   permalink que o usuário passar é sugestão de linha nova para o diretório (ver abaixo), nunca uma
   escrita automática.

### Por que `channel_id = user_id` para DM

`slack_send_message_draft` e `slack_read_channel` aceitam o `user_id` no lugar do `channel_id` para
DM. A entrada de pessoa precisa só do `user_id`, e o usuário não precisa colar link de DM nenhum.

O prefixo `U`/`W` não é `D`, então **o `kind` vem da entrada resolvida**, não do prefixo do id (o
Step 1 do `flux:reply` deriva `kind` do prefixo só quando o alvo veio de permalink).

`dm_channel_id`, quando a entrada o traz, é o que o `flux:reply` usa para reencontrar um board
existente por superfície: o board de uma DM aberta por permalink guarda o `D…`, e o de uma DM aberta
por alias guarda o `user_id`. A busca tenta os dois.

## Direção do canal e intents rápidos

O que o canal é muda o que uma boa resposta é. Canal de PR pede uma linha com o link; canal de dúvida
técnica pede resposta embasada. Duas coisas do diretório servem a isso:

1. **`purpose` como contexto.** Quando o alvo foi resolvido por alias e a entrada tem `purpose`, ele
   vai para o answerer como `PURPOSE_CANAL`. O answerer ajusta tamanho e tom: canal que declara
   mensagem curta recebe rascunho curto, sem inventário de achados.
2. **`intents` como atalho.** Se o pedido do usuário casa com um `match` de um intent do canal
   resolvido (mesma normalização da resolução, termo inteiro), o rascunho nasce do `template`: **sem
   prospecção, sem board, sem watch**. É o caminho curto, e é por design: pedir review ou avisar que
   a review acabou não tem codebase para prospectar nem caso para acompanhar.

| placeholder | de onde vem |
|---|---|
| `{mentions}` | menção de cada pessoa (`<@user_id>`) ou grupo de usuários (`<!subteam^ID>`) citado no pedido, na ordem dita; sem ninguém citado, as `default_mentions` do canal (salvo `use_default_mentions: false`); senão vazio |
| `{pr_title_link}` | `<url|título>` mrkdwn: o título da PR como link direto para o GitHub |
| `{pr_link}` | `<url|#N>` mrkdwn da PR citada no pedido (URL ou `#N` com repo resolvível) ou da PR da branch atual; sem PR resolvida, **perguntar** |
| `{pr_title}` | título da PR resolvida |
| `{repo}` | repo da PR resolvida |

Placeholder que não pôde ser preenchido nunca sai literal no rascunho: perguntar ou, sem resposta,
abandonar o atalho e seguir o caminho normal. Mais de um intent casando no mesmo pedido abre gate.
Texto externo respeita `NO_EMDASH` do manifesto, inclusive o `template`.

**Uma PR por pedido.** Intent com `max_prs: 1` e pedido que cita mais de uma PR: um rascunho por PR, em
sequência. O Slack aceita um rascunho anexado por canal (`attached_draft_exists`), então salvar o
primeiro, dizer que o próximo espera o usuário enviar ou apagar o anterior, e **não** juntar as PRs
numa mensagem.

**Réplica na mensagem da PR (`in_thread_of_pr_post`).** O rascunho vira réplica na thread da mensagem
do canal que contém a PR: buscar no canal pela URL da PR (`slack_search_public_and_private` com
`in:<canal>`), pegar o `ts` da mensagem do pedido e usar como `thread_ts`. Não achou: perguntar, com a
opção de rascunhar mensagem nova no canal.

**Réplica na thread do permalink (`in_thread_of_target`).** Vale quando o usuário passa o permalink de
uma mensagem **e** o `channel_id` dele consta no diretório: o canal é resolvido pelo id, o pedido é
casado com os intents desse canal, e o rascunho do `template` sai como réplica na thread do
permalink (`thread_ts` do alvo). É o caminho do aviso de triagem ("recebi, vou analisar") sobre um
ticket já postado. Intent sem esse campo não muda o comportamento de quem passou permalink.

**Status por reação.** Com `status_reactions` no canal e o intent resolvido sobre uma PR, oferecer em
gate **depois** de o rascunho estar salvo: adicionar a reação do status (`approved`, `commented`,
`merged`, `reviewing`) na mensagem do pedido (`slack_add_reaction`). É escolha explícita do usuário,
nunca automática. A ferramenta só **adiciona**: a reação de status anterior fica, e retirá-la é do
usuário, o que deve ser dito na oferta.

Intent que não casa não é erro: segue o pipeline normal, só com o `PURPOSE_CANAL` como contexto.

## Efeitos no resto do pipeline

- O alvo resolvido entra no pipeline como se fosse permalink de canal ou DM **sem `/p<ts>`**: sem
  `thread_ts`, leitura por `slack_read_channel`. O pipeline não ganha um caminho novo.
- Falar com alguém por iniciativa própria não tem mensagem de origem. O pedido do usuário é a
  intenção, e o rascunho é uma mensagem nova, não uma réplica.
- Menção `<@user_id>` entra no rascunho como as demais menções do Slack (mrkdwn, ver o answerer).
- O rascunho continua só salvo como rascunho. **Resolver o alvo não autoriza enviar.**

## Degradação

Sem diretório, o `flux:reply` segue pedindo o permalink como sempre e **declara no banner**, no campo
`degradacoes:`, com o token canônico `alias sem diretorio` (tabela do `${FLUX_ROOT}/shared/preflight.md`,
Passo 5). O token sai só quando o pedido trazia alias (sem permalink, citando pessoa ou canal por
nome); quem passou permalink não gera token. `in_thread_of_pr_post` e `status_reactions` herdam a
dependência do MCP do Slack, que o `flux:reply` já exige. Nunca tenta adivinhar
`user_id` ou `channel_id` por busca quando o pedido era um alias: busca por nome devolve homônimo, e
o diretório existe justamente para não depender disso.

## Como o diretório cresce

Quem escreve é o usuário. O `flux:equip --slack-directory` cria o esqueleto vazio sob gate; nenhum elo
acrescenta linha sozinho. Quando o usuário passa um permalink de um canal ou pessoa que não está no
diretório, o `flux:reply` **oferece** a linha pronta para colar, e para por aí.

O `channel_id` de um permalink é o segmento depois de `/archives/`; o do usuário, quando o link é de
perfil, é o segmento depois de `/team/`.
