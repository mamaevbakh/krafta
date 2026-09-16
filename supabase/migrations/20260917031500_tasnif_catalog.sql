-- tasnif: a searchable copy of Uzbekistan's national product and service
-- catalog (IKPU / MXIK codes, tasnif.soliq.uz), for tasnif.krafta.uz.
--
-- WHY THIS EXISTS
-- ---------------
-- Every fiscal receipt and e-invoice in Uzbekistan must carry the 17-digit
-- IKPU of what was sold, and since 2023-03-01 a code that doesn't match the
-- sale is fined (Tax Code art. 223). The official search only finds a code
-- when you already type the catalog's own wording: "капучино" returns nothing,
-- "услуги общественного питания" suggests Coca-Cola. tasnif.krafta.uz is a
-- free, open search over the same catalog that understands everyday words in
-- Russian, Uzbek and English. Krafta Pay needs it too: its plan form makes
-- merchants paste the IKPU and package code by hand.
--
-- This migration only stores the catalog. Search (full-text, trigram,
-- embeddings) arrives in a later migration, once the benchmark says which
-- index shape earns its memory on this instance.
--
-- ADDITIVE AND REVERSIBLE
-- -----------------------
-- `kraftabase` carries a live merchant SaaS, a live payments product and
-- Krafta AI. This file creates schema `tasnif` and objects inside it, and
-- nothing else: no ALTER, DROP or foreign key touches `public`, `commerce`,
-- `payments` or `agent`. The data is public reference data, not merchant
-- data, so there is nothing here to join against and nothing to leak.
-- Rollback: `supabase/rollback/20260917031500_tasnif_catalog.down.sql`
-- (outside `migrations/` so the CLI never runs it as a migration).
--
-- ACCESS: SERVICE ROLE ONLY, FOR NOW
-- ----------------------------------
-- The import script and, later, the website's server code are the only
-- readers and writers, and both use the service role. `anon` and
-- `authenticated` get no grant on the schema. RLS is enabled on every table
-- with no policies anyway, so if the schema is ever added to PostgREST's
-- exposed schemas before a deliberate read-only function exists, the answer
-- is still "permission denied" rather than an open catalog table — or worse,
-- an open import table. A later migration grants anon EXECUTE on a narrow
-- search function; it never grants table access.
--
-- WHERE THE DATA COMES FROM
-- -------------------------
-- 1. The official Excel export (Группа, Класс, Позиция, Субпозиция, Бренд,
--    Атрибут, ИКПУ, Название ИКПУ, Штрих код, fixed and recommended units,
--    ID-льготы). Russian only, and it has package *names* but not the numeric
--    package codes a receipt needs. ~440k rows.
-- 2. The official per-code endpoint `cls-api/mxik/get/by-mxik?lang=...`, which
--    returns Uzbek Latin and Cyrillic names, numeric package codes and benefit
--    names. That is a slow, polite backfill, so every column it fills is
--    nullable and `codes.details_fetched_at` records how far it has got.

create schema if not exists tasnif;

comment on schema tasnif is
  'Copy of the national IKPU/MXIK catalog (tasnif.soliq.uz) for tasnif.krafta.uz. Public reference data; no merchant data. Service role only.';

revoke all on schema tasnif from public;
grant usage on schema tasnif to service_role;

-- ---------------------------------------------------------------------------
-- nodes: the catalog tree above the product
-- ---------------------------------------------------------------------------
-- group (3 digits) > class (5) > position (8) > sub-position (11). Level and
-- parent are generated from the code so they can never disagree with it.
-- Brand is deliberately not a level: in the export the 12th-14th digits are a
-- brand for ~248k codes but a bare numbering slot for ~97k others
-- ("06810006002034 ---" on a concrete slab), so a brand name lives on the code.
create table if not exists tasnif.nodes (
  code text primary key
    constraint nodes_code_format check (code ~ '^([0-9]{3}|[0-9]{5}|[0-9]{8}|[0-9]{11})$'),
  level text generated always as (
    case length(code)
      when 3 then 'group'
      when 5 then 'class'
      when 8 then 'position'
      else 'subposition'
    end
  ) stored,
  parent_code text generated always as (
    case length(code)
      when 5 then left(code, 3)
      when 8 then left(code, 5)
      when 11 then left(code, 8)
    end
  ) stored references tasnif.nodes (code),
  name_ru text not null,
  name_uz_latn text,
  name_uz_cyrl text,
  -- Machine-translated gloss. The official catalog has no English at all
  -- (lang=en returns Uzbek Cyrillic), so this must never be shown as official.
  name_en text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nodes_parent_code_idx on tasnif.nodes (parent_code);

-- ---------------------------------------------------------------------------
-- codes: one row per 17-digit IKPU
-- ---------------------------------------------------------------------------
create table if not exists tasnif.codes (
  ikpu text primary key
    constraint codes_ikpu_format check (ikpu ~ '^[0-9]{17}$'),
  group_code text generated always as (left(ikpu, 3)) stored,
  class_code text generated always as (left(ikpu, 5)) stored,
  position_code text generated always as (left(ikpu, 8)) stored,
  subposition_code text generated always as (left(ikpu, 11)) stored
    references tasnif.nodes (code),
  -- goods | service | catering. Groups 100-117 are services. Class 10202
  -- ("prepared in a catering establishment") is split out because the most
  -- common wrong code in the wild is a packaged-goods code on a cafe receipt
  -- (a Torabika sachet for a cappuccino); search shows the two side by side.
  kind text generated always as (
    case
      when left(ikpu, 5) = '10202' then 'catering'
      when left(ikpu, 1) = '1' then 'service'
      else 'goods'
    end
  ) stored,
  name_ru text not null,
  name_uz_latn text,
  name_uz_cyrl text,
  -- Null when the export says '---'. Never derived from the code digits; see
  -- the note on tasnif.nodes.
  brand_name text,
  is_branded boolean generated always as (brand_name is not null) stored,
  attribute_ru text,
  barcode text
    constraint codes_barcode_format check (barcode ~ '^[0-9]{8,14}$'),
  -- Unit columns mirror the export headers exactly. The export itself mixes
  -- "measure" and "unit" between its fixed and recommended blocks, so these
  -- are stored as published rather than reinterpreted.
  fixed_measure_ru text,        -- Закреплённые: меры измерения ('шт.', 'метр')
  fixed_unit_ru text,           -- Закреплённые: единицы измерения ('Единицы массы')
  fixed_package_ru text,        -- Закреплённые: упаковка ('шт. (бутылка) 0.50 литр')
  recommended_measure_ru text,  -- Рекомендованные: меры измерения
  recommended_unit_ru text,     -- Рекомендованные: единицы измерения
  benefit_id text,              -- ID-льготы; the export's '0' is stored as null
  benefit_name_ru text,         -- from the per-code endpoint
  status text not null default 'active'
    constraint codes_status check (status in ('active', 'inactive')),
  -- Set when a full export no longer contains the code. Codes are never
  -- deleted: someone may still hold a receipt or a link that names one.
  inactive_since timestamptz,
  details_fetched_at timestamptz,
  first_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists codes_subposition_code_idx on tasnif.codes (subposition_code);
create index if not exists codes_barcode_idx on tasnif.codes (barcode) where barcode is not null;
-- The backfill walks codes that have never been enriched, most important
-- kinds first; a partial index keeps that scan cheap as it shrinks to zero.
create index if not exists codes_details_pending_idx on tasnif.codes (kind, ikpu) where details_fetched_at is null;

-- ---------------------------------------------------------------------------
-- packages: numeric package codes, the second number a receipt needs
-- ---------------------------------------------------------------------------
-- e.g. 10202001010000002 (cafe coffee drinks) -> 1747305 "1 шт. (кружка/стакан)".
-- Filled by the per-code backfill, not by the Excel export.
create table if not exists tasnif.packages (
  ikpu text not null references tasnif.codes (ikpu) on delete cascade,
  package_code bigint not null,
  parent_package_code bigint,
  name_ru text,
  name_uz_latn text,
  name_uz_cyrl text,
  container_name_ru text,
  unit_name_ru text,
  parent_value numeric,
  -- Official fields whose meaning is undocumented; kept verbatim until known.
  package_type text,
  is_unit_package text,
  fetched_at timestamptz not null default now(),
  primary key (ikpu, package_code)
);

-- Someone pasting a package code from a receipt should find its IKPU.
create index if not exists packages_package_code_idx on tasnif.packages (package_code);

-- ---------------------------------------------------------------------------
-- sync_runs: every import and backfill pass, for the "synced on" date and audit
-- ---------------------------------------------------------------------------
create table if not exists tasnif.sync_runs (
  id bigint generated always as identity primary key,
  source text not null
    constraint sync_runs_source check (source in ('excel', 'details_api')),
  source_file text,
  source_sha256 text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_seen integer,
  rows_added integer,
  rows_changed integer,
  rows_deactivated integer,
  notes jsonb not null default '{}'::jsonb,
  error text
);

-- ---------------------------------------------------------------------------
-- import_rows: staging for one Excel import
-- ---------------------------------------------------------------------------
-- UNLOGGED on purpose. A nightly sync re-sends all ~440k rows, but on most
-- nights almost none have changed. Loading them straight into tasnif.codes
-- with ON CONFLICT DO UPDATE would rewrite every row (and write all of it to
-- WAL) on the same small instance that serves Krafta's shops and payments.
-- Instead rows land here without WAL, one set-based merge touches only rows
-- that really differ, and the run's rows are deleted afterwards. If the
-- database crashes mid-import the table is emptied, which is exactly what a
-- rerun wants.
create unlogged table if not exists tasnif.import_rows (
  run_id bigint not null references tasnif.sync_runs (id) on delete cascade,
  ikpu text not null,
  name_ru text not null,
  brand_name text,
  attribute_ru text,
  barcode text,
  fixed_measure_ru text,
  fixed_unit_ru text,
  fixed_package_ru text,
  recommended_measure_ru text,
  recommended_unit_ru text,
  benefit_id text,
  primary key (run_id, ikpu)
);

-- ---------------------------------------------------------------------------
-- Lock-down
-- ---------------------------------------------------------------------------
alter table tasnif.nodes enable row level security;
alter table tasnif.codes enable row level security;
alter table tasnif.packages enable row level security;
alter table tasnif.sync_runs enable row level security;
alter table tasnif.import_rows enable row level security;

grant all on all tables in schema tasnif to service_role;
grant usage, select on all sequences in schema tasnif to service_role;
alter default privileges in schema tasnif grant all on tables to service_role;
alter default privileges in schema tasnif grant usage, select on sequences to service_role;
