# ATLAS DECISIONS — Scene Editorial Profiles + Culture VID

**ATLAS · 2026-08-15 · Measured on `ovmqtzjfpzrbzrlkxwgw` production, not inferred.**
This is the ATLAS half of the directive. The KODE half is `KODE_TICKET_SCENE_VID_AND_MOBILE.md`.

---

## MEASURED STATE — start from these numbers

```
profile_meta        6 rows total     account_type: organizer=2, brand=2, NULL=2
                                     status:       review=4, published=2
profile_owners      2 rows           (slug, owner_id, created_at)  ← claim architecture EXISTS
venues             30 rows           published=9, draft=21
profile_content    348 live          article=294, event=43, post=11
  with an image     11               ← NOT 201
  video-bearing      0               ← no url, embed or video field anywhere
vs_competitions    36 published      vs_entries: 0
```

### Three corrections to my own prior reporting

**1. PIX has 11 items, not 201.** I previously reported 201 by counting a column that no longer carries images; the live count of rows with a non-empty `data->>'img'` is **11**. PIX is not a healthy tab with a rendering problem — it is nearly as empty as VID. §14 of the directive assumes an inventory to review; there is essentially none.

**2. Culture already ships a VID tab.** Live tabs are `Feed · Blog · Vid · Pix`. I twice recommended "hold VID until there's content." It has been exposed and empty the whole time. **The directive's VID work is a repair, not a new feature.**

**3. There is no `artist` account type.** `account_type` holds only `organizer`, `brand`, and NULL. The directive's five-type taxonomy has to be created, not adopted.

---

## D1 — PROFILE TAXONOMY

Use the existing `profile_meta.account_type`. **Do not add a parallel table.**

| Value | Meaning |
|---|---|
| `editorial_artist` | KEEPITIL-authored, unclaimed |
| `editorial_venue` | KEEPITIL-authored, unclaimed |
| `editorial_organizer` | KEEPITIL-authored, unclaimed |
| `editorial_brand` | KEEPITIL-authored, unclaimed |
| `subscriber_profile` | a real signed-up account |

**Ownership is `profile_owners`, not `account_type`.** That table already exists with 2 rows and is the correct source of truth for "is this claimed." A profile is a subscriber profile **iff** a `profile_owners` row exists for its slug. Deriving it from a type string would let the two disagree.

**Migration of the 6 existing rows:**

- the 2 with a `profile_owners` row → `subscriber_profile`
- `organizer=2`, `brand=2` → prefix `editorial_` unless a `profile_owners` row exists
- the 2 NULLs → classify explicitly or hold in `review`. **Do not default NULL to editorial** — an unclassified row must not silently become publishable.

### Public labels — the rule that matters

Editorial profiles render **"Artist Profile" / "Venue Profile" / "Organizer Profile" / "Brand Profile."**
Never Member, Subscriber, Verified, or KEEPITIL Creator unless `profile_owners` has the row.

This is a truthfulness constraint, not a copy preference. A venue that never signed up must not appear to have endorsed KEEPITIL.

---

## D2 — PUBLICATION THRESHOLD

The directive proposes 80%. **A percentage of a checklist invites rounding up.** Use hard gates:

**Required — no publication without all six:**

1. correct public name
2. `account_type` set (never NULL)
3. entity category
4. ≥1 verified source URL, stored internally, returning 200
5. short description containing no claim absent from the source
6. `last_reviewed_at` timestamp

**Required for the listing to be worth showing — at least two of:**

- profile image (approved fallback counts)
- location
- genre / industry
- ≥1 relationship to an event, article, venue or brand
- working public link

Anything failing the six stays `status='review'`. That value already exists and already holds 4 of the 6 rows — no new state needed.

---

## D3 — VID: APPROVED SOURCES

**V1: YouTube only.**

YouTube has a documented public oEmbed endpoint requiring no key, no OAuth and no account — it satisfies Zero Cost and the "official mechanism" rule outright. TikTok's oEmbed is public but its embed availability changes per-post. Instagram's oEmbed **requires a Facebook App with an approved review** — that is an account-owner OAuth dependency, which §28 lists as an escalation trigger. It is out of V1 by the directive's own rule.

Add TikTok in V2 once the health-check loop has proven itself against YouTube. Instagram only if the owner decides the App review is worth it.

---

## D4 — VID VISIBILITY THRESHOLD

The directive proposes 20 videos / 5 creators / 3 categories. **Adopted unchanged** — the numbers are sensible and I have no evidence to override them.

**One addition:** the same rule must apply to **PIX**, which has 11 items and is live right now. A rule that hides an empty VID while an 11-item PIX ships is inconsistent. Both tabs read from one config gate.

**Until each passes: hide the tab.** Culture is therefore `FEED · BLOG · VS` today, and tabs appear automatically as inventory arrives. Config-driven, per §15 — no code change to flip.

---

## D5 — CULTURE TABS, V1

`FEED · BLOG · VS` now → `FEED · BLOG · PIX · VID · VS` as thresholds pass.

**Note the live top row is `FEED | RADIO | VS`** — Radio appears both as a Culture tab and as a global destination. Two paths to one product, one of them now redundant since Radio is in the global nav. **Remove Radio from the Culture tab row.**

VID filters at launch: **ALL · LOCAL · ARTISTS · EVENTS**. VS is omitted deliberately — `vs_entries` is 0, so a VS video filter would be empty by construction. Add it when entries exist.

---

## D6 — AGENTS

Per §6 and the standing directive, agents **draft; they do not publish.** Everything lands in `status='review'`.

Scout proposes · Lyric drafts descriptions · Luna checks imagery · Sentinel validates links and embeds · Oracle measures engagement.

**The paused content-generation cron jobs stay paused.** This is discovery and validation work, not a route back to content generation. If a discovery job starts producing prose, it has drifted and should be stopped.

---

## D7 — WHAT I AM NOT DECIDING

**Radio's secondary nav is `CHANNEL · PLAYLIST · SCHEDULE · VS · APPS · GAMES`** — six tabs, where the nav map says three. I do not know whether the extra three are intended or accumulated. **Nobody should "fix" this to three without the owner confirming**, and no ticket below touches it.

---

## SEQUENCE

**Before any of this: the safe-area regression** (`KODE_TICKET_SCENE_VID_AND_MOBILE.md`, M1). It is a visible defect on every page with a header, it is ours, and it takes minutes.

Then: taxonomy migration → editorial labelling → config-gated tabs → YouTube ingestion → health checks.
