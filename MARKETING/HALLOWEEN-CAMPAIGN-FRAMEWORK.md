# KEEPITIL Halloween 2026 Campaign Framework

**Prepared by:** Pulse (CRO Agent)
**For:** Echo (CEO) review, then Founder approval
**Date prepared:** 2026-07-01
**Campaign window:** Mid-September – November 1, 2026
**Halloween 2026:** Saturday, October 31
**Status:** PROPOSAL ONLY — no copy, visuals, or scheduling below is approved for publishing. Every asset, post, and offer requires explicit Founder sign-off on both copy and visuals before it goes live anywhere.

---

## 0. Why This Matters

Halloween is the single biggest night of the year for LA/OC/SoCal underground dance music — warehouse takeovers, costume culture, and afterhours events peak this weekend. This is KEEPITIL's highest-leverage moment to drive event traffic, ticket-link clicks, affiliate revenue (costume/rave-fit gear via Amazon), and membership signups. Planning starts July 1 to allow full lead time for organizer/brand outreach, content production, and design review.

---

## 1. Homepage Theme Concepts

All concepts keep the dark base + neon-green brand core intact and treat Halloween as an **accent layer only** — no structural layout changes (design freeze remains in effect; nothing below touches CSS/layout without Founder's explicit "update template" approval).

| # | Concept | Description | Where It Shows Up |
|---|---------|-------------|-------------------|
| **1** | **"Neon Haunt"** | Keep the existing dark theme + neon-green exactly as-is; add a single accent color pass — a muted pumpkin-orange glow layered behind/around the KEEPITIL-X logo mark (drop-shadow swap, same technique as the existing purple/red/cyan nav-logo variants already in the asset library). No new imagery, just a seasonal logo swap using the existing `logo-orange-nav.png` variant, similar to the color-variant system already in place (`logo-*-nav.png`). Lowest lift, fastest to approve. | Nav logo only |
| **2** | **"Underground Séance"** | Full-width thin banner strip above or below the hero (not replacing it) with a fog/smoke-texture background in near-black, a single neon-green "KEEPITIL PICK: HALLOWEEN WEEKEND" callout, and a small jack-o'-lantern or skull-mask icon rendered in the same line-art style as the existing KEEPITIL-X mark (so it reads as "on-brand," not generic clip-art Halloween). Banner links straight to the Halloween Must-Rave guide. | Homepage hero banner strip, Events index top |
| **3** | **"Blackout Rave"** | Heaviest seasonal treatment, still restrained: hero background gets a subtle animated/static grain + fog overlay (CSS filter, not a new photo asset) behind the existing content; neon-green accent color gets one temporary sibling — a deep violet/black-light purple (already exists as `logo-purple-nav.png`) used for the "Halloween" wordmark treatment only. Countdown-to-Halloween ticker element (text-only, no new component library) in the same style as any existing "days until" pattern on the site. | Homepage hero, Events index, Spotlight |

**Recommendation for Echo:** Concept 1 for immediate low-risk rollout in early October; Concept 2 as the stretch goal if design bandwidth allows before Oct 15. Concept 3 held as a 2027 option — highest production cost for marginal lift given design-freeze constraints.

**Hard constraint carried forward:** none of these ship until the Founder has approved a rendered mockup, not just this description.

---

### ✅ APPROVED PLAN — Countdown Escalation (Founder request → Echo approved 2026-07-01)

Founder chose to use ALL 3 concepts. Instead of random rotation, they run as a progressive **countdown escalation** (each phase layers on top of the prior; the site visibly intensifies toward Halloween weekend, then auto-reverts). Echo-refined dates:

| Phase | Dates | Theme | Adds |
|-------|-------|-------|------|
| 🎃 **Phase 1 — Neon Haunt** | **Oct 1–14** | Season begins | Orange neon logo glow, subtle accents only, no layout change |
| 👻 **Phase 2 — Underground Séance** | **Oct 15–25** | Event discovery | Halloween banner → Must-Rave Guide, seasonal event highlights, editorial Halloween Picks (Phase 1 styling continues) |
| 🌑 **Phase 3 — Blackout Rave** | **Oct 26–Nov 1** | Peak weekend | Hero fog effect, purple/orange wordmark, weekend countdown, featured Halloween events (all prior layers continue) |
| — **Revert** | **Nov 2** | Normal | Automatic return to standard theme — no manual cleanup |

**Echo addition — content evolves with the theme (not just decoration):**
- "Featured This Month" → "Halloween Must-See Events"
- Scene Rooms for Halloween events get seasonal badges
- Radio highlights feature Halloween mixes
- Must-Rave Guide becomes the primary editorial destination

**Standing design rule (Echo):** no seasonal theme may change navigation, page layout, user workflows, readability, or performance. Halloween is a brand overlay, not a redesign.

**Implementation:** Opus-Atlas builds the whole sequence behind a simple **date-based activation** so it triggers automatically each year with minimal maintenance. **Gate:** Fable-Atlas prepares 3 rendered mockups (one per phase) for Founder approval BEFORE any implementation begins.

---

## 2. Event Campaign Plan

Halloween weekend defined as **Thursday Oct 29 – Sunday Nov 1, 2026** (captures pre-parties, the Saturday main night, and Sunday recovery/day parties — matches how the LA underground scene actually spreads the weekend).

### 2.1 Halloween Must-Rave Guide
- New culture blog post + dedicated events filter/tag: "Halloween Must-Raves 2026."
- Curated list pulling from `events/index.html` — target 10-15 confirmed events across warehouse, club, and outdoor/desert categories once October event data is populated.
- Structure: short blurb per event, price-from, ticket link, organizer profile link (internal linking to organizer blogs — SEO + community value).
- Publish target: **Oct 1** (skeleton with confirmed events so far) → **updated Oct 20** (final lineup as more events confirm).

### 2.2 KEEPITIL PICKS — Halloween Weekend
- Follows existing enforced picks-row layout standard (3 cards, KEEPITIL PICK banner, price bottom-left, tickets bottom-right — per current events card layout standard, unchanged).
- Selection criteria: mix of (a) one warehouse/afterhours pick, (b) one club/mainstream-accessible pick, (c) one organizer-partner or KEEPITIL-affiliated pick if available.
- Picks should rotate/refresh if better events confirm closer to the date — final lock by **Oct 24**.

### 2.3 Warehouse / Afterhours Angle
- Dedicated section or callout within the Must-Rave guide specifically for warehouse and afterhours parties — this is the scene's most distinct Halloween offering vs. mainstream nightlife content, and where KEEPITIL's underground positioning has the most authority.
- Include practical info (safety, what-to-expect, afterhours etiquette) — doubles as the "warehouse survival guide" blog post in the content calendar below.
- Cross-link to organizer profiles known for afterhours programming.

---

## 3. Content Calendar (Mid-September – November 1)

Blog posts publish to `/culture`; social posts assume existing KEEPITIL social channels; email touchpoints assume existing subscriber list (Supabase-synced). All items below are **draft concepts** — headlines, copy, and creative all need Founder approval before drafting begins in earnest.

| Week | Dates | Blog Post | Social Posts | Email Touchpoint |
|------|-------|-----------|---------------|-------------------|
| 1 | Sep 14–20 | — (planning week) | Teaser: "Halloween is coming to the underground 🎃" (date/countdown only, no assets yet) | — |
| 2 | Sep 21–27 | **"Costume-Friendly Rave Fits: What to Wear (and Where to Get It)"** — Amazon affiliate links (tag: tuitea-20) for costume/rave-gear picks | Fit-check carousel teaser | — |
| 3 | Sep 28–Oct 4 | **"Halloween Must-Rave Guide 2026"** (skeleton launch, live-updated through October) | Guide launch post + link in bio update | Newsletter #1: "Your Halloween Weekend Starts Here" — guide link, save-the-date framing |
| 4 | Oct 5–11 | **"LA Warehouse Halloween: A Survival Guide"** — safety, etiquette, what-to-expect for first-timers | Warehouse-culture explainer post/reel concept | — |
| 5 | Oct 12–18 | **"Best Halloween DJ Sets & Mixes Playlist"** (ties to Radio programming, Section 7) | Playlist drop post; snippet/preview clips | Newsletter #2: KEEPITIL PICKS preview + membership offer teaser (see Section 5) |
| 6 | Oct 19–25 | Organizer/brand spotlight post (partnership-dependent, see Section 4) | Costume contest announcement (see Section 6) | Newsletter #3: Contest launch + final lineup update on Must-Rave guide |
| 7 | Oct 26–Nov 1 | **Halloween Weekend live-update post** (event changes, last-minute adds, ticket-selling-out flags) | Daily countdown posts Oct 29–31; Nov 1 "recap incoming" teaser | Newsletter #4 (Oct 28): "This Weekend: Your Halloween Cheat Sheet" — final picks, tickets, contest reminder |
| 8 | Nov 1–3 | **Halloween Weekend Recap** — best moments, contest winner announcement, thank-you to partners | Recap carousel/reel; contest winner shoutout | Newsletter #5: Recap + soft transition to next KEEPITIL PICKS cycle / membership close-out |

**Notes for Echo:**
- Affiliate-link posts (Week 2) are the clearest direct-revenue content — flag for priority copy review.
- All Amazon links use tag `tuitea-20` per standing monetization hub reference.
- Contest and giveaway copy must include clear rules/disclaimers (see Section 6) before anything publishes — legal-lite check, not just brand check.

---

## 4. Partnership Opportunities

| Type | Concept | Notes |
|------|---------|-------|
| **Organizer takeovers** | Invite 1-2 high-activity organizers (e.g., from the confirmed roster — Insomniac, Goldenvoice, Do LaB, Hard Events, or a smaller warehouse-focused organizer for authenticity) to "take over" KEEPITIL's Instagram Story or a dedicated blog Q&A for a day during Week 6, previewing their Halloween lineup. | Reach out by early September; needs organizer opt-in, no cost. |
| **Brand costume collabs** | Partner with 1-2 apparel/rave-gear brands already in the directory (e.g., `rave-clothing-co`, `bass-coast-gear`, `basshead-apparel`) for a co-branded "Halloween Fit Guide" — brand gets featured placement + backlink, KEEPITIL gets content + potential affiliate/promo code. | Aligns naturally with Week 2 costume blog post. |
| **Ticket giveaway cross-promos** | Partner with one organizer to giveaway a pair of tickets to a flagship Halloween event; cross-post entry mechanic (follow both accounts, tag friends) to expand reach on both sides. | Needs organizer to donate tickets — zero cash cost to KEEPITIL, high engagement value. |
| **Photo/production brand tie-in** | Reach out to `la-visuals`, `sd-photo`, or `photo-booth-co` for event-night content trade (they shoot, KEEPITIL features/credits) — builds a content pipeline for the recap post. | Low cost, high content yield for Week 8 recap. |

All partnership copy, co-branding visuals, and any tickets/prizes involved require Founder approval before outreach messaging is finalized — this section proposes *who to approach and why*, not final terms.

---

## 5. Membership Promotion

Concepts only — pricing/mechanics need Founder + Nexus (CGPO) input before finalizing.

1. **"Halloween Insider" window offer** — time-boxed membership promo (e.g., Oct 15–31) bundling early access to KEEPITIL PICKS updates, a members-only version of the Must-Rave guide (extra picks not shown publicly), and inclusion in the ticket giveaway pool. Positions membership as "the Halloween weekend cheat code."
2. **"Costume Crew" referral angle** — members who refer friends during the campaign window unlock entry into the costume/scavenger-hunt contests (see Section 6), tying membership growth directly to the community engagement plays already planned.
3. **Post-Halloween retention hook** — Nov 1 recap content includes a soft CTA: "Don't miss the next one — join KEEPITIL" to capture people who found the site fresh off Halloween search/social traffic.

---

## 6. Community Contests

| Contest | Mechanic | Channel | Timing |
|---------|----------|---------|--------|
| **Costume Contest** | Users submit costume photos via event chat/social tag; community or KEEPITIL team picks winner(s) | Instagram + event chat feature (if live) | Announce Week 6, submissions Oct 26–Nov 1, winner announced in recap post |
| **Flyer Design Contest** | Open call for community-submitted Halloween-themed flyer art (for a hypothetical/real KEEPITIL-affiliated event or just for feature); winner gets featured on KEEPITIL channels | Social + culture blog submission call | Launch Week 4–5, deadline mid-October, winner featured pre-Halloween |
| **Scavenger Hunt** | At partner events, hide KEEPITIL-branded QR codes or signage; first finders get a small prize/shoutout or membership perk | In-person at 2-3 partner Halloween events (requires organizer buy-in) | Weekend of Oct 29–Nov 1 |

**Flag for Founder/legal-lite review:** all three contests need clear written rules (eligibility, how winners are chosen, prize value/nature, no-purchase-necessary language if applicable) drafted and approved before any contest is announced publicly.

---

## 7. Radio Programming

- **"KEEPITIL Halloween Mix Series"** — 3-5 curated mixes released across October (Week 2 through Week 7 cadence), each themed to a subgenre or mood (e.g., "Dark Warehouse," "Costume Party Bangers," "Afterhours Comedown").
- **Guest mix angle** — invite 1-2 artists from the existing roster (e.g., `groove-trooper`, `rave-god`, `phantom`, or another artist with strong engagement) to contribute a guest Halloween mix; doubles as artist-relationship content and cross-promotion (artist promotes to their followers too).
- Mixes tie directly into the Week 5 "Best Halloween DJ Sets & Mixes Playlist" blog post and can be teased throughout the social calendar as individual drops rather than one dump.
- **Distribution note:** if mixes go out via DistroKid-linked channels, tag affiliate links per standing monetization practice.

---

## 8. KPIs & Budget-Free Assumptions

No paid media assumed anywhere in this framework — all growth levers are organic (content, email, social, partnerships, SEO/internal linking). KPIs below are directional targets for Echo/Nexus to sanity-check against current baseline traffic (baseline not available to Pulse at time of writing — recommend pulling current analytics before finalizing targets).

| Metric | What It Tracks | Target Direction |
|--------|-----------------|-------------------|
| **Site traffic (Sep 14 – Nov 1)** | Sessions to `/culture`, `/events`, homepage | Meaningful lift vs. prior 7-week baseline, concentrated in the two weeks flanking Halloween weekend |
| **Event saves / picks engagement** | Clicks/interactions on KEEPITIL PICKS Halloween cards | Halloween PICKS should outperform a typical month's PICKS engagement, given seasonal search intent |
| **Ticket link clicks** | Outbound clicks from Must-Rave guide + PICKS to organizer ticket pages | Primary "did this campaign work for the community" signal — track per event where possible |
| **Affiliate clicks (Amazon tag tuitea-20)** | Clicks from costume-fit blog post and any other affiliate-linked content | Direct revenue signal; costume post (Week 2) is the highest-intent placement |
| **New email/membership subscribers** | Signups during campaign window, especially around Newsletter #1–#3 and the Halloween Insider offer | Track weekly to see which touchpoint (guide launch vs. membership offer vs. contest) drives the most signups |
| **Contest participation** | Entries/submissions across costume, flyer, and scavenger hunt contests | Directional community-health signal, not revenue — useful for 2027 planning |
| **Social engagement** | Likes/shares/comments/saves on Halloween-tagged content vs. account average | Confirms whether seasonal content outperforms evergreen content, informs future holiday campaigns |

**Reporting cadence recommendation:** light check-in after Week 3 (guide launch) to catch early signal, full recap report in the Nov 1–3 window alongside the recap blog post.

---

## Approval Checklist (for Echo → Founder)

- [ ] Homepage theme concept selection (Section 1)
- [ ] Must-Rave guide + PICKS selection criteria sign-off (Section 2)
- [ ] Content calendar copy review, post-by-post, before drafting (Section 3)
- [ ] Partnership outreach list + messaging approval (Section 4)
- [ ] Membership offer mechanics + pricing (Section 5)
- [ ] Contest rules (legal-lite) drafted and approved (Section 6)
- [ ] Radio mix series scope + guest artist outreach approval (Section 7)
- [ ] Baseline analytics pulled to set real KPI targets (Section 8)

**Nothing in this document is scheduled, drafted-in-final, or published. All copy and visuals require explicit Founder approval before any execution begins.**
