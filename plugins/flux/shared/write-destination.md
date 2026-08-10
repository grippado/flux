# Destino de escrita — contrato único de onde um artefato gerado pode nascer

> Fonte única de **onde** um elo `flux:` escreve artefato que ele mesmo gerou (suite de specialists,
> kit, qualquer arquivo que não seja código da PR), e de **o que precisa ser verificado antes de a
> primeira linha ser escrita**. Referenciada pelo Bootstrap de specialists
> (`${FLUX_ROOT}/shared/bootstrap-specialists.md`) e por qualquer elo futuro que equipe uma máquina.
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
   dele. Um arquivo que o elo resolveu escrever "logo ali ao lado" precisa de aprovação própria.
2. **Nenhum arquivo existente é sobrescrito em silêncio.** Nem quando o conteúdo parece gerado por
   nós, nem quando o diff parece inócuo.
3. **O que foi criado fica registrado.** Sem a lista de paths, não existe rollback — existe caça ao
   arquivo.

## A cascata de destino

O destino é decidido pela **primeira linha que produzir um valor**, nesta ordem e sem pular degrau:

| # | origem | resolve para |
|---|--------|--------------|
| 1 | `--dest <path>` na invocação | o path passado, literal |
| 2 | `specialists_root` do perfil | o template resolvido para o repo-slug |
| 3 | `kits_root` do perfil | a raiz de kits resolvida para o repo-slug |
| 4 | **nada declarado** | **perguntar** (GATE abaixo), com o default da família como recomendada |
| 5 | default aceito no degrau 4 | `~/.claude/flux-specialists/{repo}/` |

Os degraus 2 e 3 usam o mesmo mecanismo de template de `specialists_root`: `{repo}` é substituído
pelo slug do repo. O degrau 3 existe para o elo que equipa uma máquina com um kit; enquanto o formato
de kit não estiver especificado, `kits_root` participa **apenas** como degrau da cascata, e quem o
especificar depois preenche o resto sem reescrever este contrato.

O degrau 4 é o coração da mudança: **um perfil sem destino declarado não autoriza o default, ele
autoriza a pergunta.** Assumir o default e avisar depois inverte a ordem que importa — quando o aviso
chega, o arquivo já está no disco de alguém.

### GATE de destino (degrau 4)

GATE (`${FLUX_ROOT}/shared/hitl.md`), single-select:

- **Header:** `Onde escrever?`
- **Question:** `Nenhum destino declarado no perfil para \`<slug>\`. Onde os arquivos gerados devem nascer?`
- **Options:**
  1. `~/.claude/flux-specialists/<slug>/ (Recomendado)` — default da família; fica fora de qualquer
     repositório e não depende de manifesto. Não altera nenhum arquivo existente.
  2. `Informar outro caminho` — o usuário dita o path, que volta ao início das guardas como se tivesse
     vindo por `--dest`.
  3. `Não escrever nada` — encerra a escrita; o elo segue e registra a recusa.

Ao usar o default, dizer no chat que declarar `specialists_root` (ou `kits_root`) no manifesto é o que
torna o resultado reutilizável entre máquinas. O aviso continua existindo; o que mudou é que ele não
substitui mais a pergunta.

## Canonização: `realpath` antes de qualquer julgamento

Todas as guardas operam sobre o **path canônico**, nunca sobre o que foi digitado. `~`, `..`,
symlink no meio do caminho e caminho relativo tornam duas strings diferentes o mesmo lugar, e duas
strings iguais lugares diferentes.

```bash
DEST_RAW="$1"                                # o que veio da cascata
DEST=${DEST_RAW/#\~/$HOME}                   # expandir ~ antes de tudo
PARENT=$(dirname "$DEST")

# o destino pode ainda não existir; o pai mais próximo que existe é o que se resolve
ANCESTOR="$PARENT"
while [ ! -e "$ANCESTOR" ] && [ "$ANCESTOR" != "/" ]; do ANCESTOR=$(dirname "$ANCESTOR"); done

CANON=$(realpath "$ANCESTOR" 2>/dev/null) \
  || CANON=$(cd "$ANCESTOR" 2>/dev/null && pwd -P)   # fallback sem realpath no PATH
[ -z "$CANON" ] && { echo "destino não resolve: $DEST_RAW"; exit 1; }
```

**Path que não resolve aborta a escrita.** Não vira o default, não vira uma tentativa de `mkdir -p`
para ver no que dá. Um path que não resolve é quase sempre um erro de digitação ou uma variável vazia
que virou `/`; escrever no default nesse caso troca um erro visível por um arquivo em lugar nenhum.

## As três guardas

Rodam **nesta ordem**, sobre o path canônico, **antes** de qualquer `mkdir`, `touch` ou write. Cada
uma que dispara para o fluxo e devolve a decisão ao usuário — nenhuma se resolve sozinha.

### F1 — escrita através de symlink

Um destino que já existe como symlink faz o write **seguir o link** e sobrescrever o alvo, que
normalmente mora dentro do repositório de dotfiles. O arquivo aparece modificado num repo que o
usuário nem tinha aberto.

```bash
if [ -L "$DEST" ]; then
  REAL=$(readlink -f "$DEST" 2>/dev/null || readlink "$DEST")
  # NÃO escrever. Reportar $DEST -> $REAL e perguntar.
fi
```

Regra: **sendo symlink, não escrever.** Reportar o path e o alvo real, e perguntar (single-select:
escrever no alvo real assumindo a mudança no repo de origem / escolher outro destino / não escrever).

A mesma verificação vale para os **diretórios do caminho**: escrever dentro de um diretório que é
symlink também segue o link. Testar `-L` em cada ancestral até o primeiro que existe, não só na folha.

### F2 — destino dentro de repositório git

Um destino que resolve para dentro de um repositório git suja o working tree de um projeto que não é
o alvo do trabalho. É o caso mais comum quando os dotfiles são versionados: o path declarado no perfil
parece neutro e resolve para dentro do repo pessoal.

```bash
if REPO_TOP=$(git -C "$CANON" rev-parse --show-toplevel 2>/dev/null); then
  git -C "$REPO_TOP" status --porcelain     # mostrar o estado atual ao usuário
  # exigir confirmação explícita que NOMEIA o repositório
fi
```

Regra: **confirmação explícita nomeando o repositório.** A pergunta diz qual repo é (`$REPO_TOP`),
mostra o `git status --porcelain` dele — para que o usuário veja o que já estava sujo antes de nós — e
só então oferece seguir. Uma confirmação genérica ("posso escrever?") não serve: o ponto inteiro da
guarda é o usuário descobrir **em qual repositório** ele está autorizando uma mudança.

Isto vale mesmo quando o repositório é do próprio usuário. Especialmente quando é: é o caso em que
ninguém vai revisar a mudança antes de ela virar commit.

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

Regra: **dizer o que foi detectado e oferecer o padrão que a máquina já usa.** A oferta não é abstrata
— o diretório de origem dos links existentes (`$ORIGIN`, o pai dele) é a resposta concreta: escrever
lá e criar o symlink no destino, que é exatamente o que todo o resto daquele diretório faz. As opções
são: escrever na origem e linkar (recomendada, com os dois paths escritos por extenso) / escrever o
arquivo real assumindo que ele é efêmero / escolher outro destino.

## Gate de arquivo existente

Passadas as guardas, **antes de escrever cada arquivo**: existindo algo no path (`-e`), abrir gate com
três saídas, e só três:

- **Sobrescrever** — mostrando antes o diff contra o conteúdo novo, quando ambos forem texto.
- **Renomear** — o existente vira `<nome>.bak-<YYYYMMDD-HHMM>` no mesmo diretório, e o novo ocupa o
  path original. É a saída que preserva rollback sem exigir decisão sobre conteúdo.
- **Abortar** — aquele arquivo não é escrito. O resto do lote segue, e a omissão vai para o registro.

Não existe quarta saída, e não existe merge automático: reconciliar conteúdo gerado com conteúdo que
alguém editou à mão é uma decisão de autoria, não de escrita.

## Persistência da resposta

A resposta do gate é **persistida no manifesto**, para a pergunta não voltar a cada execução. No
`flux-context.json` mais próximo (mesma resolução de
`${FLUX_ROOT}/shared/flux-context.md`), sob `write_destinations`, chaveado pelo **path canônico**:

```json
{
  "write_destinations": {
    "/Users/alguem/.claude/flux-specialists": {
      "approved_at": "2026-08-10",
      "guards": { "symlink": "n/a", "git_repo": "confirmado: alguem/dotfiles", "dotfiles_dir": "n/a" }
    }
  }
}
```

A aprovação vale para o destino canônico e a subárvore dele, e **caduca quando o mundo muda**:
re-perguntar sempre que o path canônico mudar, ou quando qualquer guarda passar a disparar num estado
diferente do registrado (um diretório que virou repo git, um destino que virou symlink). Uma aprovação
guardada é memória de uma decisão sobre um estado — não uma licença permanente.

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
1. cascata            → candidato a destino (degrau 4 pode abrir GATE)
2. canonização        → realpath; não resolveu, aborta
3. F1 symlink         → folha e ancestrais
4. F2 repo git        → confirmação que nomeia o repo
5. F3 dotfiles        → aviso + oferta do padrão da máquina
6. gate por arquivo   → sobrescrever / renomear / abortar
7. escrita            → só dentro do escopo aprovado
8. registro           → paths criados, renomeados e pulados
```

Inverter qualquer par desta ordem desarma a guarda seguinte: julgar sem canonizar julga a string
errada, e escrever antes do passo 6 torna todo o resto uma auditoria pós-morte.
