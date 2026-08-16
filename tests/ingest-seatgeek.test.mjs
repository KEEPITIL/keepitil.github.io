import assert from "node:assert/strict";
import test from "node:test";
import {
  isMusicEvent, isExcluded, shouldIngest, coverUrl, slugify, toEventRow,
  DEFAULT_TAXONOMIES, EXCLUDED
} from "../scripts/ingest-seatgeek.mjs";

/**
 * SeatGeek ingestion — the filter is the feature.
 *
 * Measured on the live API before any of this was written: Los Angeles returns 2121 events
 * unfiltered, and a third of the first 50 were theater, comedy, MLB and NCAA soccer. Filtering
 * on the concert taxonomy leaves 906. An unfiltered adapter would not widen the calendar, it
 * would replace it with stadium sport.
 */

const ev = (tax, o = {}) => ({
  id: 1, title: "A Show", datetime_utc: "2026-09-01T02:00:00",
  taxonomies: tax.map((name) => ({ name })), ...o
});

// ── the thing that must not happen ─────────────────────────────────────────────────────────

test("stadium sport never gets in", () => {
  for (const t of ["sports", "baseball", "mlb", "nfl", "nba", "nhl", "ncaa_soccer", "motorsports"]) {
    assert.equal(shouldIngest(ev([t])), false, `${t} reached the calendar`);
  }
});

test("theater and comedy never get in", () => {
  // 14 theater and 9 comedy in a 50-event LA sample — the second biggest chunk after concerts.
  assert.equal(shouldIngest(ev(["theater"])), false);
  assert.equal(shouldIngest(ev(["comedy"])), false);
});

test("EXCLUSION BEATS INCLUSION on a multi-tagged event", () => {
  // The side door: a stadium event that also carries a concert tag. If the allow-list won,
  // "Milwaukee Brewers at Los Angeles Dodgers" style rows would arrive as music.
  assert.equal(shouldIngest(ev(["concert", "mlb"])), false,
    "a baseball game with a concert tag was ingested as music");
  assert.equal(shouldIngest(ev(["concert", "sports"])), false);
});

test("classical and opera are excluded — the recorded product decision", () => {
  // 207 classical + 33 opera in LA = 21% of the catalogue. A different circuit (Disney Hall,
  // the Music Center) with no overlap with any Scene profile, promoter or artist.
  assert.equal(shouldIngest(ev(["classical"])), false);
  assert.equal(shouldIngest(ev(["opera"])), false);
  assert.equal(shouldIngest(ev(["concert", "classical"])), false, "a classical concert slipped through");
});

// ── the thing that must happen ─────────────────────────────────────────────────────────────

test("a plain concert is ingested", () => {
  assert.equal(shouldIngest(ev(["concert"])), true);
});

test("a music festival is ingested without needing its own rule", () => {
  // Measured: 18 of 18 LA festivals also carry the concert tag, so concert covers them.
  assert.equal(shouldIngest(ev(["concert", "music_festival"])), true);
});

test("an untagged event is dropped rather than assumed to be music", () => {
  assert.equal(shouldIngest(ev([])), false);
  assert.equal(isMusicEvent({ taxonomies: null }), false);
});

test("a row without id or title is dropped", () => {
  assert.equal(shouldIngest(ev(["concert"], { id: null })), false);
  assert.equal(shouldIngest(ev(["concert"], { title: "" })), false);
});

test("the allow-list is configurable, not hardcoded", () => {
  // The classical decision is a config value — one edit to overturn.
  assert.equal(shouldIngest(ev(["jazz"]), ["jazz"]), true);
  assert.equal(shouldIngest(ev(["concert"]), ["jazz"]), false);
  assert.deepEqual(DEFAULT_TAXONOMIES, ["concert"]);
});

test("classical is in the exclusion list, not merely absent from the allow-list", () => {
  // Absence alone would let it in the moment someone widened the allow-list to "music".
  assert.ok(EXCLUDED.includes("classical"));
  assert.ok(EXCLUDED.includes("opera"));
});

// ── artwork and the media trigger ──────────────────────────────────────────────────────────

test("an event with artwork is publishable", () => {
  const row = toEventRow(ev(["concert"], { performers: [{ image: "https://x/i.jpg" }] }));
  assert.equal(row.cover_url, "https://x/i.jpg");
  assert.equal(row.status, "published");
  assert.equal(row.review_reason, null);
});

test("an event with NO artwork lands in review, with a reason", () => {
  // trg_events_require_media would reject a published row without one. Landing honestly beats
  // colliding with the trigger and retrying into it.
  const row = toEventRow(ev(["concert"], { performers: [] }));
  assert.equal(row.cover_url, null);
  assert.equal(row.status, "review");
  assert.match(row.review_reason, /no cover image/);
});

test("the largest available image wins", () => {
  const c = coverUrl(ev(["concert"], {
    performers: [{ image: "small.jpg", images: { large: "large.jpg", huge: "huge.jpg" } }]
  }));
  assert.equal(c, "huge.jpg");
});

// ── row shape ──────────────────────────────────────────────────────────────────────────────

test("the dedupe key is provider-scoped so a re-run cannot duplicate", () => {
  assert.equal(toEventRow(ev(["concert"], { id: 42 })).dedupe_key, "seatgeek:42");
});

test("source is recorded as seatgeek, not community", () => {
  // The 31 Ticketmaster rows were written as source='community', which is why they could not be
  // found by source and had to be counted from source_url instead.
  assert.equal(toEventRow(ev(["concert"])).source, "seatgeek");
});

test("slugs are url-safe and date-suffixed", () => {
  const s = slugify("Tomahawk with Melvins!! (21+)", "2026-09-01T02:00:00Z");
  assert.match(s, /^[a-z0-9-]+$/);
  assert.match(s, /-20260901$/);
});

test("the redundant concert tag is not repeated into genres", () => {
  // Every row has it; storing it adds nothing and would make "concert" look like a genre.
  const row = toEventRow(ev(["concert", "music_festival"]));
  assert.ok(!/\bconcert\b/.test(row.genres ?? ""));
  assert.match(row.genres, /music_festival/);
});
