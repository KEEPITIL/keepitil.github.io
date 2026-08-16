# VERIFIED KEEPITIL COMMERCE WORKFLOW

**Claude (Atlas) · 2026-08-13 · Read-only observation. Nothing created, changed, published or priced.**

**Method note.** No live merchandise run was in progress, so I did not fabricate one. Instead I
opened the real Printful account read-only and read the actual state of a shipped product. That
converts most of W2 from `[E]` (inferred) to `[V]` (verified) — but **the creation half is still
unobserved**, and it is marked so. See §7.

**Evidence key:** `[V]` seen on screen this session · `[E]` inferred from state · `[U]` unobserved.

---

## 1. Account and binding — all `[V]`

| Field | Value |
|---|---|
| Printful account | Joseph Tuitea |
| Store | **KEEPITIL** — Shopify, **Active** |
| Printful store id | `15502856` |
| Storefront | `http://www.illestratedlifestyle.com/` |
| Currency / region | USD / USA |
| Products | **18 total, 18 synced, 0 not synced** |
| "Import not synced products from Shopify" | **OFF** |

**Direction of travel is one-way.** With the import toggle off, Printful pushes to Shopify and does
not pull back. Anything added on the Shopify side is invisible to Printful.

### The join keys, confirmed

| Key | Example | Meaning |
|---|---|---|
| Printful sync-product id | `454567744` | internal; appears only in the Printful URL |
| Shopify product id | `#8863308677273` | **what Printful's product list displays** |
| Shopify variant id | `#48787238092953` | per variant |
| Shopify SKU | `9714352_9527` | `printfulProductId_variantId` |

Worth noting: Printful's list is keyed by the **Shopify** id, while the SKU encodes the **Printful**
ids. A reconciliation job can therefore join in either direction without an API call to the other
side — useful, because there is currently no Printful credential.

---

## 2. Observed product state — `[V]`

Product: *"I'm Not Superwoman But I'm A Super Mom — Pretty Much The Same Thing"*

| Field | Observed |
|---|---|
| Blank | **Bella + Canvas 3001** — Unisex Jersey Short Sleeve Tee |
| Variants | **18** = 2 colours (Black, Athletic Heather) × 9 sizes (XS–5XL) |
| Retail price | **$26 – $44** |
| Printful cost | $11.69 – $19.69 |
| Revenue | $14.31 – $24.31 |
| Storefront shipping | $4.59 – $11.99 |
| Printful shipping | $4.59 – $11.99 — **cost passed through exactly, no markup** |
| Free shipping toggle | OFF |
| Shipping profile | Tshirts (`#PF-FRG1001`) |
| Fulfilment | enabled on all 18 |

**Correction to my earlier report.** I previously recorded the Aug cohort as **flat $26**. That was
wrong — $26 is the *base size only*; the ladder runs to $44 at 5XL. The Shopify API returned the
minimum variant price and I read it as the whole product. Margin is roughly 55% at base and holds
across sizes, so pricing on this cohort is **healthier than I reported**. The merchandising gap is
real; the pricing gap was my error.

---

## 3. The structural finding

**Printful's entire edit surface for a synced product is:**

`Edit title & description` · `Edit design` · `Download mockups` · `Edit prices` · `Edit shipping` ·
`Add / delete variants` · `Disable fulfillment` · `View in Shopify` · `Edit in Shopify`

**There is no field for tags. None for product type. None for collections. None for SEO.**

This reframes the whole cleanup problem. The 11 orphaned products are not the result of someone
rushing — **Printful is structurally incapable of sending those fields.** Any product that reaches
Shopify through Printful arrives with no tags, no type, no collection membership and Printful's
boilerplate description, *every time, by design*.

Two consequences:

1. **A Shopify-side merchandising step is mandatory, not optional.** It cannot be fixed "upstream in
   the generator" as I previously recommended — there is no upstream field to fix. I was wrong about
   that. The correct fix is a post-sync enrichment pass.
2. Note Printful's own affordance: **`Edit in Shopify`** — Printful expects you to leave and finish
   the job in Shopify. The workflow has always had a second half; it just wasn't being run.

---

## 4. Verified step table

Steps 1–5 are `[U]` — I did not observe a creation run. Steps 6–13 are read from live state.

| # | Step | Status | Nature | Best executor |
|---|---|---|---|---|
| 1 | Idea / phrase | `[U]` | AGENTIC | NEXUS agent or owner |
| 2 | Design artwork | `[U]` | AGENTIC | Claude / NEXUS Node |
| 3 | Upload print file to Printful | `[U]` | MANUAL | Claude Cowork (browser) |
| 4 | Choose blank + colours + sizes | `[E]` B+C 3001, 2×9 | MANUAL | Claude Cowork |
| 5 | Mockup generation | `[E]` | DETERMINISTIC (Printful) | Printful |
| 6 | Price set per variant | **`[V]`** $26–$44 | DETERMINISTIC | NEXUS deterministic, **APPROVAL-GATED** |
| 7 | Shipping profile assigned | **`[V]`** `PF-FRG1001` | DETERMINISTIC | Printful default |
| 8 | Push to Shopify | **`[V]`** 18/18 synced | DETERMINISTIC | Printful |
| 9 | Title + description | **`[V]`** boilerplate survived | AGENTIC | NEXUS agent → diff → approval |
| 10 | Tags / product type | **`[V]` NOT TRANSFERABLE** | DETERMINISTIC | NEXUS deterministic (Shopify write) |
| 11 | Collection membership | **`[V]`** title-rules miss all 11 | DETERMINISTIC | NEXUS deterministic |
| 12 | SEO fields | **`[V]`** absent, 11× duplicate copy | AGENTIC | NEXUS agent → approval |
| 13 | Publish | **`[V]`** live immediately | APPROVAL-GATED | **OWNER** |
| 14 | Post-publish verification | **`[V]` does not exist** | DETERMINISTIC | NEXUS deterministic |

**Publication state is the sharpest risk.** All 18 are ACTIVE. Nothing in the observed chain gates
publication — a Printful push lands live on the storefront with boilerplate copy and no
merchandising. The approval gate has to sit *before* the push, or the product is already public by
the time anyone reviews it.

---

## 5. Capabilities and credentials

| Capability | Credential | Exists? | Phase |
|---|---|---|---|
| `cap.shopify.keepitil.read` | Admin API token, read scopes | **owner must create** | 1 |
| `cap.shopify.keepitil.write` | separate write token | not yet | 2, approval-gated |
| `cap.printful.keepitil` | Printful API key | **none — not created, per directive** | 3 |
| Browser operation | live Printful session | **`[V]` works today** | now |

Credential rules unchanged and still the point: token lives on the **capability record** as a secret
reference. Never in `capabilities.config`, an agent prompt, a memory row, or an audit entry.

**Printful can be operated today with zero new credentials** — the browser session is authenticated
and every screen above was reachable read-only. That is a genuine option for phase 1: use the API
for Shopify, the browser for Printful.

---

## 6. Deterministic automation candidates

All rule-driven. No model required — this is the Zero-Cost-Mode-correct split.

1. **Post-sync enrichment** — detect a Printful-origin product (SKU matches `^\d+_\d+$`), apply
   garment tag from the blank, set `productType` from the catalogue name.
2. **Collection rule migration** — `TITLE contains` → `TAG equals`. Fixes 11 orphans and prevents
   recurrence.
3. **Reconciliation** — parse SKUs, join Printful↔Shopify, flag drift.
4. **Duplicate-description detection** — 11 identical bodies is an SEO fault, mechanically findable.
5. **Publication audit** — flag ACTIVE products that never passed enrichment.

Only descriptions, SEO copy and design concepts need an agent.

---

## 7. What is still unobserved

**The creation run.** Steps 1–5 — print-file upload, DPI/placement requirements, blank selection,
mockup generation — remain `[U]`. I will not write them from inference; a wrong upload spec becomes
a Skill that fails on a real product.

**To close it:** the next time you make a product, tell me before you start and I will drive the
browser and capture every screen. That is a ~10-minute observation and it completes the workflow.

---

## 8. Recommended NEXUS Skills, in order

| Skill | Nature | Credential | Risk |
|---|---|---|---|
| `commerce.product.audit` | read-only | Shopify read | none |
| `commerce.reconcile.printful` | read-only, SKU join | Shopify read | none |
| `commerce.product.enrich` | proposes a **diff** | Shopify read | none until approved |
| `commerce.collections.migrate` | title→tag rules | Shopify **write** | approval-gated |
| `commerce.publish.gate` | blocks unenriched ACTIVE products | Shopify write | approval-gated |

`commerce.product.audit` first — unchanged recommendation, now better evidenced.

---

## 9. Owner actions

1. **Shopify Admin API token**, read scopes only — unblocks skills 1–3.
2. **Tell me before the next product run** so I can capture steps 1–5.
3. Printful API key — **not yet**, per directive; browser operation covers phase 1.
4. Confirm the price ladder ($26–$44) is intentional. I believe it is; I misreported it before.
