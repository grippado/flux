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
```

- **Branch já existe** (caso normal de PR aberta): `git worktree add <path> <branch>` (checkout, **sem** `-b`).
- **Branch nova** (fluxo que cria a branch, ex.: um workflow que abre PR): aí sim `-b <branch>`.
- **Path da worktree:** `.worktrees/<BRANCH>` (o git aceita o `/` do nome da branch como subdiretório;
  ex.: `.worktrees/chore/figma-code-connect-setup`). Consistente com o `.worktrees/claude/<ticket>` que
  o `/workflow` de cada repo já usa.
- **Sincronia obrigatória:** a branch local da worktree tem que casar com `headRefName` da PR. Se
  estiver atrás do remote, `git -C <path> pull --ff-only origin <BRANCH>` antes de escrever, para não
  commitar em cima de estado velho.

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
