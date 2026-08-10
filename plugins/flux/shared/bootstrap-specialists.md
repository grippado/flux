# Bootstrap de specialists — criar a suite que falta

> Fonte única de como a suite de specialists de um repo que não tem nenhuma é criada. **Quem executa
> isto é o `flux:equip`** (`${FLUX_ROOT}/skills/equip/SKILL.md`), na metade L2 dele. Os elos
> `flux:review`, `flux:iterate`, `flux:land` e `flux:build` continuam **oferecendo** a criação nos
> mesmos momentos de sempre, mas a oferta é um atalho: aceitar dispara `${FLUX_CMD}equip <repo>
> --agents-only`. **Não duplicar esta lógica dentro dos elos** — apontar para cá e declarar só o
> gatilho (em que momento oferecer).
>
> **Por que a execução mudou de lugar.** Enquanto a oferta era a única forma de criar a suite, cada
> elo carregava um pedaço do procedimento, e o motor de execução (a outra metade do preparo de um
> repo) não tinha dono nenhum. Um verbo só de preparo resolve os dois: a lógica vive num lugar, e a
> ausência de motor deixa de ser um buraco que só aparece quando o `flux:build` cai no modo autônomo.

## Regra pétrea: o Bootstrap cria **L2**, nunca L3

A suite gerada vai para uma **raiz de specialists locais**, resolvida pela cascata de
`${FLUX_ROOT}/shared/write-destination.md`, e sempre **fora do repositório revisado**. O Bootstrap
nunca escreve dentro do checkout do repo.

Três razões, e todas valem mesmo quando o repo é seu:

1. **Autoridade.** Escrever no `.claude/agents/` de um repo é mudar o ferramental de todo mundo que
   trabalha nele. Isso é uma PR no projeto, com revisão do time, não efeito colateral de um review.
2. **Ritmo.** A suite local evolui quando você aprende algo sobre o repo, sem depender de aprovação
   de ninguém. É o que a torna útil rápido.
3. **Sobrevivência.** Você tem repos que não controla. A suite local funciona neles igual.

Se o repo já tem agents de review próprios, eles são **L3** e já entram na review por descoberta (ver
`review-agents.md`, Passo 1b). O Bootstrap não os toca, não os edita e não os substitui.

## Onde a suite é escrita

O destino **não é decidido aqui**. Ele vem da cascata e passa pelas guardas de
`${FLUX_ROOT}/shared/write-destination.md`, que é a fonte única de onde um artefato gerado pode
nascer: path ditado pelo usuário → `specialists_root` → `kits_root` → `write_destinations` já
aprovado → **perguntar** → default da família (`~/.claude/flux-specialists/{repo}/`), com guarda de
symlink antes do `realpath`, canonização, guarda de repo git, guarda de diretório de dotfiles e gate
por arquivo existente antes de qualquer escrita.

**O destino resolvido é um diretório** — nunca um arquivo, mesmo quando o valor que o produziu
terminava em `.md` (o template de `specialists_root` termina, e o contrato toma o `dirname`). O que o
Bootstrap acrescenta ao contrato é só o **nome dos artefatos** dentro desse diretório: o orquestrador
nasce como `repo-owner.md`, ao lado do índice e dos specialists base.

> **O default nunca é assumido em silêncio.** Sem `specialists_root`, sem `kits_root` e sem aprovação
> já registrada, o Bootstrap **pergunta** (degrau 5 da cascata) com o default da família como
> recomendada — e é ao apresentar
> essa opção que ele diz que declarar `specialists_root` no manifesto é o que torna a suite
> reutilizável entre máquinas. Avisar depois de escrever chega tarde: o arquivo já está no disco de
> alguém, possivelmente através de um symlink, possivelmente dentro de um repositório git que não é o
> revisado.

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

**L2 `inalcançável` não pede Bootstrap.** A suite existe e não é invocável; o que falta é instalação,
não geração (`${FLUX_ROOT}/shared/review-agents.md`, passo 1a-bis). Oferecer geração ali cria o
segundo arquivo com o mesmo `name:`, que é o problema, não a solução.

## A oferta

GATE (`${FLUX_ROOT}/shared/hitl.md`), single-select:

- **Header:** `Bootstrap de agents?`
- **Question:** `O repo \`<slug>\` não tem suite de specialists local. Quer gerar um orquestrador + índice (e specialists base) a partir do código real?`
- **Options:**
  1. `Gerar e abrir PR draft (Recomendado)` — gera a suite e abre PR draft em `SPECIALISTS_REPO`.
     **Só oferecer quando `SPECIALISTS_REPO` está declarado**; sem ele, esta opção some e a 2 vira a
     recomendada.
  2. `Só gerar localmente (sem PR)` — escreve os arquivos, sem branch/commit/PR.
  3. `Agora não` — não faz nada (fica registrado como sugestão no artefato do elo, quando houver).

### Como a oferta vira execução

As opções 1 e 2 **não geram nada dentro do elo que perguntou**: elas invocam
`${FLUX_CMD}equip <slug> --agents-only`, que assume dali com os gates de destino e de manifesto no
lugar certo. A opção 3 imprime esse mesmo comando, para quem quiser rodar depois.

**Quando `FLUX_CMD` é `UNAVAILABLE`** (o Passo 1b do `${FLUX_ROOT}/shared/preflight.md` não achou
forma verificável de invocar a família — hoje, o caso do Codex), a oferta **não aborta e não some**,
mas deixa de escrever: ela vira **instrução impressa**, não gate. O elo diz qual camada falta, que o
verbo de preparo é o `equip`, e que ele precisa ser invocado à mão pela forma que aquela sessão expõe
— sem nomear uma forma que não pôde verificar. Não há opção 1 nem 2 nesse estado, porque as duas
escrevem.

**Por que o degradado não é o elo executar por si.** A tentação é óbvia — o procedimento está escrito
logo abaixo, e o elo poderia segui-lo. Mas quem oferece não tem o que é preciso para escrever com
segurança: `flux:review`, `flux:iterate` e `flux:land` **não declaram** `write-destination.md` em
`requires`, então o preflight deles nunca verificou o contrato de destino. Executar ali seria escrever
no disco do usuário sem cascata, sem as três guardas e sem gate por arquivo existente — com **menos**
verificação do que a execução normal, não com mais autonomia. É o mesmo raciocínio que o
[`codex-compat.md`](codex-compat.md) aplica ao `land`: quando o despacho não é possível, dizer que não
é. Preparo não feito custa uma invocação manual; preparo feito errado custa um arquivo no disco de
alguém, possivelmente através de um symlink, possivelmente dentro de um repositório git que não é o
revisado.

O `equip` roda **no contexto principal do elo que ofereceu**, e não dentro de subagente. Não é
exceção à disciplina de fan-out: é consequência dela. O verbo abre gates (destino de escrita,
manifesto), e subagente não tem canal com o usuário (`${FLUX_ROOT}/shared/hitl.md`). O trabalho
pesado do verbo — ler o repo, detectar stack, autorar os arquivos — continua indo para subagente,
despachado por ele. E a main do elo que ofereceu já terminou o trabalho dela quando a oferta aparece,
que é justamente por que a oferta vem depois e não antes.

## Geração (opções 1 e 2)

Este é o procedimento que o `flux:equip` executa no Step 4 dele. Um elo que ofereceu o Bootstrap não
roda estes passos: ele chama o verbo.

Quando o perfil declara `SPECIALISTS_SPEC`, esse arquivo é a espec e rege o formato da suite. Sem
ele, seguir o checklist mínimo:

1. Confirmar repo-slug: `cd <WORKSPACE_ROOT>/<slug> && gh repo view --json name -q .name`.
2. Ler as instruções do repo (`AGENTS.md` e/ou `CLAUDE.md`) + detectar a stack (package.json / go.mod / Gemfile / pyproject / etc.).
3. **Ler os agents de review que o repo já tem (L3), quando houver.** A suite local deve
   **complementar** o que o repo cobre, não repetir. Registrar no índice o que ficou por conta de L3.
4. **Resolver o destino pelo contrato** (`${FLUX_ROOT}/shared/write-destination.md`): cascata,
   normalização a diretório, as três guardas e a canonização, na ordem obrigatória de lá. Tudo isso
   acontece **no contexto principal, antes do despacho** — subagente não abre gate
   (`${FLUX_ROOT}/shared/hitl.md`), então um destino resolvido lá dentro é um destino resolvido sem
   ninguém para perguntar. A persistência da aprovação no manifesto vem **depois da escrita** e tem
   gate próprio, também na main: registrar é escrever num arquivo do usuário como qualquer outro.
5. Delegar a autoria a um `general-purpose`, passando `SPECIALISTS_SPEC` quando houver e o **destino
   já aprovado** (path canônico, absoluto), instruindo a escrever ali e **em lugar nenhum além
   dali**: um **índice** (mapa dos módulos e grafo de deps), um **orquestrador** adaptado à estrutura
   real (**não** copiado verbatim de outro repo), e specialists base conforme o tipo de repo (ler
   código real antes de cada specialist). O gate por arquivo existente (sobrescrever / renomear /
   abortar) também é do contexto principal: o subagente reporta o que pretende escrever, não decide
   sobre o que já está lá.
6. Registrar os paths criados, renomeados e pulados, conforme o contrato. Sem essa lista não há
   rollback da suite gerada.

Fan-out obrigatório: detecção de stack, leitura de L3 e autoria vão em subagentes, em paralelo quando
independentes. Ver `${FLUX_ROOT}/shared/fanout-discipline.md`.

## PR draft (só opção 1)

Alvo é o `SPECIALISTS_REPO` do perfil, **nunca** o repo revisado. Aqui a guarda F2 do contrato de
destino (`${FLUX_ROOT}/shared/write-destination.md`) dispara **por construção** — o destino é um
repositório git, e é isso que se quer. A confirmação continua obrigatória e continua tendo que nomear
o repositório: escolher "abrir PR draft" autoriza commit num repo específico, e o usuário precisa ler
o nome dele antes, não depois.

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
draft **e** a lista de paths absolutos escritos, renomeados e pulados (na opção 2, só a lista) —
conforme o registro exigido por `${FLUX_ROOT}/shared/write-destination.md`.
