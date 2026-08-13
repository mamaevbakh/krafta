-- Krafta AI — closing four holes in the cost-control migration.
--
-- Found by an adversarial audit of 20260813120000 after its happy paths were
-- already proven working on the dev branch. Every one of these is a case the
-- behavioural test could not have caught, because each is about what someone
-- ELSE can do, not about whether the caps count correctly.

set local lock_timeout = '3s';

-- ----------------------------------------------------- 1. budget snooping ---
--
-- `agent.effective_budget` is SECURITY DEFINER, takes an org id, and checks no
-- membership. It was granted to `authenticated`, the `agent` schema is exposed
-- to PostgREST, and a definer function owned by the table owner is exempt from
-- the table's own RLS. So any signed-in merchant could POST another business's
-- uuid to /rest/v1/rpc/effective_budget and read their limits — including
-- whether that business is flagged `unlimited`, which is a reliable tell for
-- "this one is a paying customer".
--
-- Org ids are not secret; they travel in route params. Treating them as a
-- capability was the mistake.
--
-- Two fixes, because either alone would be enough and both together mean a
-- future `grant` cannot silently reopen it:
--   a. the console reads this with the service key, so `authenticated` never
--      needed EXECUTE at all;
--   b. the function checks membership itself and returns nothing otherwise.

revoke execute on function agent.effective_budget(uuid) from authenticated;

create or replace function agent.effective_budget(p_org_id uuid)
returns table (
  daily_turn_cap integer,
  monthly_cost_cap_micros bigint,
  per_minute_request_cap integer,
  alert_threshold_pct smallint,
  unlimited boolean
)
language sql
stable
security definer
set search_path to ''
as $$
  select
    -- `unlimited` lifts the SPEND caps only. The per-minute rate limit is not
    -- a spend cap, it is abuse protection: it is what stands between a leaked
    -- session cookie and someone opening hundreds of requests a second against
    -- this business's agent. Switching it off as a side effect of "let this
    -- customer off the leash" would make the org we trust most the one easiest
    -- to weaponise, and the `note` column exists precisely because these flags
    -- get set for a demo and then forgotten.
    case when coalesce(o.unlimited, false) then null
         else coalesce(o.daily_turn_cap, d.daily_turn_cap) end,
    case when coalesce(o.unlimited, false) then null
         else coalesce(o.monthly_cost_cap_micros, d.monthly_cost_cap_micros) end,
    coalesce(o.per_minute_request_cap, d.per_minute_request_cap),
    coalesce(o.alert_threshold_pct, d.alert_threshold_pct),
    coalesce(o.unlimited, false)
  from agent.budget_defaults d
  left join agent.org_budgets o on o.org_id = p_org_id
  where d.id
    -- Defence in depth. The only intended caller holds the service key and has
    -- already resolved the organisation; this makes the function safe even if
    -- EXECUTE is granted more widely again by a later migration.
    and (
      (select auth.role()) = 'service_role'
      or public.is_org_role(p_org_id)
    );
$$;

comment on function agent.effective_budget is
  'Limits in force for one business. Membership-checked: an org id is a route '
  'parameter, not a capability. `unlimited` lifts spend caps but never the '
  'per-minute rate limit, which is abuse protection.';

-- ----------------------------------------- 2. erasing the spend ledger ---
--
-- The previous migration ended with `grant all`, which on a table means
-- SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER. That
-- handed service_role the ability to `truncate agent.usage_daily` — one
-- statement that zeroes every business's month-to-date spend and silently
-- resets every monthly cap.
--
-- The agent schema migration was already explicit about this class of risk: it
-- revokes DELETE on conversations and messages so a mis-scoped cleanup job
-- cannot turn a merchant's dispute into Krafta's word against theirs. The
-- priced ledger is the same kind of evidence and is worse to lose, because it
-- cannot be rebuilt — token counts survive elsewhere, but the price they were
-- charged at does not.
--
-- rate_buckets is the exception: the sweep genuinely deletes, and the rows are
-- disposable by design.

revoke all on agent.budget_defaults, agent.org_budgets, agent.usage_daily,
  agent.rate_buckets, agent.budget_alerts from service_role;

grant select, insert, update on agent.budget_defaults, agent.org_budgets,
  agent.usage_daily, agent.rate_buckets, agent.budget_alerts to service_role;

grant delete on agent.rate_buckets to service_role;

-- -------------------------------------- 3. forging who saw the warning ---
--
-- `acknowledged_at` and `acknowledged_by` were directly writable by any org
-- admin through PostgREST, and the policy checked only that the writer was an
-- admin of the org. The two columns whose entire purpose is to answer "who
-- silenced the budget warning, and when" could be set to any user and any
-- date — including the owner's id and a week ago.
--
-- The columns are no longer writable by hand at all. A trigger stamps them, so
-- the answer is whatever actually happened.

create or replace function agent.stamp_alert_acknowledgement()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Acknowledging is the only field an admin may change, and they may only
  -- ever set it to themselves, now. Un-acknowledging is allowed — a warning
  -- dismissed by accident should be recoverable — and clears both columns
  -- together so the pair is never half-written.
  if new.acknowledged_at is null then
    new.acknowledged_by := null;
  else
    new.acknowledged_at := now();
    new.acknowledged_by := coalesce((select auth.uid()), old.acknowledged_by);
  end if;

  -- Everything else about an alert is a record of what the ledger said at the
  -- moment it was raised. Frozen: an alert whose numbers can be edited is not
  -- evidence of anything.
  new.id := old.id;
  new.org_id := old.org_id;
  new.period_month := old.period_month;
  new.kind := old.kind;
  new.threshold_pct := old.threshold_pct;
  new.cost_micros := old.cost_micros;
  new.cap_micros := old.cap_micros;
  new.raised_at := old.raised_at;

  return new;
end;
$$;

drop trigger if exists stamp_alert_acknowledgement on agent.budget_alerts;
create trigger stamp_alert_acknowledgement
  before update on agent.budget_alerts
  for each row execute function agent.stamp_alert_acknowledgement();

comment on function agent.stamp_alert_acknowledgement is
  'Stamps who acknowledged a budget alert and when, from the session rather '
  'than from the request body, and freezes the raised figures.';

-- --------------------------------------------- 4. cached input pricing ---
--
-- The runtime reports `inputTokens` with `cacheReadTokens` as a BREAKDOWN of
-- it, not an addition to it (confirmed in eve's own accumulator, which keeps
-- them as parallel counters). OpenAI bills cached input at roughly a tenth of
-- the uncached rate.
--
-- Pricing every input token at the full rate therefore overstates spend on
-- exactly the workload this product is: a knowledge agent re-sending the same
-- persona and the same retrieved chunks on every step, where cached input
-- dominates. Overstating is not the safe direction it sounds like — it stops a
-- merchant's agent answering customers while the real bill is a fraction of
-- the cap they were told they hit.

alter table agent.budget_defaults
  add column if not exists cached_input_price_micros_per_mtok bigint not null default 25000
    check (cached_input_price_micros_per_mtok >= 0);

comment on column agent.budget_defaults.cached_input_price_micros_per_mtok is
  'Micro-dollars per million CACHED input tokens. gpt-5-mini bills these at '
  'about a tenth of uncached input.';

alter table agent.usage_daily
  add column if not exists cached_input_tokens bigint not null default 0
    check (cached_input_tokens >= 0);

-- `p_input_tokens` stays TOTAL input, exactly as the provider reports it, and
-- the uncached remainder is derived here. The alternative — asking the hook to
-- subtract — puts arithmetic that can go negative in the one place that must
-- never throw, and makes the meaning of the parameter depend on which caller
-- you are reading.
--
-- The old five-argument version is DROPPED rather than kept as an overload.
-- Keeping both would make every existing five-argument call ambiguous, which
-- Postgres refuses outright. Nothing breaks in the window between this
-- migration and the new build shipping: PostgREST sends named arguments, so a
-- caller that omits `p_cached_input_tokens` resolves to this function and takes
-- the default. That is what the default is for.
drop function if exists agent.record_turn_usage(uuid, bigint, bigint, integer, integer);

create or replace function agent.record_turn_usage(
  p_org_id uuid,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_turns integer default 1,
  p_sessions integer default 0,
  p_cached_input_tokens bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_prices record;
  v_cost bigint;
  v_input bigint := greatest(coalesce(p_input_tokens, 0), 0);
  v_cached bigint;
  v_uncached bigint;
  v_output bigint := greatest(coalesce(p_output_tokens, 0), 0);
  v_day date := agent.tashkent_day();
  v_month_start date := date_trunc('month', agent.tashkent_day())::date;
  v_budget record;
  v_month_cost bigint;
begin
  select input_price_micros_per_mtok, output_price_micros_per_mtok,
         cached_input_price_micros_per_mtok
    into v_prices
  from agent.budget_defaults where id;

  -- Clamped to the total. A provider that reports more cached than input
  -- tokens is reporting nonsense, and the failure we want from nonsense is a
  -- slightly high bill, not a negative one that credits the merchant.
  v_cached := least(greatest(coalesce(p_cached_input_tokens, 0), 0), v_input);
  v_uncached := v_input - v_cached;

  v_cost :=
      (v_uncached * coalesce(v_prices.input_price_micros_per_mtok, 0)) / 1000000
    + (v_cached * coalesce(v_prices.cached_input_price_micros_per_mtok, 0)) / 1000000
    + (v_output * coalesce(v_prices.output_price_micros_per_mtok, 0)) / 1000000;

  insert into agent.usage_daily as u (
    org_id, day, turns, sessions, input_tokens, cached_input_tokens,
    output_tokens, cost_micros
  )
  values (
    p_org_id, v_day, greatest(coalesce(p_turns, 0), 0),
    greatest(coalesce(p_sessions, 0), 0), v_input, v_cached, v_output, v_cost
  )
  on conflict (org_id, day) do update set
    turns = u.turns + greatest(coalesce(p_turns, 0), 0),
    sessions = u.sessions + greatest(coalesce(p_sessions, 0), 0),
    input_tokens = u.input_tokens + v_input,
    cached_input_tokens = u.cached_input_tokens + v_cached,
    output_tokens = u.output_tokens + v_output,
    cost_micros = u.cost_micros + v_cost,
    updated_at = now();

  select * into v_budget from agent.effective_budget(p_org_id);
  if v_budget.monthly_cost_cap_micros is not null then
    select coalesce(sum(cost_micros), 0) into v_month_cost
    from agent.usage_daily
    where org_id = p_org_id and day >= v_month_start;

    if v_month_cost >= v_budget.monthly_cost_cap_micros then
      insert into agent.budget_alerts (org_id, period_month, kind, threshold_pct, cost_micros, cap_micros)
      values (p_org_id, v_month_start, 'exhausted', 100, v_month_cost, v_budget.monthly_cost_cap_micros)
      on conflict (org_id, period_month, kind) do nothing;
    elsif v_month_cost * 100 >= v_budget.monthly_cost_cap_micros * v_budget.alert_threshold_pct then
      insert into agent.budget_alerts (org_id, period_month, kind, threshold_pct, cost_micros, cap_micros)
      values (p_org_id, v_month_start, 'threshold', v_budget.alert_threshold_pct, v_month_cost, v_budget.monthly_cost_cap_micros)
      on conflict (org_id, period_month, kind) do nothing;
    end if;
  end if;

  return jsonb_build_object('cost_micros', v_cost, 'day', v_day);
end;
$$;

comment on function agent.record_turn_usage is
  'Charges a completed model step. p_input_tokens is TOTAL input as the '
  'provider reports it; p_cached_input_tokens is the cached SUBSET of that '
  'total, priced separately. Called from the runtime usage hook, which is '
  'observe-only and cannot refuse anything.';

revoke all on function agent.record_turn_usage(uuid, bigint, bigint, integer, integer, bigint) from public;
grant execute on function agent.record_turn_usage(uuid, bigint, bigint, integer, integer, bigint) to service_role;
