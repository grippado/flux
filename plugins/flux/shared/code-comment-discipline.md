# Disciplina de comentários em código — não comentar sem pedido

> Fonte única da regra "código que a família escreve não ganha comentário explicativo por conta
> própria". Referenciada por todo elo que **escreve código** (`flux:build`, `flux:iterate`, e o
> `flux:land` por tabela, já que ele despacha o iterate). **Não duplicar esta lógica** nos elos:
> apontar para cá e propagar a regra ao prompt de todo subagente executor.

## Princípio

**Não inserir comentário em código sem pedido explícito.** Vale para código de produto e de teste,
para arquivo novo e para arquivo editado, e vale igual dentro de subagentes executores.

Justificativa de decisão, evidência, medição, citação de spec, veredito de review, o que foi tentado e
falhou, o que ficou pendente: **tudo isso vai na mensagem de commit e na descrição da PR**. É onde esse
conteúdo é lido, é revisável, e não envelhece dentro do arquivo.

Comentário não é lugar de contar a história da decisão. Código em comentário não deve virar texto.

## Por que isto é regra, e não preferência de estilo

Os elos da família são especialmente propensos a esse defeito, e por um motivo estrutural: eles operam
**a partir de threads de review**. O contexto que chega ao executor é justamente a discussão, a
evidência e o veredito, e a tentação de deixar tudo isso "registrado onde não se perde" é constante.

O resultado agregado é um arquivo onde a lógica desaparece embaixo de narrativa que só fazia sentido no
dia em que foi escrita, e que ninguém atualiza quando o código muda. Pior: um comentário que descreve
uma conclusão **errada** de review vira desinformação com aparência de documentação, e sobrevive muito
depois de a thread ter sido corrigida.

Caso real que originou esta regra: um `iterate` acumulou, ao longo de quatro rodadas, 64 linhas de
comentário sobre medição de acessibilidade, spec ARIA e histórico da própria review, dentro de um util
de 50 linhas e dos testes dele. Duas dessas rodadas escreveram comentários que a rodada seguinte
provou errados.

## O que NÃO é atingido

- **Diretivas de ferramenta**: `eslint-disable`, `@ts-expect-error`, `biome-ignore`, `prettier-ignore`,
  pragmas de compilador, `nolint`. São instruções para máquina, não prosa.
- **Doc comment que é contrato de API pública** (JSDoc/TSDoc de símbolo exportado, docstring de módulo
  publicado), **quando o repo já usa esse padrão**. Seguir a casa, nunca inaugurar.
- **Comentários preexistentes.** Não se apaga comentário alheio de passagem. Removê-los é mudança fora
  do escopo da rodada e precisa de pedido, como qualquer outra.

## Na dúvida

Não comentar, e explicar no commit. Se um valor mágico ou um contorno de bug externo ficar genuinamente
incompreensível sem uma linha de contexto, **perguntar ao usuário** em vez de decidir sozinho que aquele
caso merece exceção. O executor que topar esse caso o **reporta no retorno**, e quem decide é a main,
com o usuário.

## Como propagar aos subagentes

O executor não herda a conversa nem os `CLAUDE.md` da sessão da main. Então a regra precisa ir **no
prompt**, explicitamente, em toda tarefa que escreve código. Uma linha basta:

```
Não insira comentários no código. Justificativa vai na mensagem de commit, não no arquivo.
Exceções: diretivas de ferramenta (eslint-disable e afins) e o padrão de doc comment que o repo
já usa. Se algum trecho ficar incompreensível sem comentário, reporte no retorno em vez de comentar.
```

Um elo que despacha executor **sem** essa linha está terceirizando a violação da regra, e o resultado
volta pronto para commitar.

## Verificação antes de commitar

Antes do commit de uma rodada, conferir o que se está prestes a introduzir:

```bash
git -C "$WORKTREE" diff --cached | grep -nE '^\+\s*(//|/\*|\*|\{/\*|#)' | head -40
```

Linha de comentário adicionada que não caia nas exceções acima **sai antes do commit**. É verificação
barata e determinística, e é o único ponto do fluxo em que dá para pegar isso sem depender de o usuário
revisar.
