# KODE TICKET — /create auth-view hang · + Founder checklist: Stripe test → live

**Atlas · 2026-08-19.** Two unrelated items that surfaced from one Founder report
("`/create/?view=submit&c=65` keeps crashing" and "it took my payment — is Stripe live?").

**Evidence key:** `[V]` reproduced/observed this session · `[E]` inferred · `[U]` unverified.

---

# ⚠ STATUS UPDATE — 2026-08-19 late. READ THIS BEFORE PART A.

**Part A's diagnosis below is WRONG and is kept only as a record of the error.** KODE overturned it
by measurement, and Atlas accepted the correction.

**What Part A got wrong.** Atlas saw `get_page_text` and `Runtime.evaluate` time out waiting for
`document_idle` and concluded the renderer was hung. KODE measured the actual page:
`domInteractive 39ms`, every KEEPITIL-owned resource finished by `89ms`, sign-in card rendered,
226 nodes. **The page was never hung.** The load event was held open, and Atlas's tooling waits on
it. Atlas then wrote that observation into the acceptance criteria, sending KODE hunting a
renderer bug that did not exist. `[V]`

**Also dead — the `_heal` lead Atlas flagged as `[U]`.** KODE killed it three ways: the rail render
is guarded by `data-kil-mounted`, `/create/` has zero `[data-kil-destinations]` elements, DOM node
count was identical across two `_heal` ticks (226 → 226), and wrapping the mount functions showed
zero calls in 9 seconds. Do not re-investigate it. `[V]`

**Actual cause — third-party analytics holding the load event.** GA4 and Microsoft Clarity were
injected during parse with `async=1`. Async does not block DOMContentLoaded but DOES hold the load
event, and Clarity is a session recorder that keeps posting for the life of the page. On
`?view=submit&c=65`: `domComplete 35762ms` with only 6 third-party requests alive in the gap. `[V]`

**FIXED AND DEPLOYED (Atlas, shell `?v=20260820b`).** Both now mount inside
`__kilMountAnalytics()`, called after the `load` event (or immediately if load already fired). The
`gtag` queue shim is installed before the deferral so early calls are not lost. Verified present in
the served file at `keepitil-shell.js` lines 93–110. `[V]`

## What is actually left for KODE — three things, nothing else

1. **Confirm the load event is now free.** Re-measure `domInteractive` / `domComplete` on
   `/create`, `/culture` and `/connect`. Atlas cannot: its browser tooling still times out, now
   even on `404.html` which worked earlier the same day — so either the CDN was still propagating
   across all 29 pages, or a second holder exists. `[U]`
2. **If still held, find the second holder.** KODE's own note: `/culture` measured `domComplete
   4963ms` against `/create`'s `35762ms` with the same shell and the same analytics. Nothing has
   explained that 5–7× gap. Take several samples per view before concluding it is real — it may be
   third-party CDN variance rather than anything structural. `[U]`
3. **Run the authenticated CREATE journey on a real phone.** Pay → submit → review → approve →
   Culture card → vote. Atlas cannot emulate mobile (browser resize leaves `innerWidth 1440`).

## Corrected acceptance criteria

Atlas's original criterion — "reach `document_idle`" — measured Atlas's tooling, not the user, and
should not gate this ticket. Use instead:

- signed-out `submit` and `mine` paint their card;
- signed-in `submit` renders the entry form and `mine` renders the entry list;
- the radio still starts on first gesture (regression check);
- record `domComplete` as evidence, but do not gate on it.

## One more correction worth keeping

The Founder's original symptom was a phone *lockup*. Async analytics holding the load event does
not lock up a phone; a permanently streaming SoundCloud iframe with `auto_play=true` does — that
was on every page and is now deferred to first gesture. Those two problems were conflated in the
original ticket. Verify the crash on a device before calling it closed.

---

# PART A — KODE: `/create` hangs on the auth-gated views

## A1. Symptom

`/create/?view=submit&c=<id>` and `/create/?view=mine` never finish loading. The tab's renderer
stops responding: Chrome DevTools-protocol `Runtime.evaluate` times out at 45s, and extension
content-script injection never reaches `document_idle`. On a device with less headroom this
presents to the user as the page hanging, then Chrome's "page unresponsive" prompt — which is
what the Founder called a crash. `[V]`

## A2. What I already fixed (do not re-fix)

There were **two** causes stacked on top of each other. I found and shipped the first.

**Cause 1 — SHIPPED.** `v3/keepitil-radio.js` appended a SoundCloud iframe on every page load
with `auto_play=true&continuous_play=true`. A permanently streaming third-party frame keeps the
document from settling and holds an open connection plus an audio decode for the life of the tab.
This affected **every page on the site**, not just `/create`.

Fix deployed: the iframe and `w.soundcloud.com/player/api.js` are now created by
`window.__kilMountRadio()`, which fires on the first `pointerdown` / `touchstart` / `keydown`
(capture, passive, `once`). That is also the earliest moment a browser would permit audio, so
radio behaviour is unchanged for anyone who interacts. `window.__kilRadioAttach(el)` rebinds the
`frame` variable — it is captured as `null` at init now, because the iframe legitimately does not
exist yet. Cache-bust bumped to `?v=20260819a` on all 17 referencing pages.

Result: `/create/` (the browse view) now reaches `document_idle` and `get_page_text` succeeds
where it previously timed out. `[V]`

**Cause 2 — OPEN. This is your ticket.** With the radio deferred, the browse view is healthy but
`?view=submit` and `?view=mine` still hang identically. `[V]`

## A3. What is known about cause 2

- Splits cleanly on **auth-gated views**. `route()` sends `feed`/`join`/`enter` down paths that
  work; `mine` and `submit` are the two that call `loadMe()`-dependent renderers and both hang.
- `loadMe()` itself looks safe — `SB.auth.getSession().then(...).catch(function(){})`, so a
  rejected session cannot throw unhandled. A **hanging** (never-settling) promise would not be
  caught, and would leave `busy('Loading competition…')` on screen forever. Worth checking whether
  `getSession()` resolves at all when the stored refresh token is stale. `[E]`
- `read_console_messages` returns **no errors and no messages** for the hung tab, and
  `read_network_requests` times out. A silent hang with a pegged main thread points at a busy
  loop or a synchronous stall rather than an uncaught exception. `[E]`
- `keepitil-shell.js:1002` runs `setInterval(_heal, 2500)` which re-runs `build()` and the mount
  functions forever. Idempotent by design and present on every page, so it is **not** sufficient
  on its own — but it is worth ruling out as an interaction with whatever the auth views mount. `[U]`
- No `while` loop or `for(;;)` exists in `vs-app.js`, `keepitil-pager.js`, `v3/keepitil-ai.js`. `[V]`

## A4. Why I stopped

The debugging tools I need (console, network, JS evaluation) are exactly the ones a hung renderer
refuses. Continuing would have been guesswork against a black box. Reproduce with a local build
and a profiler rather than against production. `[V]`

## A5. Acceptance

1. `/create/?view=submit&c=65` renders the entry form and reaches `document_idle`.
2. `/create/?view=mine` renders the entry list and reaches `document_idle`.
3. Both signed-in and signed-out. Signed-out `submit` must show the sign-in prompt, not spin.
4. The radio still starts on first gesture — regression-check that A2's fix is intact.

---

# PART B — FOUNDER: Stripe test → live

## B1. Confirmed current state

Payment row `id=4` on `vs_entry_payments`: `stripe_session_id = cs_test_a1kJ3PljAtElSmh2dL3MMnBt0T9mBocH0FsUS7jSShW1hYBv5L4TA9ILdO`. `[V]`

The `cs_test_` prefix is Stripe's own marker for **test mode**. No card was charged, no funds
moved, nothing will appear on a statement. The `$10.00` entry is recorded as `paid` in the
database because the test webhook fired exactly as a live one would. `[V]`

**Implication: KEEPITIL cannot currently accept a real entry fee or a real ticket sale.** Entry
fees are the only revenue line the platform has today.

## B2. What is already correct and does not change

- `create-checkout` reads the amount **server-side** from `vs_competitions.entry_fee_cents`. The
  client never asserts a price. Live mode does not change this. `[V]`
- The VS branch is a **direct charge** — no `transfer_data`, no `application_fee_amount` — because
  a competition entry fee is KEEPITIL revenue, not a connected organizer's. Correct as written. `[V]`
- Free competitions never touch Stripe; they return `{free:true}` and grant entitlement. `[V]`
- `success_url` / `cancel_url` fixed to `/create/?view=mine` in v37. They pointed at the retired
  `/v31/vs.html` and 404'd after every completed payment. `[V]`

## B3. Steps only the Founder can perform

I cannot create accounts or handle secret values. These are yours:

1. **Stripe Dashboard → toggle off "Test mode."** Confirm the account is fully activated — Stripe
   blocks live charges until business details, bank account and identity are accepted.
2. **Copy the live secret key** (`sk_live_…`). Supabase → Project Settings → Edge Functions →
   Secrets → set `STRIPE_SECRET_KEY` to the live value. Do not paste it into chat.
3. **Create a live webhook endpoint** pointing at the `stripe-webhook` function URL, subscribed to
   `checkout.session.completed` (and `payment_intent.payment_failed` if the handler uses it —
   check before subscribing to events nothing reads).
4. **Copy the live webhook signing secret** (`whsec_…`) and set `STRIPE_WEBHOOK_SECRET` in the same
   Supabase secrets screen. A live key with a test webhook secret fails signature verification on
   every event — entries would be charged and never marked paid. This is the most common way this
   migration breaks.
5. **Redeploy `create-checkout` and `stripe-webhook`** so they pick up the new secrets.

## B4. Verify before announcing (do this on a real card, then refund)

1. Enter a $10 competition end to end with a real card.
2. Confirm the new row in `vs_entry_payments` has a `cs_live_…` session id and `status = paid`.
3. Confirm the browser lands on `/create/?view=mine&paid=1` — not a 404.
4. Confirm the entry shows as submitted/eligible in the UI.
5. Refund it in the Stripe dashboard.

## B5. Open items that touch money

- **Test-mode rows are still in the table.** Row `id=4` reads `paid` but no money exists behind
  it. Decide whether to delete test rows before launch or leave them and filter on the
  `cs_test_` prefix in reporting. Leaving them will overstate revenue in any naive `sum()`.
- **Refund policy copy** is referenced by the entry form ("governed by the published refund
  policy"). Confirm `refund.html` actually states the competition-entry rule before taking real
  money for entries.
- **Eventbrite showed 0 orders account-wide.** Ticket revenue is not flowing through the platform
  either. Separate problem, same conclusion: nothing has been sold through KEEPITIL yet.
