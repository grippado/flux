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
  "channels": {
    "plataforma": {
      "channel_id": "C0BBBBBBB",
      "name": "#plataforma",
      "aliases": ["plataforma", "time de plataforma"],
      "purpose": "Dúvidas e avisos do time de plataforma. Mensagem curta, direta.",
      "intents": {}
    },
    "pull-requests": {
      "channel_id": "C0DDDDDDD",
      "name": "#pull-requests",
      "aliases": ["prs", "canal de pr"],
      "purpose": "Só pedido de review e aviso de review feita. Uma linha, com o link da PR.",
      "intents": {
        "pedir-review": {
          "match": ["pedir review", "review pra", "olhar a pr"],
          "template": "{mentions} review na {pr_link}, por favor?"
        },
        "review-feita": {
          "match": ["review feita", "terminei a review", "avisar review"],
          "template": "{mentions} terminei a review da {pr_link}."
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

- `version` é `1`. Número maior que o conhecido: tratar como sem diretório e declarar.
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
  com os placeholders da tabela em "Intents rápidos".
- Chave que o flux não conhece é preservada e ignorada. Chave que começa com `_` é comentário.
- **Nenhum conteúdo de mensagem, transcrição ou dado de DM entra aqui.** O arquivo guarda quem e onde,
  não o que foi dito.

## Resolução

Entrada: o pedido do usuário em linguagem natural ("falar com o maria no plataforma") ou tokens soltos.

1. **Normalizar** o texto do pedido e cada chave e alias: minúsculas, sem acento, espaços colapsados.
2. **Casar** cada candidato a entidade contra os slugs e aliases, nas três tabelas. Casamento é por
   igualdade do termo inteiro ou por termo contido numa palavra-limite; **nunca por prefixo parcial**
   ("mat" não casa "matta").
3. **Classificar cada acerto** como pessoa, canal ou grupo.
4. **Compor o alvo**, e é aqui que a regra vive:

| pedido contém | superfície | menção |
|---|---|---|
| pessoa **e** canal ou grupo ("com X em Y") | o canal ou grupo (`kind: channel`) | `<@user_id>` da pessoa |
| só pessoa ("com X") | DM, `channel_id = user_id` (`kind: dm`) | nenhuma |
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
| `{mentions}` | `<@user_id>` de cada pessoa citada no pedido, na ordem dita; vazio se ninguém foi citado |
| `{pr_link}` | `<url|#N>` mrkdwn da PR citada no pedido (URL ou `#N` com repo resolvível) ou da PR da branch atual; sem PR resolvida, **perguntar** |
| `{pr_title}` | título da PR resolvida |
| `{repo}` | repo da PR resolvida |

Placeholder que não pôde ser preenchido nunca sai literal no rascunho: perguntar ou, sem resposta,
abandonar o atalho e seguir o caminho normal. Mais de um intent casando no mesmo pedido abre gate.
Texto externo respeita `NO_EMDASH` do manifesto, inclusive o `template`.

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
`degradacoes:`, que o alias não foi resolvido por falta do `slack_directory`. Nunca tenta adivinhar
`user_id` ou `channel_id` por busca quando o pedido era um alias: busca por nome devolve homônimo, e
o diretório existe justamente para não depender disso.

## Como o diretório cresce

Quem escreve é o usuário. O `flux:equip --slack-directory` cria o esqueleto vazio sob gate; nenhum elo
acrescenta linha sozinho. Quando o usuário passa um permalink de um canal ou pessoa que não está no
diretório, o `flux:reply` **oferece** a linha pronta para colar, e para por aí.

O `channel_id` de um permalink é o segmento depois de `/archives/`; o do usuário, quando o link é de
perfil, é o segmento depois de `/team/`.
