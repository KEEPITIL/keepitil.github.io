/**
 * KEEPITIL — SeatGeek event ingestion.
 *
 * WHY THE FILTER IS THE POINT
 * SeatGeek is sports-first: its own navigation leads with fourteen sports categories before it
 * reaches music. A measured sample of Los Angeles returned 2121 events unfiltered, of which
 * roughly a third of the first 50 were theater, comedy, MLB and NCAA soccer —
 * "Milwaukee Brewers at Los Angeles Dodgers" and "Beauty and the Beast" among them. Filtering
 * on the concert taxonomy leaves 906. An unfiltered adapter does not widen the calendar, it
 * replaces it with stadium sport.
 *
 * WHY concert ONLY
 * classical (207 in LA) and opera (33) are separate taxonomies and are deliberately EXCLUDED.
 * That is 21% of the LA catalogue and it is a product decision, not a technical one: classical
 * runs Disney Hall and the Music Center, a circuit with no overlap with KEEPITIL's venues
 * (Avalon, Fonda, El Rey, The Forum, Roosevelt, Level 8, BLEU) and no connection to any Scene
 * profile, promoter or artist. Those events would sit in the calendar attached to nothing —
 * the same orphaned-content shape that produced the 43 archived articles.
 *
 * The decision is a CONFIG VALUE, not a constant, so it takes one edit to overturn. Reasoning
 * lives in platform_config.seatgeek_taxonomy_filter.
 *
 * music_festival needs no separate entry: measured on the live API, 18 of 18 LA festivals also
 * carry the concert tag, so concert covers them.
 *
 *   node scripts/ingest-seatgeek.mjs --city "Los Angeles" --dry-run
 *   node scripts/ingest-seatgeek.mjs --city "Los Angeles" --limit 100
 *
 * Needs SEATGEEK_CLIENT_ID (+ optional SEATGEEK_CLIENT_SECRET) and SUPABASE_URL /
 * SUPABASE_SERVICE_KEY. None is ever logged.
 */

const SG = "https://api.seatgeek.com/2/events";

/** The taxonomy allow-list. Overridable from platform_config; this is the fallback. */
export const DEFAULT_TAXONOMIES = ["concert"];

/* ── pure ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * Does this event pass the music filter?
 *
 * Checked on OUR side as well as in the query. The API filter is what keeps the request small;
 * this is what stops a taxonomy we did not ask for riding along on a multi-tagged event. Both,
 * because a filter that exists only in a query string is one refactor from being dropped.
 */
export function isMusicEvent(ev, allow = DEFAULT_TAXONOMIES) {
  const names = (ev?.taxonomies ?? []).map((t) => String(t?.name ?? "").toLowerCase());
  if (!names.length) return false;
  return names.some((n) => allow.includes(n));
}

/** Explicitly excluded even when they arrive alongside an allowed tag. */
export const EXCLUDED = ["sports", "baseball", "mlb", "nfl", "nba", "nhl", "mls", "ncaa",
  "ncaa_soccer", "womens_college_soccer", "national_womens_soccer", "soccer", "golf", "tennis",
  "fighting", "motorsports", "wnba", "theater", "comedy", "classical", "opera"];

export function isExcluded(ev) {
  const names = (ev?.taxonomies ?? []).map((t) => String(t?.name ?? "").toLowerCase());
  return names.some((n) => EXCLUDED.includes(n));
}

/**
 * Should this event be ingested at all?
 *
 * Exclusion WINS over inclusion. A "Yankees game with a concert after" tagged both concert and
 * mlb is a baseball game; letting the allow-list win would put stadium sport in the calendar
 * through the side door.
 */
export function shouldIngest(ev, allow = DEFAULT_TAXONOMIES) {
  if (!ev || !ev.id || !ev.title) return false;
  if (isExcluded(ev)) return false;
  return isMusicEvent(ev, allow);
}

/** Best available artwork. trg_events_require_media blocks publish without one. */
export function coverUrl(ev) {
  const p = (ev?.performers ?? []).find((x) => x?.image || x?.images?.huge || x?.images?.large);
  if (!p) return null;
  return p.images?.huge || p.images?.large || p.image || null;
}

export function slugify(s, dateIso) {
  const base = String(s ?? "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
  const d = dateIso ? String(dateIso).slice(0, 10).replace(/-/g, "") : "";
  return d ? `${base}-${d}` : base;
}

/**
 * Map to the events row shape.
 *
 * status is ALWAYS 'review' when there is no artwork. trg_events_require_media would reject a
 * published row without one anyway — this makes the record land honestly with a reason rather
 * than making the importer collide with the trigger and retry into it.
 */
export function toEventRow(ev) {
  const cover = coverUrl(ev);
  const starts = ev?.datetime_utc ? `${ev.datetime_utc}Z`.replace(/ZZ$/, "Z") : null;
  const genres = (ev?.taxonomies ?? [])
    .map((t) => String(t?.name ?? "")).filter((n) => n && n !== "concert").join(", ");

  return {
    title: ev.title,
    slug: slugify(ev.title, starts),
    venue: ev?.venue?.name ?? null,
    city: ev?.venue?.city ?? null,
    starts_at: starts,
    cover_url: cover,
    genres: genres || null,
    source: "seatgeek",
    source_url: ev?.url ?? null,
    dedupe_key: `seatgeek:${ev.id}`,
    status: cover ? "published" : "review",
    review_reason: cover ? null
      : "no cover image — events require a flyer image or video to appear on the calendar (Founder 2026-08-15)",
    imported_at: new Date().toISOString()
  };
}

/* ── network + database ───────────────────────────────────────────────────────────────────── */

async function sgFetch(params) {
  const id = process.env.SEATGEEK_CLIENT_ID;
  const secret = process.env.SEATGEEK_CLIENT_SECRET;
  if (!id) { console.error("Missing SEATGEEK_CLIENT_ID. Nothing was fetched."); process.exit(1); }
  const u = new URL(SG);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("client_id", id);
  if (secret) u.searchParams.set("client_secret", secret);
  const r = await fetch(u.toString(), { headers: { "User-Agent": "KeepItIL-Ingest/1.0" } });
  if (!r.ok) throw new Error(`SeatGeek HTTP ${r.status}`);
  return r.json();
}

async function db() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY."); process.exit(1); }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key);
}

async function allowedTaxonomies(sb) {
  try {
    const { data } = await sb.from("platform_config").select("value")
      .eq("key", "seatgeek_taxonomy_filter").maybeSingle();
    const found = String(data?.value ?? "").match(/taxonomies\s*=\s*([a-z_,\s]+)/i);
    if (found) {
      const list = found[1].split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (list.length) return list;
    }
  } catch { /* fall through */ }
  return DEFAULT_TAXONOMIES;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const dryRun = argv.includes("--dry-run");
  const city = arg("--city", "Los Angeles");
  const limit = Math.min(parseInt(arg("--limit", "50"), 10) || 50, 200);

  const sb = await db();
  const allow = await allowedTaxonomies(sb);
  console.log(`seatgeek: city=${city} limit=${limit} taxonomies=${allow.join(",")}`);

  const json = await sgFetch({
    "venue.city": city, per_page: String(limit),
    sort: "datetime_utc.asc", "taxonomies.name": allow[0]
  });
  const raw = json.events ?? [];

  const kept = [], dropped = [];
  for (const ev of raw) (shouldIngest(ev, allow) ? kept : dropped).push(ev);

  const rows = kept.map(toEventRow);
  const needReview = rows.filter((r) => r.status === "review").length;

  console.log(`  fetched ${raw.length}, kept ${kept.length}, dropped ${dropped.length}`);
  console.log(`  of kept: ${rows.length - needReview} publishable, ${needReview} held for review (no artwork)`);
  if (dropped.length) {
    console.log(`  dropped examples: ` + dropped.slice(0, 3)
      .map((e) => `${e.title} [${(e.taxonomies ?? []).map((t) => t.name).join("/")}]`).join(" | "));
  }

  if (dryRun) {
    console.log("DRY RUN — nothing written.");
    rows.slice(0, 10).forEach((r) => console.log(`   ${r.status.padEnd(9)} ${r.slug}`));
    return;
  }

  let ins = 0, skip = 0;
  for (const row of rows) {
    const { data: existing } = await sb.from("events").select("id")
      .eq("dedupe_key", row.dedupe_key).maybeSingle();
    if (existing) { skip++; continue; }
    const { error } = await sb.from("events").insert(row);
    if (error) { console.error(`  FAILED ${row.slug}: ${error.message}`); continue; }
    ins++;
  }
  console.log(`seatgeek: ${ins} inserted, ${skip} already present`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
