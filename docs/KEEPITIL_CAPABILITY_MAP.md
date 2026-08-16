# KEEPITIL — Capability Map

**Prepared by:** Claude (Atlas) · **Date:** 2026-08-13
**Lane:** KEEPITIL infrastructure + external capabilities. **NEXUS brain/core is out of scope** —
Codex owns NEXUS repo and Supabase migration reconciliation.

**Evidence standard:** every "verified" row below was confirmed by a live API call during this
audit. Rows marked *unverified* are stated as such and must not be relied on.

---

## 1. Supabase — VERIFIED

Organization: **KEEPITIL** (`lnaafocxzlbbwdnbrtqu`) — the only org my connector can see.

| Project | Ref | Status | Live evidence | Disposition |
|---|---|---|---|---|
| **keepitil-prod** | `ovmqtzjfpzrbzrlkxwgw` | ACTIVE_HEALTHY | **165 tables, 25 users, 470 storage objects**, newest user 2026-07-19 | **Production. Do not touch.** |
| **kode** | `xdoxfoectugsbbujjezq` | ACTIVE_HEALTHY | 9 tables, 5 users, 6 storage objects. Created 2026-07-16 | Active, small. KODE scheduler. |
| **keepitil** | `zqismuinolssxjqrqjqm` | **INACTIVE (paused)** | Created 2025-09-29. Cannot query while paused | **Redundancy candidate — not proven** |

**Safe actions:** read schema, query, list migrations/functions/advisors.
**Owner-only:** unpausing `keepitil`, deleting any project, restoring backups.

⚠️ **Proving `keepitil` is dead requires un-pausing it**, which is itself a mutation and may
restart billing on a paused project. Not doing that without explicit approval.

✅ **Account separation is real.** NEXUS's project `dojmswwxmdtizrtoirem` does **not** appear in
my project list. The KEEPITIL/NEXUS split is enforced at the credential level, not by convention.

---

## 2. Shopify — VERIFIED

**KEEPITIL** · `www.illestratedlifestyle.com` · `info@keepitil.com` · **Basic plan** · USD · PDT

### 18 products, all ACTIVE, vendor KEEPITIL — in two clearly different cohorts

**Cohort A — brand products (Jul 7–14, 7 items)**
`KEEPITIL Logo Tee` · `Create Loud · Live Louder Hoodie` · `Logo Crewneck` · `Logo Hat` ·
`Men's Tank Top` · `Women's Racerback Tank` · `Men's Slides`

- **Rich tags:** Apparel, EDM, KEEPITIL, Print on Demand, Rave, SoCal, Streetwear, Underground
- **productType set:** T-Shirt / Hoodie / Crewneck / Hat
- **Brand-voice descriptions:** *"Straight from the underground…"*, *"Create loud. Live louder."*
- Price ladder: tee $34 · hat $30 · crewneck $55 (2XL $60) · hoodie $64 (2XL $70.50)

**Cohort B — "mom life" batch (Aug 6–7, 11 items in ~12 hours)**
`I'm Not Superwoman But I'm A Super Mom` · `I Run On Caffeine, Chaos & Questionable Choices` · …

- **No tags. No productType.** Flat $26.
- **Generic Printful boilerplate description**, identical across all 11:
  *"This t-shirt is everything you've dreamed of and more…"*

### The finding that matters

Collections are **smart rules on TITLE**:

| Collection | Rule | Products |
|---|---|---|
| Tees | TITLE contains "Tee" | 1 |
| Hoodies | TITLE contains "Hoodie" | 1 |
| Crewnecks | TITLE contains "Crewneck" | 1 |
| Hats | TITLE contains "Hat" | 3 |
| KEEPITIL Apparel | manual | 6 |

Cohort B's titles contain none of those words. **So 11 of 18 live products (61%) sit in zero
collections** — invisible to collection-based browsing, with no tags and no product type.

Two separate problems, worth separating:

1. **The Aug batch skipped the merchandising layer.** Speed came at the cost of tags, type,
   description and collection membership.
2. **Title-based smart rules are structurally fragile.** *"KEEPITIL Logo Tee"* matches; *"I Run
   On Caffeine"* never will, whatever it is. **Tag-based rules would be robust** — and Cohort A
   already carries the tags that would make that work.

### Printful binding is visible in the data

- **SKU format `9714352_9527`** = Printful product ID `_` variant ID. That is the join key.
- **Image filenames** — `unisex-staple-t-shirt-black-front-6a75a298d287e.jpg` — are Printful
  mockup renders on Shopify's CDN.
- **`inventoryQuantity: 9999` per variant** = print-on-demand, not real stock.

**Safe actions:** read products, variants, collections, orders, inventory, analytics.
**Owner-only:** publishing, price changes, product deletion, collection restructuring, app installs.
**Not doing:** any write. Per directive, nothing live is being changed.

---

## 3. GitHub — MIXED, and a standing hazard

| Item | State |
|---|---|
| `gh` CLI authenticated as | **`fobbinhard`** — the **NEXUS** identity (scopes `repo`, `workflow`; osxkeychain) |
| KEEPITIL org access | **NONE verified.** I have never authenticated as `illestratedlifestyle@gmail.com` |

**`scripts/keepitil-github-identity.command` is written and ready.** It:

- **backs up `~/.config/gh/hosts.yml` first**, prints the restore command
- adds the KEEPITIL account (gh ≥2.40 supports multiple accounts per host — `login` adds, it
  does not replace)
- **verifies `fobbinhard` survived**, and auto-restores from backup if it did not
- inventories KEEPITIL repos and orgs, read-only
- **switches the active account back to `fobbinhard`** so Codex's NEXUS work is untouched

That last step matters: leaving the active account on KEEPITIL would silently retarget Codex's
NEXUS work — a worse outcome than not running the script at all.

**Needs you:** the GitHub device-flow authorisation.

---

## 4. Cloudflare — NO KEEPITIL ACCESS (corrected 2026-08-13)

> **CORRECTION.** An earlier version of this document stated wrangler pointed at the KEEPITIL
> account (`29c9b59d…`) and that "the two CLIs point at opposite sides of the divide." **That was
> wrong.** It came from recollection of an earlier point in the session rather than a fresh check.
> Verified by `wrangler whoami` on 2026-08-13:

```
👋 Logged in with an OAuth Token, associated with fobbinhard@gmail.com
   Account: Fobbinhard@gmail.com's Account   2c7cfa177bfd43eda4135b050c0941ae
```

| Item | Verified state |
|---|---|
| wrangler account | **`2c7cfa177bfd43eda4135b050c0941ae` — the NEXUS account** |
| KEEPITIL Cloudflare | **NO ACCESS** |

**Everything the inventory returned belongs to NEXUS, not KEEPITIL**, so it is Codex's lane and
out of scope here. Observed on that account: no KV namespaces, **R2 not enabled** (`code: 10042`),
no Pages projects listed, no D1, no Queues.

Token scope on the NEXUS account is broad — `workers`, `d1`, `pages`, `ai`, `browser`,
`secrets_store`, `containers`, `email_sending` all at write. That is the NEXUS deploy token and
another reason not to operate KEEPITIL through it.

**Two real gaps:**

1. **No KEEPITIL Cloudflare credential.** keepitil.com's Workers, Pages, routes and DNS cannot be
   inventoried at all. This is a credential gap, not an empty inventory — do not read the empty
   result above as "KEEPITIL has no Cloudflare resources."
2. **Zone/DNS listing needs `Zone:Read`** on whichever account holds keepitil.com.

**Keep the account-ID guard in the deploy script regardless.** The hazard it defends against is
real even though my description of the current state was not.

---

## 5. Other capabilities

**Available now:** Gmail · Calendar · Drive · Shopify · Notion · Asana · Figma · Canva ·
Adobe Express · Zapier · Make · Supermetrics · HubSpot · Descript · **browser automation** ·
**desktop control** · local filesystem · scheduled tasks.

**Needs authorising in claude.ai connector settings** (I cannot run OAuth from here):
Slack · Ahrefs · Amplitude · Klaviyo · SimilarWeb, plus the marketing-plugin
Notion/Figma/Canva/HubSpot instances.

**No Printful connector exists.** The Printful half of the commerce workflow is currently
**manual or Claude-driven through the browser** — it cannot be read from an API. Capturing it for
NEXUS means documenting the procedure, not introspecting a service.

---

## 6. Commerce workflow — what is actually manual

Reconstructed from product evidence, not recollection. Gaps are marked.

| Step | Today | NEXUS would need |
|---|---|---|
| Idea / research | Claude or owner | Researcher + memory of what sold |
| Design / image | Claude image generation → file | image capability + brand style memory |
| Printful upload | **manual / browser** — no API binding | **Printful credential as a capability** ⚠️ |
| Variants + mockups | Printful generates | mockup URLs land on Shopify CDN |
| Shopify listing | Printful push → Shopify | Shopify capability (**have it**) |
| Pricing | flat $26 (Cohort B) vs laddered (Cohort A) | pricing rules as config, not ad hoc |
| Collections / SEO | **SKIPPED for 11 of 18 products** | tag-based rules + a merchandising step |
| Approval | owner | approval gate before publish |
| Publish | live immediately | approval-gated |
| Audit | none | audit row per product |

**The biggest gap is Printful**, both as a credential and as the one step with no API binding.

---

## 7. KODE

Confirmed capable this session, in-repo: multi-file edits, running test suites, `tsc`, branches,
commits, PRs, **and empirical Postgres investigation** — it settled an RLS question I had guessed
at by running all three cases on a real database as `authenticated`.

**Better suited to KODE than Claude Cowork:** repository engineering, test authoring, CI
debugging, migrations analysis, anything needing many fast file operations.
**Better suited to Claude Cowork:** browser/desktop operation, multi-service web workflows,
account configuration, Shopify/Printful operation, visual verification.

**KODE has no Printful or Shopify access.** Commerce stays with Claude.

---

## 8. Recommended NEXUS bindings

| Capability | Account | Binding | Risk | Sequence |
|---|---|---|---|---|
| **Shopify** | KEEPITIL | Admin API token as a capability credential | read safe / write approval-gated | **First** — verified, isolated, no Codex overlap |
| **Printful** | KEEPITIL | API key as capability credential | write = real cost | Second — closes the workflow gap |
| Supabase `keepitil-prod` | KEEPITIL | project binding, read-first | production data | Third |
| GitHub KEEPITIL | KEEPITIL | separate identity, never mixed with NEXUS | code | After identity split |
| Cloudflare KEEPITIL | KEEPITIL | account-ID-checked binding | production hosting | After zone inventory |

**Keep separate:** NEXUS Cloudflare/GitHub/Supabase under `fobbinhard` — the isolation is
working and is what has prevented at least two cross-account accidents.

**Share via binding, not migration:** KEEPITIL product data stays in `keepitil-prod`. NEXUS
reaches it through an explicit capability.

---

## 9. Owner actions — batched

| # | Action | Why |
|---|---|---|
| 1 | Authorise GitHub device flow when the identity script runs | Only way to get KEEPITIL repo access |
| 2 | Decide on un-pausing `keepitil` for dependency proof | Mutation + possible billing |
| 3 | Provide Printful API key **when** we bind commerce | No connector exists; blocks the workflow |
| 4 | Authorise Slack/Klaviyo/etc. in claude.ai settings *(optional)* | Not needed yet |

## 10. Smallest next step

**Bind Shopify as the first NEXUS capability, read-only.** It is verified, isolated from Codex's
lane, and proves "credentials belong to the capability, not the agent" against a real system with
zero write risk.

The obvious first task it could serve, using data already gathered: **merchandise the 11
orphaned products** — add tags, product type, and convert the collection rules from title-based
to tag-based. That is a genuine business improvement, entirely inside my lane, and approval-gated
before anything publishes.
