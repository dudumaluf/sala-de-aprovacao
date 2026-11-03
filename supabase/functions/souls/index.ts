// Soul ID da sala: the Galeria's "Criar Soul ID" trains one person on Higgsfield from 5–20 photos of the room
// (POST /v1/custom-references) and follows the training. The trained reference is used afterwards by the Soul models
// (custom_reference_id). The key stays on the server (HF_KEY, or the Vault secret read by estudio_hf_key(), the same as
// the studio's) and is never returned; only a caller signed in with the team login (app_metadata.side = "time", or
// app_metadata.room = "time" in a job that shares the project) gets through, and the souls table is written with the
// caller's own login, so its row rules still apply. Photos are files of the room's bucket, passed as storage paths and
// signed here with the caller's login. The room sends its schema and bucket (config.js SCHEMA, BUCKET; "public" and
// "media" when it does not). ALLOWED_ORIGINS works as in the studio's function.
// Actions (POST JSON): check, train, status.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const HF = "https://api.higgsfield.ai";
const NO_KEY = "A chave da Higgsfield ainda não foi configurada no servidor.";
// the room's sites (ALLOWED_ORIGINS); a copy running on this computer (localhost, any port) is always let through, for tests
const ORIGINS = new Set((Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean));
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const allowed = (origin: string) => !!origin && (!ORIGINS.size || ORIGINS.has(origin) || LOCAL.test(origin));
const VERSIONS = new Set(["v1", "v2", "cinema"]);
const STATES = new Set(["not_ready", "queued", "in_progress", "completed", "failed"]);
const OPEN = new Set(["not_ready", "queued", "in_progress"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// the provider's own words when it refuses something (FastAPI lists, plain messages, nested errors)
// deno-lint-ignore no-explicit-any
const errOf = (o: any): string => {
  if (Array.isArray(o?.detail)) return o.detail.map((d: { msg?: string; loc?: unknown[] }) => [d?.loc?.slice(1).join("."), d?.msg].filter(Boolean).join(": ")).filter(Boolean).join("; ");
  return [o?.detail, o?.message, o?.error?.message, o?.error, o?.fail_reason].find((x) => typeof x === "string" && x) || "";
};

const cors = (origin: string) => ({
  // a site that is not allowed gets the room's own address back, so its browser refuses to read the answer
  "Access-Control-Allow-Origin": allowed(origin) ? origin : [...ORIGINS][0] || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const body = await req.json().catch(() => ({}));
    const ident = (v: unknown, ok: RegExp, d: string) => (typeof v === "string" && ok.test(v) ? v : d);
    const schema = ident(body.schema, /^[a-z_][a-z0-9_]{0,62}$/, "public"), bucket = ident(body.bucket, /^[a-z0-9_-]{1,63}$/, "media");
    const db = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      db: { schema },
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: who } = await db.auth.getUser(token);
    const meta = who?.user?.app_metadata || {};
    if ((meta.job ? meta.room : meta.side) !== "time") return json({ error: "Só a equipe cria Soul ID." }, 403);

    // trimmed: a key pasted in the dashboard often brings a space or a line break along
    const hfKey = async () => {
      const env = (Deno.env.get("HF_KEY") || "").trim();
      if (env) return env;
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
      const { data } = await admin.rpc("estudio_hf_key");
      return ((data as string) || "").trim();
    };
    const api = (key: string, path: string, init: RequestInit = {}) =>
      fetch(HF + path, { ...init, headers: { Authorization: `Key ${key}`, "Content-Type": "application/json", ...(init.headers || {}) } });
    // a day: the training may wait in Higgsfield's queue before it reads the photos
    const sign = async (path: unknown) => {
      if (typeof path !== "string" || !path || path.includes("..") || /^[a-z]+:/i.test(path)) throw new Error("Arquivo inválido.");
      const { data, error } = await db.storage.from(bucket).createSignedUrl(path, 24 * 3600);
      if (error || !data) throw new Error(`Não consegui abrir ${path}`);
      return data.signedUrl;
    };

    // is the key there and accepted? Free: a reference that does not exist (404 = key accepted) and, with probe, a
    // training with no photos, which Higgsfield refuses before charging anything (says the endpoint is open to this key)
    if (body.action === "check") {
      const key = await hfKey();
      if (!key) return json({ key: null });
      if (!body.verify) return json({ key: true });
      const answers: Record<string, string> = {};
      const a = await api(key, `/v1/custom-references/${crypto.randomUUID()}`);
      answers.get = `${a.status} ${errOf(await a.json().catch(() => ({}))).slice(0, 160)}`.trim();
      if (body.probe) {
        const b = await api(key, "/v1/custom-references", { method: "POST", body: JSON.stringify({ name: "probe", model_version: "v2", input_images: [] }) });
        answers.train = `${b.status} ${errOf(await b.json().catch(() => ({}))).slice(0, 200)}`.trim();
      }
      return json({ key: a.status !== 401 && a.status !== 403, answers });
    }

    if (body.action === "train") {
      const name = String(body.name || "").trim().slice(0, 100);
      if (!name) return json({ error: "Dê um nome ao Soul." }, 400);
      const seen = new Set<string>();
      const photos = (Array.isArray(body.photos) ? body.photos : [])
        .filter((p: { path?: unknown }) => typeof p?.path === "string" && !seen.has(p.path) && seen.add(p.path))
        .map((p: { path: string; option_id?: string; file_id?: string }) => ({
          path: p.path,
          ...(UUID.test(p.option_id || "") ? { option_id: p.option_id } : {}),
          ...(UUID.test(p.file_id || "") ? { file_id: p.file_id } : {}),
        }));
      if (photos.length < 5 || photos.length > 20) return json({ error: `O Soul ID treina com 5 a 20 fotos (vieram ${photos.length}).` }, 400);
      const key = await hfKey();
      if (!key) return json({ error: NO_KEY }, 503);
      const version = VERSIONS.has(body.model_version) ? body.model_version : "v2";
      const urls = await Promise.all(photos.map((p: { path: string }) => sign(p.path)));
      const r = await api(key, "/v1/custom-references", {
        method: "POST",
        body: JSON.stringify({ name, model_version: version, input_images: urls.map((image_url) => ({ type: "image_url", image_url })) }),
      });
      const out = await r.json().catch(() => ({}));
      if (r.status === 429) return json({ error: "A Higgsfield já está treinando o máximo de Souls ao mesmo tempo. Tente de novo daqui a pouco." }, 429);
      if (!r.ok || !out?.id) return json({ error: errOf(out) || `A Higgsfield respondeu ${r.status}` }, 400);
      const { data: soul, error } = await db.from("souls").insert({
        name, model_version: version, ref_id: String(out.id), status: STATES.has(out.status) ? out.status : "queued", photos,
        thumbnail_url: out.thumbnail_url || null, fail_reason: out.fail_reason || null,
        item_id: UUID.test(body.item_id || "") ? body.item_id : null, created_by: String(body.created_by || "").slice(0, 60),
      }).select().single();
      // the training already started: never lose its id
      if (error) return json({ error: `A Higgsfield começou o treino (${out.id}), mas a sala não guardou: ${error.message}`, ref_id: out.id }, 500);
      return json({ soul });
    }

    if (body.action === "status") {
      const { data: soul, error } = await db.from("souls").select("*").eq("id", body.soul_id).maybeSingle();
      if (error || !soul) return json({ error: "Soul não encontrado." }, 404);
      if (!soul.ref_id || !OPEN.has(soul.status)) return json({ soul });
      const key = await hfKey();
      if (!key) return json({ error: NO_KEY }, 503);
      const r = await api(key, `/v1/custom-references/${encodeURIComponent(soul.ref_id)}`);
      const s = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: errOf(s) || `A Higgsfield respondeu ${r.status}` }, 400);
      const status = STATES.has(s.status) ? s.status : soul.status;
      const { data: upd, error: e2 } = await db.from("souls")
        .update({ status, thumbnail_url: s.thumbnail_url || soul.thumbnail_url, fail_reason: s.fail_reason || null, updated_at: new Date().toISOString() })
        .eq("id", soul.id).select().single();
      if (e2) throw e2;
      return json({ soul: upd });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
