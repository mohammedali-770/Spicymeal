# Deployment checklist

This repository is deployment-ready code, but it intentionally does not apply infrastructure changes automatically.

## 1. Supabase staging

1. Create a separate non-production Supabase project for the WhatsApp inbox.
2. Apply all files in `supabase/migrations/` in filename order.
3. Apply `supabase/seed.sql`.
4. Create the first Auth user in Supabase.
5. Link that user as the first administrator:

```sql
insert into public.wa_memberships(organization_id,user_id,display_name,role,is_online)
select id,'FIRST_AUTH_USER_UUID','Mohammed','admin',false
from public.wa_organizations where slug='spicy-meal';

insert into public.wa_team_members(team_id,user_id)
select id,'FIRST_AUTH_USER_UUID'
from public.wa_teams where organization_id=(select id from public.wa_organizations where slug='spicy-meal')
and routing_key='customer-care';
```

6. Insert the Meta phone-number channel only after obtaining the real IDs:

```sql
insert into public.wa_channels(organization_id,phone_number_id,display_phone_number,waba_id,graph_version)
select id,'META_PHONE_NUMBER_ID','DISPLAY_NUMBER','META_WABA_ID','vXX.0'
from public.wa_organizations where slug='spicy-meal';
```

## 2. Edge Function secrets

Set these server-side only:

```text
APP_ORIGINS=https://YOUR_INBOX_DOMAIN
WHATSAPP_VERIFY_TOKEN=<random verification token>
WHATSAPP_APP_SECRET=<Meta app secret>
WHATSAPP_ACCESS_TOKEN=<Meta system-user access token>
WHATSAPP_GRAPH_VERSION=vXX.0
WHATSAPP_INTERNAL_SECRET=<separate random internal secret>
OPENAI_API_KEY=<server-side key>
OPENAI_MODEL=<approved model supporting structured output>
```

## 3. Deploy functions

Deploy:

- `whatsapp-webhook` with JWT verification disabled
- `whatsapp-orchestrator` with JWT verification disabled; it authenticates with the internal secret
- `whatsapp-send` with JWT verification enabled
- `whatsapp-team-admin` with JWT verification enabled

## 4. Web application

Set:

```text
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_FUNCTIONS_URL=https://YOUR_PROJECT.supabase.co/functions/v1
```

Build with `npm run check`, then deploy `dist/` to the chosen static host.

## 5. Meta configuration

Use the deployed `whatsapp-webhook` URL as the callback, enter the configured verify token, and subscribe the WhatsApp Business Account to message events.

## 6. Acceptance test

Do not enable AI until approved knowledge articles exist. Validate in staging:

1. Webhook verification succeeds.
2. An inbound text creates exactly one message and one conversation.
3. Replaying the same webhook creates no duplicate and no duplicate AI reply.
4. Routine knowledge questions receive a grounded AI reply.
5. Payment, refund, complaint, food-safety and human requests hand off.
6. Least-loaded online team assignment works; otherwise the chat remains queued.
7. Viewer accounts cannot send or mutate.
8. Agents cannot take another agent's assigned chat.
9. Replies outside the 24-hour window fail closed and request a template flow.
10. Sent, delivered, read and failed receipts update the outbound message.
11. An AI/provider failure hands the conversation to a human.
12. Team invitations create a restricted account and team membership.

## Production gate

Production requires a separate explicit approval for the migration, Edge Function deployment, secrets, Meta subscription and live traffic. No production action is performed by the repository or its CI workflow.
