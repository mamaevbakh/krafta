-- Krafta Studio: create a NEW coded shop inside an EXISTING org.
--
-- create_draft_shop (20260610130000) early-returns the caller's already-owned
-- org+catalog, so it can only ever mint a merchant's FIRST shop — it cannot add
-- a second catalog to an org. The Studio "new coded shop" flow needs exactly
-- that: a fresh catalog (+ venue + default locale) under an org the caller
-- already owns/administers, tagged as Studio-authored.
--
-- Same SECURITY DEFINER + search_path='' shape as create_draft_shop; the explicit
-- organization_members owner/admin check is the authorization boundary (the
-- function bypasses RLS). A coded shop carries NO vertical/template seeding — its
-- presentation is the generated code, not the enum layout engine; commerce still
-- routes through the engine (catalog/venue rows exist for cart/checkout).

alter table public.catalogs
  add column if not exists creation_method text not null default 'wizard';

-- The coded shop's publishable commerce key, stored raw so the Studio builder can
-- hand it to the sandbox. Publishable keys are non-secret + browser-safe (they
-- ship in the shop's client JS), so persisting the raw token here — read only
-- through the org-gated dashboard — is no weaker than its eventual deployment.
alter table public.catalogs
  add column if not exists studio_publishable_key text;

create or replace function public.create_coded_shop(
  p_org_id uuid,
  p_slug   text,
  p_name   text default null
)
  returns table(org_id uuid, catalog_id uuid, slug text)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_user_id    uuid := auth.uid();
  v_catalog_id uuid;
  v_name       text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_slug is null or length(p_slug) < 3 or length(p_slug) > 64
     or p_slug !~ '^[a-z0-9-]+$' then
    raise exception 'slug must be 3-64 chars, [a-z0-9-]' using errcode = '22023';
  end if;
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is not null and length(v_name) > 80 then
    raise exception 'name must be at most 80 chars' using errcode = '22023';
  end if;

  -- Authorization boundary: caller must own/administer the target org.
  if not exists (
    select 1 from public.organization_members om
     where om.org_id = p_org_id
       and om.user_id = v_user_id
       and om.role in ('owner', 'admin')
  ) then
    raise exception 'not authorized for org %', p_org_id using errcode = '42501';
  end if;

  insert into public.catalogs (org_id, slug, name, vertical, settings_currency, creation_method)
    values (p_org_id, p_slug, coalesce(v_name, 'My shop'), null, '{}'::jsonb, 'studio')
    returning id into v_catalog_id;

  insert into public.venues (catalog_id, org_id, slug, name, status, modes_enabled)
    values (
      v_catalog_id, p_org_id, p_slug, coalesce(v_name, 'My shop'), 'paused',
      array['pickup', 'dine_in', 'delivery']
    );

  insert into public.catalog_locales
    (catalog_id, locale, is_default, is_enabled, sort_order, display_name, text_direction)
    values (v_catalog_id, 'ru', true, true, 0, 'Русский', 'ltr');

  return query select p_org_id, v_catalog_id, p_slug;
end;
$$;

grant execute on function public.create_coded_shop(uuid, text, text) to authenticated;
