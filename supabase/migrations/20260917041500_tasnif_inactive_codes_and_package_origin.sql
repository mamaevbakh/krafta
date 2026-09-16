-- tasnif: switched-off codes, and where each package code comes from.
--
-- WHY THIS EXISTS
-- ---------------
-- Two official exports turned out to cover what the first migration planned
-- to fetch one code at a time:
--
-- 1. The deactivated-codes list (`excel/get/inactive-mxik`): 260,086 codes the
--    tax committee has switched off. None of them is in the active catalog.
--    People paste these from old invoices and supplier documents, and the
--    honest answer is "this code is switched off; here are the active codes
--    in the same category", not "not found".
-- 2. The units-and-packages export from the catalog page: every code's numeric
--    package codes, the second number a receipt needs (10202001010000002 cafe
--    coffee drinks -> 1522997 "шт. (кружка/стакан)"). It has two sheets that
--    mean different things: units fixed by the committee, and packages that
--    other businesses created ("стакан: 1 шт."). Both are valid on a receipt,
--    but a person choosing one should know which is which.
--
-- ADDITIVE AND REVERSIBLE
-- -----------------------
-- Touches schema `tasnif` only. Rollback:
-- `supabase/rollback/20260917041500_tasnif_inactive_codes_and_package_origin.down.sql`.
-- Same access model as the first tasnif migration: service role only, RLS on,
-- no grants to anon or authenticated.

-- ---------------------------------------------------------------------------
-- inactive_codes
-- ---------------------------------------------------------------------------
-- A separate table rather than status = 'inactive' rows in tasnif.codes:
-- a switched-off code's category may itself be gone from the active tree, so
-- it cannot satisfy codes' foreign key to tasnif.nodes, and keeping 260k dead
-- rows out of tasnif.codes keeps every search from having to filter them.
-- Category names are stored as text for the same reason.
create table if not exists tasnif.inactive_codes (
  ikpu text primary key
    constraint inactive_codes_ikpu_format check (ikpu ~ '^[0-9]{17}$'),
  subposition_code text generated always as (left(ikpu, 11)) stored,
  name_ru text not null,
  group_name_ru text,
  class_name_ru text,
  position_name_ru text,
  subposition_name_ru text,
  brand_name text,
  attribute_ru text,
  -- When this copy first saw the code on the official list. The list itself
  -- carries no deactivation date.
  first_listed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- "Switched off; here are active codes in the same sub-position."
create index if not exists inactive_codes_subposition_code_idx on tasnif.inactive_codes (subposition_code);

-- ---------------------------------------------------------------------------
-- packages.origin
-- ---------------------------------------------------------------------------
-- fixed: «Закрепленные единицы и упаковки» (set by the tax committee)
-- user:  «Сформированные упаковки другими пользователями» (created by businesses)
alter table tasnif.packages add column if not exists origin text;
alter table tasnif.packages drop constraint if exists packages_origin;
alter table tasnif.packages add constraint packages_origin check (origin in ('fixed', 'user'));

-- ---------------------------------------------------------------------------
-- import_packages: staging for one units-and-packages import
-- ---------------------------------------------------------------------------
-- UNLOGGED for the same reason as tasnif.import_rows: ~576k rows arrive per
-- import, almost none change, and this instance also serves live shops and
-- payments. The merge writes only rows that differ.
create unlogged table if not exists tasnif.import_packages (
  run_id bigint not null references tasnif.sync_runs (id) on delete cascade,
  ikpu text not null,
  package_code bigint not null,
  name_ru text not null,
  origin text not null,
  primary key (run_id, ikpu, package_code)
);

-- ---------------------------------------------------------------------------
-- sync_runs.source: name the new import kinds
-- ---------------------------------------------------------------------------
alter table tasnif.sync_runs drop constraint if exists sync_runs_source;
alter table tasnif.sync_runs add constraint sync_runs_source
  check (source in ('excel', 'excel_uz', 'packages_excel', 'inactive_excel', 'details_api'));

-- ---------------------------------------------------------------------------
-- Lock-down
-- ---------------------------------------------------------------------------
alter table tasnif.inactive_codes enable row level security;
alter table tasnif.import_packages enable row level security;

grant all on tasnif.inactive_codes, tasnif.import_packages to service_role;
