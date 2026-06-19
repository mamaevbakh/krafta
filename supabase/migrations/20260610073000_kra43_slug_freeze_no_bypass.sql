-- Hotfix 2 for 20260610071000: the krafta.publishing GUC bypass was both
-- unnecessary and leaky.
--
--   Unnecessary: on FIRST publish the renames run while the catalog is still
--   'draft', so guard_published_slug_freeze allows them with no escape hatch.
--   Leaky: set_config(..., true) is transaction-local, so the bypass survived
--   until COMMIT — anything later in the same transaction (or a future RPC
--   that composes publish_shop) could rename a published shop's slug, which
--   is exactly what D8 (QR permanence) forbids. A republish with a DIFFERENT
--   slug also sailed through.
--
-- Fix: drop the GUC from both functions. Ordering does the work — renames
-- happen before the status flips, so first-publish renames pass naturally and
-- any post-publish rename (including via republish) hits the freeze.

CREATE OR REPLACE FUNCTION public.guard_published_slug_freeze()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_published boolean;
BEGIN
  IF NEW.slug = OLD.slug THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'organizations' THEN
    SELECT EXISTS (SELECT 1 FROM public.catalogs c WHERE c.org_id = OLD.id AND c.status = 'published')
      INTO v_published;
  ELSIF TG_TABLE_NAME = 'catalogs' THEN
    v_published := (OLD.status = 'published');
  ELSE -- venues
    SELECT EXISTS (SELECT 1 FROM public.catalogs c WHERE c.id = OLD.catalog_id AND c.status = 'published')
      INTO v_published;
  END IF;
  IF v_published THEN
    RAISE EXCEPTION 'slug is frozen after publish (ADR 0005 §2: QR permanence)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_shop(
  p_org_id     uuid,
  p_final_slug text DEFAULT NULL
)
  RETURNS TABLE(org_slug text, catalog_slug text, venue_slug text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'registration required to publish (ADR 0005 §1)'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
     WHERE om.org_id = p_org_id AND om.user_id = v_user_id
       AND om.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not an owner or admin of this organization' USING ERRCODE = '42501';
  END IF;

  IF p_final_slug IS NOT NULL THEN
    IF length(p_final_slug) < 3 OR length(p_final_slug) > 64
       OR p_final_slug !~ '^[a-z0-9-]+$' THEN
      RAISE EXCEPTION 'slug must be 3-64 chars, [a-z0-9-]' USING ERRCODE = '22023';
    END IF;
    -- First publish: catalog is still 'draft' here, so the freeze guard lets
    -- these renames pass. After publish, the same statements raise — slug
    -- changes on a published shop are impossible by construction (D8).
    UPDATE public.organizations SET slug = p_final_slug
      WHERE id = p_org_id AND slug <> p_final_slug;
    UPDATE public.catalogs SET slug = p_final_slug
      WHERE org_id = p_org_id AND slug <> p_final_slug;
    UPDATE public.venues SET slug = p_final_slug
      WHERE org_id = p_org_id AND slug <> p_final_slug;
    -- Unique violations (23505) bubble up; the app retries with a suffix.
  END IF;

  -- D15: both gates flip together. v1 is 1:1 org:catalog:venue.
  UPDATE public.catalogs SET status = 'published'
    WHERE org_id = p_org_id AND status <> 'published';
  UPDATE public.venues SET status = 'active'
    WHERE org_id = p_org_id AND status <> 'active';

  RETURN QUERY
    SELECT o.slug, c.slug, v.slug
      FROM public.organizations o
      JOIN public.catalogs c ON c.org_id = o.id
      JOIN public.venues v ON v.org_id = o.id
     WHERE o.id = p_org_id
     LIMIT 1;
END;
$$;
