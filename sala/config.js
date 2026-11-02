// Tudo o que muda de um job para outro mora aqui. O resto (app.js, style.css) é igual para todo projeto.
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

// Endereço da sala do cliente, usado na mensagem de envio. Vazio = o mesmo site, em /aprovacao/.
export const CLIENT_URL = "";

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
  // uma frase em inglês sobre o visual do filme: entra em todo prompt que o estúdio escreve
  look: "photoreal film still, soft natural morning light, true-to-life color, real textures and real skin",
};

// ---------- Produto (opcional) ----------
// O item (pelo título, em qualquer cena) cuja imagem aprovada entra em toda cena como "o produto": no kit do Estúdio e
// como peça na Cena 3D. null quando o filme não tem um produto em cena.
export const PRODUCT = { title: "Produto" };

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
