# KODE DIRECTIVE — P0: NEXUS IMAGE / FILE INPUT

**From:** Claude (Atlas) · **2026-08-14** · Blocks `NEXUS APP FOUNDATION: PASSED`.
Owner directive: image upload must work from the installed iPhone PWA before foundation is called complete.

**Commit this file to `docs/` first.**

---

## What I verified on deployed production, so you don't re-derive it

**1. A file input already exists in the composer — it just goes nowhere.**

```
<input type="file"> inside <form class="composer">
accept   = ""      ← no MIME filter
capture  = null    ← no camera hint
multiple = false
siblings = ＋ 🎤 🔊 Send
```

The `＋` is a **full-width character (U+FF0B), not ASCII `+`** — worth knowing before you go looking for it by text.

`accept=""` is why iPhone won't offer a sensible picker. It needs an explicit list, and a second path with `capture="environment"` for the camera.

**2. There is no upload endpoint at all.** All five probed return **404**:

```
/api/upload  /api/attachments  /api/files  /api/artifacts  /api/sources
```

So the client half is stubbed and the server half does not exist. **Nothing is silently half-working** — you're building the whole path.

**3. An `artifacts` table already exists** — from `20260809000000_initial_nexus.sql`:

```
artifacts(id, project_id, task_id, storage_path, media_type, size_bytes, metadata jsonb, created_at)
```

**Extend this rather than creating a parallel table.** It already carries `storage_path`, `media_type`, `size_bytes` and a `metadata` jsonb. What the owner's spec needs and it lacks: `conversation_id`, `message_id`, `owner_id`, `app_id`, `filename`, `hash`, `provenance`. Note `project_id` is currently **NOT NULL** — a chat attachment has no project, so that constraint has to relax or you need a default. Check before writing the migration.

**4. Unverified, check it yourself:** whether any Supabase Storage bucket exists on `dojmswwxmdtizrtoirem`. I could not confirm it. `select * from storage.buckets`.

---

## Build

**Storage:** Supabase Storage, **private bucket**, path scoped by owner — e.g. `attachments/{owner_id}/{conversation_id}/{uuid}.{ext}`. Retrieval via **signed URL** with a short TTL. No public bucket. Never expose the service-role key to browser code — the browser uploads under the **user's session** so RLS decides what's writable, same pattern as `/api/memory` and `/api/chat`.

**Validate server-side, not just client-side:**
- MIME allowlist: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`
- size cap — pick one and enforce it in the route, not only in the input
- reject anything else with a clear message; never accept-and-ignore
- **sniff the actual bytes**, don't trust the declared `Content-Type` — a renamed executable will present as `image/png` otherwise

**HEIC from iPhone:** iOS Safari often converts to JPEG on upload, but not always. If a HEIC lands, either convert or return an explicit *"HEIC isn't supported yet, please choose JPEG"* — the one unacceptable outcome is a silent failure.

**Cross-app isolation is non-negotiable.** Attachments carry `app_id` and must be covered by the same RESTRICTIVE app-isolation policies as `memories`. I verified today that KEEPITIL-scoped memory is invisible to Thrive and to unscoped search — attachments must behave identically. **Add a test that asserts it**, mirroring `tests/cross-app-privacy.test.ts`.

---

## Vision routing

Workers AI has **free-tier vision models** (`@cf/meta/llama-3.2-11b-vision-instruct` and similar). That's the Zero-Cost-preserving path — verify the exact current model id against Cloudflare's catalogue rather than trusting this note; a deprecated id already bit this project once (`llama-3.1-8b-instruct`, retired 2026-05-30).

Behaviour the owner specified, and I'd hold to it strictly:

- provider supports vision → send the image, Echo discusses it
- provider does not → **still persist the upload**, and say plainly that image understanding isn't available on this route
- **never silently drop the attachment**

That last point is the same defect class as the memory bug you just fixed: a silent failure that looks like a non-event. `recallNote` was the right answer there — do the equivalent here, an `attachmentNote` in the chat response saying what happened to the image.

---

## Knowledge boundary

An uploaded image is an **artifact, not knowledge**. It must not become trusted knowledge automatically, and its *interpretation* must never be promoted on its own. Later the user chooses: keep in conversation / add to Knowledge Sources / attach to Project / associate with an Agent task. Build the storage so those routes are possible; don't wire auto-promotion.

---

## Acceptance — I run this, you can't

The owner's test is on the **installed iPhone PWA**, which I cannot reach: my browser reports `resize_window` success while `innerWidth` stays 1440, so I never enter the mobile breakpoint. I'll run desktop + production API proofs and the isolation check; **the iPhone pass needs the owner or your device emulation.**

Sequence: new chat → `＋` → choose photo → preview → send with "What is in this image?" → attachment persists → Echo analyses it *or* explicitly reports the vision limitation → force-close the PWA → reopen → image still there → confirm another app scope cannot retrieve it. Then repeat with Camera.

---

## Order

1. migration (extend `artifacts`, relax `project_id`, add app isolation policy)
2. upload endpoint + validation + signed retrieval
3. composer wiring: `accept`, `capture`, preview, caption
4. vision routing + `attachmentNote`
5. isolation test + persistence test

Ship 1–2 as one PR so I can verify storage and isolation on production before any UI lands.
