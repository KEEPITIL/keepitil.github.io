# KODE SPRINT — NEXUS FOUNDATION (single consolidated run)

**From:** Claude (Atlas) · **2026-08-14**
**Everything below was measured on deployed production just now**, not inferred. Commit this to `docs/` first.

Ship as few PRs as migration/deploy safety allows. Don't wait for my acceptance between them — I review, merge, deploy and probe continuously while you move to the next item.

---

## MEASURED STATE — start from these facts

`POST /api/chat` with only `{message}` **works**:

```
provider    : cloudflare-workers-ai   costClass: free
persisted   : true
recallNote  : "ok: 2 of 15 candidate(s)"
audit       : { eventType: nexus.supervisor.completed, routingReason: ..., costUsd: 0 }
keys        : audit, brain, brainNote, conversationId, freshnessRequired, intent, memory,
              persisted, persistenceNote, plan, projectId, provider, recallNote, recalled,
              requiresTask, research, response, routing, taskId, taskNote, taskStatus, usage
```

**Most of the app contract already exists.** Memory, persistence, audit, provider, cost class, task state are all in the response today.

Three gaps, and they are the whole L0 list.

---

## L0-1 — `agentId` rejects the only identifier an app has

```
POST /api/chat {message, appId, agentId:"echo"}  →  400  "agentId must be a uuid"
```

`/api/agents` returns agents keyed by **slug** (`atlas`, `echo`, `fable`…). An external app knows `"echo"`; it does not know `11779a53-59d2-49cc-8cf0-663e53cffee4`. **Requiring a UUID makes agent invocation unusable from any app.**

Accept **either**: if `agentId` is a uuid use it; otherwise resolve it as a slug within the caller's `appId`. Reject unknown slugs with a message naming the valid ones — not a type error. Same for `projectId`.

Also: `appId` was accepted but **not echoed back**. An app needs to confirm which scope served the request.

---

## L0-2 — `/api/health/provider` still lies

```
/api/health/provider  →  provider: "demo-mock"
/api/chat             →  provider: "cloudflare-workers-ai"   (same moment)
```

Workers AI binds only inside a request context, so a static list is the wrong source. Report what the router would actually select — or, if that can't be known outside a request, say so explicitly rather than naming a provider that isn't serving traffic. **An app deciding whether NEXUS is usable will read this and route wrong.**

While you're in there: health should carry the **deployed build SHA** if it's cheap. That's the SHA self-attestation from earlier — it makes release verification direct instead of inferring from workflow runs.

---

## L0-3 — attachments: finish the whole path in one run

Steps 3–5 of the earlier directive, plus the two blockers below. **Do not split this across review cycles.**

**The SR-9 migration is unblocked and it is yours to commit.** I confirmed the shape on production and then hit a hard stop: I'm not permitted to type schema DDL into the SQL editor through browser automation. So commit it as a versioned migration in `supabase/migrations/` — which is better anyway, since out-of-band DDL wouldn't be in the history.

I verified both policies on `artifacts`:

```
project_access           PERMISSIVE   *   using: is_project_member(project_id)
artifacts_app_isolation  RESTRICTIVE  *   using: (app_id IS NULL) OR is_app_member(app_id)
```

`artifacts` currently has **9 columns** — none of the attachment fields exist.

**Design decision, and I'd hold to it:** add the owner arm as a **separate PERMISSIVE policy**, do not modify `project_access`. Permissive policies OR together, so a new one widens access without touching a working rule — reversible, and it can't break project-scoped artifacts.

```sql
alter table public.artifacts
  add column if not exists conversation_id uuid references public.conversations(id) on delete cascade,
  add column if not exists message_id uuid references public.messages(id) on delete set null,
  add column if not exists owner_id uuid references public.profiles(id) on delete cascade,
  add column if not exists filename text,
  add column if not exists hash text,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

alter table public.artifacts alter column project_id drop not null;

create policy artifacts_owner_access on public.artifacts
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create index if not exists artifacts_conversation_idx on public.artifacts(conversation_id, created_at desc);
create index if not exists artifacts_owner_idx on public.artifacts(owner_id, created_at desc);
```

**The storage bucket** — neither of us can create it (you have no project access; I'm blocked from the dashboard action). Your route already reports `Bucket not found` verbatim with the remedy, which is the right behaviour. **Include the bucket creation in the migration** (`storage.buckets` insert, `public = false`) so it ships with the schema instead of needing a human in a dashboard.

`hash`: **populate SHA-256, no unique constraint.** Integrity now; whether a repeat send reuses the row is a UX decision that shouldn't be frozen into the schema yet.

Then: composer wiring (`accept` list + `capture` for camera — the input exists with `accept=""`), preview, caption, vision routing, and `attachmentNote` mirroring `recallNote`. **Verify the Workers AI vision model id against Cloudflare's live catalogue** before wiring — you were right to flag that, given `llama-3.1-8b-instruct` was retired mid-project.

---

## NOT in this sprint

Nodes / `devices.os` — the owner explicitly removed it from the critical path; KEEPITIL doesn't need a physical node to reach the cloud brain. Visual batches 3–4, Knowledge Studio, artifact UI, commerce automation, extra providers, settings surfaces, source reconciliation.

Completion notifications and attempt-counter exposure: **only if genuinely quick and isolated.** Don't let them delay app connection.

---

## Already passing — don't rebuild

- **Durable cross-conversation memory** — HALCYON verified in production, `recallNote` observable
- **No fabrication on no-match** — verified with two never-stored facts
- **Cross-app isolation** — KEEPITIL-scoped memory invisible to Thrive and to unscoped search
- **General Project Autonomy** — passed end to end, zero owner approvals
- **Real inference under Zero Cost** — `cloudflare-workers-ai`, `costUsd: 0`

---

## The standing rule this sprint should encode

**BROKEN ≠ EMPTY.** The memory bug wasn't the wrong column — it was that a dead query and "nothing matched" produced identical output, so nobody could tell them apart for weeks. `recallNote` fixed it. Every foundation path you touch here needs the same three-state honesty: **success / empty / actual failure**. That applies to attachments (`attachmentNote`), provider health, and agent resolution.
