# Bootstrap de specialists — criar a suite que falta

> Fonte única de como um elo oferece criar a suite de specialists de um repo que não tem nenhuma.
> Referenciada por `flux:review`, `flux:iterate`, `flux:land` e `flux:build`. **Não duplicar esta
> lógica dentro dos elos** — apontar para cá e declarar só o gatilho (em que momento oferecer).

## Regra pétrea: o Bootstrap cria **L2**, nunca L3

A suite gerada vai para a **raiz de specialists locais do perfil** (`specialists_root`), **fora do
repositório revisado**. O Bootstrap nunca escreve dentro do checkout do repo.

Três razões, e todas valem mesmo quando o repo é seu:

1. **Autoridade.** Escrever no `.claude/agents/` de um repo é mudar o ferramental de todo mundo que
   trabalha nele. Isso é uma PR no projeto, com revisão do time, não efeito colateral de um review.
2. **Ritmo.** A suite local evolui quando você aprende algo sobre o repo, sem depender de aprovação
   de ninguém. É o que a torna útil rápido.
3. **Sobrevivência.** Você tem repos que não controla. A suite local funciona neles igual.

Se o repo já tem agents de review próprios, eles são **L3** e já entram na review por descoberta (ver
`review-agents.md`, Passo 1b). O Bootstrap não os toca, não os edita e não os substitui.

## Onde a suite é escrita

| perfil | destino |
|--------|---------|
| declara `specialists_root` | o template resolvido para o repo-slug |
| não declara | `~/.claude/flux-specialists/{repo}/repo-owner.md` (default da família) |

O default existe para que o Bootstrap funcione **sem manifesto nenhum**. Ao usá-lo, avisar no chat
que declarar `specialists_root` no manifesto é o que torna a suite reutilizável entre máquinas.

## Quando oferecer

Depois de terminar o trabalho principal do elo, **nunca antes**. O Bootstrap não pode atrasar o que
foi pedido: quem chamou `/flux:build` quer código, não uma entrevista sobre agents.

| elo | momento |
|-----|---------|
| `flux:review` | após gravar o artefato, junto com a ação pós-review |
| `flux:iterate` | ao assentar a PR, junto com o fechamento |
| `flux:land` | no go/no-go final, uma vez por repo da entrega |
| `flux:build` | no handoff (Step 4), depois da PR nascer |

**Só oferecer quando L2 está ausente.** Havendo suite local para o repo, não perguntar nada.
Havendo apenas L3, oferecer mesmo assim, dizendo o que a suite local somaria à do repo.

## A oferta

`AskUserQuestion` single-select:

- **Header:** `Bootstrap de agents?`
- **Question:** `O repo \`<slug>\` não tem suite de specialists local. Quer gerar um orquestrador + índice (e specialists base) a partir do código real?`
- **Options:**
  1. `Gerar e abrir PR draft (Recomendado)` — gera a suite e abre PR draft em `SPECIALISTS_REPO`.
     **Só oferecer quando `SPECIALISTS_REPO` está declarado**; sem ele, esta opção some e a 2 vira a
     recomendada.
  2. `Só gerar localmente (sem PR)` — escreve os arquivos, sem branch/commit/PR.
  3. `Agora não` — não faz nada (fica registrado como sugestão no artefato do elo, quando houver).

## Geração (opções 1 e 2)

Quando o perfil declara `SPECIALISTS_SPEC`, esse arquivo é a espec e rege o formato da suite. Sem
ele, seguir o checklist mínimo:

1. Confirmar repo-slug: `cd <WORKSPACE_ROOT>/<slug> && gh repo view --json name -q .name`.
2. Ler as instruções do repo (`AGENTS.md` e/ou `CLAUDE.md`) + detectar a stack (package.json / go.mod / Gemfile / pyproject / etc.).
3. **Ler os agents de review que o repo já tem (L3), quando houver.** A suite local deve
   **complementar** o que o repo cobre, não repetir. Registrar no índice o que ficou por conta de L3.
4. Delegar a autoria a um `general-purpose`, passando `SPECIALISTS_SPEC` quando houver, instruindo a
   escrever no destino da tabela acima: um **índice** (mapa dos módulos e grafo de deps), um
   **orquestrador** adaptado à estrutura real (**não** copiado verbatim de outro repo), e specialists
   base conforme o tipo de repo (ler código real antes de cada specialist).

Fan-out obrigatório: detecção de stack, leitura de L3 e autoria vão em subagentes, em paralelo quando
independentes. Ver `${FLUX_ROOT}/shared/fanout-discipline.md`.

## PR draft (só opção 1)

Alvo é o `SPECIALISTS_REPO` do perfil, **nunca** o repo revisado:

```bash
cd <checkout de SPECIALISTS_REPO>
git checkout -b feat/agents-<slug>-suite
git add <destino da suite, relativo à raiz do repo>
git commit -m "$(cat <<'EOF'
feat(agents): add <slug> agent suite

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
git push -u origin feat/agents-<slug>-suite
gh pr create --draft --repo <SPECIALISTS_REPO> --base <branch default do repo> \
  --title "feat(agents): suite de agents para <slug>" \
  --body-file <arquivo-de-corpo>
```

Corpo e título sem em-dashes quando `NO_EMDASH == true`. Registrar na resposta do chat o link da PR
draft (ou o path dos arquivos gerados, na opção 2).
