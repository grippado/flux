# Canal de publicação — onde uma página gerada pela família vai morar

> Fonte única de **como** um elo `flux:` transforma um HTML que ele gerou numa página que outras
> pessoas abrem, em cada harness, e de **como ele degrada** quando o harness não oferece canal
> nenhum. Referenciada pelo `flux:tell` (`${FLUX_ROOT}/skills/tell/SKILL.md`). **Não duplicar esta
> lógica** nos verbos: eles declaram o que publicam, este arquivo decide onde e como.

## Princípio (regra pétrea)

**Um HTML, três destinos.** O elo gera um único arquivo HTML autocontido e grava esse arquivo
local **sempre**, antes de qualquer publicação. O canal é uma camada por cima do arquivo, nunca a
fonte dele. Três consequências:

1. **Nenhum harness fica sem entrega.** Onde não há canal, o arquivo local é a entrega, e o banner
   diz isso. Degradar é trocar o destino, nunca perder o trabalho.
2. **O mesmo HTML serve aos três destinos.** Não existe versão "pro Artifact" e versão "pro Sites":
   uma página que só funciona num canal é uma página que quebra quando o canal falta.
3. **Republicar é reler o arquivo local.** A versão que está no canal é sempre derivada do arquivo
   gravado, então editar à mão o HTML local e rodar o verbo de novo atualiza a página.

## Os canais

| `PUBLISH_CHANNEL` | harness | o que é | URL resultante |
|---|---|---|---|
| `artifact` | `claude-code` | página privada hospedada pelo próprio Claude (Artifact) | link do claude.ai |
| `sites` | `codex` | site hospedado pelo plugin Sites do Codex (ChatGPT Sites) | link do site publicado |
| `local` | qualquer um, e o único do `cursor` | o próprio arquivo HTML no disco | `file://` do arquivo |

`local` não é o canal "de erro": é um canal de primeira classe, o único que existe em todo harness
e o único que não depende de conta, rede ou plano. Abrir o arquivo no navegador mostra exatamente o
que o canal hospedado mostraria.

## Resolver o canal

O canal é resolvido **depois** do `HARNESS` (`${FLUX_ROOT}/shared/preflight.md`, 1a-harness) e
**por descoberta de capacidade na sessão**, nunca pelo harness sozinho:

1. **Override do usuário.** `--local` nesta execução, ou `publish.channel: "local"` no manifesto →
   `local`, sem descoberta. O override só **rebaixa**: nem flag nem manifesto promovem a um canal
   que a sessão não expõe.
2. **`HARNESS = claude-code`** → procurar na sessão uma ferramenta que publique um arquivo HTML
   local como página e devolva o link dela (no Claude Code ela se chama `Artifact`). Existe → `artifact`.
   Não existe → `local`, com a degradação `canal artifact ausente`.
3. **`HARNESS = codex`** → procurar na sessão a capacidade do plugin Sites de publicar um HTML e
   devolver o link do site. Existe → `sites`. Não existe → `local`, com a degradação
   `canal sites ausente`.
4. **`HARNESS = cursor`** → `local`, sem descoberta. Não é degradação: o Cursor não tem canal
   hospedado, então o banner diz `canal: local` e não lista perda.
5. **`HARNESS = unknown`** → `local`, com a degradação `harness não identificado`. Publicar num
   canal que não se sabe de quem é seria nomear um produto não verificado.

**Descobrir é verificar, não supor.** Nome de ferramenta citado aqui é dica de onde procurar, não
prova de que ela existe. O critério é o mesmo do `mcp.docs` em `${FLUX_ROOT}/shared/flux-context.md`:
a capacidade só conta quando a sessão a expõe de fato. Uma ferramenta que existe mas recusa a
publicação (plano, permissão, rede) **não** vira tentativa em outro canal: o elo cai para `local`,
declara o motivo literal da recusa e entrega o arquivo.

**Nunca trocar de harness para publicar.** Um elo rodando no Codex não publica Artifact, e um elo
no Claude Code não publica no Sites, mesmo que encontre credencial ou CLI do outro lado. O canal é
o do harness que está rodando, ou `local`.

## O HTML que serve aos três

O arquivo precisa abrir igual num canal hospedado e direto do disco, sem rede:

- **Um arquivo só.** CSS inline num `<style>`; nenhum `<script>` externo, nenhuma folha externa,
  nenhuma fonte remota. Pilha de fontes do sistema (`system-ui`, `ui-monospace`).
- **Imagem só embutida** (`data:` ou SVG inline), e só quando a fonte é o próprio board. Nunca link
  para imagem num host interno: no canal hospedado ela quebra, e no local ela vaza o host.
- **Claro e escuro.** Cores como variáveis em `:root`, redefinidas sob
  `@media (prefers-color-scheme: dark)`, e `background` explícito no `body`.
- **Funciona no celular.** Uma coluna, `max-width` legível, gutter lateral, nenhum scroll
  horizontal na página (tabela larga rola dentro do próprio contêiner).
- **`<title>` curto** (duas a quatro palavras) e `<meta name="description">` com uma frase. O canal
  hospedado usa os dois como título e subtítulo; o arquivo local usa como título da aba.
- **Sem JavaScript obrigatório.** O conteúdo inteiro aparece sem script. Script, se houver, é
  enfeite e inline.

## Publicar é GATE

Publicar tira conteúdo da máquina do usuário, então segue `${FLUX_ROOT}/shared/hitl.md`, linha
"publicar página hospedada". Gravar o arquivo local **não** tem gate quando o destino é o vault
(é o caderno do usuário); fora do vault, o destino segue `${FLUX_ROOT}/shared/write-destination.md`.

`GateSpec` mínima que o verbo monta (o verbo acrescenta só fatos do domínio dele):

```text
id: publish
question: "Publicar <título> em <canal>?"
state:
  - { fato: canal,            valor: artifact | sites,          origem: descoberta na sessão }
  - { fato: arquivo,          valor: <path absoluto do HTML>,   origem: escrita local }
  - { fato: link existente,   valor: <url> | nenhum,            origem: nota companheira }
  - { fato: suspeitas abertas, valor: <n>,                      origem: relatório de redação }
options:
  - publish   "Publicar (Recomendado)"     precondição: suspeitas abertas = 0
  - review    "Revisar a redação antes"    efeito: lista as trocas e as suspeitas, não publica
  - local     "Ficar só com o arquivo local" harmless: true
```

Com suspeitas abertas, `publish` não é elegível e `review` vira a recomendada. Nunca publicar com
suspeita aberta, nem quando o usuário diz "pode publicar" fora do gate.

## Visibilidade

O elo publica **privado** e não mexe em compartilhamento. Tornar a página pública, mandar convite
ou gerar link aberto é decisão que o usuário toma na interface do canal, depois de ver a página. O
fechamento do verbo diz onde fica esse controle, e não faz por ele.

## Lembrar onde publicou

Depois de publicar, gravar o link na nota companheira (seção "Publicações", com canal, link,
data e harness). Na execução seguinte sobre o mesmo alvo:

- mesmo canal disponível → **atualizar a mesma página** (mesmo link), não criar outra;
- canal diferente (rodou no Claude, agora roda no Codex) → nova publicação no canal atual, e a nota
  passa a listar as duas. O elo não tenta atualizar a página do outro canal.

## Banner

O verbo acrescenta uma linha ao banner do preflight:

```
canal: {artifact|sites|local} · arquivo: {path} · degradacao: {canal artifact ausente | canal sites ausente | harness não identificado | recusa: <motivo literal> | nenhuma}
```
