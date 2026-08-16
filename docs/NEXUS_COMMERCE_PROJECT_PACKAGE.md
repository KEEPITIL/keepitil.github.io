# NEXUS COMMERCE PACKAGE — Project 1 + Five Skill Specifications

**Claude (Atlas) · 2026-08-13 · Read-only. No Shopify write performed.**
**Audience:** Codex / NEXUS implementation.

All figures below are from live Shopify reads this session, not recollection.

---

## PART 0 — Three corrections to the brief

The reads contradicted three premises in the scope. Stating them up front, because two of them
change what the code must do.

### 0.1 SKU origin detection does not discriminate — **all 18 products are Printful-origin**

| Cohort | SKU sample | Enriched? |
|---|---|---|
| Jul 7 brand (4) | `1079801_9575` | yes |
| Jul 14 (3) | `6337142_15236` | **no** |
| Aug 6–7 (11) | `9714352_9527` | **no** |

Every SKU matches `^\d+_\d+$`. Filtering on Printful origin returns all 18 and separates nothing.

**Implication:** `commerce.product.enrich` must key on **enrichment state**, not origin. Origin
detection is still worth keeping — it tells you *why* a product is bare and which fields Printful
can never supply — but it is not the selector.

### 0.2 It is **14 unenriched products, not 11**

The three Jul 14 products were missed by every previous count because they have a **non-empty but
useless** tag array:

| Product | productType | tags |
|---|---|---|
| Men's slides | `""` | `["slippers"]` |
| Women's Racerback Tank | `""` | `["Women's Racerback Tank"]` |
| Men's Tank Top | `""` | `["Men's Tank Top"]` |

A tag equal to the product's own title carries no information. `tags.length === 0` finds 11;
the correct predicate finds 14. **Implement the predicate in §2.2, not the naive one.**

### 0.3 A defect nobody had found: the title rules are **mis-including**, not just under-including

`Hats` is `TITLE CONTAINS "Hat"`. Substring matching is case-insensitive and unanchored, so it
matches **"T-h-a-t"**. Live contents of the Hats collection, read this session:

```
Hats (productsCount: 3)
  ├─ KEEPITIL logo hat — Embroidered                                    ← correct
  ├─ I'm Not Perfect But I'm A Mom — That's Pretty Much My Superpower   ← T-SHIRT
  └─ Mommin' Ain't Easy ... — And That Someone Is Me                    ← T-SHIRT
```

**Two t-shirts are in the Hats collection on the live storefront right now.** A customer browsing
Hats sees two garments that are not hats.

This reframes urgency. The 11 orphans are an *absence* — lost discoverability. This is a *wrong
answer* served to customers today. **It should be fixed first**, and it is the strongest argument
for the title→tag migration: the tag rule `TAG = "Hat"` cannot produce this class of error at all.

### 0.4 SEO is empty on all 18, not 11

`seo.title` and `seo.description` are `null` for **every product including the brand cohort**.
Scope the SEO proposal to 18.

---

## PART 1 — PROJECT: KEEPITIL Merchandise Cleanup

**Status: SPECIFIED, NOT EXECUTED. Output is a diff. No mutation.**

### 1.1 Verified inventory

| Cohort | Created | n | productType | tags | description | SEO |
|---|---|---|---|---|---|---|
| A — brand | Jul 7 | 4 | set | rich (8–10) | brand voice | null |
| B — July POD | Jul 14 | 3 | **empty** | **junk (1)** | Printful boilerplate | null |
| C — mom life | Aug 6–7 | 11 | **empty** | **none** | **11× identical** | null |

All 18: `status: ACTIVE`, vendor KEEPITIL, Printful SKUs.

### 1.2 Selector — use this, not `tags.length === 0`

```
unenriched(p) =
     isBlank(p.productType)
  || p.tags.length === 0
  || tagsAreUninformative(p.tags)

tagsAreUninformative(tags) =
     tags.length <= 1
  && every tag t: normalize(t) is a substring of normalize(product.title)
     // "Men's Tank Top" tagged ["Men's Tank Top"]; "Men's slides" tagged ["slippers"]
     // NOTE: "slippers" is NOT a title substring — so this clause alone misses it.
     //       The isBlank(productType) clause is what catches it. Keep all three.
```

Expected: **14 flagged** (3 from cohort B, 11 from C). If a run reports 11, the predicate
regressed to the naive form — treat that as a test failure, not a result.

### 1.3 Duplicate description detection

Normalize (strip HTML, collapse whitespace, lowercase), hash, group.
**Verified: all 11 cohort-C products share one identical `descriptionHtml`.** Cohort B has three
distinct Printful boilerplates. Expected output: one group of 11.

### 1.4 Proposed tag vocabulary

Reuse the existing brand vocabulary — do not invent a second taxonomy:
`Apparel · EDM · KEEPITIL · Print on Demand · Rave · SoCal · Streetwear · Underground` plus
garment tags `Tee · Hoodie · Crewneck · Hat`.

**Audience question the owner must settle before writes.** Cohort C is *mom-life humour*. It is not
underground EDM. Tagging it `EDM, Rave, Underground` would be false and would pollute the brand
collections it is meant to fix.

Proposal — a **second audience lane**, not an extension of the first:

| Cohort | Garment | Brand | Audience |
|---|---|---|---|
| A | Tee/Hoodie/Crewneck/Hat | `KEEPITIL`, `Underground`, `EDM`, `Rave`, `SoCal` | — |
| B | Tank/Slides | `KEEPITIL` | — |
| C | `Tee` | `KEEPITIL` | **`Mom Life`** |

Shared by all: `Apparel`, `Print on Demand`.

**This is a merchandising judgement, not a rule. It is the one item in this project that genuinely
needs the owner's decision rather than an approval click.**

### 1.5 Proposed productType

| Products | → |
|---|---|
| 11 cohort C | `T-Shirt` |
| Men's Tank Top, Women's Racerback Tank | `Tank Top` |
| Men's slides | `Footwear` |

### 1.6 Collection rule migration

| Collection | Now | Proposed | Fixes |
|---|---|---|---|
| Hats | `TITLE CONTAINS "Hat"` | `TAG = "Hat"` | **removes 2 wrong t-shirts** |
| Tees | `TITLE CONTAINS "Tee"` | `TAG = "Tee"` | 1 → 12 |
| Hoodies | `TITLE CONTAINS "Hoodie"` | `TAG = "Hoodie"` | robustness |
| Crewnecks | `TITLE CONTAINS "Crewneck"` | `TAG = "Crewneck"` | robustness |
| *(new)* Mom Life | — | `TAG = "Mom Life"` | 11 orphans get a home |
| KEEPITIL Apparel | manual (6) | leave manual | owner-curated; do not automate |

**Ordering is a hard dependency: tags must exist before rules switch to tags.** Migrating a rule
first empties the collection. Enforce as a precondition, not a comment.

### 1.7 Deliverable

Per product: `{ id, title, cohort, before: {...}, after: {...}, rationale, confidence }`
Plus: duplicate-description groups, collection before/after membership, and the Hats mis-inclusion
called out separately as a **live defect**.

**No writes. The diff is the artefact.**

---

## PART 2 — SKILL SPECIFICATIONS

Common to all five:

- **Capability:** `cap.shopify.keepitil.read` (`read_products`, `read_content`, `read_publications`)
  — writes named separately per skill.
- **Credential:** secret reference on the capability record. Never in `capabilities.config`, an
  agent prompt, a memory row, or an audit entry. Never logged, including in URLs and headers.
- **Cost class:** `free` (Admin API, Basic plan). Agentic steps that call a model are `llm` and
  must respect Zero Cost Mode.
- **Audit row per invocation:** timestamp · user · app · project · task · capability · operation ·
  parameters (**token redacted**) · result summary · error · duration · cost class used.
- **Rate limits:** Shopify GraphQL is cost-based. Back off on `THROTTLED`; never spin.

---

### 2.1 `commerce.product.audit` — READ ONLY

| | |
|---|---|
| **Inputs** | `{ storeId, includeCohortAnalysis?: bool }` |
| **Outputs** | `{ products[], cohorts[], unenriched[], duplicateGroups[], collectionHealth[], seoGaps[] }` |
| **Capability** | read only |
| **Approval** | **none** — cannot mutate |

**Deterministic:** paginate products (`id, title, productType, tags, status, createdAt,
descriptionHtml, seo, variants.sku`) · classify origin by SKU regex · apply the §1.2 predicate ·
hash-group descriptions · fetch collections + `ruleSet` · **simulate each title rule against all
titles to detect mis-inclusion** · flag null SEO.

**Agentic:** none. This skill must never call a model — it is the trusted baseline every other
skill's diff is measured against.

**Verification:** counts reconcile (`enriched + unenriched == total`) · re-running on unchanged
data is byte-identical (**it must be deterministic or it cannot be a baseline**) · every product has
exactly one cohort.

**Failure:** auth → fail closed, no partial report. Throttle → back off, resume by cursor. Partial
page → **fail the run**; a truncated audit that looks complete is worse than no audit, because the
missing products read as "already clean."

**Audit evidence:** full product snapshot hash, counts per cohort, the rule-simulation table.

---

### 2.2 `commerce.reconcile.printful` — READ ONLY

| | |
|---|---|
| **Inputs** | `{ storeId, printfulStoreId?: 15502856 }` |
| **Outputs** | `{ matched[], shopifyOrphans[], malformedSkus[], variantCountMismatches[] }` |
| **Capability** | read only. **No Printful credential required** |
| **Approval** | none |

**Deterministic:** parse `^(\d+)_(\d+)$` → `{printfulProductId, variantId}` · group variants by
product · assert every variant of a product shares one `printfulProductId` · flag non-matching SKUs
as non-Printful or hand-edited.

**Agentic:** none.

**Why it works without a Printful key:** the SKU embeds Printful's ids and Printful's own product
list is keyed by the *Shopify* id. The join is fully derivable from the Shopify side. When a
Printful credential exists, extend to detect products deleted in Printful but still ACTIVE on
Shopify — **currently undetectable and the highest-value future addition** (a live product that
cannot be fulfilled).

**Verification:** every SKU matches or is explicitly listed as malformed. **No silent skips.**

**Failure:** malformed SKU → record, continue (a data-quality finding, not an error).

---

### 2.3 `commerce.product.enrich` — DIFF ONLY, WRITE IS PHASE 2

| | |
|---|---|
| **Inputs** | `{ storeId, productIds?, brandVocabulary, audienceLanes }` |
| **Outputs** | `{ diffs[]: { productId, before, after, rationale, confidence, requiresJudgement } }` |
| **Capability** | read for proposal · `cap.shopify.keepitil.write` (`write_products`) to apply |
| **Approval** | **required before any apply.** Diff generation needs none |

**Deterministic:** productType from blank/catalogue · garment tag from productType · `Apparel` +
`Print on Demand` on all POD · preserve existing tags (**union, never replace — an unreviewed
overwrite can delete curated tags**) · flag duplicate descriptions.

**Agentic (model, `llm` cost class):** rewrite the 11 duplicate descriptions in brand voice ·
propose SEO title/description · **propose** audience lane.

**Guardrails on the agentic half:**
- brand voice seeded from *shipped copy* ("Straight from the underground", "Create loud. Live
  louder.") — real evidence, not invention
- descriptions must stay factually consistent with the Printful spec (fabric, weight, sizes);
  the model rewrites *voice*, never *specification*
- **audience assignment is `requiresJudgement: true`** and surfaces for owner decision, not an
  approval click. See §1.4.
- Zero Cost Mode: if `llm` is unavailable, emit the deterministic half and mark the agentic fields
  `deferred`. **Never silently ship boilerplate as if rewritten.**

**Verification:** every `after` differs from `before` in at least one field · no proposal empties a
populated field · reapplying a diff is idempotent · a dry-run diff against already-enriched cohort A
must be **empty** (proves the selector isn't over-firing).

**Failure:** partial apply → record which products succeeded; **the diff must be resumable, not
restarted**, or a retry double-applies tag unions.

**Audit:** before/after per field, approval id, who approved, model + prompt version for agentic
fields.

---

### 2.4 `commerce.collections.migrate` — WRITE, APPROVAL-GATED

| | |
|---|---|
| **Inputs** | `{ storeId, collectionIds, dryRun: default true }` |
| **Outputs** | `{ migrations[]: { collectionId, oldRule, newRule, membershipBefore, membershipAfter, gained[], lost[] } }` |
| **Capability** | read + `write_content` (smart collection rules) |
| **Approval** | **required.** Changes what customers see |

**Deterministic:** simulate old and new rule against all products · compute gained/lost · **block if
`membershipAfter` is empty and `membershipBefore` was not** · block if any product would be lost that
isn't an identified mis-inclusion.

**Agentic:** none. Rules are logic.

**Hard precondition:** `commerce.product.enrich` must have been **applied** (not merely proposed)
for every product the new tag rule depends on. Verify by reading live tags, not by trusting a task
status. Migrating first empties the collection.

**Expected first run:** Hats loses 2 t-shirts (**the live defect**) and keeps 1 hat; Tees goes 1 → 12.

**Verification:** post-migration membership matches simulation exactly. If it doesn't, the rule
semantics were misunderstood — **revert immediately** rather than reconcile forward.

**Failure:** Shopify rejects the rule → leave the old rule intact, report. **Never leave a collection
ruleless** — that is an empty category page on a live storefront.

**Rollback:** store the prior `ruleSet` verbatim in the audit row. Restoring it is the rollback.

---

### 2.5 `commerce.publish.gate` — POLICY

| | |
|---|---|
| **Inputs** | `{ storeId, mode: "audit" \| "enforce" }` |
| **Outputs** | `{ violations[]: { productId, status, missing[], recommendation } }` |
| **Capability** | read · `write_publications` **only in enforce mode** |
| **Approval** | **audit: none. enforce: owner-only, per product.** Publication state is revenue |

**Deterministic:** a product may be ACTIVE only if productType set · ≥3 informative tags · unique
description · SEO populated · ≥1 collection · valid Printful SKU. Anything else is a violation.

**Agentic:** none.

**Current state (verified): all 18 would violate** — SEO is null on every product. That is the
correct result and it demonstrates why **`enforce` must never run as a batch.** Unpublishing 18
live products to satisfy a policy would take the entire store offline. Enforce is per-product,
owner-approved, one at a time, and should probably never be used on existing inventory at all — its
real job is gating *new* products at creation.

**Recommended deployment: `audit` mode indefinitely.** Report drift; let a human publish.

**Failure:** in enforce, if unpublish succeeds but the audit write fails → **fail loudly**; a
product silently removed from the storefront with no record is the worst outcome in this package.

---

## PART 3 — Implementation order

1. `commerce.product.audit` — read-only, no credential risk, produces the baseline
2. `commerce.reconcile.printful` — read-only, needs no Printful key
3. `commerce.product.enrich` **diff only** — owner reviews, still no write scope
4. **Owner decides the Mom Life audience lane** — blocking, judgement not approval
5. Write token issued → apply enrich
6. `commerce.collections.migrate` dry run → approve → apply (**fixes the live Hats defect**)
7. `commerce.publish.gate` in `audit` mode, permanently

Steps 1–3 need only a read-only token. **Three of five skills ship before any write scope exists.**

## PART 4 — Owner actions

| # | Action | Blocks |
|---|---|---|
| 1 | Shopify Admin API token, **read scopes only** | steps 1–3 |
| 2 | **Decide: is cohort C a separate `Mom Life` lane?** | step 4 — judgement, not approval |
| 3 | Write-scoped token, separate credential | steps 5–6 |
| 4 | Approve the collection migration diff | step 6 |

**Nothing was written. Every number above came from a live read this session.**
