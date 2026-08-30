// KEEPITIL — supabase/functions/moderation-run/index.ts
// Deploy to project ovmqtzjfpzrbzrlkxwgw with: supabase functions deploy moderation-run
// Requires secret: NEXUS_SERVICE_KEY  (a service_role key for the NEXUS project)
// Optional secret: NEXUS_URL          (defaults to the NEXUS project URL below)
//
// Drains the KEEPITIL moderation queue against the NEXUS moderate-media contract.
//
// KEEPITIL OWNS THE MUTATION. NEXUS returns a verdict and nothing else; the publication
// decision is made here by moderation_record_verdict — the only function that can publish a
// CREATE entry, and it publishes on PASS only. So even a compromised or wrong moderation
// service cannot make content public; it can only fail to prevent it, and only PASS does that.
//
// FAIL CLOSED EVERYWHERE. Unreachable NEXUS, non-200, malformed body, unknown verdict, missing
// credential: all recorded as RETRY, which keeps the entry private and re-queues with backoff.
// There is no branch that treats an error as PASS.
//
// IDEMPOTENT: request_id is derived from the entry and its attempt count, so re-running the
// same attempt hits the NEXUS idempotency store and returns the SAME verdict.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// ── SECRET LOOKUP PATH (Founder §4) ─────────────────────────────────────────────────────────
// The lookup is wired here; only the VALUE is external. Resolution order, most specific first:
//   1. NEXUS_SERVICE_KEY   — the expected name, set with:
//        supabase secrets set NEXUS_SERVICE_KEY=<service_role key for dojmswwxmdtizrtoirem>
//   2. NEXUS_SERVICE_ROLE_KEY — accepted alias, because that is the name Supabase itself uses
//        and typing the platform's own convention should not fail silently.
// The project URL is overridable so a staging NEXUS can be pointed at without a code change.
//
// No default and no fallback to an anon key: moderate-media requires role=service_role, and a
// wrong-role call would be rejected there anyway. Refusing here makes that failure legible
// instead of surfacing as a 403 from another system.
const NEXUS_URL = Deno.env.get("NEXUS_URL") ?? "https://dojmswwxmdtizrtoirem.supabase.co";
const NEXUS_SERVICE_KEY =
  Deno.env.get("NEXUS_SERVICE_KEY") ??
  Deno.env.get("NEXUS_SERVICE_ROLE_KEY") ??
  null;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const J = (o: unknown, status = 200) => new Response(JSON.stringify(o, null, 2), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(SUPA_URL, SERVICE);

    // Admin-only: the queue exposes unpublished submissions.
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: userRes } = await admin.auth.getUser(jwt);
    const uid = userRes?.user?.id;
    if (!uid) return J({ ok: false, error: "not signed in" }, 401);
    const { data: isAdmin } = await admin.from("app_admins").select("user_id").eq("user_id", uid).maybeSingle();
    if (!isAdmin) return J({ ok: false, error: "admin only" }, 403);

    if (!NEXUS_SERVICE_KEY) {
      return J({ ok: false, blocked: "NEXUS_SERVICE_KEY is not configured",
                 checked_names: ["NEXUS_SERVICE_KEY", "NEXUS_SERVICE_ROLE_KEY"],
                 nexus_url: NEXUS_URL,
                 note: "moderate-media requires role=service_role. Nothing was processed and "
                     + "nothing was published — the queue stays fail-closed until the secret is set." }, 503);
    }

    // A service_role key is a JWT. Catching a pasted anon key or a truncated value here gives a
    // clear local error instead of an opaque 403 from NEXUS.
    if (!/^eyJ[A-Za-z0-9_-]{10,}\./.test(NEXUS_SERVICE_KEY)) {
      return J({ ok: false, blocked: "NEXUS_SERVICE_KEY does not look like a JWT",
                 note: "Expected a service_role key. Nothing processed; queue stays fail-closed." }, 503);
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(Number(body.limit ?? 10), 50));

    const { data: due, error: dueErr } = await admin.rpc("moderation_due", { p_limit: limit });
    if (dueErr) return J({ ok: false, error: dueErr.message }, 500);
    if (!due || !due.length) return J({ ok: true, processed: 0, note: "nothing due" });

    const results: unknown[] = [];

    for (const item of due) {
      const entryId = item.entry_id;
      // Attempt-scoped: a deliberate re-check gets a fresh decision; a retry of the SAME attempt
      // is idempotent on the NEXUS side.
      const requestId = `kil-entry-${entryId}-a${item.attempts ?? 0}`;

      let verdict = "RETRY";
      let reason: string | null = "moderation unavailable";
      let categories: string[] | null = null;
      let confidence: number | null = null;
      let version: string | null = null;

      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 20000);
        const res = await fetch(`${NEXUS_URL}/functions/v1/moderate-media`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: NEXUS_SERVICE_KEY,
                     Authorization: `Bearer ${NEXUS_SERVICE_KEY}` },
          body: JSON.stringify({ request_id: requestId, ...item.request }),
          signal: ctl.signal,
        });
        clearTimeout(timer);

        if (res.ok) {
          const b = await res.json();
          // Only these three strings are verdicts. A 200 with a surprising body stays RETRY
          // rather than being coerced into a decision.
          if (b && (b.verdict === "PASS" || b.verdict === "BLOCK" || b.verdict === "RETRY")) {
            verdict = b.verdict;
            reason = b.reason ?? null;
            categories = Array.isArray(b.categories) ? b.categories : null;
            confidence = typeof b.confidence === "number" ? b.confidence : null;
            version = [b.provider, b.model, b.policy_version].filter(Boolean).join("/") || null;
          } else {
            reason = "unrecognised moderation response";
          }
        } else {
          reason = `moderation service returned ${res.status}`;
        }
      } catch (e) {
        reason = `moderation call failed: ${String(e).slice(0, 160)}`;
      }

      // KEEPITIL decides. PASS publishes; BLOCK and RETRY keep it private and retract anything
      // previously public.
      const { data: rec, error: recErr } = await admin.rpc("moderation_record_verdict", {
        p_entry_id: entryId, p_verdict: verdict, p_reason: reason,
        p_categories: categories, p_confidence: confidence, p_provider_version: version,
      });

      results.push({ entry_id: entryId, request_id: requestId, verdict,
                     recorded: recErr ? `error: ${recErr.message}` : rec });
    }

    return J({ ok: true, processed: results.length, results });
  } catch (e) {
    return J({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
