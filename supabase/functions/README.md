# KEEPITIL ↔ NEXUS moderation — deploy handoff

Both functions are **final source**, not sketches. They could not be deployed from the agent
session: the Supabase MCP connectors reject array parameters (`ZodError: expected array,
received string`, reproduced with a one-byte payload), so `deploy_edge_function` is uncallable
on either project. Deploy with the CLI or dashboard.

## 1 — NEXUS: `moderate-media`

```bash
supabase functions deploy moderate-media --project-ref dojmswwxmdtizrtoirem
```

Keep `verify_jwt = ON`. The function *additionally* requires `role=service_role` in the token —
the anon key is a valid JWT for the project, so `verify_jwt` alone would let a browser call it.

Its table `public.moderation_requests` is **already created on NEXUS** — that migration applied.

## 2 — KEEPITIL: `moderation-run`

```bash
supabase functions deploy moderation-run --project-ref ovmqtzjfpzrbzrlkxwgw
supabase secrets set NEXUS_SERVICE_KEY=<service_role key for dojmswwxmdtizrtoirem>
```

Optional: `NEXUS_URL` to point at a staging NEXUS.
`NEXUS_SERVICE_ROLE_KEY` is accepted as an alias.

## 3 — Acceptance tests to run after deploying

| Case | How | Expected |
|---|---|---|
| PASS | credentialed classifier returns clean | entry published; `videos.review_status='approved'` |
| BLOCK | classifier returns explicit | entry private; prior publication retracted |
| RETRY | classifier unavailable | entry private; re-queued with backoff |
| timeout | unreachable media/provider | `RETRY`, never PASS |
| duplicate request | same `request_id` twice | second call returns `replayed:true`, same verdict |
| unauthorized | call with the anon key | `403 server-to-server only` |

## Why moderation still won't decide anything yet

NEXUS has **no credentialed vision model**: 5 models, none with `supports_vision`, and
`secrets_metadata` is empty. `moderate-media` therefore returns `RETRY /
classifier_unavailable`, which is correct — an un-inspected image must never be called clean.

Routing is **provider-agnostic**: the function asks the database for any enabled
`supports_vision` model on an enabled provider holding a credential, orders by provider
priority, and dispatches on `provider_type`. Adding a vendor is a row in `model_providers` plus
one `classify` implementation in the `CLASSIFIERS` table — no change to the contract, the auth,
the idempotency or the fail-closed behaviour.

`CLASSIFIERS` is deliberately empty. A stub that returned PASS would be exactly the silent
failure this design exists to prevent.

## Contract

```
REQUEST   { request_id, entry_id, media[], competition, category, metadata, policy[] }
RESPONSE  { verdict: PASS|BLOCK|RETRY, reason, categories[], confidence,
            provider, model, policy_version, decided_at, duration_ms }
```

KEEPITIL owns every mutation. `moderation_record_verdict` publishes on **PASS only**, and
retracts anything previously public on BLOCK or RETRY. NEXUS never decides winners, rewards,
payouts, votes, publication state, ticket maths or authorization.
