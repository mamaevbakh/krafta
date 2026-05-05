-- Ensure payment_intents status constraint matches Stage 1 lifecycle states.
-- This migration is intentionally idempotent and replaces any pre-existing constraint
-- that may have been left from older schema versions.

alter table payments.payment_intents
  drop constraint if exists payment_intents_status_check;

-- Normalize unexpected legacy statuses before re-adding strict check.
update payments.payment_intents
set status = 'requires_payment_method'
where status is null
   or status not in (
     'requires_payment_method',
     'requires_action',
     'processing',
     'succeeded',
     'failed',
     'canceled'
   );

alter table payments.payment_intents
  add constraint payment_intents_status_check
  check (
    status in (
      'requires_payment_method',
      'requires_action',
      'processing',
      'succeeded',
      'failed',
      'canceled'
    )
  );
