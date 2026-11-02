# Sala de aprovação

Uma sala online para aprovar imagens e vídeos com o cliente: casting, locações, looks, planos. Feita para filmes com IA, serve para qualquer job visual que anda em rodadas.

**Um app, duas salas:**

- **`/producao`**: o time sobe as opções, cura, divide quem faz o quê e envia a rodada.
- **`/aprovacao`**: o cliente escolhe, aprova ou pede ajuste, e confirma a rodada.

É um site estático (HTML e JavaScript puro, sem build) ligado ao [Supabase](https://supabase.com) (banco, login e arquivos). Tudo o que é do seu projeto fica em um arquivo só: [`sala/config.js`](sala/config.js).

| Sala de produção: visão geral | Sala de aprovação: uma cena |
| --- | --- |
| ![Visão geral da sala de produção](docs/producao-visao-geral.jpg) | ![Cena na sala de aprovação](docs/aprovacao-cena.jpg) |

<sub>Prints do projeto de exemplo, com imagens de teste. Troque por um print ou GIF do seu projeto.</sub>

## O que ela faz

Toda rodada roda o mesmo ciclo, nas duas salas:

**gerar → curar (✓ ✕) → enviar → o cliente escolhe (★) → retorno → aprovado → vira o kit da próxima rodada**

O menu do time segue essa ordem:

- **Apresentação:** os decks do job (o seu e o do cliente) e os slides do cliente que viraram referência.
- **1 · Produção**
  - **A fazer:** uma coluna por pessoa, com os itens e as tarefas. Arrastar um card ou uma tarefa troca quem faz.
  - **Visão geral** e uma página por **cena**: o mesmo grid de cards em todo lugar. Cada cena abre no menu a lista dos seus itens, e um clique mostra o item sozinho.
- **2 · Aprovação**
  - **Envio:** a versão atual da rodada exatamente como o cliente vai ver. O olho de cada imagem tira ou põe ela no envio, e o que fica de fora espera recolhido no fim.
  - **Escolhas:** o que o cliente escolheu em cada cena, e se ele confirmou a rodada.
  - **Retorno:** o que o cliente pediu sobre a versão, virado trabalho. Cada item tem um status (aprovado, ajustar, refazer, caminho novo, esperando), o que fazer, as tarefas, as referências que ele deu (slide do deck, minuto de um vídeo, foto) e o que ficou em aberto (perguntar, receber, decidir). Os combinados da rodada ficam no cabeçalho.
- **Aprovado:** tudo o que o cliente aprovou até agora, na versão atual, pra baixar de uma vez.
- **Materiais:** o que o time pede ao cliente (fotos, vozes, logos), com envio dos dois lados.

**O card.** É o mesmo em todas as páginas:
- Imagem cheia. O título e a bolinha de estado ficam no canto.
- No hover aparecem ✓ ↻ ✕, os comentários, as versões, o comparar, o ✦ do Estúdio, o 3D, o download e o `⋯`.
- Arrastar pela bolinha muda a ordem dos cards na cena. A ordem vale pra sala, pro menu e pro animatic.
- O sistema de design está em [`DESIGN.md`](DESIGN.md).

**Versões.** Cada retorno do cliente abre uma versão nova da rodada (v1 é a entrega, v2 a resposta ao primeiro retorno…).
- As opções novas entram na versão aberta.
- Os cards mostram a mais nova de cada item (**Atual**), uma versão ou **Todas**.
- Cada opção nova se compara com a que veio antes.
- O cliente recebe, em cada versão, o ✓ do time nessa versão mais o que ele escolheu na anterior. O que o time decide no **Envio** vale mais que essa regra.

**Detalhe da opção.** Imagem grande com os botões sobre ela.
- As informações abrem no ⓘ ou na tecla `I`: modelo, data e autor, legenda, avaliação, as referências usadas na geração, "por que esta opção" e o prompt.
- **Desenhar:** o time e o cliente riscam e escrevem na imagem o que mudar.

**Mais:**
- **Antes e depois:** pares de opções (`__blocking`/`__ia`, `__sem`/`__com`) viram uma imagem só, com um traço que segue o mouse.
- **Baixar em `.zip`:** a rodada, a cena ou o item, tudo ou só o aprovado, com os arquivos nomeados na ordem do filme. O **Animatic** baixa todos os planos em ordem, prontos pra montagem.
- **Filtros:** um botão só, com versão, tipo e autor. O que está ligado aparece como etiqueta, e zera ao recarregar.
- **Curadoria dentro da sala do cliente:** quem está logado como time no mesmo navegador vê, na sala do cliente, "Tirar da aprovação" em cada imagem e item, com Desfazer. O cliente nunca tem esse botão.
- A sala se atualiza sozinha, avisa quando há versão nova publicada e pede a senha de novo se a sessão cair.

**Opcionais** (desligados no exemplo; veja [Estúdio e Cena 3D](#estúdio-de-ia-e-cena-3d-opcionais)):
- **Estúdio de IA (✦):** editar uma imagem com IA, criar uma nova a partir do kit da cena (o elenco, a locação e o produto aprovados), renderizar um ângulo do 3D e gerar vídeo. O Claude escreve o prompt a partir do pedido, dos desenhos e das referências.
- **Cena 3D:** o blocking em low poly de cada locação aprovada. O time põe o elenco (bonecos com poses), os objetos e o produto, enquadra com lentes reais e salva ângulos, que o Estúdio transforma em imagem.

## Como anda uma rodada

1. **Time:** em cada cena, o **+** (Novo item) no alto, depois sobe as opções (arraste para o card, ou cole com `⌘V`).
2. **Cura:** ✓ nas que vão, ✕ nas que não vão. Na v1, se um item tem alguma opção com ✓, o cliente vê só as com ✓; se não tem nenhuma, vê todas menos as descartadas.
3. **Envio:** confira o que vai, marque os itens como Pronto e envie. A sala abre a mensagem pronta para mandar no grupo.
4. **Cliente:** escolhe (A, B ou C), aprova ou pede ajuste num comentário, desenha na imagem se precisar, e confirma a rodada no **Resumo**.
5. **Retorno:** o time lê o que o cliente disse, na sala e fora dela, e marca o status, as tarefas e as referências de cada item. Depois abre a **v2** e começa a responder.
6. **Aprovado:** o que foi aprovado vira o kit da próxima rodada (os planos da A2 nascem do elenco e das locações aprovados na A1).

No `⋯` de cada item também dá para trocar entre **Escolhe uma** e **Aprova o conjunto**, mostrar ou esconder só aquele item, reabrir uma decisão e baixar o pacote do item.

## Instalação

Leva uns 15 minutos. Você precisa de uma conta no Supabase (o plano grátis serve) e de um lugar para publicar arquivos estáticos.

### 1. Banco (Supabase)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Isso cria as tabelas, as regras de acesso, as funções e o bucket de arquivos.
3. **Authentication → Users → Add user → Create new user**: crie os dois logins, um do time e um do cliente (e-mail e senha, com **Auto Confirm User** marcado). Os e-mails não precisam existir de verdade.
4. Diga ao banco quem é quem. No **SQL Editor**, rode (com os seus e-mails):

   ```sql
   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"side": "time"}' where email = 'time@exemplo.com';
   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"side": "cliente"}' where email = 'cliente@exemplo.com';
   ```

5. Recomendado: em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up**. Mesmo ligado, quem se cadastrar por fora não vê nada, mas não há motivo para deixar aberto.
6. Copie a **Project URL** (em **Project Settings → Data API**, ou no botão **Connect**) e a chave **anon** (em **Project Settings → API Keys**, aba *Legacy API Keys* se aparecer).

### 2. Config

Abra [`sala/config.js`](sala/config.js) e preencha:

- `SUPABASE_URL` e `SUPABASE_KEY`: o que você copiou no passo 6;
- `LOGINS`: os mesmos dois e-mails do passo 3;
- o resto do projeto (nome, cliente, time, cenas, rodadas): veja [Personalizar](#personalizar).

A chave anon foi feita para ir para o navegador: quem decide o que cada lado vê são as regras do banco.

### 3. Testar no seu computador

Na pasta do projeto:

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000/producao/` e entre com a senha do time. Na primeira entrada, a sala cria no banco as rodadas do config. A sala do cliente fica em `http://localhost:8000/aprovacao/`.

### 4. Publicar

Qualquer hospedagem de arquivos estáticos serve. Suba a pasta inteira, sem build:

- **Vercel:** `npx vercel deploy --prod` dentro da pasta.
- **Netlify:** arraste a pasta em [app.netlify.com/drop](https://app.netlify.com/drop).
- **GitHub Pages:** Settings → Pages → Deploy from a branch → `main` / `root`. Funciona também em subpasta (`usuario.github.io/sala-de-aprovacao/`).

Depois mande ao cliente o endereço que termina em `/aprovacao/` e a senha do login dele. O time usa `/producao/`. A raiz do site leva para a sala do cliente.

## Personalizar

Tudo em [`sala/config.js`](sala/config.js), com comentários:

| O quê | Onde | Exemplo |
| --- | --- | --- |
| Nome do projeto e texto do logo | `PROJECT.name`, `PROJECT.logo` | "Primeiro Gole" |
| Nome do cliente, com o artigo certo | `PROJECT.client`, `PROJECT.clientArticle` | "a Agência Exemplo", "da", "à" |
| Como o time assina os comentários | `PROJECT.studio` | "Estúdio Exemplo" |
| Cor de destaque | `PROJECT.accent` | `#C8F169` (use uma cor clara) |
| Rodapé do login, fuso das datas | `PROJECT.footer`, `PROJECT.timeZone` | |
| Os dois e-mails de login | `LOGINS` | |
| Pessoas do time | `PEOPLE` | `{ ana: "Ana", bruno: "Bruno" }` |
| Tipos de item e os dois com coluna própria | `KINDS`, `MAIN_KINDS` | casting à esquerda, locação à direita |
| Rodadas, prazos e texto de capa | `ROUNDS` | A1, A2, A3, Entrega |
| Cenas, falas e looks (paleta e prompt) | `SCENES` | `{ name: "Cozinha", line: "Já passou o café?" }` |
| Base de prompt e modelos por direção | `STYLE_BASE`, `PROMPTS` | |
| Mensagem de envio para o cliente | `SEND_MESSAGE` | `{rodada}`, `{link}`, `{itens}` |
| Estúdio de IA ligado e o visual do filme | `ESTUDIO.on`, `ESTUDIO.look` | `false`, "photoreal film still, …" |
| O produto que aparece em toda cena | `PRODUCT` | `{ title: "Produto" }` ou `null` |
| Decks da página Apresentação | `DECKS` | `{ from, title, note, url }` |

As chaves de `PEOPLE` e `KINDS` são o que fica salvo no banco. Se você mudar uma chave com o projeto andando, os itens antigos ficam com a chave velha.

O visual (cores neutras, fontes, espaçamentos) está em [`sala/style.css`](sala/style.css), com as cores no topo.

### Campos extras

Algumas colunas não têm tela de edição e são preenchidas pelo **Table Editor** do Supabase ou por um script seu:

- `options.prompt` e `options.model`: aparecem no detalhe da opção, com o botão "Copiar prompt". Um `model` que começa com "Blender" marca o item como renders do 3D.
- `options.refs`: as imagens que entraram na geração (fotos, logo, produto, o blocking, uma geração anterior), como `[{"label": "Foto da loja", "path": "refs/loja.jpg", "thumb": "refs/loja_thumb.jpg"}]`. Os caminhos são do bucket `media` (o `thumb` é opcional). Aparecem como miniaturas no detalhe da opção; passar o mouse mostra maior. A sala só mostra ao time.
- **Pares de antes e depois:** o nome do arquivo decide. `cozinha__blocking.jpg` + `cozinha__ia.jpg` mostram o blocking 3D à esquerda e o resultado da IA à direita; `cozinha__sem.jpg` + `cozinha__com.jpg` comparam duas versões da mesma imagem (sem e com sol, por exemplo), com as legendas das opções como rótulos. A avaliação e o download valem para a da direita.
- `items.variants`: as direções de um item (`{"A": "uma mulher de 40 anos, cabelo cacheado", "B": "..."}`). Viram os botões 1, 2… em `⋯ → Prompts`, montados com os modelos de `PROMPTS`.
- `items.refs`: ids de arquivos de **Materiais**. Fotos ativam o **Comparar** (gerado lado a lado com a foto original); áudios tocam ao lado das opções.

## Estúdio de IA e Cena 3D (opcionais)

### Estúdio de IA

O ✦ chama uma edge function do Supabase, que guarda as chaves dos geradores no servidor e só atende o login do time.

1. Instale a [CLI do Supabase](https://supabase.com/docs/guides/cli) e, na pasta do projeto, rode `supabase link --project-ref SEU-PROJETO`.
2. Publique a função: `supabase functions deploy estudio`.
3. Guarde as chaves como segredos da função (só as dos geradores que você vai usar):

   ```bash
   supabase secrets set MAGNIFIC_KEY=... HF_KEY=... ANTHROPIC_KEY=...
   ```

   Os geradores e as chaves de cada um:
   - `MAGNIFIC_KEY`: Nano Banana, pelo Magnific.
   - `HF_KEY`: GPT Image, Grok, Qwen e Seedance, pela Higgsfield.
   - `ANTHROPIC_KEY`: o Claude, que escreve os prompts.

   Opcional: `ALLOWED_ORIGINS=https://sua-sala.com` limita os sites que podem chamar a função.
4. No `config.js`, ligue `ESTUDIO.on` e escreva em `ESTUDIO.look` uma frase em inglês sobre o visual do filme.

Sem a função, deixe `ESTUDIO.on: false`: a sala funciona igual, só sem o ✦.

### Cena 3D

O motor (`sala/cena3d/cena3d.js`, `rig.js`, `kit.js`) é igual para todo projeto. Os cenários são de cada filme e ficam em [`sala/cena3d/sets.js`](sala/cena3d/sets.js), um por cena, com as câmeras, o elenco e os objetos. O exemplo traz uma cozinha para a cena 1. O comentário no topo do arquivo explica o formato. A aba **Cena 3D** aparece nos itens de locação do time.

## Atualizar uma sala que já está no ar

1. Troque os arquivos de `sala/` pelos novos, menos o seu `sala/config.js`, e acrescente nele as seções novas do config de exemplo (`ESTUDIO`, `PRODUCT`, `DECKS`).
2. No **SQL Editor**, rode uma vez [`supabase/atualizar-2026-11.sql`](supabase/atualizar-2026-11.sql). Ele cria as tabelas e colunas novas sem apagar nada, e pode rodar mais de uma vez.
3. Publique de novo.

## Segurança

- Cada lado tem **um login compartilhado**: as pessoas digitam só a senha. Quem é quem fica no nome que cada um escolhe ao entrar (assina comentários, escolhas e envios).
- O acesso é decidido no banco (RLS) pelo `app_metadata.side` do login, que o usuário não consegue alterar. O cliente nunca recebe itens não enviados, opções descartadas (ou sem ✓ quando o item tem alguma com ✓) nem as avaliações e notas do time.
- Os campos de uma opção que o cliente pode ver (legenda, prompt, "por que esta opção", referências) a sala só mostra ao time, mas chegam ao navegador do cliente. Não escreva ali o que o cliente não pode ler.
- Os arquivos ficam num bucket privado e abrem por links assinados que valem 12 horas.
- O retorno, as tarefas, as pendências, o envio, o Estúdio e a Cena 3D são só do time: o cliente não recebe nenhuma dessas tabelas.
- As chaves dos geradores de IA ficam só no servidor (segredos da edge function). A função recusa quem não está logado como time.
- **Sair** desconecta só aquele navegador. Como todo mundo de um lado usa o mesmo login, sair de todos os lugares derrubaria os colegas.
- Para trocar uma senha, rode no **SQL Editor**:

  ```sql
  update auth.users set encrypted_password = extensions.crypt('nova-senha', extensions.gen_salt('bf')) where email = 'cliente@exemplo.com';
  ```

## Estrutura

```
index.html             leva para aprovacao/
producao/index.html    sala do time (data-side="time")
aprovacao/index.html   sala do cliente (data-side="cliente")
sala/config.js         tudo do seu projeto
sala/app.js            o app, igual para todo projeto
sala/style.css         o visual
sala/estudio.js        o Estúdio de IA (opcional)
sala/cena3d/           a Cena 3D: o motor e os cenários do filme (sets.js)
supabase/schema.sql    banco, regras de acesso, funções e bucket
supabase/atualizar-2026-11.sql   leva uma sala instalada antes de nov/2026 ao banco novo
supabase/functions/estudio/      a edge function do Estúdio
DESIGN.md              o sistema de design: princípios, card, sinais, cores
```

O app usa o `supabase-js` 2.45.4 direto do jsDelivr, o JSZip do cdnjs (só quando alguém baixa um `.zip`) e o three.js 0.170 do jsDelivr (só na Cena 3D). Não tem `npm install`.

## Licença

[MIT](LICENSE). Use, copie e adapte à vontade.
