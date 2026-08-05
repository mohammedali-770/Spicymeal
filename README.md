# Spicy Meal WhatsApp AI Inbox

Standalone shared WhatsApp customer-service inbox for Spicy Meal. This repository is intentionally isolated from the `SMA` ordering application.

## Readiness status

The MVP code includes the complete operational path but is not silently deployed:

- Supabase email/password authentication and role-aware accounts
- Admin team invitations and routing-team assignment
- Shared inbox, queue, assignment, resolution and return-to-AI actions
- Arabic and English conversations
- Meta webhook HMAC verification and duplicate-message protection
- Sent, delivered, read and failed receipt tracking
- AI replies from active approved knowledge articles only
- Deterministic human handover before AI for payments, refunds, complaints, food safety and explicit human requests
- Confidence-based handover and fail-closed AI/provider behavior
- Least-loaded online-agent routing, with queue fallback
- 24-hour service-window enforcement for free-form human replies
- Tenant isolation, RLS, service-only RPCs and audit logging
- Safe demo mode with no credentials or external traffic
- Unit tests, pgTAP schema checks and GitHub CI

## Safe local demo

```bash
cp .env.example .env
npm install
npm run dev
```

`VITE_DEMO_MODE=true` is the default. Demo actions remain in browser memory and never call Meta, Supabase or OpenAI.

## Verification

```bash
npm run check
```

This runs frontend type checking, routing tests and a production Vite build. CI also performs `deno check` on every Edge Function.

## Live deployment

Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The repository does not apply migrations, deploy functions, configure secrets or enable live WhatsApp traffic automatically.

## Current MVP boundary

- Text messages and interactive/button reply text are supported.
- Unsupported media is routed to a human; secure media download/preview is deferred.
- Free-form replies outside the customer-service window are blocked; an approved-template composer is deferred.
- AI knowledge retrieval uses active approved articles for the organization; semantic/vector retrieval can be added after real content volume justifies it.
- Lazywait order lookup is deferred until an identity-verification policy and API scope are approved.
