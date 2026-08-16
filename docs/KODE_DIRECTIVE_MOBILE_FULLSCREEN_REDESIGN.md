# KODE DIRECTIVE — Mobile Full-Screen Redesign (owner spec, 2026-08-15)

**Scope: mobile primarily; desktop where it applies. Owner-specified.**
This supersedes the tab-row work in S3/S6/S7 for **Culture, Radio and VS**. Scene is unchanged. Homepage is removals only.

**This is a different app model, not a restyle.** Culture, Radio and VS stop being "a page with tabs" and become **full-screen vertical feeds with horizontal filter switching** — TikTok / YouTube Shorts. Read §A before writing any page code.

---

## A. ONE COMPONENT, THREE PAGES — BUILD IT ONCE

Culture, Radio and VS all get the identical interaction:

- **one column**, each item filling and locking the full mobile viewport
- **swipe up / down** = next / previous item, snapped — no free scroll
- **swipe left / right** = change filter
- **header shows only the current filter name**, locked to the top, changing only on filter change
- **chat icon fixed bottom-right, above the bottom nav, on every page**

**Do not implement this three times.** One pager component, a filter set per page. Three copies will diverge within a sprint — Culture's tab row and Radio's tab row were the same widget once, and they are two different widgets today.

### Non-negotiable engineering constraints

**Virtualize.** Mount only the current item ±1. A full-screen pager over third-party embeds mounts a video player per slide; ten live embeds will stall a phone. Never more than one playing.

**Scroll-snap, not JS scroll hijacking.** Use CSS `scroll-snap-type: y mandatory` with `overscroll-behavior: contain`. Do not intercept touch events to fake paging — that breaks momentum, accessibility and the back gesture.

**`100dvh`, never `vh`.** And **do not put `overflow:hidden` on `html`** — that trap already blanked the mobile homepage once. Note `overflow-x:hidden` on `html`/`body` is what currently breaks `position:sticky` on radio.html; a locked pager may be affected by the same rule. Check it early.

**Accessibility.** Swipe-only navigation with no alternative fails keyboard and screen-reader users outright. Provide focusable prev/next affordances and arrow-key support, keep filter names as real headings, and never signal the active filter by colour alone. No autoplay with sound.

---

## B. GLOBAL REMOVALS — every page

**Remove the floating profile icon** (bottom-left account button).
**Remove the `+` Create FAB.**

Both are the controls that collided with content in the owner's screenshots. Removing them resolves M2 and M3 at the source rather than restacking them — **M2/M3 as written are superseded; do not spend time on z-index fixes for controls that are being deleted.**

### RESOLVED — account access lives in the chat icon

Owner decision: **profile and create both live inside chat.** Opening chat shows exactly **two options: Log in · Create.** Nothing else.

**Assumption flagged for correction:** signed out, slot one is **Log in**; signed in, the same slot becomes **Profile**. Otherwise a signed-in user is offered a login they don't need and still can't reach their profile. If the owner means something else, this is the line to change.

**Consequence to keep straight:** chat is the only route to the profile page, and chat is hidden *on* the profile page (§C). So you enter through chat and leave through the bottom nav. That is navigable, but it means **the bottom nav must remain visible on the profile page** — verify it does.

---

## C. THE CHAT ICON BECOMES THE PRIMARY ACTION SURFACE

This is the load-bearing change. With `+` deleted, **chat is how anything gets created.**

- fixed bottom-right, above the bottom nav, **identical position on every main page and subpage**
- **never on a user's profile page** — the one exception
- agentic: it routes the user to what they need and performs the action
- **exactly two options on open: `Log in` · `Create`.** Not "including" — these two and nothing else. Signed in, `Log in` becomes `Profile` (see §B).

**Chat is now a critical path, not a helper.** If it fails, users cannot create events at all. It needs an explicit failure state — the BROKEN ≠ EMPTY rule. "The agent is unavailable, here is the direct link to create an event" beats a spinner.

---

## D. PER PAGE

### 1. Homepage

- remove the mid-page `Culture · Radio · Scene · VS` links — the bottom nav already carries them
- remove the profile icon
- remove the `+` FAB
- **remove the `+` on every date/event row** — it routes to the wrong create-event page. Confirm where it currently points and report it; a wrong destination may exist elsewhere too.

### 2. Culture — `FEED · ARTICLE · VIDEO · PIXLE`

Owner's labels and spelling. Full-screen pager per §A.

- remove profile icon, remove `+`
- locked header showing the current filter only; swipe left/right to change
- **ARTICLE is in-house only** — no third-party ingestion into articles
- **VIDEO and PIXLE ingest from KEEPITIL's own `@keepitil` accounts** on TikTok, YouTube and Instagram

Because KEEPITIL owns the source accounts, this is self-syndication, not third-party curation: no outside-creator rights question, no attribution obligation, no discovery crawl. **Ingest one known account per platform.** See §E-3 for the Instagram constraint.

### 3. Radio — `CHANNEL · PLAYLIST · SCHEDULE · APP`

**ATLAS decision 2026-08-15, revising the earlier three.** KODE's audit found the dropped sections carry real content: Schedule **10 items**, VS/earn **8**, Games **2**.

- **Games (2) → folds into APP.** The live page title is already *"Stations, Playlists, Games & Creator Opportunities"*.
- **VS/earn (8) → dropped.** VS is a global destination now; this was a second path to it.
- **Schedule (10) → returns as a fourth filter.** It has the most content of the three and no other home. Hiding its entrance while keeping the page is how Radio and VS became unreachable in the first place.

Reversible in one array entry if the owner disagrees.

---

### 3a. Radio — original three-filter spec (superseded above)

- remove profile icon, remove `+`
- **remove the `Feed | Radio | VS` switcher** (this is S7, still correct)
- locked single-filter header; swipe to change
- full-screen pager per §A

Supersedes S6: the tab *row* is gone entirely, replaced by the single locked header.

### 4. Scene — UNCHANGED

Do not touch. The grid, filters and search stay as they are.

### 5. VS — `MIX · VOTE`

- remove profile icon, remove `+`
- remove the existing `MIX / VS / VOTE` row; the locked header replaces it
- full-screen pager per §A, **two filters**
- **submitted-content template: voting button, comment and share icons stacked above the chat icon**

Also still open from S7: **VS's empty state tells mobile users to "tap Join on the rail" and there is no rail on mobile.** 36 published competitions, 0 entries. Resolve the entry path as part of this work — a full-screen pager over zero entries is still zero entries.

### 6. Profile page

- remove profile icon, remove `+`
- **no chat icon** (the §C exception)
- filter nav bar **locks to the top on scroll**

Note this page keeps normal scrolling — it is not a full-screen pager.

---

## E. RESOLVED — owner answers, 2026-08-15

**1. VS filters are `MIX · VOTE`.** Two, not three. The pager must not assume a fixed filter count — Radio has three, VS has two, Culture has four.

**2. Third-party source = KEEPITIL's own social accounts.** VIDEO and PIXLE ingest from the `@keepitil` accounts on TikTok, YouTube and Instagram. This is a significant simplification: **KEEPITIL is the creator**, so there is no third-party rights question, no attribution obligation to outside creators, and no arbitrary-feed scraping. Ingest one known account per platform, not a discovery crawl.

It also changes the §D4 threshold maths — 20 items across 5 creators cannot be met by a single-owner account. **For VIDEO and PIXLE the creator-count gate is dropped; the item-count gate stands.**

**3. Instagram: ship TikTok + YouTube now. Instagram is blocked on an action only the owner can take — see §E-3 below.**

**4. VIDEO and PIXLE are empty today** — 0 and 11 items. The config gate holds them hidden until ingestion lands, so **Culture ships as `FEED · ARTICLE`** on day one. Expected, not a bug.

### E-3 — Instagram, precisely

TikTok and YouTube oEmbed are public: no key, no account, no review. Build both now.

Instagram's oEmbed requires a **Meta developer account, an App, accepted Meta Platform Terms, and Business Verification.** Creating accounts, accepting platform terms and granting OAuth are actions the owner must perform personally — they are not delegable, regardless of credential access. **This is not a capability gap that more access solves.**

**Split:**
- **Owner:** create the Meta app, accept the terms, complete verification, generate the token.
- **KODE:** everything else — store the token as a Supabase secret (never in source, prompts, memory, logs or any browser bundle), build the adapter behind the same provider-neutral record, and ship it dark until a token exists.

Build the Instagram adapter so it activates on a token appearing. Nothing else waits on it.

---

## F. ORDER

1. **§B removals** — deletes the collision class outright, and is the fastest visible improvement
2. **§A pager component**, proven on **Radio** first — smallest, self-contained content, no third-party embeds to confuse a perf problem with a paging problem
3. **Culture** onto the pager (`FEED · ARTICLE`)
4. **§C chat as action surface** — blocks nothing above it, blocks everything after
5. **VS** — after §E.1 and the rail finding
6. **Profile** sticky filter bar
7. **Third-party ingestion** — after §E.2 and §E.3

**Homepage removals can ship immediately and independently.**

---

## H. 🔴 APP COLD-STARTS ON THE 404 PAGE — ship before the pager

The installed app opens on **"Page not found"** instead of the homepage. Measured on production `404.html`:

```
capacitorAware   : false
redirect logic   : location.pathname.replace(/\/+$/,'') → location.replace(url + hash)
literal escapes  : ["’", "—"]   ← rendering as text on screen
```

### H1 — the router assumes web path semantics

`404.html` is the clean-URL router and it works on GitHub Pages, where a real server hands unmatched paths to it. **The native bundle has no server.** There is nothing to route: the app opens a path the bundle has no file for, lands on `404.html`, and the router then tries to resolve a clean URL from `location.pathname` — which under `capacitor://` or `file://` is not a site path at all. So it can't recover, and the user sits on an error page as their first impression of the product.

**Two things to fix, and check both:**

1. **The app's start URL must be a real file** — `index.html`, not `/`. A bundle can't serve a directory index.
2. **`404.html` must detect a non-`http(s)` scheme and go straight to `index.html`**, skipping clean-URL mapping entirely. Guard the redirect so it cannot loop — `location.replace` on a path the bundle lacks will bounce straight back here.

**Verify by launching the built app cold**, not by loading `404.html` in a browser. This bug is invisible on the web, which is why it survived: it is exactly the local≠live drift already documented for this bundle.

### H2 — literal `’` and `—` on screen

The developer note renders **"site’s"** and **"—"** as visible text. This is live on `keepitil.com/404.html`, not a bundle artifact — a JSON-encoded string written into HTML without decoding. Fix the source; then check whether the same generator produced other pages, because one escaped string usually means a batch.

**Both are user-visible on first launch. This section outranks §A.**

---

## I. PAGER BEHAVIOUR — owner spec, 2026-08-15 (supersedes §A's header rules)

Applies to **CONNECT (culture.html)** and **CREATE (radio.html)**. Scene is explicitly excluded — it stays exactly as it is, apart from the 1:1 card resize already shipped.

### I1 — the header is a single filter word, and it auto-hides

- **No page title. Ever.** No "Culture", no "Radio", no wordmark. The header is **one word: the current filter** — `FEED` / `ARTICLE` / `VIDEO` / `PIXLE`, or `CHANNEL` / `PLAYLIST` / `SCHEDULE` / `APP`.
- **Swiping content UP (to the next item) hides it.** The screen becomes pure content.
- **It reappears on two gestures only:** swiping **left/right** (filter change) and swiping **down**.

That is a directional-scroll header, not a sticky one. Track gesture direction, not scroll position — a position threshold will show the header at the top of every item and defeat the point.

**Respect `prefers-reduced-motion`**: no slide animation for users who ask for less. The header still hides and shows; it just cuts.

### I2 — content fills the entire screen

TikTok / YouTube Shorts. One item per viewport, snapped, no partial second item. The header floats over the content rather than displacing it — the item is full-bleed underneath.

Everything in §A still binds: CSS scroll-snap not JS hijacking, virtualize to current ±1, `100dvh`, no `overflow:hidden` on `html`.

### I3 — the side rail is content, not chrome

The vertical action rail (like / comment / reshare / save) must be **configurable per item type**, not hardcoded into the pager. A VIDEO item and an ARTICLE item do not want the same actions.

Drive it from a per-kind list so the owner can change what appears without a code change — same principle as `KIL_FLOATING`.

### I4 — no chat button on the content feeds

Already set in `KIL_FLOATING`: `culture` and `vs` are `chat:false`.

**Open, flag rather than assume:** the owner named "connect and earn" as the examples. **Radio (CREATE) is currently `chat:true`** and becomes a full-screen feed under this spec. Do not change it without the owner's word — but expect the question.

**Known consequence, recorded not argued:** §C makes chat the only route to Create and to the user's own profile. On CONNECT and EARN there is now neither. The owner has seen this stated and chose it; revisit only after he has used it on device.

---

## J. VIDEO + PIXLE INGESTION — verified sources, 2026-08-15

### J1 — the accounts, confirmed

From `keepitil-shell.js:422-426`, and the YouTube channel verified live:

```
YouTube    @keepitil   channel UC-gWqozXipPMT2VjcwJOLbw   ← EXISTS, verified
TikTok     @keepitil
Instagram  keepitil
```

### J2 — use the RSS feed for discovery, not oEmbed alone

**This improves on my earlier spec.** Every YouTube channel publishes a keyless feed:

```
https://www.youtube.com/feeds/videos.xml?channel_id=UC-gWqozXipPMT2VjcwJOLbw
```

No API key, no OAuth, no quota. It returns `yt:videoId`, `media:title`, `published` and thumbnail for recent uploads.

**Two-stage, not one:** RSS gives you *which* videos exist (discovery). oEmbed gives you the embed payload per video. My original "oEmbed only" spec had no discovery mechanism at all — it assumed someone was pasting URLs by hand.

**Verify the feed returns entries before building on it.** I could not: this sandbox is blocked from youtube.com and I will not route around that. If it comes back empty, discovery needs a different path and the whole plan changes — check first.

### J3 — PIXLE: TikTok Photo Mode is the source

**Correction, owner 2026-08-15.** I wrote that TikTok is video-only. It is not — **TikTok Photo Mode posts are image carousels**, and @keepitil can publish them. PIXLE has a source and does not need the Meta app.

**But discovery is the constraint, and it is different from YouTube's:**

| | discovery | embed |
|---|---|---|
| YouTube | **RSS feed, keyless** | oEmbed, keyless |
| TikTok | **none that is keyless** — listing an account's posts needs the TikTok Display API (app + OAuth) | oEmbed, keyless, works on any public post URL |

So TikTok can be **embedded** freely but not **enumerated** freely. That maps onto directive §20's own preference order, where option 3 is *"user-submitted public URL"*.

**Build PIXLE as curated-URL ingestion:**
1. Owner (or an agent) supplies TikTok post URLs — a paste box in the review queue, not a crawler
2. `https://www.tiktok.com/oembed?url=…` resolves title, author, thumbnail, embed HTML — **no key, no account**
3. Same `videos` table, `provider='tiktok'`, `review_status='review'` — one record shape for both tabs
4. Same S5 health loop: a deleted or privated post flips `embed_status` and drops off public surfaces

**Verify the oEmbed response distinguishes a photo post from a video post** before assuming the record maps cleanly. If it does not, carry the distinction on our side — `media_kind: photo|video` — because PIXLE and VIDEO must not show each other's content.

**This also unblocks Instagram later without rework:** the same curated-URL path works for any provider with a public oEmbed, so the Meta app becomes an upgrade to automatic discovery rather than a prerequisite for the tab existing.

**Still an owner decision, but a smaller one:** event flyer artwork (~64 published events already carry images) remains an option if TikTok Photo Mode posts are thin on the ground. Don't pick — ask once PIXLE has real TikTok URLs to count.

### J4 — flag on content character

The @keepitil YouTube channel describes itself as *"All love in AI music (Suno) and entertainment (Sora2)"*, with keywords entirely about AI-generated content. **So VIDEO will fill with AI-generated shorts, not event footage or artist sets.**

That may be exactly right. But the owner retired agent-generated *articles* three weeks ago on the grounds that agents shouldn't be producing the content, and Culture's 294 articles are still that retired programme. Filling the next tab with AI-generated video is the same question in a new place. **Raise it; don't decide it.**

---

## G. SUPERSEDED

- **M2, M3** — the colliding controls are deleted, not restacked
- **S6** — Radio's tab row is replaced by the locked single-filter header, not trimmed to three
- **S3** — the gate logic stands; the tab labels become `VIDEO` / `PIXLE` and the presentation becomes the pager
- **S7** — the `Feed | Radio | VS` switcher removal still stands and is now part of this

**M1 (top safe area) is NOT superseded and still needs device verification.** A full-screen pager makes it worse, not better: locked full-viewport content with no top inset runs straight under the status bar.
