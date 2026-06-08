-- cart-v3 batch upsert (post-P5).
--
-- Adds `written_by_client` columns to commerce.order_line_items and
-- commerce.order_line_item_modifiers so the cart provider's Realtime
-- subscription can filter out events originating from its own writes
-- (deterministic skip vs the prior "self-events are no-ops" heuristic).
--
-- Adds commerce.cart_apply_writes RPC: applies pre-resolved
-- INSERT/UPDATE/DELETE operations on order_line_items for a single
-- draft order, atomically in one transaction. The JS side
-- (lib/cart/upsert-cart-lines.ts) owns all business logic
-- (modifier resolution, signature dedup, validation); the RPC is pure
-- CRUD. This keeps the validation surface single-sourced in JS instead
-- of duplicating resolveModifierSelections in PL/pgSQL.
--
-- SECURITY INVOKER: the RPC inherits the caller's auth.uid(), so the
-- existing RLS policies on order_line_items (`order_line_items_write`)
-- evaluate against the customer's identity. A forged order_id targeting
-- another customer's draft would fail the policy check on the very
-- first write inside the function and roll the transaction back.

alter table commerce.order_line_items
  add column written_by_client text;

alter table commerce.order_line_item_modifiers
  add column written_by_client text;

create or replace function commerce.cart_apply_writes(
  p_order_id uuid,
  p_org_id uuid,
  p_client_id text,
  p_inserts jsonb,    -- array of { uid, catalog_item_id, catalog_variation_id, catalog_version, name, variation_name, quantity, base_price_cents, total_price_cents, modifiers: [{...}] }
  p_updates jsonb,    -- array of { id, quantity, total_price_cents }
  p_deletes uuid[]    -- array of line item ids
) returns void
language plpgsql
security invoker
as $$
declare
  insert_row jsonb;
  update_row jsonb;
  modifier_row jsonb;
  new_line_id uuid;
  modifier_index integer;
begin
  -- DELETEs first. Cascade drops the modifier rows via FK ON DELETE CASCADE.
  if array_length(p_deletes, 1) is not null then
    delete from commerce.order_line_items
    where id = any(p_deletes)
      and order_id = p_order_id;
  end if;

  -- UPDATEs.
  for update_row in select * from jsonb_array_elements(p_updates)
  loop
    update commerce.order_line_items
    set quantity         = (update_row->>'quantity')::numeric,
        total_price_cents = (update_row->>'total_price_cents')::integer,
        written_by_client = p_client_id,
        updated_at        = now()
    where id       = (update_row->>'id')::uuid
      and order_id = p_order_id;
  end loop;

  -- INSERTs. Modifiers nested in each insert payload land in a child
  -- INSERT scoped to the parent's new id.
  for insert_row in select * from jsonb_array_elements(p_inserts)
  loop
    insert into commerce.order_line_items (
      order_id,
      org_id,
      uid,
      catalog_item_id,
      catalog_variation_id,
      catalog_version,
      name,
      variation_name,
      quantity,
      base_price_cents,
      total_price_cents,
      written_by_client
    ) values (
      p_order_id,
      p_org_id,
      insert_row->>'uid',
      (insert_row->>'catalog_item_id')::uuid,
      (insert_row->>'catalog_variation_id')::uuid,
      (insert_row->>'catalog_version')::bigint,
      insert_row->>'name',
      insert_row->>'variation_name',
      (insert_row->>'quantity')::numeric,
      (insert_row->>'base_price_cents')::integer,
      (insert_row->>'total_price_cents')::integer,
      p_client_id
    )
    returning id into new_line_id;

    modifier_index := 0;
    for modifier_row in
      select * from jsonb_array_elements(coalesce(insert_row->'modifiers', '[]'::jsonb))
    loop
      insert into commerce.order_line_item_modifiers (
        line_item_id,
        order_id,
        org_id,
        uid,
        catalog_modifier_id,
        catalog_modifier_list_id,
        catalog_version,
        name,
        base_price_cents_delta,
        quantity,
        ordinal,
        text_value,
        written_by_client
      ) values (
        new_line_id,
        p_order_id,
        p_org_id,
        (insert_row->>'uid') || '-' || modifier_index::text,
        nullif(modifier_row->>'catalog_modifier_id', '')::uuid,
        nullif(modifier_row->>'catalog_modifier_list_id', '')::uuid,
        (modifier_row->>'catalog_version')::bigint,
        modifier_row->>'name',
        (modifier_row->>'base_price_cents_delta')::integer,
        (modifier_row->>'quantity')::integer,
        (modifier_row->>'ordinal')::integer,
        modifier_row->>'text_value',
        p_client_id
      );
      modifier_index := modifier_index + 1;
    end loop;
  end loop;
end;
$$;

grant execute on function commerce.cart_apply_writes(uuid, uuid, text, jsonb, jsonb, uuid[]) to authenticated, anon;
