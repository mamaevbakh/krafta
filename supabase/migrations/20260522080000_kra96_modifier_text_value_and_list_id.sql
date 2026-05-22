-- KRA-96: storefront modifier completeness.
--
-- Two new columns on `commerce.order_line_item_modifiers` to support
-- text-mode (free-text) modifiers reaching the order:
--
--   * `text_value text NULL` — the customer-typed string for
--     `modifier_type='text'` rows (kitchen prep notes, custom requests,
--     gift messages, etc). NULL for list-mode rows.
--
--   * `catalog_modifier_list_id uuid NULL` — references the parent
--     `public.modifier_lists(id)`. List-mode rows reach the list via
--     `catalog_modifier_id → public.modifiers.modifier_list_id`, but
--     text-mode rows have no `catalog_modifier_id` (no row in
--     `public.modifiers` to point to). Without this column, text-mode
--     OLIM rows lose their attachment back to the list and we can't
--     answer "which list did this kitchen note come from?" — needed
--     for receipts, KDS grouping, and the merchant's future analytics.
--
-- Both columns are nullable so the migration doesn't disturb existing
-- order_line_item_modifiers rows. The application writes the new fields
-- on every new order; historical rows keep NULL for both, which still
-- renders fine (list-mode rows kept their old catalog_modifier_id ref).
--
-- ON DELETE SET NULL on catalog_modifier_list_id mirrors the existing
-- `catalog_modifier_id` ON DELETE SET NULL behavior: a soft-deleted list
-- shouldn't cascade through frozen historical orders. The order's
-- denormalized `name` + `base_price_cents_delta` + `text_value` carry
-- the snapshot independently.

ALTER TABLE commerce.order_line_item_modifiers
  ADD COLUMN IF NOT EXISTS text_value text,
  ADD COLUMN IF NOT EXISTS catalog_modifier_list_id uuid
    REFERENCES public.modifier_lists(id) ON DELETE SET NULL;

COMMENT ON COLUMN commerce.order_line_item_modifiers.text_value IS
  'Customer-typed string for modifier_type=text rows. NULL for list-mode rows.';

COMMENT ON COLUMN commerce.order_line_item_modifiers.catalog_modifier_list_id IS
  'Parent modifier_list. NULL only on legacy rows from before KRA-96. List-mode rows can derive this from catalog_modifier_id; text-mode rows have no catalog_modifier_id so the list_id is the only link back to the list.';

-- Hot read path: orders dashboard groups text notes by list within an
-- order. Cheap composite index keyed on list_id + line_item_id.
CREATE INDEX IF NOT EXISTS order_line_item_modifiers_list_id_idx
  ON commerce.order_line_item_modifiers (catalog_modifier_list_id)
  WHERE catalog_modifier_list_id IS NOT NULL;
