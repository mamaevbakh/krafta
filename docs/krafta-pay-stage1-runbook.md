# Krafta Pay Stage 1 Runbook (Uzum)

## Required Env Vars

### Shared
- `PAY_BASE_URL` (example: `https://pay.krafta.org`)
- `KRAFTA_PAY_URL` (example: `https://pay.krafta.org`)
- `KRAFTA_PAY_INTERNAL_SECRET` (shared HMAC secret between Krafta and Krafta Pay)
- `PAY_CREDENTIALS_SECRET` (encryption key for provider credentials and webhook secrets)

### Krafta Pay
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAY_ENV` (`test` or `live`)
- `PAY_ALLOW_UNSIGNED_UZUM_WEBHOOKS` (`false` in production)

### Krafta
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `KRAFTA_PAY_URL`
- `KRAFTA_PAY_INTERNAL_SECRET`

## Deploy Checklist
1. Run SQL migration: `supabase/migrations/20260218_billing_stage1_uzum.sql`.
2. Seed `payments.providers` with `uzum` as active.
3. Configure Uzum credentials per organization in Krafta Pay dashboard.
4. Configure webhook endpoint in Uzum to `POST /api/webhooks/uzum`.
5. Enable billing entrypoint in Krafta dashboard (`Billing` page and Upgrade action).
6. Configure renewal cron to call:
   - `POST /api/internal/renewals/run`
   - Signed with `x-krafta-timestamp` + `x-krafta-signature`.

## Webhook Replay (manual)
1. Locate failed event in `payments.payment_events` where `processing_error` is not null or not processed.
2. Re-send payload to `/api/webhooks/uzum` with valid signature header.
3. Confirm updates:
   - `payment_attempts.status`
   - `payment_intents.status`
   - `invoices.status`
   - `subscriptions.status`

## Dunning Policy
- Retry schedule from first failed renewal: day 3, day 7, day 14.
- After final failure: subscription moves to `past_due`.

## Operational Queries
```sql
-- recent failed webhooks
select id, provider_id, event_type, processing_error, received_at
from payments.payment_events
where processing_error is not null
order by received_at desc
limit 100;

-- subscriptions requiring action
select id, org_id, status, current_period_end
from payments.subscriptions
where status in ('past_due','incomplete','incomplete_expired')
order by updated_at desc;
```
