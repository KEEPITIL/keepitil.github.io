import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync, readdirSync } from "node:fs";

/**
 * The homepage events calendar — load state and its dependencies.
 *
 * On 2026-08-15 the app cold-started with no events at all: hero animating, nav correct, and an
 * empty calendar. Nothing was logged and nothing was on screen, because three separate decisions
 * lined up badly:
 *
 *   1. `var EVENTS=[]` — the scraped list was removed on 2026-07-21, so there is no baked data.
 *      Every event comes from the network.
 *   2. supabase-js was fetched from cdn.jsdelivr.net at cold start, adding a second external hop
 *      to a bundle whose entire purpose (server.url was removed on 2026-08-10) is to work offline.
 *   3. The failure paths were `if(window.supabase){...}else{boot2()}` and `.catch(boot2)` — both
 *      of which render the empty calendar. A dead network and an empty database produced
 *      byte-identical output.
 *
 * A comment above the fetch claimed the baked list was an "instant-paint + offline fallback"
 * that survived a failed fetch. It described an empty array. That false comment is why the first
 * pass of the investigation ruled out the fetch and went looking at CSS instead.
 *
 * These tests guard the fix, not the prose. Each one fails if its specific defect returns.
 */

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");

/** The whole load-state machine: evxState, evxFail and loadEvents, through to the end of the block. */
function eventsBlock() {
  const start = html.indexOf("function evxState");
  assert.ok(start > 0, "evxState() is gone — the load-state machine has been removed");
  assert.ok(html.indexOf("function loadEvents()") > start,
    "loadEvents() is gone — the events fetch has been restructured");
  return html.slice(start, html.indexOf("</script>", start));
}

// ── 1. no CDN hop ─────────────────────────────────────────────────────────────────────────

test("supabase-js is self-hosted, not fetched from a CDN", () => {
  assert.ok(
    !/cdn\.jsdelivr\.net\/npm\/@supabase/.test(html),
    "a CDN round-trip at cold start defeats the point of bundling the site"
  );
  /* ⚠ REPOINTED 2026-09-01: the vendored library moved to /assets/js/vendor/ in the asset
     migration; this still asserted the /v3 path deleted in the August purge. */
  assert.match(html, /src="\/assets\/js\/vendor\/supabase-js\.min\.js"/);
});

test("the vendored library is actually present and is the UMD build", () => {
  const lib = new URL("assets/js/vendor/supabase-js.min.js", root);
  assert.ok(existsSync(lib), "the script tag points at a file that does not exist");
  const src = readFileSync(lib, "utf8");
  assert.ok(src.length > 100_000, "suspiciously small — probably an error page, not the library");
  assert.match(
    src.slice(0, 400),
    /supabase=/,
    "this build does not assign the global `supabase` the page reads"
  );
});

test("nothing customer-facing still reaches for the CDN copy", () => {
  // Catches a half-done migration: one file left on jsdelivr is one screen that breaks offline.
  //
  // .js is scanned as well as .html, and that is not hypothetical — the first pass of this
  // migration rewrote the 29 HTML pages and missed keepitil-shell.js, which injects the library
  // at runtime and loads on all 29 of them. An HTML-only audit reported a clean sweep.
  //
  // kode/ is a separate product on its own Supabase project; _tmp/ is a backup. Both are
  // deliberately out of scope.
  const skip = new Set([".git", "_tmp", "kode", "node_modules", "tests", "games"]);
  const offenders = [];
  const walk = (dir, rel = "") => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const next = new URL(`${e.name}${e.isDirectory() ? "/" : ""}`, dir);
      if (e.isDirectory()) walk(next, `${rel}${e.name}/`);
      else if (e.name.endsWith(".html") || e.name.endsWith(".js")) {
        if (/cdn\.jsdelivr\.net\/npm\/@supabase/.test(readFileSync(next, "utf8"))) {
          offenders.push(rel + e.name);
        }
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], `still loading supabase-js from the CDN:\n${offenders.join("\n")}`);
});

// ── 2. three distinguishable outcomes ─────────────────────────────────────────────────────

test("the load has three distinct states, not two", () => {
  const b = eventsBlock();
  for (const s of ["'ok'", "'empty'", "'failed'"]) {
    assert.ok(b.includes(s), `state ${s} is missing — outcomes have been collapsed again`);
  }
});

test("an empty result and a failed request render different text", () => {
  const b = html.slice(html.indexOf("function evxState"), html.indexOf("function mapRows"));
  assert.match(b, /No published events right now/);
  assert.match(b, /Events couldn.t load/);
});

test("a failed load offers a retry; an empty one does not", () => {
  const b = html.slice(html.indexOf("function evxState"), html.indexOf("function mapRows"));
  const empty = b.slice(b.indexOf("state==='empty'"), b.indexOf("el.innerHTML='<span class=\"evx-state-t\">Events"));
  assert.ok(!empty.includes("evx-state-retry"), "retrying an empty calendar just re-reads the same nothing");
  // Assert the button is BUILT with that id — matching the getElementById lookup instead lets a
  // renamed/removed button pass, which is exactly what an earlier version of this test did.
  assert.match(b, /id="evx-state-retry"/, "a failed load with no way to recover is a dead end");
  assert.match(b, /b\.onclick\s*=\s*function\(\)\{[^}]*loadEvents\(\)/,
    "the retry control must actually re-run the fetch");
});

test("an API error is checked, not just the row count", () => {
  // postgrest-js RESOLVES on an API error. Reading only r.data.length reports a 500 as "empty".
  // Anchored on `if(` — a bare /r&&r\.error/ also matches inside `(r.error&&r.error.message)`,
  // so the unanchored version passed even with the guard deleted.
  assert.match(eventsBlock(), /if\(r\s*&&\s*r\.error\)/,
    "r.error is unchecked — an API error reads as an empty calendar");
});

test("failure clears the calendar rather than leaving a half-rendered one", () => {
  assert.match(html, /function evxFail\(detail\)\{\s*EVENTS=\[\];\s*MONTHS=\[\];/);
});

test("the retry keeps the panel visible instead of blanking the page", () => {
  // Hiding the panel during a retry reproduces the original symptom for the length of a timeout.
  const b = html.slice(html.indexOf("if(state==='loading')"), html.indexOf("function mapRows"));
  assert.match(b, /Checking for events/, "a retry that blanks the screen looks exactly like the bug");
});

test("network errors are translated on BOTH failure paths", () => {
  // The first fix translated only inside .catch(); postgrest-js routes network errors through
  // r.error instead, so the raw "TypeError: Failed to fetch" leaked to the reader.
  assert.match(html, /function evxReason/);
  assert.match(html, /evxState\('failed',evxReason\(detail\)\)/,
    "evxFail must translate, or the r.error path bypasses the translation");
});

// ── 3. the comment tells the truth ────────────────────────────────────────────────────────

test("nothing claims a baked offline fallback exists", () => {
  const b = html.slice(html.indexOf("SINGLE SOURCE = SUPABASE"), html.indexOf("function evxState"));
  assert.ok(
    !/instant-paint \+ offline fallback/.test(b),
    "the false fallback claim is back — it cost a debugging session on 2026-08-15"
  );
  assert.match(b, /THERE IS NO BAKED FALLBACK/);
});

test("EVENTS is still empty, so the comment above it stays accurate", () => {
  // If someone bakes a real list later, this test should be updated deliberately — that is the point.
  assert.match(html, /var EVENTS=\[\];/);
});
