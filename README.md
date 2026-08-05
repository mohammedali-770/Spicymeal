# Spicy Meal WhatsApp AI Inbox

A standalone shared WhatsApp customer-service inbox for Spicy Meal. This repository is intentionally isolated from the SMA ordering application.

## MVP features

- Shared inbox with queue, human, AI and urgent filters
- Arabic and English conversations
- Agent assignment, takeover, resolution and return-to-AI actions
- Demo mode with no credentials or external traffic
- Supabase Auth, RLS and tenant-ready organization boundaries
- Meta webhook signature verification and idempotent message ingestion
- Authenticated human replies through WhatsApp Cloud API
- Mandatory human handover boundary for payments, refunds, complaints, food safety and explicit human requests

## Local demo

```bash
cp .env.example .env
npm install
npm run dev
```

`VITE_DEMO_MODE=true` is the default. The demo never sends WhatsApp messages.

## Live configuration

Web variables:

```bash
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_FUNCTIONS_URL=https://YOUR_PROJECT.supabase.co/functions/v1
```

Edge Function secrets:

```bash
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_GRAPH_VERSION=vXX.0
```

## Rollout order

1. Review and apply `supabase/migrations/20260805150000_whatsapp_inbox_mvp.sql` in a non-production Supabase project.
2. Create the organization, channel and staff memberships.
3. Deploy `whatsapp-webhook` and `whatsapp-send`.
4. Configure Meta webhook verification and subscribe the WhatsApp number to message events.
5. Add approved knowledge articles before enabling AI automation.
6. Validate inbound message, duplicate webhook, assignment, human reply and delivery receipt flows.

No migration or deployment is performed by this repository commit.
