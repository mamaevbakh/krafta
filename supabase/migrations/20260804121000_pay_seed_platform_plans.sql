-- Krafta Pay: the three platform-fee plans.
--
-- WHAT THESE ARE
-- --------------
-- Not merchant plans. These are the plans KRAFTA PAY charges ITS OWN MERCHANTS
-- on — our revenue, collected through our Atmos account. Every other plan row
-- in this table belongs to a merchant and is collected through THEIR acquirer.
--
--   Start   0 UZS      + 1.0%  capped at 2,500,000 UZS/mo
--   Growth  600,000    + 0.6%  uncapped
--   Scale   2,500,000  + 0.4%  uncapped
--
-- The Start cap equals Scale's monthly fee on purpose: a free-tier merchant can
-- never pay more than the top tier's base, and at the cap the upgrade argues
-- for itself (same money, lower rate, more features).
--
-- WHY THEY LIVE ON krafta-studio
-- ------------------------------
-- The platform org also bills catalog merchants for the Krafta app (10 active
-- Business subscriptions in production). A dedicated platform org would be
-- cleaner but would need its own Atmos contract — not worth it for v1. The two
-- populations are told apart by the `platform-` code prefix here plus
-- `metadata.kind = 'platform_fee'` on the subscription, and every report filters
-- on that.
--
-- CURRENCY
-- --------
-- Priced natively in UZS — the currency merchants are actually charged in.
-- There is no conversion here and no rate held anywhere in the system: a rate in
-- config is a second thing that can drift, and a platform fee that moves between
-- two months because a rate moved destroys trust in the invoice. (These figures
-- were originally derived from a USD price list at 13,000 UZS/USD; that is
-- provenance, recorded in docs/krafta-pay-platform-billing.md, not config.)
--
-- Re-pricing is a deliberate act — change the numbers below, re-run this seed,
-- and existing subscribers re-price at their next period boundary (there is no
-- proration anywhere in this repo).
--
-- MINOR UNITS
-- -----------
-- major x 100, UZS included. 600,000 UZS = 60,000,000. The `pro` plan on
-- production sits at 200000 (2,000 UZS) because someone once wrote the major
-- number into a *_minor column; these figures are pre-multiplied.

INSERT INTO payments.plans (org_id, code, name, amount_minor, currency, "interval", interval_count, trial_days, is_active, features, metadata)
SELECT
  o.id,
  v.code,
  v.name,
  v.amount_minor,
  'UZS',
  'month',
  1,
  0,
  true,
  v.features,
  v.metadata
FROM public.organizations o
CROSS JOIN (VALUES
  (
    'platform-start', 'Start', 0::bigint,
    '{"hosted_checkout": false, "coupons": false, "analytics": false}'::jsonb,
    '{"kind": "platform_fee", "usage_rate_bps": 100, "usage_cap_minor": 250000000}'::jsonb
  ),
  (
    'platform-growth', 'Growth', 60000000::bigint,
    '{"hosted_checkout": true, "coupons": true, "analytics": true}'::jsonb,
    '{"kind": "platform_fee", "usage_rate_bps": 60, "usage_cap_minor": null}'::jsonb
  ),
  (
    'platform-scale', 'Scale', 250000000::bigint,
    '{"hosted_checkout": true, "coupons": true, "analytics": true}'::jsonb,
    '{"kind": "platform_fee", "usage_rate_bps": 40, "usage_cap_minor": null}'::jsonb
  )
) AS v(code, name, amount_minor, features, metadata)
WHERE o.slug = 'krafta-studio'
ON CONFLICT (org_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  amount_minor = EXCLUDED.amount_minor,
  currency = EXCLUDED.currency,
  "interval" = EXCLUDED."interval",
  interval_count = EXCLUDED.interval_count,
  is_active = true,
  features = EXCLUDED.features,
  -- Merge, do not replace: a merchant-side fiscalization block on this row (if
  -- one is ever added) must survive a re-rate.
  metadata = (payments.plans.metadata - 'usd_per_month' - 'usd_usage_cap' - 'usd_uzs_rate') || EXCLUDED.metadata,
  updated_at = now();
