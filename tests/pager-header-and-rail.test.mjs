import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * §I — the directional filter header and the per-kind action rail.
 *
 * WHY THESE TESTS ARE SHAPED LIKE THIS
 * ------------------------------------
 * The dangerous test here is one that passes whether or not the header hides. Asserting "a
 * .kilp-head-hidden class exists in the stylesheet" is exactly that: it passes against an
 * implementation that never adds the class, and against one that adds it on a scroll-position
 * threshold rather than a gesture direction — which §I1 explicitly forbids, because a position
 * threshold re-shows the header at the top of every item and the feature silently does nothing.
 *
 * So the rules are exported as pure functions and exercised as logic. The load-bearing test is
 * "repeated next-item swipes leave the header hidden", which a position implementation fails and
 * a direction implementation passes. Everything structural is secondary to that.
 */

const src = readFileSync(new URL("../keepitil-pager.js", import.meta.url), "utf8");

/**
 * The stylesheet is built from an array of string fragments, so a single CSS rule is routinely
 * split across two array elements. Matching rules against the raw source truncates at the first
 * quote and silently tests half a rule. Reconstruct what the browser actually receives.
 */
const css = (() => {
  const start = src.indexOf("s.textContent = [");
  const end = src.indexOf("].join(\"\")", start);
  return src.slice(start, end).split("\n")
    .map((l) => { const m = l.match(/^\s*"((?:[^"\\]|\\.)*)",?\s*$/); return m ? m[1] : ""; })
    .join("");
})();

/** Code with comments stripped. A guard must not be satisfiable by prose describing the guard. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Load the browser IIFE against a stub global and hand back its public object. */
function loadPager(overrides = {}) {
  const win = {
    matchMedia: () => ({ matches: true }),
    ...overrides
  };
  const doc = {
    getElementById: () => null,
    createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }),
    head: { appendChild() {} },
    body: { classList: { add() {}, remove() {}, contains: () => true } },
    addEventListener() {}
  };
  new Function("window", "document", src)(win, doc);
  return win;
}

const P = loadPager().KIL_PAGER;
const nextVisible = P._nextHeaderVisible;
const dirOf = P._gestureDir;

// ── §I1 the direction rules ────────────────────────────────────────────────────────────────

test("swiping content up hides the header", () => {
  assert.equal(nextVisible(true, "up"), false);
});

test("swiping down brings it back", () => {
  assert.equal(nextVisible(false, "down"), true);
});

test("a filter swipe — either direction — brings it back", () => {
  assert.equal(nextVisible(false, "left"), true);
  assert.equal(nextVisible(false, "right"), true);
});

test("an unrecognised gesture leaves the header alone", () => {
  // A smudge must not toggle chrome.
  assert.equal(nextVisible(true, null), true);
  assert.equal(nextVisible(false, null), false);
  assert.equal(nextVisible(false, "diagonal"), false);
});

// ── the load-bearing one ───────────────────────────────────────────────────────────────────

test("HIDDEN STAYS HIDDEN across repeated next-item swipes", () => {
  // This is the test a scroll-position implementation fails. Every up-swipe lands at the top of
  // the next item, so a "show when scrollTop is near zero" rule would re-show the header here,
  // every single time, and the header would effectively never hide.
  let visible = true;
  for (let i = 0; i < 5; i++) visible = nextVisible(visible, "up");
  assert.equal(visible, false, "the header re-appeared while paging through items");
});

test("the full gesture story: hide, stay hidden, restore, hide again", () => {
  let v = true;
  v = nextVisible(v, "up");    assert.equal(v, false, "first up-swipe should hide");
  v = nextVisible(v, "up");    assert.equal(v, false, "still hidden");
  v = nextVisible(v, "down");  assert.equal(v, true,  "swipe down restores");
  v = nextVisible(v, "up");    assert.equal(v, false, "hides again");
  v = nextVisible(v, "left");  assert.equal(v, true,  "filter change restores");
});

test("the header rule reads no scroll position at all", () => {
  // Direction, not position (§I1). If the implementation starts consulting scrollTop, the rule
  // has changed even if the assertions above still pass for some inputs.
  const fn = nextVisible.toString();
  assert.ok(!/scrollTop|scrollY|pageYOffset|getBoundingClientRect/.test(fn),
    "the header decision consults scroll position — §I1 forbids a position threshold");
});

// ── gesture classification ─────────────────────────────────────────────────────────────────

test("a tap's jitter is not a swipe", () => {
  assert.equal(dirOf(3, -5), null);
  assert.equal(dirOf(0, 0), null);
});

test("the dominant axis wins", () => {
  assert.equal(dirOf(-90, -20), "left");
  assert.equal(dirOf(90, 20), "right");
  assert.equal(dirOf(-20, -90), "up");
  assert.equal(dirOf(10, 90), "down");
});

test("a mostly-vertical drag with some horizontal drift still reads as vertical", () => {
  // Real thumbs are not straight. A drift-sensitive rule would fire filter changes constantly.
  assert.equal(dirOf(28, -140), "up");
});

// ── §I3 the rail is configuration ──────────────────────────────────────────────────────────

test("different kinds get different actions", () => {
  // The whole point of §I3: a VIDEO and an ARTICLE do not want the same rail.
  const video = P._railFor("video").map((a) => a.id);
  const article = P._railFor("article").map((a) => a.id);
  assert.notDeepEqual(video, article, "every kind renders the same rail — it is hardcoded");
  assert.ok(video.includes("reshare"));
  assert.ok(!article.includes("comment"), "an article should not offer an empty comment thread");
});

test("an unknown kind still gets actions rather than nothing", () => {
  const rail = P._railFor("something-new-next-quarter");
  assert.ok(Array.isArray(rail) && rail.length > 0, "a new kind must never be actionless");
});

test("the rail is DATA — replacing the table replaces the rail", () => {
  // If this fails, the table is decorative and the actions are really hardcoded in the pager.
  const win = loadPager({ KIL_RAIL: { video: [{ id: "only-this", label: "Only" }], DEFAULT: [] } });
  assert.deepEqual(win.KIL_RAIL_FOR("video").map((a) => a.id), ["only-this"]);
});

test("kind lookup is case-insensitive", () => {
  assert.deepEqual(P._railFor("VIDEO").map((a) => a.id), P._railFor("video").map((a) => a.id));
});

// ── §I1/§I2 structure ──────────────────────────────────────────────────────────────────────

test("a filter change always restores the header, whatever caused it", () => {
  // Swipe, stepper button and arrow key all route through setFilter, so it is asserted there.
  const setFilter = src.slice(src.indexOf("Pager.prototype.setFilter"), src.indexOf("Pager.prototype.unmountColumn"));
  assert.match(setFilter, /this\.setHeaderVisible\(true\)/,
    "changing filter while the header is hidden leaves the reader on an unlabelled screen");
});

test("hiding the header removes it from the tab order, not just the screen", () => {
  const fn = src.slice(src.indexOf("Pager.prototype.setHeaderVisible"), src.indexOf("Pager.prototype.renderColumn"));
  assert.match(fn, /aria-hidden/);
  assert.match(fn, /tabIndex/);
});

test("the gesture listeners are passive and hijack nothing", () => {
  // Checked against COMMENT-STRIPPED code. The first version of this test failed on the comment
  // that says "Nothing is preventDefault'ed" — a guard a piece of prose could satisfy or break
  // is not a guard.
  const build = code.slice(code.indexOf("root.addEventListener(\"touchstart\""), code.indexOf("this.headerVisible = true"));
  assert.match(code, /addEventListener\("touchstart"[\s\S]{0,80}passive:\s*true/);
  assert.match(code, /addEventListener\("touchend"[\s\S]{0,80}passive:\s*true/);
  const gestureCode = code.slice(code.indexOf("this._ts = function"), code.indexOf("this.headerVisible = true"));
  assert.ok(!/preventDefault/.test(gestureCode), "§A forbids intercepting the scroll");
});

test("reduced motion cuts instead of sliding — it still hides", () => {
  assert.match(css, /prefers-reduced-motion:reduce\)\{#kilp \.kilp-head\{transition:none\}/);
  // The hide itself must NOT live inside the motion query, or reduced-motion users lose §I1
  // entirely rather than just losing the animation.
  const hide = css.match(/#kilp\.kilp-head-hidden \.kilp-head\{[^}]*\}/);
  assert.ok(hide, "no hidden-state rule at all");
  assert.match(hide[0], /transform:translateY\(-120%\)/);
  // Strip every reduced-motion block and the hide must SURVIVE. The earlier version of this
  // check sliced from the first "prefers-reduced-motion" match and scanned 120 chars, which
  // missed the mutation entirely: wrapping the hidden rule in a media query changes the
  // selector to `#kilp.kilp-head-hidden` (no space), so the slice landed on a different block
  // and the guard passed against a broken implementation.
  const withoutRM = css.replace(/@media\(prefers-reduced-motion:reduce\)\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
  assert.match(withoutRM, /#kilp\.kilp-head-hidden \.kilp-head\{/,
    "the hide is gated behind prefers-reduced-motion — those users lose the feature, not just the animation");
});

test("§I2 — the slide is full-bleed, the header does not displace content", () => {
  const slide = css.match(/#kilp \.kilp-slide\{[^}]*\}/)[0];
  assert.ok(!/padding:64px/.test(slide), "the header letterbox is back — content is displaced again");
  assert.match(css, /--kilp-safe-top/, "adapters need an inset token or they will re-add padding");
});

test("the header carries the top safe-area inset — M1 is not superseded", () => {
  const head = css.match(/#kilp \.kilp-head\{[^}]*\}/)[0];
  assert.match(head, /env\(safe-area-inset-top/);
});

test("the visible header is one word — the count is for assistive tech only", () => {
  const count = css.match(/#kilp \.kilp-count\{[^}]*\}/)[0];
  assert.match(count, /clip-path:inset\(50%\)/, "the count is visible — the header is not one word");
});

// ── §L (§19) — the open-on-platform action is a rights obligation ───────────────────────────

test("kinds that carry third-party media offer an open-on-platform action", () => {
  // §L: creator attribution, source platform, source URL, open-on-platform action. The first
  // three are columns; this is the one that lives in the UI, so it is the one that can be
  // removed by a layout tidy-up without anyone noticing it was load-bearing.
  const video = P._railFor("video").map((a) => a.id);
  assert.ok(video.includes("open"),
    "no way to reach the original — KEEPITIL is embedding public content and must not imply ownership");
});

test("the open action names the platform rather than saying 'link'", () => {
  const open = P._railFor("video").find((a) => a.id === "open");
  assert.ok(/watch on|source|platform/i.test(open.label),
    `unhelpful label: ${open.label}`);
});
