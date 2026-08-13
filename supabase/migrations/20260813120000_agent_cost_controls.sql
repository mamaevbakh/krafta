-- Krafta AI — spend caps and rate limiting for the tenant agent.
--
-- WHY THIS EXISTS
--
-- Every conversation on ai.krafta.uz spends Krafta's money at OpenAI, and no
-- merchant pays us yet. Without a server-side ceiling, one merchant leaving a
-- loop running overnight — or one leaked session cookie — is an invoice with
-- no upper bound. The product rule this encodes: a business that runs past its
-- allowance gets told "not right now", never a silent bill.
--
-- WHERE ENFORCEMENT CAN LIVE (this constrains the whole design)
--
-- eve hooks are observe-only. Its own guide is explicit: "Handlers are
-- observe-only", and a hook that throws surfaces as `turn.failed` AFTER the
-- event is durably recorded — i.e. after the model has already been paid for.
-- So a hook cannot refuse a turn, and there is exactly one place that can: the
-- channel's auth function, which runs at the HTTP boundary before eve starts a
-- turn. That is why `quota_check` below returns a verdict a request handler can
-- act on, rather than being a trigger on an insert.
--
-- CHECK AT THE DOOR, COUNT AT THE TILL
--
-- The daily and monthly caps are CHECKED on every HTTP request but CONSUMED
-- only by the usage hook when a model step actually completes. The two must not
-- be the same counter: one conversation is many HTTP requests (session create,
-- each message, every stream reconnect after a dropped connection), and
-- charging quota per request would exhaust a merchant's day on a flaky train
-- connection without a single extra token being spent.
--
-- The cost of that split is a bounded overshoot: requests already in flight when
-- the cap is crossed still finish. Bounded by concurrency, which is the right
-- trade — the alternative is holding a lock across a model call.
--
-- Per-minute rate limiting is the opposite: it IS about requests, so it is
-- consumed at the door, in the same round trip as the check.
--
-- DAYS AND MONTHS ARE TASHKENT'S, NOT UTC'S
--
-- A daily allowance that resets at 05:00 local time is a support ticket. Every
-- period boundary here is Asia/Tashkent.

set local lock_timeout = '3s';

-- ------------------------------------------------------------- defaults ---

-- One row. Deliberately a table rather than environment variables: raising a
-- cap during a demo, or dropping it after a scare, must not require a
-- redeploy of the agent runtime.
create table if not exists agent.budget_defaults (
  id boolean primary key default true constraint budget_defaults_singleton check (id),

  -- A generous day for a real business, and nowhere near enough to be
  -- frightening if someone scripts it: 500 turns at gpt-5-mini prices is
  -- small change. The point of the cap is the shape of the failure, not the
  -- number.
  daily_turn_cap integer not null default 500 check (daily_turn_cap >= 0),
  monthly_cost_cap_micros bigint not null default 20000000 check (monthly_cost_cap_micros >= 0), -- $20
  per_minute_request_cap integer not null default 60 check (per_minute_request_cap >= 0),

  -- Prices are data, not code. They change on the provider's schedule, and a
  -- wrong price here understates spend rather than failing loudly, so it must
  -- be trivial to correct. Micro-dollars per MILLION tokens: gpt-5-mini at
  -- $0.25 in / $2.00 out.
  input_price_micros_per_mtok bigint not null default 250000 check (input_price_micros_per_mtok >= 0),
  output_price_micros_per_mtok bigint not null default 2000000 check (output_price_micros_per_mtok >= 0),

  alert_threshold_pct smallint not null default 80
    check (alert_threshold_pct between 1 and 100),

  updated_at timestamptz not null default now()
);

insert into agent.budget_defaults (id) values (true) on conflict (id) do nothing;

comment on table agent.budget_defaults is
  'Platform-wide spend limits and model prices. Exactly one row. A table and '
  'not env vars so a cap can be changed without redeploying the agent runtime.';

-- ---------------------------------------------------------- per-org caps ---

-- Sparse by design: a business with no row here gets the defaults. Only
-- exceptions are stored, so "what is everyone's limit" has one answer.
create table if not exists agent.org_budgets (
  org_id uuid primary key references public.organizations (id) on delete cascade,

  daily_turn_cap integer check (daily_turn_cap >= 0),
  monthly_cost_cap_micros bigint check (monthly_cost_cap_micros >= 0),
  per_minute_request_cap integer check (per_minute_request_cap >= 0),
  alert_threshold_pct smallint check (alert_threshold_pct between 1 and 100),

  -- Set when we have deliberately let a business off the leash (a paid
  -- customer, a demo). Separate from a very large cap so it is visible in a
  -- listing rather than hidden in a number.
  unlimited boolean not null default false,

  -- Why this org is an exception. Future-us will ask.
  note text,

  updated_at timestamptz not null default now()
);

comment on table agent.org_budgets is
  'Per-business overrides of agent.budget_defaults. Sparse: no row means the '
  'defaults apply. `unlimited` is an explicit escape hatch, not a big number.';

-- ------------------------------------------------------------ usage ledger ---

create table if not exists agent.usage_daily (
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Asia/Tashkent calendar day. See the header.
  day date not null,

  turns integer not null default 0 check (turns >= 0),
  sessions integer not null default 0 check (sessions >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),

  -- Priced at the moment the tokens were spent, using the prices then in
  -- force. Re-deriving cost later from a changed price list would silently
  -- restate history.
  cost_micros bigint not null default 0 check (cost_micros >= 0),

  updated_at timestamptz not null default now(),

  primary key (org_id, day)
);

comment on table agent.usage_daily is
  'What each business actually spent per Tashkent day. Written only by '
  'agent.record_turn_usage from the runtime usage hook.';

-- The monthly cap sums a month of these rows on every request, so the range
-- scan per org must not touch the whole table.
create index if not exists usage_daily_org_day_idx
  on agent.usage_daily (org_id, day desc);

-- ------------------------------------------------------- rate limiting ---

-- Fixed 60-second buckets rather than a sliding window. A sliding window needs
-- either a row per request or a redis-shaped store; a bucket needs one upsert
-- and is accurate enough to stop a runaway, which is the entire job. Worst
-- case a caller gets 2x the cap across a bucket boundary.
create table if not exists agent.rate_buckets (
  -- 'org:<uuid>' or 'ip:<address>'. Text so a future key kind (an API key, a
  -- Telegram chat) needs no migration.
  bucket_key text not null,
  bucket_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket_key, bucket_start)
);

comment on table agent.rate_buckets is
  'Fixed 60s request counters for agent routes. Rows are disposable — anything '
  'older than a few minutes is garbage and is swept by agent.quota_check.';

create index if not exists rate_buckets_start_idx
  on agent.rate_buckets (bucket_start);

-- ------------------------------------------------------------- alerting ---

create table if not exists agent.budget_alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- First day of the Tashkent month this alert belongs to.
  period_month date not null,
  -- 'threshold' when they crossed the warning line, 'exhausted' when refused.
  kind text not null check (kind in ('threshold', 'exhausted')),
  threshold_pct smallint,
  cost_micros bigint not null,
  cap_micros bigint not null,
  raised_at timestamptz not null default now(),
  -- Set once someone has actually seen it. Null means it still needs a human.
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users (id) on delete set null
);

-- One alert of each kind per business per month. Without this, an org sitting
-- at 81% raises an alert on every single turn and the signal is worthless.
create unique index if not exists budget_alerts_once_idx
  on agent.budget_alerts (org_id, period_month, kind);

comment on table agent.budget_alerts is
  'Raised once per business per month per kind when spend crosses the warning '
  'threshold or the cap. Unacknowledged rows are what the console surfaces.';

-- ------------------------------------------------------------- helpers ---

create or replace function agent.tashkent_day(p_at timestamptz default now())
returns date
language sql
immutable
set search_path to ''
as $$
  select (p_at at time zone 'Asia/Tashkent')::date;
$$;

comment on function agent.tashkent_day is
  'The calendar day a moment falls on for a merchant in Uzbekistan. Daily '
  'allowances reset at local midnight, not 05:00.';

-- The limits actually in force for one business: defaults, overridden by any
-- org row, with `unlimited` collapsing the caps to null.
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
    case when coalesce(o.unlimited, false) then null
         else coalesce(o.daily_turn_cap, d.daily_turn_cap) end,
    case when coalesce(o.unlimited, false) then null
         else coalesce(o.monthly_cost_cap_micros, d.monthly_cost_cap_micros) end,
    case when coalesce(o.unlimited, false) then null
         else coalesce(o.per_minute_request_cap, d.per_minute_request_cap) end,
    coalesce(o.alert_threshold_pct, d.alert_threshold_pct),
    coalesce(o.unlimited, false)
  from agent.budget_defaults d
  left join agent.org_budgets o on o.org_id = p_org_id
  where d.id;
$$;

-- --------------------------------------------------------- the door check ---

-- Called on EVERY agent HTTP request, before eve starts a turn.
--
-- Consumes the per-minute rate buckets (that is what they are for) and reads
-- the daily/monthly ledgers without touching them. Returns a verdict the
-- caller turns into a 401, plus the numbers the console needs to explain the
-- refusal in the merchant's own language.
create or replace function agent.quota_check(
  p_org_id uuid,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_budget record;
  v_bucket timestamptz := date_trunc('minute', now());
  v_org_count integer;
  v_ip_count integer;
  v_turns integer;
  v_cost bigint;
  v_month_start date;
begin
  select * into v_budget from agent.effective_budget(p_org_id);
  if not found then
    -- No defaults row at all. Refusing is correct: this function is the only
    -- thing standing between a loop and the invoice, and a missing
    -- configuration must not read as "no limits".
    return jsonb_build_object('allowed', false, 'reason', 'budget_unconfigured');
  end if;

  -- Sweep before counting. Cheap, bounded, and it keeps this table from
  -- growing forever without needing a cron job that someone has to remember
  -- to create on a new environment.
  delete from agent.rate_buckets where bucket_start < now() - interval '10 minutes';

  -- Rate limit: consume for the business, and for the source address when we
  -- have one. The IP counter is the one that survives a stolen cookie being
  -- shared around; the org counter is the one that catches a merchant's own
  -- runaway script.
  if v_budget.per_minute_request_cap is not null then
    insert into agent.rate_buckets (bucket_key, bucket_start, count)
    values ('org:' || p_org_id::text, v_bucket, 1)
    on conflict (bucket_key, bucket_start)
      do update set count = agent.rate_buckets.count + 1
    returning count into v_org_count;

    if v_org_count > v_budget.per_minute_request_cap then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'rate_limited',
        'scope', 'org',
        'retry_after_seconds',
          greatest(1, ceil(extract(epoch from (v_bucket + interval '1 minute' - now())))::int)
      );
    end if;

    if p_ip is not null and p_ip <> '' then
      insert into agent.rate_buckets (bucket_key, bucket_start, count)
      values ('ip:' || p_ip, v_bucket, 1)
      on conflict (bucket_key, bucket_start)
        do update set count = agent.rate_buckets.count + 1
      returning count into v_ip_count;

      -- Deliberately looser than the org cap. A whole office behind one NAT
      -- address is a normal Tashkent business, and locking out the shop
      -- because four staff are testing at once would be our bug, not theirs.
      if v_ip_count > v_budget.per_minute_request_cap * 3 then
        return jsonb_build_object(
          'allowed', false,
          'reason', 'rate_limited',
          'scope', 'ip',
          'retry_after_seconds',
            greatest(1, ceil(extract(epoch from (v_bucket + interval '1 minute' - now())))::int)
        );
      end if;
    end if;
  end if;

  -- Daily turns. Read-only here; the usage hook is what increments it.
  if v_budget.daily_turn_cap is not null then
    select coalesce(turns, 0) into v_turns
    from agent.usage_daily
    where org_id = p_org_id and day = agent.tashkent_day();

    if coalesce(v_turns, 0) >= v_budget.daily_turn_cap then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'daily_turns_exhausted',
        'used', coalesce(v_turns, 0),
        'cap', v_budget.daily_turn_cap
      );
    end if;
  end if;

  -- Monthly spend.
  if v_budget.monthly_cost_cap_micros is not null then
    v_month_start := date_trunc('month', agent.tashkent_day())::date;

    select coalesce(sum(cost_micros), 0) into v_cost
    from agent.usage_daily
    where org_id = p_org_id and day >= v_month_start;

    if v_cost >= v_budget.monthly_cost_cap_micros then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'monthly_budget_exhausted',
        'used_micros', v_cost,
        'cap_micros', v_budget.monthly_cost_cap_micros
      );
    end if;
  end if;

  return jsonb_build_object('allowed', true);
end;
$$;

comment on function agent.quota_check is
  'The only place a spend can be refused: eve hooks are observe-only, so this '
  'runs in the channel auth function at the HTTP boundary. Consumes per-minute '
  'rate buckets; reads daily and monthly ledgers without consuming them.';

-- ------------------------------------------------------------ the till ---

-- Called from the runtime usage hook when a model step completes. This is
-- where a turn is actually charged.
create or replace function agent.record_turn_usage(
  p_org_id uuid,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_turns integer default 1,
  p_sessions integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_prices record;
  v_cost bigint;
  v_day date := agent.tashkent_day();
  v_month_start date := date_trunc('month', agent.tashkent_day())::date;
  v_budget record;
  v_month_cost bigint;
begin
  select input_price_micros_per_mtok, output_price_micros_per_mtok
    into v_prices
  from agent.budget_defaults where id;

  -- Priced now, at today's prices, and stored. See usage_daily.cost_micros.
  v_cost :=
    (coalesce(p_input_tokens, 0) * coalesce(v_prices.input_price_micros_per_mtok, 0)) / 1000000
    + (coalesce(p_output_tokens, 0) * coalesce(v_prices.output_price_micros_per_mtok, 0)) / 1000000;

  insert into agent.usage_daily as u (
    org_id, day, turns, sessions, input_tokens, output_tokens, cost_micros
  )
  values (
    p_org_id, v_day, greatest(coalesce(p_turns, 0), 0), greatest(coalesce(p_sessions, 0), 0),
    greatest(coalesce(p_input_tokens, 0), 0), greatest(coalesce(p_output_tokens, 0), 0), v_cost
  )
  on conflict (org_id, day) do update set
    turns = u.turns + greatest(coalesce(p_turns, 0), 0),
    sessions = u.sessions + greatest(coalesce(p_sessions, 0), 0),
    input_tokens = u.input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
    output_tokens = u.output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
    cost_micros = u.cost_micros + v_cost,
    updated_at = now();

  -- Raise the warning while there is still room to act on it. The unique index
  -- makes this once per business per month per kind.
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
  'Charges a completed model step to a business and prices it at today''s '
  'prices. Called from the runtime usage hook, which is observe-only — it '
  'records what already happened and cannot refuse anything.';

-- ------------------------------------------------------------------ RLS ---

alter table agent.budget_defaults enable row level security;
alter table agent.org_budgets enable row level security;
alter table agent.usage_daily enable row level security;
alter table agent.rate_buckets enable row level security;
alter table agent.budget_alerts enable row level security;

-- A merchant may see what they have spent and what their limit is. They may
-- not change either — a self-service spend cap is not a spend cap.
drop policy if exists usage_daily_select on agent.usage_daily;
create policy usage_daily_select on agent.usage_daily for select to authenticated
  using (public.is_org_role(org_id));

drop policy if exists org_budgets_select on agent.org_budgets;
create policy org_budgets_select on agent.org_budgets for select to authenticated
  using (public.is_org_role(org_id));

drop policy if exists budget_alerts_select on agent.budget_alerts;
create policy budget_alerts_select on agent.budget_alerts for select to authenticated
  using (public.is_org_role(org_id));

-- Acknowledging an alert is the one write a merchant gets: it changes nothing
-- about the money, only whether the banner is still shouting.
drop policy if exists budget_alerts_ack on agent.budget_alerts;
create policy budget_alerts_ack on agent.budget_alerts for update to authenticated
  using (public.is_org_role(org_id, array['owner', 'admin']))
  with check (public.is_org_role(org_id, array['owner', 'admin']));

-- budget_defaults and rate_buckets get NO authenticated policy. RLS is on and
-- no policy exists, so they are invisible to merchants entirely. Defaults are
-- platform configuration; rate buckets are plumbing that would leak other
-- businesses' request volumes.

grant select on agent.usage_daily, agent.org_budgets, agent.budget_alerts to authenticated;
grant update (acknowledged_at, acknowledged_by) on agent.budget_alerts to authenticated;

grant all on agent.budget_defaults, agent.org_budgets, agent.usage_daily,
  agent.rate_buckets, agent.budget_alerts to service_role;

revoke all on function agent.quota_check(uuid, text) from public;
revoke all on function agent.record_turn_usage(uuid, bigint, bigint, integer, integer) from public;
revoke all on function agent.effective_budget(uuid) from public;

grant execute on function agent.quota_check(uuid, text) to service_role;
grant execute on function agent.record_turn_usage(uuid, bigint, bigint, integer, integer) to service_role;
grant execute on function agent.effective_budget(uuid) to service_role, authenticated;
grant execute on function agent.tashkent_day(timestamptz) to service_role, authenticated;
