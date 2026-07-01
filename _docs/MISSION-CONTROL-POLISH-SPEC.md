# KEEPITIL — Mission Control Polish Specification v1.0

**From:** Fable-Atlas (Executive Ops) · **Date:** 2026-07-01 · **For:** Echo review → Opus-Atlas implementation
**Status:** SPEC — polish and usability ONLY, no redesign (Echo Priority B). Target: `echo-dashboard.html` (Mission Control).

---

## Principle
Executive-grade means: the Founder opens the dashboard and in 5 seconds knows (1) is anything broken, (2) what needs my decision, (3) what did the team do since I last looked. Every item below serves one of those three.

## 1. Executive health cards (top row)
One card per department — Echo, Atlas (site), Pulse (revenue), Nexus (partnerships), Sentinel (ops):
- Status dot: 🟢 on track / 🟡 needs attention / 🔴 blocked
- One-line current focus + last-update timestamp
- Data source: `_echo/echo-state.json` (already exists) — extend schema with `departments:{name:{status,focus,updated}}`

## 2. "Needs Founder Now" inbox (most important addition)
A single list at the top: every item awaiting Founder decision/approval, each with a one-line ask and an [Approve]/[View] link. Sources: staging pages awaiting review, campaign proposals, outreach drafts, open decisions from `keepitil-open-items`. Empty state: "Nothing needs you. 🟢"

## 3. Status indicators & sync timestamps
- Every data block shows `Last sync: <relative time>`; turns 🟡 if >24h stale, 🔴 if >72h.
- Global "data freshness" chip in the header (worst-of of all blocks).

## 4. Global search
Single input filtering across: events, profiles (artist/brand/org slugs from blog-manifest.json), docs in `_docs/`, open items. Client-side, no backend. Keyboard: `/` to focus.

## 5. Notifications strip
Reverse-chron feed of the last 20 entries from the Notion Strategy Log (or `_echo/echo-run.json` when offline). Each: timestamp, agent, one-liner. No unread logic needed — this is a glance feed.

## 6. Department scorecards (below health cards)
- **Atlas:** pages in staging, last push date, QA pass rate
- **Pulse:** week's ticket clicks, affiliate clicks, membership CTAs (from GA4 once ANALYTICS-CLICK-TRACKING-SPEC ships; until then, manual fields)
- **Nexus:** pipeline counts by stage (from Partnerships DB — see PARTNERSHIP-CRM-SYSTEM.md §6)
- **Sentinel:** open incidents, last audit date, checklist compliance

## 7. Activity timeline
Vertical timeline of the last 7 days of completed tasks (source: Strategy Log). Collapsed by default under the scorecards.

## Constraints
- Existing layout, palette (dark + neon green), typography, and structure unchanged — add blocks into current grid.
- All client-side; no new backend. JSON files in `_echo/` remain the offline source of truth; Notion is authoritative when reachable.
- Mobile: cards stack; inbox stays first.

## Definition of done
- [ ] 5 health cards driven by echo-state.json
- [ ] Needs-Founder-Now inbox with live items
- [ ] Freshness timestamps on every block
- [ ] Global search over events/profiles/docs
- [ ] Notifications strip + activity timeline
- [ ] Scorecards rendering (manual data OK until GA4 live)
- [ ] Founder 5-second test passes
