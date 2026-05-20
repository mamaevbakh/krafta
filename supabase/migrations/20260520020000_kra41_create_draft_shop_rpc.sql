-- KRA-41 / Bootstrap RPC for anonymous merchant onboarding.
--
-- Problem: RLS on public.organizations / organization_members / catalogs /
-- venues all require the caller to already be a member of the target org
-- with role='owner' or 'admin'. That's correct for ongoing access but
-- breaks the first-time flow: a new visitor has no membership yet, so they
-- can't create the org-row that would make them an owner. Chicken-and-egg.
--
-- Solution: a SECURITY DEFINER function that stamps all four rows
-- atomically. The function trusts `auth.uid()` (set by Supabase Auth on
-- every authenticated request, including anonymous sessions) and grants
-- the caller ownership of the new org. authenticated role only — anon
-- users coming through Supabase signInAnonymously() still have a JWT and
-- show up as `authenticated` from RLS's perspective.
--
-- The function is intentionally narrow: ONE shop per call, fixed default
-- names, paused venue (merchant flips it active when ready). Any further
-- customization happens through the regular RLS-gated tables once the
-- caller is the org owner.

CREATE OR REPLACE FUNCTION public.create_draft_shop(p_slug text)
  RETURNS TABLE(org_id uuid, catalog_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_catalog_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_slug IS NULL OR length(p_slug) < 3 OR length(p_slug) > 64
     OR p_slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'slug must be 3-64 chars, [a-z0-9-]' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organizations (slug, name)
    VALUES (p_slug, 'My shop')
    RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (v_org_id, v_user_id, 'owner');

  INSERT INTO public.catalogs (org_id, slug, name)
    VALUES (v_org_id, p_slug, 'My catalog')
    RETURNING id INTO v_catalog_id;

  -- New shops start paused. Merchant flips to 'active' from the venue
  -- settings tab (KRA-34) when they're ready to receive orders.
  INSERT INTO public.venues (catalog_id, org_id, slug, name, status)
    VALUES (v_catalog_id, v_org_id, p_slug, 'My venue', 'paused');

  RETURN QUERY SELECT v_org_id, v_catalog_id;
END;
$$;

COMMENT ON FUNCTION public.create_draft_shop(text) IS
  'KRA-41: atomic 4-row shop bootstrap for an authenticated (incl. anon) caller. Caller becomes org owner. Slug is reused across org/catalog/venue for the v1 single-shop case.';

REVOKE EXECUTE ON FUNCTION public.create_draft_shop(text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_draft_shop(text) TO authenticated;
