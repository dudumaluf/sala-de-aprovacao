// Tudo o que muda de um job para outro mora aqui. O resto (app.js, style.css) é igual para todo projeto.
// Este é o exemplo: copie para sala/config.js (que fica fora do git, para o config de um job nunca subir) e preencha.
// O exemplo abaixo é fictício ("Primeiro Gole", um filme para uma marca de café inventada): troque pelo seu.

// ---------- Supabase ----------
// URL e chave "anon" do seu projeto: Project Settings → Data API e API Keys (aba Legacy, se aparecer).
// Essa chave foi feita para ir para o navegador: quem decide o que cada um vê são as regras (RLS) do schema.sql.
export const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
export const SUPABASE_KEY = "COLE-AQUI-A-ANON-KEY";

// Os dois logins da sala (crie no Supabase: Authentication → Users). Cada lado digita só a senha.
// "time" entra em /producao, "cliente" entra em /aprovacao.
export const LOGINS = {
  time: "time@exemplo.com",
  cliente: "cliente@exemplo.com",
};

// ---------- Vários jobs num projeto (opcional) ----------
// Um projeto Supabase pode guardar vários jobs, cada um no seu schema e no seu bucket: supabase/job.py escreve o banco
// de um job. Com JOB, os dois logins levam app_metadata.job (este nome) e app_metadata.room ("time" | "cliente") em vez
// de app_metadata.side, e o login de um job não abre nada na sala de outro. Sem estas linhas: schema public, bucket media.
export const SCHEMA = "public";
export const BUCKET = "media";
export const JOB = "";

// Endereço da sala do cliente, usado na mensagem de envio. Vazio = o mesmo site, em /aprovacao/.
export const CLIENT_URL = "";

// O prefixo do que a sala guarda no navegador (o login e as preferências de cada pessoa). Deixe vazio: só serve a uma
// sala que já estava no ar com outro prefixo e passa a rodar este código, para ninguém precisar entrar de novo.
export const STORE = "";

// ---------- Projeto ----------
export const PROJECT = {
  name: "Primeiro Gole",            // título nas abas do navegador
  logo: "PRIMEIRO GOLE",            // texto do logo (barra lateral e login)
  studio: "Estúdio Exemplo",        // como o time assina os comentários
  client: "Agência Exemplo",        // nome do cliente em toda a interface
  clientArticle: "a",               // "a" → "a Agência / da Agência / à Agência"; "o" → "o Cliente / do / ao"; "" → sem artigo
  footer: "Estúdio Exemplo × Agência Exemplo · 2026", // rodapé do login (vazio para esconder)
  accent: "#C8F169",                // cor de destaque: botões, aprovados, seleção. Use uma cor clara.
  timeZone: "America/Sao_Paulo",    // fuso das datas e prazos
};

// Uma folha de estilo do job, carregada depois de sala/style.css (opcional): as cores e as fontes da marca, por cima
// das variáveis do topo do style.css. Fica em sala/job/ (fora do git, como este config). Ex.: "job/estilo.css".
export const STYLE = "";

// Quem é o time. A chave (à esquerda) é o que fica salvo no banco; o nome aparece na tela.
export const PEOPLE = { ana: "Ana", bruno: "Bruno", carla: "Carla" };

// Tipos de item. Mesma ideia: a chave fica no banco, o rótulo aparece.
export const KINDS = { casting: "Casting", locacao: "Locação", look: "Look", plano: "Plano", video: "Vídeo", outro: "Outro" };

// Os dois tipos que ganham coluna própria na apresentação e filtro na visão geral.
// O primeiro fica à esquerda nas cenas; todo o resto, à direita.
export const MAIN_KINDS = ["casting", "locacao"];

// ---------- Rodadas ----------
// A sala de produção cria no banco as rodadas que faltam e mantém código, título e datas iguais aos daqui.
// id: vai na URL (#/r/a1). code: aparece nas abas. due: prazo (AAAA-MM-DD).
// Opcionais: intro (texto na capa da rodada, para o cliente) e reply_by (prazo de resposta, data e hora).
// Tirar uma rodada daqui não apaga do banco (apagar levaria os itens junto).
export const ROUNDS = [
  { id: "a1", code: "A1", title: "Casting e locações", due: "2026-11-16", intro: "Primeira rodada: quem está no filme e onde ele acontece." },
  { id: "a2", code: "A2", title: "Looks e direção de arte", due: "2026-11-23" },
  { id: "a3", code: "A3", title: "Planos-chave", due: "2026-11-30" },
  { id: "entrega", code: "Entrega", title: "Filme final", due: "2026-12-07" },
];

// ---------- Cenas ----------
// A posição na lista é o número da cena (a 0 é "Geral", para o que vale para o filme todo).
// line: a fala ou a ideia da cena, mostrada em cima das opções.
// look (opcional, só o time vê o prompt): label em português, prompt em inglês para o gerador, palette com 3 cores.
export const SCENES = [
  { name: "Geral" },
  {
    name: "Cozinha",
    line: "Já passou o café?",
    look: {
      label: "Manhã cedo, luz de janela, creme e madeira",
      prompt: "early morning kitchen, soft window light, cream walls and warm wood, steam catching the light, 35mm",
      palette: ["#2B241D", "#C9B79C", "#7D8A6A"],
    },
  },
  {
    name: "Ônibus",
    line: "Dá tempo de mais um gole?",
    look: {
      label: "Manhã nublada, cinza-azulado, reflexos no vidro",
      prompt: "overcast morning inside a city bus, cool blue-grey light, reflections on the window, 50mm",
      palette: ["#2A3036", "#7F8C96", "#C2C8CC"],
    },
  },
  {
    name: "Escritório",
    line: "Alguém viu minha caneca?",
    look: {
      label: "Luz do dia misturada, neutro com o verde das plantas",
      prompt: "open office, mixed daylight and practical lamps, neutral tones with plant greens, 35mm handheld",
      palette: ["#2A2D2A", "#8E968F", "#556B54"],
    },
  },
  {
    name: "Praia",
    line: "Café gelado conta?",
    look: {
      label: "Sol do meio-dia, areia clara, mar turquesa",
      prompt: "midday beach, hard sun, pale sand and turquoise sea, crisp shadows, 28mm",
      palette: ["#E8DCC0", "#3FA3B5", "#1E4E5C"],
    },
  },
  { name: "Cartela", line: "Primeiro gole, primeiro passo." },
];

// ---------- Prompts (opcional, só o time vê) ----------
// Base de todos os prompts de cena: "Copiar prompt da cena" junta esta base com o look da cena.
export const STYLE_BASE = "cinematic film still, natural light, natural skin texture, subtle film grain, real location, soft contrast, 16:9";

// Modelos para as direções de um item (coluna items.variants: { "A": "uma mulher de 30 anos...", "B": ... }).
// {v} vira a direção; {light} vira a luz do look da cena. A chave é o tipo do item; "default" vale para os outros.
export const PROMPTS = {
  casting: "Character sheet layout, plain grey studio background. Left half: a large close-up portrait of {v}, natural skin texture, shoulders and face filling the frame. Right half: two full-body shots side by side, one from the front and one from the back, the same size, standing in a neutral relaxed pose. Same character and same look in all three images. Soft even studio lighting, cinematic realism, subtle film grain, no logos, no text.",
  default: "Wide establishing shot of {v}, empty, no people. {light}Wide framing, deep focus, off-center composition, layered foreground and background, realistic textures, subtle film grain, soft contrast, no text, 16:9.",
};

// ---------- Estúdio de IA (opcional, só o time vê) ----------
// O ✦ nos cards: editar uma imagem com IA, criar uma nova a partir do kit da cena (elenco, locação e produto aprovados),
// renderizar um ângulo da Cena 3D e gerar vídeo. Precisa da edge function supabase/functions/estudio publicada e das
// chaves dos geradores no servidor (veja o README). Desligado, a sala funciona igual, só sem o ✦.
export const ESTUDIO = {
  on: false,
  fn: "estudio", // o nome da edge function publicada (outro, se o projeto já tem uma "estudio" de outra sala)
  // souls: o nome publicado da função do Soul ID da Galeria (supabase/functions/souls). Sem esta linha, o mesmo de fn com
  // "souls" no lugar de "estudio" (estudio → souls, sala-estudio → sala-souls)
  // uma frase em inglês sobre o visual do filme: entra em todo prompt que o estúdio escreve
  look: "photoreal film still, soft natural morning light, true-to-life color, real textures and real skin",
  // palavras que o filme nunca quer num prompt, nem negadas (o Claude escreve sem elas), ex.: ["muted", "film grain"]
  avoid: [],
};

// ---------- Produto (opcional) ----------
// O item (pelo título, em qualquer cena) cuja imagem aprovada entra em toda cena como "o produto": no kit do Estúdio e
// como peça na Cena 3D. null quando o filme não tem um produto em cena.
export const PRODUCT = { title: "Produto" };

// ---------- Cena 3D (opcional, só o time vê) ----------
// Os arquivos do job para a Cena 3D, guardados em sala/job/ (fora do git, como este config), com o caminho a partir de
// sala/: sets, os sets de blocking do filme (o modelo é sala/cena3d/sets.js, o exemplo usado quando não há um), e
// device, o modelo 3D do produto (sem ele, um bloco neutro: sala/cena3d/device.js). Os dois importam de "../cena3d/".
export const CENA3D = { sets: "", device: "" };

// ---------- Motion (opcional, só o time vê) ----------
// Uma peça de motion do job (uma assinatura animada, uma cartela…): uma página HTML em sala/job/ que ajusta e renderiza
// um vídeo. Ela abre por cima da sala pelo botão de motion dos cards do tipo `kind` nas cenas `scene`, recebe as
// configurações na URL (?embed&chave=valor…) e devolve cada render com parent.postMessage({ type: "motion:render",
// settings, video, poster }): o MP4 entra no card. Opcionais: start (as configurações de um card ainda sem render),
// name(settings) e read(nome do arquivo) (para reabrir um render com as configurações dele), describe(settings) (a
// legenda) e model(settings). null quando o job não tem uma. Exemplo:
// { src: "job/motion/assinatura.html", label: "Assinatura", kind: "plano", scene: "Cartela", start: { fundo: "preto" } }
export const MOTION = null;

// ---------- Decks (opcional, só o time vê) ----------
// Aparecem na página Apresentação, junto com os slides do cliente que viraram referência. Só entram os que têm link.
export const DECKS = [
  { from: "Estúdio Exemplo", title: "Nosso deck", note: "A proposta: roteiro, estrutura e decupagem.", url: "" },
  { from: "Agência Exemplo", title: "Deck da agência", note: "Roteiro, storyboard, mood e referências por cena.", url: "" },
];

// ---------- Mensagem de envio ----------
// Aparece pronta para copiar quando o time envia uma rodada. {rodada}, {link} e {itens} são preenchidos.
export const SEND_MESSAGE = `Oi! A {rodada} está no ar:
{link}

São {itens}, organizados por cena. Em cada um, é só escolher uma opção e aprovar, ou pedir um ajuste num comentário. Fica tudo salvo na hora.`;
