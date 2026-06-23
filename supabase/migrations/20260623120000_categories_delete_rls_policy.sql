-- Add the missing RLS DELETE policy on public.catalog_categories.
--
-- ## Background
--
-- Same class of bug as KRA-88 (items_delete). catalog_categories had
-- policies for SELECT (anon + authed), INSERT and UPDATE but no DELETE
-- policy. With row level security enabled and no policy permitting DELETE,
-- Postgres rejects every DELETE silently — the statement reports 0 rows
-- affected, but no error surfaces.
--
-- deleteCategory() (items/categories/_components/actions.ts) deletes the
-- category's items, item_translations, item_media and
-- catalog_category_translations first — all of which DO have DELETE
-- policies and succeed — then runs the final
-- `supabase.from("catalog_categories").delete().eq("id", category.id)`.
-- That last delete no-ops under RLS and returns `error: null`, so the
-- action returns `{ok: true}` and the client toasts "Category deleted."
-- while the (now-empty) category row stays. Merchant reports the category
-- still shows after a refresh — exactly the items_delete symptom.
--
-- KRA-88 added items_delete but its sibling audit missed that
-- catalog_categories itself also lacked a DELETE policy.
--
-- ## Fix
--
-- Add a categories_delete policy mirroring categories_update — only org
-- owners and admins of the catalog's org can delete categories in that
-- catalog. Same authorization model as updates. (DROP IF EXISTS keeps the
-- migration idempotent across re-application to a branch.)

DROP POLICY IF EXISTS categories_delete ON public.catalog_categories;

CREATE POLICY categories_delete
  ON public.catalog_categories
  FOR DELETE
  TO authenticated
  USING (
    public.is_org_role(
      public.catalog_org_id(catalog_id),
      ARRAY['owner', 'admin']
    )
  );
