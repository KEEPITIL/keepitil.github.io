// KEEPITIL push-send — VAPID web push fan-out (free, no paid API key).
// Callers: (a) an ADMIN user JWT (checked via is_admin RPC), or
//          (b) internal callers presenting x-kil-internal matching app_secrets.push_internal_key
//              (for DB emit points via pg_net; still requires the anon JWT to reach the function).
// Body: { title, body, url?, tag?, category, user_ids?: string[] }
// Every send RESPECTS per-user opt-in prefs: user_settings.settings->>'push_<category>' must be true.
// Dead subscriptions (404/410) are pruned automatically.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";

const SUPA = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DB = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// ⚠ WAS "/v3/" (route cleanup 2026-08-31). Any push sent without an explicit url opened
// keepitil.com/v3/, which has 404'd since the purge — a notification whose only job is to
// bring someone back to the site was landing them on an error page. The root is the correct
// default: it is the one URL that is always valid.
const DEFAULT_URL = "/";

const CATEGORIES = ["events","artists","venues","genres","communities","marketplace","competitions","radio","articles","marketing"];

async function secret(k: string): Promise<string | null> {
  const r = await fetch(`${SUPA}/rest/v1/app_secrets?key=eq.${k}&select=value`, { headers: DB });
  const rows = await r.json();
  return rows?.[0]?.value ?? null;
}

async function callerIsAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const r = await fetch(`${SUPA}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, Authorization: auth, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) return false;
  return (await r.json()) === true;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const internalKey = await secret("push_internal_key");
  const isInternal = !!internalKey && req.headers.get("x-kil-internal") === internalKey;
  const isAdmin = isInternal ? true : await callerIsAdmin(req);
  if (!isAdmin) return new Response(JSON.stringify({ ok: false, error: "not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } });

  let body: { title?: string; body?: string; url?: string; tag?: string; category?: string; user_ids?: string[] };
  try { body = await req.json(); } catch (_e) { return new Response(JSON.stringify({ ok: false, error: "bad json" }), { status: 400, headers: { "Content-Type": "application/json" } }); }
  const category = String(body.category || "").toLowerCase();
  if (!body.title || !CATEGORIES.includes(category)) {
    return new Response(JSON.stringify({ ok: false, error: "need title + valid category (" + CATEGORIES.join("|") + ")" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const [pub, priv, subject] = await Promise.all([secret("vapid_public"), secret("vapid_private"), secret("vapid_subject")]);
  if (!pub || !priv) return new Response(JSON.stringify({ ok: false, error: "vapid keys missing" }), { status: 500, headers: { "Content-Type": "application/json" } });
  webpush.setVapidDetails(subject || "mailto:crew@keepitil.com", pub, priv);

  // Load subscriptions (optionally scoped to user_ids)
  let q = `${SUPA}/rest/v1/push_subscriptions?select=id,user_id,endpoint,p256dh,auth`;
  if (Array.isArray(body.user_ids) && body.user_ids.length) {
    q += `&user_id=in.(${body.user_ids.slice(0, 2000).join(",")})`;
  }
  const subs: { id: number; user_id: string; endpoint: string; p256dh: string; auth: string }[] = await (await fetch(q, { headers: DB })).json();
  if (!subs.length) return new Response(JSON.stringify({ ok: true, sent: 0, skipped_prefs: 0, pruned: 0, note: "no subscriptions" }), { headers: { "Content-Type": "application/json" } });

  // Per-category OPT-IN filter from user_settings
  const uids = [...new Set(subs.map((s) => s.user_id))];
  const settingsRows: { user_id: string; settings: Record<string, unknown> }[] =
    await (await fetch(`${SUPA}/rest/v1/user_settings?select=user_id,settings&user_id=in.(${uids.join(",")})`, { headers: DB })).json();
  const optedIn = new Set(settingsRows.filter((r) => r.settings && r.settings["push_" + category] === true).map((r) => r.user_id));
  const recipients = subs.filter((s) => optedIn.has(s.user_id));

  const payload = JSON.stringify({ title: body.title, body: body.body || "", url: body.url || DEFAULT_URL, tag: body.tag, category });
  let sent = 0; const dead: number[] = [];
  for (let i = 0; i < recipients.length; i += 20) {
    await Promise.all(recipients.slice(i, i + 20).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id);
      }
    }));
  }
  if (dead.length) {
    await fetch(`${SUPA}/rest/v1/push_subscriptions?id=in.(${dead.join(",")})`, { method: "DELETE", headers: DB });
  }

  return new Response(JSON.stringify({ ok: true, sent, eligible: recipients.length, skipped_prefs: subs.length - recipients.length, pruned: dead.length }), { headers: { "Content-Type": "application/json" } });
});
