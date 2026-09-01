// moderation-accept-driver - QA ONLY, TEMPORARY.
//
// KODE must run the moderation acceptance matrix but must never hold NEXUS_SERVICE_KEY.
// This function is the operational answer: it lives on keepitil-prod, where the production
// secret is already installed, and forwards an acceptance request to NEXUS using it. The
// caller authenticates with a SEPARATE, dedicated, disposable acceptance credential.
//
// Deliberate limits:
//   - it is not a general proxy: only the moderate-media endpoint is reachable
//   - it never returns, logs or echoes NEXUS_SERVICE_KEY
//   - unset acceptance key => refuse everyone, fail closed
//   - it reads and writes NO KEEPITIL data
//
// Delete this and unset ACCEPTANCE_DRIVER_KEY the moment the matrix is finished.
const TARGET = "https://dojmswwxmdtizrtoirem.supabase.co/functions/v1/moderate-media";
const NEXUS_KEY = Deno.env.get("NEXUS_SERVICE_KEY") ?? "";
const ACCEPT_KEY = Deno.env.get("ACCEPTANCE_DRIVER_KEY") ?? "";

function ctEq(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
const J = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return J({ ok: false, error: "method_not_allowed" }, 405);
  const k = req.headers.get("x-acceptance-key") ?? "";
  if (!ACCEPT_KEY || !k || !ctEq(k, ACCEPT_KEY)) return J({ ok: false, error: "driver_unauthorized" }, 401);
  if (!NEXUS_KEY) return J({ ok: false, error: "driver_missing_nexus_key" }, 503);

  // "auth" lets the harness drive the UNAUTHORIZED cases through the same path: the driver
  // deliberately forwards a bad credential or none, so case 6 exercises the real endpoint.
  const mode = req.headers.get("x-forward-auth") ?? "valid";
  const raw = await req.text();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (mode === "valid") h["x-nexus-service-key"] = NEXUS_KEY;
  else if (mode === "wrong") h["x-nexus-service-key"] = "not-the-real-key-0000";
  else if (mode === "jwt") h["Authorization"] = "Bearer eyJhbGciOiJIUzI1NiJ9.forged.sig";

  const t0 = Date.now();
  try {
    const r = await fetch(TARGET, { method: "POST", headers: h, body: raw });
    const body = await r.text();
    return J({ driver: true, upstream_status: r.status, upstream_body: body, elapsed_ms: Date.now() - t0 });
  } catch (e) {
    return J({ driver: true, upstream_status: null, upstream_error: String(e).slice(0, 300), elapsed_ms: Date.now() - t0 }, 502);
  }
});
