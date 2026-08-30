// NEXUS — moderate-media
//
// Server-to-server CREATE moderation contract for KEEPITIL.
// Returns PASS | BLOCK | RETRY and nothing else. It never decides winners, rewards, payouts,
// votes, publication state, ticket maths or authorization — those are deterministic and belong
// to KEEPITIL. A moderation service that can also move money is one that can be talked into it.
//
// DEPLOY
//   supabase functions deploy moderate-media --project-ref dojmswwxmdtizrtoirem
//   (verify_jwt stays ON — see the auth note below)
//
// ── FAIL CLOSED IS THE DEFAULT PATH, NOT AN ERROR HANDLER ────────────────────────────────────
// Anything that is not an explicit, confident PASS returns RETRY or BLOCK, and KEEPITIL keeps
// the entry private for both. Timeout, exception, unreachable media, no classifier configured,
// unparseable provider answer — all RETRY. There is no branch where a failure becomes a PASS.
//
// ── IDEMPOTENT ──────────────────────────────────────────────────────────────────────────────
// request_id is unique in moderation_requests. A replay returns the STORED verdict rather than
// re-classifying, so a retry storm cannot produce two answers for one submission and a BLOCK
// can never be retried into a PASS.
//
// ── AUTH ────────────────────────────────────────────────────────────────────────────────────
// verify_jwt is on AND the token must carry role=service_role. The anon key is a valid JWT for
// this project, so verify_jwt ALONE would let any browser call this; the role check is what
// actually makes it server-to-server.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POLICY_VERSION = "kil-mod-v1";
const MEDIA_TIMEOUT_MS = 15000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o, null, 2), { status, headers: { ...cors, "Content-Type": "application/json" } });

function roleFromJwt(auth: string): string | null {
  try {
    const t = auth.replace(/^Bearer\s+/i, "");
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p?.role ?? null;
  } catch (_e) { return null; }
}

/* ── PROVIDER-AGNOSTIC VISION ROUTING ────────────────────────────────────────────────────────
   No vendor is named in the decision path. The router asks the DATABASE which models can see
   (`supports_vision = true`, enabled, on an enabled provider that holds a credential), orders
   them by the provider's own priority, and dispatches on `provider_type`.

   Why this shape rather than "call OpenAI":
     · swapping or adding a vendor is a row in model_providers, not a redeploy;
     · a provider whose credential is pulled drops out automatically instead of erroring;
     · fallback order is operational config, which is where it belongs.

   To add a vendor: implement one `classify` and register it under its provider_type. Nothing
   above or below this table changes, and the fail-closed contract is unaffected. */
type Verdict = "PASS" | "BLOCK" | "RETRY";
type Finding = { verdict: Verdict; categories?: string[]; confidence?: number; reason?: string };

type Classifier = (args: {
  mediaUrls: string[];
  policy: string[];
  modelKey: string;
  endpoint: string | null;
  apiKey: string | null;
  config: Record<string, unknown>;
}) => Promise<Finding>;

const CLASSIFIERS: Record<string, Classifier> = {
  // Each entry receives the resolved credential and returns a Finding. Deliberately empty until
  // a vision provider is credentialed on NEXUS: an unimplemented vendor must not silently
  // resolve to PASS, and registering a stub that returns PASS would be exactly that.
  //
  // e.g.  CLOUDFLARE: async ({ mediaUrls, apiKey, modelKey, config }) => { ... }
  //       OPENAI:     async ({ mediaUrls, apiKey, modelKey }) => { ... }
  //       ANTHROPIC:  async ({ mediaUrls, apiKey, modelKey }) => { ... }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  const admin = createClient(SUPA_URL, SERVICE);

  const role = roleFromJwt(req.headers.get("Authorization") || "");
  if (role !== "service_role") {
    return J({ ok: false, error: "server-to-server only", verdict: "RETRY",
               note: "Caller is not service_role. Failing closed." }, 403);
  }

  let body: any = {};
  try { body = await req.json(); } catch (_e) {}

  const requestId = String(body.request_id ?? "").trim();
  if (!requestId) return J({ ok: false, error: "request_id is required", verdict: "RETRY" }, 400);

  const entryRef = body.entry_id != null ? String(body.entry_id) : null;
  const media = Array.isArray(body.media) ? body.media : [];
  const policy: string[] = Array.isArray(body.policy) && body.policy.length
    ? body.policy : ["nudity", "explicit_sexual_content"];

  // IDEMPOTENCY — a known request_id returns its stored verdict, unchanged.
  const { data: existing } = await admin.from("moderation_requests")
    .select("request_id,verdict,reason,categories,confidence,provider,model,policy_version,decided_at")
    .eq("request_id", requestId).maybeSingle();
  if (existing?.verdict) return J({ ok: true, replayed: true, ...existing });

  // Record the attempt BEFORE deciding, so a crash mid-decision still leaves a trace.
  await admin.from("moderation_requests").upsert(
    { request_id: requestId, caller: "keepitil", entry_ref: entryRef, media, policy,
      policy_version: POLICY_VERSION },
    { onConflict: "request_id" });

  const finish = async (verdict: Verdict, f: Partial<Finding> & {
    provider?: string | null; model?: string | null; error?: string | null;
  }) => {
    const payload = {
      verdict,
      reason: f.reason ?? null,
      categories: f.categories ?? null,
      confidence: f.confidence ?? null,
      provider: f.provider ?? null,
      model: f.model ?? null,
      policy_version: POLICY_VERSION,
      decided_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      error: f.error ?? null,
    };
    await admin.from("moderation_requests").update(payload).eq("request_id", requestId);
    return J({ ok: true, request_id: requestId, ...payload });
  };

  try {
    const mediaUrls: string[] = media
      .map((m: any) => (typeof m === "string" ? m : m?.url))
      .filter((u: unknown): u is string => typeof u === "string" && !!u.trim());

    if (!mediaUrls.length) {
      // Nothing to look at is not the same as nothing wrong with it.
      return await finish("RETRY", { reason: "no media supplied", error: "empty media array" });
    }

    // Ask the database which models can see. Vendor names appear nowhere in this query.
    const { data: candidates } = await admin.from("models")
      .select("model_key, model_providers!inner(provider_key, provider_type, endpoint, enabled, secret_reference, configuration, priority)")
      .eq("enabled", true)
      .eq("supports_vision", true);

    const usable = (candidates ?? [])
      .filter((m: any) => m.model_providers?.enabled === true && !!m.model_providers?.secret_reference)
      .sort((a: any, b: any) =>
        (a.model_providers?.priority ?? 999) - (b.model_providers?.priority ?? 999));

    if (!usable.length) {
      // The honest answer while no classifier exists. An un-inspected image is never called clean.
      return await finish("RETRY", {
        reason: "no credentialed vision model is configured",
        error: "classifier_unavailable",
      });
    }

    // Try providers in priority order; a failure falls through to the next rather than deciding.
    let lastError = "no classifier produced a result";
    for (const m of usable) {
      const p = m.model_providers as any;
      const type = String(p.provider_type ?? "").toUpperCase();
      const impl = CLASSIFIERS[type];
      if (!impl) { lastError = `no classifier implemented for provider_type ${type}`; continue; }

      const apiKey = p.secret_reference ? Deno.env.get(p.secret_reference) ?? null : null;
      if (!apiKey) { lastError = `secret ${p.secret_reference} is not set in the environment`; continue; }

      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), MEDIA_TIMEOUT_MS);
        const found = await impl({
          mediaUrls, policy,
          modelKey: m.model_key,
          endpoint: p.endpoint ?? null,
          apiKey,
          config: (p.configuration ?? {}) as Record<string, unknown>,
        });
        clearTimeout(timer);

        if (found && (found.verdict === "PASS" || found.verdict === "BLOCK" || found.verdict === "RETRY")) {
          return await finish(found.verdict, {
            reason: found.reason ?? null,
            categories: found.categories ?? null,
            confidence: found.confidence ?? null,
            provider: p.provider_key ?? null,
            model: m.model_key ?? null,
          });
        }
        lastError = "classifier returned an unrecognised result";
      } catch (e) {
        lastError = `classifier failed: ${String(e).slice(0, 160)}`;
      }
    }

    // Every candidate failed. RETRY, never PASS.
    return await finish("RETRY", { reason: "classification did not complete", error: lastError });
  } catch (e) {
    return await finish("RETRY", { reason: "moderation error", error: String(e).slice(0, 300) });
  }
});
