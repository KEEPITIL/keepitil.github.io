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

Result today: `FEED · BLOG · VS`. Tabs appear automatically as inventory arrives, no deploy.

**Also remove Radio from the Culture tab row** — it is now a global destination, so the Culture entry is a redundant second path.

---

## S4 — VIDEO RECORDS + YOUTUBE INGESTION

New `videos` table, provider-neutral, fields per directive §9. **`review_status` defaults to `review`** — nothing reaches VID unapproved.

**V1 provider: YouTube only.** Public oEmbed, no key, no OAuth, no account — the only source satisfying Zero Cost and §28 without an owner escalation. Instagram's oEmbed needs an approved Facebook App, which is an OAuth dependency and therefore out of V1 by the directive's own rule.

Thumbnail-first rendering; embed on click. Never mount more than one active player.

---

## S5 — EMBED HEALTH

Daily read-only validation. On failure: hide from public surfaces, preserve the record, queue for review. **Never render a broken player.**

State must distinguish `active` / `unavailable` / `blocked` / `deleted` / `needs_review` — the BROKEN ≠ EMPTY rule. "No videos yet" and "the checker died" must never produce the same UI.

---

## ORDER

**M1 → M2 → M3** (ship as one mobile PR — the owner can verify all three in one pass)
then **S1 → S2 → S3** (Scene truthfulness + honest tabs; S3 alone removes two empty tabs)
then **S4 → S5** (ingestion).

---

## TRAPS

- `/v3/` is a **live asset namespace** — `v3-tokens.css` is the theme engine. No directory deletion.
- `404.html` is the URL router. GitHub Pages forces the name.
- Never `overflow:hidden` on `html` — breaks `position:fixed` on iOS Safari; already blanked the mobile homepage once.
- `100dvh`, never `vh`.
- Bump the shell cache version on every change.
- **`gh auth switch --user KEEPITIL` before pushing** — it reverts to `fobbinhard` afterwards.

---

## NOT IN THIS TICKET

Radio's secondary nav is `CHANNEL · PLAYLIST · SCHEDULE · VS · APPS · GAMES` — six tabs where the nav map says three. **Do not normalize it.** Neither of us knows whether the extra three are intended; that is an owner question.
