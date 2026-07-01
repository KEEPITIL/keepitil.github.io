# KEEPITIL — Automation Opportunities Catalog v1.0

**From:** Fable-Atlas (Executive Ops) · **Date:** 2026-07-01 · **For:** Echo review
**Goal (Echo Priority C):** reduce repetitive work; cut Founder time spent on execution. Ranked by (time saved × frequency) ÷ build effort.

---

## Already running (baseline — keep, harden)
- Events expiry script (expire day after end) — extend to also trigger chat-page "photo drop" post (see EVENT-COMMUNITY-ARCHITECTURE §3)
- Posh event fetcher
- Culture Blog Pipeline (Notion DB → blog pages)
- Scheduled campaign drafts (`_echo/campaign-drafts-*.md`)

## Ranked new opportunities

### 1. Weekly executive report (HIGH, build first)
Scheduled task, Mondays: compile GA4 numbers (once analytics ships), events added/expired, blog posts published, pipeline moves, open Founder items → one Strategy Log entry + Mission Control refresh. Replaces ad-hoc "what happened this week."
**Founder time saved:** ~1h/wk. **Effort:** low (all sources already structured).

### 2. Event auto-populate hardening (HIGH)
Posh fetcher → staging queue in Notion instead of direct page edits: new events land as "pending" rows with flyer/genre/badges pre-filled; Founder approves in Notion; site build consumes approved rows. Kills manual card building AND enforces the approval gate.
**Effort:** medium.

### 3. QA-on-schedule (HIGH)
Nightly scheduled run: qa_profiles checks + link checker + image-404 sweep + nav/logo-blend audit across all pages → Strategy Log entry only when something fails (silence = healthy). Catches breakage before users do.
**Effort:** low (checks exist; needs scheduling + reporting wrapper).

### 4. Blog scheduling (MEDIUM)
Notion Culture pipeline gets a `publish_date`; scheduled task builds+queues pages due that day into the next push batch, updates blog-manifest.json, drafts the social copy (approval-gated as always).
**Effort:** low-medium.

### 5. Affiliate link auditor (MEDIUM)
Weekly: crawl site for affiliate links → verify targets resolve, Amazon tag `tuitea-20` intact, no dead promos → flag in Strategy Log. Protects revenue silently.
**Effort:** low.

### 6. Deploy checklist automation (MEDIUM)
Turn OPERATIONS-PLAYBOOK pre-deploy checklist into a script: one command runs all checks and emits a pass/fail Founder Review-ready report. Pairs with the .command push flow.
**Effort:** medium.

### 7. Release notes generator (LOW)
Diff-based: generate the release-notes template pre-filled from changed files since last push.
**Effort:** low.

### 8. Partnership follow-up nudges (LOW, after CRM exists)
Scheduled: scan Partnerships DB for stale `next action` dates → Strategy Log nudge line. Never sends outreach itself (hard rule).
**Effort:** low.

## Constraints honored
- Autonomous runs have no browser and can't push → anything needing a push preps a `.command` and flags the next interactive session (standing memory rule).
- Nothing publishes or sends externally without Founder approval — automations draft and flag only.
- Notion = single source of truth; every automation reports to the Strategy Log.

## Recommended build order
1 → 3 → 5 (three low-effort/high-signal wins) → 2 → 4 → 6 → 7 → 8.
