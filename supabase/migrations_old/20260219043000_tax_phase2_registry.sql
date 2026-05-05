-- Phase 2: canonical tax schema + registry + org/profile + plan classification.

create schema if not exists payments;

create table if not exists payments.tax_schemas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country_iso2 text not null,
  version text not null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payments.tax_code_registries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  schema_id uuid not null references payments.tax_schemas(id) on delete restrict,
  name text not null,
  source text null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, schema_id, name)
);

create table if not exists payments.tax_code_entries (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references payments.tax_code_registries(id) on delete cascade,
  tax_code text not null,
  package_code text not null,
  title text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registry_id, tax_code, package_code)
);

create table if not exists payments.org_tax_profiles (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  country_iso2 text not null,
  schema_id uuid not null references payments.tax_schemas(id) on delete restrict,
  tax_identity_type text not null
    check (tax_identity_type in ('TIN','PINFL','VAT_ID','OTHER')),
  tax_identity_value text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payments.plan_tax_classifications (
  plan_id uuid primary key references payments.plans(id) on delete cascade,
  schema_id uuid not null references payments.tax_schemas(id) on delete restrict,
  tax_code_entry_id uuid null references payments.tax_code_entries(id) on delete set null,
  tax_code text not null,
  package_code text null,
  vat_percent numeric(5,2) null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tax_code_registries_org_idx
  on payments.tax_code_registries(org_id);
create index if not exists tax_code_entries_registry_idx
  on payments.tax_code_entries(registry_id);
create index if not exists tax_code_entries_tax_code_idx
  on payments.tax_code_entries(tax_code);
create index if not exists plan_tax_classifications_schema_idx
  on payments.plan_tax_classifications(schema_id);
create index if not exists plan_tax_classifications_entry_idx
  on payments.plan_tax_classifications(tax_code_entry_id);

insert into payments.tax_schemas (
  code,
  name,
  country_iso2,
  version,
  is_active,
  metadata
)
values (
  'UZ_AUTOFISCAL_V1',
  'Uzbekistan Autofiscalization',
  'UZ',
  'v1',
  true,
  jsonb_build_object(
    'required_fields',
    jsonb_build_array('tax_code', 'package_code', 'tax_identity'),
    'tax_identity_types',
    jsonb_build_array('TIN', 'PINFL')
  )
)
on conflict (code) do update
set
  name = excluded.name,
  country_iso2 = excluded.country_iso2,
  version = excluded.version,
  is_active = excluded.is_active,
  metadata = excluded.metadata,
  updated_at = now();

alter table payments.tax_schemas enable row level security;
alter table payments.tax_code_registries enable row level security;
alter table payments.tax_code_entries enable row level security;
alter table payments.org_tax_profiles enable row level security;
alter table payments.plan_tax_classifications enable row level security;

do $$
begin
  create policy tax_schemas_read_all
    on payments.tax_schemas
    for select
    using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy tax_code_registries_org_isolation
    on payments.tax_code_registries
    for all
    using (
      exists (
        select 1
        from public.organization_members m
        where m.org_id = tax_code_registries.org_id
          and m.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.organization_members m
        where m.org_id = tax_code_registries.org_id
          and m.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy tax_code_entries_org_isolation
    on payments.tax_code_entries
    for all
    using (
      exists (
        select 1
        from payments.tax_code_registries r
        join public.organization_members m on m.org_id = r.org_id
        where r.id = tax_code_entries.registry_id
          and m.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from payments.tax_code_registries r
        join public.organization_members m on m.org_id = r.org_id
        where r.id = tax_code_entries.registry_id
          and m.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy org_tax_profiles_org_isolation
    on payments.org_tax_profiles
    for all
    using (
      exists (
        select 1
        from public.organization_members m
        where m.org_id = org_tax_profiles.org_id
          and m.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.organization_members m
        where m.org_id = org_tax_profiles.org_id
          and m.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy plan_tax_classifications_org_isolation
    on payments.plan_tax_classifications
    for all
    using (
      exists (
        select 1
        from payments.plans p
        join public.organization_members m on m.org_id = p.org_id
        where p.id = plan_tax_classifications.plan_id
          and m.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from payments.plans p
        join public.organization_members m on m.org_id = p.org_id
        where p.id = plan_tax_classifications.plan_id
          and m.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;
