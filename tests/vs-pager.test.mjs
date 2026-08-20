import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * §D5 — VS's six rail views become pager filters.
 *
 * The hole this closes: `.cul-vrail` is `display:none` with a `@media (min-width:861px)`
 * override, so the rail and every one of its six views were desktop-only. On a phone there was
 * no way to enter a competition, vote, or see winners — while the empty state read "Tap Join on
 * the rail", naming a control that did not exist there. 36 published competitions, 0 entries.
 * That was never a demand problem.
 */

/* /vs.html became a redirect stub when clean URLs shipped (Founder 2026-08-18); the VS page
   itself is /create/. Pointed at the real file — a guard that reads a 13-line stub passes or
   fails on nothing. KODE 2026-08-19. */
const vs = readFileSync(new URL("../create/index.html", import.meta.url), "utf8");
/** Comments stripped. A guard must not be satisfiable — or breakable — by prose about the guard:
 *  the first version of the "on the rail" check failed on the comments explaining the old copy. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const app = readFileSync(new URL("../vs-app.js", import.meta.url), "utf8");
const pager = readFileSync(new URL("../keepitil-pager.js", import.meta.url), "utf8");

/** The VIEWS table, evaluated out of the page. */
function views() {
  const start = vs.indexOf("var VIEWS=[");
  const end = vs.indexOf("];", start) + 2;
  assert.ok(start > 0, "the VS view table is gone");
  return new Function("return " + vs.slice(start + "var VIEWS=".length, end))();
}

// ── all six views exist, in the owner's order ──────────────────────────────────────────────

test("all six rail views are pager filters, in order", () => {
  assert.deepEqual(views().map((v) => v.label),
    ["FEED", "VOTE", "JOIN", "WINNERS", "MY VOTES", "MY ENTRY"]);
});

test("every view has a data source — none is a placeholder", () => {
  // A filter that mounts with no rpc renders an empty column that looks like "nothing here"
  // rather than "not built yet", which is the failure this whole day has been about.
  for (const v of views()) {
    assert.equal(typeof v.rpc, "function", `${v.label} has no data source`);
  }
});

// ── JOIN is not just the fourth swipe ──────────────────────────────────────────────────────

test("JOIN is marked primary and nothing else is", () => {
  const primary = views().filter((v) => v.primary).map((v) => v.id);
  assert.deepEqual(primary, ["join"],
    "JOIN is weighted identically to MY VOTES — the conversion path disappears in plain sight");
});

test("the pager renders a primary filter differently", () => {
  assert.match(pager, /kilp-primary/, "primary is declared but never rendered");
  assert.match(pager, /classList\.toggle\("kilp-primary",\s*!!this\.filters\[fi\]\.primary\)/);
});

test("the primary treatment is colour, not size — the header stays one word", () => {
  // Changing font-size on one filter shifts layout as you swipe onto it, and §I1 wants a
  // single stable word.
  const rule = pager.match(/#kilp\.kilp-primary \.kilp-title\{[^}]*\}/);
  assert.ok(rule, "no primary header rule");
  assert.ok(!/font-size/.test(rule[0]), "primary changes size — the header will jump on swipe");
});

// ── the empty state no longer names a control that does not exist ──────────────────────────

test("nothing anywhere still says 'on the rail'", () => {
  for (const [name, src] of [["vs.html", strip(vs)], ["vs-app.js", strip(app)]]) {
    assert.ok(!/on the rail/i.test(src),
      `${name} still points at the rail, which is display:none below 861px`);
  }
});

test("every empty state offers a route to JOIN rather than describing one", () => {
  // Slice to the FUNCTION DEFINITION, not the first mention — __vsGoJoin appears inside
  // emptyFor's button first, so indexOf ended the slice before the thing being asserted.
  const start = vs.indexOf("function emptyFor");
  const body = vs.slice(start, vs.indexOf("window.__vsGoJoin=function"));
  assert.match(body, /__vsGoJoin/, "the empty state describes the way in instead of being it");
});

test("the JOIN route works on BOTH breakpoints", () => {
  // Mobile has the pager, desktop still has the rail. A mobile-only fix would have repaired the
  // phone and broken the desktop in the same edit.
  const fn = vs.slice(vs.indexOf("window.__vsGoJoin=function"), vs.indexOf("function card("));
  assert.match(fn, /__kilPager/, "no pager route — mobile cannot reach JOIN");
  assert.match(fn, /window\.vsGo/, "no rail route — desktop cannot reach JOIN");
});

// ── the pager actually replaces the rail on mobile ─────────────────────────────────────────

test("the desktop rail is hidden once the pager mounts", () => {
  const mount = vs.slice(vs.indexOf("function mount()"), vs.indexOf("if(document.readyState"));
  assert.match(mount, /vsVRail/, "both the rail and the pager would be live at once");
});

test("the pager mounts on mobile only", () => {
  const mount = vs.slice(vs.indexOf("function mount()"), vs.indexOf("if(document.readyState"));
  assert.match(mount, /KIL_PAGER\.isMobile\(\)/,
    "mounting on desktop would replace a working rail with a phone interaction");
});

test("data is loaded before the pager mounts", () => {
  // Same shape as the Culture late-client bug: mounting against empty caches renders six empty
  // columns and looks exactly like having no competitions.
  const mount = vs.slice(vs.indexOf("function mount()"), vs.indexOf("if(document.readyState"));
  assert.match(mount, /Promise\.all\([\s\S]*?\)\.then\([\s\S]*?KIL_PAGER\.mount/,
    "the pager mounts before the RPCs resolve");
});

test("a failed RPC yields an empty column, not a thrown mount", () => {
  const load = vs.slice(vs.indexOf("function load("), vs.indexOf("var VIEWS="));
  assert.match(load, /catch\(/, "one failing view would take down all six");
  assert.match(load, /_err/, "a failure is swallowed with no trace of why");
});
