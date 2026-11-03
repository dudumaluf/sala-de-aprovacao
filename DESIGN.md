# Sala de aprovação · sistema de design

Este documento é a referência antes de mudar qualquer tela da sala. Uma tela nova usa os padrões daqui. Se um padrão não serve, ele muda aqui primeiro e depois em todas as telas que o usam.

## O que é

É a sala de produção de um filme. O time produz casting, locações e planos, o cliente aprova, e o retorno dele vira trabalho. Dentro da sala ficam o estúdio de IA (imagem e vídeo), a Cena 3D (blocking) e o animatic.

O job anda por etapas (as rodadas do `config.js`), por exemplo: A1 casting e locações, A2 planos e animatic, A3 corte, entrega. Toda etapa roda o mesmo ciclo:

**gerar → curar (✓ ✕) → enviar → o cliente escolhe (★) → retorno → aprovado → vira o kit da próxima etapa**

## Princípios

| # | Princípio | De onde vem |
|---|---|---|
| 1 | **O trabalho é o protagonista.** Imagem grande, interface que recua: fundo neutro escuro, linhas de baixo contraste, cor só quando significa algo. | Figura e fundo (Gestalt). Efeito estética-usabilidade. |
| 2 | **Cada coisa num lugar só, e um padrão por tipo de coisa.** O mesmo componente em todas as páginas. | Consistência interna. Lei de Jakob. |
| 3 | **Revelação progressiva.** O card mostra o essencial, o hover mostra as ações, o painel mostra o contexto e a página do card mostra tudo. | Nielsen. |
| 4 | **Sinal no lugar de texto.** Um vocabulário fixo de ícones em cima da imagem. | Reconhecimento em vez de memória. Proximidade e região comum (Gestalt). |
| 5 | **Menos escolhas por tela.** Uma vista por página, a não ser que a segunda se pague. Uma ação principal por contexto, grande e perto. | Lei de Hick. Lei de Fitts. |
| 6 | **Estado sempre visível.** Filtro ligado aparece como etiqueta e zera ao recarregar. O título da página diz o que se vê. | Visibilidade do estado do sistema (Nielsen). |
| 7 | **Toda entrada abre na origem.** Cada entrada de uma geração abre onde nasceu, e o resultado volta pro mesmo lugar. | Manipulação direta. Continuidade. |
| 8 | **Movimento com função.** Curto, saindo de onde a coisa mora, nunca decorativo. | Continuidade espacial. Easing. |

## Padrões

### Navegação (esquerda)
- As rodadas ficam no topo: A1, A2…
- Duas etapas: **Produção** (A fazer, Visão geral e as cenas) e **Aprovação** (Envio, Aprovadas, Retorno).
- Embaixo, o que é do job inteiro: Galeria, Aprovado e Materiais.
- Nomes curtos e genéricos: sem nome de cliente e sem versão no título. A versão aparece pequena no topo da página, quando importa.

### Página = grid de cards
- Toda página que mostra itens é o mesmo grid, agrupado por cena.
- A página escolhe só quais cards entram e qual sinal fica em cima da imagem. O resto é igual.
- O cabeçalho é sempre o mesmo: título curto, uma linha de estado e as ações em ícone à direita.
- Uma página pode ter uma seção recolhida no fim com o que ficou de fora ("Fica de fora", "Sem escolha"). Nada some sem aviso.

### Card
É um card só, o mesmo nas páginas das cenas, na Visão geral e na página do card.
- **Imagem:** cheia, a face atual do item.
- **Canto superior esquerdo:** o título (editável) com a bolinha de estado. Na Visão geral, que mistura cenas, vem também o número da cena.
- **Canto superior direito, no hover:** ✓ ↻ ✕ e a lixeira, e o histórico da imagem ‹ n/N › quando há.
- **Base, no hover:** à esquerda, os comentários e quem fez; à direita, as ferramentas (versões, comparar, ✦ estúdio, 3D, baixar, ⋯).
- **Embaixo do card:** nada, a não ser a linha amarela do que o cliente ainda pede (com o contorno amarelo) e as vozes de um casting.
- **Cliques:** na imagem, vê grande.
- **Ordem:** a bolinha vira a alça ⋮⋮ no hover; arrastar por ela muda a ordem dos cards dentro da cena (a linha do card no menu arrasta igual). A ordem é a do filme: vale pra sala, pro menu e pro animatic.

### Vocabulário de sinais
| Sinal | Significa |
|---|---|
| ✓ na cor de destaque | Da equipe: vai, ou foi, pro cliente |
| ✕ | Descartada: o cliente não vê |
| ★ âmbar | O cliente escolheu ou aprovou |
| vN | Versão da rodada |
| "n novas" | Sem ✓ nem ✕ ainda |
| balão n | Comentários (abre o painel) |
| clipe n | Referências (abre o painel) |

### Ver grande
- **O que é:** a imagem grande. As setas ‹ › (e ← →) andam pelos cards da página.
- **Histórico:** as versões da imagem ficam numa fileira embaixo dela, com a do card marcada "atual". ↑ ↓ trocam de versão. "Tornar atual" põe no card a versão aberta.
- **Ajustar (sem IA):** espelha, gira e muda a escala da imagem no próprio quadro; "Salvar versão" guarda uma versão nova do card.
  - Sem IA, a imagem sempre cobre o quadro: girar aproxima o necessário e arrastar para na borda.
  - Esc sai sem salvar.

### Painel lateral (direita)
É um só painel. Abre por um ícone do card e desliza da direita, com comentários, pedido (o retorno) e referências. A página nunca ganha uma segunda coluna de informação.

### Filtros
- **Um botão:** tudo fica atrás de "Filtros".
- **Grupos que combinam entre si:** versão, tipo e autor. Tipo e autor aceitam mais de um.
- **Etiquetas:** o que está ligado aparece como etiqueta com ✕, e "Limpar" tira tudo.
- **Zeram ao recarregar:** nada fica escondido sem a pessoa perceber.

### Galeria e seleção
- **O que é:** tudo o que a sala gerou e recebeu, de todas as rodadas e cenas, numa grade de miniaturas: cada versão e variação, e as fotos e vídeos que o cliente mandou. Só da equipe.
- **Miniatura:** só a imagem, com os sinais de sempre (★ ✓ ✕), a versão no card (n/N) e ▶ num vídeo. Cena, card, quem fez e a data só no hover.
- **Ordem:** por dia (mais novas ou mais antigas) ou por cena, com um título fino por grupo.
- **Selecionar:** ⌘ e Shift no clique, ou arrastar uma caixa. Com algo selecionado, o clique simples junta ou tira; o duplo vê grande. Esc limpa, ⌘A pega tudo o que aparece.
- **Agir:** a barra flutuante embaixo mostra quantas estão selecionadas e as ações em ícone; o botão direito abre as mesmas ações em menu. Abrir no card, Editar com IA, Agrupar, Baixar, ✓, ✕, Criar Soul ID.
- **Apagar:** o padrão é ✕. Apagar de vez só vale para o que já tem ✕ e não é do cliente, e pede para escrever APAGAR.
- **Grupos e Souls:** ficam numa linha em cima da grade, e cada um é um filtro.

### Estúdio
- **Palco:** a imagem fica encostada em cima, acima do card de prompt, sem ficar coberta. Só as linhas do prompt além da segunda podem passar por cima dela, para a imagem não pular enquanto se digita.
- **Ferramentas:** uma coluna colada à esquerda da imagem e centralizada na altura dela; em tela estreita, uma linha acima da imagem. A ordem é:
  - o que muda o que é gerado: Área e Ajustar (os controles do Ajustar abrem ao lado do botão);
  - o desenho: as ferramentas e as cores;
  - desfazer e apagar.
- **Aviso de atualização:** com o estúdio aberto, "A sala foi atualizada" fica no topo, nunca em cima do prompt.
- **Prompt:** flutua por cima da imagem, recolhe, mostra até umas 4 linhas.
- **Entradas:** bolinhas empilhadas, com a base num anel na cor de destaque. O hover abre a pilha e dá nome a cada uma.
- **Ações:** à direita, o envio em sequência: Melhorar, ×N, Gerar.
- **Versões:** ficam no trilho da direita. O que está no palco aparece logo acima do prompt.
- **Áreas:** é a primeira ferramenta da coluna (atalho A).
  - Cada retângulo é uma área numerada, até 6. O tracejado mostra o que o modelo recebe e o resto escurece.
  - Cada área tem uma etiqueta: o número, as bolinhas das referências dela, + e ✕. Na área do card, a etiqueta diz o tamanho e quanto amplia (coral quando não vai ganhar detalhe); nas outras, o começo do texto.
  - O card de prompt edita uma área por vez, com a pill do número no começo. Um clique na área ou na etiqueta (ou 1…6) passa o card pra ela.
  - Gerar manda cada área como um pedido próprio, e elas voltam juntas numa versão só. Onde duas se cruzam, vale a de número maior; se uma falha, as outras entram e a versão diz qual faltou.
  - Fora das áreas a imagem fica igual, pixel por pixel. O ✕ da etiqueta ou o Esc tiram a área.
- **Ajustar:** move, gira, espelha e muda a escala da imagem dentro do próprio quadro.
  - Com a ferramenta ligada, os controles aparecem ao lado dela. Arrastar move a imagem; a roda do mouse aproxima e afasta, e com ⌥ gira.
  - O que fica vazio aparece cinza e vai cinza para o modelo preencher.
  - Um ponto no botão avisa que a base está ajustada.
  - O ✓ guarda a imagem ajustada como versão nova, sem IA. Só vale quando ela cobre o quadro: o cinza é para o modelo preencher.
- **Soul 2 · rosto treinado:** com esse modelo, uma bolinha de rosto aparece ao lado da base.
  - Ela abre os Soul IDs treinados na Galeria e a força do rosto.
  - A base é a cena de partida. As outras referências e o desenho ficam apagados: não vão para esse modelo.
- **Câmera:** o ícone na barra, perto do modelo, abre as escolhas: tipo, câmera, lente, focal, diafragma e, em Mais, plano, ângulo, movimento (vídeo), filme (película e foto), filtro e temperatura.
  - Tudo começa em —, e aí o prompt vai como está. Com algo escolhido, o ícone acende com o resumo e um ✕.
  - Vai uma linha em inglês no fim do prompt, uma vez só, e o menu mostra a linha exata. Na imagem, com o equipamento pelo nome; no vídeo, sem nomes: a focal vira campo de visão em graus, e câmera, lente e diafragma viram o visual.
  - O Melhorar escreve a câmera no texto. Aí ela não vai de novo, a não ser que mude.
  - **Novo ângulo:** numa edição, a base vira a cena, fotografada de outro ponto, sem o "manter tudo igual", e o desenho mostra onde fica a câmera. Liga sozinho com focal, plano ou ângulo; o botão força ligado ou desligado.
  - Com áreas a câmera não vai: a área segue a imagem em volta. No blocking, a focal, o plano e o ângulo vêm do 3D.
  - As escolhas ficam neste computador e vão gravadas no pedido. "Usar a câmera desta imagem" traz de volta a de uma imagem.
- **Receitas:** o ícone do livro, ao lado do histórico, troca a coluna da direita pelas receitas do time, com busca, categorias, ✎ pra mudar uma e "Nova" pra escrever outra.
  - Arrastar uma receita até o prompt, ou clicar nela, põe um chip depois das referências. O ✕ tira; um clique no chip abre a receita na gaveta.
  - Com receitas, o Gerar passa pelo Claude: ele junta o texto, o desenho, a câmera e as receitas e escreve o pedido no contexto da cena. O texto do card fica como está, e o resultado mostra o "Prompt enviado". O Melhorar escreve no texto; aí o Gerar manda como está.
  - Cada receita diz o que é a base (editar a imagem ou refotografar a cena) e o que o desenho faz (limita onde muda ou só indica).
  - Com áreas, as receitas não vão; no vídeo, só as feitas pra vídeo. O chip fica riscado e diz por quê.
  - As receitas ficam na sala, pra todo o time. Uma receita sai da gaveta, nunca é apagada.
- **Prompt da versão:** na barra da versão que está no palco, "Prompt" mostra o que foi pro modelo, com Copiar.
- **Referências** (o +):
  - abas Aprovadas, Geradas, Material e 3D, mais Vídeos e Vozes no vídeo, cada uma com a contagem;
  - esta cena vem primeiro, e um seletor deixa ver uma cena só;
  - uma busca filtra pelo nome;
  - listas longas mostram mais aos poucos.

### Origem (princípio 7)
- **Bolinha de referência:** o asset abre no estúdio por cima da geração. A versão nova volta pro mesmo lugar e o card aprovado não muda.
- **Bolinha do blocking:** a Cena 3D abre naquele ângulo, em tela cheia. "Salvar e voltar" traz o ângulo novo como base do render, com o texto como estava.

## Cor
- **Fundo e superfícies:** fundo `--bg`, superfícies `--raise` e `--raise2`, linhas `--line` e `--line2`.
- **Destaque `--accent`** (`PROJECT.accent` no `config.js`): a ação principal e o que é nosso.
- **Âmbar:** o que é do cliente.
- **Coral:** erro ou descartado.
- **Nada de cor decorativa.**

## Movimento
- **Micro (hover, dica):** 120–180 ms, ease-out.
- **Painéis e sobreposições:** 220–280 ms. Ease-out pra entrar, ease-in pra sair. Vêm do lado onde moram.
- **Pilhas e listas:** abrem no lugar, sem pular.
- **Respeitar `prefers-reduced-motion`.**

## Escrita
- **Português do Brasil, curto.**
- **Botões com verbo:** "Salvar e voltar", "Usar na geração".
- **Dicas (tooltips):** dizem o que acontece, não o que o elemento é.
