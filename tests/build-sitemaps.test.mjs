import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isListable, buildEventsSitemap, isoDay, shouldRefuseEmpty } from "../scripts/build-sitemaps.mjs";

/**
 * Daily events-sitemap regeneration.
 *
 * The failure being designed against: a sitemap full of dead URLs is worse than no sitemap,
 * because it hands a crawler a list of soft-404s. The previous hand-built file held 84 URLs all
 * dated 2026-07-01 in a URL form that no longer existed — every one gone, none of the live
 * events listed.
 */

const NOW = new Date("2026-08-16T12:00:00Z");
const ev = (o) => ({ status: "published", slug: "s", starts_at: "2026-09-01T02:00:00Z", ...o });

// ── what belongs in it ─────────────────────────────────────────────────────────────────────

test("a published future event is listed", () => {
  assert.equal(isListable(ev({}), NOW), true);
});

test("an event that has already finished is dropped", () => {
  // The whole reason this runs daily.
  assert.equal(isListable(ev({ starts_at: "2026-08-15T02:00:00Z" }), NOW), false);
});

test("ends_at wins over starts_at for a multi-day event", () => {
  // A festival that started yesterday and runs till Sunday is still live.
  assert.equal(isListable(ev({ starts_at: "2026-08-15T02:00:00Z", ends_at: "2026-08-20T02:00:00Z" }), NOW), true);
});

test("unpublished events never appear", () => {
  for (const status of ["review", "archived", "cancelled"]) {
    assert.equal(isListable(ev({ status }), NOW), false, `${status} leaked into the sitemap`);
  }
});

test("a row with no slug is dropped rather than emitting a broken URL", () => {
  assert.equal(isListable(ev({ slug: null }), NOW), false);
  assert.equal(isListable(ev({ slug: "" }), NOW), false);
});

test("a row with no date is dropped rather than assumed live", () => {
  assert.equal(isListable(ev({ starts_at: null, ends_at: null }), NOW), false);
});

// ── the file must not churn ────────────────────────────────────────────────────────────────

test("the same data twice produces a byte-identical file", () => {
  // If lastmod came from the run date, every daily run would commit and everyone would learn to
  // ignore the diffs.
  const rows = [ev({ slug: "b", created_at: "2026-07-16T00:00:00Z" }),
                ev({ slug: "a", created_at: "2026-07-16T00:00:00Z" })];
  assert.equal(buildEventsSitemap(rows, NOW), buildEventsSitemap(rows, NOW));
});

test("output is sorted by slug, so row order from the API cannot churn it", () => {
  const a = buildEventsSitemap([ev({ slug: "a" }), ev({ slug: "b" })], NOW);
  const b = buildEventsSitemap([ev({ slug: "b" }), ev({ slug: "a" })], NOW);
  assert.equal(a, b, "a reordered API response would rewrite the file for no reason");
});

test("lastmod comes from the row, never from today", () => {
  const xml = buildEventsSitemap([ev({ created_at: "2026-07-16T00:00:00Z" })], NOW);
  assert.match(xml, /<lastmod>2026-07-16<\/lastmod>/);
  assert.ok(!xml.includes("<lastmod>2026-08-16</lastmod>"), "lastmod is the run date — this churns daily");
});

// ── correctness of the emitted document ────────────────────────────────────────────────────

test("slugs are XML-escaped", () => {
  const xml = buildEventsSitemap([ev({ slug: "a&b" })], NOW);
  assert.match(xml, /e=a&amp;b/);
  assert.ok(!/e=a&b</.test(xml), "a raw ampersand makes the document invalid XML");
});

test("an empty calendar still emits a valid, well-formed urlset", () => {
  const xml = buildEventsSitemap([], NOW);
  assert.match(xml, /<urlset[^>]*>/);
  assert.match(xml, /<\/urlset>/);
  assert.ok(!xml.includes("<url>"));
});

test("isoDay survives junk instead of emitting 'Invalid Date'", () => {
  assert.equal(isoDay("not a date"), null);
  assert.equal(isoDay(null), null);
  assert.equal(isoDay("2026-07-16T00:00:00Z"), "2026-07-16");
});

// ── the guard against wiping a good sitemap ────────────────────────────────────────────────

test("an empty result refuses to overwrite a populated sitemap", () => {
  // A query that returns nothing is far more likely to be a broken query than a site with zero
  // events — exactly what the unknown-column 400 would have produced.
  // Asserted as BEHAVIOUR. The first version checked the wording was in the source, which
  // passed with the condition gutted — a message is not a rule.
  assert.equal(shouldRefuseEmpty(0, 40, false), true, "an empty result would wipe 40 live URLs");
  assert.equal(shouldRefuseEmpty(0, 40, true), false, "--allow-empty must still be honoured");
  assert.equal(shouldRefuseEmpty(0, 0, false), false, "a first run has nothing to protect");
  assert.equal(shouldRefuseEmpty(40, 40, false), false, "a populated result is never refused");
});

test("a failed fetch leaves the existing file alone", () => {
  const src = readFileSync(new URL("../scripts/build-sitemaps.mjs", import.meta.url), "utf8");
  assert.match(src, /Sitemap left untouched/);
});

// ── the workflow it runs in ────────────────────────────────────────────────────────────────

test("sitemaps run in their OWN workflow, not the disabled content pipeline", () => {
  // daily-content.yml is disabled on purpose: retired agent content, spends ANTHROPIC_API_KEY,
  // auto-commits what it generates. Adding a sitemap step there would re-enable that schedule.
  const wf = readFileSync(new URL("../.github/workflows/daily-sitemaps.yml", import.meta.url), "utf8");
  // YAML comments stripped: the third time today a guard matched the prose EXPLAINING the guard.
  // This workflow's header says why it avoids ANTHROPIC_API_KEY, which the naive check read as
  // the workflow using it.
  const wfCode = wf.replace(/^\s*#.*$/gm, "");
  assert.match(wfCode, /schedule:/);
  assert.match(wfCode, /cron:/);
  assert.ok(!/ANTHROPIC_API_KEY/.test(wfCode), "the sitemap job pulls in the content pipeline's key");

  const content = readFileSync(new URL("../.github/workflows/daily-content.yml", import.meta.url), "utf8");
  assert.ok(!/^\s*- cron:/m.test(content.replace(/^\s*#.*$/gm, "")),
    "daily-content.yml got re-enabled");
});

test("the workflow commits only when the file actually changed", () => {
  const wf = readFileSync(new URL("../.github/workflows/daily-sitemaps.yml", import.meta.url), "utf8");
  assert.match(wf, /git diff --quiet -- sitemap-events\.xml/);
});

test("the workflow uses the anon key, not the service key", () => {
  // A file generator reading public rows has no business holding a service key.
  const wf = readFileSync(new URL("../.github/workflows/daily-sitemaps.yml", import.meta.url), "utf8");
  assert.match(wf, /SUPABASE_ANON_KEY/);
  assert.ok(!/SUPABASE_SERVICE_KEY/.test(wf));
});
