-- Fix: inserting any chunk with an embedding fails with
--   operator does not exist: extensions.halfvec = extensions.halfvec
--
-- `agent.doc_chunks_maintain()` compared vectors directly:
--
--   if tg_op = 'UPDATE' and new.content is distinct from old.content
--      and new.embedding is not distinct from old.embedding then
--
-- Two things combine to break it. `is [not] distinct from` needs an equality
-- operator, and the function runs with `search_path = ''`, so an operator
-- living in `extensions` cannot be resolved unqualified. PL/pgSQL then plans
-- the whole `if` condition the first time the function runs — including the
-- unreachable right-hand side — so the failure fires on INSERT, where that
-- branch is never taken. Nothing caught it because no row had ever been
-- inserted: the schema migration was applied but never exercised.
--
-- The comparison is replaced rather than qualified. The intent was "the caller
-- changed the text but did not supply a fresh vector, so drop the stale one",
-- and `embedded_at` answers that exactly — a writer that supplies a new
-- embedding always stamps it. It is a plain timestamptz, so no extension
-- operator is involved and the function keeps its empty search_path.

set local lock_timeout = '3s';

create or replace function agent.doc_chunks_maintain()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' or new.content is distinct from old.content then
    new.content_norm := agent.search_norm(new.content);
    new.fts := to_tsvector('pg_catalog.simple'::regconfig, new.content_norm);
  end if;

  -- Content changed and no fresh embedding came with it: the old vector now
  -- describes text that is gone. Clearing it makes the chunk invisible to the
  -- vector arm of search until it is re-embedded, which is the correct
  -- failure — a stale vector returns the right chunk for the wrong reason.
  if tg_op = 'UPDATE'
     and new.content is distinct from old.content
     and new.embedded_at is not distinct from old.embedded_at then
    new.embedding       := null;
    new.embedding_model := null;
    new.embedded_at     := null;
  end if;

  return new;
end;
$$;
