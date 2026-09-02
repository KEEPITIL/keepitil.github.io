# KEEPITIL — Operations Playbook
> Owner: Sentinel (COO) · Ordered by Echo (CEO) · Last updated: 2026-07-01
> Extends `_docs/MAIN-SOP.md` — does not contradict it. If the two ever conflict, MAIN-SOP wins on technical procedure; this doc wins on process/approval/reporting.
> A new agent should be able to execute any workflow below without asking for extra context.

---

## 0. HOW TO USE THIS DOC

1. Find the work type in **Section 1** → follow trigger → steps → QA gate → reporting.
2. Every QA gate references the checklists in **Section 2** — run them, don't skip.
3. Anything touching production follows the **Deployment Playbook** (Section 3).
4. If something breaks, jump straight to **Incident Response** (Section 4).
5. Need to undo a push → **Rollback Procedures** (Section 5).
6. Every production push gets a release note → **Section 6 template**.

---

## 1. STANDARD OPERATING PROCEDURES

### 1.1 Profile Builds (Artist / Brand / Organizer)

**Trigger:** New Apply submission approved, Nexus partnership signed, or Founder/Echo directive to add a profile.

**Steps:**
1. Confirm which type: artist / brand / organizer. Get slug (lowercase, hyphenated, matches existing slug patterns in KEEPITIL-context.md).
2. Copy the correct template:
   - Artist → `.templates/blog-artist-template.html` → `blog-[slug].html`
   - Organizer → `.templates/blog-organizer-template.html` → `blog-org-[slug].html`
   - Brand → `.templates/blog-brand-template.html` → `blog-brand-[slug].html`
3. Fill required fields per type:
   - **Artist:** name, bio, IG URL, SoundCloud embed, genres, city. Book/Contact button → artist's IG (not `#subscribe`).
   - **Organizer:** org name, circular profile image (110px), Q&A (2–4 questions), IG, Schema.org Organization JSON-LD.
   - **Brand:** brand name, square logo (border-radius:12px), "What They Offer" + 2×2 service grid, IG follow CTA.
4. If any required field is missing (bio, image, IG, etc.): web-search for it first. If still unavailable, leave the field empty and flag it explicitly in the report — never fabricate.
5. Use the mandatory 7-section template structure (nav, hero, music player, about/QA, info-card with 3 buttons, pnav, footer) — reference `blog-groove-trooper.html`.
6. Add entry to the section index array (`artist/index.html` → DJS, `organizer/index.html` → ORGS, `brand/index.html` → VENDORS).
7. Add to Notion (Artists / Organizers / Brands DB) and to `_docs/blog-manifest.json`.

**QA Gate:**
- Run `python3 pre-push-audit.py blog-[slug].html` — 0 errors required.
- Run `qa_profiles.command` (11-point profile check) — CRITICAL findings block completion; WARNING is acceptable.
- Run the Pre-Deploy Checklist (Section 2.1) on the new page + the section index page it was added to.
- Run `content-organizer` and `platform-audit` skills.

**Reporting:**
- Log to Notion Strategy Log (profile added, slug, missing-field flags if any).
- Standard ATLAS/SENTINEL → ECHO update format (Section 3, org charter) if this is part of a batch or Echo requested visibility.
- Push per Section 3 (Deployment Playbook) — do not push until QA gate passes.

---

### 1.2 Blog Posts (Culture Articles / News / Guides)

**Trigger:** Pulse content calendar item, Culture Blog Pipeline (Notion DB) entry marked ready, or direct editorial directive.

**Steps:**
1. `cp _templates/blog-culture-template.html blog-[slug].html`
2. Fill: title, body content, category, canonical URL, OG tags, hero image.
3. Build from `blog-template.html` brand standard (logo w/ `mix-blend-mode:screen`, palette, Inter font).
4. Add to `culture/index.html` → articles array, correct category.
5. Add to Notion Blog Pages DB + `_docs/blog-manifest.json`.

**QA Gate:**
- `python3 pre-push-audit.py blog-[slug].html` — 0 errors.
- Pre-Deploy Checklist (Section 2.1).
- Verify no unapproved copy/image — content + image must both be Founder-approved before any publish (standing rule: never auto-publish).

**Reporting:**
- Log to Notion Strategy Log.
- If content involves claims, sponsorship, or partner mentions, route through Echo review before Founder approval.

---

### 1.3 Events Updates

**Trigger:** New event confirmed (Posh fetcher, organizer submission, Nexus partnership), event expired (nightly expiry script), or KEEPITIL Pick curation cycle.

**Steps:**
1. Add event card HTML to `events/index.html` in the correct month section, following the KEEPITIL Events Card Layout Standard:
   - KEEPITIL PICK banner (full-width gradient) at top of featured cards only.
   - Price bottom-left (`ev-price`, "From $XX").
   - Tickets bottom-right (`ev-ticket-link`, "Get Tickets →").
   - Exactly 3 KEEPITIL PICKS per month — no more, no fewer.
   - Card min-height:340px; body flex:1; footer margin-top:auto.
2. Add event to `_data/events/events-all.json`.
3. Run the Event Content Audit (Section 1.3 QA gate below) before touching anything else.
4. Expired events: confirmed by nightly expiry script → move to `_data/events/events-archive.json`, remove card from live index.

**QA Gate — Event Content Audit (run after ANY events change):**
- [ ] No Pexels/generic stock flyer images — every flyer is a real event image.
- [ ] No duplicate flyers reused across different events (except explicitly-flagged seed/placeholder events, which must be labeled as such internally).
- [ ] No generic/placeholder ticket links — each event links to its real ticket page.
- [ ] KEEPITIL-owned events are in the correct section (not miscategorized as third-party).
- [ ] No dead filter options (genre/month filters all resolve to real content).
- [ ] Exactly 3 PICKS per month, correct banner placement.
- `python3 pre-push-audit.py events/index.html` — 0 errors.

**Reporting:**
- Log to Notion Strategy Log (events added/removed, count).
- Flag any event using placeholder/seed data explicitly — never let seed data pass silently as real.

---

### 1.4 Homepage / Staging Changes

**Trigger:** Echo/Founder directive for homepage or major section redesign, new feature (e.g., discovery hub, calendar), or structural change to a live section page.

**Steps:**
1. **Never edit `index.html` (or any live `section/index.html`) directly for anything beyond trivial content fixes.** Build/edit in the staging copy:
   - Homepage → `index-staging.html` or a named staging build (e.g., `events-staging.html`)
   - Section → `[section]/_staging/index.html`
2. Preserve the KEEPITIL shell (nav, hero, radio bar, footer) — Design Freeze applies (Section 2.1) unless the user has explicitly said "update template."
3. Build the full feature in staging. Add `<meta name="robots" content="noindex,nofollow">` to the staging file so it never gets indexed.
4. Self-test in staging: 3-second scan test + 3-click discovery test (Section 2.3).
5. Run full Pre-Deploy Checklist (Section 2.1) against the staging file.
6. Prepare the Founder Review Package (Section 3.2) — do NOT promote to production without it.
7. Route to Echo for review before it reaches the Founder queue (chain of command: Sentinel coordinates QA → Echo reviews → Founder approves).

**QA Gate:**
- Full Pre-Deploy Checklist (Section 2.1).
- 3-second scan test + 3-click discovery test — both must pass.
- `python3 pre-push-audit.py [staging-file]` — 0 errors.
- Staging file confirmed `noindex`.

**Reporting:**
- Founder Review Package delivered via Notion Strategy Log + Echo Dashboard entry (see Section 3.2 for exact contents).
- Never push to production from this SOP alone — production push only happens after Founder approval (Section 3.3–3.5).

---

### 1.5 Marketing Content (Social, Email, Campaigns)

**Trigger:** Pulse/Nexus campaign calendar item, holiday branding cycle (see holiday-branding-calendar.md), or direct Echo/Founder directive.

**Steps:**
1. Confirm channel (IG, email/SendGrid, ChatGPT exec group is NOT a marketing channel — internal only).
2. Draft copy AND select/create image or video asset together as one package — never approve copy without its paired visual.
3. If holiday-themed: confirm which US holiday, check it's staged ahead of the actual date per the holiday branding calendar.
4. If it touches affiliate/referral links: pull current live links from the KEEPITIL Monetization Hub doc — never hardcode stale links.

**QA Gate:**
- Brand voice / style check (marketing:brand-review skill if available) — flag unsubstantiated claims, missing disclaimers, off-voice copy.
- Both copy AND image/video must be present and internally reviewed before it goes anywhere near Founder approval.

**Reporting:**
- Present copy + image together to Founder for approval. **HARD RULE: never post to any platform until the Founder approves BOTH copy AND image/video — no auto-publish, ever.**
- After approval and posting: log to Notion Strategy Log + post task update to ChatGPT exec group (per Post-Task System rule) + relay to Echo if it was a Founder directive.

---

## 2. QA CHECKLISTS

### 2.1 Pre-Deploy Checklist (run on every site change before ANY push)

**Structure / Nav**
- [ ] Full site nav present and in exact order: KEEPITIL logo | Home | Spotlight | Artists | Brands | Organizers | Events | Culture | Apply
- [ ] Nav logo `<img>` has `mix-blend-mode:screen` (or the drop-shadow filter per NAV-STD) — logo will disappear on push without this
- [ ] `nav-cta` class present on Apply button
- [ ] NAV-STD CSS block present in `<style>`
- [ ] SoundCloud player (`#radio-bar`, `#sc-player`) present on every section/index page, `auto_play=true`, z-index 200, body padding-bottom 90px

**Content Integrity**
- [ ] No broken images (all local `src` paths resolve)
- [ ] No dead internal `.html` links
- [ ] No dead-end anchor buttons (`href="#id"` with no matching element)
- [ ] No Pexels/generic stock photography anywhere on events or profiles
- [ ] No duplicate event flyers (except explicitly flagged seed data)
- [ ] Book/Contact links point to the correct destination (IG for artists, not `#subscribe`, except documented email exceptions: Groove Trooper, Lvnky Bonez, Swerve, RAB3L)

**Technical**
- [ ] UTF-8 charset meta present
- [ ] Viewport meta present
- [ ] No mojibake / encoding artifacts
- [ ] No JS `getElementById()` calls targeting missing DOM ids
- [ ] Canonical URL + `og:title` present on all blog pages
- [ ] No PJAX code anywhere (permanently removed — causes `const` re-declaration crashes)

**Staging-specific**
- [ ] `<meta name="robots" content="noindex,nofollow">` present on any staging file (must NEVER go live with noindex still on — remove only at production promotion)

**UX validation**
- [ ] 3-second scan test passed (Section 2.3)
- [ ] 3-click discovery test passed (Section 2.3)

**Automated:**
```bash
cd ~/Desktop/Claude\ Cowork
python3 pre-push-audit.py               # all pages
python3 pre-push-audit.py [file.html]   # single file
```
Pass criteria: **0 errors** = safe to push. Warnings = review, push at discretion. Any error = fix first.

---

### 2.2 Profile-Specific QA (11-point check)

Run `qa_profiles.command` from sandbox after every profile change. Checks the 7 mandatory sections (nav, hero, music player, about/QA, info-card w/ 3 buttons, pnav, footer) plus nav completeness, image integrity, and IG/contact link correctness.
- **CRITICAL** finding → blocks completion, must fix before proceeding.
- **WARNING** → acceptable, note in report.
- Known baseline: 9 profiles have flagged missing info-cards — don't re-report these as new unless they regress further.

---

### 2.3 UX Validation Tests

**3-second scan test:** Load the page fresh. In 3 seconds, can a first-time visitor tell (a) what KEEPITIL is, (b) what this page is for, (c) what to do next? If not, fails.

**3-click discovery test:** From this page, can a visitor reach any of {an event, an artist profile, the Apply page} in 3 clicks or fewer? If not, fails.

Both required on: homepage, any new/changed section index page, any staging build before Founder review.

---

## 3. DEPLOYMENT PLAYBOOK

### 3.1 Environments

| Environment | Location | Notes |
|---|---|---|
| **Staging** | `index-staging.html`, `events-staging.html`, or `[section]/_staging/index.html` | Local/preview only. Must carry `noindex`. Never linked from live nav. |
| **Production** | `index.html`, `[section]/index.html` | Live on keepitil.com. Only reachable via approved push. |

### 3.2 Founder Review Package (required before ANY staging → production promotion of a structural/homepage/section change)

Prepare as a Notion Strategy Log entry (and Echo Dashboard item). Must contain, in this order:

1. **Before / After** — live URL vs. staging URL, side by side.
2. **What changed** — bullet list, specific (new sections, layout changes, data changes).
3. **Why it changed** — user/business benefit, tie back to the directive that triggered it.
4. **Known issues / honest caveats** — seed data, placeholders, anything not production-perfect. Never omit known issues to make a build look more finished than it is.
5. **Rollback plan** — exact backup file location + rollback method (Section 5).
6. **Recommendation** — Sentinel's clear go/no-go recommendation with reasoning, not just a data dump.

*Reference example on file:* `_docs/FOUNDER-REVIEW-homepage-events-v6.md` — use this as the format template.

Simple content-only pushes (single profile, single blog, routine event add) do NOT require a full Founder Review Package — QA gate + Notion log entry is sufficient. Full package is required for: homepage changes, any section index redesign, nav/design changes, new features.

### 3.3 Approval Chain

```
Sentinel QA gate passes
   → Founder Review Package logged (Notion Strategy Log + Echo Dashboard)
   → Echo reviews (strategy/quality check)
   → Founder gives explicit go/no-go
   → ONLY THEN: production push
```
No content, code, or campaign reaches production or goes public without Founder approval. Routine ops (single profile add, single event add that follows existing standards) can proceed under standing approval per feedback-push-without-asking — but is still logged.

### 3.4 Production Push Procedure

> Sandbox bash cannot reach api.github.com. All pushes execute via `.command` files double-clicked in Finder (or opened/run via computer-use — never ask the user to do it manually; standing rule is Claude runs it).

1. Confirm Pre-Deploy Checklist (2.1) passed with 0 errors.
2. Confirm Founder approval obtained (if required per 3.3).
3. Back up the current live file(s) about to be overwritten into `_docs/rollback/` before promoting, named `[file]-live-backup-[YYYY-MM-DD].html`.
4. Select the correct push script:

| Script | Scope |
|---|---|
| `push-all-with-player.command` | All ~220 HTML files + assets |
| `push-main-pages.command` | Main section pages only |
| `push-artist-pages.command` | Artist blog pages only |
| `push-brand-pages.command` | Brand blog pages only |
| `push-org-pages.command` | Organizer blog pages only |
| `push-spotlight.command` | Spotlight only |
| `_scripts/push/promote-[feature].command` | Purpose-built promote script (e.g., homepage) — copies staging → live, requires typed "YES" confirmation |

5. For files >50KB, use the Mac `.command`/Python method (Chrome JS chunking fails above ~50KB).
6. Open/run the `.command` file (computer-use — do not ask the user to do it).
7. Wait ~2–3 minutes for GitHub Pages to rebuild.
8. Proceed to Post-Push Verification (3.5).

### 3.5 Post-Push Verification

1. Visit the live URL(s) on keepitil.com and confirm the change is visible.
2. If Cloudflare serves stale content: Cloudflare dashboard → keepitil.com → Caching → Purge Everything.
3. Re-run the relevant Pre-Deploy Checklist items against the LIVE page (not just staging) — nav, images, links, SoundCloud player.
4. Confirm `noindex` was removed if this was a staging → production promotion of a previously-noindexed page.
5. Spot check on mobile viewport if the change touches layout.
6. Write the Release Note (Section 6) and log it.
7. Post task completion update per Post-Task System (Notion Strategy Log entry; ChatGPT exec group post if that channel is active).
8. Close any Terminal windows opened for the push.
9. Report completion to Echo and explicitly ask for next steps (standing rule — never skip the ask).

---

## 4. INCIDENT RESPONSE

### 4.1 Detect

Sources: nightly Live Health Check (6:00 AM Chrome visit to all 7 sections), weekly Link Audit (Monday 7 AM), platform-audit skill on every edit, manual report from Founder/Echo, or a failed post-push verification (Section 3.5).

Severity triage — classify immediately:
- **CRITICAL** — production page fully broken (500/blank/JS crash blocking render), broken nav/logo site-wide, broken checkout/apply flow, security exposure (token leaked).
- **HIGH** — broken images/logo on specific pages, broken SoundCloud player, dead links on a section index, bad data pushed (wrong events/profiles).
- **MEDIUM** — single profile/blog page issue, cosmetic regression, non-blocking console errors.
- **LOW** — warning-level audit findings, known/flagged issues already logged.

### 4.2 Triage

1. Reproduce on the live URL — screenshot/console check via Chrome MCP.
2. Identify scope: one page, one section, or site-wide?
3. Identify root cause: bad push, Cloudflare cache, broken data file, external dependency (SoundCloud, Supabase) down?
4. Decide: **fix-forward** (small, well-understood fix) vs. **rollback** (unclear cause, or fix would take longer than restoring last-known-good).
   - CRITICAL or unclear root cause → rollback first, root-cause after.
   - HIGH/MEDIUM with clear, fast fix → fix-forward, but back up current state first.

### 4.3 Communicate

Immediately for CRITICAL/HIGH, same-day for MEDIUM/LOW:
1. **Notion Strategy Log** — post entry: what broke, severity, detected via, action taken/in progress. (Durable record — required for all severities, including headless/scheduled detections.)
2. **ChatGPT exec group** — post using standard ATLAS/SENTINEL → ECHO format:
   ```
   📋 SENTINEL → ECHO
   Project: [affected section/page]
   Current Status: Critical Issue
   Completed: • [what's confirmed broken]
   Current Questions: [any decision needed]
   Known Issues: • [detail, scope, suspected cause]
   Recommendation: [rollback / fix-forward / need Founder input]
   Next Planned Tasks: [immediate next action]
   ```
   Post as ONE line (composer sends on Enter) — use separators, not literal newlines.
3. Founder Executive Inbox: CRITICAL issues route to 🔴 Critical Issues category via Echo.
4. Do not wait for Founder response to stop the bleeding on CRITICAL — rollback under standing authority, notify in parallel.

### 4.4 Fix or Rollback

- **Rollback:** follow Section 5 immediately.
- **Fix-forward:** make the fix, run full Pre-Deploy Checklist (2.1), back up pre-fix state, push per Section 3.4, verify per Section 3.5.
- Either way: update the incident's Notion Strategy Log entry with resolution + timestamp once confirmed fixed on production.

### 4.5 Post-Incident

- Add root cause + fix to MAIN-SOP Section 10 (Known Issues table) if it's a new failure pattern.
- If it reveals a gap in `pre-push-audit.py`, flag for a new automated check.
- Close out: report to Echo, ask for next steps, close any open Terminal windows.

---

## 5. ROLLBACK PROCEDURES

### 5.1 Using `_docs/rollback/`

1. Every structural/homepage/section promotion must have a pre-push backup saved at `_docs/rollback/[file]-live-backup-[YYYY-MM-DD].html` (created in Section 3.4 step 3).
2. To roll back:
   - If a purpose-built rollback script exists (e.g., `_scripts/push/rollback-homepage.command`) — run it. It restores the backup file → live filename and pushes automatically.
   - If no dedicated script exists: manually copy the backup file over the live file, then push using the appropriate script from the table in 3.4.
3. Confirm rollback took effect: re-run Post-Push Verification (3.5).
4. Purge Cloudflare cache if stale content persists.
5. Log the rollback in Notion Strategy Log + ChatGPT exec group (Section 4.3 format), noting it was a rollback and why.

### 5.2 Using git (if/when the repo is git-tracked locally beyond GitHub Pages deploy)

1. Check current state: `git status`, `git log --oneline -10` on the affected file.
2. Identify last-known-good commit: `git log -- [file]`.
3. Revert the specific file: `git checkout [last-good-commit-hash] -- [file]`.
4. Or revert the whole commit if scoped correctly: `git revert [commit-hash]`.
5. Do NOT force-push or rewrite history on shared branches.
6. After restoring locally, push to production via the standard `.command` procedure (Section 3.4) — git revert alone does not update the live GitHub Pages deploy unless the push scripts read from the git working tree.
7. Verify + log per 5.1 steps 3–5.

**Note:** `_docs/rollback/` file backups are the primary/faster method for this project since deploys go through `.command` scripts rather than a git push workflow. Use git rollback only if the `.command`/backup-file method is unavailable or the git history has the only copy of last-known-good.

---

## 6. RELEASE NOTES TEMPLATE

Use for every production push. Log to Notion Strategy Log; attach to Echo Dashboard if it was a Founder Review Package item.

```
RELEASE NOTE — [YYYY-MM-DD] — [short title]

Pushed by: [agent name]
Scope: [files/pages changed]
Push method: [script name used]

What changed:
- ...

Why:
- [trigger/directive reference]

QA gate: [PASS — 0 errors / PASS with warnings: ... ]
Founder approval: [required? Y/N — if Y, approved by/when]

Backup location: _docs/rollback/[filename]-live-backup-[date].html (or "N/A — content-only change")

Post-push verification: [PASS/FAIL + notes]

Known issues / follow-ups:
- ...

Rollback tested: [Y/N]
```

---

## CHANGELOG
- v1.0 (2026-07-01) — Initial Operations Playbook, Sentinel. Built on MAIN-SOP.md, EXECUTIVE-AI-TEAM.md, KEEPITIL-context.md, and the live FOUNDER-REVIEW-homepage-events-v6.md example.
