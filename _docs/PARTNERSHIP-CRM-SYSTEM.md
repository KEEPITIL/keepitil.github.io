# KEEPITIL Partnership CRM System
_Owner: Nexus (CGPO) · Designed per Echo directive 2026-07-01 · System design only — no outreach executed_
_Last updated: 2026-07-01_

This document specifies the partnership pipeline system for KEEPITIL: venues, promoters/organizers, brands, artist collectives, and media/press. It covers CRM structure, lead scoring, pipeline stages, outreach templates (drafts only), follow-up cadence, and the Mission Control dashboard card. Revenue-bearing deals (ticket rev-share, sponsorships, affiliate terms) get handed to Pulse (CRO) once a partner reaches the "Partner" stage.

**HARD RULE: Nothing in this document authorizes contact with any external party. All outreach requires explicit Founder approval before sending. See Section 4.**

---

## 1. CRM Structure — Notion Database

Single source of truth: a new Notion database, **Partnerships DB**, alongside the existing Artists/Organizers/Brands/Subscribers/Blog Pages DBs under the KEEPITIL workspace. One row = one external org/individual being tracked as a partnership lead (distinct from the public-facing Organizer/Brand/Artist directories — this DB is internal-only, pre-publication).

### Exact property list (create in one pass)

| Property Name | Type | Notes / Options |
|---|---|---|
| Org Name | Title | Primary field |
| Type | Select | Promoter/Organizer, Venue, Brand, Artist Collective, Media/Press, Other |
| Sub-Category | Select | e.g. Bass/Dubstep, House/Techno, Multi-Genre, Warehouse, Nightclub, Festival, Apparel, Production/AV, Photo/Video, Radio/Podcast, Blog/Press |
| Region | Select | LA, OC, SD, SF/Bay Area, IE, Other SoCal, National |
| Contact Name | Text | Primary human contact |
| Contact Role | Text | e.g. "Booking," "Founder," "Marketing" |
| Email | Email | |
| Phone | Phone | Optional |
| Instagram | URL | |
| Website | URL | |
| Other Socials | Text | TikTok, SoundCloud, etc. |
| Existing KEEPITIL Profile | URL | Link to live blog-org-/blog-brand- page if one exists |
| Tier | Select | S (flagship), A (priority), B (standard), C (long-tail) |
| Lead Score | Number | 0–100, see Section 2 |
| Score Breakdown | Text | Free text: sub-scores per factor, for auditability |
| Stage | Select | Identified, Researched, Outreach Drafted, Contacted, In Conversation, Partner, Dormant (see Section 3) |
| Status Flag | Select | On Track, Needs Founder Decision, Blocked, Stale |
| Owner | Select | Nexus, Founder, Pulse (for revenue handoff) |
| Date Identified | Date | |
| Last Touch | Date | Most recent outbound or inbound contact |
| Next Action | Text | Single next step, human-readable |
| Next Action Due | Date | |
| Outreach Channel | Select | IG DM, Email, In-Person, Referral, Other |
| Partnership Type Sought | Multi-select | Cross-Promo, Event Listing, Affiliate/Ticket Rev-Share, Sponsored Content, VIP Table Partner, Media Trade, Brand Placement |
| Deal Terms | Text | Filled once in "Partner" stage; freeform until finance template exists |
| Notes | Text (long) | Running log |
| Source | Select | Founder Referral, Event Scouting, Inbound Application, Web Research, Existing Profile Upgrade |
| Approval Status | Select | N/A, Draft Pending Approval, Approved, Rejected — tracks outreach copy approval specifically |
| Linked Notion Pages | Relation | Optional relation to Organizers DB / Brands DB row if/when they go live publicly |

**Views to create:**
- **Pipeline Board** — grouped by Stage (kanban)
- **This Week's Actions** — filtered Next Action Due ≤ 7 days, sorted ascending
- **By Tier** — grouped by Tier, sorted by Lead Score descending
- **Needs Founder** — filtered Status Flag = "Needs Founder Decision" or Stage = "Outreach Drafted"

---

## 2. Lead Scoring Model (0–100)

Five weighted factors. Score entered manually by Nexus during Research stage; recalculated if circumstances change materially (e.g., a promoter blows up on IG).

| Factor | Weight | Scoring guide |
|---|---|---|
| Audience Size | 25 pts | 0–5 pts: <1K followers/list · 6–12: 1K–10K · 13–19: 10K–50K · 20–25: 50K+ or proven consistent draw (500+ heads/event) |
| LA-Scene Relevance | 25 pts | 0–8: outside SoCal underground scene entirely · 9–16: adjacent (mainstream EDM, other regions) · 17–25: core LA/OC/SD underground — matches KEEPITIL's actual audience |
| Event Frequency / Activity | 20 pts | 0–5: dormant or <1 event/quarter · 6–12: monthly-ish · 13–20: weekly/biweekly active calendar, brand constantly shipping |
| Brand Alignment | 20 pts | 0–7: corporate, mainstream, or tonally off (doesn't fit underground/DIY voice) · 8–14: neutral fit · 15–20: strong authentic fit — could sit on KEEPITIL today without translation |
| Prior Contact / Warmth | 10 pts | 0: cold, no relationship · 4–6: knows KEEPITIL exists, mutual follow, light engagement · 7–10: warm — Founder relationship, has DM'd first, or already has a live KEEPITIL profile |

**Tier mapping (auto-guide, not a Notion formula requirement — apply manually or via Notion formula field later):**
- **S (85–100):** flagship — pursue first, Founder briefed proactively
- **A (65–84):** priority — active pipeline
- **B (40–64):** standard — worked in batches
- **C (<40):** long-tail — parked, revisit if circumstances change (e.g., they blow up, or KEEPITIL needs that category filled)

---

## 3. Pipeline Stages

Seven stages. Every stage has explicit entry/exit criteria so nothing sits ambiguously.

### 1. Identified
- **Entry:** Org discovered via scouting, referral, or inbound application; Notion row created with Org Name, Type, at least one contact channel.
- **Exit:** Lead Score calculated, Tier assigned → move to Researched.

### 2. Researched
- **Entry:** Score complete.
- **Work done:** Verify socials/website are current, confirm decision-maker/contact, check for existing KEEPITIL profile overlap, note 2–3 specific hooks for outreach (recent event, shared audience, mutual connection).
- **Exit:** Notes field has enough for someone else to write outreach without re-researching → move to Outreach Drafted.

### 3. Outreach Drafted (Founder approval required)
- **Entry:** Nexus drafts specific outreach copy (using or adapting templates in Section 4) into the Notes field, sets Approval Status = "Draft Pending Approval."
- **Exit criteria:** Founder reviews and marks Approval Status = "Approved" or "Rejected." **No message leaves this stage without that approval.** Rejected drafts return to Researched with feedback logged in Notes.

### 4. Contacted
- **Entry:** Approved message actually sent (by Founder or Founder-authorized channel).
- **Exit:** Any reply received (positive, negative, or referral) → In Conversation. If no reply after cadence window (Section 5) → stays in Contacted, follow-up logged, or ages into Dormant.

### 5. In Conversation
- **Entry:** Two-way dialogue started.
- **Work done:** Track terms discussed in Deal Terms field, log every exchange in Notes with dates.
- **Exit:** Either a mutual agreement is reached → Partner, or the conversation clearly stalls/declines → Dormant.

### 6. Partner
- **Entry:** Agreement in place (even informal — e.g., "we'll cross-post each other's events").
- **Work done:** Deal Terms finalized. If partnership has revenue mechanics (ticket rev-share, sponsorship fee, affiliate code), **hand off to Pulse (CRO)** — set Owner = Pulse, keep Nexus as secondary. If it produces a public profile, flag to Atlas for blog-org-/blog-brand- page creation.
- **Exit:** N/A — ongoing; revisit quarterly. Can move to Dormant if relationship lapses.

### 7. Dormant
- **Entry:** No response after full cadence, explicit decline, or a Partner relationship that's gone inactive.
- **Work done:** Log reason. Set a "revisit" note if there's a future trigger (e.g., "revisit if they hit 10K IG followers" or "revisit next festival season").
- **Exit:** Can be reactivated back to Researched or Outreach Drafted if circumstances change — never delete, keep as institutional memory.

---

## 4. Outreach Templates

**⚠️ DRAFTS ONLY. Founder must approve exact copy before anything is sent, per stage 3 above and the standing Approval Before Posting rule. These are starting points to be personalized per lead, not final copy. Nexus does not send messages under any circumstance — Founder sends or explicitly authorizes.**

Voice: direct, peer-to-peer, scene-literate. No corporate partnership-speak ("synergies," "unlock value," "circle back"). Short. Sounds like one person in the scene messaging another.

### Template A — Promoter / Organizer

> **Channel:** IG DM or email
> **Subject (if email):** quick one from KEEPITIL
>
> Hey [Name] — [specific hook, e.g. "saw the lineup for [event], that's a hard bill"]. We run KEEPITIL, been putting SoCal underground artists/orgs/events in one place — no bots, no pay-to-play garbage, just the scene we're actually in.
>
> Would be down to get [Org] listed on the site and cross-post your events on our calendar — free, no strings, just trying to make it easier for heads to find real shows instead of scrolling five different IG pages. If you're open to it we can also talk about something bigger down the line (ticket links, joint promo, whatever makes sense).
>
> Lmk if you're interested, happy to send over what it'd look like.
>
> — [Founder name], KEEPITIL

### Template B — Brand

> **Channel:** IG DM or email
> **Subject (if email):** partnering with KEEPITIL — quick idea
>
> Hey [Name] — been following [Brand], [specific hook, e.g. "the gear you dropped for [event/season] was clean"]. We're KEEPITIL — underground dance music platform covering LA/OC/SD, artist and brand profiles, events calendar, culture blog.
>
> We're building out our brand directory with stuff people in the scene actually rock/use, not just whoever pays for an ad. Would love to feature [Brand] with a real profile page — your story, what you make, links back to your shop. If it's a fit we can also talk affiliate/referral setup so it's not just a favor either direction.
>
> No pressure either way — figured I'd reach out since you're already part of the scene we're building this for.
>
> — [Founder name], KEEPITIL

### Template C — Venue

> **Channel:** Email (venues tend to be more formal) or IG DM
> **Subject (if email):** KEEPITIL x [Venue] — events partnership
>
> Hi [Name] — we run KEEPITIL, a platform for the underground dance scene across SoCal (events calendar, artist/organizer profiles, culture coverage). [Specific hook, e.g. "[Venue] comes up constantly when people talk about where the real nights happen."]
>
> We'd like to list [Venue]'s events on our calendar and build out a venue profile — helps people discover shows there beyond whoever's already on their radar. Down the line, open to talking ticket link partnerships or a VIP table arrangement if there's mutual upside.
>
> Free to set up on our end, just want to make sure your calendar's accurate and you're getting the right traffic. Let me know if you want to hop on a quick call or just handle it over email.
>
> — [Founder name], KEEPITIL

---

## 5. Follow-Up Cadence + Automation

### Cadence (applies once a message is actually sent — Contacted stage)
| Touch | Timing | Notes |
|---|---|---|
| Initial outreach | Day 0 | Founder-sent, approved copy |
| Follow-up 1 | Day 5–7 | Light bump, not a new pitch — "just following up, no rush" energy |
| Follow-up 2 | Day 14 | Final check-in; can include a small new hook (e.g., a relevant upcoming event) |
| Move to Dormant | Day 21 if no response | Log and park; do not keep pinging — underground scene etiquette is not to be a pest |

For **In Conversation** leads with active back-and-forth, cadence is conversational — respond promptly, no fixed schedule, but if a lead goes quiet mid-conversation for 10+ days, one check-in is appropriate before letting it settle toward Dormant.

### What can be automated (no Founder needed)
- Notion database maintenance: creating rows for new leads found during research, populating Type/Region/Socials/Notes
- Lead scoring calculation and Tier assignment
- Moving stages Identified → Researched → Outreach Drafted (drafting the copy, not sending it)
- Flagging "Next Action Due" items and surfacing them on the This Week's Actions view
- Auto-flagging leads that have sat in Contacted past Day 21 → recommend Dormant (still requires a glance, not a decision)
- Drafting follow-up 1 / follow-up 2 copy for review (same approval gate as initial outreach)
- Weekly pipeline summary compiled for the Mission Control card / Strategy Log

### What always needs the Founder
- Approving any outreach copy before it sends (Stage 3 gate — non-negotiable, matches Approval Before Posting hard rule)
- Actually sending any message, on any channel
- Verbal/in-person conversations at events (Founder is the public relationship, per exec charter)
- Finalizing Deal Terms / anything with money attached (revenue terms route to Pulse for structuring, but Founder approves final terms)
- Deciding to reactivate a Dormant flagship (S-tier) lead

---

## 6. Partnership Dashboard Spec — Mission Control Card

New card under the existing **Partnerships (Nexus)** section of `echo-dashboard.html` (per Mission Control's modular `DEPTS` config — this is a config entry, not a layout change, so it does not violate the design freeze on public-facing pages; Mission Control is an internal tool).

### Card contents

**1. Pipeline Snapshot (counts by stage)**
Horizontal bar or simple count row: Identified · Researched · Outreach Drafted · Contacted · In Conversation · Partner · Dormant. Click-through to filtered Pipeline Board view in Notion.

**2. Needs Founder Now**
Short list, pulled from Approval Status = "Draft Pending Approval" + Status Flag = "Needs Founder Decision." Each row: Org Name, Type, one-line why it needs Founder, link to Notion row. This is the section that actually gets read — keep it to what genuinely needs a decision, per the Founder Protection Rule.

**3. Next Actions Due (7-day window)**
List from the "This Week's Actions" Notion view: Org Name, Next Action, Due Date, Owner. Overdue items highlighted.

**4. Recent Wins**
Last 3–5 leads that moved to Partner stage, with a one-line note on what the partnership is (e.g., "Cross-promo + event listing" or "Affiliate link live"). Positive-signal section, good for weekly brief.

**5. Tier Breakdown**
Small stat block: count of S/A/B/C tier leads currently active (not Dormant). Gives Echo/Founder a sense of pipeline quality at a glance, not just volume.

**6. Freshness Indicator**
Flag if the Partnerships DB hasn't been touched (no new rows or stage moves) in 7+ days — surfaces if this pipeline is going stale relative to other departments.

### Data source
Notion Partnerships DB is authoritative (per exec charter: Notion under ⚡ PASSIVE = single source of truth). Mission Control card queries/displays it — does not duplicate or fork the data.

### Reporting
Weekly pipeline summary (counts by stage + tier + needs-Founder list) gets logged to the Notion 📣 Strategy Log per the standard ATLAS → ECHO update format, with Nexus as the reporting department. Nothing here overrides the Approval Gate — a full pipeline of "Partner" stage rows still means zero messages were sent without Founder sign-off along the way.

---

## Category grounding (for reference — not exhaustive)
Based on current KEEPITIL directory structure, partnership targets fall into: **Promoters/Organizers** (45+ existing profiles, e.g. Goldenvoice, Insomniac, Do LAB, Low End Theory, Symbiosis, Dark Matter Events), **Venues** (Avalon Hollywood, Fonda Theatre, Echoplex, Sound Nightclub, Exchange LA), **Brands** (29 existing, e.g. Dirtybird, Create Music Group, Bass Coast Gear, Basshead Apparel, SoCal LED, ProDJ Supply), **Artist Collectives**, and **Media/Press** (blogs, radio, podcasts covering the scene). Existing profiles are candidates for Partnership DB upgrade even though they're already public — a live profile does not imply an active partnership relationship exists behind it.
