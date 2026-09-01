// redirect-probe - QA ONLY. Exists solely so the moderation SSRF matrix can test the case
// that matters: a URL on an ALLOWLISTED origin that redirects OFF the allowlist.
//
// moderate-media fetches media with redirect:"manual" and refuses any 3xx. Without a real
// redirector, that branch is never exercised and the S5 probe only re-tests the origin
// check. This endpoint is that redirector.
//
// It reads nothing, writes nothing, and touches no KEEPITIL data. It returns a 302 to an
// off-allowlist host and nothing else. Safe to delete once moderation is verified:
//   npx supabase functions delete redirect-probe --project-ref ovmqtzjfpzrbzrlkxwgw
const OFF_ALLOWLIST = "https://example.com/off-allowlist.png";

Deno.serve((req) => {
  // A HEAD or GET both redirect; moderate-media issues GET.
  if (req.method !== "GET" && req.method !== "HEAD")
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" } });
  return new Response(null, {
    status: 302,
    headers: {
      Location: OFF_ALLOWLIST,
      // Declared as an image so that if the fetcher DID follow the redirect, it would sail
      // past a mime check - which is exactly the bypass the probe must prove is refused.
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
});
