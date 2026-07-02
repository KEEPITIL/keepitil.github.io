# KEEPITIL — Analytics & Click-Tracking Specification v1.0

**From:** Fable-Atlas (Executive Ops) · **Date:** 2026-07-01 · **For:** Echo review → Opus-Atlas implementation
**Status:** SPEC — no code changes made. Implements Echo's Priority A.

---

## Objective
Answer, with data: which events get clicks, which CTAs convert, where subscribers come from, and which affiliate links earn. Everything below is one GA4 property + one small JS snippet.

## 1. Foundation
- **GA4 property LIVE (2026-07-01):** account "KEEPITIL" → property "KEEPITIL Website" → web stream "KEEPITIL Web" (https://keepitil.com, stream ID 15185180805). **Measurement ID: `G-9WZ40PV823`**. Enhanced measurement ON (page views, scrolls, outbound clicks +4). Data-sharing settings: all optional sharing OFF.
- Base tag for every production page `<head>`:
```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-9WZ40PV823"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-9WZ40PV823');
</script>
```
- One shared snippet `assets/js/kt-analytics.js`, included on every page **before** `</body>`. No layout/CSS impact (design freeze safe).
- Staging pages (`*-staging.html`) must NOT send events — guard: `if (location.pathname.includes('-staging')) return;`

## 2. Event taxonomy (GA4 custom events)
| Event name | Trigger | Params |
|---|---|---|
| `ticket_click` | Any outbound ticket link (Posh etc.) | `event_slug`, `event_title`, `month`, `genre`, `source_page` |
| `save_event` / `unsave_event` | KEEPITIL-X save toggle | `event_slug`, `signed_in` (bool) |
| `vip_click` | Book VIP Table action | `event_slug` |
| `chat_join` | Join Event Chat action | `event_slug`, `signed_in` |
| `membership_cta` | Any JOIN KEEPITIL / Upgrade Membership CTA | `cta_location` (hero/join-grid/footer/profile) |
| `partner_cta` | Become a Partner / Claim Profile / Submit Event | `cta_type`, `cta_location` |
| `event_submit` | Event submission form completed | `source_page` |
| `affiliate_click` | Any Amazon (tuitea-20), DistroKid, FreeCash, Posh-referral link | `program`, `link_id`, `source_page` |
| `radio_play` / `radio_pause` | Radio bar controls | `source_page` |
| `profile_action` | Profile info-card buttons (3-button row) | `profile_slug`, `button` |
| `outbound_click` | Catch-all other external links | `link_domain`, `source_page` |

## 3. Implementation pattern (for Opus-Atlas)
One delegated listener — no per-link wiring, works on dynamically-rendered cards:
```js
document.addEventListener('click', (e) => {
  const a = e.target.closest('a,[data-kt]');
  if (!a) return;
  const kt = a.dataset.kt;               // explicit tag wins
  if (kt) return send(kt, a.dataset);    // data-kt="ticket_click" data-event-slug="..."
  if (a.href && isExternal(a.href)) send(classify(a.href), { link_domain: hostOf(a.href) });
});
```
- `classify()`: posh.vip→`ticket_click`, amazon.com+`tag=tuitea-20`→`affiliate_click(program:amazon)`, distrokid→`affiliate_click`, etc.
- Tag the high-value controls explicitly with `data-kt` attributes during the Events v5.1 build (save X, VIP, chat join, membership CTAs). **This is the only markup change requested** — attributes only, zero visual impact.
- `send()` = `gtag('event', name, params)` with console fallback if gtag absent.

## 4. Reports (GA4 explorations to save)
1. **Event funnel:** page_view → save_event → ticket_click, by `event_slug`.
2. **CTA scorecard:** membership_cta + partner_cta by `cta_location` weekly.
3. **Affiliate earnings proxy:** affiliate_click by `program` weekly (join against program dashboards manually).
4. **Traffic sources → subscriber:** session source/medium → membership_cta conversion.

## 5. Weekly rollout of numbers
Scheduled weekly report (existing scheduled-task infra) posts to Notion Strategy Log: top 5 events by ticket_click, saves count, CTA conversions, affiliate clicks by program. Spec for that job in `AUTOMATION-OPPORTUNITIES.md` §5.

## 6. Definition of done
- [ ] GA4 property live, snippet on all production pages, staging excluded
- [ ] All Section-2 events visible in GA4 DebugView
- [ ] data-kt attributes on save/VIP/chat/membership controls
- [ ] 4 saved explorations
- [ ] First weekly rollup posted to Strategy Log

## Open item for Founder
~~GA4 requires the Founder's Google account~~ **RESOLVED 2026-07-01** — property created with Founder at the wheel; Measurement ID `G-9WZ40PV823` above. Sprint 1 is unblocked for Opus-Atlas.
