/**
 * KEEPITIL — media ingestion for Culture's VIDEO and PIXLE tabs  (§J)
 *
 * Two providers, two discovery models, ONE record shape:
 *
 *   VIDEO  provider='youtube'  auto-discovered from the channel RSS feed (keyless)
 *   PIXLE  provider='tiktok'   curated URLs supplied by the owner, resolved via oEmbed (keyless)
 *
 * TikTok can be embedded freely but not enumerated freely — listing an account's posts needs the
 * Display API (app + OAuth), so PIXLE takes URLs rather than crawling. That is §J3's design, not
 * a shortcut.
 *
 *   node scripts/ingest-media.mjs youtube
 *   node scripts/ingest-media.mjs tiktok <url> [url...]
 *   node scripts/ingest-media.mjs tiktok --file urls.txt
 *   node scripts/ingest-media.mjs <provider> --dry-run     # resolve and print, write nothing
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment. Neither is ever logged.
 */

import { readFileSync } from "node:fs";

/* @supabase/supabase-js is imported LAZILY, inside db(). A top-level import makes the whole
   module unloadable wherever the dependency is not installed — which killed both --dry-run and
   the tests, neither of which touches the database. Parsing and mapping must stay runnable with
   nothing installed. */

/* @keepitil, confirmed in §J1 and verified live: the feed returns 15 entries. */
export const YOUTUBE_CHANNEL_ID = "UC-gWqozXipPMT2VjcwJOLbw";
export const YOUTUBE_FEED = (id = YOUTUBE_CHANNEL_ID) =>
  `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;

/* ── pure parsing/mapping, kept free of network and database so it can be tested ────────────── */

const un = (s) =>
  String(s ?? "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? un(m[1]).trim() : null;
};

/**
 * Parse a YouTube channel RSS feed into records.
 *
 * NOTE THE CAP: YouTube returns at most 15 entries per feed, no paging. This is discovery of
 * "what is recent", not of "everything the channel has". The table accumulates across runs;
 * a single run can never see more than 15.
 */
export function parseYouTubeFeed(xml) {
  const entries = String(xml).match(/<entry>[\s\S]*?<\/entry>/g) || [];
  return entries.map((e) => {
    const id = tag(e, "yt:videoId");
    if (!id) return null;
    const thumb = (e.match(/<media:thumbnail[^>]*url="([^"]+)"/) || [])[1] || null;
    return {
      provider: "youtube",
      external_id: id,
      /* PIXLE must never show a video and VIDEO must never show a photo. YouTube has no photo
         posts, so this is a constant here rather than a guess. */
      media_kind: "video",
      source_url: `https://www.youtube.com/watch?v=${id}`,
      embed_url: `https://www.youtube.com/embed/${id}`,
      title: tag(e, "media:title") || tag(e, "title"),
      creator_name: tag(e, "name"),
      creator_profile_url: (e.match(/<uri>([^<]+)<\/uri>/) || [])[1] || null,
      thumbnail_url: thumb,
      published_at: tag(e, "published"),
      source_attribution: "youtube.com/@keepitil"
    };
  }).filter(Boolean);
}

/**
 * A TikTok post URL carries its own type in the path: /video/<id> or /photo/<id>.
 *
 * This is not a guess. TikTok's oEmbed returns HTTP 400 when the path does not match the real
 * post type — /photo/ with a video id is rejected — so the segment is validated server-side and
 * a URL that resolves has already been checked by TikTok.
 */
export function tiktokKindFromUrl(url) {
  const m = String(url).match(/tiktok\.com\/@[^/]+\/(photo|video)\/(\d+)/i);
  if (!m) return { kind: null, externalId: null };
  return { kind: m[1].toLowerCase() === "photo" ? "photo" : "video", externalId: m[2] };
}

/**
 * Reconcile what the URL says against what oEmbed says.
 *
 * I could NOT verify what a real Photo Mode post returns for embed_type: I have no confirmed
 * photo-post URL and @keepitil's TikTok profile sits behind a bot check I will not bypass. So
 * oEmbed's field is treated as corroboration when it is present and recognised, never as the
 * authority, and a genuine disagreement is escalated rather than resolved by preference.
 *
 * An unrecognised or absent embed_type is NOT a conflict — that is the expected case for a photo
 * post if TikTok reports something we have not seen.
 */
export function reconcileKind(fromUrl, embedType) {
  const seen = String(embedType || "").toLowerCase();
  if (!fromUrl) return { kind: null, conflict: true, reason: "url-not-a-tiktok-post" };
  if (seen !== "photo" && seen !== "video") {
    return { kind: fromUrl, conflict: false, reason: seen ? `oembed-kind-unrecognised:${seen}` : "oembed-kind-absent" };
  }
  if (seen !== fromUrl) {
    return { kind: fromUrl, conflict: true, reason: `url-says-${fromUrl}-oembed-says-${seen}` };
  }
  return { kind: fromUrl, conflict: false, reason: "agreed" };
}

/** Build the row for a resolved TikTok post. */
export function tiktokRecord(url, oembed) {
  const { kind, externalId } = tiktokKindFromUrl(url);
  const rec = reconcileKind(kind, oembed && oembed.embed_type);
  return {
    provider: "tiktok",
    external_id: externalId || (oembed && oembed.embed_product_id) || null,
    media_kind: rec.kind || "video",
    source_url: url,
    embed_url: null,
    title: (oembed && oembed.title) || null,
    creator_name: (oembed && oembed.author_name) || null,
    creator_profile_url: (oembed && oembed.author_url) || null,
    thumbnail_url: (oembed && oembed.thumbnail_url) || null,
    source_attribution: (oembed && oembed.author_url) || "tiktok.com",
    _conflict: rec.conflict,
    _kindReason: rec.reason
  };
}

/* ── §L (§19) — SOURCE AND RIGHTS ───────────────────────────────────────────────────────────
   "KEEPITIL is curating and embedding public content. Do not imply ownership."
   Maintain: creator attribution, source platform, source URL, open-on-platform action.

   For an own_content=false row these are REQUIRED, not garnish. Enforced here rather than in the
   UI because a UI-only check is bypassed by the next ingest path — the same reasoning that put
   the events media rule in a database trigger instead of a form validation.

   own_content itself defaults to FALSE everywhere: an unlabelled row is treated as someone
   else's work and gets full attribution. The opposite default would silently strip credit
   whenever a path forgot to set the flag. Fail toward giving credit. */
export const ATTRIBUTION_REQUIRED = ["creator_name", "provider", "source_url"];

export function attributionComplete(row) {
  if (row && row.own_content === true) return { ok: true, missing: [] };
  const missing = ATTRIBUTION_REQUIRED.filter((f) => {
    const v = row ? row[f] : null;
    return v == null || String(v).trim() === "";
  });
  return { ok: missing.length === 0, missing };
}

/** Where "open on platform" points. The source URL is the canonical public post. */
export function openOnPlatform(row) {
  if (!row || !row.source_url) return null;
  return { label: `Watch on ${platformLabel(row.provider)}`, href: row.source_url };
}

export function platformLabel(provider) {
  return ({ youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" })[provider] || provider || "source";
}

/**
 * Fields a re-run is allowed to overwrite.
 *
 * review_status is deliberately ABSENT. Re-running ingestion must never un-approve something the
 * owner already approved, or re-surface something they rejected — that would make the review
 * queue meaningless and quietly republish rejected content on the next cron tick. Only volatile,
 * source-owned facts refresh.
 */
/* The DB constrains embed_status to exactly these. "ok" is NOT one of them — assuming it was
   made every insert fail the check constraint, which a cron run would have reported as a wall of
   errors and zero rows. Kept here so the script and the schema cannot drift apart silently. */
export const EMBED_STATUS = ["active", "blocked", "deleted", "unavailable", "needs_review"];

export const REFRESHABLE = [
  "title", "creator_name", "creator_profile_url", "thumbnail_url",
  "embed_url", "published_at", "source_attribution", "media_kind", "embed_status", "last_checked_at",
  /* own_content and genre are SOURCE-owned facts, not human decisions, so they must follow the
     media_sources row. If the owner corrects a source's own_content, every row already ingested
     from it has to move with it — otherwise old rows keep the wrong attribution forever, which
     under §L is a rights problem rather than a cosmetic one. review_status stays out: that IS a
     human decision. */
  "own_content", "genre"
];

/**
 * Map one feed entry against the media_source it came from.
 *
 * creator_name comes from the SOURCE, not from our own branding — a Boiler Room upload is
 * credited to Boiler Room. That is the whole point of §L.
 */
export function sourceRecord(source, entry) {
  return {
    ...entry,
    provider: source.provider,
    own_content: source.own_content === true,
    creator_name: entry.creator_name || source.label,
    creator_profile_url: source.channel_id
      ? `https://www.youtube.com/channel/${source.channel_id}`
      : entry.creator_profile_url || null,
    source_attribution: source.handle
      ? `${platformLabel(source.provider)} ${source.handle}`
      : platformLabel(source.provider),
    genre: source.genre || null
  };
}

export function mergeForUpsert(existing, incoming) {
  if (!existing) return { ...incoming, review_status: "review" };
  const out = { id: existing.id, provider: existing.provider, external_id: existing.external_id, source_url: incoming.source_url };
  for (const k of REFRESHABLE) if (incoming[k] !== undefined && incoming[k] !== null) out[k] = incoming[k];
  return out;
}

/* ── network + database ─────────────────────────────────────────────────────────────────────── */

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": "KeepItIL-Ingest/1.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

export async function tiktokOembed(url) {
  const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
    headers: { "User-Agent": "KeepItIL-Ingest/1.0" }
  });
  if (!r.ok) return { ok: false, status: r.status, data: null };
  return { ok: true, status: r.status, data: await r.json() };
}

async function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY. Nothing was written.");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key);
}

async function writeAll(rows, dryRun) {
  const clean = rows.map(({ _conflict, _kindReason, ...r }) => r);
  if (dryRun) {
    console.log(`DRY RUN — ${clean.length} record(s) resolved, nothing written:`);
    clean.forEach((r) => console.log(`  ${r.provider}/${r.media_kind}  ${r.external_id}  ${String(r.title).slice(0, 58)}`));
    /* null, not 0. Printing "0 new, 0 refreshed" after a dry run reads as a failed write; the
       honest answer is that no write was attempted. */
    return { inserted: null, refreshed: null, dryRun: true };
  }
  const sb = await db();
  let inserted = 0, refreshed = 0;

  for (const r of clean) {
    const { data: existing } = await sb
      .from("videos").select("id,provider,external_id,review_status")
      .eq("provider", r.provider).eq("external_id", r.external_id).maybeSingle();

    const row = mergeForUpsert(existing, { ...r, last_checked_at: new Date().toISOString() });
    const { error } = existing
      ? await sb.from("videos").update(row).eq("id", existing.id)
      : await sb.from("videos").insert(row);

    if (error) { console.error(`  FAILED ${r.provider}/${r.external_id}: ${error.message}`); continue; }
    existing ? refreshed++ : inserted++;
  }
  return { inserted, refreshed };
}

/**
 * Record the outcome on the source row.
 *
 * last_fetched / last_status / items_seen exist so a dead feed is VISIBLE. Without them a
 * channel that stopped returning entries looks identical to a channel with nothing new, and
 * nobody finds out until someone wonders why a genre went quiet.
 */
async function noteSource(sb, id, status, itemsSeen, dryRun) {
  if (dryRun) return;
  await sb.from("media_sources").update({
    last_fetched: new Date().toISOString(),
    last_status: status,
    items_seen: itemsSeen
  }).eq("id", id);
}

/* ── entry point ────────────────────────────────────────────────────────────────────────────── */

async function main() {
  const argv = process.argv.slice(2);
  const provider = argv[0];
  const dryRun = argv.includes("--dry-run");
  const args = argv.slice(1).filter((a) => a !== "--dry-run");

  if (provider === "youtube") {
    /* Every ENABLED source with a resolved channel_id, not one hardcoded channel. A source with
       no channel_id has not been identity-verified — a 200 on youtube.com/@handle proves a
       channel exists, not that it is the right organisation. @RA and @drumcode both resolved to
       real but unrelated channels. Unverified sources are skipped, loudly. */
    const sb = await db();
    const { data: sources, error } = await sb
      .from("media_sources").select("*").eq("provider", "youtube").eq("enabled", true).order("id");
    if (error) { console.error(error.message); process.exit(1); }

    let totalNew = 0, totalRef = 0;
    for (const s of sources) {
      if (!s.channel_id) {
        console.error(`  SKIP ${s.handle}: no channel_id — not identity-verified`);
        await noteSource(sb, s.id, "skipped: no channel_id (unverified)", 0, dryRun);
        continue;
      }
      let rows = [];
      let status = "";
      try {
        const xml = await fetchText(YOUTUBE_FEED(s.channel_id));
        rows = parseYouTubeFeed(xml).map((e) => sourceRecord(s, e));
        status = `ok: ${rows.length} entries`;
      } catch (e) {
        /* A dead feed is VISIBLE, not silent — recorded on the source row so it shows up as a
           stale last_fetched with a reason instead of a channel that quietly stopped. */
        console.error(`  FAIL ${s.handle}: ${e.message}`);
        await noteSource(sb, s.id, `error: ${e.message}`.slice(0, 300), 0, dryRun);
        continue;
      }

      /* §L: a third-party row without full attribution is not written at all. */
      const complete = [], incomplete = [];
      for (const r of rows) {
        r.embed_status = "active";
        (attributionComplete(r).ok ? complete : incomplete).push(r);
      }
      if (incomplete.length) {
        console.error(`  ${s.handle}: ${incomplete.length} row(s) missing attribution ` +
          `(${attributionComplete(incomplete[0]).missing.join(", ")}) — not written`);
        status += `, ${incomplete.length} rejected for attribution`;
      }

      const res = await writeAll(complete, dryRun);
      if (!res.dryRun) { totalNew += res.inserted; totalRef += res.refreshed; }
      await noteSource(sb, s.id, status, complete.length, dryRun);
      console.log(`  ${s.handle.padEnd(18)} ${String(rows.length).padStart(3)} entries  ${status}`);
    }
    if (!dryRun) console.log(`youtube: ${totalNew} new, ${totalRef} refreshed across ${sources.length} source(s)`);
    return;
  }

  if (provider === "tiktok") {
    let urls = args;
    const fi = args.indexOf("--file");
    if (fi >= 0) {
      urls = readFileSync(args[fi + 1], "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
    }
    if (!urls.length) {
      console.error("tiktok: no URLs given. PIXLE is curated — pass post URLs or --file <list>.");
      process.exit(1);
    }
    const rows = [];
    for (const u of urls) {
      const { kind } = tiktokKindFromUrl(u);
      if (!kind) { console.error(`  SKIP not a TikTok post URL: ${u}`); continue; }
      const res = await tiktokOembed(u);
      if (!res.ok) {
        /* A 400 here usually means the path and the real post type disagree, which is TikTok
           telling us the URL is wrong. Report it; do not invent a record. */
        console.error(`  SKIP oEmbed HTTP ${res.status}: ${u}`);
        continue;
      }
      const rec = tiktokRecord(u, res.data);
      rec.embed_status = "active";
      if (rec._conflict) {
        rec.embed_status = "needs_review";
        console.error(`  CONFLICT ${rec._kindReason}: ${u} — held for review, not guessed`);
      }
      rows.push(rec);
    }
    console.log(`tiktok: ${rows.length} of ${urls.length} URL(s) resolved`);
    const res = await writeAll(rows, dryRun);
    if (!res.dryRun) console.log(`tiktok: ${res.inserted} new, ${res.refreshed} refreshed`);
    return;
  }

  console.error("usage: ingest-media.mjs <youtube|tiktok> [urls...] [--file list] [--dry-run]");
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
