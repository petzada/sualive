# Manifesto

Especificação da página `/manifesto`, fechada com o dono do produto em 2026-11-14 e implementada em
`apps/web/src/pages/ManifestoPage.tsx`. O botão "Saiba mais" do cartão da tela inicial leva a ela.

## Texto final

Todo este texto vai para o arquivo de textos do front (`apps/web/src/texts.ts`), nunca direto no
componente.

**Título**

> Tela compartilhada é companhia.

**Corpo**

> A gente acredita que dividir a tela é uma forma de estar junto. Quem mostra, convida. Quem assiste, faz
> companhia.
>
> Em agosto de 2026, uma decisão oficial suspendeu o vídeo e o compartilhamento de tela do Discord no
> Brasil. A medida veio depois de casos graves envolvendo menores. Proteger crianças e adolescentes é
> dever de toda plataforma, inclusive desta.
>
> Com a suspensão, interrompeu-se um hábito de muita gente: o filme visto a dois em cidades diferentes, a
> partida acompanhada pelos amigos, o trabalho mostrado a quem pediu para ver.
>
> A gente fez o sualive para que esses encontros continuem: um lugar simples, com regras claras, onde
> quem cria a sala cuida dela. E quem vê algo errado pode denunciar.

**Frase final**

> A gente só quer se divertir junto.

**Botão:** Criar sala

**Rodapé**, em duas linhas:

> O sualive é uma plataforma para maiores de 18 anos.
>
> Início · Termos de Uso · Políticas de Privacidade

**Aba e prévia do link:** título "Manifesto · sualive"; descrição "Tela compartilhada é companhia."

## Regras do texto

| Tema | Decisão |
|---|---|
| Voz | "A gente", primeira pessoa do plural |
| Público | Grupos de amigos primeiro; streamers em segundo plano |
| Postura diante da suspensão | Neutra: relata, não opina |
| Discord | Citado uma única vez, no relato |
| Órgão e lei | Não são nomeados: "uma decisão oficial" |
| Motivo da medida | "Casos graves envolvendo menores", sem detalhar |
| Registro | Solene, frases curtas |
| Tamanho | Curto, cerca de 125 palavras |
| "Adultos" | A palavra não aparece; o texto fala de pessoas |
| Alternativa ao que foi suspenso | O site não se apresenta assim; "para isso" aponta para o hábito de ver junto |
| Futuro da suspensão | O texto não fala se ela acaba |
| Fonte | Sem link para notícia |
| Proteção de menores | Só a frase de princípio; o detalhe fica nos termos |
| Maioridade | No rodapé e nos termos, não no corpo do texto |
| Exceção do chat (cópia anexada a denúncia) | Só na política de privacidade |
| Produto | Sem promessa de preço, de gratuidade, de anúncio ou de algoritmo |

## Página

- Endereço: `/manifesto`.
- Topo: "sualive" pequeno e centralizado, levando à tela inicial.
- Coluna de leitura estreita e centralizada, fundo `canvas`.
- Título centralizado: `text-display-sm` (48px) a partir de telas médias, `text-heading` (40px) no celular.
- Corpo de 21px: justificado no desktop, alinhado à esquerda no celular.
- Frase final centralizada, em destaque, **em uma linha só no celular** (cerca de 17px em 375px de
  largura, 24px no desktop).
- Botão "Criar sala" depois da frase final, igual ao da tela inicial, com o mesmo comportamento.
- Três cartões de fotos depois do botão, sem título acima: uma linha no desktop, empilhados no celular.
- Rodapé em duas linhas, como no texto. Sem seta de voltar: o caminho para a tela inicial é o "Início"
  do rodapé.

### Cartões de fotos

- Só a foto, sem nome, sem cidade e sem nenhum texto.
- Ao passar o ponteiro num cartão, ele cresce e os outros recuam, esmaecem e desfocam. Sem movimento para
  quem pede movimento reduzido.
- Não são clicáveis nem recebem foco: são decorativos.
- Canto de 28px (`rounded-card`) e nenhuma sombra projetada, pelos tokens de `DESIGN.md`. Sem dependência
  nova: o efeito é só CSS.
- Cada cartão só aparece quando a foto dele carrega; sem nenhuma foto, a faixa não aparece.

## Como trocar as fotos

As fotos ficam em `apps/web/public/images` como `manifesto-1.jpg`, `manifesto-2.jpg` e `manifesto-3.jpg`
(retrato ou quadrada, cerca de 800px de largura; o cartão corta para caber). A lista e a ordem estão em
`MANIFESTO_PHOTOS`, em `apps/web/src/pages/ManifestoPage.tsx`.

## O que ainda falta

- Termos de uso e política de privacidade publicados: quando existirem, entram os dois links na segunda
  linha do rodapé. Hoje o rodapé tem só a linha da maioridade.
- Denúncia existindo no produto: quando existir, o último parágrafo ganha a frase "E quem vê algo errado
  pode denunciar." Hoje ela está de fora.
- Prévia do link de `/manifesto` nos aplicativos de mensagem (tags Open Graph, feitas pelo Worker em
  `apps/api/src/preview.ts`). Hoje só o título da aba muda; a prévia é a genérica do site.
- O dono disse que a maioridade fica no rodapé e nos termos, "sem pedir aceite no cadastro da conta".
  `DECISOES.md` (entrega 2) pede declaração de 18 anos e aceite no primeiro acesso. As duas regras
  conflitam e precisam ser conciliadas pelo dono antes da implementação.
