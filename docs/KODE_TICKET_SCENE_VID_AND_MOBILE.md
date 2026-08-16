# KODE TICKET — Mobile Regression + Scene Editorial + Culture VID

**From:** ATLAS · **2026-08-15** · Repo: `KEEPITIL/keepitil.github.io` · DB: `ovmqtzjfpzrbzrlkxwgw`
Product decisions: `ATLAS_SCENE_EDITORIAL_AND_VID_DECISIONS.md`. **Commit both to `docs/` first.**

**M1 ships before anything else.** It is a live visual defect on every page, and we caused it.

---

## M1 — TOP SAFE-AREA REGRESSION (we introduced this) 🔴

K2 added `viewport-fit=cover` to 51 pages. That made the **bottom** insets work — and it also extends content **into the status bar**, which was previously reserved by the browser.

**Nothing applies the top inset.** Verified on production:

```js
anyStyleUsesTopInset: false      // no rule anywhere references safe-area-inset-top
```

**Observed on the owner's iPhone:**

- ECHO panel header collides with the clock — "ECHO" overlaps `11:52`
- ECHO greeting text runs under the status icons
- Radio's green `RADIO` pill renders on top of the clock

**Fix:** every fixed/sticky top element in `keepitil-shell.js` gets
`padding-top: max(<current>, env(safe-area-inset-top))`. Audit the ECHO panel and the Radio header specifically — both are shell-injected and both are wrong today.

**Bump the cache version.** Currently `?v=20260815e`. Not bumping means the fix never reaches anyone — documented recurring failure here.

**Accept when:** no text or chrome intersects the status bar on a notched device, at top of scroll and mid-scroll, portrait and landscape. Chromium reports zero insets regardless, so emulation cannot prove this — **use a real device profile or hand it to the owner.**

---

## M2 — FABs COVER THE CREATE SHEET 🔴

Opening Create renders the sheet **underneath** the blue `+` and green chat FABs. In the owner's screenshot the FABs sit on top of the "Event" and "Selection" rows — including the `+` covering the menu it just opened. The account button (bottom-left) obscures the word "Selection".

**Fix:** while any sheet or modal is open, FABs and the account button hide or drop below the sheet's stacking context. A control must never occlude the surface it summoned.

---

## M3 — PINNED CONTROLS COLLIDE WITH CONTENT 🟠

The bottom-left account button and both FABs sit over scrolling content on every page: the footer address on VS, the R&B & SOUL card on Radio, a profile card on Scene, the POP station tile.

**Fix:** add bottom scroll padding equal to the pinned controls' occupied height so content clears them at the end of scroll — the same measurement K2 already does for the nav bar. **Reuse that measurement.** Do not re-derive it: the earlier attempt published `1639px` of padding when it measured before the stylesheet landed.

---

## S1 — PROFILE TAXONOMY

Extend `profile_meta.account_type` to the five values in the ATLAS doc §D1. Only 6 rows exist — this is a small migration.

**Ownership derives from `profile_owners` (2 rows), never from `account_type`.** A profile is a subscriber profile iff a `profile_owners` row exists for its slug. Do not duplicate that fact into the type column; two sources of truth will disagree.

Migrate: rows with an owner → `subscriber_profile`; `organizer`/`brand` without one → `editorial_*`. **Leave the 2 NULLs in `review`** — do not default NULL to editorial.

Add `last_reviewed_at` and a `sources jsonb` array. Enforce the six hard gates from §D2 in the publish path, server-side.

---

## S2 — EDITORIAL LABELLING

Editorial profiles render "Artist Profile" / "Venue Profile" / "Organizer Profile" / "Brand Profile". Never Member / Subscriber / Verified / Creator without a `profile_owners` row.

**Add a test asserting an editorial profile renders no membership language.** This is the directive's core correctness rule and the one most likely to regress silently through a copy change.

---

## S3 — CONFIG-GATED CULTURE TABS

Live tabs are `Feed · Blog · Vid · Pix`. Real inventory: **VID 0, PIX 11** (not 201 — my earlier figure was wrong).

Gate both on the §D4 threshold — 20 items, 5 creators, 3 categories — read from `platform_config`, evaluated at render. Below threshold the tab is not emitted at all.

Result today: `FEED · ARTICLES · VS`. Tabs appear automatically as inventory arrives, no deploy.

### "BLOG" was my error — answered 2026-08-15

KODE is right that `kind='blog'` matches 0 rows. I took the label off the live tab bar instead of the data. Measured now:

```
blog_articles        0 rows      ← the table exists and is empty
agent_blog_posts    22 rows      ← not wired to Culture
profile_content kind='article'  294 live / 70 archived
```

**Use `kind='article'`, labelled "Articles".** There is no blog store to reconcile against — `blog_articles` is empty, so nothing is being hidden by ignoring it.

### But look at what those 294 articles are

Every one carries `auto: "agent_daily"`, across **14 profiles that are all AI agents**. Zero human authorship. Every one has `img: ""`, which is why PIX is 11 posts and not 294.

**Culture's entire article inventory is agent daily output — the exact content generation the owner retired.** The cron jobs are paused, so this is a fixed corpus that will not grow.

**KODE: do not act on this.** Ship `FEED · ARTICLES · VS` as specified. It is an owner decision whether 294 retired-programme articles remain the substance of Culture, and I have raised it.

**Also remove Radio from the Culture tab row** — it is now a global destination, so the Culture entry is a redundant second path.

---

## S4 — VIDEO RECORDS + YOUTUBE INGESTION

**§9 was never written down — my error.** It existed only in the owner's chat message, so "fields per §9" pointed at nothing KODE could read. Reproduced here verbatim; this is now the source.

### §9 — provider-neutral video record

```
id                        provider                  source_url
embed_url  (or official embed payload)              external_id
title                     creator_name              creator_profile_url
thumbnail_url             duration (where available)
description               genre                     location
related_scene_profile_id  related_event_id          related_article_id
related_vs_entry_id       discovered_by_agent
review_status             embed_status              last_checked_at
published_at              source_attribution        metadata
```

**Never store private tokens in these records** (owner's §9, verbatim constraint).

**`embed_status` must distinguish five states** (§16): `active` · `blocked` · `deleted` · `unavailable` · `needs_review`. This is the BROKEN ≠ EMPTY rule again — "no videos yet" and "the health checker died" must not render identically.

**`review_status` defaults to `review`** — nothing reaches VID unapproved.

**Note on the owner's later decision:** since VIDEO/PIXLE now ingest from KEEPITIL's own `@keepitil` accounts, `creator_name` / `creator_profile_url` / `source_attribution` all resolve to KEEPITIL. Keep the fields — they are what lets a third-party source be added later without a migration — but the §D4 creator-count gate is dropped for these tabs, because a single-owner account can never satisfy it.

**V1 provider: YouTube only.** Public oEmbed, no key, no OAuth, no account — the only source satisfying Zero Cost and §28 without an owner escalation. Instagram's oEmbed needs an approved Facebook App, which is an OAuth dependency and therefore out of V1 by the directive's own rule.

Thumbnail-first rendering; embed on click. Never mount more than one active player.

---

## S5 — EMBED HEALTH

Daily read-only validation. On failure: hide from public surfaces, preserve the record, queue for review. **Never render a broken player.**

State must distinguish `active` / `unavailable` / `blocked` / `deleted` / `needs_review` — the BROKEN ≠ EMPTY rule. "No videos yet" and "the checker died" must never produce the same UI.

---

## S7 — SUB-NAVIGATION CLEANUP (desktop + mobile)

Measured in the rendered DOM on production, 2026-08-15:

```
/culture.html   switcher: [Feed | Radio | VS]        sub-tabs: Blog Article Vid Pix VS
/radio.html     switcher: [Feed | Radio | VS]        sub-tabs: Channel Playlist Schedule VS Apps Games
/vs.html        switcher: NONE                       sub-tabs: NONE  ← flat page
```

**The `Feed | Radio | VS` switcher is obsolete. Delete it from both pages.**

It exists because Radio and VS were unreachable from the shell nav — it was the workaround. K1 put all five destinations in the global nav, so this row is now a third redundant path (shell top nav, bottom bar, and this). Removing it also removes the oddity that Radio's own page offers you a button back to Radio.

**Rule for what remains: sub-nav lists sections of *this* product, nothing else.**

- **Culture** → `FEED · BLOG · PIX · VID · VS`, threshold-gated per S3. Remove the `Radio` entry.
- **Radio** → `CHANNEL · PLAYLIST · APPS` per S6.
- Apply to **both breakpoints.** The switcher is present in the mobile DOM too.

### The `VS` tab inside Culture — RESOLVED, owner keeps it

Owner decision 2026-08-15: Culture's target tab set is **`FEED · ARTICLE · VID · PIX · VS`**. VS stays as a content filter over Culture. Label `ARTICLE`, singular.

**Gated, this renders `FEED · ARTICLE · VS` today** — VID is 0 and PIX is 11, both below the §D4 threshold. Same set, not a smaller one; VID and PIX self-enable from config when inventory arrives. Do not hard-code five tabs.

### VS has no sub-navigation at all — and its empty state points at a control mobile does not have

`/vs.html` renders no switcher and no tab row. Its empty state reads:

> *"Ten annual competitions are open for submissions right now. Tap **Join** on the rail to enter one."*

**There is no rail on mobile.** The owner's screenshot shows the copy with nothing to tap. The instruction names a control that is not on screen.

**`vs_competitions` = 36 published. `vs_entries` = 0.** A dead entry path on the breakpoint most users arrive at is a credible cause of that, and it is a better first hypothesis than lack of demand.

**KODE:** find what "the rail" is, determine whether it renders below the mobile breakpoint, and report before building anything. Do not write new VS navigation on top of an entry path that may simply be missing. **Fix the entry path first; sub-nav second.**

---

## ORDER

**M1 → M2 → M3** (one mobile PR — the owner verifies all three in one pass)
then **S7 → S6 → S3** (navigation cleanup; deletes a whole redundant row across two pages and reports the VS entry-path finding)
then **S1 → S2** (Scene truthfulness)
then **S4 → S5** (VID ingestion).

**S7's VS investigation is a report, not a build.** Bring back what "the rail" is before anyone writes VS navigation.

---

## TRAPS

- `/v3/` is a **live asset namespace** — `v3-tokens.css` is the theme engine. No directory deletion.
- `404.html` is the URL router. GitHub Pages forces the name.
- Never `overflow:hidden` on `html` — breaks `position:fixed` on iOS Safari; already blanked the mobile homepage once.
- `100dvh`, never `vh`.
- Bump the shell cache version on every change.
- **`gh auth switch --user KEEPITIL` before pushing** — it reverts to `fobbinhard` afterwards.

---

## S6 — RADIO TAB ROW → `CHANNEL · PLAYLIST · APPS`

Owner decision, 2026-08-15. Live row is `CHANNEL · PLAYLIST · SCHEDULE · VS · APPS · GAMES`. Remove **SCHEDULE, VS, GAMES**.

**VS** — safe. It is a global destination now; the Radio tab is a duplicate path.

**SCHEDULE and GAMES carry real content. Removing the tab hides the entrance, it does not delete the room.**

- **Do not delete either surface.** Route their content somewhere reachable, or report precisely what is orphaned.
- **GAMES → APPS** is the likely home; the live page title is *"Radio — Stations, Playlists, Games & Creator Opportunities"*, so APPS already covers it. Confirm before moving.
- **SCHEDULE has no obvious home.** Name it in your report rather than quietly dropping it.

**Verify by following each removed tab's destination at runtime**, not by checking that the tab is gone from the DOM. A page nothing links to is the failure mode that left Radio and VS unreachable while VS accumulated 36 published competitions and zero entries.
