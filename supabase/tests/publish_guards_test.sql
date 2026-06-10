-- pgTAP — publish_shop, claim handshake, and the anon go-live guards
-- (ADR 0005 §1/§2/§4, eng review D2/D8/D15/D16/D17).
begin;
select plan(17);

-- simulated users: an anonymous merchant, a registered merchant, an outsider
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-0000000000b1', true),
  ('00000000-0000-4000-8000-0000000000b2', false),
  ('00000000-0000-4000-8000-0000000000b3', false);

create or replace function pg_temp.act_as(p_sub text, p_anon boolean) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated', 'is_anonymous', p_anon)::text, true);
$$;

-- anon merchant builds a draft shop
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1', true);
create temp table shop as
  select * from public.create_draft_shop('guard-probe', 'restaurant', 'Ош Маркази');

-- ---------------------------------------------------------------------------
-- D16: no anonymous path to going live
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.venues set status = 'active' where org_id = (select org_id from shop)$$,
  '42501', 'registration required to publish (ADR 0005 §1)',
  'anon direct venue activation is rejected by the trigger guard');

select throws_ok(
  $$update public.catalogs set status = 'published' where id = (select catalog_id from shop)$$,
  '42501', 'registration required to publish (ADR 0005 §1)',
  'anon direct catalog publish is rejected by the trigger guard');

select throws_ok(
  $$select * from public.publish_shop((select org_id from shop))$$,
  '42501', 'registration required to publish (ADR 0005 §1)',
  'publish_shop rejects anonymous callers');

-- anon pause/unpause of a DRAFT venue stays allowed only paused-ward; the
-- guard fires solely on the transition INTO active, nothing else.
update public.venues set name = 'Ош Маркази (тест)' where org_id = (select org_id from shop);
select pass('anon non-status venue edits pass the guards untouched');

-- ---------------------------------------------------------------------------
-- D2: claim handshake (identity collision at register)
-- ---------------------------------------------------------------------------
create temp table claim as select public.claim_draft_shop_initiate() as code;

select isnt((select code from claim), null, 'anon owner can mint a claim code');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2', false);

select throws_ok(
  $$select * from public.claim_draft_shop_complete(gen_random_uuid())$$,
  '22023', 'claim code is invalid or expired',
  'a guessed claim code is rejected');

create temp table claimed as
  select * from public.claim_draft_shop_complete((select code from claim));

select is(
  (select count(*) from public.organization_members om
    where om.org_id = (select org_id from shop)
      and om.user_id = '00000000-0000-4000-8000-0000000000b2'
      and om.role = 'owner')::int,
  1, 'ownership re-points to the registered user');

select is(
  (select count(*) from public.organization_members om
    where om.org_id = (select org_id from shop)
      and om.user_id = '00000000-0000-4000-8000-0000000000b1')::int,
  0, 'the anonymous membership is gone after the claim');

select is(
  (select count(*) from public.draft_shop_claims)::int,
  0, 'the claim code is single-use');

-- ---------------------------------------------------------------------------
-- D15 + D17: publish flips BOTH gates and installs the final slug
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.publish_shop((select org_id from shop))$$,
  '42501', 'not an owner or admin of this organization',
  'a non-member cannot publish someone else''s shop'
) from (select pg_temp.act_as('00000000-0000-4000-8000-0000000000b3', false)) _;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2', false);

select is(
  (select public.catalog_is_public((select catalog_id from shop))),
  false, 'draft catalog is invisible to the storefront before publish');

create temp table published as
  select * from public.publish_shop((select org_id from shop), 'osh-markazi');

select is(
  (select (org_slug, catalog_slug, venue_slug)::text from published),
  '(osh-markazi,osh-markazi,osh-markazi)',
  'final slug installs across org, catalog and venue (D17)');

select is(
  (select (c.status::text, v.status::text)::text
     from public.catalogs c
     join public.venues v on v.catalog_id = c.id
    where c.id = (select catalog_id from shop)),
  '(published,active)', 'both gates flip together (D15)');

select is(
  (select public.catalog_is_public((select catalog_id from shop))),
  true, 'published catalog is visible to the storefront');

-- ---------------------------------------------------------------------------
-- D8: slugs freeze after publish (QR permanence)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.organizations set slug = 'renamed' where id = (select org_id from shop)$$,
  '42501', 'slug is frozen after publish (ADR 0005 §2: QR permanence)',
  'org slug is frozen after publish');

select lives_ok(
  $$select * from public.publish_shop((select org_id from shop), 'osh-markazi')$$,
  'republish with the same slug is an idempotent no-op');

select throws_ok(
  $$select * from public.publish_shop((select org_id from shop), 'osh-markazi-rebrand')$$,
  '42501', 'slug is frozen after publish (ADR 0005 §2: QR permanence)',
  'republish cannot smuggle a rename past the freeze');

select * from finish();
rollback;
