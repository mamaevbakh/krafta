-- cart-v3 P4: enable Realtime DELETE events on commerce.order_line_items.
--
-- Supabase Realtime's `postgres_changes` matcher evaluates filters
-- (`order_id=eq.<id>`) against the row payload. With REPLICA IDENTITY
-- DEFAULT, the WAL emits ONLY the primary key for DELETE rows, so any
-- filter on a non-PK column (order_id is FK, not PK) silently drops
-- the DELETE event on the client. Tab B never sees Tab A's "trash this
-- line" → its cart drifts until reload.
--
-- REPLICA IDENTITY FULL writes every column to the WAL on DELETE, so
-- the filter can resolve against the deleted row's order_id. Cost:
-- bigger DELETE entries in WAL — negligible for cart line items which
-- delete in low frequency and have small column counts.
--
-- INSERTs and UPDATEs were already working (their WAL entries always
-- include the column values being written).

alter table commerce.order_line_items replica identity full;
