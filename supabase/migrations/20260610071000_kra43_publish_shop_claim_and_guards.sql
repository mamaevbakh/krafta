-- KRA-43 / ADR 0005 §1, §2, §4 — publish_shop, draft-claim handshake, and
-- DB-level enforcement of the wedge invariant.
--
-- Eng review decisions (2026-06-10) implemented here:
--   D15 — going live is a DUAL gate: catalogs.status draft→published AND
--         venues.status paused→active. Both flip atomically in publish_shop.
--         Flipping the catalog early would leak draft menu data (locale and
--         category RLS key off catalog_is_public alone), so nothing else may
--         publish the catalog.
--   D16 — "register gates going live" is a DATABASE GUARANTEE, not a UI
--         convention: publish_shop rejects anonymous JWTs, and BEFORE UPDATE
--         trigger guards reject anonymous go-live on EVERY path (settings UI,
--         raw PostgREST, future code). Registered pause/unpause is untouched.
--   D17 — the merchant-facing slug is chosen at Publish: publish_shop accepts
--         p_final_slug and renames org/catalog/venue in the same transaction.
--   D8  — slugs FREEZE after publish (QR permanence): trigger guards reject
--         slug changes once the linked catalog is published.
--   D2  — identity collision at register ("this Google/email already has an
--         account") resolves via a possession-proof claim handshake:
--           anon session:      claim_draft_shop_initiate() → claim code
--           registered session: claim_draft_shop_complete(code) → ownership
--         The code (held by the browser that owns the draft) is the proof;
--         without it, no registered user can take over an anonymous org.
--
-- State machine after this migration:
--
--          create_draft_shop                    publish_shop (registered only)
--   ∅ ───────────────────────► draft+paused ─────────────────────► published+active
--                               │        ▲                              │
--                anon session   │        │ pause/unpause (any owner)    │
--                builds freely  │        ▼                              ▼
--                               │   (never public:                 slug frozen,
--                               │    RLS needs BOTH gates)         storefront live
--                               └── claim handshake re-points owner on collision

-- ---------------------------------------------------------------------------
-- 1. Trigger guards: anonymous sessions cannot take a shop live (D16)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_anon_go_live()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  -- auth.jwt() reads request.jwt.claims; absent (service role, migrations,
  -- direct psql) → NULL → allowed. Only an explicit is_anonymous=true JWT —
  -- a signInAnonymously() session — is rejected.
  IF coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'registration required to publish (ADR 0005 §1)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_anon_venue_activate
  BEFORE UPDATE OF status ON public.venues
  FOR EACH ROW
  WHEN (NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active')
  EXECUTE FUNCTION public.guard_anon_go_live();

CREATE TRIGGER trg_guard_anon_catalog_publish
  BEFORE UPDATE OF status ON public.catalogs
  FOR EACH ROW
  WHEN (NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published')
  EXECUTE FUNCTION public.guard_anon_go_live();

-- Also guard INSERT-time escapes: an anon caller could otherwise create a row
-- already in the live state (status is client-writable under owner RLS).
CREATE OR REPLACE FUNCTION public.guard_anon_go_live_insert()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    IF TG_TABLE_NAME = 'venues' AND NEW.status = 'active' THEN
      RAISE EXCEPTION 'registration required to publish (ADR 0005 §1)' USING ERRCODE = '42501';
    ELSIF TG_TABLE_NAME = 'catalogs' AND NEW.status = 'published' THEN
      RAISE EXCEPTION 'registration required to publish (ADR 0005 §1)' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_anon_venue_insert_active
  BEFORE INSERT ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.guard_anon_go_live_insert();

CREATE TRIGGER trg_guard_anon_catalog_insert_published
  BEFORE INSERT ON public.catalogs
  FOR EACH ROW EXECUTE FUNCTION public.guard_anon_go_live_insert();

-- ---------------------------------------------------------------------------
-- 2. Slug freeze after publish (D8/D17: printed QRs must never die)
-- ---------------------------------------------------------------------------

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
  -- publish_shop renames slugs in the same transaction that flips status; it
  -- sets this GUC so its own renames pass the freeze.
  -- [superseded by 20260610073000 — the GUC bypass leaked transaction-wide
  --  and is removed there; kept here verbatim as applied]
  IF current_setting('krafta.publishing', true) = 'on' THEN
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

CREATE TRIGGER trg_guard_org_slug_freeze
  BEFORE UPDATE OF slug ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_slug_freeze();

CREATE TRIGGER trg_guard_catalog_slug_freeze
  BEFORE UPDATE OF slug ON public.catalogs
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_slug_freeze();

CREATE TRIGGER trg_guard_venue_slug_freeze
  BEFORE UPDATE OF slug ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_slug_freeze();

-- ---------------------------------------------------------------------------
-- 3. publish_shop — the single way a shop goes live (D15 + D16 + D17)
-- ---------------------------------------------------------------------------

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
    -- Let our own renames through the post-publish freeze guard (idempotent
    -- republish) while keeping it absolute for everyone else.
    PERFORM set_config('krafta.publishing', 'on', true);
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

COMMENT ON FUNCTION public.publish_shop(uuid, text) IS
  'KRA-43 / ADR 0005 §4: atomic go-live. Rejects anonymous JWTs (D16), renames org/catalog/venue to the merchant-chosen final slug (D17), flips catalogs→published + venues→active together (D15). Idempotent: republish is a no-op.';

REVOKE EXECUTE ON FUNCTION public.publish_shop(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.publish_shop(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Draft-claim handshake (D2: identity collision at register)
-- ---------------------------------------------------------------------------

CREATE TABLE public.draft_shop_claims (
  code         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  claimed_from uuid        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '30 minutes'
);

COMMENT ON TABLE public.draft_shop_claims IS
  'ADR 0005 §4 (D2): short-lived possession proofs for transferring a draft shop from an anonymous owner to a registered account when register hits an identity collision. Definer-only access.';

ALTER TABLE public.draft_shop_claims ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_draft_shop_initiate()
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id  uuid;
  v_code    uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  -- Only an anonymous owner has a draft to hand over; registered users keep
  -- their shop by signing in.
  IF NOT coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'claim handshake is for anonymous sessions' USING ERRCODE = '42501';
  END IF;

  SELECT om.org_id INTO v_org_id
    FROM public.organization_members om
   WHERE om.user_id = v_user_id AND om.role = 'owner'
   ORDER BY om.org_id
   LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'no draft shop to claim' USING ERRCODE = '22023';
  END IF;

  -- One active claim per org; re-initiating replaces it.
  DELETE FROM public.draft_shop_claims WHERE org_id = v_org_id;
  INSERT INTO public.draft_shop_claims (org_id, claimed_from)
    VALUES (v_org_id, v_user_id)
    RETURNING code INTO v_code;
  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.claim_draft_shop_initiate() IS
  'ADR 0005 §4 (D2), step 1: the anonymous owner mints a 30-minute claim code BEFORE switching sessions. The browser holds the code as proof of possession.';

CREATE OR REPLACE FUNCTION public.claim_draft_shop_complete(p_claim_code uuid)
  RETURNS TABLE(org_slug text, catalog_slug text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_claim   record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'sign in with your account to claim the draft' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_claim
    FROM public.draft_shop_claims
   WHERE code = p_claim_code AND expires_at > now();
  IF v_claim IS NULL THEN
    RAISE EXCEPTION 'claim code is invalid or expired' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_members om
     WHERE om.org_id = v_claim.org_id AND om.user_id = v_user_id
  ) THEN
    -- Claimer already belongs to the org (repeat completion): drop the
    -- leftover anonymous membership instead of violating (org_id, user_id).
    DELETE FROM public.organization_members om
     WHERE om.org_id = v_claim.org_id AND om.user_id = v_claim.claimed_from;
  ELSE
    UPDATE public.organization_members om
       SET user_id = v_user_id
     WHERE om.org_id = v_claim.org_id
       AND om.user_id = v_claim.claimed_from
       AND om.role = 'owner';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'draft is no longer claimable' USING ERRCODE = '22023';
    END IF;
  END IF;

  DELETE FROM public.draft_shop_claims WHERE code = p_claim_code;

  RETURN QUERY
    SELECT o.slug, c.slug
      FROM public.organizations o
      JOIN public.catalogs c ON c.org_id = o.id
     WHERE o.id = v_claim.org_id
     LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.claim_draft_shop_complete(uuid) IS
  'ADR 0005 §4 (D2), step 2: after signing into the existing account, the browser redeems the claim code; org ownership re-points from the anonymous uid to the registered uid. The draft shop survives the collision.';

REVOKE EXECUTE ON FUNCTION public.claim_draft_shop_initiate() FROM public;
GRANT EXECUTE ON FUNCTION public.claim_draft_shop_initiate() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_draft_shop_complete(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_draft_shop_complete(uuid) TO authenticated;
