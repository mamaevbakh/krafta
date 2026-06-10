-- Hotfix for 20260610071000: guard_anon_go_live_insert compared NEW.status
-- against 'active' before branching on TG_TABLE_NAME, so on catalogs the
-- literal was cast to catalog_status and blew up with 22P02 on EVERY
-- anonymous INSERT — i.e. create_draft_shop itself. Branch on the table
-- first and compare as text so no cross-enum cast can occur.
CREATE OR REPLACE FUNCTION public.guard_anon_go_live_insert()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    IF TG_TABLE_NAME = 'venues' THEN
      IF NEW.status::text = 'active' THEN
        RAISE EXCEPTION 'registration required to publish (ADR 0005 §1)' USING ERRCODE = '42501';
      END IF;
    ELSIF TG_TABLE_NAME = 'catalogs' THEN
      IF NEW.status::text = 'published' THEN
        RAISE EXCEPTION 'registration required to publish (ADR 0005 §1)' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
