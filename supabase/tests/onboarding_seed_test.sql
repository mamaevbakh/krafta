-- pgTAP — create_draft_shop v2 (ADR 0005 §5/§6, eng review D4/D5/D7/D19/D21).
-- Run with `supabase test db` (local stack). Each section simulates a JWT via
-- request.jwt.claims, the way PostgREST presents callers to the database.
begin;
select plan(20);

-- ---------------------------------------------------------------------------
-- helpers: two simulated users (anon merchant + a second anon for isolation)
-- ---------------------------------------------------------------------------
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-0000000000a1', true),
  ('00000000-0000-4000-8000-0000000000a2', true);

select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-4000-8000-0000000000a1','role','authenticated','is_anonymous',true)::text, true);

-- ---------------------------------------------------------------------------
-- input validation (D4: definer functions validate everything)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.create_draft_shop('x')$$,
  '22023', 'slug must be 3-64 chars, [a-z0-9-]',
  'rejects a too-short slug');

select throws_ok(
  $$select * from public.create_draft_shop('probe-cafe', 'cafe', repeat('я', 81))$$,
  '22023', 'name must be at most 80 chars',
  'rejects an over-long shop name');

select throws_ok(
  $$select * from public.create_draft_shop('probe-cafe', 'barbershop')$$,
  '22P02', null,
  'rejects a vertical outside the enum at the cast boundary');

-- ---------------------------------------------------------------------------
-- happy path: cafe seed
-- ---------------------------------------------------------------------------
create temp table probe as
  select * from public.create_draft_shop('probe-cafe', 'cafe', 'Чойхона №1');

select is((select count(*) from probe)::int, 1, 'returns one org/catalog row');

select is(
  (select c.vertical::text from public.catalogs c join probe p on c.id = p.catalog_id),
  'cafe', 'catalogs.vertical persists the wizard pick (D21)');

select is(
  (select c.name from public.catalogs c join probe p on c.id = p.catalog_id),
  'Чойхона №1', 'shop name lands on the catalog');

select is(
  (select count(*) from public.catalog_locales cl join probe p on cl.catalog_id = p.catalog_id)::int,
  3, 'seeds exactly three locales (D4)');

select is(
  (select cl.locale from public.catalog_locales cl join probe p on cl.catalog_id = p.catalog_id where cl.is_default),
  'ru', 'ru is the default locale');

select is(
  (select count(*) from public.catalog_categories cc join probe p on cc.catalog_id = p.catalog_id)::int,
  2, 'cafe template seeds two categories');

select is(
  (select count(*) from public.items i join probe p on i.catalog_id = p.catalog_id)::int,
  5, 'cafe template seeds five items');

select is(
  (select count(*) from public.items i join probe p on i.catalog_id = p.catalog_id where i.seeded_at is null)::int,
  0, 'every seeded item carries seeded_at (D19)');

select is(
  (select count(*) from public.item_variations v join probe p on v.catalog_id = p.catalog_id)::int,
  7, 'cafe template seeds seven variations');

select is(
  (select count(*) from public.item_translations t
    join public.items i on i.id = t.item_id
    join probe p on i.catalog_id = p.catalog_id)::int,
  10, 'every item gets uz + en translations (no MT jobs needed, D4)');

-- search documents are produced by the existing AFTER triggers, inside the
-- seeding transaction (D4: trigger-owned, no app-level sync on top)
select is(
  (select count(distinct d.source_id) from public.catalog_search_documents d
    join probe p on d.catalog_id = p.catalog_id
   where d.source_table = 'items')::int,
  5, 'search-doc triggers produced documents for every seeded item');

select is(
  (select v.status::text from public.venues v join probe p on v.org_id = p.org_id),
  'paused', 'venue starts paused');

select is(
  (select c.status::text from public.catalogs c join probe p on c.id = p.catalog_id),
  'draft', 'catalog starts draft (dual gate, D15)');

select is(
  (select array(select unnest(v.modes_enabled) order by 1)
     from public.venues v join probe p on v.org_id = p.org_id),
  array['dine_in','pickup']::text[], 'cafe gets vertical-appropriate modes');

-- ---------------------------------------------------------------------------
-- idempotency (D5): repeat call returns the SAME shop, never reseeds
-- ---------------------------------------------------------------------------
select is(
  (select (r.org_id = p.org_id and r.catalog_id = p.catalog_id)
     from public.create_draft_shop('different-slug', 'restaurant', 'Другое имя') r, probe p),
  true, 'second call returns the existing shop, ignoring new inputs');

select is(
  (select count(*) from public.items i join probe p on i.catalog_id = p.catalog_id)::int,
  5, 'second call did not reseed');

-- ---------------------------------------------------------------------------
-- legacy path: NULL vertical = bare bootstrap (backwards compatible)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-4000-8000-0000000000a2','role','authenticated','is_anonymous',true)::text, true);

create temp table probe2 as
  select * from public.create_draft_shop('probe-bare');

select is(
  (select count(*) from public.items i join probe2 p on i.catalog_id = p.catalog_id)::int,
  0, 'NULL vertical seeds nothing (legacy bootstrap)');

select is(
  (select c.name from public.catalogs c join probe2 p on c.id = p.catalog_id),
  'My catalog', 'legacy bootstrap keeps the old default names');

select * from finish();
rollback;
