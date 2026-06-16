-- KRA-42 — ensure the `krafta` storage bucket exists (catalog logos).
--
-- Logos resolve through getCatalogAssetUrl against a public `krafta` bucket,
-- and POST /api/catalogs/logo uploads there with the service-role key. The
-- bucket was created by hand on production, so it was never replicated to
-- Supabase preview branches (branches clone schema/migrations, not storage),
-- which left logo upload returning "Bucket not found" on every branch.
--
-- Encoding it as a migration makes it reproducible everywhere: it creates the
-- bucket on branches that lack it and no-ops on production (and any branch)
-- that already has it. Config mirrors production exactly: public reads, a
-- 20 MB ceiling, images only. Writes are service-role (RLS-bypassing) and
-- reads are public, so no storage.objects policies are required.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('krafta', 'krafta', true, 20971520, array['image/*'])
on conflict (id) do nothing;
