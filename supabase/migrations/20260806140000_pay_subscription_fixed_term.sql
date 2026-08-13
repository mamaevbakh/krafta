-- A subscription that stops on its own.
--
-- Nothing has ever stopped renewal. The engine picks up any active subscription
-- whose period has ended and charges it again, forever. Galaktika Learning
-- Center raised this before we had a single parent on the system: a language
-- course runs six or nine months, not indefinitely. Charging a parent in month
-- ten is a refund, an angry phone call, and the end of that relationship — and
-- it is the school's reputation that pays, not ours.
--
-- ends_at IS A BOUNDARY, NOT A COUNTER. The obvious alternative is "remaining
-- cycles", decremented on each successful charge. That is precisely the shape
-- that breaks in a payment path: a retried charge, a redelivered callback or a
-- crash between charging and decrementing either bills a month too many or one
-- too few, and neither is detectable afterwards. A timestamp compared on every
-- run gives the same answer no matter how many times it is evaluated.
--
-- The rule: do not charge a period that BEGINS on or after ends_at. Worked
-- through for a nine-month course billed monthly from 1 September — the initial
-- payment covers September, eight renewals carry it to 1 May, and the period
-- beginning 1 June is refused. Nine charges. So ends_at is the first period
-- start plus nine months: 1 June.
--
-- NULL means what it has always meant: run until somebody cancels. Every
-- existing subscription keeps that behaviour with no backfill.
alter table payments.subscriptions
  add column if not exists ends_at timestamptz;

-- Why it stopped, not just that it stopped.
--
-- The status check constraint permits only incomplete, incomplete_expired,
-- trialing, active, past_due, paused, unpaid and canceled. A finished course
-- would therefore read as "Отменена" — which tells the school the parent quit,
-- when the course simply ran its length. Adding a ninth status would mean a
-- constraint migration plus every status map in the dashboard, the customer
-- portal and three locales.
--
-- This is cheaper and just as honest: the status stays `canceled`, and a set
-- ended_at is what lets a surface say "Завершена" instead. One column, one
-- conditional at each of the two places that render a status.
alter table payments.subscriptions
  add column if not exists ended_at timestamptz;

comment on column payments.subscriptions.ends_at is
  'Fixed term boundary. No period beginning on or after this instant is charged. NULL = runs until cancelled.';

comment on column payments.subscriptions.ended_at is
  'Set when a subscription stopped because it reached ends_at, as opposed to being cancelled. Status is `canceled` either way; this is what distinguishes "finished" from "cancelled" for display.';
