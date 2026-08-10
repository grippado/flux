# Gate de escopo — contrato único de quando o trabalho é grande demais

> Fonte única de **como um elo `flux:` mede o tamanho de um pedido antes de gastar tempo com ele**:
> quais sinais contam, com que peso, em que momento são lidos, e o que cada consumidor faz com o
> veredito. **Não duplicar esta lógica** nos verbos: eles declaram o que fazem com a faixa, este
> arquivo define como a faixa é apurada.
>
> **Dois consumidores**, e o contrato é um só porque escrever um julgador de escopo por verbo é
> garantir que os limiares divirjam:
> - `${FLUX_ROOT}/skills/refine/SKILL.md`, que **recusa** o que não cabe numa rodada;
> - `${FLUX_ROOT}/skills/build/SKILL.md`, que **oferece o corte** antes de despachar, no
>   Step 2-quater, e tem override (`--no-slice`).
>
> Não cobre decomposição em si. Como um pedido grande vira issues independentemente entregáveis é
> `${FLUX_ROOT}/shared/issue-template.md`, seção **Decomposição (vertical slices)**, e este contrato
> se apoia nela para contar slice.

## Princípio (regra pétrea)

**O custo de errar é assimétrico, e o gate existe por causa dessa assimetria.** Subestimar escopo
custa a execução inteira: um despacho grande demais roda por dezenas de minutos, atravessa contexto,
e morre sem commit. Superestimar custa uma pergunta. Entre um erro que queima trabalho e um erro que
gasta uma linha de chat, o gate erra sempre para o lado da pergunta.

Três invariantes governam tudo abaixo:

1. **Medir nunca chama agente.** Todo sinal é lido do que já está em contexto — o texto do pedido, o
   corpo da issue, o embasamento em código que veio junto. Um gate que dispara fan-out para decidir
   se vale fazer fan-out custa exatamente o que queria economizar, e no `flux:build` ele violaria
   uma proibição explícita do elo (`${FLUX_ROOT}/skills/build/SKILL.md`, "Por que este elo não
   aciona specialists").
2. **O gate mede tamanho, nunca valor.** Ele não diz que o pedido é ruim, mal escrito ou pouco
   importante. Diz que não cabe **nesta ferramenta**, e aponta o que caberia. Um gate que opina
   sobre mérito vira um juiz que ninguém pediu.
3. **Toda decisão do gate fica registrada.** A faixa apurada e os sinais que a produziram vão para o
   board e para o banner. Dispensar o gate é legítimo; dispensá-lo sem deixar rastro não é, porque
   é exatamente o que impede aprender que os limiares estão errados.

## Dois tempos, e por que os sinais são os mesmos nos dois

O gate roda em **T0 (entrada)** e **T1 (apurado)**. A lista de sinais não muda; o que muda é quanta
informação já existe para lê-los.

- **T0 — entrada.** Lê só o pedido cru: o texto, os repos citados, os entregáveis enumerados. Serve
  para abortar **antes** de gastar prospecção. Um pedido que já bate um sinal duro em T0 não precisa
  de apuração para ser recusado: a apuração não vai encolhê-lo.
- **T1 — apurado.** Roda depois da prospecção, com achados reais em mãos: quantos arquivos, em
  quantos diretórios, quantas slices o plano de fato tem. É o veredito que vale.

Nem todo consumidor tem os dois tempos:

| consumidor | tempos | por quê |
|---|---|---|
| `flux:refine` | T0 **e** T1 | ele **produz** a apuração, então tem um antes e um depois |
| `flux:build` | passe único | ele **recebe** o embasamento pronto no corpo da issue (Step 2-ter), então os dois insumos chegam juntos e não há intervalo entre eles |

Um consumidor de passe único aplica a tabela inteira de uma vez. Não existe "meio gate".

## Os sinais

Duas classes, e a diferença entre elas é se um sozinho basta.

### Sinais duros — **um basta** para vermelho

| sinal | como se lê | por que é duro |
|---|---|---|
| **≥3 repos alvo** | repos com **escrita prevista**, não repos citados de passagem | três repos têm ordem de merge entre si, e ordem global é problema de `issue-tree`, não de uma rodada |
| **migração de dado irreversível** | o pedido altera, move ou apaga dado persistido **e não declara rollback** | uma slice que não dá para desfazer não é tracer bullet, é aposta |
| **mudança de contrato público** | API, evento ou schema consumido por outro time, produto ou cliente externo | quem quebra em silêncio não é quem executa, e quem descobre não estava na conversa |
| **decisão de produto em aberto sem dono** | o próprio pedido declara uma escolha não tomada, e não nomeia quem a toma | refinar por cima de uma decisão em aberto produz spec que precisa ser refeita inteira |

### Sinais moles — **dois bastam** para vermelho, **um** leva a amarelo

| sinal | como se lê |
|---|---|
| **>8 slices previstas** | contadas conforme a seção "Como contar", abaixo |
| **≥3 entregáveis distintos enumerados** | o pedido lista coisas que entregam valor separadamente ("reader **e** harness **e** hooks") |
| **arquivos em ≥3 diretórios de topo** | do embasamento em código, contando o primeiro segmento do path relativo à raiz do repo |
| **mistura produção, teste e infra** | o mesmo corpo pede código de produto, suíte de teste e hook/CI/build |
| **desenho visual novo sem referência** | UI que não existe, sem Figma, print ou componente equivalente apontado |
| **integração com terceiro** | serviço externo novo, credencial nova, ou dependência de time de fora |
| **motor `autonomo`** (só no `flux:build`) | sem os gates do repo, errar grande custa mais — herdado da resolução do Step 2, caminho C |
| **embasamento vazio** | nenhum achado `confirma` ou `parcial`; ninguém sabe onde isto encosta |

> **Por que dois, e não três ou um.** Um sinal mole sozinho descreve quase todo trabalho real: quase
> toda tarefa toca dois diretórios, quase toda feature tem um pouco de teste junto. Disparar com um
> transformaria o gate em ruído, e um gate que sempre dispara é um gate que sempre se dispensa.
> Três deixaria passar o caso que motivou tudo isto: uma task com quatro entregáveis, em dois
> diretórios, sem visual e sem terceiro, que rodou 43 minutos sem produzir commit.

## Como contar (para os consumidores não divergirem)

Contagem ambígua é como dois consumidores do mesmo contrato chegam a faixas diferentes para o mesmo
pedido. As definições:

- **Repo alvo** — repo onde o trabalho **escreve**. Repo citado como contexto, consultado ou lido
  não conta.
- **Slice** — entregável **independentemente entregável** no sentido do
  `${FLUX_ROOT}/shared/issue-template.md`: atravessa as camadas necessárias, 1 repo, e pode ir para
  produção sozinho. Camada não é slice: "o backend disto" e "o frontend disto" contam como **uma**
  slice quando uma não serve sem a outra.
- **Diretório de topo** — primeiro segmento do path **relativo à raiz do repo**
  (`src/`, `tests/`, `docs/`, `.github/`). Path de outro repo conta no repo dele.
- **Irreversível** — o pedido não declara caminho de volta. Migração com rollback escrito **não**
  é sinal duro; é trabalho normal, e escrever o rollback é uma slice.
- **Contrato público** — tem consumidor que não está nesta conversa. Contrato interno ao mesmo repo,
  mudado junto com todos os seus chamadores, não conta.

## As três faixas

| faixa | critério | significado |
|---|---|---|
| 🟢 **cabe** | nenhum sinal duro **e** nenhum sinal mole | uma rodada dá conta, com o artefato completo |
| 🟡 **cabe raso** | nenhum sinal duro **e** exatamente 1 sinal mole | uma rodada dá conta, **mas alguma coisa fica de fora**, e o que fica precisa ser declarado por nome |
| 🔴 **não cabe** | 1 sinal duro **ou** ≥2 sinais moles | não roda; o pedido precisa ser cortado ou levado a um processo maior |

O amarelo não é um verde com aviso. Ele obriga o consumidor a **nomear o que ficou raso** — não
"pode faltar coisa", e sim "sem threat model, sem plano por camada, sem mapa visual". Um amarelo que
sai como texto vago é um verde mentiroso.

## O que cada consumidor faz com a faixa

| faixa | `flux:refine` | `flux:build` |
|---|---|---|
| 🟢 | roda a rodada inteira | despacha direto |
| 🟡 | roda e **declara por nome** o que ficou de fora do artefato | abre gate oferecendo fatiar, com **corte proposto** |
| 🔴 | **recusa**, e entrega o pré-refinamento | abre gate com o corte proposto e a fatia 1 recomendada |

### O gate propõe o corte, não só sinaliza

Esta é a decisão que estava em aberto na LAB-65 (*"o gate propõe o corte ou apenas sinaliza e deixa
o humano cortar?"*), e ela fica resolvida aqui, uma vez, para os dois consumidores: **propõe**.

O motivo é o mesmo da assimetria do princípio. Um corte proposto e errado é rejeitado no gate, que é
o momento mais barato possível para rejeitá-lo — o usuário lê três linhas e escolhe outra coisa. Um
corte que ninguém propõe não acontece: o que acontece é o despacho inteiro, e o corte vem depois, à
mão, com o tempo já gasto. Propor é assumir um risco pequeno para eliminar um risco grande.

O corte proposto é sempre **nomeado e ordenado**: quais slices entram na fatia 1, quais ficam, e o
que a fatia 1 entrega sozinha. Uma proposta de corte que não diz o que a primeira fatia entrega
sozinha não é proposta, é uma lista.

### A recusa é útil, ou não é recusa

Vermelho no `flux:refine` **nunca sai como um "não" seco**. O que ele devolve, sempre:

1. **os sinais que dispararam**, nomeados, com o valor lido de cada um;
2. **o que já foi apurado até ali** — o T0, e a prospecção que já tenha voltado;
3. **a lista nominal dos artefatos que o escopo exige e que este verbo não produz**;
4. **um corte proposto**, com a fatia que provavelmente cabe;
5. **o encaminhamento**, resolvido pelo campo `scope_escalation` do manifesto
   (`${FLUX_ROOT}/shared/flux-context.md`). Sem o campo, recomenda genericamente um processo de
   refinamento completo e lista o que falta — nunca cita ferramenta que não foi declarada.

Quem recebe a recusa sai com material na mão. É isso que separa um gate de um obstáculo.

## Vermelho no `flux:refine` não tem override

Não existe `--force` que faça o `flux:refine` refinar um escopo vermelho.

> **Por que, já que a família libera o usuário a renunciar a gates** (`${FLUX_ROOT}/shared/hitl.md`,
> `--auto`). Porque os dois casos não são iguais. Renunciar a um gate de HITL é o usuário assumindo
> uma ação que ele entende: postar sem revisar, escrever sem confirmar. Forçar um refinamento
> vermelho produz **um artefato raso com aparência de completo** — um PRD sem as regras que ninguém
> levantou, um TRD sem o contrato que atravessa três repos —, e esse artefato circula, é lido como
> spec e vira base de execução. O erro não fica com quem o forçou; fica no documento.
>
> A porta de saída existe e é melhor: **cortar o pedido**. O corte proposto pelo gate está ali, e
> rodar o verbo sobre a fatia 1 é uma linha de chat.

No `flux:build` é diferente, e lá o override existe (`--no-slice`): despachar inteiro é uma execução
que falha visivelmente, em worktree, sem produzir documento que engane ninguém depois. A dispensa
**vira evento no board**, com os sinais que o gate tinha apurado.

## Como o veredito é declarado

Elo que roda este gate acrescenta **uma linha ao banner de perfil**
(`${FLUX_ROOT}/shared/preflight.md`, Passo 5), logo abaixo de `perfil:`. Formato canônico:

```
escopo: {🟢 cabe | 🟡 cabe raso | 🔴 nao cabe} ({sinal lido} · {sinal lido} · …)
```

Os sinais entre parênteses são os **lidos**, não os disparados — inclusive os que passaram, porque é
a leitura completa que torna o veredito auditável. Exemplos reais das duas pontas:

```
escopo: 🟢 cabe (1 repo · 4 slices · sem visual · sem migração)
escopo: 🟡 cabe raso (2 repos · 5 slices · UI nova sem referência)
escopo: 🔴 nao cabe (3 repos · migração sem rollback · 2 contratos entre times)
```

Elo que **não** roda o gate simplesmente não emite a linha. Nenhum banner leva `escopo: n/a`: campo
vazio anunciando capacidade inexistente é ruído, e o preflight já trata ausência dessa forma.

No board, a faixa e os sinais entram como **linha da Timeline de Eventos**, tipo `escopo`
(`${FLUX_ROOT}/shared/board-template.md`), e o corte proposto — aceito ou recusado — como `decisão`.

## Este gate erra, e onde ele erra

Heurística sobre texto não vira medição por estar escrita num contrato. Os modos de falha conhecidos,
e o que os contém:

- **Falso vermelho** — um pedido que cita três repos porque menciona dois de passagem. Contido pela
  definição de repo alvo ("escrita prevista"), e pelo fato de a recusa entregar o corte proposto:
  o usuário rebate em uma linha, não recomeça.
- **Falso verde** — um pedido curto que esconde trabalho grande ("só trocar o provider de auth").
  Nenhum sinal textual pega isso. Quem pega é o T1, com a prospecção na mão, e é por isso que o
  `flux:refine` roda o gate **duas vezes** em vez de confiar no T0.
- **Limiares errados** — os números (3 repos, 8 slices, 3 diretórios) vieram de um caso real e de
  uma leitura da família, não de uma amostra. Eles vão estar errados para alguém. Por isso a
  invariante 3 existe: sem o registro de cada disparo e de cada dispensa, não há como corrigi-los
  depois com evidência em vez de opinião.

> **O caso que originou os números** (2026-08-09): a LAB-62 foi despachada inteira — reader, harness,
> hooks e testes num único agente — e rodou **43 minutos sem produzir commit**. O corte que salvou a
> execução foi feito à mão, depois, e ficou registrado no board como "fatia 1/2, escopo reduzido
> para acelerar". O elo não participou da decisão. Aquele pedido tinha 4 entregáveis enumerados,
> arquivos em 3 diretórios de topo e mistura de produção com teste e hook: **três sinais moles**,
> vermelho por folga. É o caso que este contrato precisa pegar, e o piso contra o qual mexer em
> qualquer limiar deve ser conferido.
