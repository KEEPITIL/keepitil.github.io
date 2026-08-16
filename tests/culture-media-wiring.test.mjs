import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * §J wiring — Culture's VIDEO and PIXLE tabs read the `videos` table.
 *
 * The bug being fixed: the filters tested `x.kind==='video'` against the feed RPC's rows, whose
 * kinds are post / event / article. Nothing could ever match, so the inventory was structurally
 * always zero and the gate held both tabs shut forever. Ingestion could have worked perfectly
 * and the tabs would still have been empty — a "no data" symptom with a wiring cause, which is
 * the same class of failure as the homepage this morning.
 */

const src = readFileSync(new URL("../culture.html", import.meta.url), "utf8");

/** Pull the media/gate functions out of the page and run them against stubs. */
function harness({ media = [], feed = [], thresholds = { items: 12, categories: 0 } } = {}) {
  const start = src.indexOf("window.__culMediaRows = window.__culMediaRows || []");
  const end = src.indexOf("/* Owner's labels and spelling");
  assert.ok(start > 0 && end > start, "the media wiring is missing from culture.html");

  const filtersStart = src.indexOf("var CUL_FILTERS = [");
  const filtersEnd = src.indexOf("];", filtersStart) + 2;

  const body = src.slice(start, end) + "\n" + src.slice(filtersStart, filtersEnd);

  const win = {
    __culAllRows: feed,
    __culMediaRows: media,
    __culMediaLoaded: true,          /* the fetch is stubbed out; we test the gate, not the network */
    __culSB: null
  };
  const fn = new Function("window", body + `
    return {
      culLiveRows: culLiveRows,
      culInventory: culInventory,
      culMediaToRow: culMediaToRow,
      CUL_FILTERS: CUL_FILTERS
    };`);
  const api = fn(win);
  api._thresholds = thresholds;
  return api;
}

const VIDEO_ROW = (i) => ({
  id: `u${i}`, provider: "youtube", media_kind: "video", title: `Video ${i}`,
  creator_name: "KEEPITIL", source_url: `https://youtube.com/watch?v=${i}`,
  embed_url: `https://www.youtube.com/embed/${i}`, thumbnail_url: `https://img/${i}.jpg`,
  published_at: "2026-01-04T00:00:00+00:00"
});
const PHOTO_ROW = (i) => ({ ...VIDEO_ROW(i), media_kind: "photo", id: `p${i}` });

// ── the boundary ───────────────────────────────────────────────────────────────────────────

test("VIDEO matches video records and PIXLE matches photo records", () => {
  const api = harness();
  const v = api.culMediaToRow(VIDEO_ROW(1));
  const p = api.culMediaToRow(PHOTO_ROW(1));
  const videoFilter = api.CUL_FILTERS.find((f) => f.id === "video");
  const pixleFilter = api.CUL_FILTERS.find((f) => f.id === "pixle");

  assert.equal(videoFilter.test(v), true);
  assert.equal(videoFilter.test(p), false, "a photo record reached the VIDEO tab");
  assert.equal(pixleFilter.test(p), true);
  assert.equal(pixleFilter.test(v), false, "a video record reached the PIXLE tab");
});

test("the filters read media_kind, not kind", () => {
  // kind is a display concern; media_kind is the ingested fact and the only thing the two tabs
  // may be separated by.
  const api = harness();
  const videoFilter = api.CUL_FILTERS.find((f) => f.id === "video");
  assert.equal(videoFilter.test({ kind: "video", media_kind: "photo" }), false,
    "the filter trusted kind and let a photo into VIDEO");
  assert.equal(videoFilter.test({ kind: "anything", media_kind: "video" }), true);
});

test("a feed row can never satisfy VIDEO or PIXLE", () => {
  // profile_content only ever produces post / event / article.
  const api = harness();
  const vf = api.CUL_FILTERS.find((f) => f.id === "video");
  const pf = api.CUL_FILTERS.find((f) => f.id === "pixle");
  for (const kind of ["post", "event", "article"]) {
    assert.equal(vf.test({ kind, data: { img: "x.jpg" } }), false);
    assert.equal(pf.test({ kind, data: { img: "x.jpg" } }), false,
      "a feed post with an image was counted as a PIXLE item");
  }
});

// ── the inventory the gate reads ───────────────────────────────────────────────────────────

test("media rows reach the inventory — the count is no longer structurally zero", () => {
  const api = harness({ media: Array.from({ length: 15 }, (_, i) => VIDEO_ROW(i)).map((r) => ({
    ...r, kind: "video", media_kind: "video", archived: false
  })) });
  const vf = api.CUL_FILTERS.find((f) => f.id === "video");
  const inv = api.culInventory(vf.test);
  assert.equal(inv.items, 15, "VIDEO's inventory is empty — the wiring is not connected");
});

test("15 real videos clear the 12-item gate", () => {
  const api = harness({ media: Array.from({ length: 15 }, (_, i) => ({
    ...api0Row(i)
  })) });
  const vf = api.CUL_FILTERS.find((f) => f.id === "video");
  const inv = api.culInventory(vf.test);
  assert.ok(inv.items >= 12, `only ${inv.items} items — VIDEO would stay hidden`);
});
function api0Row(i) {
  return { id: `u${i}`, kind: "video", media_kind: "video", archived: false, data: { category: "youtube" } };
}

test("PIXLE stays at zero until TikTok URLs are ingested", () => {
  // Expected today, and it must read as a real zero rather than an accident of wiring.
  const api = harness({ media: Array.from({ length: 15 }, (_, i) => api0Row(i)) });
  const pf = api.CUL_FILTERS.find((f) => f.id === "pixle");
  assert.equal(api.culInventory(pf.test).items, 0);
});

test("feed rows and media rows are both present in the live set", () => {
  const api = harness({
    feed: [{ kind: "article", archived: false }, { kind: "post", archived: true }],
    media: [api0Row(1)]
  });
  const rows = api.culLiveRows();
  assert.equal(rows.length, 2, "archived feed rows must still be dropped, media rows still added");
  assert.ok(rows.some((r) => r.media_kind === "video"));
});

// ── the mapped row shape ───────────────────────────────────────────────────────────────────

test("a media row carries a thumbnail and an embed url", () => {
  const api = harness();
  const row = api.culMediaToRow(VIDEO_ROW(7));
  assert.equal(row.data.img, "https://img/7.jpg", "no thumbnail — the card would render blank");
  assert.equal(row.data.embed_url, "https://www.youtube.com/embed/7");
  assert.equal(row.archived, false);
});

test("the gate is evaluated only AFTER media has loaded", () => {
  // Resolving filters before the fetch resolves counts zero and holds the tabs — the original
  // bug, reintroduced one tick earlier.
  const resolve = src.slice(src.indexOf("function culResolveFilters"), src.indexOf("function culResolveFilters") + 500);
  assert.match(resolve, /culLoadMedia\(\)\s*\.then\(/,
    "culResolveFilters does not await culLoadMedia — the gate sees an empty inventory");
});

test("only approved AND active media is requested", () => {
  const loader = src.slice(src.indexOf("function culLoadMedia"), src.indexOf("function culLiveRows"));
  assert.match(loader, /review_status['"],\s*['"]approved/);
  assert.match(loader, /embed_status['"],\s*['"]active/);
});

test("kind is mapped per record, not fixed to video", () => {
  // media_kind guards the tab boundary, so a wrong `kind` cannot leak a photo into VIDEO — but
  // `kind` still feeds _culTypeMatch (the gear menu's Type filter), so a photo labelled "video"
  // would be filtered wrongly there. Caught by mutation: this was the one broken rule the other
  // ten tests could not see.
  const api = harness();
  assert.equal(api.culMediaToRow(VIDEO_ROW(1)).kind, "video");
  assert.equal(api.culMediaToRow(PHOTO_ROW(1)).kind, "pixle",
    "every media record is labelled a video regardless of what it is");
});
