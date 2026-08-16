# NEXUS VISUAL PUNCH LIST — Batch 1: Shell + Chat

**Claude (Atlas) · 2026-08-14 · For KODE implementation.**
Observed on deployed production `nexus-web.keepitil-nexus.workers.dev` at 1440px. Every item below was seen on screen, not inferred from source.

**Mobile note:** I cannot verify mobile. `resize_window` succeeds but `innerWidth` stays 1440 — the page never enters a mobile breakpoint in this browser. **All mobile items below are specified from the directive, not observed.** KODE or the owner must verify them on a real device. Do not mark them accepted on my say-so.

---

## D1 — Composer does not anchor to the viewport bottom **(highest impact)**

**Observed:** on a new conversation the composer renders directly beneath Echo's greeting, roughly 290px from the top, leaving ~500px of empty canvas below it. The page reads as broken/unfinished.

**Expected:** composer pinned to the bottom of the viewport at all times; the message canvas scrolls independently above it.

- chat layout becomes a flex column at `100dvh` (**`dvh`, not `vh`** — `vh` is what breaks iOS when the keyboard opens)
- message list `flex: 1; overflow-y: auto; overscroll-behavior: contain`
- composer `flex: 0 0 auto`, `padding-bottom: max(12px, env(safe-area-inset-bottom))`
- empty state centres in the scroll area — it must not push the composer

**Accept when:** empty conversation and 50-message conversation both show the composer at the same bottom position.

---

## D2 — Search is orphaned in the sidebar

**Observed:** "Search chats" sits *below* Settings, separated from New Chat by all seven nav items, and detached from the conversation list it filters.

**Expected:** directly beneath **+ New Chat**, above the nav group. Order: `New Chat → Search → nav → conversations → account`.

---

## D3 — System status in primary chrome

**Observed:** `VOICE BETA` beneath the wordmark; `● ZERO-COST MODE` pill pinned bottom-left of the sidebar.

**Expected:** remove both from the shell. Zero-Cost belongs in **Settings**, and is already correct in `/api/health`. Keep the wordmark alone.

*Zero-Cost stays **on** — this is a display change only.*

---

## D4 — Conversation rows are heavier than ChatGPT's

**Observed:** each row carries a persistent `···` affordance and a filled active-state block.

**Expected:** title truncates to one line; `···` appears on hover/focus only; active state is a subtle background, no border. Row height ≈ 36px.

---

## D5 — Duplicate navigation

**Observed:** "Back to Chat" button top-right of Agents duplicates the sidebar's Chat item.

**Expected:** remove. The sidebar is the single nav authority.

---

## D6 — Header is oversized

**Observed:** eyebrow `ECHO` + 28px `New conversation` occupies ~90px before any content.

**Expected:** single-line header ≤ 52px. Conversation title at ~15px/600. Drop the eyebrow — the agent is already established by the message author label.

---

## D7 — Mobile behaviour **(unverified — KODE must confirm on device)**

- composer above the keyboard, `100dvh` + `env(safe-area-inset-bottom)`
- drawer scroll-locks the page while open (`overscroll-behavior: contain` + body lock, **not** `overflow:hidden` on `html` — that breaks `position:fixed` on mobile Safari; this exact bug already shipped once on KEEPITIL)
- backdrop dismisses on tap
- no viewport jump on focus
- Send reachable one-handed

---

## Order

D1 → D6 → D2 → D4 → D3 → D5 → D7.
D1 alone changes the perceived quality of the product more than the rest combined.

## Out of scope for Batch 1

Agents roster, Projects, Knowledge, control surfaces — Batches 2–4. Don't mix them into this PR; I verify per batch against production.

---

## What is already right — do not regress it

- **Echo's responses are unboxed.** The single most important chat decision, and it is correct.
- Composer internals: rounded container, `+` / input / mic / voice / Send in the right order.
- Chat is the default landing view.
- Sidebar hierarchy and conversation grouping.
