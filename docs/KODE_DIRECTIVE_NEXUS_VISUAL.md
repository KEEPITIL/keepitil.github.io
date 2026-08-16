# KODE DIRECTIVE — NEXUS VISUAL CONVERGENCE

**From:** Claude (Atlas) · **2026-08-14**
**Source:** deployed production `nexus-web.keepitil-nexus.workers.dev`, observed at 1440px.
Every defect below was **seen on screen**, not inferred from source.

**First task, before any code:** commit this file and `NEXUS_VISUAL_PUNCHLIST_BATCH1.md` to `docs/` in `fobbinhard/nexus`. My browser file editor hung twice trying; you have a real checkout and it's one command.

**Ship each batch as its own PR.** I verify against deployed production between batches.

---

## MOBILE — YOU OWN THIS ENTIRELY

**I cannot verify mobile.** `resize_window` reports success but `window.innerWidth` stays **1440** — the page never enters a mobile breakpoint in my browser. Everything marked `[MOBILE]` below is specified from the owner's directive, **not observed by me**. Do not treat my review as mobile acceptance.

Run automated emulation (Chromium + WebKit if available) at **390×844, 393×852, 430×932, ~768**. Capture a screenshot per primary surface. Verify: breakpoint actually activates · compact header · drawer open/close · backdrop blocks underlying interaction · drawer scroll doesn't move the page · composer stays bottom-anchored · `safe-area-inset-bottom` respected · textarea growth doesn't push controls offscreen · long conversations scroll · no horizontal overflow · no clipped Send/Stop/mic/voice · rotation leaves no stale layout.

---

## BATCH 1 — SHELL + CHAT

### D1 — Composer does not anchor to the viewport bottom **(highest impact)**
On a new conversation the composer renders ~290px from the top with **~500px of dead canvas beneath it**. The product reads as unfinished.

- chat layout = flex column at **`100dvh`** — **`dvh`, not `vh`**. `vh` is what breaks iOS when the keyboard opens.
- message list: `flex:1; overflow-y:auto; overscroll-behavior:contain`
- composer: `flex:0 0 auto; padding-bottom: max(12px, env(safe-area-inset-bottom))`
- empty state centres inside the scroll area — it must not push the composer

**Accept when** an empty conversation and a 50-message conversation both show the composer at the same bottom position.

### D2 — `Search chats` is orphaned
Sits *below* Settings, separated from New Chat by all seven nav items. Move directly under **+ New Chat**. Order: `New Chat → Search → nav → conversations → account`.

### D3 — System status in primary chrome
Remove `VOICE BETA` from under the wordmark and the persistent `● ZERO-COST MODE` pill from the sidebar. Move runtime/cost status into Settings. **Zero Cost stays ON — display change only.**

### D4 — Conversation rows too heavy
`···` should appear on hover/focus only. Active state = subtle background, no border. Row height ≈ 36px.

### D5 — Remove `Back to Chat`
Appears on Agents, Knowledge and Projects. Duplicates sidebar nav.

### D6 — Header oversized
~90px before content. Single line, ≤52px, title ~15px/600, drop the `ECHO` eyebrow — the message author label already establishes it.

### D7 — `[MOBILE]`
Composer above keyboard. Drawer scroll-locks the page via **body lock + `overscroll-behavior:contain`** — **do NOT put `overflow:hidden` on `html`**; that breaks `position:fixed` on mobile Safari and has already blanked KEEPITIL's mobile homepage once. Backdrop dismisses on tap. No viewport jump on focus.

**Order:** D1 → D6 → D2 → D4 → D3 → D5 → D7. **D1 alone moves perceived quality more than the other six combined.**

---

## BATCH 2 — AGENTS + PROJECTS

### P1 — First-click race on Projects **(functional, not cosmetic)**
**Repro:** hard-load `/`, click **Projects** once → **Chat renders** while Projects shows active in the nav. Click again → correct. Agents and Knowledge don't do this. Nav state updates before the view mounts.

### P2 — Task objectives leaking in as names
A project is titled *"Build a small production-quality NEXUS usability improvement after reviewing the current product and roadmap. Choose…"* — a truncated task directive, ellipsis included. **The same string is the Knowledge collection heading.** Projects and collections need real names; the objective belongs in the description.

### P3 — Project cards dump directive prose
"NEXUS Completion Roadmap" renders ~6 lines including `ZERO_COST_MODE`, `KEEPITIL/Thrive`, `Draft PR only`. Clamp to 2 lines; full text on open.

### P4 — Create-project form is the first element on the page
Empty input + Create button above the workspace list. Should be a button that reveals the field.

### P5 — Agents roster
14 identical full-width bordered cards, ~80px each, every one suffixed `· Available`. Remove the repeated card treatment → lighter list. Name + role primary, status secondary, drop the repetitive "Available". Stronger avatar/identity hierarchy — currently single letters all in the same blue. Add a direct-chat affordance and **reserve an obvious Artifacts/Library affordance**. Hide UUIDs.

---

## BATCH 3 — KNOWLEDGE

### P6 — Opens inside a collection, not a collection list
`Sources / Ask / Studio` tabs are **correct** — the level above them is missing. Collections/notebooks first, then into one.

### P7 — `+ Add source` wraps to two lines
And `Zero Cost Mode` appears a **third** time inside the workspace card.

---

## Root cause behind P2 / P3 / P7

NEXUS is surfacing its internal plumbing to the user — task strings as names, directives as descriptions, runtime flags as badges. **Conceptually one fix, not three.**

---

## ALREADY RIGHT — DO NOT REGRESS

- **Echo's responses are unboxed.** Single most important chat decision; currently correct.
- Composer internals: rounded container, `+` / input / mic / voice / Send in the right order.
- Chat is the default landing view.
- Sidebar hierarchy and conversation grouping.
- **Projects workspace tabs already exist and are correct** — Overview / Conversations / Tasks / Knowledge / Code / Testing / Activity.

---

## Note on local typechecks

Your #62 note is right and worth repeating: `tsc -p apps/web` fails on a stale local `node_modules` (2.57.0 vs the lockfile's 2.112.3). CI installs from the lockfile and is green. **Don't report `main` broken on the strength of a stale tree** — I made the same class of error twice today, on `/v3/` and on the mobile viewport.
