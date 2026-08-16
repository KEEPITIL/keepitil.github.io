import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * Soft-404s on the query-string pages.
 *
 * Measured on the live site: event.html?e=<anything> and profile.html?slug=<anything> both
 * return HTTP 200 with a BYTE-IDENTICAL shell — 47423 bytes either way, a generic
 * "<title>Event — KEEPITIL</title>", and zero noindex. To a crawler that is one document
 * duplicated once per query string. Unknown PATHS 404 correctly; it is only these.
 *
 * A real 404 status is impossible on GitHub Pages, which always answers 200 for a static file.
 * The supported route for a JS-rendered page is a genuine not-found state plus an injected
 * noindex, which is read after render.
 */

const shell = readFileSync(new URL("../keepitil-shell.js", import.meta.url), "utf8");
const event = readFileSync(new URL("../event.html", import.meta.url), "utf8");
const profile = readFileSync(new URL("../profile.html", import.meta.url), "utf8");

/** Run the shell's helper against a stub DOM and report what it did. */
function runNotFound(opts = {}) {
  const start = shell.indexOf("window.KIL_NOT_FOUND = function");
  const end = shell.indexOf("window.KIL_FLOATING_FOR");
  assert.ok(start > 0 && end > start, "KIL_NOT_FOUND is missing from the shell");

  const created = [];
  const removed = [];
  const host = { innerHTML: "" };
  const win = {};
  const doc = {
    title: "Event — KEEPITIL",
    head: { appendChild: (m) => created.push(m) },
    body: host,
    querySelector: (sel) => {
      if (sel.includes("robots")) return null;
      if (sel.includes("canonical")) return { remove: () => removed.push("canonical") };
      return host;
    },
    createElement: () => ({ setAttribute(k, v) { this[k] = v; } })
  };
  new Function("window", "document", shell.slice(start, end))(win, doc);
  win.KIL_NOT_FOUND(opts);
  return { created, removed, doc, host };
}

// ── the crawler-facing half ────────────────────────────────────────────────────────────────

test("a not-found page is marked noindex", () => {
  const { created } = runNotFound({ what: "event" });
  const robots = created.find((m) => m.name === "robots");
  assert.ok(robots, "no robots meta — the thin duplicate stays in the index");
  assert.match(robots.content, /noindex/);
});

test("it is noindex,FOLLOW — links stay crawlable", () => {
  // A wrong URL should drop out of the index while still passing authority to the real pages
  // it links to. noindex,nofollow would strand that.
  const { created } = runNotFound({});
  const content = created.find((m) => m.name === "robots").content;
  // /follow/ alone is useless here: "nofollow" CONTAINS "follow", so the naive version passed
  // against noindex,nofollow. Assert the absence explicitly, then the presence.
  assert.ok(!/nofollow/.test(content), `links were made uncrawlable: ${content}`);
  assert.match(content, /\bfollow\b/);
});

test("the title stops being one more copy of the generic one", () => {
  const { doc } = runNotFound({ what: "event" });
  assert.notEqual(doc.title, "Event — KEEPITIL", "every bogus URL still shares one title");
  assert.match(doc.title, /Not found|isn/i);
});

test("a dead URL never stays canonical to itself", () => {
  const { removed } = runNotFound({});
  assert.ok(removed.includes("canonical"),
    "the canonical tag still points a nonexistent URL at itself");
});

// ── the reader-facing half ─────────────────────────────────────────────────────────────────

test("the page says what is missing and offers real routes out", () => {
  const { host } = runNotFound({ what: "event", links: [["/", "Explore"], ["/culture.html", "Culture"]] });
  assert.match(host.innerHTML, /isn/i, "no explanation rendered");
  assert.match(host.innerHTML, /href="\/"/);
  assert.match(host.innerHTML, /href="\/culture\.html"/);
});

test("the routes out are tappable — 44px minimum", () => {
  const { host } = runNotFound({});
  assert.match(host.innerHTML, /min-height:44px/);
});

// ── both pages actually call it ────────────────────────────────────────────────────────────

test("event.html renders not-found when the lookup returns no row", () => {
  const code = event.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(code, /if\(!\(r&&r\.data&&r\.data\[0\]\) && window\.KIL_NOT_FOUND\)/,
    "a missing event still renders the generic shell with HTTP 200");
});

test("profile.html renders not-found when the slug matches nothing", () => {
  const code = profile.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(code, /if\(PROFILE_SLUG && !\(r&&r\.data\) && window\.KIL_NOT_FOUND\)/);
});

test("the profile 404 is guarded on an explicit slug", () => {
  // The owner's own view arrives without a slug and is redirected elsewhere. Firing the
  // not-found state there would 404 people on their own profile.
  const code = profile.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(code, /PROFILE_SLUG &&[^\n]*KIL_NOT_FOUND/,
    "an empty slug would trigger a 404 on the owner's own page");
});

test("there is ONE implementation, in the shell", () => {
  // A copy per page drifts; this is the same reason the pager is one component.
  for (const [name, src] of [["event.html", event], ["profile.html", profile]]) {
    assert.ok(!/name="robots"[^>]*noindex/i.test(src),
      `${name} hand-rolls its own noindex instead of calling the shell helper`);
  }
  assert.match(shell, /window\.KIL_NOT_FOUND = function/);
});
