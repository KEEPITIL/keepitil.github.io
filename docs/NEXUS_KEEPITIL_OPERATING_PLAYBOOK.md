# NEXUS KEEPITIL Operating Playbook

**Claude (Atlas) · 2026-08-13 · Nothing executed. No live mutation.**

**Evidence key:** **[V]** verified this session · **[E]** inferred from artefacts I inspected ·
**[U]** unknown — not documented rather than guessed.

**Canonical (accepted):** keepitil.com → `KEEPITIL/keepitil.github.io` @ `main` → GitHub Pages →
Supabase `keepitil-prod` (`ovmqtzjfpzrbzrlkxwgw`). Cloudflare not in the serving path.

---

## W1 — keepitil.com website maintenance  **[V]**

**Trigger** bug report, visual defect, content change, broken link.
**Inputs** URL, expected vs actual, viewport, whether signed in.

**Steps**

1. **Inspect live.** `fetch()` the page; read response headers. `server: GitHub.com` +
   `x-github-request-id` confirms you are hitting Pages and not a stale cache or a proxy.
2. **Locate the file.** Routing is literal: `/culture.html` is `culture.html` at repo root; assets
   under `/v3/`. No build step, no router — the URL *is* the path.
3. **Decide static vs data.** If the page renders but content is missing/wrong, the fault is
   usually **Supabase data**, not HTML — `profile.html?slug=` fetches client-side. Check the
   `keepitil-prod` row before editing markup.
4. **Edit** on a branch off `main`.
5. **Test.** No test suite exists **[V]**. Open the file locally, then diff-review. Check 375 px —
   a `1fr` overflow bug has already shipped once here.
6. **Deploy** = merge/push to `main`. Pages rebuilds automatically; typically under a minute.
7. **Verify** with a **cache-busting** fetch (`?v=<timestamp>`), and confirm
   `x-github-request-id` changed. Varnish `age:` was 27 s on inspection — an unchanged page may
   just be cached, which reads exactly like a failed deploy.
8. **Rollback** = `git revert` + push. Never force-push `main`; Pages serves whatever `main` says
   and history is the only recovery path.

**Systems** GitHub Pages · `keepitil-prod` · browser
**Credentials** GitHub `KEEPITIL` identity (authenticated, inactive — `gh auth switch` first) **[V]**
**Best worker** KODE for the edit + PR; **Claude Cowork** for live inspection and visual verify;
owner merges.
**Verification** header change + cache-busted fetch + 375 px check.

**Common failures**
- Varnish cache read as a failed deploy — **always cache-bust**
- Editing HTML when the defect is Supabase data
- `gh` active account is `fobbinhard` by default; pushing without switching targets the wrong identity **[V]**
- Force-push destroys the only rollback path

**Approval gates** any push to `main` (it *is* production — no staging exists) · anything touching
`apply.html`/auth · DNS or `CNAME`.

**→ Skill `keepitil.web.diagnose`** (read-only: fetch, headers, locate file, classify
static-vs-data) and **`keepitil.web.patch`** (branch → edit → PR, never merge).

---

## W2 — Shopify + Printful merchandise  **[E] — reconstructed from artefacts, not observed**

**I did not watch this run.** What follows is inferred from product data I inspected. The
Printful half in particular is **[U]** as a procedure. Treat as a draft for you to correct.

**Evidence actually seen [V]:** SKU `9714352_9527` = Printful product `_` variant id — the join
key · mockups on Shopify CDN with Printful filenames
(`unisex-staple-t-shirt-black-front-<hash>.jpg`) · `inventoryQuantity: 9999` = print-on-demand ·
11 products created in ~12 h on Aug 6–7 with identical Printful boilerplate descriptions, **no
tags, no productType**, flat $26 · July brand products have full tags, real types, brand-voice copy.

**Steps (as reconstructed)**

| # | Step | Where | Evidence |
|---|---|---|---|
| 1 | Idea / phrase | Claude | [E] |
| 2 | Design image | Claude image gen | [E] |
| 3 | Upload to Printful | **browser, manual** | **[U] procedure** |
| 4 | Pick blank + colours/sizes | Printful | [E] variants exist |
| 5 | Mockups generated | Printful | [V] filenames |
| 6 | Push to Shopify | Printful → Shopify | [V] SKU join |
| 7 | Description | **Printful default, not rewritten** | [V] |
| 8 | Tags / type | **skipped for the 11** | [V] |
| 9 | Price | flat $26 vs laddered $30–70.50 | [V] |
| 10 | Collections | **11 orphaned** — smart rules match TITLE | [V] |
| 11 | SEO | duplicate descriptions ×11 | [V] |
| 12 | Publish | live immediately | [V] all ACTIVE |
| 13 | Verify | none evident | [E] |

**Split by nature**

- **Deterministic** — SKU parsing, price ladder, collection membership, duplicate-description
  detection, tag application. All rule-driven; no model needed.
- **Printful-only** — blank catalogue, print files, mockup rendering. No connector exists **[V]**.
- **Shopify-direct** — tags, productType, description, collections, SEO, price, publish state.
- **Claude/browser** — design generation, Printful UI operation, visual mockup judgement.

**Best worker** Claude Cowork (design + Printful browser) → deterministic NEXUS automation
(tags/type/collections/pricing) → owner approval → Shopify write capability.

**Common failures** *(all observed in the data)* merchandising skipped under batch speed ·
title-based smart rules silently exclude products · duplicate descriptions harm SEO · no
post-publish verification step.

**Approval gates** publish · price · delete/archive · collection restructuring.

**→ Skills** `commerce.product.audit` (read-only; the Merchandise Cleanup analysis) ·
`commerce.product.enrich` (propose tags/type/description as a **diff**) ·
`commerce.collections.migrate` (title-rule → tag-rule).
**→ Capabilities** `cap.shopify.keepitil.read` (spec'd) · `cap.shopify.keepitil.write`
(approval-gated) · `cap.printful.keepitil` (**credential does not exist**).

**Root cause worth stating:** remediating the 11 products by hand and leaving the generator
unchanged just schedules the next cleanup. The fix belongs at creation time.

---

## W3 — Content production  **[U] — largely undocumented**

**Verified only:** brand voice exists in shipped copy — *"Straight from the underground"*,
*"Create loud. Live louder."*, tag vocabulary (EDM, Rave, SoCal, Underground, Streetwear) **[V]**.
That is a usable style seed for a Brand Voice memory.

**Not documented, and I am not inventing it:** social post workflow · captions · video ·
campaign structure · publishing cadence.

**Access reality [V]:** the site links Instagram, SoundCloud, TikTok — **no connector for any of
them**. Slack, Klaviyo, Ahrefs, Amplitude, SimilarWeb all require authorisation before use.
Adobe Express, Canva, Descript and Figma connectors exist but I have **not** verified they hold
KEEPITIL assets.

**Recommendation** capture this by **observing one real run** rather than writing it speculatively.
A playbook invented here would be fiction, and fiction becomes a Skill that fails in production.

**→ Skill (later)** `content.brand_voice` — seeded from shipped copy, which is real evidence.

---

## W4 — Worker routing

| Work | Best executor | Why |
|---|---|---|
| Repo edits, tests, CI, migrations analysis, DB experiments | **KODE** | proved empirical Postgres investigation |
| Live site inspection, visual/mobile verification | **Claude Cowork** | real browser |
| Printful browser operation | **Claude Cowork** | no API |
| Shopify reads/writes | **NEXUS capability** | API, auditable, gateable |
| SKU parsing, tag rules, price ladders, collection membership | **NEXUS deterministic** | rules, not judgement — cheapest and most reliable |
| Design/image generation | **Claude**, later NEXUS Node | |
| Merge to `main`, publish, pricing, deletions | **OWNER** | production + money |
| NEXUS core, migrations | **Codex** | out of my lane |

**Zero Cost note:** most of W2's value is deterministic. Sending tag/collection work to a model
would spend tokens on something a rule does better.

---

## W5 — Unknown product mapping

| | Result |
|---|---|
| **Thrive** | **UNKNOWN.** GitHub search `thrive in:name user:KEEPITIL` → **none** **[V]** |
| **KODE source** | **UNKNOWN.** Search → **none** **[V]**. Supabase project `kode` exists (9 tables, 5 users) but no repo in this account |
| `KEEPITIL/kforms` | private, pushed 9 d ago. Name suggests K Form — **not opened, not verified** |
| `KEEPITIL/resonance-keepitil` | public, 2 mo. Purpose **unknown** |

Stopped here per instruction rather than spending further.

---

## Owner actions

1. **Correct W2.** It is reconstructed from artefacts — especially steps 3–6 (Printful).
2. **Where do Thrive and KODE live?** Not in the KEEPITIL GitHub account.
3. **Shopify read-only token** when you want the binding.
4. **Printful API key** — the one true gap in the commerce chain.
5. Confirm `kforms` / `resonance-keepitil` purpose.

## Recommended first Skill

**`commerce.product.audit`** — read-only, needs only the Shopify token, and its output (the
Merchandise Cleanup diff) is a genuine business improvement you approve or reject before any
write capability exists.
