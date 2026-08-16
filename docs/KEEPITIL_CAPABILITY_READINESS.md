# KEEPITIL — Capability Readiness

**Prepared by:** Claude (Atlas) · **2026-08-13**
**Scope:** KEEPITIL infrastructure + external capabilities.
**Out of scope:** NEXUS core, NEXUS migrations, `fobbinhard/nexus` implementation — Codex owns those.

---

## 1. KEEPITIL GitHub identity — IN PROGRESS

`gh` **2.97.0**. Accounts before the change:

```
github.com
  ✓ Logged in to github.com account fobbinhard (keyring)
  - Active account: true
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'
```

**Backup written before touching anything:**
`~/.config/gh/hosts.yml.backup-20260813-144841`
Restore: `cp '~/.config/gh/hosts.yml.backup-20260813-144841' '~/.config/gh/hosts.yml'`

**Trap found and avoided.** Chrome is signed into GitHub as `fobbinhard`
(`meta[name="user-login"]` = `fobbinhard`). Authorising the device code from that session would
have bound the new token to the **NEXUS identity** — a silent duplicate of auth we already have,
and no KEEPITIL access at all. The failure would have looked like success.

**Correct path:** authorise in a **private window**, signed in as `illestratedlifestyle@gmail.com`.

**After authorisation the script automatically:**
1. verifies **both** accounts are present, and **auto-restores from backup if `fobbinhard` is gone**
2. inventories KEEPITIL repos + orgs, read-only
3. **switches the active CLI account back to `fobbinhard`**

Step 3 is not cosmetic. Leaving the active account on KEEPITIL would silently retarget Codex's
NEXUS work — worse than never running this.

---

## 2. KEEPITIL Cloudflare inventory — READY, read-only

`scripts/keepitil-cloudflare-inventory.command`. Every command is a list/get; **no deploy, no
DNS change, no secret write.**

Covers: `whoami` · Workers + deployments · Pages · KV · R2 · D1 · Queues.

**Account guard preserved.** NEXUS = `2c7cfa177bfd43eda4135b050c0941ae`. Anything matching that
is Codex's lane; anything else is KEEPITIL-side. The script prints this explicitly so a
misattribution is visible rather than assumed.

**Known gap, stated not guessed:** wrangler cannot enumerate zones or DNS records — that needs an
API token with `Zone:Read`. **keepitil.com's DNS and Worker routes are NOT inventoried.**

---

## 3. Shopify binding specification — READY, no writes performed

### Identity

| Field | Value |
|---|---|
| Store | **KEEPITIL** |
| Domain | `www.illestratedlifestyle.com` |
| Contact | `info@keepitil.com` |
| Plan | Basic |
| Currency / TZ | USD / PDT |
| Account | KEEPITIL (`illestratedlifestyle@gmail.com`) |

### Credential

**Type:** Shopify **Admin API access token** from a custom app (`shpat_…`).
**Not** OAuth — no third-party app is involved; NEXUS is a first-party integration.

**Storage rules — these are the point of the exercise:**

- The token belongs to the **capability record**, not to any agent, prompt, or agent instruction.
- Stored as a **secret reference**, never a literal. Mirror the NEXUS pattern already proven:
  the Supabase service-role key lives as a **Cloudflare Worker secret** (write-only, unreadable
  from the dashboard), with only its *metadata* in the database.
- **Never** in `capabilities.config`, which is readable by anyone who can read the row. SR-5
  showed `capabilities` was briefly world-readable to any authenticated user — assume it can
  regress and never put a live secret there.
- **Never** in a system prompt, agent definition, memory row, or audit entry.

### Scopes — read-only for phase one

| Scope | Purpose |
|---|---|
| `read_products` | products, variants, SKUs, status |
| `read_inventory` | inventory levels |
| `read_orders` | sales signal for merchandising decisions |
| `read_content` | collections |
| `read_publications` | sales-channel publication state |

**Deliberately excluded:** `write_products`, `write_inventory`, `write_orders`,
`write_publications`, and anything touching customers, discounts, price rules, or fulfilment.
A read-only token **cannot** publish, reprice, or delete — the guarantee is enforced by Shopify,
not by NEXUS's own discipline.

### Allowed read actions

list/search products · variants + SKUs · collections and their rules · inventory levels ·
orders (aggregate) · shop metadata · publication status.

### Write actions — approval-gated, phase two, separate token

create/update product · change price · edit tags/type/description · add to collection ·
create/modify collection · publish/unpublish · archive/delete · inventory adjustment.

Each requires: an approval record, a diff of before/after, and an audit row. **Publishing and
pricing are owner-only** and stay that way.

### Durable capability metadata

```
id                  cap.shopify.keepitil.read
kind                api
name                Shopify — KEEPITIL (read-only)
app_id              keepitil
cost_class          free            # Admin API included in the plan
risk_class          low             # read-only; a write token would be high
permission_level    1               # read; writes = 3-4, approval required
enabled             true
credential_ref      secret://cloudflare/KEEPITIL_SHOPIFY_ADMIN_TOKEN   # reference, not value
endpoint            https://<store>.myshopify.com/admin/api/2026-07/graphql.json
scopes              read_products, read_inventory, read_orders, read_content, read_publications
rate_limit          GraphQL cost-based; back off on THROTTLED
health_check        shop { name } — cheap, proves auth + connectivity
```

### Audit requirements

Per invocation: timestamp · user · app · project · task · capability id · operation ·
parameters (**token redacted**) · result summary · error · duration · **cost class actually
used**.

Never log the token, or any header or URL that could contain it.

---

## 4. Proposed project — KEEPITIL Merchandise Cleanup (NOT EXECUTED)

**Status: proposed. No Shopify write will occur until NEXUS owns the capability and you approve
a first write test.**

### The problem, measured

18 live products. Collections are **smart rules on TITLE**:

| Collection | Rule | Products |
|---|---|---|
| Tees | TITLE contains "Tee" | 1 |
| Hoodies | TITLE contains "Hoodie" | 1 |
| Crewnecks | TITLE contains "Crewneck" | 1 |
| Hats | TITLE contains "Hat" | 3 |
| KEEPITIL Apparel | manual | 6 |

**11 of 18 products (61%) belong to no collection.** Their titles — *"I Run On Caffeine, Chaos &
Questionable Choices"* — contain none of the trigger words and never will.

### Two distinct defects

**A. The Aug 6–7 batch skipped merchandising.** 11 products in ~12 hours: no tags, no
`productType`, flat $26, and the same generic Printful description on every one
(*"This t-shirt is everything you've dreamed of and more…"*).

**B. Title-based smart rules are structurally fragile.** They work only when the product name
happens to contain the garment word. That is a coincidence, not a rule. **Tag-based rules are
robust** — and the July brand products already carry the tags that would make it work
(Apparel, EDM, KEEPITIL, Print on Demand, Rave, SoCal, Streetwear, Underground).

Worth separating: fixing A without fixing B leaves the same trap for the next batch.

### Proposed work

1. classify the 11 orphans (all unisex staple tees, $26)
2. propose tags — garment + audience + brand; the "mom life" cohort is a **distinct audience**
   from the EDM/underground line and probably wants its own tag and collection
3. propose `productType` (T-Shirt) for all 11
4. propose descriptions replacing Printful boilerplate — 11 identical descriptions is also an
   SEO duplicate-content problem, not only a voice problem
5. propose collection strategy: convert rules from `TITLE contains` to `TAG equals`
6. document the title-vs-tag comparison so the next batch cannot repeat it
7. SEO gaps: duplicate descriptions · empty `productType` · no product-level SEO title/description

### Deliverable

A diff proposal — current vs proposed, per product — for approval. **No writes.**

### Prevention

The real fix is upstream: whatever produced 11 products in 12 hours should emit tags, type and
description **as part of creation**. Remediating by hand and leaving the generator unchanged
just schedules the next cleanup.

---

## 5. KODE routing policy

**KODE by default:**
repository changes · migrations analysis · test authoring · CI/debugging · **database
experiments** · multi-file refactors · anything needing many fast file operations.

Evidenced: KODE settled an RLS question I had *guessed* at by running all three cases on a real
Postgres as `authenticated` — proving the error text for a `WITH CHECK` violation and a
`RETURNING` policy denial is character-identical. It then found a third latent defect
(`is_org_member` recursing because it is `SECURITY INVOKER`) that neither of us was looking for.

**Claude Cowork by default:**
browser/desktop operation · account setup and identity work · **Shopify** · **Printful browser
workflows** · multi-service tasks · visual acceptance · anything needing a real browser session
or a human-facing UI.

**Neither owns NEXUS core.** Codex does.

**Boundary that matters:** KODE has no Shopify or Printful access, and no browser session.
Commerce stays with Claude. Conversely, my Mac-side execution is slow and wedge-prone — repo
work belongs with KODE even when I could technically do it.

---

## 6. Owner-only actions

| # | Action | Blocking |
|---|---|---|
| 1 | **Authorise GitHub device flow in a PRIVATE window as `illestratedlifestyle@gmail.com`** — code `E7C7-6E2D` | KEEPITIL repo inventory |
| 2 | Create the Shopify Admin API token (read-only scopes above) | Shopify capability binding |
| 3 | Decide on un-pausing `keepitil` Supabase for dependency proof | Redundancy verdict |
| 4 | Provide Printful API key **when** commerce is bound | Closing the workflow gap |
| 5 | Cloudflare API token with `Zone:Read` | DNS/routes inventory |

Items 3–5 are not needed today.

---

## 7. Next capability recommended for NEXUS

**Shopify, read-only.** Verified access, zero write risk, no overlap with Codex's lane, and it
exercises the whole binding model — credential-on-capability, scope limits, audit, cost class —
against a real production system where a mistake cannot damage anything.

Its first useful job is already specified and evidenced: **the merchandising analysis in §4**,
which is pure read plus a proposal, and gives you a genuine business improvement to approve or
reject before any write capability exists at all.
