# KEEPITIL — Event Community Layer Architecture v1.0 (Events v5.1)

**From:** Fable-Atlas (Executive Ops) · **Date:** 2026-07-01 · **For:** Echo review → Opus-Atlas implementation after Events v5 ships
**Builds on:** `COMMUNITY-BACKEND-STACK-RECOMMENDATION.md` (Supabase — approved direction) and the Founder's v5.1 directive (save X, action menu, event chats). This doc adds the product architecture on top of that backend.

---

## North star (Echo's principle)
Not a Radiate clone. Each event chat is an **underground scene room**: flyer, meetup planning, photos, saves, tickets, and afterglow in one page that outlives the event.

> **ECHO REVIEW 2026-07-01 — APPROVED, with two additions (incorporated below):**
> 1. **Brand it "Scene Room"** — never "group chat." UI copy, buttons, and page titles all say Scene Room. Tabs: 💬 Discussion · 📸 Photos · 📍 Meetups · 🎵 Set IDs · 👥 Roll Call.
> 2. **"Who's Going" replaces a plain attendee count** — subscriber statuses: 🎉 Going · 🤔 Interested · 🎧 Looking for Crew · 🚗 Need Ride · 🚘 Have Ride · 📍 Hosting Meetup. Add `status` column to `event_rollcall`. Encourages real-world connection, not passive chat.
> Build order (Echo): Sprint 1 = Analytics → Sprint 2 = Scene Rooms → Sprint 3 = Mission Control + automation → Sprint 4 = CRM + Halloween.

## 1. Page model
- One chat page per event: `/chat/<event-slug>.html` (clean URL, permanent).
- Generated from the `events` table at event-import time (same pipeline that builds cards).
- Event listing expires from browse 1 day after end; **chat page never expires** → becomes the event's archive (photos, "where's the next one" thread).

## 2. Room anatomy (top → bottom)
1. **Flyer header** — flyer, title, date/venue/genre chips, badges, Buy Tickets + VIP buttons (until event ends; after: "This one's history" + link to organizer's next event).
2. **Pinned post** — auto-created: meetup point thread starter + house rules one-liner.
3. **Feed** — messages, image posts, replies, reactions (Facebook-page-style feed, not a scrolling IRC).
4. **Composer** — subscribers only. Signed-out users see the feed (preview) + "Sign in to post" gate.
5. **Sidebar (desktop) / collapsed (mobile)** — who saved this event (avatar stack + count), related events (same organizer/genre).

## 3. Unique mechanics (the "get creative" part)
- **Roll Call** — one-tap "I'm going 🖤" that posts to the feed and adds you to the sidebar stack. Doubles as social proof on the event card ("14 heads going").
- **Meetup pins** — a message can be flagged type=meetup (time+spot); pinned section aggregates them.
- **Photo drop mode** — from event start until +48h, the composer defaults to image upload: "Drop what you saw." Post-event the room auto-posts "Photo drop is open."
- **Set ID thread** — auto-thread "Track IDs & sets"; posts tagged type=setid. Feeds future blog/radio content (Pulse can mine it).
- **KEEPITIL PICK rooms** get the green ribbon styling and an editorial first post from the team.

## 4. Data model (extends the SQL already in the stack recommendation)
- `event_messages` + `type` column: `text | image | meetup | setid | rollcall | system`.
- `event_rollcall (user_id, event_slug, created_at)` — powers counts + stacks. RLS same pattern as saves.
- Reactions: `message_reactions (message_id, user_id, emoji)`.
- Moderation: `is_hidden bool` on messages; only service role can set. Simple report button → flags row in `message_reports`.

## 5. Gating rules
| Action | Signed-out | Subscriber |
|---|---|---|
| Read feed | ✅ preview | ✅ |
| Post/react/roll-call/save | ❌ → sign-in prompt | ✅ |
| Upload images | ❌ | ✅ (5MB cap, image types only) |

## 6. Moderation & safety (minimum viable)
- House rules pinned in every room (no hate, no doxxing, no ticket scams; flyers+lineups fair game).
- Report → hides at 3 unique reports pending review; Sentinel gets a Strategy Log line.
- Founder/admin role can hide/delete via Supabase dashboard (no custom admin UI in v1).

## 7. SEO
- Event pages (not chat pages) carry Event schema, unique meta, clean URLs, internal links to artist/organizer/venue profiles (per Echo's SEO block).
- Chat pages: `noindex` while event upcoming (thin content), flip to indexable post-event once they hold photos/discussion — they become long-tail "\<event name\> photos/aftermovie" landers.
- Staging stays noindex until approved.

## 8. Build order for Opus-Atlas (each step shippable)
1. Save X + auth (tables already specced) — highest value, no chat needed
2. Action menu on cards (tickets/VIP/chat links; chat link can 404→"coming soon" page initially)
3. Chat page template + text feed (realtime)
4. Roll Call + reactions
5. Image drops + photo mode
6. Meetup pins + Set ID threads
7. Post-event archive behavior + SEO flip

## Definition of done (v5.1 launch = steps 1–3)
- [ ] Save X works signed-in, prompts signed-out
- [ ] Action menu on every flyer (hover desktop / tap mobile)
- [ ] Chat rooms live for all upcoming events, subscriber-gated posting
- [ ] Preview + sign-in gate verified signed-out
- [ ] Rooms persist after event expiry
- [ ] 3-click test still passes on events page
