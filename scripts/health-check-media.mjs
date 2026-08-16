/**
 * KEEPITIL — embed health loop for Culture's VIDEO and PIXLE records  (§S5)
 *
 * Asks each provider's oEmbed endpoint whether the post is still embeddable, and writes the
 * answer to embed_status. The ingester ASSUMES 'active' at write time; this is the only thing
 * that makes that value true, and the only thing that notices when it stops being true.
 *
 *   node scripts/health-check-media.mjs            # check everything
 *   node scripts/health-check-media.mjs --dry-run  # probe and print, write nothing
 *   node scripts/health-check-media.mjs --limit 20
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_KEY. Neither is ever logged.
 */

/* ── the mapping, pure so it can be tested ──────────────────────────────────────────────────
 *
 * Returning null means LEAVE THE RECORD ALONE. That distinction is the whole point of this
 * function: a 500 from YouTube or a dropped connection says nothing about the video, and marking
 * content 'deleted' because a CDN hiccuped would pull real posts off the site and require a human
 * to put them back. Only an answer that is genuinely about the post changes the record.
 *
 *   200  the post is there and embeddable      -> active
 *   401  embedding disabled by the owner       -> blocked   (exists, we may not embed it)
 *   403  forbidden                             -> blocked
 *   404  gone, private, or never existed       -> deleted
 *   410  gone                                  -> deleted
 *   400  provider rejected the URL as malformed-> unavailable (our record is wrong, not the post)
 *   429  rate limited                          -> null, retry later
 *   5xx  provider fault                        -> null, retry later
 *   network failure                            -> null, retry later
 */
export function statusFromHttp(code) {
  if (code === 200) return "active";
  if (code === 401 || code === 403) return "blocked";
  if (code === 404 || code === 410) return "deleted";
  if (code === 400) return "unavailable";
  if (code === 429) return null;
  if (code >= 500) return null;
  if (code == null) return null;
  return null;
}

/** Every value this module can write. Must stay a subset of the DB check constraint. */
export const EMBED_STATUS = ["active", "blocked", "deleted", "unavailable", "needs_review"];

export function oembedEndpoint(provider, sourceUrl) {
  if (provider === "youtube") {
    return `https://www.youtube.com/oembed?url=${encodeURIComponent(sourceUrl)}&format=json`;
  }
  if (provider === "tiktok") {
    return `https://www.tiktok.com/oembed?url=${encodeURIComponent(sourceUrl)}`;
  }
  return null;
}

/**
 * Decide what to do with one row given its probe result.
 * Kept separate from the network so the decision can be tested without one.
 */
export function planUpdate(row, httpCode) {
  const next = statusFromHttp(httpCode);
  if (next === null) {
    return { change: false, reason: `transient(${httpCode == null ? "network" : httpCode})`, status: row.embed_status };
  }
  return { change: next !== row.embed_status, from: row.embed_status, status: next, reason: `http ${httpCode}` };
}

/* ── network + database ─────────────────────────────────────────────────────────────────────── */

export async function probe(provider, sourceUrl) {
  const url = oembedEndpoint(provider, sourceUrl);
  if (!url) return null;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "KeepItIL-Health/1.0" } });
    return r.status;
  } catch {
    return null; /* network failure — explicitly not a verdict about the post */
  }
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

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const li = argv.indexOf("--limit");
  const limit = li >= 0 ? parseInt(argv[li + 1], 10) : 500;

  const sb = await db();
  const { data: rows, error } = await sb
    .from("videos").select("id,provider,external_id,source_url,embed_status")
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) { console.error(error.message); process.exit(1); }

  const tally = { active: 0, blocked: 0, deleted: 0, unavailable: 0, transient: 0, changed: 0 };

  for (const row of rows) {
    const code = await probe(row.provider, row.source_url);
    const plan = planUpdate(row, code);

    if (plan.reason.startsWith("transient")) {
      tally.transient++;
      console.log(`  ~ ${row.provider}/${row.external_id}  ${plan.reason} — left as ${row.embed_status}`);
      continue;
    }
    tally[plan.status] = (tally[plan.status] || 0) + 1;
    if (plan.change) {
      tally.changed++;
      console.log(`  ! ${row.provider}/${row.external_id}  ${plan.from} -> ${plan.status}  (${plan.reason})`);
    }
    if (!dryRun) {
      await sb.from("videos")
        .update({ embed_status: plan.status, last_checked_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  console.log(
    `${dryRun ? "DRY RUN — " : ""}checked ${rows.length}: ` +
    `${tally.active} active, ${tally.blocked} blocked, ${tally.deleted} deleted, ` +
    `${tally.unavailable} unavailable, ${tally.transient} transient (unchanged), ${tally.changed} changed`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
