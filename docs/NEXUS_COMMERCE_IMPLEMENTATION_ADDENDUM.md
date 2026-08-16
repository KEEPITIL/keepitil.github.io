# COMMERCE PACKAGE — Implementation Addendum

**Claude (Atlas) · 2026-08-13 · Read-only. No Shopify write performed.**
**Companion to `NEXUS_COMMERCE_PROJECT_PACKAGE.md` — new material only, nothing restated.**

---

## A. Owner decision, resolved to config

The `Mom Life` lane is settled. Encode it as **capability config, never code** — the next audience
lane must be a config edit, not a deploy.

```jsonc
{
  "baselineTags": ["KEEPITIL", "Apparel", "Print on Demand"],
  "garmentTagFromProductType": {
    "T-Shirt": "Tee", "Hoodie": "Hoodie", "Crewneck": "Crewneck",
    "Hat": "Hat", "Tank Top": "Tank Top", "Footwear": "Footwear"
  },
  "audienceLanes": {
    "underground": {
      "tags": ["EDM", "Rave", "SoCal", "Streetwear", "Underground"],
      "assignment": "manual",
      "//": "NEVER auto-applied. Owner ruling 2026-08-13."
    },
    "momLife": { "tags": ["Mom Life"], "assignment": "manual" }
  },
  "cohortLaneMap": { "A": "underground", "B": null, "C": "momLife" }
}
```

**The rule that must survive refactoring:** audience tags are assigned from `cohortLaneMap`, never
inferred from title text or model output. A model asked "what audience is this?" will eventually
answer "EDM" for a mom-life shirt, and that is precisely the error the owner ruled out. Baseline +
garment tags are derived; audience tags are looked up.

**Cohort B gets no audience tag** (`null`). Slides, racerback tank and men's tank top are brand-
neutral POD inventory. Do not invent a third lane to make the map look complete.

### Resolved tag sets — the expected diff, exactly

| Products | productType | Tags after (union with existing) |
|---|---|---|
| 11 × cohort C | `T-Shirt` | `KEEPITIL, Apparel, Print on Demand, Tee, Mom Life` |
| Men's Tank Top | `Tank Top` | `KEEPITIL, Apparel, Print on Demand, Tank Top` *(+ existing junk tag, see §C)* |
| Women's Racerback Tank | `Tank Top` | same |
| Men's slides | `Footwear` | `KEEPITIL, Apparel, Print on Demand, Footwear` *(+ `slippers`)* |
| 4 × cohort A | unchanged | **unchanged — diff must be empty** |

Cohort A producing a non-empty diff means the selector over-fired. Assert it.

---

## B. Use `tagsAdd`, not `productUpdate` — this is the most important line in the addendum

The package specifies union semantics. There is a Shopify primitive that provides them natively:

```graphql
mutation addTags($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) { node { id } userErrors { message } }
}
```

**`productUpdate(input: { tags: [...] })` REPLACES the entire tag array.** Implementing union by
read-modify-write through `productUpdate` means any concurrent edit between the read and the write
is silently destroyed — and a bug in the merge deletes curated tags outright.

`tagsAdd` is additive by construction. It **cannot** delete a tag even if the code is wrong. Use it
for every tag write in `commerce.product.enrich`. Reserve `productUpdate` for `productType`, which
is a scalar and has no such hazard.

`tagsRemove` exists for the symmetric case — needed only if the owner later prunes the junk tags in
§C. Not part of this phase.

**Verified limits:** 250 tags per product; exceeding it returns **HTTP 423**, not a `userErrors`
entry. Handle 423 as a distinct branch — it will not appear where the code looks for errors. KEEPITIL
products carry ≤10 tags, so this is defensive, not expected.

---

## C. Junk tags: leave them

Cohort B carries `["slippers"]`, `["Women's Racerback Tank"]`, `["Men's Tank Top"]`. Diff-only phase
**proposes no removal.** Reasons: `tagsAdd` cannot remove, so keeping the phase additive keeps it
provably non-destructive; and the tags are useless rather than harmful — they match no collection
rule. Surface them in the audit report as a cleanup candidate for a later, separately approved pass.

---

## D. Verified API shapes

Copied from live responses this session — these differ from the obvious guesses.

| Field | Actual shape | Note |
|---|---|---|
| `collection.productsCount` | `{ count: Int }` | **an object**, not a scalar |
| `collection.ruleSet` | `null` for manual collections | `KEEPITIL Apparel` is manual — null-guard before reading `.rules` |
| `ruleSet.rules[]` | `{ column, relation, condition }` | e.g. `{TITLE, CONTAINS, "Hat"}` |
| `ruleSet.appliedDisjunctively` | `false` on all four | AND semantics; single-rule sets today |
| `product.seo` | `{ title: null, description: null }` | object present, fields null — **never absent**, so `?.` won't catch it |
| `product.productType` | `""` empty string | **not null.** `isBlank` must test `""` |
| `product.tags` | `[]` or `["..."]` | plain strings, no wrapper |

The `productType: ""` and `seo.{...}: null` cases are the two that will pass a naive null check and
silently classify an unenriched product as enriched.

### Working audit query

```graphql
query Audit($first: Int!, $after: String) {
  products(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id title handle productType tags status createdAt descriptionHtml
      seo { title description }
      variants(first: 100) { edges { node { id sku price } } }
    } }
  }
}
```

Page at 50. The store has 18 products, so a single page suffices today — **but the resumability
requirement in the package is not optional**, because the failure it guards against (a truncated
audit reading as "already clean") gets more likely as the catalogue grows, not less.

---

## E. Golden fixture

The 18-product snapshot read this session is the regression fixture. Freeze it as
`fixtures/keepitil-2026-08-13.json` with these assertions:

| Assertion | Expected |
|---|---|
| total products | 18 |
| Printful-origin (SKU regex) | **18** |
| unenriched (§1.2 predicate) | **14** |
| unenriched (naive `tags.length === 0`) | 11 — **must fail the build if the predicate returns this** |
| duplicate-description groups | 1 group of 11 |
| products with null SEO | 18 |
| `Hats` rule simulation | 3 matches, 2 of them t-shirts |
| cohort A enrich diff | empty |

The 11-vs-14 assertion is the highest-value test in the suite: it fails loudly if anyone
"simplifies" the predicate back to the obvious form.

---

## F. Hats defect — recording without fixing

Per instruction the rule is not changed. Record it so it cannot be lost:

```jsonc
{
  "id": "DEF-COMMERCE-001",
  "severity": "production",
  "status": "open-verified",
  "surface": "storefront /collections/hats",
  "cause": "TITLE CONTAINS 'Hat' matches the substring 'hat' in 'That'",
  "affected": ["gid://shopify/Product/8862440259737",
               "gid://shopify/Product/8863174164633"],
  "blockedBy": "tags must be applied before title→tag migration",
  "fixedBy": "commerce.collections.migrate",
  "verifiedAt": "2026-08-13"
}
```

**Make `commerce.collections.migrate` refuse to run while any product in its target rule lacks the
required tag** — a live precondition check against Shopify, not a task-status lookup. That is what
enforces the owner's ordering constraint mechanically rather than by documentation.

Worth noting: the same class of bug is latent in the other three rules. `Tee` would match "Steel",
"Canteen", "Nineteen"; `Hat` merely got there first because "That" is common in conversational
product titles. The migration fixes the class, not the instance.

---

## G. Idempotency

Key the diff on `(productId, fieldName, beforeValueHash)`. On resume, re-read the live value and
skip any row whose `beforeValueHash` no longer matches — that field changed underneath us and the
proposal is stale.

Without this, a retry after partial failure re-applies `tagsAdd` (harmless — set semantics) but also
re-applies a `productType` write over a value the owner may have corrected by hand in between. The
hash check is what makes "resumable, not restarted" real.

---

## H. Zero Cost Mode boundary

| Skill | Model calls |
|---|---|
| `commerce.product.audit` | **none, ever** |
| `commerce.reconcile.printful` | **none, ever** |
| `commerce.product.enrich` | descriptions + SEO copy only |

Under Zero Cost Mode, enrich emits the deterministic half — productType, all tags including
`Mom Life` — and marks description/SEO `deferred`. **The entire owner-decided tag outcome in §A
requires no inference and costs nothing.** The tag fix ships under Zero Cost Mode; only the copy
rewrite waits.

---

## I. Still outstanding

| Item | Status |
|---|---|
| Shopify read-only Admin API token | **owner — blocks all three skills** |
| Printful-side deletion detection | impossible without a Printful key; highest-value future addition |
| Junk-tag removal (cohort B) | deferred, needs `tagsRemove` + separate approval |
| Collection migration | specified, **correctly blocked** on tags |

**Nothing was written. §A–§B and §D–§E are the material Codex cannot derive from the package.**
