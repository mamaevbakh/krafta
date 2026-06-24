-- KRA — RLS policies for QR studio logo uploads on the public `krafta`
-- storage bucket.
--
-- Context: uploadQrLogo (apps/krafta/lib/qr/actions.ts) writes objects under
--   qr-logos/{catalogId}/{id}.{ext}
-- using the merchant's request-scoped Supabase client. That client runs as
-- `authenticated`, so storage.objects RLS applies. The existing catalog-logo
-- writer (app/api/catalogs/logo/route.ts) goes through a service-role client
-- and so never needed a policy — but the QR studio path does. Without these
-- policies, every session-scoped insert into the krafta bucket is denied by
-- the default-deny on storage.objects.
--
-- Authorization mirrors the rest of the catalog-asset surface: only owners
-- and admins of the catalog's org may write. The catalog UUID lives in the
-- second path segment (the first is the literal 'qr-logos' prefix), and we
-- use the existing helpers public.catalog_org_id(uuid) and
-- public.is_org_role(uuid, text[]) — defined in the baseline migration and
-- used widely across catalog-scoped RLS policies — to resolve and check
-- membership in one shot.
--
-- Reads stay public via the bucket's public=true flag and the storage CDN,
-- which does not consult storage.objects RLS for public buckets. We do not
-- add a SELECT policy here so we match the access shape that already governs
-- catalog logos in the same bucket.

drop policy if exists "qr_logos_insert" on storage.objects;
drop policy if exists "qr_logos_update" on storage.objects;
drop policy if exists "qr_logos_delete" on storage.objects;

create policy "qr_logos_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'krafta'
    and (storage.foldername(name))[1] = 'qr-logos'
    and public.is_org_role(
      public.catalog_org_id(((storage.foldername(name))[2])::uuid),
      array['owner', 'admin']
    )
  );

create policy "qr_logos_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'krafta'
    and (storage.foldername(name))[1] = 'qr-logos'
    and public.is_org_role(
      public.catalog_org_id(((storage.foldername(name))[2])::uuid),
      array['owner', 'admin']
    )
  )
  with check (
    bucket_id = 'krafta'
    and (storage.foldername(name))[1] = 'qr-logos'
    and public.is_org_role(
      public.catalog_org_id(((storage.foldername(name))[2])::uuid),
      array['owner', 'admin']
    )
  );

create policy "qr_logos_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'krafta'
    and (storage.foldername(name))[1] = 'qr-logos'
    and public.is_org_role(
      public.catalog_org_id(((storage.foldername(name))[2])::uuid),
      array['owner', 'admin']
    )
  );
