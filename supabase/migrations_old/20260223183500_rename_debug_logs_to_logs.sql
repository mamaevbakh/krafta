do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'payments' and table_name = 'debug_logs'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'payments' and table_name = 'logs'
  ) then
    execute 'alter table payments.debug_logs rename to logs';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'payments' and table_name = 'logs' and column_name = 'scope'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'payments' and table_name = 'logs' and column_name = 'type'
  ) then
    execute 'alter table payments.logs rename column scope to type';
  end if;
end $$;

create index if not exists logs_created_at_idx
  on payments.logs (created_at desc);

create index if not exists logs_public_token_idx
  on payments.logs (public_token);

create index if not exists logs_payment_intent_id_idx
  on payments.logs (payment_intent_id);

create index if not exists logs_payment_attempt_id_idx
  on payments.logs (payment_attempt_id);

comment on table payments.logs is
  'Production operational logs for payment orchestration and provider integrations.';

comment on column payments.logs.type is
  'Log stream type (e.g. webhook, checkout_api, uzum, callback_page).';
