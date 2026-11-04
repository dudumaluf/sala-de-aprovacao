// Galeria: everything the room made or received, in one grid of thumbnails: every option (versions and variations, of
// every round and scene) and every image or video the client sent.
// - Filtros: one button, chips while on, cleared by a reload (DESIGN.md); a search over captions, titles and prompts;
//   newest first, oldest first or by scene. Vídeo tells takes and cuts, comparisons and the animatic apart (options.role,
//   set from the menu, or the room's guess from name and model).
// - Select with ⌘ or Shift clicks, or drag a box; while something is selected a plain click adds or takes out. The bar
//   at the bottom and the right click act on the selection: open in its card, edit with AI (the first image is the base,
//   the others come in as references), group, download, ✓ / ✕, train a Soul ID, delete for good what is already ✕.
//   Editing with AI and training a Soul ID need the AI studio (config.js ESTUDIO.on).
// - Groups (gallery_groups) and Souls (souls, trained by the edge function ESTUDIO.souls) sit in a row over the grid; a click
//   filters the grid to one of them.
// Team only. The grid is drawn by the room's render (page()), so loaded images survive re-renders; the menu, the viewer,
// the dialogs and the drag box live on document.body, outside the re-rendered root.

const CSS_V = 1; // bump when galeria.css changes, so an open tab does not keep the old styles
let C = null; // the room (app.js galCtx)
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const blank = () => ({ sort: "new", state: new Set(), origin: new Set(), kind: new Set(), round: new Set(), scene: new Set(), author: new Set(), media: new Set(), role: new Set() });
const G = {
  f: blank(), q: "", group: null, soul: null, filt: false,
  size: Math.min(360, Math.max(120, +store.get("sala-gal-size") || 200)), // the thumbnails' width: a per-viewer convenience
  sel: new Set(), anchor: null, order: [],
  groups: [], members: [], souls: [], sig: "", loaded: false, busy: false,
  menu: null, view: null, band: null, eat: false,
};

// wk (what the client sent) and motion (renders of the job's motion piece) take the room's words in init()
const ORIGIN = { estudio: "Estúdio", hf: "Higgsfield", upload: "Subido", wk: "Material do cliente", blocking: "Blocking 3D", motion: "Motion", blender: "Blender" };
const STATE = { pick: "★ Aprovadas", keep: "✓ Equipe", none: "Sem marca", drop: "✕ Descartadas" };
const SORT = { new: "Mais novas", old: "Mais antigas", scene: "Por cena" };
const MEDIA = { image: "Imagens", video: "Vídeos" };
// what a video is (options.role, or the room's guess in roleOf): with ✓ it leaves only the takes worth showing
const ROLE = { take: "Takes e cortes", compara: "Comparativos", animatic: "Animatic", outro: "Outros vídeos" };
const SOUL_STATE = { not_ready: "Preparando", queued: "Na fila", in_progress: "Treinando", completed: "Pronto", failed: "Falhou" };
const OPEN = new Set(["not_ready", "queued", "in_progress"]);
const GEN = /nano banana|seedream|gpt image|ideogram|soul|seedance|kling|flux|grok|qwen|veo|hailuo|edição da foto|liquify/i;
const SVG = (d, w = 1.5) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  search: SVG('<circle cx="7" cy="7" r="4.3"/><path d="M10.2 10.2 13.5 13.5"/>'),
  group: SVG('<path d="M2.5 4.5h4l1.5 1.5h5.5v6.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/>'),
  soul: SVG('<circle cx="8" cy="5.6" r="2.6"/><path d="M3 13.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4"/>'),
  more: SVG('<circle cx="3.5" cy="8" r=".9" fill="currentColor"/><circle cx="8" cy="8" r=".9" fill="currentColor"/><circle cx="12.5" cy="8" r=".9" fill="currentColor"/>'),
  play: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5.5 3.6v8.8L12.6 8z"/></svg>',
  select: SVG('<rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M5.3 8.2l1.9 1.8 3.6-3.8"/>'),
  copy: SVG('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>'),
  pen: SVG('<path d="M2.5 13.5l.8-3.2 7.9-7.9 2.4 2.4-7.9 7.9z"/>'),
};
const ico = (k) => I[k] || C.ICO[k] || C.Estudio.ICONS?.[k] || "";
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const two = (n) => String(n).padStart(2, "0");
const dayOf = (ts) => new Date(ts).toLocaleDateString("sv-SE", { timeZone: C.TZ });
const dayLabel = (d) => {
  const t = new Date(`${d}T12:00:00Z`);
  return `${t.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "")}, ${d.slice(8, 10)}/${d.slice(5, 7)}`;
};

// ---------- what the gallery holds ----------
// where an image came from: the model the room recorded with it (the studio adds "· estúdio")
function originOf(o) {
  const m = (o.model || "").trim();
  if (m === "Blocking 3D") return "blocking";
  if (C.isMotion?.(o)) return "motion";
  if (/estúdio/i.test(m)) return "estudio";
  if (/^blender/i.test(m)) return "blender";
  return GEN.test(m) ? "hf" : "upload";
}
// what a video is, when the team has not said it (options.role): a comparison (previz × take, strips) by its name; the
// animatic by its name or origin (blocking, motion); a take by its model (what the studio or a generator made) or a cut
function roleOf(o) {
  if (ROLE[o.role]) return o.role;
  const n = fold(o.name), m = (o.model || "").trim();
  if (/_x_|compar|analise|lado a lado|side.?by.?side|^tira/.test(n)) return "compara";
  if (m === "Blocking 3D" || C.isMotion?.(o) || /previz|previs|animatic|blocking|^guia/.test(n)) return "animatic";
  if (GEN.test(m) || /estúdio/i.test(m) || /^corte|montagem|^take/.test(n)) return "take";
  return "outro";
}
// one entry per thing, memoized on the room's arrays (a load replaces them): k is "o:<option>" or "f:<file>", the same
// key gallery_group_items.ref keeps
let memo = { k: null, list: [], map: new Map() };
function entries() {
  const { S } = C, k = [S.options, S.files, S.items, S.reviews, S.rounds, S.feedback, S.requests, S.envio];
  if (memo.k && k.every((x, i) => x === memo.k[i])) return memo.list;
  const ok = new Set(S.items.flatMap((it) => C.approvedOpts(it).map((o) => o.id)));
  const byId = new Map(S.options.map((o) => [o.id, o])), kids = new Map(), byFile = new Map();
  for (const o of S.options) if (o.stack) (kids.get(o.stack) || kids.set(o.stack, []).get(o.stack)).push(o);
  for (const it of S.items) for (const id of it.refs || []) if (!byFile.has(id)) byFile.set(id, it);
  const stackInfo = (o) => {
    const root = (o.stack && byId.get(o.stack)) || o, vs = kids.get(root.id);
    if (!vs?.length) return null;
    const all = [root, ...vs.sort((a, b) => a.created_at.localeCompare(b.created_at))];
    return { i: all.indexOf(o) + 1, n: all.length, face: (root.face || root.id) === o.id };
  };
  const opt = (o) => {
    const it = C.itemOf(o.item_id), video = o.mime.startsWith("video/"), rv = C.reviewOf(o.id)?.verdict || "";
    const pick = !!it && (C.isPick(it, o) || ok.has(o.id));
    return {
      k: `o:${o.id}`, o, it, round: it?.round_id || "", scene: it ? String(it.scene) : "", kind: it?.kind || "", author: o.created_by || "",
      origin: originOf(o), role: video ? roleOf(o) : "", at: o.created_at, video, angle: o.model === "Blocking 3D",
      thumb: video ? o.preview_path : o.thumb_path || o.preview_path || o.path, big: video ? o.path : o.preview_path || o.path, poster: video ? o.preview_path : null,
      // the photo a Soul ID trains on: the 1920 px JPEG when there is one
      photo: video ? null : o.preview_path || o.path,
      flags: { pick, keep: rv === "keep", drop: rv === "drop", none: !pick && !rv }, stack: stackInfo(o),
      text: fold([o.caption, o.name, it?.title, it ? C.sceneName(it.scene) : "", o.model, o.created_by, o.prompt, o.reasoning].join(" ")),
    };
  };
  // the client's images and videos; its voices and documents stay in Materiais. A file an item cites (items.refs) takes that
  // item's round, scene and kind
  const file = (f) => {
    const video = f.mime.startsWith("video/"), web = /^image\/(jpeg|png|webp|gif|avif)$/.test(f.mime);
    if (!video && !f.mime.startsWith("image/")) return null;
    const it = byFile.get(f.id) || null, r = S.requests.find((x) => x.id === f.request_id), still = f.thumb_path || f.preview_path;
    return {
      k: `f:${f.id}`, f, it, round: it?.round_id || "", scene: it ? String(it.scene) : "", kind: it?.kind || "", author: C.CL,
      origin: "wk", role: video ? "outro" : "", at: f.created_at, video, angle: false,
      thumb: still || (web ? f.path : null), big: video ? f.path : f.preview_path || (web ? f.path : null), poster: video ? still : null,
      photo: video ? null : f.preview_path || (web ? f.path : null),
      flags: { pick: false, keep: false, drop: false, none: true }, stack: null,
      text: fold([f.name, r?.title, f.uploaded_by, it?.title, C.CL].join(" ")),
    };
  };
  const list = [...S.options.map(opt), ...S.files.map(file).filter(Boolean)];
  memo = { k, list, map: new Map(list.map((e) => [e.k, e])) };
  return list;
}
const entryOf = (k) => (entries(), memo.map.get(k));

// ---------- filters ----------
const FACETS = ["state", "origin", "kind", "round", "scene", "author", "media", "role"];
const valOf = { origin: (e) => e.origin, kind: (e) => e.kind, round: (e) => e.round, scene: (e) => e.scene, author: (e) => e.author, media: (e) => (e.video ? "video" : "image"), role: (e) => e.role };
// every group of chips combines with the others; inside a group the chips add up (OR). skip: the group a count is for
function pass(e, skip = null) {
  for (const g of FACETS) {
    const set = G.f[g];
    if (g === skip || !set.size) continue;
    if (g === "state" ? ![...set].some((s) => e.flags[s]) : !set.has(valOf[g](e))) return false;
  }
  return true;
}
const groupRefs = (id) => new Set(G.members.filter((m) => m.group_id === id).map((m) => m.ref));
const soulRefs = (id) => new Set((G.souls.find((s) => s.id === id)?.photos || []).map((p) => (p.option_id ? `o:${p.option_id}` : `f:${p.file_id}`)));
function narrowed() {
  const words = fold(G.q).split(/\s+/).filter(Boolean);
  const inG = G.group ? groupRefs(G.group) : null, inS = G.soul ? soulRefs(G.soul) : null;
  return entries().filter((e) => (!inG || inG.has(e.k)) && (!inS || inS.has(e.k)) && words.every((w) => e.text.includes(w)));
}
function shown() {
  const list = narrowed().filter((e) => pass(e));
  const rs = new Map(C.S.rounds.map((r, i) => [r.id, i]));
  if (G.f.sort === "scene") {
    const sc = (e) => (e.scene === "" ? 99 : +e.scene);
    return list.sort((a, b) => sc(a) - sc(b) || (rs.get(a.round) ?? 9) - (rs.get(b.round) ?? 9) || (a.it?.sort ?? 0) - (b.it?.sort ?? 0) || (a.it?.id || "").localeCompare(b.it?.id || "") || a.at.localeCompare(b.at));
  }
  return list.sort((a, b) => (G.f.sort === "old" ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at)));
}
const chipLabel = { state: (v) => STATE[v], origin: (v) => ORIGIN[v], kind: (v) => C.KINDS[v] || v, round: (v) => C.roundOf(v)?.code || v,
  scene: (v) => `${two(+v)} ${C.sceneName(+v)}`, author: (v) => v, media: (v) => MEDIA[v], role: (v) => ROLE[v] };
function filtersOn() {
  const on = [];
  if (G.f.sort !== "new") on.push(["sort", "", SORT[G.f.sort]]);
  for (const g of FACETS) for (const v of G.f[g]) on.push([g, v, chipLabel[g](v)]);
  return on;
}
// the chips of one group, each with how many it would show next to the other groups that are on
function facet(g, label, values) {
  const pool = narrowed().filter((e) => pass(e, g));
  const n = (v) => pool.filter((e) => (g === "state" ? e.flags[v] : valOf[g](e) === v)).length;
  const opts = values.map((v) => [v, n(v)]).filter(([v, c]) => c || G.f[g].has(v));
  if (!opts.length) return "";
  return `<section class="filt-group"><p class="filt-label">${label}</p><div class="filt-opts">${opts.map(([v, c]) =>
    `<button class="fopt ${G.f[g].has(v) ? "on" : ""}" data-g="f" data-k="${g}" data-v="${C.esc(v)}" aria-pressed="${G.f[g].has(v)}">${C.esc(chipLabel[g](v))}<small>${c}</small></button>`).join("")}</div></section>`;
}
function filterPop() {
  const all = entries(), uniq = (f) => [...new Set(all.map(f).filter(Boolean))];
  const rounds = C.S.rounds.map((r) => r.id).filter((id) => all.some((e) => e.round === id));
  const scenes = uniq((e) => e.scene).sort((a, b) => a - b);
  const kinds = Object.keys(C.KINDS).filter((k) => all.some((e) => e.kind === k));
  const authors = uniq((e) => e.author).sort((a, b) => (a === C.CL) - (b === C.CL) || a.localeCompare(b));
  return `<div class="filt-pop gal-pop" role="dialog" aria-label="Filtros">
    <section class="filt-group"><p class="filt-label">Ordem</p><div class="filt-opts">${Object.entries(SORT).map(([k, l]) =>
      `<button class="fopt ${G.f.sort === k ? "on" : ""}" data-g="sort" data-v="${k}" aria-pressed="${G.f.sort === k}">${l}</button>`).join("")}</div></section>
    ${facet("state", "Estado", Object.keys(STATE))}
    ${facet("origin", "Origem", Object.keys(ORIGIN))}
    ${facet("kind", "Tipo", kinds)}
    ${facet("round", "Rodada", rounds)}
    ${facet("scene", "Cena", scenes)}
    ${facet("author", "Autor", authors)}
    ${facet("media", "Mídia", Object.keys(MEDIA))}
    ${facet("role", "Vídeo", Object.keys(ROLE))}
  </div>`;
}

// ---------- page ----------
function tile(e) {
  const { esc } = C, p = e.thumb, url = p ? C.urls.get(p) : "";
  const img = p ? `<img data-path="${esc(p)}" alt="" loading="lazy" decoding="async" draggable="false"${url ? ` src="${esc(url)}"` : ""}>`
    : e.video ? `<video data-path="${esc(e.big)}" muted playsinline preload="metadata"${C.urls.has(e.big) ? ` src="${esc(C.urls.get(e.big))}"` : ""}></video>`
    : '<span class="gal-none">sem prévia</span>';
  const sig = e.flags.pick ? `<b class="gal-sig s-pick" title="O cliente escolheu ou aprovou">${C.STAR}</b>` : e.flags.drop ? `<b class="gal-sig s-drop" title="Descartada: o cliente não vê">${ico("drop")}</b>`
    : e.flags.keep ? `<b class="gal-sig s-keep" title="✓ da equipe">${ico("keep")}</b>` : "";
  const t = e.it ? `${two(e.it.scene)} ${e.it.title}` : e.f ? e.f.name : "";
  const cap = [t, e.f ? C.CL : e.author].filter(Boolean).join(" · ");
  // data-vid: a video shown by its still plays on hover (app.js lays the video over the still)
  return `<div class="gal-t${G.sel.has(e.k) ? " gal-sel" : ""}${e.flags.drop ? " gal-x" : ""}" data-gk="${e.k}"${e.video && p ? ` data-vid="${esc(e.big)}"` : ""} aria-label="${esc(cap)}">
    ${img}${e.video ? `<i class="gal-play">${I.play}</i>` : ""}${sig}
    ${e.stack ? `<span class="gal-ver" title="Versão ${e.stack.i} de ${e.stack.n} deste card${e.stack.face ? " · é a que aparece no card" : ""}">${e.stack.i}/${e.stack.n}</span>` : ""}
    <button class="gal-chk" data-g="chk" tabindex="-1" aria-label="Selecionar">${ico("keep")}</button>
    <span class="gal-cap"><span>${esc(cap)}</span><small>${C.fmtTime(e.at)}</small></span>
  </div>`;
}
function sections(list) {
  const out = [];
  for (const e of list) {
    const key = G.f.sort === "scene" ? e.scene || "-" : dayOf(e.at);
    if (out.at(-1)?.key !== key) out.push({ key, list: [] });
    out.at(-1).list.push(e);
  }
  return out;
}
const secLabel = (key) => (G.f.sort !== "scene" ? dayLabel(key) : key === "-" ? `Sem cena · material ${C.DA_CL}` : `<span class="num">${two(+key)}</span>${C.esc(C.sceneName(+key))}`);
// the row over the grid: the groups and the Souls, each one a filter
function sets() {
  const { esc } = C;
  if (!G.groups.length && !G.souls.length) return "";
  const count = (id) => G.members.filter((m) => m.group_id === id).length;
  const groups = G.groups.map((g) => `<button class="gal-set ${G.group === g.id ? "on" : ""}" data-g="group" data-v="${g.id}" aria-pressed="${G.group === g.id}" title="${esc(g.name)} · ${G.group === g.id ? "mostrar tudo" : "mostrar só este grupo"}">${ico("group")}<span>${esc(g.name)}</span><small>${count(g.id)}</small></button>`).join("");
  const souls = G.souls.map((s) => {
    const p = s.photos?.[0]?.path, th = memo.map.get(s.photos?.[0]?.option_id ? `o:${s.photos[0].option_id}` : `f:${s.photos?.[0]?.file_id}`)?.thumb || p;
    return `<button class="gal-soul ${G.soul === s.id ? "on" : ""} ${s.status}" data-g="soul" data-v="${s.id}" aria-pressed="${G.soul === s.id}" title="Soul ID ${esc(s.name)} · ${SOUL_STATE[s.status] || s.status}${s.fail_reason ? `: ${esc(s.fail_reason)}` : ""} · ${(s.photos || []).length} fotos">
      <i>${th ? `<img data-path="${esc(th)}" alt=""${C.urls.has(th) ? ` src="${esc(C.urls.get(th))}"` : ""}>` : ico("soul")}</i><span>${esc(s.name)}</span><small>${SOUL_STATE[s.status] || s.status}</small></button>`;
  }).join("");
  return `<div class="gal-sets">${groups ? `<div class="gal-sets-g" aria-label="Grupos">${groups}</div>` : ""}${souls ? `<div class="gal-sets-s" aria-label="Soul ID">${souls}</div>` : ""}</div>`;
}
// what is on: the chips (each one off with its ✕), the group or Soul shown, and the search
function chipsLine(n, total) {
  const { esc } = C, on = filtersOn();
  const g = G.group && G.groups.find((x) => x.id === G.group), s = G.soul && G.souls.find((x) => x.id === G.soul);
  const extra = [g ? `<button class="fchip" data-g="off" data-k="group" title="Mostrar tudo">Grupo: ${esc(g.name)}${ico("drop")}</button>
      <button class="link gal-mini" data-g="group-rename" data-v="${g.id}">Renomear</button><button class="link gal-mini danger" data-g="group-delete" data-v="${g.id}">Apagar o grupo</button>` : "",
    s ? `<button class="fchip" data-g="off" data-k="soul" title="Mostrar tudo">Soul: ${esc(s.name)}${ico("drop")}</button>${s.ref_id ? `<button class="link gal-mini" data-g="soul-copy" data-v="${s.id}" title="O id deste Soul na Higgsfield (custom_reference_id do Soul 2)">Copiar o ID</button>` : ""}` : "",
    G.q ? `<button class="fchip" data-g="off" data-k="q" title="Limpar a busca">“${esc(G.q)}”${ico("drop")}</button>` : ""].filter(Boolean);
  if (!on.length && !extra.length) return "";
  return `<div class="fchips gal-chips">${extra.join("")}${on.map(([k, v, l]) => `<button class="fchip" data-g="off" data-k="${k}" data-v="${esc(v)}" title="Tirar este filtro">${esc(l)}${ico("drop")}</button>`).join("")}
    <button class="link fchips-clear" data-g="off" data-k="all">Limpar</button><span class="fchips-note">${n} de ${total}</span></div>`;
}
function barHtml() {
  const n = G.sel.size;
  const b = (v, k, t) => `<button data-g="act" data-v="${v}" title="${t}" aria-label="${t}">${ico(k)}</button>`;
  return `<div class="gal-bar ${n ? "on" : ""}" role="toolbar" aria-label="Seleção">
    <button class="gal-bar-x" data-g="clear" title="Limpar a seleção (Esc)" aria-label="Limpar a seleção">${ico("drop")}</button>
    <span class="gal-n"><b>${n}</b> ${n === 1 ? "selecionada" : "selecionadas"}</span><i class="gal-bar-sep"></i>
    ${C.ai ? b("edit", "spark", "Editar com IA: a primeira é a base, as outras entram como referência") : ""}${b("group", "group", "Agrupar")}${b("download", "down", "Baixar")}
    ${b("keep", "keep", "✓ Manter")}${b("drop", "drop", "✕ Descartar")}${C.ai ? b("soul", "soul", "Criar Soul ID com estas fotos (5 a 20)") : ""}
    <button data-g="menu" title="Mais ações" aria-label="Mais ações">${ico("more")}</button>
  </div>`;
}
export function page() {
  const { esc } = C;
  const all = entries(), list = shown();
  G.order = list.map((e) => e.k);
  const keep = new Set(G.order);
  for (const k of [...G.sel]) if (!keep.has(k)) G.sel.delete(k); // the selection is what can be seen
  const total = all.length, on = filtersOn().length + (G.q ? 1 : 0) + (G.group ? 1 : 0) + (G.soul ? 1 : 0);
  const sub = on ? `${list.length} de ${total}` : `${total} imagens e vídeos · tudo o que a sala gerou e recebeu`;
  const nf = filtersOn().length;
  const right = `<form class="gal-qf" data-form="gal-q" role="search">${I.search}<input class="gal-q" name="q" type="search" value="${esc(G.q)}" placeholder="Buscar" autocomplete="off" aria-label="Buscar na galeria: legenda, card, prompt"></form>
    <input class="gal-size" type="range" min="120" max="360" step="20" value="${G.size}" data-g="size" title="Tamanho das miniaturas" aria-label="Tamanho das miniaturas">
    <span class="fbar-bare fbar-head"><button class="btn hico ${nf ? "on" : ""}" data-g="filt" aria-haspopup="dialog" aria-expanded="${G.filt}" title="Filtros: ordem, estado, origem, tipo, rodada, cena, autor" aria-label="Filtros">${ico("funnel")}${nf ? `<b class="badge">${nf}</b>` : ""}</button>${G.filt ? filterPop() : ""}</span>
    <button class="btn hico" data-g="all" title="Selecionar tudo o que aparece (⌘A)" aria-label="Selecionar tudo">${I.select}</button>`;
  const body = list.length ? sections(list).map((s) => `<section class="gal-sec"><h2 class="gal-sh">${secLabel(s.key)}<small>${s.list.length}</small></h2><div class="gal-grid">${s.list.map(tile).join("")}</div></section>`).join("")
    : `<p class="gal-empty">${total ? "Nada com esses filtros." : "Nada na sala ainda."}${on ? ' <button class="link" data-g="off" data-k="all">Limpar os filtros</button>' : ""}</p>`;
  return C.head("Galeria", sub, right) + `<div class="main-body gal-body ${G.sel.size ? "gal-on" : ""}" data-keep="main" style="--gw:${G.size}px">${sets()}${chipsLine(list.length, total)}${body}</div>${barHtml()}`;
}
const render = () => C.render(true);
// a selection change only touches the tiles and the bar: the grid can hold a thousand images
function syncSel() {
  const root = document.querySelector(".gal-body");
  if (!root) return;
  root.classList.toggle("gal-on", G.sel.size > 0);
  root.querySelectorAll("[data-gk]").forEach((t) => t.classList.toggle("gal-sel", G.sel.has(t.dataset.gk)));
  const bar = document.querySelector(".gal-bar");
  if (bar) bar.outerHTML = barHtml();
}

// ---------- groups and Souls (team-only tables) ----------
async function loadExtra(force = false) {
  const { sb } = C;
  const [g, m, s] = await Promise.all([sb.from("gallery_groups").select("*").order("created_at"), sb.from("gallery_group_items").select("group_id, option_id, file_id, ref"), sb.from("souls").select("*").order("created_at")]);
  const bad = [g, m, s].find((r) => r.error);
  if (bad) throw bad.error;
  const sig = JSON.stringify([g.data, m.data, s.data]);
  G.loaded = true;
  if (!force && sig === G.sig) return false;
  Object.assign(G, { groups: g.data, members: m.data, souls: s.data, sig });
  if (G.group && !G.groups.some((x) => x.id === G.group)) G.group = null;
  if (G.soul && !G.souls.some((x) => x.id === G.soul)) G.soul = null;
  return true;
}
const onPage = () => C.S.page.kind === "galeria";
let tick = null, soulTick = 0;
function poll() {
  if (!onPage() || document.visibilityState !== "visible") return;
  loadExtra().then((changed) => { if (changed && !G.busy) render(); }).catch((e) => console.warn(e));
  // a Soul in training: ask Higgsfield how it is going, about every 20 s
  if (++soulTick % 2 === 0) G.souls.filter((s) => OPEN.has(s.status)).forEach((s) => soulCall("status", { soul_id: s.id }).then((r) => {
    if (r.soul && r.soul.status !== s.status) { Object.assign(s, r.soul); if (r.soul.status === "completed") C.toast(`O Soul ${r.soul.name} está pronto`); if (r.soul.status === "failed") C.toast(`O Soul ${r.soul.name} não treinou${r.soul.fail_reason ? `: ${r.soul.fail_reason}` : ""}`, true); render(); }
  }).catch(() => {}));
}

// ---------- selection ----------
const selList = () => G.order.filter((k) => G.sel.has(k)).map(entryOf).filter(Boolean);
function toggle(k) { if (G.sel.has(k)) G.sel.delete(k); else G.sel.add(k); G.anchor = k; }
function range(k) {
  const a = G.order.indexOf(G.anchor), b = G.order.indexOf(k);
  if (a < 0 || b < 0) return toggle(k);
  for (const x of G.order.slice(Math.min(a, b), Math.max(a, b) + 1)) G.sel.add(x);
}
function clearSel() { G.sel.clear(); G.anchor = null; syncSel(); }

// ---------- actions ----------
const imgs = (list) => list.filter((e) => !e.video && e.photo);
const optsIn = (list) => list.filter((e) => e.o);
async function soulCall(action, body) {
  const { data } = await C.sb.auth.getSession();
  const r = await fetch(C.soulsUrl, { method: "POST", headers: { "Content-Type": "application/json", apikey: C.anonKey, Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ action, ...body, schema: C.schema, bucket: C.bucket }) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || `O servidor respondeu ${r.status}`);
  return out;
}
function openCard(e) {
  closeLayers();
  if (e.f) {
    // a file the client sent opens in Materiais, in its own viewer
    const { S } = C, ids = S.files.filter((x) => x.request_id === e.f.request_id).map((x) => x.id);
    S.lightbox = { req: e.f.request_id, ids, i: Math.max(0, ids.indexOf(e.f.id)) };
    const h = `#/materiais/${e.f.request_id}`;
    if (location.hash === h) C.render(true); else location.hash = h;
    return;
  }
  const it = e.it;
  if (!it) return C.toast("Esta imagem não está em nenhum card.", true);
  // a 3D angle opens in its location's Cena 3D; a version that is not on the card, in the card's Versões
  const at = C.sceneHref(it.round_id, it.scene, it.id);
  location.hash = e.angle ? `${at}/cena3d/${e.o.id}` : e.stack && !e.stack.face ? `${at}/versoes` : at;
}
// the studio: one image of the room is the base (the result comes back to its card); the rest come in as references.
// With only the client's photos it opens Criar, in the scene of the card that cites them
async function editAI(list) {
  const pics = imgs(list);
  if (!pics.length) return C.toast("O estúdio edita imagens: escolha ao menos uma.", true);
  closeLayers();
  const base = pics.find((e) => e.o && !e.angle) || pics.find((e) => e.o) || null;
  const rest = pics.filter((e) => e !== base);
  if (base && !rest.length) return C.Estudio.openStudio(C.studioCtx(), { optionId: base.o.id });
  if (!C.Estudio.openWith) {
    if (base) { C.Estudio.openStudio(C.studioCtx(), { optionId: base.o.id }); return C.toast("Abriu só a primeira: recarregue a sala para levar as outras como referência.", true); }
    return C.toast("Recarregue a sala para abrir o estúdio com estas fotos.", true);
  }
  const max = 13, refs = rest.slice(0, max).map((e) => ({ path: e.photo, preview_path: e.o?.preview_path || e.f?.preview_path || null, thumb_path: e.thumb, option_id: e.o?.id || null, label: e.o ? null : (e.f.name || "Foto").replace(/\.[^.]+$/, "").slice(0, 40) }));
  if (rest.length > max) C.toast(`O estúdio leva até ${max + 1} imagens: entraram as ${max + 1} primeiras.`);
  const it = base?.it || pics.find((e) => e.it)?.it || null;
  C.Estudio.openWith(C.studioCtx(), { baseId: base?.o.id || null, refs, roundId: it?.round_id || C.S.page.round || C.S.rounds.at(-1)?.id, scene: it ? it.scene : 0, itemId: it?.id || null });
}
async function download(list) {
  closeLayers();
  if (!list.length) return;
  const name = (e) => (e.o ? C.dlName(e.o) : e.f.name);
  if (list.length === 1) return C.openFile(list[0].o?.path || list[0].f.path, name(list[0]), true);
  if (list.length > 60 && !confirm(`Baixar ${list.length} arquivos num .zip? Os originais são grandes e pode demorar alguns minutos.`)) return;
  const scenes = new Set(list.map((e) => e.scene));
  const folder = (e) => (scenes.size < 2 ? "" : e.scene === "" ? `Material ${C.DA_CL}` : `${two(+e.scene)} ${C.sceneName(+e.scene)}`);
  await C.zipDownload(list.map((e) => [{ name: name(e), path: e.o?.path || e.f.path }, folder(e)]), `Galeria · ${list.length} ${list.length === 1 ? "arquivo" : "arquivos"}`);
}
// what the selected videos are, for the Vídeo filter: one write. The same mark again takes it off, back to the room's guess
async function setRole(list, role) {
  closeLayers();
  const vids = optsIn(list).filter((e) => e.video);
  if (!vids.length) return C.toast("Essa marca é só para os vídeos da sala.", true);
  const off = vids.every((e) => e.o.role === role), val = off ? null : role;
  const { error } = await C.sb.from("options").update({ role: val }).in("id", vids.map((e) => e.o.id));
  if (error) return C.toast(/role/.test(error.message) ? "O banco ainda não tem options.role: rode supabase/atualizar-2026-11c.sql." : `Não deu certo: ${error.message}`, true);
  for (const e of vids) e.o.role = val;
  memo.k = null;
  C.toast(off ? `${plural(vids.length, "vídeo volta", "vídeos voltam")} para a marca automática` : `${plural(vids.length, "vídeo", "vídeos")}: ${ROLE[role]}`);
  render();
}
// ✓ / ✕ for many at once: one write, Desfazer puts back what each one had. The client's picks never get a ✕ from here,
// and a ✕ on what the client sees right now asks first (it leaves the client's room)
async function review(list, verdict) {
  closeLayers();
  const { S, sb } = C;
  let opts = optsIn(list);
  const files = list.length - opts.length;
  if (!opts.length) return C.toast(`Só as imagens da sala levam ✓ ou ✕: o material ${C.DA_CL} fica como está.`, true);
  const off = opts.every((e) => C.reviewOf(e.o.id)?.verdict === verdict); // all already have it: take it off
  let skipped = 0;
  if (verdict === "drop" && !off) {
    const picks = opts.filter((e) => e.flags.pick);
    skipped = picks.length;
    opts = opts.filter((e) => !e.flags.pick);
    if (!opts.length) return C.toast("Escolhidas ou aprovadas pelo cliente não levam ✕ por aqui. Faça isso no card.", true);
    const seen = opts.filter((e) => !C.offWK(e.o)).length;
    if (seen && !confirm(`${seen === 1 ? "1 destas o cliente está vendo" : `${seen} destas o cliente está vendo`} agora. Com ✕, ${seen === 1 ? "ela sai" : "elas saem"} da sala do cliente. Descartar mesmo assim?`)) return;
  }
  const now = new Date().toISOString(), who = C.myName();
  const before = opts.map((e) => C.reviewOf(e.o.id) || { option_id: e.o.id, verdict: null, note: "", author: who, updated_at: now });
  const rows = opts.map((e) => { const cur = C.reviewOf(e.o.id) || {}; return { option_id: e.o.id, verdict: off ? null : verdict, note: cur.note ?? "", author: who, updated_at: now }; });
  const ids = new Set(rows.map((r) => r.option_id));
  S.reviews = [...S.reviews.filter((r) => !ids.has(r.option_id)), ...rows];
  render();
  const { error } = await sb.from("option_reviews").upsert(rows);
  if (error) { C.toast(`Não salvou: ${error.message}`, true); return C.refresh(); }
  const what = verdict === "drop" ? (off ? "voltaram (sem ✕)" : "descartadas: o cliente não vê") : off ? "sem ✓" : "com ✓";
  const notes = [skipped ? `${skipped} do cliente ficaram de fora` : "", files ? `${files} ${C.DA_CL} não mudam` : ""].filter(Boolean).join(" · ");
  C.toast(`${rows.length} ${rows.length === 1 ? what.replace("descartadas", "descartada").replace("voltaram", "voltou") : what}${notes ? ` · ${notes}` : ""}`, false, {
    label: "Desfazer",
    fn: async () => {
      S.reviews = [...S.reviews.filter((r) => !ids.has(r.option_id)), ...before];
      render();
      const { error: e2 } = await sb.from("option_reviews").upsert(before.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
      if (e2) { C.toast(`Não desfez: ${e2.message}`, true); C.refresh(); }
    },
  });
}

// ---------- groups ----------
const memberRow = (gid, e) => ({ group_id: gid, ...(e.o ? { option_id: e.o.id } : { file_id: e.f.id }), added_by: C.myName() });
async function addTo(gid, list, name) {
  const { sb } = C, have = groupRefs(gid), add = list.filter((e) => !have.has(e.k));
  if (!add.length) { closeLayers(); return C.toast(`Já estavam todas em ${name}`); }
  const { error } = await sb.from("gallery_group_items").upsert(add.map((e) => memberRow(gid, e)), { onConflict: "group_id,ref", ignoreDuplicates: true });
  if (error) return C.toast(`Não agrupou: ${error.message}`, true);
  closeLayers();
  await loadExtra(true).catch(() => {});
  render();
  C.toast(`${add.length} ${add.length === 1 ? "entrou" : "entraram"} em ${name}`, false, { label: "Desfazer", fn: () => removeFrom(gid, add, name, true) });
}
async function removeFrom(gid, list, name, quiet = false) {
  const { sb } = C, o = list.filter((e) => e.o).map((e) => e.o.id), f = list.filter((e) => e.f).map((e) => e.f.id);
  const del = (col, ids) => (ids.length ? sb.from("gallery_group_items").delete().eq("group_id", gid).in(col, ids) : { error: null });
  const [a, b] = await Promise.all([del("option_id", o), del("file_id", f)]);
  const error = a.error || b.error;
  if (error) return C.toast(`Não tirou: ${error.message}`, true);
  closeLayers();
  await loadExtra(true).catch(() => {});
  render();
  if (!quiet) C.toast(`${list.length} ${list.length === 1 ? "saiu" : "saíram"} de ${name}`, false, { label: "Desfazer", fn: () => addTo(gid, list, name) });
}
async function newGroup(name, list) {
  const { sb } = C;
  const { data, error } = await sb.from("gallery_groups").insert({ name, created_by: C.myName() }).select().single();
  if (error) return C.toast(`Não criou o grupo: ${error.message}`, true);
  G.groups.push(data);
  await addTo(data.id, list, data.name);
}
async function renameGroup(id) {
  const g = G.groups.find((x) => x.id === id);
  if (!g) return;
  const name = prompt("Novo nome do grupo", g.name)?.trim();
  if (!name || name === g.name) return;
  const { error } = await C.sb.from("gallery_groups").update({ name: name.slice(0, 80) }).eq("id", id);
  if (error) return C.toast(`Não renomeou: ${error.message}`, true);
  await loadExtra(true).catch(() => {});
  render();
}
// a group is only a list: deleting it never touches an image, and Desfazer brings it back with the same members
async function deleteGroup(id) {
  const g = G.groups.find((x) => x.id === id), members = G.members.filter((m) => m.group_id === id);
  const keep = members.length === 1 ? "A imagem continua na sala" : members.length ? `As ${members.length} imagens continuam na sala` : "Ele está vazio";
  if (!g || !confirm(`Apagar o grupo “${g.name}”? ${keep}, só o grupo some.`)) return;
  const { error } = await C.sb.from("gallery_groups").delete().eq("id", id);
  if (error) return C.toast(`Não apagou: ${error.message}`, true);
  if (G.group === id) G.group = null;
  await loadExtra(true).catch(() => {});
  render();
  C.toast(`O grupo “${g.name}” foi apagado`, false, { label: "Desfazer", fn: async () => {
    const r = await C.sb.from("gallery_groups").insert({ id: g.id, name: g.name, created_by: g.created_by, created_at: g.created_at });
    if (!r.error && members.length) await C.sb.from("gallery_group_items").insert(members.map((m) => ({ group_id: m.group_id, option_id: m.option_id, file_id: m.file_id, added_by: C.myName() })));
    await loadExtra(true).catch(() => {});
    render();
  } });
}

// ---------- delete for good ----------
// only what is already ✕, never what the client chose or answered on, and an original only together with its versions. The row
// leaves the room (its ✓/✕, drawings, envio and group places go with it); the file stays in storage
function deletable(list) {
  const { S } = C, opts = optsIn(list), ids = new Set(opts.map((e) => e.o.id));
  const fb = new Set(S.feedback.map((f) => f.base_option).filter(Boolean)), chosen = new Set(S.items.map((i) => i.chosen_option).filter(Boolean));
  const ok = [], no = [];
  for (const e of opts) {
    const o = e.o, kids = S.options.filter((x) => x.stack === o.id);
    const why = !e.flags.drop ? "sem ✕" : e.flags.pick || chosen.has(o.id) || fb.has(o.id) ? "do cliente" : kids.some((x) => !ids.has(x.id)) ? "tem versões fora da seleção" : "";
    (why ? no : ok).push([e, why]);
  }
  return { ok: ok.map(([e]) => e), no };
}
async function hardDelete(list) {
  const { sb } = C, ids = list.map((e) => e.o.id);
  // versions first, so no original is left pointing at a version that is gone
  const order = [...list].sort((a, b) => !!b.o.stack - !!a.o.stack);
  for (const e of order) {
    const { error } = await sb.from("options").delete().eq("id", e.o.id);
    if (error) { C.toast(`Parou em ${e.it?.title || "uma imagem"}: ${error.message}`, true); break; }
  }
  for (const k of [...G.sel]) if (ids.includes(k.slice(2))) G.sel.delete(k);
  closeLayers();
  await C.refresh();
  C.toast(`${plural(ids.length, "imagem apagada", "imagens apagadas")} de vez`);
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---------- the context menu (right click, or ⋯ in the bar) ----------
function menuItems(list) {
  const one = list.length === 1 ? list[0] : null, pics = imgs(list), opts = optsIn(list), vids = opts.filter((e) => e.video);
  const kept = opts.length && opts.every((e) => e.flags.keep), gone = opts.length && opts.every((e) => e.flags.drop);
  const del = deletable(list);
  const items = [
    one && ["open", one.f ? "Abrir em Materiais" : one.angle ? "Abrir na Cena 3D" : "Abrir no card", "open"],
    one && ["view", "Ver grande", "view", "Espaço"],
    C.ai && ["edit", pics.length > 14 ? "Editar com IA · as 14 primeiras" : pics.length > 1 ? `Editar com IA · ${pics.length - 1} como referência` : "Editar com IA", "spark", "", !pics.length && "Só imagens"],
    "-",
    ["group", "Agrupar…", "group"],
    G.group && ["ungroup", `Tirar de ${G.groups.find((g) => g.id === G.group)?.name || "este grupo"}`, "drop"],
    ["download", list.length > 1 ? `Baixar ${list.length} (.zip)` : "Baixar", "down"],
    "-",
    ["keep", kept ? "Tirar o ✓" : "Manter", "keep", "M", !opts.length && "Só imagens da sala"],
    ["drop", gone ? "Tirar o ✕ (voltar)" : "Descartar", "drop", "D", !opts.length && "Só imagens da sala"],
    C.ai && ["soul", "Criar Soul ID…", "soul", pics.length >= 5 && pics.length <= 20 ? `${pics.length} fotos` : "", (pics.length < 5 || pics.length > 20) && `Escolha de 5 a 20 fotos (${pics.length})`],
    vids.length && "-",
    ...(vids.length ? ["take", "compara", "animatic"].map((r) => [`role-${r}`, `É vídeo: ${ROLE[r]}`, "play", vids.every((e) => e.o.role === r) ? "✓" : ""]) : []),
    del.ok.length && "-",
    del.ok.length && ["delete", `Apagar de vez${del.ok.length < list.length ? ` · ${del.ok.length} de ${list.length}` : ""}…`, "trash", "", "", "danger"],
  ];
  return items.filter(Boolean);
}
// above: open upwards from y (the ⋯ of the bar at the bottom)
function showMenu(x, y, above = false) {
  closeMenu();
  const list = selList();
  if (!list.length) return;
  const head = list.length === 1 ? (list[0].it ? `${two(list[0].it.scene)} ${list[0].it.title}` : list[0].f?.name || "") : plural(list.length, "selecionada", "selecionadas");
  const m = document.createElement("div");
  m.className = "gal-menu";
  m.setAttribute("role", "menu");
  m.innerHTML = `<p class="gal-menu-h">${C.esc(head)}</p>${menuItems(list).map((it) => it === "-" ? '<i class="gal-menu-sep"></i>'
    : `<button role="menuitem" class="${it[5] || ""}" data-g="act" data-v="${it[0]}" ${it[4] ? `disabled title="${C.esc(it[4])}"` : ""}>${ico(it[2])}<span>${C.esc(it[1])}</span>${it[3] ? `<small>${C.esc(it[3])}</small>` : ""}</button>`).join("")}`;
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  m.style.top = `${Math.max(8, Math.min(above ? y - r.height - 8 : y, innerHeight - r.height - 8))}px`;
  G.menu = m;
  m.querySelector("button:not([disabled])")?.focus({ preventScroll: true });
}
const closeMenu = () => { G.menu?.remove(); G.menu = null; };
function closeLayers() { closeMenu(); closeDlg(); }

// ---------- dialogs (body level: the room re-renders under them) ----------
let dlg = null;
const closeDlg = () => { dlg?.remove(); dlg = null; };
function dialog(html, onSubmit, init) {
  closeLayers();
  dlg = document.createElement("div");
  dlg.className = "gal-dlg";
  dlg.innerHTML = `<form class="gal-dlg-box" role="dialog" aria-modal="true">${html}</form>`;
  document.body.append(dlg);
  const f = dlg.querySelector("form");
  f.addEventListener("submit", (ev) => { ev.preventDefault(); ev.stopPropagation(); onSubmit(f, ev.submitter || f.querySelector("button:not([type=button])")); });
  dlg.addEventListener("click", (ev) => { if (ev.target === dlg || ev.target.closest("[data-x]")) closeDlg(); });
  init?.(f);
  return f;
}
const thumbs = (list, max = 20) => `<div class="gal-dlg-th">${list.slice(0, max).map((e) => e.thumb ? `<img src="${C.esc(C.urls.get(e.thumb) || "")}" alt="">` : "<i></i>").join("")}${list.length > max ? `<span>+${list.length - max}</span>` : ""}</div>`;
function groupDialog(list) {
  const { esc } = C;
  const rows = G.groups.map((g) => { const have = groupRefs(g.id), n = list.filter((e) => have.has(e.k)).length; return `<button type="button" class="gal-dlg-row" data-gid="${g.id}">${ico("group")}<span>${esc(g.name)}</span><small>${n === list.length ? "já estão todas" : `${G.members.filter((m) => m.group_id === g.id).length} imagens`}</small></button>`; }).join("");
  dialog(`<h3>Agrupar ${plural(list.length, "imagem", "imagens")}</h3>${thumbs(list, 12)}
    <label class="gal-dlg-l">Grupo novo<input class="field" name="name" maxlength="80" placeholder="Ex.: Ana · fotos reais" autocomplete="off" required></label>
    ${rows ? `<p class="gal-dlg-l">Ou junte a um grupo que já existe</p><div class="gal-dlg-list">${rows}</div>` : ""}
    <div class="gal-dlg-row2"><button type="button" class="link" data-x>Cancelar</button><button class="btn primary">Criar grupo</button></div>`,
  (f) => { const name = f.elements.name.value.trim(); if (name) newGroup(name.slice(0, 80), list); },
  (f) => {
    f.querySelectorAll("[data-gid]").forEach((b) => b.addEventListener("click", () => { const g = G.groups.find((x) => x.id === b.dataset.gid); if (g) addTo(g.id, list, g.name); }));
    setTimeout(() => f.elements.name.focus(), 0);
  });
}
// Criar Soul ID: one person, 5–20 photos (the face from several angles and lights works best), trained on Higgsfield in
// about 10 minutes, with the account's credits. Always Soul 2 (v2): it is what the studio's Soul 2 model takes, and the
// API account that trains it is the one that generates. The name comes from a request the client answered ("Fotos da Ana"),
// else from the card the photos belong to; a name already trained (or training) asks before spending again
const sameSoul = (nm) => G.souls.find((s) => s.status !== "failed" && fold(s.name).trim() === fold(nm).trim());
function soulDialog(list) {
  const pics = imgs(list);
  if (pics.length < 5 || pics.length > 20) return C.toast(`O Soul ID treina com 5 a 20 fotos de uma pessoa: ${pics.length === 1 ? "tem 1 selecionada" : `tem ${pics.length} selecionadas`}.`, true);
  const titles = [...new Set(pics.map((e) => e.it?.title).filter(Boolean))];
  const reqs = [...new Set(pics.map((e) => e.f && C.S.requests.find((r) => r.id === e.f.request_id)?.title))];
  const fromReq = reqs.length === 1 && pics.every((e) => e.f) && /^fotos d[aoe]s? (.+)$/i.exec(reqs[0] || "")?.[1];
  const name = fromReq || (titles.length === 1 ? titles[0].replace(/^P\d+\s*·\s*/, "") : "");
  const dupLine = (nm) => { const s = sameSoul(nm); return s ? `Já existe o Soul “${C.esc(s.name)}” (${(SOUL_STATE[s.status] || s.status).toLowerCase()}). Treinar outro gasta créditos de novo.` : ""; };
  dialog(`<h3>Criar Soul ID</h3>${thumbs(pics)}
    <p class="gal-dlg-p">A Higgsfield aprende o rosto desta pessoa com as ${pics.length} fotos e cria um Soul ID para o modelo Soul 2 do estúdio. Leva uns 10 minutos e usa créditos da conta. Funciona melhor com uma pessoa só, o rosto bem visível, de ângulos e luzes diferentes.</p>
    <label class="gal-dlg-l">Nome<input class="field" name="name" maxlength="100" value="${C.esc(name)}" placeholder="Ex.: Ana" autocomplete="off" required></label>
    <p class="gal-dlg-warn gal-dlg-dup"${dupLine(name) ? "" : " hidden"}>${dupLine(name)}</p>
    <p class="gal-dlg-warn gal-dlg-err" hidden></p>
    <div class="gal-dlg-row2"><button type="button" class="link" data-x>Cancelar</button><button class="btn primary">${ico("soul")}Treinar</button></div>`,
  async (f, btn) => {
    const nm = f.elements.name.value.trim();
    if (!nm) return;
    const dup = sameSoul(nm);
    if (dup && !confirm(`Já existe o Soul “${dup.name}” (${(SOUL_STATE[dup.status] || dup.status).toLowerCase()}). Treinar outro com esse nome?`)) return;
    btn.disabled = true;
    btn.textContent = "Enviando…";
    try {
      const it = pics.find((e) => e.it?.kind === "casting")?.it || (titles.length === 1 ? pics[0].it : null);
      const { soul } = await soulCall("train", { name: nm, model_version: "v2", created_by: C.myName(), item_id: it?.id || null,
        photos: pics.map((e) => ({ path: e.photo, ...(e.o ? { option_id: e.o.id } : { file_id: e.f.id }) })) });
      closeDlg();
      G.souls.push(soul);
      render();
      C.toast(`Treinando o Soul ${soul.name}: aparece pronto aqui em uns 10 minutos`);
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = `${ico("soul")}Treinar`;
      const w = f.querySelector(".gal-dlg-err");
      w.hidden = false;
      w.textContent = `Não começou: ${e.message}`;
    }
  },
  (f) => {
    setTimeout(() => f.elements.name.focus(), 0);
    const dup = f.querySelector(".gal-dlg-dup");
    f.elements.name.addEventListener("input", () => { const t = dupLine(f.elements.name.value); dup.hidden = !t; dup.innerHTML = t; });
    soulCall("check", {}).then((r) => { if (r.key === null) { const w = f.querySelector(".gal-dlg-err"); w.hidden = false; w.textContent = "A chave da Higgsfield não está no servidor: o treino não vai começar."; } }).catch(() => {});
  });
}
function deleteDialog(list) {
  const { ok, no } = deletable(list);
  if (!ok.length) return C.toast("Apagar de vez só vale para o que já está com ✕ e não é do cliente.", true);
  const why = no.length ? `<p class="gal-dlg-p dim">${plural(no.length, "fica", "ficam")}: ${[...new Set(no.map(([, w]) => w))].join(", ")}.</p>` : "";
  dialog(`<h3>Apagar de vez ${plural(ok.length, "imagem", "imagens")}?</h3>${thumbs(ok)}
    <p class="gal-dlg-p">${ok.length === 1 ? "Ela sai" : "Elas saem"} da sala para todo mundo, com ✓/✕, desenhos e grupos, e não ${ok.length === 1 ? "volta" : "voltam"} pelo app. ${ok.length === 1 ? "O arquivo continua guardado" : "Os arquivos continuam guardados"} no storage. Para só esconder, o ✕ já basta.</p>${why}
    <label class="gal-dlg-l">Escreva APAGAR para confirmar<input class="field" name="ok" autocomplete="off" spellcheck="false"></label>
    <div class="gal-dlg-row2"><button type="button" class="link" data-x>Cancelar</button><button class="btn danger-fill" disabled>${ico("trash")}Apagar de vez</button></div>`,
  async (f, btn) => {
    if (f.elements.ok.value.trim().toUpperCase() !== "APAGAR") return;
    btn.disabled = true;
    await hardDelete(ok);
  },
  (f) => {
    const b = f.querySelector(".danger-fill");
    f.elements.ok.addEventListener("input", () => (b.disabled = f.elements.ok.value.trim().toUpperCase() !== "APAGAR"));
    setTimeout(() => f.elements.ok.focus(), 0);
  });
}
function act(v) {
  const list = selList();
  if (!list.length && v !== "view") return;
  if (v.startsWith("role-")) return setRole(list, v.slice(5));
  const run = {
    open: () => openCard(list[0]),
    view: () => openView(list[0]?.k),
    edit: () => editAI(list),
    group: () => groupDialog(list),
    ungroup: () => { const g = G.groups.find((x) => x.id === G.group); if (g) removeFrom(g.id, list, g.name); },
    download: () => download(list),
    keep: () => review(list, "keep"),
    drop: () => review(list, "drop"),
    soul: () => soulDialog(list),
    delete: () => deleteDialog(list),
  }[v];
  run?.();
}

// ---------- the viewer: big, walking through what the grid shows ----------
function openView(k) {
  if (!k) return;
  closeLayers();
  G.view = { k };
  drawView();
}
async function drawView() {
  const { esc } = C, e = entryOf(G.view?.k);
  if (!e) return closeView();
  let v = document.querySelector(".gal-lb");
  if (!v) {
    v = document.createElement("div");
    v.className = "lb gal-lb";
    v.setAttribute("role", "dialog");
    v.setAttribute("aria-modal", "true");
    document.body.append(v);
    document.body.classList.add("gal-viewing");
  }
  const i = G.order.indexOf(e.k), n = G.order.length;
  const where = e.it ? `<b>${two(e.it.scene)} ${esc(e.it.title)}</b>` : `<b>${esc(e.f?.name || "")}</b>`;
  const info = [e.f ? `${esc(C.CL)} · ${esc(e.f.uploaded_by || "")}` : esc(e.author), C.fmtTime(e.at), e.o?.model ? esc(e.o.model) : "", e.stack ? `versão ${e.stack.i}/${e.stack.n}` : "", e.o?.caption ? esc(e.o.caption) : ""].filter(Boolean).join(" · ");
  const sel = G.sel.has(e.k), opt = !!e.o;
  const media = e.video ? `<video data-p="${esc(e.big)}" controls autoplay playsinline${e.poster ? ` data-poster="${esc(e.poster)}"` : ""}></video>` : e.big ? `<img data-p="${esc(e.big)}" alt="">` : '<p class="gal-none">sem prévia</p>';
  v.innerHTML = `<div class="lb-top"><span>${where} · ${info}</span><span class="gal-lb-pos">${i >= 0 ? `${i + 1} de ${n}` : ""}<button class="link" data-gv="close">Fechar ✕</button></span></div>
    <div class="lb-stage">${media}${n > 1 ? `<button class="lb-nav prev" data-gv="step" data-v="-1" aria-label="Anterior">‹</button><button class="lb-nav next" data-gv="step" data-v="1" aria-label="Próxima">›</button>` : ""}</div>
    <div class="lb-bottom gal-lb-bar">
      <button class="btn ${sel ? "on" : ""}" data-gv="sel" title="Espaço">${I.select}${sel ? "Selecionada" : "Selecionar"}</button>
      <button class="btn" data-gv="open">${ico("open")}${e.f ? "Abrir em Materiais" : e.angle ? "Abrir na Cena 3D" : "Abrir no card"}</button>
      ${!e.video ? `<button class="btn" data-gv="edit">${ico("spark")}Editar com IA</button>` : ""}
      ${opt ? `<button class="btn ${e.flags.keep ? "on" : ""}" data-gv="keep" title="M">${ico("keep")}${e.flags.keep ? "Com ✓" : "Manter"}</button><button class="btn ${e.flags.drop ? "on gal-x" : ""}" data-gv="drop" title="D">${ico("drop")}${e.flags.drop ? "Descartada" : "Descartar"}</button>` : ""}
      <button class="btn" data-gv="down">${ico("down")}Baixar</button>
    </div>`;
  const paths = [e.big, e.poster].filter(Boolean);
  await C.sign(paths).catch(() => {});
  if (G.view?.k !== e.k) return;
  v.querySelectorAll("[data-p]").forEach((m) => { const u = C.urls.get(m.dataset.p); if (u) m.src = u; });
  v.querySelectorAll("[data-poster]").forEach((m) => { const u = C.urls.get(m.dataset.poster); if (u) m.poster = u; });
}
function closeView() {
  G.view = null;
  document.querySelector(".gal-lb")?.remove();
  document.body.classList.remove("gal-viewing");
}
function stepView(d) {
  const i = G.order.indexOf(G.view?.k);
  if (i < 0 || !G.order.length) return;
  G.view.k = G.order[(i + d + G.order.length) % G.order.length];
  drawView();
}
async function viewAct(v) {
  const e = entryOf(G.view?.k);
  if (!e) return;
  if (v === "close") return closeView();
  if (v === "step") return;
  if (v === "sel") { toggle(e.k); syncSel(); return drawView(); }
  if (v === "open") { closeView(); return openCard(e); }
  if (v === "edit") { closeView(); return editAI([e]); }
  if (v === "down") return download([e]);
  if (v === "keep" || v === "drop") { await review([e], v); memo.k = null; return drawView(); }
}

// ---------- the drag box ----------
const scroller = () => document.querySelector(".gal-body");
function bandStart(ev) {
  const sc = scroller();
  if (!sc) return;
  const add = ev.metaKey || ev.ctrlKey || ev.shiftKey;
  G.band = { x: ev.clientX, y: ev.clientY + sc.scrollTop, base: add ? new Set(G.sel) : new Set(), el: null, id: ev.pointerId, on: false, raf: 0, last: ev };
}
function bandMove(ev) {
  const b = G.band, sc = scroller();
  if (!b || !sc) return;
  b.last = ev;
  if (!b.on) {
    if (Math.hypot(ev.clientX - b.x, ev.clientY + sc.scrollTop - b.y) < 6) return;
    b.on = true;
    b.el = Object.assign(document.createElement("div"), { className: "gal-band" });
    document.body.append(b.el);
    document.body.classList.add("gal-banding");
    closeMenu();
  }
  bandDraw();
  // near the top or bottom edge the page scrolls on its own, and the box follows
  const r = sc.getBoundingClientRect(), edge = 48;
  const v = ev.clientY < r.top + edge ? -1 : ev.clientY > r.bottom - edge ? 1 : 0;
  if (v && !b.raf) {
    const loop = () => {
      if (!G.band?.on) return;
      const rr = sc.getBoundingClientRect(), y = G.band.last.clientY;
      const s = y < rr.top + edge ? -Math.ceil((rr.top + edge - y) / 4) : y > rr.bottom - edge ? Math.ceil((y - rr.bottom + edge) / 4) : 0;
      if (!s) { G.band.raf = 0; return; }
      sc.scrollTop += s;
      bandDraw();
      G.band.raf = requestAnimationFrame(loop);
    };
    b.raf = requestAnimationFrame(loop);
  }
}
function bandDraw() {
  const b = G.band, sc = scroller();
  if (!b?.on || !sc) return;
  const y0 = b.y - sc.scrollTop, x1 = b.last.clientX, y1 = b.last.clientY;
  const L = Math.min(b.x, x1), T = Math.min(y0, y1), R = Math.max(b.x, x1), B = Math.max(y0, y1);
  const r = sc.getBoundingClientRect();
  Object.assign(b.el.style, { left: `${L}px`, top: `${Math.max(T, r.top)}px`, width: `${R - L}px`, height: `${Math.max(0, Math.min(B, r.bottom) - Math.max(T, r.top))}px` });
  const next = new Set(b.base);
  sc.querySelectorAll("[data-gk]").forEach((t) => {
    const q = t.getBoundingClientRect();
    if (q.right > L && q.left < R && q.bottom > T && q.top < B) next.add(t.dataset.gk);
  });
  G.sel = next;
  syncSel();
}
function bandEnd() {
  const b = G.band;
  G.band = null;
  if (!b) return;
  cancelAnimationFrame(b.raf);
  if (!b.on) return;
  b.el.remove();
  document.body.classList.remove("gal-banding");
  G.eat = true; // the click that ends a drag is not a click on a tile
  setTimeout(() => (G.eat = false), 0);
}

// ---------- events ----------
let searchT = 0;
// the room's render keeps what was typed in a field (data-dirty): clearing the search from a chip clears the field too
function clearQ() {
  clearTimeout(searchT);
  G.q = "";
  const q = document.querySelector(".gal-q");
  if (q) { q.value = ""; delete q.dataset.dirty; }
}
function onClick(ev) {
  if (G.eat) { G.eat = false; ev.preventDefault(); ev.stopPropagation(); return; }
  const v = ev.target.closest?.("[data-gv]");
  if (v && G.view) return v.dataset.gv === "step" ? stepView(+v.dataset.v) : viewAct(v.dataset.gv);
  if (G.view && ev.target.closest?.(".gal-lb") && !ev.target.closest("img, video, button")) return closeView();
  const m = ev.target.closest?.(".gal-menu [data-g]");
  if (m) { closeMenu(); return act(m.dataset.v); }
  const menuWas = !!G.menu;
  if (G.menu && !ev.target.closest?.(".gal-menu")) closeMenu();
  if (!onPage() || !ev.target.closest?.("#app")) return;
  if (G.filt && !ev.target.closest(".gal-pop, [data-g=filt]")) { G.filt = false; render(); }
  const el = ev.target.closest("[data-g], [data-gk]");
  if (!el) return;
  const g = el.dataset.g;
  if (g === "chk") { const t = el.closest("[data-gk]"); if (ev.shiftKey && G.anchor) range(t.dataset.gk); else toggle(t.dataset.gk); return syncSel(); }
  if (!g && el.dataset.gk) {
    const k = el.dataset.gk;
    if (ev.shiftKey && G.anchor) { range(k); return syncSel(); }
    if (ev.metaKey || ev.ctrlKey || G.sel.size) { toggle(k); return syncSel(); }
    return openView(k);
  }
  if (g === "filt") { G.filt = !G.filt; return render(); }
  if (g === "sort") { G.f.sort = el.dataset.v; return render(); }
  if (g === "f") { const set = G.f[el.dataset.k], v = el.dataset.v; if (set.has(v)) set.delete(v); else set.add(v); return render(); }
  if (g === "off") {
    const k = el.dataset.k;
    if (k === "all") { G.f = blank(); G.group = null; G.soul = null; clearQ(); }
    else if (k === "sort") G.f.sort = "new";
    else if (k === "group") G.group = null;
    else if (k === "soul") G.soul = null;
    else if (k === "q") clearQ();
    else G.f[k]?.delete(el.dataset.v);
    return render();
  }
  if (g === "group") { G.group = G.group === el.dataset.v ? null : el.dataset.v; G.soul = null; return render(); }
  if (g === "soul") { G.soul = G.soul === el.dataset.v ? null : el.dataset.v; G.group = null; return render(); }
  if (g === "group-rename") return renameGroup(el.dataset.v);
  if (g === "group-delete") return deleteGroup(el.dataset.v);
  if (g === "soul-copy") { const s = G.souls.find((x) => x.id === el.dataset.v); navigator.clipboard?.writeText(s?.ref_id || "").then(() => C.toast("ID do Soul copiado"), () => C.toast(s?.ref_id || "", false)); return; }
  if (g === "all") { G.order.forEach((k) => G.sel.add(k)); return syncSel(); }
  if (g === "clear") return clearSel();
  if (g === "menu") { if (menuWas) return; const r = el.getBoundingClientRect(); return showMenu(r.left - 120, r.top, true); }
  if (g === "act") return act(el.dataset.v);
}
function onContext(ev) {
  if (!onPage() || G.view || ev.target.closest?.("input, textarea")) return;
  const t = ev.target.closest?.("#app [data-gk]");
  if (!t && !(ev.target.closest?.(".gal-body") && G.sel.size)) return;
  ev.preventDefault();
  // a right click outside the selection selects that one image alone (as in Finder)
  if (t && !G.sel.has(t.dataset.gk)) { G.sel = new Set([t.dataset.gk]); G.anchor = t.dataset.gk; syncSel(); }
  showMenu(ev.clientX, ev.clientY);
}
function onDown(ev) {
  if (!onPage() || ev.button !== 0 || ev.pointerType === "touch" || G.view || dlg) return; // a finger scrolls
  const sc = scroller();
  if (!sc || !ev.target.closest?.(".gal-body") || ev.target.closest("button, input, a, .gal-sets, .fchips, video[controls]")) return;
  if (ev.target === sc && ev.offsetX > sc.clientWidth) return; // the scrollbar
  bandStart(ev);
}
// a double click opens the image big even while selecting (its two clicks cancel each other)
function onDbl(ev) {
  const t = onPage() && !G.view && ev.target.closest?.("#app [data-gk]");
  if (t && !ev.target.closest("button")) openView(t.dataset.gk);
}
function onKey(ev) {
  if (document.body.classList.contains("est-open") || document.querySelector(".motion-ov")) return;
  const typing = ev.target.matches?.("input, textarea, select, [contenteditable]");
  if (dlg) { if (ev.key === "Escape") { ev.stopPropagation(); closeDlg(); } return; }
  if (G.menu) {
    if (ev.key === "Escape") { ev.stopPropagation(); ev.preventDefault(); return closeMenu(); }
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const bs = [...G.menu.querySelectorAll("button:not([disabled])")], i = bs.indexOf(document.activeElement);
      bs[(i + (ev.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length]?.focus();
    }
    return;
  }
  if (G.view) {
    if (typing) return;
    ev.stopPropagation();
    if (ev.key === "Escape") return closeView();
    if (ev.key === "ArrowRight") return stepView(1);
    if (ev.key === "ArrowLeft") return stepView(-1);
    if (ev.key === " ") { ev.preventDefault(); return viewAct("sel"); }
    if (ev.metaKey || ev.ctrlKey) return;
    const k = { m: "keep", d: "drop" }[ev.key.toLowerCase()];
    if (k) return viewAct(k);
    return;
  }
  if (!onPage() || typing) return;
  if (ev.key === "Escape" && (G.filt || G.sel.size)) { ev.stopPropagation(); if (G.filt) { G.filt = false; return render(); } return clearSel(); }
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "a") { ev.preventDefault(); G.order.forEach((k) => G.sel.add(k)); return syncSel(); }
  if (ev.key === " " && G.sel.size === 1) { ev.preventDefault(); return openView([...G.sel][0]); }
  // M / D as in the room's viewer: ✓ or ✕ on what is selected
  const k = G.sel.size && !ev.metaKey && !ev.ctrlKey && !ev.altKey && { m: "keep", d: "drop" }[ev.key.toLowerCase()];
  if (k) { ev.preventDefault(); return review(selList(), k); }
}
function onInput(ev) {
  const t = ev.target;
  if (t.matches?.(".gal-q")) {
    clearTimeout(searchT);
    searchT = setTimeout(() => { G.q = t.value.trim(); render(); }, 160);
  } else if (t.matches?.(".gal-size")) {
    G.size = +t.value;
    document.querySelector(".gal-body")?.style.setProperty("--gw", `${G.size}px`);
    store.set("sala-gal-size", String(G.size));
  }
}
// leaving the page closes what floats over it
function onRoute() {
  if (onPage()) return;
  closeLayers();
  closeView();
  if (G.band) bandEnd();
}

// ---------- entry ----------
export function init(ctx) {
  C = ctx;
  ORIGIN.wk = `Material ${C.DA_CL}`;
  if (C.motionLabel) ORIGIN.motion = C.motionLabel;
  if (!document.getElementById("gal-css")) document.head.append(Object.assign(document.createElement("link"), { id: "gal-css", rel: "stylesheet", href: new URL(`./galeria.css?v=${CSS_V}`, import.meta.url).href }));
  document.addEventListener("click", onClick, true);
  document.addEventListener("contextmenu", onContext);
  document.addEventListener("dblclick", onDbl);
  document.addEventListener("pointerdown", onDown);
  document.addEventListener("pointermove", (e) => G.band && bandMove(e));
  document.addEventListener("pointerup", bandEnd);
  document.addEventListener("pointercancel", bandEnd);
  document.addEventListener("input", onInput);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("hashchange", onRoute);
  window.addEventListener("blur", () => G.band && bandEnd());
  window.addEventListener("scroll", closeMenu, true);
  loadExtra(true).then(() => onPage() && render()).catch((e) => { console.warn(e); G.loaded = true; });
  setInterval(poll, 10000);
  document.addEventListener("visibilitychange", poll);
}
