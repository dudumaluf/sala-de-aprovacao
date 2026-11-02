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
- Materiais fica embaixo.
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

### Painel lateral (direita)
É um só painel. Abre por um ícone do card e desliza da direita, com comentários, pedido (o retorno) e referências. A página nunca ganha uma segunda coluna de informação.

### Filtros
- **Um botão:** tudo fica atrás de "Filtros".
- **Grupos que combinam entre si:** versão, tipo e autor. Tipo e autor aceitam mais de um.
- **Etiquetas:** o que está ligado aparece como etiqueta com ✕, e "Limpar" tira tudo.
- **Zeram ao recarregar:** nada fica escondido sem a pessoa perceber.

### Estúdio
- **Palco:** a imagem fica no mesmo eixo do prompt.
- **Prompt:** flutua por cima da imagem, recolhe, mostra até umas 4 linhas.
- **Entradas:** bolinhas empilhadas, com a base num anel na cor de destaque. O hover abre a pilha e dá nome a cada uma.
- **Ações:** à direita, o envio em sequência: Melhorar, ×N, Gerar.
- **Versões:** ficam no trilho da direita. O que está no palco aparece logo acima do prompt.

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
