# CHECKPOINT A (v2, CORRECTED) — KEEPITIL Navigation Implementation Map

**ATLAS · 2026-08-15 · Verified in the RENDERED DOM on production.**
This replaces v1. It is not a second version — v1's premise was wrong and is deleted, not archived.

---

## CORRECTION TO v1 — READ THIS FIRST

**v1 said KEEPITIL has two competing nav mechanisms. That was wrong.**

I fetched raw HTML and parsed it with `DOMParser`. That shows *server markup*, not what runs. **`keepitil-shell.js` deletes the static markup and builds its own nav before paint**, so what I measured as "the nav" was dead bytes.

KODE found it the expensive way — built a new shell, wired all five pages, and watched its nav vanish at runtime because the shell removes anything carrying `id="main-nav"`. It then **reverted its own work rather than shipping a sixth mechanism.** Correct call.

**Verified in the rendered DOM:**

```
document.body.firstElementChild  →  NAV#v3shell-nav
script                           →  /keepitil-shell.js?v=20260822b   (47,597 bytes)
```

**There is ONE shell. It already ships on all five destinations.** That makes K1 dramatically smaller and safer than v1 implied.

---

## WHAT THE SHELL RENDERS TODAY

**Top nav:** `KEEPITIL(/)` · `Culture(/culture.html)` · `Scene(/scene.html)` · `PROFILE(/profile.html)`

**Bottom nav `#kil-bnav` — already 5 slots, not 4:**

| # | href | aria-label | icon |
|---|---|---|---|
| 1 | `/` | Home | no svg |
| 2 | `/culture.html` | Culture | svg |
| 3 | `#` | **Create** | `.kb-plus`, text `+` |
| 4 | `/scene.html` | Scene | svg |
| 5 | `/profile.html` | Profile | svg |

**Correction to v1:** the bar is not 4 icons needing a fifth. It is **five slots needing relabelling**, and slot 3 is a **Create** action, not a destination.

---

## THE PRODUCT PROBLEM — unchanged and confirmed at source

Measured inside `keepitil-shell.js`:

```
mentions "radio" : true   (asset filenames — keepitil-radio.js)
mentions "vs"    : FALSE
nav hrefs        : /culture.html  /scene.html  /apply.html  + legal + create-event
```

**VS appears nowhere in the shell. Radio appears only as an asset filename, never as a destination.**

Both products are live and healthy — `/radio` and `/vs` both return 200 — and neither is reachable from any navigation. **VS has 36 published competitions and 0 paid entries.** That is not a demand problem. The nav list *is* the nav, and they are not on it.

---

## ROUTES — resolved, both forms work

| Route | `.html` | clean | Verdict |
|---|---|---|---|
| Culture | 200 | 200 | either |
| Scene | 200 | 200 | either |
| Radio | 200 | 200 | either |
| VS | 200 | 200 | either |
| Profile | 200 | — | `.html` |
| **Explore** | **404** | **404** | **does not exist** |

**Use `.html` — that is what the shell already emits.** Mixing forms adds a router hop on every nav click for no gain.

**`/explore` does not exist and must not be created.** Explore is the **homepage `/`** relabelled in the nav. No new route, no redirect, no migration.

---

## K1 — THE ACTUAL TICKET

**One file: `keepitil-shell.js`. Roughly lines 194–215.**

1. **Add Radio and VS to the destination list.** Target: `Explore(/) · Culture · Radio · Scene · VS`.
2. **Relabel the bottom bar** to the same five. Profile leaves the bar.
3. **Decide the `+` Create action.** It is `href="#"` with `aria-label="Create"` — it currently goes nowhere. It is being displaced by a destination, so either wire it to `/create-event.html` (already in the shell) somewhere contextual, or retire it. **Do not silently delete a Create affordance** — check for a click handler bound elsewhere first.
4. **Profile → contextual upper-right**, per directive §11. Signed-out becomes Sign In. Not a nav slot.
5. **Bump the cache version.** It ships as `?v=20260807a`. **If this is not bumped the fix never reaches anyone** — that is a documented recurring failure here.

**Do not build a parallel shell.** The one that exists is authoritative, carries auth state, and deletes competitors at runtime.

---

## CULTURE / RADIO / SCENE / VS — content reality

**Culture = FEED / PIX / VS.** No VID.

| Tab | Source | Volume |
|---|---|---|
| FEED | `profile_content`, all kinds | 628 |
| PIX | rows with a non-empty `img` | 201 |
| VID | — | **0 — no type, no rows, no ingestion** |
| VS | `vs_competitions` | 36 published |

**VID is held.** An empty tab in primary navigation teaches people the product is hollow. Trivial to add when video exists.

**Radio → CHANNEL / PLAYLIST / APPS.** Live title is *"Radio — Stations, Playlists, Games & Creator Opportunities"* — all three surfaces exist. **APPS is new terminology for the existing games/creator module.** Map it; build nothing. Assess a persistent mini-player against the current implementation; do not rebuild the radio backend for cosmetic consistency.

**Scene — fixed since v1.** Was 1 published venue; **now 9** (El Rey, Fonda, The Forum, Roosevelt, Avalon, Bellwether, Beach House, Level 8, BLEU), restored from `_bak_venues_20260814`. The duplicate `venue-bleu` stayed deleted. Profiles remain **2 published** — correct, since internal agents are no longer public per directive §16.

**VS** — audit existing capability before adding. Do not build the rankings/rewards ladder speculatively.

---

## TRAPS — do not rediscover these

**`/v3/` is a live asset namespace.** `v3-tokens.css` returns 200 and is the theme engine; `keepitil-ai.js` and `keepitil-radio.js` ship from there, referenced 100+ times. **No directory deletion.** 161 local files were deleted on this assumption once and had to be recovered.

**`404.html` is the URL router**, not an error page. GitHub Pages forces the filename. Deleting it breaks every clean URL simultaneously.

**Never `overflow:hidden` on `html`** for the drawer — breaks `position:fixed` on mobile Safari; already blanked KEEPITIL's mobile homepage once. Lock `body` + `overscroll-behavior: contain`.

**`100dvh`, not `vh`** — `vh` breaks when the iOS keyboard opens.

**Verify cache-busted.** Varnish `age:` was 27s; an unchanged page reads exactly like a failed deploy.

---

## RULES SUPERSEDED BY THIS DIRECTIVE

**"V3.1 UNIVERSAL TEMPLATE — IMMUTABLE"** (nav = LOGO · Culture · SCENE · LOGIN/PROFILE, never changes) — **retired.**
**"Design Freeze"** — **lifted for navigation and shell only.**

Everything else in V3.1 still binds: nav logo `mix-blend-mode: screen`, no bare type selectors, version-stamped shared JS/CSS.

---

## MOBILE

**I cannot verify mobile.** `resize_window` reports success while `innerWidth` stays 1440 — I never enter the breakpoint. **KODE owns emulation** (390×844, 393×852, 430×932, ~768) and the owner's device is final. My review is not mobile acceptance.

---

## DEFERRED, NOT BLOCKING

**PR #74** (migrations in the deploy pipeline) is **held unmerged**. It fails loudly rather than skipping when secrets are absent, so merging it now would break the next push to `main`. It needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` — credentials I am not permitted to create or enter. `SUPABASE_PROJECT_REF` is simply `dojmswwxmdtizrtoirem`.

**Nothing depends on it.** The attachment migration is already applied and verified working in production. #74 only spares future SQL pasting.

---

## SEQUENCE

**K1** (shell destinations) → **K2** (safe areas, padding, active state) → **K3** (five icons, swappable components) → **K4–K8** in parallel (Explore, Culture, Radio, Scene, VS) → **K9** (contextual profile) → **K10** (regression + a11y) → **K11** (production).

**K1 is a handful of lines in one file that already ships everywhere.** It is the highest-value change in the directive and nothing blocks it.
