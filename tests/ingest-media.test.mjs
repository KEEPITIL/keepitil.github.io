import assert from "node:assert/strict";
import test from "node:test";
import {
  parseYouTubeFeed, tiktokKindFromUrl, reconcileKind, tiktokRecord,
  mergeForUpsert, REFRESHABLE, YOUTUBE_FEED, EMBED_STATUS,
  attributionComplete, ATTRIBUTION_REQUIRED, openOnPlatform, platformLabel, sourceRecord
} from "../scripts/ingest-media.mjs";
import { readFileSync } from "node:fs";

/**
 * §J — VIDEO and PIXLE ingestion.
 *
 * The rule these tests exist to protect: PIXLE and VIDEO must not show each other's content.
 * Everything else here is secondary to media_kind being right, and to a re-run never undoing a
 * review decision.
 */

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <title>KEEPITIL</title>
  <entry>
    <yt:videoId>abc123</yt:videoId>
    <title>Raving Animals</title>
    <author><name>KEEPITIL</name><uri>https://www.youtube.com/@keepitil</uri></author>
    <published>2026-03-13T10:00:00+00:00</published>
    <media:group>
      <media:title>Raving Animals</media:title>
      <media:thumbnail url="https://i.ytimg.com/vi/abc123/hqdefault.jpg" width="480" height="360"/>
    </media:group>
  </entry>
  <entry>
    <yt:videoId>def456</yt:videoId>
    <title>Quack &amp; Woof</title>
    <author><name>KEEPITIL</name><uri>https://www.youtube.com/@keepitil</uri></author>
    <published>2026-01-04T10:00:00+00:00</published>
    <media:group><media:title>Quack &amp; Woof</media:title></media:group>
  </entry>
</feed>`;

// ── the boundary that matters ──────────────────────────────────────────────────────────────

test("every YouTube record is media_kind=video — VIDEO never carries a photo", () => {
  const rows = parseYouTubeFeed(FEED);
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.media_kind === "video"), "a YouTube row escaped as a photo");
});

test("a TikTok /photo/ URL is a photo and a /video/ URL is a video", () => {
  assert.equal(tiktokKindFromUrl("https://www.tiktok.com/@keepitil/photo/7300000000000000001").kind, "photo");
  assert.equal(tiktokKindFromUrl("https://www.tiktok.com/@keepitil/video/7300000000000000002").kind, "video");
});

test("a photo post never lands in VIDEO, whatever oEmbed says about it", () => {
  // The URL path is the authority: TikTok 400s a /photo/ URL carrying a video id, so a URL that
  // resolved has already been type-checked by TikTok itself.
  const rec = tiktokRecord("https://www.tiktok.com/@keepitil/photo/7300000000000000001",
    { embed_type: "video", title: "t" });
  assert.equal(rec.media_kind, "photo", "oEmbed overrode the URL and put a photo into VIDEO");
  assert.equal(rec._conflict, true, "a real disagreement must be escalated, not silently resolved");
});

test("an absent or unfamiliar oEmbed kind is NOT treated as a conflict", () => {
  // Expected for photo posts: I could not verify what TikTok returns for Photo Mode, so an
  // unrecognised value must not flood the review queue with false conflicts.
  assert.equal(reconcileKind("photo", undefined).conflict, false);
  assert.equal(reconcileKind("photo", "").conflict, false);
  assert.equal(reconcileKind("photo", "image_carousel").conflict, false);
  assert.equal(reconcileKind("photo", "image_carousel").kind, "photo");
});

test("agreement is agreement", () => {
  assert.deepEqual(reconcileKind("video", "video"), { kind: "video", conflict: false, reason: "agreed" });
});

test("a non-TikTok URL yields no kind and is flagged, not defaulted", () => {
  assert.equal(tiktokKindFromUrl("https://example.com/whatever").kind, null);
  assert.equal(reconcileKind(null, "video").conflict, true);
});

// ── re-runs must not undo human decisions ──────────────────────────────────────────────────

test("a re-run NEVER rewrites review_status", () => {
  // The review queue is worthless if the next cron tick resets it, and rejected content would
  // quietly republish itself.
  assert.ok(!REFRESHABLE.includes("review_status"));
  const merged = mergeForUpsert(
    { id: "u1", provider: "youtube", external_id: "abc123", review_status: "approved" },
    { title: "new title", review_status: "review", source_url: "https://x" }
  );
  assert.equal(merged.review_status, undefined, "ingestion reset a review decision");
  assert.equal(merged.title, "new title", "volatile fields should still refresh");
});

test("a NEW record always starts in review", () => {
  const merged = mergeForUpsert(null, { provider: "youtube", external_id: "n1", title: "t" });
  assert.equal(merged.review_status, "review", "content would publish without ever being reviewed");
});

test("a refresh does not null out fields the source omitted this time", () => {
  const merged = mergeForUpsert(
    { id: "u1", provider: "youtube", external_id: "abc123" },
    { title: "kept", thumbnail_url: null, source_url: "https://x" }
  );
  assert.equal(merged.title, "kept");
  assert.ok(!("thumbnail_url" in merged), "a missing field wiped stored data");
});

// ── feed parsing ───────────────────────────────────────────────────────────────────────────

test("entries map to the record shape the table expects", () => {
  const [r] = parseYouTubeFeed(FEED);
  assert.equal(r.provider, "youtube");
  assert.equal(r.external_id, "abc123");
  assert.equal(r.title, "Raving Animals");
  assert.equal(r.creator_name, "KEEPITIL");
  assert.equal(r.source_url, "https://www.youtube.com/watch?v=abc123");
  assert.equal(r.embed_url, "https://www.youtube.com/embed/abc123");
  assert.equal(r.thumbnail_url, "https://i.ytimg.com/vi/abc123/hqdefault.jpg");
  assert.match(r.published_at, /^2026-03-13T/);
});

test("XML entities are decoded, not passed through as &amp;", () => {
  const rows = parseYouTubeFeed(FEED);
  assert.equal(rows[1].title, "Quack & Woof");
});

test("an entry with no videoId is dropped rather than written as a broken row", () => {
  const rows = parseYouTubeFeed("<feed><entry><title>no id</title></entry></feed>");
  assert.deepEqual(rows, []);
});

test("an empty or junk feed yields nothing rather than throwing", () => {
  assert.deepEqual(parseYouTubeFeed(""), []);
  assert.deepEqual(parseYouTubeFeed("<html>bot check</html>"), []);
});

test("the feed URL points at the confirmed @keepitil channel", () => {
  assert.match(YOUTUBE_FEED(), /channel_id=UC-gWqozXipPMT2VjcwJOLbw/);
});

// ── the schema and the script must not drift ───────────────────────────────────────────────

test("every embed_status the script writes is one the DB accepts", () => {
  // The first version wrote "ok", which is not in the check constraint. Every insert failed on
  // the constraint — a cron run would have produced a wall of errors and zero rows, and the tab
  // would have stayed empty for a reason nobody was looking at.
  const src = readFileSync(new URL("../scripts/ingest-media.mjs", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
  const written = [...code.matchAll(/embed_status\s*=\s*"([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(written.length > 0, "no embed_status is set anywhere");
  for (const v of written) {
    assert.ok(EMBED_STATUS.includes(v), `script writes embed_status="${v}", which the DB rejects`);
  }
});

test("the documented status list matches the database's constraint", () => {
  // Checked against the live constraint on 2026-08-15:
  //   CHECK (embed_status = ANY (ARRAY['active','blocked','deleted','unavailable','needs_review']))
  assert.deepEqual([...EMBED_STATUS].sort(),
    ["active", "blocked", "deleted", "needs_review", "unavailable"]);
});

// ── §L (§19) — SOURCE AND RIGHTS ───────────────────────────────────────────────────────────
//
// "KEEPITIL is curating and embedding public content. Do not imply ownership."
// Maintain creator attribution, source platform, source URL, open-on-platform action.
// For own_content=false these are required, not garnish.

test("a third-party row without creator, platform or source URL is incomplete", () => {
  const r = attributionComplete({ own_content: false, creator_name: "", provider: "", source_url: "" });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.sort(), ["creator_name", "provider", "source_url"]);
});

test("a complete third-party row passes", () => {
  assert.equal(attributionComplete({
    own_content: false, creator_name: "Boiler Room", provider: "youtube",
    source_url: "https://www.youtube.com/watch?v=x"
  }).ok, true);
});

test("MISSING own_content is treated as third-party — fail toward giving credit", () => {
  // The whole point of the false default. A row that forgot the flag must be held to the full
  // attribution rule, never waved through as if KEEPITIL made it.
  const r = attributionComplete({ creator_name: "", provider: "youtube", source_url: "https://x" });
  assert.equal(r.ok, false, "an unflagged row skipped attribution — that is stripped credit");
  assert.ok(r.missing.includes("creator_name"));
});

test("only an explicit own_content===true is exempt", () => {
  assert.equal(attributionComplete({ own_content: true }).ok, true);
  for (const truthy of ["true", 1, "yes"]) {
    assert.equal(attributionComplete({ own_content: truthy }).ok, false,
      `own_content=${JSON.stringify(truthy)} was accepted as ours — only real true may exempt`);
  }
});

test("the open-on-platform action points at the source, named by platform", () => {
  const a = openOnPlatform({ provider: "youtube", source_url: "https://www.youtube.com/watch?v=x" });
  assert.equal(a.href, "https://www.youtube.com/watch?v=x");
  assert.match(a.label, /YouTube/);
  assert.equal(openOnPlatform({ provider: "youtube" }), null, "no source URL, no fake link");
});

test("platform names are human, not slugs", () => {
  assert.equal(platformLabel("youtube"), "YouTube");
  assert.equal(platformLabel("tiktok"), "TikTok");
  assert.equal(platformLabel("something_new"), "something_new");
});

// ── the media_sources loop ─────────────────────────────────────────────────────────────────

const SOURCE = {
  provider: "youtube", handle: "@boilerroom", label: "Boiler Room",
  channel_id: "UCGBpxWJr9FNOcFYA5GkKrMg", own_content: false, genre: "multi-genre"
};

test("a row is credited to the SOURCE, not to KEEPITIL", () => {
  const rec = sourceRecord(SOURCE, { title: "t", external_id: "x", creator_name: null });
  assert.equal(rec.creator_name, "Boiler Room", "someone else's upload was credited to us");
  assert.equal(rec.own_content, false);
  assert.match(rec.creator_profile_url, /channel\/UCGBpxWJr9FNOcFYA5GkKrMg/);
  assert.match(rec.source_attribution, /YouTube @boilerroom/);
});

test("our own channel is marked own_content", () => {
  const rec = sourceRecord({ ...SOURCE, own_content: true, label: "KEEPITIL" }, { title: "t" });
  assert.equal(rec.own_content, true);
});

test("own_content and genre follow the source on a re-run", () => {
  // If the owner corrects a source's own_content, rows already ingested must move with it —
  // stale attribution is a rights problem, not a cosmetic one.
  assert.ok(REFRESHABLE.includes("own_content"));
  assert.ok(REFRESHABLE.includes("genre"));
  assert.ok(!REFRESHABLE.includes("review_status"), "a human decision must not be overwritten");
});

test("the loop reads media_sources, not one hardcoded channel", () => {
  const src = readFileSync(new URL("../scripts/ingest-media.mjs", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(code, /from\("media_sources"\)/);
  assert.match(code, /eq\("enabled",\s*true\)/, "disabled sources would still be polled");
});

test("a source with no channel_id is skipped, not guessed at", () => {
  // No channel_id means it was never identity-verified. @RA and @drumcode both resolved 200 to
  // real but unrelated channels; polling an unverified handle publishes the wrong org's work.
  const src = readFileSync(new URL("../scripts/ingest-media.mjs", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(code, /if \(!s\.channel_id\)/);
});

test("every source records last_fetched, last_status and items_seen", () => {
  // A dead feed must be visible. Without these a channel that stopped returning entries looks
  // exactly like a channel with nothing new.
  const src = readFileSync(new URL("../scripts/ingest-media.mjs", import.meta.url), "utf8");
  for (const f of ["last_fetched", "last_status", "items_seen"]) {
    assert.match(src, new RegExp(f), `${f} is never written — a dead feed stays silent`);
  }
});
