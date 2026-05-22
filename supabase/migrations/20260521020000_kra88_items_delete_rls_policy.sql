-- Add the missing RLS DELETE policy on public.items.
--
-- ## Background
--
-- public.items had policies for SELECT (anon + authed), INSERT, UPDATE
-- but no DELETE policy. With row level security enabled and no policy
-- permitting DELETE, Postgres rejects every DELETE silently — the
-- statement reports 0 rows affected, but no error surfaces. The
-- deleteItem server action's final `await supabase.from("items")
-- .delete().eq("id", item.id)` returned `error: null`, so the action
-- returned `{ok: true}` and the client toasted "Item deleted." while
-- the row stayed in the database. Merchant reports the canvas still
-- shows the item after a refresh — exactly the symptom.
--
-- ## Fix
--
-- Add an items_delete policy mirroring items_update — only org owners
-- and admins of the catalog's org can delete items in that catalog.
-- Same authorization model as updates.
--
-- ## Why item_media / item_translations / item_variations weren't
-- affected
--
-- Those sibling tables already have DELETE policies (audit query in
-- the diagnosing session confirmed). Only items was missing one.
-- ON DELETE CASCADE foreign keys would have handled the dependents
-- automatically once the items DELETE itself succeeded — but the
-- items DELETE never ran.

CREATE POLICY items_delete
  ON public.items
  FOR DELETE
  TO authenticated
  USING (
    public.is_org_role(
      public.catalog_org_id(catalog_id),
      ARRAY['owner', 'admin']
    )
  );
