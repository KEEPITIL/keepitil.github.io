import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * §H1 — the app cold-starts on the router.
 *
 * On GitHub Pages a real server hands 404.html every unmatched path, so location.pathname is a
 * site path and the clean-URL map is meaningful. The app bundle has no server: the WebView opens
 * capacitor:// or file://, where pathname is a filesystem path that means nothing to that map.
 * The router would "resolve" a clean URL, replace into a file the bundle lacks, land back here
 * and resolve again — the first screen a user sees being an error page they cannot leave.
 *
 * This exercises the SHIPPED guard, lifted out of 404.html, against each scheme. It does not
 * replace launching the built app — it proves the decision, not the integration.
 */

const html = readFileSync(new URL("../404.html", import.meta.url), "utf8");

/** Pull the guard out of the router IIFE and run it against a fake window. */
function runGuard({ protocol, pathname, storage = {} }) {
  const start = html.indexOf("var httpish");
  const end = html.indexOf("var p = location.pathname");
  assert.ok(start > 0 && end > start, "the §H1 scheme guard is missing from 404.html");
  const body = html.slice(start, end);

  const calls = [];
  const location = {
    protocol, pathname,
    replace: (url) => { calls.push(url); }
  };
  const sessionStorage = {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  };
  // `return` inside the guard needs a function body to live in.
  new Function("location", "sessionStorage", body + "\nreturn null;")(location, sessionStorage);
  return { replaced: calls, storage };
}

// ── the app schemes ───────────────────────────────────────────────────────────────────────

test("capacitor:// goes straight to the entry file, skipping clean-URL mapping", () => {
  const { replaced } = runGuard({ protocol: "capacitor:", pathname: "/culture" });
  assert.deepEqual(replaced, ["index.html"]);
});

test("file:// does the same", () => {
  const { replaced } = runGuard({ protocol: "file:", pathname: "/Users/x/www/some/deep/path" });
  assert.deepEqual(replaced, ["index.html"]);
});

test("the redirect is RELATIVE — a leading slash is not the bundle root", () => {
  const { replaced } = runGuard({ protocol: "capacitor:", pathname: "/event/foo" });
  assert.equal(replaced[0], "index.html");
  assert.ok(!replaced[0].startsWith("/"), "an absolute path resolves outside the bundle");
});

// ── the loop guards ───────────────────────────────────────────────────────────────────────

test("already on the entry file: do nothing rather than replace forever", () => {
  // The brick case. Replacing to index.html from index.html is an infinite bounce.
  const { replaced } = runGuard({ protocol: "capacitor:", pathname: "/index.html" });
  assert.deepEqual(replaced, []);
});

test("a second pass in the same session does not replace again", () => {
  const storage = {};
  const first = runGuard({ protocol: "capacitor:", pathname: "/culture", storage });
  assert.deepEqual(first.replaced, ["index.html"]);
  // Landing back here — because the bundle lacked the target — must not start a loop.
  const second = runGuard({ protocol: "capacitor:", pathname: "/culture", storage });
  assert.deepEqual(second.replaced, [], "a bounce loop here bricks the app");
});

test("a missing sessionStorage does not break the guard", () => {
  // Private mode and some WebView configurations throw on storage access.
  const start = html.indexOf("var httpish");
  const end = html.indexOf("var p = location.pathname");
  const body = html.slice(start, end);
  const calls = [];
  const location = { protocol: "capacitor:", pathname: "/culture", replace: (u) => calls.push(u) };
  const hostile = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
  new Function("location", "sessionStorage", body + "\nreturn null;")(location, hostile);
  assert.deepEqual(calls, ["index.html"], "storage failure must not stop the recovery");
});

// ── the web is untouched ──────────────────────────────────────────────────────────────────

test("https falls through to the clean-URL router, unchanged", () => {
  const { replaced } = runGuard({ protocol: "https:", pathname: "/culture" });
  assert.deepEqual(replaced, [], "the guard must not fire on the web");
});

test("http falls through too", () => {
  const { replaced } = runGuard({ protocol: "http:", pathname: "/radio" });
  assert.deepEqual(replaced, []);
});

test("returning to the web clears the one-shot flag", () => {
  const storage = { kil404_entry: "1" };
  runGuard({ protocol: "https:", pathname: "/culture", storage });
  assert.ok(!("kil404_entry" in storage), "a stale flag would disable the guard on the next cold start");
});

// ── §H2 and the surrounding contract ──────────────────────────────────────────────────────

test("no JSON escapes survive as literal text", () => {
  const withoutScripts = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const escapes = withoutScripts.match(/\\u[0-9a-fA-F]{4}/g) ?? [];
  assert.deepEqual(escapes, [], `literal escapes rendered to the reader: ${escapes.join(", ")}`);
});

test("the developer note reads as prose", () => {
  assert.match(html, /this file is the site’s URL router/);
  assert.match(html, /Do not delete it — every clean URL depends on it/);
});
