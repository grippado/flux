# Manifestos de exemplo

Um `flux-context.json` vai num `.claude/` de workspace ou repo. O comando procura o **mais próximo**
subindo a árvore a partir do `cwd`. Sem manifesto nenhum, a família funciona no perfil genérico.

| arquivo | quando usar |
|---------|-------------|
| `solo.json` | um dev, repos próprios, sem time e sem tracker |
| `time.json` | time com reviewers próprios, suite de specialists curada e tracker |
| `pessoal.json` | projetos pessoais com vault de notas, sem tracker corporativo |

Contrato completo de cada campo: [`shared/flux-context.md`](../plugins/flux/shared/flux-context.md).

**Nenhum campo além de `name` é obrigatório.** Cada campo ausente cai no default do perfil genérico.
