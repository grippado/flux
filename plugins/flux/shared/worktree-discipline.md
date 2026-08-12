# Disciplina de worktree — trabalhar sempre em worktree dedicado

> Fonte única do protocolo "todo fluxo que escreve código opera num git worktree dedicado à branch,
> nunca na árvore principal do repo". Referenciada por `flux:iterate`, `flux:land` e qualquer
> comando/skill da família que aplique correções, commite ou pushe. **Não duplicar esta lógica** nos
> comandos: apontar para cá e declarar só o que for específico (qual branch, qual repo).
>
> Complementa qualquer skill de worktree que o ambiente ofereça (mecânica geral de isolamento). Este shared é a
> versão canônica para os fluxos que atuam sobre **PRs já existentes**: a branch já existe, o alvo é
> a worktree dela.

## Princípio (regra pétrea)

**Nenhum fluxo que escreve código toca a árvore principal (`main` checkout) do repo.** Não se faz
`git checkout <outra-branch>` no working tree principal para "entrar" na branch da PR: isso sequestra
o checkout do usuário, some com mudanças não commitadas dele e mistura contextos. Em vez disso, cada
branch de trabalho vive na **sua própria worktree**, e o fluxo opera lá.

Vale para toda escrita: aplicar correções de review (`flux:iterate`), manter PRs merge-ready
(`flux:land`), e qualquer comando que edite arquivos + commite + pushe numa branch de PR.

## Quando aplicar

Sempre que o fluxo for **escrever** (editar arquivo, `git add`, `git commit`, `git push`) numa branch
que não seja a que já está com checkout dedicado no `pwd`. Se o `pwd` **já é** uma worktree cuja
branch casa com a branch alvo, seguir nela (não criar outra).

Fluxos **read-only** (`flux:peek`, `flux:review`, `flux:iterate --dry`) **não** precisam de worktree:
leem o diff via `gh`/GraphQL sem tocar o working tree. Este protocolo é só para quem escreve.

## Protocolo de resolução (dado REPO alvo + BRANCH alvo)

`BRANCH` = `headRefName` da PR. `REPO_PATH` = checkout local do repo (`<WORKSPACE_ROOT>/<repo>`).

```bash
# 0. Garantir que o repo tem checkout local. Sem checkout → não dá para operar:
#    registrar o bloqueio e reportar (não abortar todo o fluxo num delivery multi-PR).

# 1. A worktree da BRANCH já existe? (fonte de verdade: git worktree list)
git -C "$REPO_PATH" worktree list --porcelain
#    Procurar a linha 'branch refs/heads/<BRANCH>' e pegar o 'worktree <path>' dela.
#    - Se o pwd atual JÁ é esse path → operar aqui, não criar nada.
#    - Se existe em outro path → cd nele e operar lá.

# 2. Não existe worktree para a BRANCH → criar em .worktrees/<BRANCH> dentro do repo.
#    Garantir que a branch local existe/está atualizada antes:
git -C "$REPO_PATH" fetch origin "$BRANCH"
#    Blindar o ignore SEM sujar o repo do time (não commitar .gitignore por infra pessoal):
grep -qxF '.worktrees/' "$REPO_PATH/.git/info/exclude" 2>/dev/null \
  || echo '.worktrees/' >> "$REPO_PATH/.git/info/exclude"
#    Criar a worktree apontando para a branch EXISTENTE (sem -b: a branch da PR já existe):
git -C "$REPO_PATH" worktree add ".worktrees/$BRANCH" "$BRANCH"
cd "$REPO_PATH/.worktrees/$BRANCH"

# 3. Provisionar os arquivos de ambiente (ver "Provisionar o ambiente da worktree" abaixo).
#    Vale para worktree recém-criada E para worktree reusada de um tick anterior: o cofre pode
#    ter ganhado um env novo desde então, e o passo é idempotente por nunca sobrescrever.
```

- **Branch já existe** (caso normal de PR aberta): `git worktree add <path> <branch>` (checkout, **sem** `-b`).
- **Branch nova** (fluxo que cria a branch, ex.: um workflow que abre PR): aí sim `-b <branch>`.
- **Path da worktree:** `.worktrees/<BRANCH>` (o git aceita o `/` do nome da branch como subdiretório;
  ex.: `.worktrees/chore/figma-code-connect-setup`). Consistente com o `.worktrees/claude/<ticket>` que
  o `/workflow` de cada repo já usa.
- **Sincronia obrigatória:** a branch local da worktree tem que casar com `headRefName` da PR. Se
  estiver atrás do remote, `git -C <path> pull --ff-only origin <BRANCH>` antes de escrever, para não
  commitar em cima de estado velho.

## Provisionar o ambiente da worktree (envs)

**Uma worktree recém-criada não roda.** O `git worktree add` traz o que o git rastreia, e arquivos de
ambiente com segredo (`.env`, `.env.local`, `apps/*/.env`) são justamente os que o repo **ignora**.
Então a worktree nasce com o código certo e sem configuração nenhuma: `pnpm dev` sobe apontando para
lugar nenhum, o teste de integração falha por credencial ausente, e o sintoma não diz que o problema
é env faltando.

Isso importa para este protocolo porque a worktree deste elo não serve só para o elo escrever nela:
ela é **onde o usuário vai olhar o resultado**. Entregar uma worktree que não sobe é entregar meio
trabalho.

**Fonte dos envs: o cofre declarado no manifesto.** Ver `env_vault` em
`${FLUX_ROOT}/shared/flux-context.md`. O cofre existe porque um `.env` gitignored não tem backup
nenhum: um `git clean -fdx` o evapora. Quem usa esse padrão mantém o cofre fora dos repos e o `.env`
do checkout principal como **symlink** para lá, de modo que editar de qualquer lado edita o mesmo
arquivo.

```bash
# ROOT e BASE vêm de env_vault do manifesto. Sem o bloco declarado, PULE este passo inteiro
# e declare a omissão — não sair adivinhando onde os envs moram.
REPO_REL="${REPO_PATH#"$ENV_VAULT_BASE"/}"        # ex.: team/api
SRC="$ENV_VAULT_ROOT/$REPO_REL"                    # ex.: ~/.envault/team/api
[ -d "$SRC" ] || echo "cofre sem entrada para $REPO_REL"

find "$SRC" -type f 2>/dev/null | while IFS= read -r v; do
  case "${v##*/}" in .DS_Store|.git) continue ;; esac   # ruído de filesystem, não é env
  rel="${v#"$SRC"/}"
  dest="$WORKTREE_PATH/$rel"
  # NUNCA sobrescrever: se já existe algo ali, é decisão de quem pôs.
  if [ -e "$dest" ] || [ -L "$dest" ]; then continue; fi
  mkdir -p "$(dirname "$dest")"
  ln -s "$v" "$dest"
done
```

Regras que não se relaxam:

- **Symlink para o cofre, nunca `cp`.** Copiar cria uma segunda verdade que dessincroniza em silêncio:
  o usuário corrige uma credencial num lado e o outro segue com a antiga. O symlink é o que faz o
  checkout principal e a worktree compartilharem o mesmo arquivo.
- **Nunca sobrescrever env que já existe na worktree.** Existindo arquivo ou link no destino, pular e
  registrar. Sobrescrever aqui apaga segredo local sem backup.
- **Só o que o cofre tem.** Não gerar env a partir de `.env.example`, não inventar valor, não copiar
  env de outro repo. Um env inventado transforma "não roda" em "roda errado", que é pior e mais caro
  de diagnosticar.
- **Nunca ler nem imprimir o conteúdo.** O provisionamento move referências, não valores: são
  segredos. Reportar `<path> -> cofre`, nunca o que está dentro.
- **Template versionado (`.env.example`, `.env.default`) não é assunto daqui**: vem no checkout porque
  é rastreado.
- **Declarar o resultado** no output do elo: quantos envs foram linkados, ou que o cofre não tem
  entrada para o repo, ou que o manifesto não declara `env_vault`. Uma worktree que pode não subir e
  não avisa é a mesma falha silenciosa que o banner de perfil existe para evitar.

> **Um cofre que faz prune de `.worktrees/` não vê worktree nenhuma**, e é o caso comum (varrer
> worktrees duplicaria cada env do repo no inventário). Por isso o provisionamento é deste protocolo,
> e não algo que o comando do cofre resolva sozinho: quem cria a worktree é quem sabe que ela existe.

## Segurança

- **Nunca commitar `.gitignore`/config de worktree no repo do time.** Usar `.git/info/exclude` (local,
  não versionado) para esconder `.worktrees/`. Só editar o `.gitignore` versionado se o repo já
  adotar `.worktrees/` como convenção própria (checar antes).
- **Nunca** `git checkout`/`git switch` de branch na árvore principal do usuário.
- **Nunca** `git push` para `main` nem para branch que não seja a `BRANCH` alvo.
- Uma worktree por branch. Se `worktree add` falhar por já existir o path, reusar o path existente
  (não recriar).

## Ciclo de vida

- A worktree de uma PR **vive enquanto a PR vive**. Fluxos de watch (iterate/delivery) reusam a mesma
  worktree entre ticks; não recriar nem remover no meio.
- **Cleanup é opcional e nunca automático dentro de um watch.** Remover só quando a PR mergear/fechar e
  o usuário pedir, via `git worktree remove <path>`.

## Cross-repo (delivery)

Num delivery multi-PR, cada PR resolve a **sua** worktree no **seu** repo por este mesmo protocolo. O
fluxo opera cada PR no worktree do repo dela; nunca reaproveita o working tree de um repo para outro.
