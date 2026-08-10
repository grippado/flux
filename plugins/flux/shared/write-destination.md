# Destino de escrita — contrato único de onde um artefato gerado pode nascer

> Fonte única de **onde** um elo `flux:` escreve artefato que ele mesmo gerou (suite de specialists,
> kit, qualquer arquivo que não seja código da PR), e de **o que precisa ser verificado antes de a
> primeira linha ser escrita**. Referenciada pelo Bootstrap de specialists
> (`${FLUX_ROOT}/shared/bootstrap-specialists.md`) e pelo `flux:equip`
> (`${FLUX_ROOT}/skills/equip/SKILL.md`), o verbo que equipa uma máquina para trabalhar num repo e
> que passa por este contrato nas duas camadas que escreve (suite de specialists e motor).
> **Não duplicar esta lógica** nos verbos: apontar para cá e declarar só o que é específico (que
> artefato, com que nome, em que momento).
>
> Não cobre escrita **dentro do repo alvo** (código de PR): isso é
> `${FLUX_ROOT}/shared/worktree-discipline.md`, e lá o destino é a worktree, decidida pelo git.

## Princípio (regra pétrea)

**A máquina do usuário não é nossa.** Um elo que escreve fora do repositório revisado está mexendo no
setup pessoal de alguém — os dotfiles, os agents, a configuração que ele carrega entre máquinas. Um
destino escolhido sozinho, num path que ninguém verificou, tem três modos de falha que não avisam:
sobrescrever um arquivo versionado através de um symlink, sujar o working tree de um repositório que
não é o alvo, e depositar um arquivo real num diretório que o gerenciador de dotfiles vai limpar no
próximo `install`.

Nenhum dos três dá erro. Os dois primeiros aparecem como um `git status` sujo que o usuário atribui a
outra coisa; o terceiro só aparece quando o arquivo some, semanas depois, e a suspeita nunca cai
sobre quem o escreveu. Por isso este contrato é **pré-requisito de qualquer escrita**, e não uma
verificação de melhor esforço.

Três invariantes governam tudo abaixo:

1. **Nada é escrito fora do que o gate aprovou.** O escopo aprovado é o destino canônico e a subárvore
   dele. Um arquivo que o elo resolveu escrever "logo ali ao lado" precisa de aprovação própria — e
   isso inclui o próprio `flux-context.json` onde a aprovação vai ser registrada.
2. **Nenhum arquivo existente é sobrescrito em silêncio.** Nem quando o conteúdo parece gerado por
   nós, nem quando o diff parece inócuo.
3. **O que foi criado fica registrado.** Sem a lista de paths, não existe rollback — existe caça ao
   arquivo.

## O destino é um diretório

**O destino resolvido pela cascata é sempre um DIRETÓRIO**, nunca um arquivo. Quem decide o nome de
cada arquivo é o elo que escreve — o Bootstrap chama seu orquestrador de `repo-owner.md`; o contrato
decide **em que diretório** ele pode nascer, e é sobre esse diretório que as guardas operam.

A regra precisa estar escrita porque os degraus não concordam sozinhos: `specialists_root` é, por
herança do passo de descoberta, um template que aponta para o **arquivo** do orquestrador
(`~/agents/acme/{repo}/repo-owner.md`), enquanto `kits_root` e o default da família apontam para um
diretório. Sem a normalização, o mesmo contrato produziria `.../repo-owner.md/repo-owner.md` num
degrau e o path correto no outro, e as guardas herdariam a confusão — F1 testando uma folha que é
arquivo, F3 varrendo um diretório que não existe.

Normalização, aplicada **logo depois da cascata e antes de qualquer guarda**:

- valor terminado em `.md` → toma-se o **`dirname`**. O basename não é descartado: ele é lembrado como
  o nome que a descoberta espera achar ali (ver `${FLUX_ROOT}/shared/review-agents.md`, passo 1a).
- qualquer outro valor → é o diretório, tal como veio; barra final é irrelevante.

## A cascata de destino

O destino é decidido pela **primeira linha que produzir um valor**, nesta ordem e sem pular degrau:

| # | origem | resolve para |
|---|--------|--------------|
| 1 | path ditado pelo usuário nesta execução | o diretório ditado, literal |
| 2 | `specialists_root` do perfil | o template resolvido para o repo-slug |
| 3 | `kits_root` do perfil | a raiz de kits resolvida para o repo-slug |
| 4 | `write_destinations` do manifesto | a entrada cujo `repos` contém o repo-slug |
| 5 | **nada declarado** | **perguntar** (GATE abaixo), com o default da família como recomendada |
| 6 | default aceito no degrau 5 | `~/.claude/flux-specialists/{repo}/` |

Os degraus 2 e 3 usam o mesmo mecanismo de template de `specialists_root`: `{repo}` é substituído
pelo slug do repo. O degrau 3 existe para o elo que equipa uma máquina com um kit; enquanto o formato
de kit não estiver especificado, `kits_root` participa **apenas** como degrau da cascata, e quem o
especificar depois preenche o resto sem reescrever este contrato.

O degrau 4 é o que fecha o ciclo com a persistência: um destino que o usuário já aprovou para este
repo é um destino declarado, e reabrir o GATE sobre ele transformaria a memória da decisão em ruído
recorrente. Sem esse degrau, um perfil sem `specialists_root` e sem `kits_root` perguntaria de novo na
segunda execução, e a seção "Persistência da resposta" estaria prometendo o que a cascata não entrega.
Se **mais de uma** entrada reivindicar o mesmo slug, isso não se resolve por adivinhação: o degrau
falha e o fluxo cai no GATE, que lista as candidatas.

O degrau 5 é o coração da mudança: **um perfil sem destino declarado não autoriza o default, ele
autoriza a pergunta.** Assumir o default e avisar depois inverte a ordem que importa — quando o aviso
chega, o arquivo já está no disco de alguém.

### Por que o degrau 1 é um path ditado, e não uma flag

Uma versão anterior deste contrato colocava `--dest <path>` no topo da cascata. A flag não existe:
nenhum `## Uso` de `review`, `iterate`, `land` ou `build` a declara, ninguém a parseia, e o topo da
cascata era portanto inalcançável. Havia duas saídas — declarar a flag nos quatro elos que oferecem o
Bootstrap, ou redefinir o degrau —, e a segunda é a defensável: uma flag de destino em quatro
superfícies é interface nova para um caso que já tem canal (o GATE tem a opção "informar outro
caminho"), e interface prometida em documento e ausente em implementação é exatamente o defeito que
este contrato existe para não cometer.

O degrau 1 é, então, **o path que o usuário ditou nesta execução** — pela opção "informar outro
caminho" do GATE, ou por tê-lo escrito diretamente no chat. Ele fica no topo porque, uma vez que o
humano diz onde, nenhum manifesto o sobrescreve; e o path ditado **volta ao início**, passando por
normalização e pelas três guardas como qualquer outro. Ditar o destino escolhe o lugar, não dispensa a
verificação. Se um verbo ganhar uma flag de destino no futuro, ela alimenta este degrau — e a flag
precisa nascer declarada no `## Uso` do verbo, não aqui.

### GATE de destino (degrau 5)

GATE (`${FLUX_ROOT}/shared/hitl.md`), single-select:

- **Header:** `Onde escrever?`
- **Question:** `Nenhum destino declarado no perfil para \`<slug>\`. Onde os arquivos gerados devem nascer?`
- **Options:**
  1. `~/.claude/flux-specialists/<slug>/ (Recomendado)` — default da família; fica fora de qualquer
     repositório e não depende de manifesto. Não altera nenhum arquivo existente.
  2. `Informar outro caminho` — o usuário dita o diretório, que entra pelo degrau 1 e volta ao início
     das guardas.
  3. `Não escrever nada` — encerra a escrita; o elo segue e registra a recusa.

Ao usar o default, dizer no chat que declarar `specialists_root` (ou `kits_root`) no manifesto é o que
torna o resultado reutilizável entre máquinas. O aviso continua existindo; o que mudou é que ele não
substitui mais a pergunta.

## F1 antes do `realpath`, canonização depois

A ordem entre F1 e a canonização **não é arbitrária, e inverter a desarma**. `realpath` resolve o
caminho inteiro: ele **segue** todo symlink de todo componente. Julgar `-L` depois de canonizar é
perguntar se um path já resolvido é symlink — a resposta é sempre não, e o ancestral symlink some em
silêncio. Era o modo de falha número 1 do princípio acima, sobrevivendo dentro da própria guarda que
existe para pegá-lo.

Por isso F1 roda **sobre o path bruto**, com `~` expandido e nada mais, e só depois o path é
canonizado para as guardas que precisam de um lugar real (F2 e F3).

### F1 — escrita através de symlink

Um destino que já existe como symlink faz o write **seguir o link** e sobrescrever o alvo, que
normalmente mora dentro do repositório de dotfiles. O arquivo aparece modificado num repo que o
usuário nem tinha aberto. O mesmo vale para qualquer **diretório do caminho**: escrever dentro de um
diretório que é symlink também segue o link.

```bash
DEST_RAW="$1"                                # o que veio da cascata, já normalizado a diretório
DEST=${DEST_RAW/#\~/$HOME}                   # expandir ~ e mais nada: NENHUM realpath ainda

# folha + TODOS os ancestrais, sem parar no primeiro que existe
P="$DEST"
while : ; do
  if [ -L "$P" ]; then
    REAL=$(readlink "$P")
    # NÃO escrever. Reportar $P -> $REAL e perguntar.
  fi
  case "$P" in "$HOME"|"/") break ;; esac
  P=$(dirname "$P")
done
```

A varredura vai **da folha até `$HOME`**, e até `/` quando o destino está fora do `$HOME` — sempre
inclusive, e **sem parar no primeiro componente que existe**. Parar no primeiro existente é a leitura
que a versão anterior deste texto permitia, e é errada: o componente symlink costuma ser justamente um
dos que existem mais acima (`~/.claude` apontando para o repo de dotfiles), enquanto os de baixo ainda
não nasceram. Um componente que não existe simplesmente não é symlink; varrê-lo custa nada.

Regra: **sendo symlink, não escrever.** Reportar o path e o alvo real, e perguntar (single-select:
escrever no alvo real assumindo a mudança no repo de origem / escolher outro destino / não escrever).

F1 volta a valer **por arquivo**, no gate de arquivo existente: um arquivo que já está lá como symlink
é o mesmo problema, uma folha abaixo.

### Canonização: `realpath` para F2 e F3

Feita F1, as guardas seguintes operam sobre o **path canônico**, nunca sobre o que foi digitado. `~`,
`..`, symlink no meio do caminho e caminho relativo tornam duas strings diferentes o mesmo lugar, e
duas strings iguais lugares diferentes.

```bash
PARENT=$(dirname "$DEST")

# o destino pode ainda não existir; o pai mais próximo que existe é o que se resolve
ANCESTOR="$PARENT"
while [ ! -e "$ANCESTOR" ] && [ "$ANCESTOR" != "/" ]; do ANCESTOR=$(dirname "$ANCESTOR"); done

CANON=$(realpath "$ANCESTOR" 2>/dev/null) \
  || CANON=$(cd "$ANCESTOR" 2>/dev/null && pwd -P)   # fallback sem realpath no PATH
[ -z "$CANON" ] && { echo "destino não resolve: $DEST_RAW"; exit 1; }

[ -w "$CANON" ] || { echo "destino não é gravável: $CANON (dono: $(stat -f '%Su' "$CANON" 2>/dev/null))"; exit 1; }
```

**Path que não resolve aborta a escrita.** Não vira o default, não vira uma tentativa de `mkdir -p`
para ver no que dá. Um path que não resolve é quase sempre um erro de digitação ou uma variável vazia
que virou `/`; escrever no default nesse caso troca um erro visível por um arquivo em lugar nenhum.

**Path que resolve e não é gravável aborta pela mesma razão.** É o caso simétrico e tem as mesmas
causas plausíveis — diretório de outro dono, volume montado read-only, `~/.claude` de uma instalação
gerida por outro usuário — e sem a verificação ele se manifesta como erro cru de `mkdir`/`open`
**depois** de o usuário já ter passado por até três gates, que é o pior momento possível para
descobrir que a resposta não valia. Reportar o path canônico e o motivo (dono, permissão, montagem),
e oferecer ditar outro caminho (degrau 1) ou não escrever. Nunca cair no default em silêncio: se o
destino que o usuário aprovou não serve, quem escolhe o próximo é ele.

## As guardas restantes

Rodam **nesta ordem**, sobre o path canônico, **antes** de qualquer `mkdir`, `touch` ou write. Cada
uma que dispara para o fluxo e devolve a decisão ao usuário — nenhuma se resolve sozinha.

### F2 — destino dentro de repositório git

Um destino que resolve para dentro de um repositório git suja o working tree de um projeto que não é
o alvo do trabalho. É o caso mais comum quando os dotfiles são versionados: o path declarado no perfil
parece neutro e resolve para dentro do repo pessoal.

```bash
if REPO_TOP=$(git -C "$CANON" rev-parse --show-toplevel 2>/dev/null); then
  if git -C "$CANON" check-ignore -q "$DEST"; then
    : # ignorado naquele repo: aviso, não confirmação (ver abaixo)
  else
    git -C "$REPO_TOP" status --porcelain   # mostrar o estado atual ao usuário
    # exigir confirmação explícita que NOMEIA o repositório
  fi
fi
```

Regra: **confirmação explícita nomeando o repositório.** A pergunta diz qual repo é (`$REPO_TOP`),
mostra o `git status --porcelain` dele — para que o usuário veja o que já estava sujo antes de nós — e
só então oferece seguir. Uma confirmação genérica ("posso escrever?") não serve: o ponto inteiro da
guarda é o usuário descobrir **em qual repositório** ele está autorizando uma mudança.

Isto vale mesmo quando o repositório é do próprio usuário. Especialmente quando é: é o caso em que
ninguém vai revisar a mudança antes de ela virar commit.

**Exceção medida: destino já ignorado naquele repo.** Se `git check-ignore` casa com o destino, a
justificativa de F2 deixa de valer — o working tree não suja, o `git status` não muda, e não há
mudança nenhuma a ser autorizada. Exigir a confirmação nominal aí é cerimônia num caso comum (todo
`~/.claude/` versionado ignora o que não é dele), e cerimônia repetida é o que ensina o usuário a
aprovar sem ler. Então F2 **degrada de gate para aviso**: dizer o repositório, dizer que o destino
está ignorado nele, e dizer a única consequência que sobra — arquivo ignorado é o que `git clean -xfd`
apaga sem perguntar, e é assim que ele some. O aviso vai ao chat e o fluxo segue; o registro guarda
`git_repo: "ignorado em <repo>"`, que é um estado diferente de `confirmado` e caduca igual (ver
"Persistência da resposta"): se o `.gitignore` mudar, a aprovação não vale mais.

### F3 — órfão do gerenciador de dotfiles

Um arquivo real depositado num diretório cujo conteúdo é majoritariamente symlink fica **fora** do
versionamento: o gerenciador de dotfiles versiona a origem dos links, não o que apareceu solto no
destino. E instaladores desse tipo costumam remover o destino antes de recriar o link (o padrão
`backup se for real` seguido de `rm -rf` incondicional), então o arquivo some no próximo `install`
sem nenhum aviso.

```bash
TOTAL=$(find "$CANON" -maxdepth 1 -mindepth 1 2>/dev/null | wc -l | tr -d ' ')
LINKS=$(find "$CANON" -maxdepth 1 -mindepth 1 -type l 2>/dev/null | wc -l | tr -d ' ')
# maioria simples, com massa mínima para não disparar em diretório quase vazio
if [ "$TOTAL" -ge 3 ] && [ $((LINKS * 2)) -gt "$TOTAL" ]; then
  ORIGIN=$(readlink -f "$(find "$CANON" -maxdepth 1 -type l | head -1)" 2>/dev/null)
  # avisar e oferecer o padrão que a máquina já usa
fi
```

**F3 mede `$CANON`, o ancestral existente mais próximo, e isso é deliberado.** Escrevendo em
`~/.claude/flux-specialists/foo/` numa máquina onde `flux-specialists/` ainda não existe, a medição
cai em `~/.claude/` — e é exatamente ali que a coisa nova nasce. O que o instalador de dotfiles remove
não é o arquivo lá no fundo: é a **entrada de primeiro nível** que apareceu solta no meio dos links
dele, com a subárvore inteira junto. Medir só quando o diretório-folha já existe cegaria a guarda
justamente na primeira execução, que é a única em que ela ainda podia mudar a decisão. Por isso o
aviso nomeia as duas coisas: o diretório medido (`$CANON`) e **a primeira componente do caminho que
não existe** — a entrada que vamos criar lá dentro, e que é a que corre risco.

Regra: **dizer o que foi detectado e oferecer o padrão que a máquina já usa.** A oferta não é abstrata
— o diretório de origem dos links existentes (`$ORIGIN`, o pai dele) é a resposta concreta: escrever
lá e criar o symlink no destino, que é exatamente o que todo o resto daquele diretório faz. As opções
são: escrever na origem e linkar (recomendada, com os dois paths escritos por extenso) / escrever o
arquivo real assumindo que ele é efêmero / escolher outro destino.

## Gate de arquivo existente

Passadas as guardas, **antes de escrever cada arquivo**: existindo algo no path (`-e`), abrir gate com
três saídas, e só três:

- **Sobrescrever** — mostrando antes o diff contra o conteúdo novo, quando ambos forem texto.
- **Renomear** — o existente vira `<nome>.bak-<YYYYMMDD-HHMMSS>` no mesmo diretório, e o novo ocupa o
  path original. É a saída que preserva rollback sem exigir decisão sobre conteúdo.
- **Abortar** — aquele arquivo não é escrito. O resto do lote segue, e a omissão vai para o registro.

O carimbo do `.bak-` tem **segundos**, e não só minutos, porque um lote escreve vários arquivos em
sequência e uma suite inteira cabe dentro do mesmo minuto: com precisão de minuto, dois renomes do
mesmo path sobrescrevem o próprio backup e a opção perde exatamente o que ela promete. Segundos não
bastam sozinhos — se o nome ainda assim já existir, sufixar `-2`, `-3`, … até achar um livre. **Um
backup que sobrescreve outro backup é pior que nenhum**, porque o usuário acredita que tem rollback.

Sendo o path existente um **symlink**, F1 vale de novo aqui, uma folha abaixo: sobrescrever segue o
link e escreve no alvo. Reportar `path -> alvo` e resolver isso antes de oferecer as três saídas.

Não existe quarta saída, e não existe merge automático: reconciliar conteúdo gerado com conteúdo que
alguém editou à mão é uma decisão de autoria, não de escrita.

## Persistência da resposta

A resposta do gate é **persistida no manifesto**, para a pergunta não voltar a cada execução — é o que
alimenta o degrau 4 da cascata. No `flux-context.json` mais próximo (mesma resolução de
`${FLUX_ROOT}/shared/flux-context.md`), sob `write_destinations`:

```json
{
  "write_destinations": {
    "/Users/alguem/.claude/flux-specialists/api-gateway": {
      "repos": ["api-gateway"],
      "approved_at": "2026-08-10",
      "guards": { "symlink": "n/a", "git_repo": "confirmado: alguem/dotfiles", "dotfiles_dir": "n/a" }
    }
  }
}
```

**A chave é o diretório canônico de destino; `repos` diz para quais repo-slugs ele foi aprovado.** As
duas dimensões são necessárias e nenhuma substitui a outra: sem o path não há o que verificar contra o
estado do disco, e sem `repos` a entrada não sabe de quem é — foi o defeito da primeira versão, em que
o registro era chaveado só por path e a descoberta pedia "o destino aprovado para este repo", obrigando
o executor a adivinhar por substring do slug dentro do path. Adivinhar por substring é precisamente a
inferência que o resto deste contrato proíbe. A chave é sempre um path **já resolvido**, nunca um
template com `{repo}` — templates são assunto de `specialists_root` e `kits_root`, e misturar as duas
naturezas no mesmo campo devolve a ambiguidade pela porta dos fundos. Dois repos só compartilham uma
entrada quando de fato escrevem no mesmo diretório.

A aprovação vale para o destino canônico e a subárvore dele, e **caduca quando o mundo muda**:
re-perguntar sempre que o path canônico mudar, ou quando qualquer guarda passar a disparar num estado
diferente do registrado (um diretório que virou repo git, um destino que virou symlink, um destino que
deixou de estar ignorado). Uma aprovação guardada é memória de uma decisão sobre um estado — não uma
licença permanente.

### Escrever no manifesto também é escrita

Registrar a aprovação é escrever num arquivo do usuário, e este contrato existe porque escrever num
arquivo do usuário precisa de gate. **A persistência não é isenta das próprias regras**, e a isenção
que a primeira versão deste texto dava a ela era o buraco mais fácil de cair: numa máquina de dotfiles
o `flux-context.json` é tipicamente um symlink para dentro de um repo git, então persistir a aprovação
suja o working tree de um repositório que não é o alvo — F1 e F2 aplicadas ao próprio ato de registrar.

Portanto, antes de gravar:

1. **F1 e F2 sobre o path do manifesto**, com a mesma disciplina: symlink → reportar `path -> alvo`;
   dentro de repo git → nomear o repositório (ou degradar a aviso, se ignorado).
2. **GATE próprio**, single-select, separado do gate de destino porque a pergunta é outra: uma coisa é
   autorizar onde a suite nasce, outra é autorizar uma linha nova num arquivo de configuração
   versionado. Opções: `Registrar em <path do manifesto>` (recomendada, dizendo o repo quando houver) /
   `Não registrar` — a aprovação vale só para esta execução, e a pergunta volta na próxima.

E ao gravar:

- **É merge, nunca substituição.** Ler o JSON, acrescentar ou atualizar **apenas** a entrada em
  `write_destinations`, preservar byte a byte o resto do arquivo (todos os outros campos, e a
  formatação na medida do possível). Reescrever o manifesto a partir do que a sessão conhece apagaria
  campos que ela não conhece, que é o modo mais silencioso de destruir a configuração de alguém.
- **JSON que não parseia não é reescrito.** Reportar e seguir sem persistir; um manifesto quebrado é
  problema do usuário, e sobrescrevê-lo com um JSON "limpo" perde o que ele estava editando.
- **Manifesto não gravável** (só leitura, dono diferente, volume read-only) → não é erro fatal: dizer
  o motivo e seguir, com a aprovação valendo só para a execução corrente. A escrita da suite já
  aconteceu e não se desfaz por causa do registro.

Sem manifesto (perfil genérico), não há onde persistir: a aprovação vale só para a execução corrente,
e o elo diz isso ao perguntar, para o usuário saber que declarar um manifesto é o que encerra a
repetição.

## Registro do que foi criado

Ao final, registrar **a lista de paths absolutos** efetivamente escritos, os renomeados (com o nome do
`.bak-`) e os pulados. Vai para o board do elo, quando houver
(`${FLUX_ROOT}/shared/board-template.md`), e sempre para o chat.

Sem essa lista não existe rollback: o usuário sabe que "o flux escreveu uns agents" e não sabe o quê,
onde, nem o que já estava lá. O elo **não** desfaz nada por conta própria — o registro existe para que
desfazer seja possível, não para que seja automático.

## Ordem obrigatória

```
1. cascata            → candidato a destino (degrau 4 lê write_destinations; degrau 5 abre GATE)
2. normalização       → destino é diretório; valor terminado em .md tem o dirname tomado
3. F1 symlink         → path BRUTO, folha e todos os ancestrais até $HOME (ou /), antes do realpath
4. canonização        → realpath; não resolveu ou não é gravável, aborta e devolve a escolha
5. F2 repo git        → confirmação que nomeia o repo (aviso, se já ignorado nele)
6. F3 dotfiles        → aviso + oferta do padrão da máquina
7. gate por arquivo   → sobrescrever / renomear (.bak com segundos) / abortar; F1 de novo na folha
8. escrita            → só dentro do escopo aprovado
9. persistência       → F1 + F2 + gate próprio sobre o manifesto; merge, nunca substituição
10. registro          → paths criados, renomeados e pulados
```

Inverter qualquer par desta ordem desarma a guarda seguinte, e dois pares merecem nome próprio:
**canonizar antes de F1 desarma F1 por completo** — `realpath` segue os symlinks que F1 procura, e a
guarda passa a olhar um caminho onde eles não existem mais; e **escrever antes do passo 7** torna todo
o resto uma auditoria pós-morte. O passo 9 vir depois do 8 é intencional: persiste-se o que de fato
aconteceu, não o que se pretendia fazer.
