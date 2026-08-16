import assert from "node:assert/strict";
import test from "node:test";
import { statusFromHttp, planUpdate, oembedEndpoint, EMBED_STATUS } from "../scripts/health-check-media.mjs";

/**
 * §S5 — the embed health loop.
 *
 * The failure this guards against is a checker that can only ever say "active". Such a checker
 * passes every test that asserts a healthy post is healthy, reports 15/15 green forever, and
 * notices nothing when a post is deleted — which is the entire job.
 *
 * The second failure is the opposite: a transient provider fault marking real content 'deleted'
 * and pulling it off the site until a human puts it back. A 500 says nothing about the post.
 */

// ── it must be able to say something other than "active" ───────────────────────────────────

test("a live post is active", () => {
  assert.equal(statusFromHttp(200), "active");
});

test("a missing post is deleted, not active", () => {
  assert.equal(statusFromHttp(404), "deleted");
  assert.equal(statusFromHttp(410), "deleted");
});

test("embedding disabled by the owner is blocked — the post exists, we may not show it", () => {
  assert.equal(statusFromHttp(401), "blocked");
  assert.equal(statusFromHttp(403), "blocked");
});

test("a rejected URL is unavailable — that is our record being wrong, not the post being gone", () => {
  assert.equal(statusFromHttp(400), "unavailable");
});

test("the checker produces MORE than one outcome", () => {
  // The blunt version of the point: if every code maps to the same value, this loop is decorative.
  const outcomes = new Set([200, 400, 401, 403, 404, 410].map(statusFromHttp));
  assert.ok(outcomes.size >= 4, `only ${outcomes.size} distinct outcome(s) — the checker cannot discriminate`);
});

// ── a provider hiccup must not delete real content ─────────────────────────────────────────

test("5xx changes nothing", () => {
  assert.equal(statusFromHttp(500), null);
  assert.equal(statusFromHttp(503), null);
});

test("rate limiting changes nothing", () => {
  assert.equal(statusFromHttp(429), null);
});

test("a network failure changes nothing", () => {
  assert.equal(statusFromHttp(null), null);
});

test("a transient result LEAVES THE STORED STATUS ALONE rather than downgrading it", () => {
  const plan = planUpdate({ embed_status: "active" }, 500);
  assert.equal(plan.change, false);
  assert.equal(plan.status, "active", "a provider fault pulled live content off the site");
  assert.match(plan.reason, /transient/);
});

test("a network failure does not resurrect a dead post either", () => {
  const plan = planUpdate({ embed_status: "deleted" }, null);
  assert.equal(plan.change, false);
  assert.equal(plan.status, "deleted");
});

// ── recovery works in both directions ──────────────────────────────────────────────────────

test("a post that comes back is marked active again", () => {
  const plan = planUpdate({ embed_status: "deleted" }, 200);
  assert.equal(plan.change, true);
  assert.equal(plan.status, "active");
});

test("no change is reported when the status already matches", () => {
  const plan = planUpdate({ embed_status: "active" }, 200);
  assert.equal(plan.change, false);
  assert.equal(plan.status, "active");
});

// ── endpoints and the schema contract ──────────────────────────────────────────────────────

test("each provider gets its own oEmbed endpoint", () => {
  assert.match(oembedEndpoint("youtube", "https://www.youtube.com/watch?v=x"), /youtube\.com\/oembed/);
  assert.match(oembedEndpoint("tiktok", "https://www.tiktok.com/@a/photo/1"), /tiktok\.com\/oembed/);
  assert.equal(oembedEndpoint("instagram", "https://x"), null, "an unsupported provider must not be guessed at");
});

test("the source URL is encoded, not concatenated", () => {
  const u = oembedEndpoint("youtube", "https://www.youtube.com/watch?v=a&b=c");
  assert.ok(u.includes(encodeURIComponent("https://www.youtube.com/watch?v=a&b=c")));
});

test("every status this module can write is one the DB accepts", () => {
  const written = [200, 400, 401, 403, 404, 410].map(statusFromHttp).filter(Boolean);
  for (const v of written) assert.ok(EMBED_STATUS.includes(v), `writes "${v}", which the DB rejects`);
});
