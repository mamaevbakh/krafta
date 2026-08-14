-- Krafta AI: the `agent` schema.
--
-- WHY THIS EXISTS
-- ---------------
-- Krafta AI is a third product on this database: a business in Uzbekistan
-- registers, picks a template (or describes what it wants in Uzbek), and gets
-- an AI agent that answers its customers. The bet the product makes is that
-- onboarding a business WRITES ROWS — it does not run a deploy. One eve
-- deployment serves every tenant, and everything that makes a tenant's agent
-- theirs (persona, model, languages, tools, escalation contact) is resolved per
-- session out of these tables.
--
-- Its console lives in a separate repository (`/Users/bakh/VSCode/krafta-ai`),
-- but the migration lives here, in the monorepo, because one database has one
-- migration history and this one already has 86 files. A second history against
-- the same Postgres is how two teams end up applying the same DDL twice.
--
-- The rollback is NOT next to this file. It lives at
-- `supabase/rollback/20260811190000_agent_schema.down.sql`, outside
-- `supabase/migrations/`, because the Supabase CLI matches `^([0-9]+)_(.*)\.sql$`
-- and would otherwise run the rollback AS a migration — sorted before this one
-- (`.d` < `.s`), so `drop schema agent cascade` would execute first and then
-- collide on the migration-history primary key.
--
-- ADDITIVE AND REVERSIBLE
-- -----------------------
-- `kraftabase` carries a live merchant SaaS and a live payments product. This
-- migration creates schema `agent` and objects inside it, and nothing else. It
-- does not ALTER or DROP a single object in `public`, `commerce` or `payments`.
-- The only reference pointing out of this schema is the foreign key to
-- `public.organizations(id)` that every tenant-scoped table carries.
--
-- Consequences of that rule, both deliberate, both explained again where they
-- occur:
--   * actor columns (`created_by`, `decided_by`, `uploaded_by`) are bare uuids
--     pointing at `auth.users`, with no foreign key. For the audit log that is
--     the better shape anyway — an ON DELETE SET NULL would erase who did it.
--   * `agent.conversations.invoice_id` is a soft reference to
--     `payments.invoices`. Krafta AI settles through the existing payments
--     schema, but the coupling is one-directional and enforced in application
--     code so that dropping `agent` never touches billing.
--
-- ORG_ID IS THE TENANT KEY, AND IT TRAVELS WITH THE POINTER
-- ---------------------------------------------------------
-- There is no `tenants` table and there must never be one. Krafta AI reuses
-- `public.organizations` and `public.organization_members` — the merchants and
-- the people already exist there, and a merchant who already has a Krafta
-- account must never be asked to create a second one. Every tenant-scoped
-- table carries `org_id uuid not null references public.organizations(id)`,
-- denormalised onto child rows (the same one-hop-RLS pattern `commerce` uses)
-- so a policy never has to walk a chain of parents.
--
-- Denormalising org_id is only safe if the row cannot LIE about it. Two
-- independent single-column foreign keys — `org_id -> organizations` and
-- `agent_id -> agents` — are each validated in isolation, so nothing would
-- reject `(org_id = A, agent_id = <org B's agent>)`. A3's policies are about to
-- trust that column, so a lying row would pass RLS inside the attacker's org
-- and then reach the victim's data through the parent pointer. Every parent
-- here therefore carries a tenant-qualified unique key — `unique (id, org_id)`,
-- and `unique (id, agent_id)` where the tighter pin is possible — and every
-- child references the PAIR. The tenant travels with the pointer.
--
-- Two consequences worth knowing before you debug something:
--   * MATCH SIMPLE is the default, so a composite FK is NOT checked when any of
--     its columns is null. That is exactly the intended hole: a document with
--     `agent_id is null` is the org-wide document, and `live_version_id is null`
--     is the never-published agent.
--   * PostgREST resolves embeds by constraint. There is no composite-FK
--     precedent in this repo; if the console's `select=*,conversations(*)` ever
--     complains about ambiguity, disambiguate with the constraint NAME. Do not
--     "fix" it by dropping back to a single-column foreign key.
--
-- Additionally, `org_id` is immutable on every table (`agent.freeze_org_id()`).
-- A forgotten `WITH CHECK` in A3 would otherwise let a member re-parent a row —
-- a customer transcript or a knowledge passage — into another organisation.
--
-- A table in this schema with no path to an organisation is a bug, not a
-- convenience.
--
-- RLS IS ON. THE POLICIES ARE TICKET A3. A3 IS NOT OPTIONAL.
-- ----------------------------------------------------------
-- Every table below ends with `enable row level security` and carries no
-- policy. In Postgres that is deny-by-default: with RLS enabled and zero
-- permissive policies, `anon` and `authenticated` can read and write NOTHING
-- here. That is the correct state to ship an empty schema in, and it is also a
-- state in which the console does not work. A3 adds the membership-scoped
-- policies AND the `authenticated` table grants (a policy does not imply a
-- grant; both are required). Until A3 lands, only `service_role` — which
-- bypasses RLS — can touch these tables.
--
-- A3 MUST NOT GRANT UNIFORMLY. The read/write surface is not the same per
-- table, and guessing it wrong is what lets a tenant write its own passing
-- verification run or its own bill:
--
--   TABLE                          authenticated (console, within its org)
--   -----------------------------  ---------------------------------------
--   agents                         select, insert, update
--   agent_versions                 select, insert, update  (drafts only)
--   documents                      select, insert, update, delete
--   integrations                   select, insert, update, delete
--   approvals                      select, update           (decide only)
--   -----------------------------  ---------------------------------------
--   conversations                  SELECT ONLY   <- a tenant that can insert
--   messages                       SELECT ONLY      here writes its own bill
--   doc_chunks                     SELECT ONLY
--   message_citations              SELECT ONLY
--   verification_runs              SELECT ONLY   <- a tenant that can insert
--   verification_results           SELECT ONLY      here publishes an agent
--   audit_log                      SELECT ONLY      that was never graded
--
-- A3's required test: a member of org A can neither read nor write org B's
-- rows, AND a member of org A cannot insert a verification_runs row at all.
--
-- POSTGREST DOES NOT LEARN ABOUT THIS SCHEMA FROM A MIGRATION
-- -----------------------------------------------------------
-- Exposed schemas are a per-project PostgREST setting stored outside the
-- database. Applying this file does not expose `agent`, and every PostgREST
-- call will answer `Invalid schema: agent` until someone patches the project:
--
--   PATCH https://api.supabase.com/v1/projects/<ref>/postgrest
--   { "db_schema": "public,graphql_public,commerce,payments,agent" }
--
-- Send the FULL list — the field is replaced, not merged, so omitting
-- `commerce` there takes the storefront down. This is exactly how `commerce`
-- broke in June. Patch the dev branch (hpbguvxcqyppgyinzmus) first; prod
-- (hlmcoirjaydrfqcmnuun) only after the console is proven against dev.
--
-- `supabase/config.toml` has been updated to list `agent` in the same commit.
-- That edit exists ONLY so a future `supabase config push` cannot silently
-- revert the setting — do not use `config push` to apply it, because that file
-- is not a faithful mirror of production auth/storage settings.
--
-- CONVENTIONS FOLLOWED
-- --------------------
--   * `text` + a named CHECK constraint rather than an enum. That is the
--     current house style (`payments.*`, `commerce.api_keys`); it also means a
--     new channel or status is one `alter ... drop/add constraint` instead of
--     an `ALTER TYPE` that cannot run inside every transaction.
--   * `uuid primary key default gen_random_uuid()`, `timestamptz not null
--     default now()`, `created_at` / `updated_at`.
--   * Embeddings are `extensions.halfvec(1536)` with an HNSW cosine index at
--     m=16 / ef_construction=64 — identical to `public.catalog_search_documents`
--     and `public.faq`. Same embedding model, same vector space, so the
--     existing `embed` / `embed_query` edge functions can serve this corpus
--     without a second convention to keep straight.
--   * Money is UZS tiyin: major unit x 100, for every currency, no zero-decimal
--     special case.
--
-- Idempotent throughout (`if not exists`, `create or replace`, drop-then-create
-- for triggers). This database has been bitten by the same migration arriving
-- twice by two different routes; re-running this file is a no-op.

-- ===========================================================================
-- 0. Bounded waits, and a guard against a half-applied earlier draft
-- ===========================================================================
--
-- `public.organizations` is the busiest shared table on this database (196 rows,
-- 35 inbound constraints) and every table below takes SHARE ROW EXCLUSIVE on it
-- to add its foreign key — held until this transaction commits. That lock
-- conflicts with every merchant signup, rename and logo change. Postgres' lock
-- queue is FIFO, so waiting unboundedly in front of it turns a schema-creation
-- migration into a signup outage. Fail fast instead; this file is idempotent,
-- so a timeout costs a retry and nothing else.
--
-- Plain `set`, not `set local`: `set local` outside an explicit transaction
-- block warns and does nothing.
set lock_timeout = '3s';
set statement_timeout = '120s';

-- `create table if not exists` silently accepts a table that already exists
-- with the WRONG shape. If an earlier draft of this schema is installed, half
-- of what follows would be skipped and the tenancy constraints would simply be
-- absent. Refuse instead.
-- `rel` is resolved with to_regclass(), not a `::regclass` cast: the cast is
-- constant-folded at plan time and would raise "relation agent.agents does not
-- exist" on a database where this migration has never run — which is every
-- database it is supposed to run on.
do $$
declare
  rel regclass := to_regclass('agent.agents');
begin
  if rel is not null
     and not exists (
       select 1 from pg_constraint
        where conname = 'agents_id_org_unique'
          and conrelid = rel
     ) then
    raise exception using
      errcode = 'object_not_in_prerequisite_state',
      message = 'agent.agents exists but predates this migration',
      hint = 'An earlier draft of the agent schema is installed. Run supabase/rollback/20260811190000_agent_schema.down.sql first (it destroys all agent.* data — export agent.conversations and agent.audit_log first), then re-apply this file.';
  end if;
end $$;

-- ===========================================================================
-- 1. Schema, grants
-- ===========================================================================

create schema if not exists agent;

comment on schema agent is
  'Krafta AI. Tenant agent configuration, knowledge, conversations, metering, verification and audit. Tenant key is org_id -> public.organizations. Distinct from commerce (merchant orders) and payments (Krafta Pay). PostgREST must be told about this schema separately - see the migration header.';

-- `authenticated` gets USAGE on the schema but no table privileges yet: A3
-- grants exactly what each policy needs, per table, following the matrix in the
-- header. `anon` gets nothing at all — there is no browser path to Krafta AI
-- that is not signed in.
grant usage on schema agent to authenticated, service_role;

-- No blanket DELETE, here or in section 16: the billing rows and the audit log
-- are the only copy of an invoice's backing evidence.
alter default privileges for role postgres in schema agent
  grant select, insert, update on tables to service_role;

-- ===========================================================================
-- 2. Schema-local helpers
-- ===========================================================================
--
-- `public.set_updated_at()` already exists and `commerce` uses it. This schema
-- deliberately defines its own copies instead: the brief is that `agent` must be
-- droppable in one statement without leaving anything behind and without a
-- dependency edge into `public`. Local functions drop with the schema.
--
-- (SQL/plpgsql function BODIES are not tracked in pg_depend, so the calls into
-- `public.uz_cyrl_to_latn` and `extensions.unaccent` inside agent.search_norm()
-- create no hard dependency either — they are resolved at execution time.)

create or replace function agent.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- org_id is the tenant key. Nothing may move a row between organisations.
--
-- This raises rather than silently reverting, because the failure it guards is
-- a row landing in the wrong merchant's console — a mis-tenanted transcript or
-- knowledge passage — and that must be loud. `agent.conversations` has its own,
-- stricter freeze below.
create or replace function agent.freeze_org_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'agent.%: org_id is immutable (% -> %)',
      tg_table_name, old.org_id, new.org_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ONE text space for the keyword leg of retrieval.
--
-- `public.search_normalize` folds accents and case; `public.uz_cyrl_to_latn`
-- bridges Cyrillic to Latin. The catalogue search applies BOTH to the query AND
-- to the index (its fts trigger runs unaccent before to_tsvector). Folding only
-- the query is what guarantees a miss: `to_tsvector('simple','Чёрный чай')`
-- holds 'чёрный' & 'чай' while the normalized query asks for 'cherniy' & 'chay',
-- and the standard Uzbek modifier apostrophe in `oʻzbek` (U+02BB) indexes as one
-- token that no normalized query can ever produce.
--
-- Retrieval MUST call this same function on the query. Both sides, one space.
create or replace function agent.search_norm(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select public.uz_cyrl_to_latn(
           trim(both from lower(extensions.unaccent(coalesce(t, ''))))
         );
$$;

comment on function agent.search_norm(text) is
  'Fold a string into the one text space this schema indexes and queries in: unaccent + lower + trim + Cyrillic->Latin. Index side and query side must both call it.';

-- doc_chunks: keep the searchable projections in step with `content`, and never
-- let a rewritten passage keep the vector that meant the old text.
--
-- Maintained by trigger rather than as generated columns, mirroring
-- `public.catalog_search_documents_set_fts()`. Re-ingest is an upsert on
-- (document_id, chunk_index); without the embedding reset the agent would
-- retrieve on last month's meaning and quote this month's text, and nothing on
-- the row would say so.
create or replace function agent.doc_chunks_maintain()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.content is distinct from old.content then
    new.content_norm := agent.search_norm(new.content);
    new.fts := to_tsvector('pg_catalog.simple'::regconfig, new.content_norm);
  end if;

  if tg_op = 'UPDATE' and new.content is distinct from old.content
     and new.embedding is not distinct from old.embedding then
    new.embedding       := null;
    new.embedding_model := null;
    new.embedded_at     := null;
  end if;

  return new;
end;
$$;

-- Everything about a conversation that decides WHETHER and WHEN it is billed.
-- See the comment block on agent.conversations for why this is a trigger and
-- not a convention.
--
-- It raises only when a value actually DIFFERS. PostgREST and the Supabase
-- client both send the whole row on an update, so a caller resending the same
-- identity still succeeds; a caller genuinely trying to move a billable row
-- gets an error instead of a silent no-op. The silent-revert version of this
-- function meant a mis-tenanted billing row could never be repaired — the fix
-- reported success and changed nothing.
--
-- Repairing a genuinely mis-tenanted row is a deliberate human act:
--   alter table agent.conversations disable trigger trg_conversations_freeze_billing;
--   ... one UPDATE ...
--   alter table agent.conversations enable  trigger trg_conversations_freeze_billing;
create or replace function agent.freeze_conversation_billing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id             is distinct from old.id
     or new.org_id         is distinct from old.org_id
     or new.agent_id       is distinct from old.agent_id
     or new.session_id     is distinct from old.session_id
     or new.origin         is distinct from old.origin
     or new.started_at     is distinct from old.started_at
     or new.billing_period is distinct from old.billing_period then
    raise exception
      'agent.conversations %: identity, origin and billing period are frozen', old.id
      using errcode = 'check_violation';
  end if;

  -- Once a row is on an invoice it is evidence. Nothing about the money moves
  -- again and it can never be re-claimed by a second invoice. Corrections are
  -- credit notes in payments, never edits here.
  if old.invoiced_at is not null then
    new.invoice_id            := old.invoice_id;
    new.invoiced_at           := old.invoiced_at;
    new.countable             := old.countable;
    new.charged_tiyin         := old.charged_tiyin;
    new.unit_price_tiyin      := old.unit_price_tiyin;
    new.price_basis           := old.price_basis;
    new.priced_at             := old.priced_at;
    new.model_cost_tiyin      := old.model_cost_tiyin;
    new.model_cost_usd_micros := old.model_cost_usd_micros;
    new.fx_uzs_per_usd        := old.fx_uzs_per_usd;
  end if;

  return new;
end;
$$;

-- The billing period is a property of WHEN THE CONVERSATION HAPPENED, never of
-- when the row was written. A queued session-start replayed after an outage, a
-- backfill, or a caller computing `date_trunc('month', now())` in UTC (five
-- hours behind Tashkent, so every conversation between 00:00 and 05:00 on the
-- 1st lands in the previous month) would otherwise file revenue into the wrong
-- month — and the freeze above would make it permanent.
--
-- The database owns the stamp. The caller cannot supply it.
create or replace function agent.stamp_conversation_period()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.started_at := coalesce(new.started_at, now());
  new.billing_period :=
    (date_trunc('month', (new.started_at at time zone 'Asia/Tashkent')))::date;
  return new;
end;
$$;

-- Grants do not stop a foreign-key cascade, which runs as the table owner.
create or replace function agent.block_invoiced_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.invoiced_at is not null then
    raise exception using
      errcode = 'restrict_violation',
      message = format('conversation %s is on invoice %s and cannot be deleted',
                       old.id, old.invoice_id);
  end if;
  return old;
end;
$$;

-- "Append-only" was a comment on the audit log, not a constraint. It is the one
-- record that answers "what did your agent do on my behalf"; a log the
-- application can rewrite is not evidence. The only permitted UPDATE is the
-- null-out an ON DELETE SET NULL foreign key performs when the agent or the
-- conversation is removed.
--
-- A deliberate purge (see the org-deletion runbook on agent.conversations)
-- disables this trigger explicitly. That is exactly the right amount of
-- friction.
create or replace function agent.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'agent.audit_log is append-only: delete of id % refused', old.id
      using errcode = 'check_violation';
  end if;

  if new.org_id is distinct from old.org_id
     or new.actor is distinct from old.actor
     or new.actor_kind is distinct from old.actor_kind
     or new.actor_user_id is distinct from old.actor_user_id
     or new.tool is distinct from old.tool
     or new.result is distinct from old.result
     or new.outcome is distinct from old.outcome
     or new.arguments is distinct from old.arguments
     or new.latency_ms is distinct from old.latency_ms
     or new.created_at is distinct from old.created_at
     or (new.agent_id is not null and new.agent_id is distinct from old.agent_id)
     or (new.conversation_id is not null
         and new.conversation_id is distinct from old.conversation_id) then
    raise exception 'agent.audit_log is append-only: update of id % refused', old.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- What the publish gate actually has to compare.
--
-- `agent_versions_one_draft_per_agent` means every console edit is an UPDATE to
-- the SAME draft row with the same id. So "this run graded version v4" is not
-- enough: run verification against v4, all gates green, then rewrite the persona
-- to promise refunds and press Publish — the gate finds a passing run pointing
-- at v4 and ships text nobody graded, with a green "verified" badge vouching
-- for it.
--
-- The digest is over exactly the fields that decide how the agent behaves. The
-- run records the digest it graded; publish requires the two to match.
create or replace function agent.stamp_version_digest()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.config_digest := md5(concat_ws(chr(31),
    new.persona,
    coalesce(new.compiled_prompt, ''),
    coalesce(new.model, ''),
    coalesce(new.reasoning_effort, ''),
    array_to_string(new.languages, ','),
    new.default_language,
    array_to_string(new.tools, ','),
    array_to_string(new.approval_required_tools, ','),
    coalesce(new.hours_text, ''),
    coalesce(new.escalation_contact, ''),
    coalesce(new.escalation_telegram_chat_id, ''),
    new.unconnected_fallback,
    new.settings::text));
  return new;
end;
$$;

-- A rollback target that can change under you is not a rollback target.
create or replace function agent.freeze_published_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.published_at is not null
     and (new.config_digest is distinct from old.config_digest
          or new.published_at is distinct from old.published_at
          or new.version is distinct from old.version) then
    raise exception
      'agent.agent_versions %: a published snapshot is immutable (create a new version instead)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- An approval card lives in the console AND on a manager's phone. Two
-- unguarded `update ... set status = 'approved'` statements both succeed and
-- both callers are told they won, so 80 units of tea leave the inventory
-- instead of 40. The second decider gets a hard error naming who won and where.
create or replace function agent.settle_approval_once()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'approval % already settled as % on % at %',
      old.id, old.status, coalesce(old.decided_surface, 'system'), old.decided_at
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 3. agent.agents — the row read at the start of every conversation
-- ===========================================================================
--
-- THE HOT READ. Session start is on the critical path of every customer
-- conversation: a merchant's customer types "ish vaqtingiz qanday?" and the
-- time between that and the first token includes this lookup.
--
-- THE ADDRESS RESOLVES THE TENANT, NOT THE OTHER WAY ROUND. An inbound Telegram
-- update carries a bot; a widget request carries a publishable key. It does NOT
-- carry an org_id — that is the answer, not the input. So the runtime's read is:
--
--   select * from agent.agents
--    where channel = $1 and channel_ref = $2 and status = 'live'
--
-- served by `agents_channel_ref_global_unique`, one unique index hit that yields
-- org_id. An org-leading index would degrade to a full scan of every live agent
-- on every inbound message (index skip scan is PG18; this is PG17).
--
-- And uniqueness is DATABASE-WIDE, not per organisation. Scoped per org, two
-- merchants can both hold `channel_ref = '@navvat_bot'`: merchant B types
-- merchant A's bot username into their console, A's customers get B's persona,
-- and every transcript for those customers is written with org_id = B, where B
-- reads the phone numbers and complaints through a perfectly correct membership
-- policy. A's console shows nothing. Ownership of a bot still has to be PROVEN
-- at connect time (a getMe call against the token the merchant supplies) — this
-- index is what makes the ambiguity impossible in the data.
--
-- Two further properties are load-bearing:
--
--   1. THIS ROW HOLDS THE LIVE CONFIGURATION, NOT THE DRAFT. Edits from the
--      console go to a draft `agent_versions` row. Publishing copies the draft's
--      typed columns onto this row and stamps `live_version_id`. Rollback copies
--      an older version back. If the console edited this row directly, a
--      merchant halfway through rewriting their persona would be changing what
--      their customers are being told right now.
--   2. THE COLUMNS ARE TYPED AND PRE-COMPOSED. `compiled_prompt` is the finished
--      system prompt, assembled at publish time from persona + hours +
--      escalation + language policy. `languages` and `tools` are text[], not
--      JSON. Session start therefore does no template assembly and no JSON
--      parse. `settings` exists for console-only detail (structured opening
--      hours) that the runtime never has to read.

create table if not exists agent.agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,

  name text not null,
  -- Null when the owner described the agent in their own words instead of
  -- picking a template (the onboarding-agent path). Not a foreign key: templates
  -- are code, shipped with the console, and a template being renamed or retired
  -- must not orphan a live agent.
  template_slug text,

  status text not null default 'draft',
  -- `channel` is the KIND of surface; `channel_ref` is WHICH one (the Telegram
  -- bot username, the widget's publishable key). Empty string rather than null
  -- so the per-org unique index actually applies (null never conflicts with
  -- null); '' is reserved for the `web` channel, where the caller is a signed-in
  -- console session and the org is already known.
  channel text not null default 'web',
  channel_ref text not null default '',

  -- Languages the agent is allowed to answer in. `default_language` applies only
  -- when the incoming message is genuinely ambiguous — a bare "ok", a phone
  -- number, an emoji. Every other message is mirrored per message, not per
  -- session; code-switching mid-conversation is normal in Tashkent.
  languages text[] not null default array['uz']::text[],
  default_language text not null default 'uz',

  -- The owner's brief, verbatim, in the language they wrote it in. Never
  -- translated for display: a Russian paraphrase of an Uzbek persona
  -- misrepresents what the agent actually says to customers.
  persona text not null default '',
  -- The finished system prompt. Composed once at publish, so session start is a
  -- read and not an assembly. Null on an agent that has never been published,
  -- which is why a live agent without one is rejected by a check below.
  compiled_prompt text,

  -- Resolved on session.started, never per turn: prompt caches are keyed per
  -- model, so switching mid-session re-ingests the whole conversation at
  -- uncached prices. Null means the platform default.
  model text,
  reasoning_effort text,

  -- Tools this agent may call, and the subset that must stop at the approval
  -- gate. `approval_required_tools` is configuration and is never model-chosen:
  -- a model that can decide which of its own actions need approval has no
  -- approval gate.
  tools text[] not null default '{}'::text[],
  approval_required_tools text[] not null default '{}'::text[],

  -- Who refunds and complaints go to. Also configuration, never model-chosen.
  escalation_contact text,
  escalation_telegram_chat_id text,

  tone text,
  business_name text,
  -- The opening-hours line the agent quotes, already written the way a customer
  -- should hear it ("09:00-18:00 - dushanba-shanba"). The structured form lives
  -- in `settings` for the console to edit; keeping the quotable string here is
  -- what keeps a JSON parse off the session-start path.
  hours_text text,
  -- What the agent does about a question it needs an unconnected integration to
  -- answer: hand it to a person, or say plainly that it does not know. Never
  -- "guess" — a wrong stock answer costs the merchant a customer.
  unconnected_fallback text not null default 'escalate',

  -- Console-only detail. Nothing the runtime reads at session start belongs
  -- here; if the runtime starts needing a key out of this blob, promote it to a
  -- column instead. NEVER a secret: integration credentials live in
  -- agent.integrations.secret_ref, because this column is readable by every
  -- console reader the moment A3 grants SELECT.
  settings jsonb not null default '{}'::jsonb,

  -- Both are set by the publish path. FKs added in section 15 (mutual
  -- reference with agent_versions), pinned to THIS agent.
  live_version_id uuid,
  draft_version_id uuid,

  last_verified_at timestamptz,
  last_verification_run_id uuid,
  published_at timestamptz,

  -- auth.users, no FK. See the header: exactly one outward FK is permitted.
  created_by uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The tenant-qualified key every child references. See the header.
  constraint agents_id_org_unique unique (id, org_id),

  constraint agents_status_check
    check (status in ('draft', 'live', 'paused', 'archived')),
  constraint agents_channel_check
    check (channel in ('web', 'telegram', 'widget')),
  constraint agents_reasoning_effort_check
    check (reasoning_effort is null or reasoning_effort in ('low', 'medium', 'high')),
  constraint agents_unconnected_fallback_check
    check (unconnected_fallback in ('escalate', 'admit')),
  constraint agents_languages_check
    check (cardinality(languages) > 0),
  constraint agents_languages_values_check
    check (languages <@ array['uz', 'ru', 'en']::text[]),
  constraint agents_default_language_check
    check (default_language = any (languages)),
  -- A live agent with no compiled prompt would resolve to an empty persona and
  -- answer a real customer as a generic assistant under the merchant's name.
  constraint agents_live_needs_prompt_check
    check (status <> 'live' or compiled_prompt is not null),
  -- A live telegram/widget agent with no address is unreachable: inbound traffic
  -- is matched on channel_ref, so there is nothing to match. `web` is exempt —
  -- its caller is a signed-in console session that already carries the org.
  constraint agents_live_needs_channel_ref_check
    check (status <> 'live' or channel = 'web' or length(channel_ref) > 0)
);

comment on table agent.agents is
  'One AI agent belonging to one organisation. Holds the LIVE configuration; drafts live in agent.agent_versions. Read once per conversation at session start - keep it one indexed read of typed columns.';

comment on column agent.agents.channel_ref is
  'The inbound address: Telegram bot username, widget publishable key. Globally unique among non-archived agents, because inbound traffic carries this and not an org id - it must resolve to exactly one tenant.';

comment on column agent.agents.compiled_prompt is
  'The finished system prompt, composed at publish time. Session start reads it as-is: no template assembly, no JSON parse on the critical path.';

comment on column agent.agents.approval_required_tools is
  'Tools that must stop at the approval gate. Configuration, never model-chosen.';

comment on column agent.agents.settings is
  'Console-only detail. Never a secret and never anything the runtime reads at session start.';

-- THE session-start index. Database-wide, so an address resolves one tenant.
-- Scoped to non-archived (not to live) so the console can refuse a duplicate at
-- CONNECT time with "this bot is already connected to another Krafta account",
-- rather than failing at publish.
create unique index if not exists agents_channel_ref_global_unique
  on agent.agents (channel, channel_ref)
  where channel_ref <> '' and status <> 'archived';

-- The per-org guarantee, which also governs the `channel_ref = ''` web case:
-- one live web agent per organisation.
create unique index if not exists agents_live_channel_unique
  on agent.agents (org_id, channel, channel_ref)
  where status = 'live';

-- The console's agent list, and resolving a paused or draft agent in preview.
create index if not exists agents_org_status_idx
  on agent.agents (org_id, status);

create index if not exists agents_org_created_idx
  on agent.agents (org_id, created_at desc);

drop trigger if exists trg_agents_freeze_org_id on agent.agents;
create trigger trg_agents_freeze_org_id
  before update on agent.agents
  for each row execute function agent.freeze_org_id();

drop trigger if exists trg_agents_set_updated_at on agent.agents;
create trigger trg_agents_set_updated_at
  before update on agent.agents
  for each row execute function agent.set_updated_at();

alter table agent.agents enable row level security;

-- ===========================================================================
-- 4. agent.agent_versions — drafts, publishes, rollbacks
-- ===========================================================================
--
-- An immutable snapshot of everything that decides how the agent behaves. Three
-- jobs, and each one needs the snapshot to be complete rather than a diff:
--
--   * DRAFT. `published_at is null` is the working copy the console edits and
--     the preview screen runs against. A merchant rewriting their persona is
--     not changing what their customers currently hear.
--   * PUBLISH. Copies these columns onto agent.agents and stamps
--     `live_version_id`. The gate is `run.status = 'passed'
--     AND run.agent_version_id = v.id AND run.graded_digest = v.config_digest`.
--     All three, because the draft row is edited IN PLACE — see
--     agent.stamp_version_digest().
--   * ROLLBACK. Copies an older row back. That only works if the row carries
--     the full configuration, which is why every field is duplicated here rather
--     than referenced — and why a published row is frozen by trigger.

create table if not exists agent.agent_versions (
  id uuid primary key default gen_random_uuid(),
  -- Denormalised from the parent so a membership policy is one hop. The
  -- composite foreign key below is what makes that denormalisation honest.
  org_id uuid not null references public.organizations (id) on delete cascade,
  agent_id uuid not null,

  -- Monotonic per agent. This is the number a merchant says out loud ("roll back
  -- to 3"), so it is a small integer and not a hash.
  version integer not null,

  name text not null,
  template_slug text,
  channel text not null,
  channel_ref text not null default '',
  languages text[] not null,
  default_language text not null,
  persona text not null default '',
  compiled_prompt text,
  model text,
  reasoning_effort text,
  tools text[] not null default '{}'::text[],
  approval_required_tools text[] not null default '{}'::text[],
  escalation_contact text,
  escalation_telegram_chat_id text,
  tone text,
  business_name text,
  hours_text text,
  unconnected_fallback text not null default 'escalate',
  settings jsonb not null default '{}'::jsonb,

  -- md5 over exactly the behaviour-deciding fields, stamped on every write. The
  -- publish gate compares it with verification_runs.graded_digest.
  config_digest text,

  -- The verification run that cleared this exact snapshot. FK added in section
  -- 15. Null on a draft and on any version published before verification
  -- existed; the publish gate reads it, so null means "not cleared".
  verification_run_id uuid,

  -- Null while this is the working draft. Non-null makes the row immutable, by
  -- trigger — a rollback target that changed under you is not a rollback target.
  published_at timestamptz,
  published_by uuid,
  -- Free text the merchant can leave for their future self ("added delivery
  -- zones").
  note text,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint agent_versions_id_org_unique unique (id, org_id),
  constraint agent_versions_id_agent_unique unique (id, agent_id),

  -- The tenant travels with the pointer: a version cannot claim org A while
  -- belonging to org B's agent. Without this, a member of A inserts a draft
  -- against B's live agent, `agent_versions_one_draft_per_agent` makes it B's
  -- ONLY draft, and B's next Publish ships a stranger's persona and escalation
  -- chat id to B's customers.
  foreign key (agent_id, org_id) references agent.agents (id, org_id)
    on delete cascade,

  constraint agent_versions_version_check check (version > 0),
  constraint agent_versions_channel_check
    check (channel in ('web', 'telegram', 'widget')),
  constraint agent_versions_languages_check check (cardinality(languages) > 0),
  constraint agent_versions_languages_values_check
    check (languages <@ array['uz', 'ru', 'en']::text[]),
  constraint agent_versions_unconnected_fallback_check
    check (unconnected_fallback in ('escalate', 'admit')),
  -- Publishing a snapshot with no prompt would put a generic assistant in front
  -- of customers under the merchant's name.
  constraint agent_versions_published_needs_prompt_check
    check (published_at is null or compiled_prompt is not null)
);

comment on table agent.agent_versions is
  'Immutable snapshot of an agent configuration. published_at null = the working draft the console edits and preview runs against. Rollback copies a row back onto agent.agents, which is why every field is duplicated rather than referenced.';

comment on column agent.agent_versions.config_digest is
  'md5 of the behaviour-deciding fields, stamped on every write. Publish requires verification_runs.graded_digest to equal this - the draft row is edited in place, so "a passing run for this version id" is not enough.';

-- Version numbers are per agent and must not collide: two rows numbered 4 make
-- "roll back to 4" ambiguous.
create unique index if not exists agent_versions_agent_version_unique
  on agent.agent_versions (agent_id, version);

-- One working draft per agent. Without this, two console tabs produce two
-- drafts and the second publish silently discards the first one's edits.
create unique index if not exists agent_versions_one_draft_per_agent
  on agent.agent_versions (agent_id)
  where published_at is null;

-- The version history panel.
create index if not exists agent_versions_agent_published_idx
  on agent.agent_versions (agent_id, published_at desc nulls first);

create index if not exists agent_versions_org_idx
  on agent.agent_versions (org_id);

-- Behind the ON DELETE SET NULL foreign key added in section 15: without it,
-- pruning a verification run sequentially scans this table while holding locks.
-- Leads with the referencing pair so it also serves the composite FK check.
create index if not exists agent_versions_verification_run_idx
  on agent.agent_versions (verification_run_id, agent_id)
  where verification_run_id is not null;

drop trigger if exists trg_agent_versions_digest on agent.agent_versions;
create trigger trg_agent_versions_digest
  before insert or update on agent.agent_versions
  for each row execute function agent.stamp_version_digest();

drop trigger if exists trg_agent_versions_freeze_org_id on agent.agent_versions;
create trigger trg_agent_versions_freeze_org_id
  before update on agent.agent_versions
  for each row execute function agent.freeze_org_id();

-- BEFORE row triggers fire in NAME order, so `..._digest` has already run and
-- this compares a freshly computed config_digest against the stored one. Do not
-- rename either trigger without re-checking that ordering.
drop trigger if exists trg_agent_versions_freeze_published on agent.agent_versions;
create trigger trg_agent_versions_freeze_published
  before update on agent.agent_versions
  for each row execute function agent.freeze_published_version();

drop trigger if exists trg_agent_versions_set_updated_at on agent.agent_versions;
create trigger trg_agent_versions_set_updated_at
  before update on agent.agent_versions
  for each row execute function agent.set_updated_at();

alter table agent.agent_versions enable row level security;

-- ===========================================================================
-- 5. agent.documents — what the agent is allowed to know
-- ===========================================================================
--
-- Treated as a cold start on purpose. The original design assumed venues
-- already have FAQ content somewhere in this database; they do not
-- (`public.faq` has no organisation column and nothing reads it). Upload is the
-- first-class path, so this table is shaped around a file a merchant sends us,
-- not around content we hope to find.
--
-- IDEMPOTENCY IS KEYED ON WHAT IS KNOWN AT INSERT. The row is written before
-- extraction runs (`status` defaults to 'pending' and the ingestion worker scans
-- for it), so the sha256 of the EXTRACTED TEXT cannot be the dedup key — it does
-- not exist yet, and a placeholder makes the unique index decorative. The keys
-- are the raw file hash, the source URL and the storage path: all three are
-- known at upload. `content_hash` is a CHANGE DETECTOR, not a key — when a
-- re-ingest of the same source produces a different hash, the old row goes to
-- 'superseded' and its chunks to `retrievable = false` in the same transaction,
-- so a merchant who re-uploads their price list after raising prices does not
-- end up with the agent quoting both.

create table if not exists agent.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Null means the whole organisation's agents may retrieve it. Set means this
  -- document belongs to one agent (an HR handbook the customer-facing agent
  -- must never quote). MATCH SIMPLE leaves the composite FK unchecked when this
  -- is null, which is precisely the org-wide case.
  agent_id uuid,

  title text not null,
  -- 'upload' | 'url' | 'catalogue' | 'manual'. Where the text came from, which
  -- is what a citation has to name for the merchant to trust it.
  source text not null default 'upload',
  storage_path text,
  source_url text,
  mime_type text,
  byte_size bigint,
  -- Primary language of the document. Chunks carry their own; this is the
  -- fallback and what the console shows. The SCRIPT subtag matters: a uz-Cyrl
  -- file has to be transliterated at index time and the console should be able
  -- to tell the merchant their file is in a script their agent does not write.
  lang text,

  -- sha256 of the RAW BYTES. Known at upload, so this is a real dedup key.
  file_hash text,
  -- sha256 of the EXTRACTED TEXT. Null until extraction finishes. A change
  -- detector for re-ingest, deliberately NOT unique: two different files may
  -- legitimately extract to the same text, and a 23505 in the middle of
  -- ingestion is a worse outcome than a duplicate the supersede path handles.
  content_hash text,

  status text not null default 'pending',
  -- Set when this row replaces an earlier version of the same source.
  supersedes uuid,
  chunk_count integer not null default 0,
  -- Merchant-facing failure text ("this PDF is a scan with no text layer"), not
  -- a stack trace.
  error text,
  ingested_at timestamptz,

  uploaded_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint documents_id_org_unique unique (id, org_id),

  foreign key (agent_id, org_id) references agent.agents (id, org_id)
    on delete cascade,
  foreign key (supersedes, org_id) references agent.documents (id, org_id)
    on delete set null (supersedes),

  constraint documents_source_check
    check (source in ('upload', 'url', 'catalogue', 'manual')),
  constraint documents_status_check
    check (status in ('pending', 'processing', 'ready', 'failed', 'superseded')),
  constraint documents_lang_check
    check (lang is null or lang in ('uz-Latn', 'uz-Cyrl', 'ru', 'en')),
  constraint documents_chunk_count_check check (chunk_count >= 0),
  constraint documents_byte_size_check check (byte_size is null or byte_size >= 0)
);

comment on table agent.documents is
  'A source document in a tenant knowledge base. Dedup keys are file_hash / source_url / storage_path - all known at insert. content_hash is the post-extraction change detector that drives supersede, not a key.';

comment on column agent.documents.lang is
  'BCP-47 with a script subtag for Uzbek. uz-Cyrl is what drives index-time transliteration; the agent still answers in uz regardless of which script the source was written in.';

create unique index if not exists documents_org_file_hash_unique
  on agent.documents (org_id, file_hash)
  where file_hash is not null;

create unique index if not exists documents_org_source_url_unique
  on agent.documents (org_id, source_url)
  where source = 'url' and source_url is not null;

create unique index if not exists documents_org_storage_path_unique
  on agent.documents (org_id, storage_path)
  where source = 'upload' and storage_path is not null;

-- Not unique. "Has this text changed since last ingest?"
create index if not exists documents_org_content_hash_idx
  on agent.documents (org_id, content_hash)
  where content_hash is not null;

create index if not exists documents_org_created_idx
  on agent.documents (org_id, created_at desc);

create index if not exists documents_agent_idx
  on agent.documents (agent_id, org_id)
  where agent_id is not null;

-- The ingestion worker's queue scan.
create index if not exists documents_status_idx
  on agent.documents (status)
  where status in ('pending', 'processing');

drop trigger if exists trg_documents_freeze_org_id on agent.documents;
create trigger trg_documents_freeze_org_id
  before update on agent.documents
  for each row execute function agent.freeze_org_id();

drop trigger if exists trg_documents_set_updated_at on agent.documents;
create trigger trg_documents_set_updated_at
  before update on agent.documents
  for each row execute function agent.set_updated_at();

alter table agent.documents enable row level security;

-- ===========================================================================
-- 6. agent.doc_chunks — the retrieval corpus
-- ===========================================================================
--
-- `extensions.halfvec(1536)` with an HNSW cosine index, matching
-- `public.catalog_search_documents` exactly. That is not cosmetic: 3-small and
-- 3-large are different vector spaces, and the existing `embed` /
-- `embed_query` edge functions produce text-embedding-3-large truncated to
-- 1536 dims. Inventing a second dimension here would mean a second embedding
-- pipeline and a corpus that silently cannot be compared with the catalogue's.
--
-- BOTH TENANT FILTERS SIT ON THE SCANNED ROW. `org_id` AND `agent_id` are
-- denormalised from the document. An HNSW scan filtered by a joined column
-- cannot use the index properly, so the per-agent boundary (an HR handbook the
-- customer-facing agent must never quote) has to be a column here, not a join.
-- Written as a join, the filter is correct but the scan is not indexed; written
-- as "top 20 for the org, then filter", the handbook eats the customer FAQ's
-- slots and the agent says it does not know.
--
-- The retrieval predicate is:
--   where org_id = $1 and (agent_id is null or agent_id = $2) and retrievable
--
-- `retrievable` is the gate that makes a half-finished ingest invisible. A
-- 200-page PDF that dies on page 41 leaves chunks 0..40 in this table; without
-- the flag they answer customers forever while the console says the file
-- failed. Ingestion writes `retrievable = false`, deletes the orphan tail
-- (`chunk_index >= new_count`), and flips the flag in the transaction that sets
-- `documents.status = 'ready'`. The ANN and keyword indexes are partial on it,
-- so an unfinished ingest is invisible by construction.
--
-- HNSW AT TENANT SCALE — READ BEFORE THE CORPUS GROWS. This is ONE index over
-- every tenant's chunks with the tenant filter applied on top. pgvector 0.8.0's
-- iterative scan caps at `hnsw.max_scan_tuples` (default 20000): once one tenant
-- is a small fraction of the index, a scan pulls the globally-nearest tuples,
-- finds a handful belonging to the caller, and returns short WITHOUT AN ERROR.
-- The retrieval function must pin all three settings (see below). The real fix
-- is `partition by hash (org_id)` with a per-partition HNSW index, and it is a
-- full table rewrite plus an index rebuild — deliberately deferred for the MVP
-- (zero tenants today, a few hundred chunks each), and it must happen BEFORE
-- this table passes roughly 500k rows. Put a reminder on it.
--
--   perform set_config('hnsw.iterative_scan',  'relaxed_order', true);
--   perform set_config('hnsw.ef_search',       '200',           true);
--   perform set_config('hnsw.max_scan_tuples', '200000',        true);

create table if not exists agent.doc_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  document_id uuid not null,
  -- Denormalised from agent.documents. Null = every agent in the org may
  -- retrieve it. Kept on the chunk for the same reason org_id is: the retrieval
  -- filter must sit on the row the vector index scans, not behind a join. If the
  -- console ever lets a document be re-scoped, propagate the change down here in
  -- the same transaction.
  agent_id uuid,

  chunk_index integer not null,
  content text not null,
  -- agent.search_norm(content). Maintained by trigger, never written by hand.
  -- The keyword and trigram indexes are built on THIS, and retrieval must fold
  -- the query with the same function — see agent.search_norm().
  content_norm text,
  -- Keyword leg of the hybrid. 'simple' (not a language config) because Uzbek
  -- has no Postgres dictionary and the Russian stemmer would mangle it.
  fts tsvector,
  -- Per chunk, not per document: a merchant's price list is routinely Uzbek
  -- headings over Russian body text, and answering in the wrong one is the most
  -- visible way this product can look foreign.
  lang text,
  token_count integer,

  -- Null until the embedding worker fills it, and reset to null by trigger
  -- whenever `content` changes. Retrieval must treat a null embedding as "not
  -- yet searchable by meaning", never as distance 0.
  embedding extensions.halfvec(1536),
  -- Which model produced the vector. The edge functions read
  -- OPENAI_EMBEDDING_MODEL / OPENAI_EMBEDDING_DIMENSIONS from env; one env change
  -- otherwise mixes two vector spaces in one column with no way to find the
  -- stale rows.
  embedding_model text,
  embedded_at timestamptz,

  -- False until the ingest that produced this chunk is complete. See above.
  retrievable boolean not null default false,

  -- Page number, heading path, table name — whatever the citation shown to the
  -- customer needs to name.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint doc_chunks_id_org_unique unique (id, org_id),

  foreign key (document_id, org_id) references agent.documents (id, org_id)
    on delete cascade,
  foreign key (agent_id, org_id) references agent.agents (id, org_id)
    on delete cascade,

  constraint doc_chunks_chunk_index_check check (chunk_index >= 0),
  constraint doc_chunks_content_check check (length(content) > 0),
  constraint doc_chunks_lang_check
    check (lang is null or lang in ('uz-Latn', 'uz-Cyrl', 'ru', 'en'))
);

comment on table agent.doc_chunks is
  'Retrievable passages. org_id AND agent_id are denormalised because an HNSW scan filtered through a join cannot use the index; both tenant filters must sit on the scanned row. Nothing is retrievable until its ingest completed.';

comment on column agent.doc_chunks.embedding is
  'extensions.halfvec(1536) - same model and vector space as public.catalog_search_documents. Do not mix embedding models into this column. Reset to null by trigger when content changes.';

comment on column agent.doc_chunks.content_norm is
  'agent.search_norm(content). The keyword and trigram indexes are built here so the index and the query live in one text space. Trigger-maintained.';

-- Re-ingesting a document replaces its chunks by index; this is what makes that
-- an upsert instead of a duplicate corpus.
create unique index if not exists doc_chunks_document_index_unique
  on agent.doc_chunks (document_id, chunk_index);

-- The retrieval filter, and the composite FK check.
create index if not exists doc_chunks_org_agent_idx
  on agent.doc_chunks (org_id, agent_id)
  where retrievable;

create index if not exists doc_chunks_org_lang_idx
  on agent.doc_chunks (org_id, lang);

create index if not exists doc_chunks_embedding_hnsw
  on agent.doc_chunks
  using hnsw (embedding extensions.halfvec_cosine_ops)
  with (m = '16', ef_construction = '64')
  where retrievable;

create index if not exists doc_chunks_fts_gin
  on agent.doc_chunks using gin (fts)
  where retrievable;

-- Fuzzy/transliteration leg. On content_norm, not content: word_similarity of a
-- normalized query against RAW content is 0.0 for the house query shape, so an
-- index on raw content is pure cost that can never fire.
create index if not exists doc_chunks_norm_trgm_gin
  on agent.doc_chunks using gin (content_norm extensions.gin_trgm_ops)
  where retrievable;

-- The embedding worker's queue scan. Without it, "what still needs embedding?"
-- is a sequential scan of the whole corpus on every tick.
create index if not exists doc_chunks_pending_embedding_idx
  on agent.doc_chunks (created_at)
  where embedding is null;

-- The resume scan for a re-embed campaign when the model changes.
create index if not exists doc_chunks_embedding_model_idx
  on agent.doc_chunks (embedding_model)
  where embedding is not null;

drop trigger if exists trg_doc_chunks_freeze_org_id on agent.doc_chunks;
create trigger trg_doc_chunks_freeze_org_id
  before update on agent.doc_chunks
  for each row execute function agent.freeze_org_id();

drop trigger if exists trg_doc_chunks_maintain on agent.doc_chunks;
create trigger trg_doc_chunks_maintain
  before insert or update on agent.doc_chunks
  for each row execute function agent.doc_chunks_maintain();

alter table agent.doc_chunks enable row level security;

-- ===========================================================================
-- 7. agent.conversations — the billing row
-- ===========================================================================
--
-- Krafta AI bills per conversation handled. This table IS the count: there is
-- no separate counter to reconcile against, because a counter and a log
-- disagreeing is how a merchant ends up disputing a bill nobody can explain.
--
-- COUNTING EXACTLY ONCE, WITH A LIFECYCLE.
-- A session can span days, be resumed after a deploy, and be re-established by
-- a client that lost its socket. But on Telegram — the flagship channel — the
-- natural session identity is the chat, and the same customer keeps it forever.
-- An unconditional `unique (agent_id, session_id)` would therefore bill a
-- returning customer once, EVER: a tea shop whose 200 regulars message monthly
-- bills 200 conversations in month one and near zero afterwards, while every
-- later conversation's model cost keeps landing on the August row and turns
-- August's margin negative months after the invoice was paid.
--
-- So uniqueness is scoped to OPEN conversations:
--
--   1. `conversations_open_session_unique (agent_id, session_id) where
--      ended_at is null`. Resume finds the open row; a closed session lets the
--      next exchange open a new billable row. The runtime resolves with
--      `... and ended_at is null` and inserts otherwise. org_id is deliberately
--      NOT in the key — agent_id already determines the organisation.
--   2. Closing is a first-class, sweepable event. `ended_at` is tied to `status`
--      by check, and `conversations_stale_open_idx` is the idle sweeper's scan.
--      THE IDLE WINDOW IS THE PRICE — whatever the sweeper uses, write it down
--      next to the sweeper.
--   3. `billing_period` is derived from `started_at` by trigger, in Tashkent
--      time, and frozen. A conversation spanning 31 Aug -> 2 Sept stays in
--      exactly one period; a row written by a retry in September still bills in
--      August.
--
-- WHAT A ROW COST AND WHY IT COST THAT.
-- `charged_tiyin = 0` used to mean three different things — "included in the
-- plan", "not billable", and "the pricing job never ran" — with opposite money
-- meanings. `priced_at` + `price_basis` + `unit_price_tiyin` separate them, and
-- put the rate on the row so a period total is reproducible after the price
-- list changes. The console's 418 / 200 / 218 / 43 600 so'm is four aggregates
-- over these columns and needs no plan-history table at all.
--
-- `countable` is NOT the console's "billable" number. `countable` means the
-- session produced a handled conversation (418). The console's billable figure
-- is the overage above the plan allowance (218) and comes from
-- `price_basis = 'overage'`. Charging the countable count would bill 83 600
-- so'm instead of 43 600 — roughly double, matching on both screens, wrong in
-- the same direction on both.
--
-- MARGIN IS QUERYABLE, AND EVERY ROW IS INSPECTABLE.
-- `charged_tiyin` and `model_cost_tiyin` sit side by side, so per-tenant margin
-- is one subtraction over one index. `model_cost_usd_micros` keeps the figure
-- OpenAI actually billed, and `fx_uzs_per_usd` keeps the rate used to convert
-- it — required by check whenever the USD figure is non-zero, because a cost
-- with no rate is unauditable three years later.
--
-- WHY DELETION IS BLOCKED IN THREE PLACES.
--   * `agent_id` is ON DELETE RESTRICT. Deleting an agent that has ever handled
--     a conversation must fail; the console sets `status = 'archived'`. Cascade
--     would erase the month's invoice evidence AND free the session keys, so a
--     recreated agent counts the same live sessions a second time. Precedent:
--     `payments.subscriptions.plan_id`.
--   * `org_id` is ON DELETE RESTRICT. An org delete now fails with a foreign-key
--     violation while conversations exist. That is deliberate: offboarding a
--     merchant must not silently destroy the month's charges. The purge order is
--     export both evidence tables, then
--       alter table agent.audit_log disable trigger trg_audit_log_append_only;
--       delete from agent.audit_log     where org_id = $1;
--       alter table agent.audit_log enable  trigger trg_audit_log_append_only;
--       delete from agent.messages      where org_id = $1;
--       delete from agent.conversations where org_id = $1;   -- fails if invoiced
--       delete from public.organizations where id = $1;
--     (The rollback in apps/krafta-pay/src/lib/merchant-account.ts is
--     unaffected: a brand-new org has no agent rows.)
--   * `service_role` has no DELETE on this table (section 16) and an invoiced
--     row refuses deletion by trigger even from the owner.

create table if not exists agent.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete restrict,
  agent_id uuid not null,
  -- Which published snapshot answered. Set null on delete so a rolled-back
  -- version does not erase the record of what a customer was told; pinned to
  -- the same agent so "which version is live" is always answerable.
  agent_version_id uuid,

  -- The eve session id. The dedup key; see the block above.
  session_id text not null,

  -- Who produced this conversation. A merchant getting their persona right in
  -- the Preview screen must not receive an invoice for trying the product, and
  -- the Usage screen's conversation count and resolved rate must not be
  -- inflated by their own testing.
  origin text not null default 'customer',

  channel text not null,
  channel_ref text not null default '',
  -- Telegram chat id, widget visitor id. An end-customer identifier, not a
  -- Krafta user: never joined to auth.users, and safe to hash before storing.
  external_user_id text,
  locale text,

  status text not null default 'open',
  -- Who it was escalated to, copied from configuration at the moment of
  -- handoff so a later config change does not rewrite history.
  escalated_to text,

  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  ended_at timestamptz,

  message_count integer not null default 0,
  input_tokens bigint not null default 0,
  cached_input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  model text,

  -- The billing period this conversation belongs to, forever. First day of the
  -- month, Tashkent. Derived from started_at by trigger, frozen by trigger.
  -- Never supplied by the caller and never recomputed.
  billing_period date not null
    default (date_trunc('month', (now() at time zone 'Asia/Tashkent')))::date,

  -- The session produced a handled conversation. NOT the console's "billable"
  -- number — see the block above. False for a session that opened and produced
  -- no answer; the row still exists (deleting it would let the same session be
  -- counted again later), it simply is not counted.
  countable boolean not null default true,

  -- Pricing. Null priced_at means the pricing job has not touched this row yet,
  -- which is a DIFFERENT state from "included in the plan".
  priced_at timestamptz,
  unit_price_tiyin bigint,
  price_basis text,

  -- UZS tiyin: major unit x 100.
  charged_tiyin bigint not null default 0,
  model_cost_tiyin bigint not null default 0,
  -- What the provider actually billed, in USD millionths, plus the rate used to
  -- reach the tiyin figure above. Keeps the conversion auditable after the rate
  -- moves.
  model_cost_usd_micros bigint not null default 0,
  fx_uzs_per_usd numeric,

  -- Soft reference to payments.invoices. Intentionally NOT a foreign key: this
  -- schema keeps exactly one outward FK (organizations) so it stays droppable,
  -- and Krafta AI must never be able to block a payments migration.
  --
  -- `invoiced_at` is the CLAIM. The invoicer runs
  --   update ... set invoice_id = $1, invoiced_at = now()
  --    where org_id = $2 and billing_period = $3 and invoiced_at is null
  --    returning id;
  -- so a re-run after a crash claims nothing and cannot put the same
  -- conversation on two invoices.
  invoice_id uuid,
  invoiced_at timestamptz,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint conversations_id_org_unique unique (id, org_id),

  foreign key (agent_id, org_id) references agent.agents (id, org_id)
    on delete restrict,
  foreign key (agent_version_id, agent_id)
    references agent.agent_versions (id, agent_id)
    on delete set null (agent_version_id),

  constraint conversations_origin_check
    check (origin in ('customer', 'preview', 'verification')),
  -- A preview insert that forgets `countable = false` fails loudly at write
  -- time instead of quietly appearing on an invoice.
  constraint conversations_countable_origin_check
    check (not countable or origin = 'customer'),

  constraint conversations_status_check
    check (status in ('open', 'resolved', 'escalated', 'abandoned', 'blocked')),
  constraint conversations_channel_check
    check (channel in ('web', 'telegram', 'widget')),

  -- `not null` does not mean non-empty, and '' is exactly what a runtime writes
  -- when it cannot resolve a session id. The first blank row would otherwise own
  -- (agent_id, '') and every later anonymous visitor would either error out
  -- (messages dropped, nothing billed) or, with an upsert, append to one shared
  -- transcript the merchant then reads strangers' phone numbers out of.
  constraint conversations_session_id_check
    check (length(btrim(session_id)) > 0),

  -- Open means live. 'escalated' counts as live: a customer waiting on a human
  -- has not finished. Everything else has an end.
  constraint conversations_open_status_check
    check ((ended_at is null) = (status in ('open', 'escalated'))),
  constraint conversations_ended_at_check
    check (ended_at is null or ended_at >= started_at),
  constraint conversations_last_message_check
    check (last_message_at >= started_at),

  -- Enforced against started_at, not merely "is a first of month". `started_at
  -- at time zone 'Asia/Tashkent'` yields a bare timestamp, which pins the
  -- IMMUTABLE date_trunc(text, timestamp) overload — without the explicit
  -- conversion a `date` argument promotes to timestamptz (the preferred datetime
  -- type) and the constraint would depend on the writing session's TimeZone.
  constraint conversations_period_matches_start_check
    check (billing_period
           = (date_trunc('month', (started_at at time zone 'Asia/Tashkent')))::date),

  constraint conversations_price_basis_check
    check (price_basis is null
           or price_basis in ('included', 'overage', 'comp', 'not_countable')),
  constraint conversations_priced_check
    check ((priced_at is null) = (price_basis is null)),
  constraint conversations_priced_needs_price_check
    check (priced_at is null or unit_price_tiyin is not null),
  constraint conversations_unpriced_zero_check
    check (priced_at is not null or charged_tiyin = 0),
  constraint conversations_unit_price_check
    check (unit_price_tiyin is null or unit_price_tiyin >= 0),
  constraint conversations_invoiced_check
    check ((invoiced_at is null) = (invoice_id is null)),

  constraint conversations_message_count_check check (message_count >= 0),
  constraint conversations_tokens_check
    check (input_tokens >= 0 and cached_input_tokens >= 0 and output_tokens >= 0),
  constraint conversations_money_check
    check (charged_tiyin >= 0 and model_cost_tiyin >= 0 and model_cost_usd_micros >= 0),
  constraint conversations_fx_check
    check (fx_uzs_per_usd is null or fx_uzs_per_usd > 0),
  constraint conversations_usd_cost_needs_fx_check
    check (model_cost_usd_micros = 0 or fx_uzs_per_usd is not null)
);

comment on table agent.conversations is
  'One row per conversation handled - this table IS the billable count. One OPEN conversation per (agent_id, session_id); billing_period derived from started_at in Tashkent time and frozen, so a session spanning a month boundary lands in exactly one period.';

comment on column agent.conversations.session_id is
  'The eve session id. Unique among OPEN conversations for an agent - a session resumed after a restart or a deploy finds this row; a closed session lets the next exchange open a new billable one.';

comment on column agent.conversations.countable is
  'The session produced a handled conversation. This is NOT the console''s "billable" number - that is the overage above the plan allowance and comes from price_basis = ''overage''.';

comment on column agent.conversations.price_basis is
  'Why this row cost what it cost: included in the allowance, overage, comped, or not countable. Null means the pricing job has not run - which is not the same as free.';

comment on column agent.conversations.billing_period is
  'First day of the billing month, Asia/Tashkent, derived from started_at by agent.stamp_conversation_period() and frozen by agent.freeze_conversation_billing(). Never supplied by a caller.';

comment on column agent.conversations.model_cost_tiyin is
  'Provider cost in UZS tiyin, next to charged_tiyin so per-tenant margin is one subtraction. model_cost_usd_micros + fx_uzs_per_usd keep the conversion reproducible.';

comment on column agent.conversations.invoiced_at is
  'The invoicing claim. Set together with invoice_id under `where invoiced_at is null`, after which the whole money side of the row is frozen by trigger.';

-- One OPEN conversation per session. The mechanism, not the intention.
create unique index if not exists conversations_open_session_unique
  on agent.conversations (agent_id, session_id)
  where ended_at is null;

-- The idle sweeper's scan, across all tenants.
create index if not exists conversations_stale_open_idx
  on agent.conversations (last_message_at)
  where ended_at is null;

-- The operator's "who is waiting right now" view.
create index if not exists conversations_org_open_idx
  on agent.conversations (org_id, last_message_at desc)
  where ended_at is null;

-- The metering query: count a tenant's handled conversations for a period.
create index if not exists conversations_org_period_countable_idx
  on agent.conversations (org_id, billing_period)
  where countable;

-- The charged count and the per-agent breakdown the usage screen renders.
create index if not exists conversations_org_period_overage_idx
  on agent.conversations (org_id, billing_period, agent_id)
  where price_basis = 'overage';

-- "What did the pricing job miss?" Shrinks to nothing once the month is priced.
create index if not exists conversations_unpriced_idx
  on agent.conversations (billing_period, org_id)
  where priced_at is null;

-- The monthly invoicing sweep: all tenants, one period, not yet claimed. Every
-- other index here leads with org_id, which is the wrong shape for this job on a
-- table that only ever grows.
create index if not exists conversations_period_uninvoiced_idx
  on agent.conversations (billing_period)
  where invoiced_at is null;

create index if not exists conversations_org_started_idx
  on agent.conversations (org_id, started_at desc);

create index if not exists conversations_agent_started_idx
  on agent.conversations (agent_id, started_at desc);

-- Behind the ON DELETE SET NULL foreign key: without it, pruning one old
-- agent_versions row sequentially scans this table — the biggest in the schema
-- and the one every live customer conversation writes to — while holding locks.
create index if not exists conversations_agent_version_idx
  on agent.conversations (agent_version_id, agent_id)
  where agent_version_id is not null;

drop trigger if exists trg_conversations_stamp_period on agent.conversations;
create trigger trg_conversations_stamp_period
  before insert on agent.conversations
  for each row execute function agent.stamp_conversation_period();

drop trigger if exists trg_conversations_block_invoiced_delete on agent.conversations;
create trigger trg_conversations_block_invoiced_delete
  before delete on agent.conversations
  for each row execute function agent.block_invoiced_delete();

drop trigger if exists trg_conversations_freeze_billing on agent.conversations;
create trigger trg_conversations_freeze_billing
  before update on agent.conversations
  for each row execute function agent.freeze_conversation_billing();

drop trigger if exists trg_conversations_set_updated_at on agent.conversations;
create trigger trg_conversations_set_updated_at
  before update on agent.conversations
  for each row execute function agent.set_updated_at();

alter table agent.conversations enable row level security;

-- ===========================================================================
-- 8. agent.messages
-- ===========================================================================
--
-- End-customer content. Treat it as personal data: it contains phone numbers,
-- addresses and order complaints typed by people who are not Krafta's users.
-- Anything that leaves this table for a log, an export or a model evaluation
-- gets redacted first.

create table if not exists agent.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null,

  -- Ordering that survives two messages sharing a timestamp, which streaming
  -- makes routine. The transcript renders by seq, never by created_at.
  seq integer not null,

  -- 'tool' and 'escalation' are turns the console renders as markers rather
  -- than speech bubbles - a tool call is not something anyone said.
  role text not null,
  content text,

  tool_name text,
  -- The one-line human summary of what the tool did ("3 documents matched").
  -- Arguments and results do NOT belong here; they go to audit_log, redacted.
  tool_detail text,
  escalated_to text,

  -- The language this specific message was in. Stored per message because the
  -- policy is per message: a customer who switches to Russian mid-conversation
  -- must be answered in Russian, and this column is how that is auditable.
  lang text,

  model text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint messages_id_org_unique unique (id, org_id),

  foreign key (conversation_id, org_id) references agent.conversations (id, org_id)
    on delete cascade,

  constraint messages_role_check
    check (role in ('user', 'assistant', 'tool', 'system', 'escalation')),
  constraint messages_lang_check
    check (lang is null or lang in ('uz', 'ru', 'en')),
  constraint messages_seq_check check (seq >= 0),
  constraint messages_latency_check check (latency_ms is null or latency_ms >= 0)
);

comment on table agent.messages is
  'Conversation turns. End-customer personal data - redact before exporting. Ordered by seq, not created_at, because streamed turns share timestamps.';

create unique index if not exists messages_conversation_seq_unique
  on agent.messages (conversation_id, seq);

create index if not exists messages_org_created_idx
  on agent.messages (org_id, created_at desc);

drop trigger if exists trg_messages_freeze_org_id on agent.messages;
create trigger trg_messages_freeze_org_id
  before update on agent.messages
  for each row execute function agent.freeze_org_id();

alter table agent.messages enable row level security;

-- ===========================================================================
-- 9. agent.message_citations — which passage produced the answer
-- ===========================================================================
--
-- "Your agent told my customer delivery to Chilonzor is free, it isn't." Without
-- this table there is no way to find which uploaded file said that, so there is
-- no fix to make and the merchant is told to re-check all their documents. It is
-- also what lets a failed verification gate name the source that misled the
-- agent instead of guessing a remediation hint.
--
-- The evidence is SNAPSHOTTED, not joined. A merchant deletes the file and the
-- record of what their agent quoted out of it must survive — that is the whole
-- point of the table.

create table if not exists agent.message_citations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  message_id uuid not null,

  -- Pointers for "jump to source", not the evidence. `document_id` survives the
  -- chunk; `chunk_id` is a bare uuid because doc_chunks is the largest table in
  -- the schema and does not earn a second unique index for this. Always re-filter
  -- a jump-to-source lookup by org_id.
  chunk_id uuid,
  document_id uuid,

  -- The evidence. Snapshotted, because both rows above can go away.
  quoted_text text not null,
  document_title text not null,
  locator text,                     -- 'page 4', 'Yetkazib berish'
  lang text,

  score real,
  rank smallint not null,
  created_at timestamptz not null default now(),

  foreign key (message_id, org_id) references agent.messages (id, org_id)
    on delete cascade,
  foreign key (document_id, org_id) references agent.documents (id, org_id)
    on delete set null (document_id),

  constraint message_citations_rank_check check (rank >= 0)
);

comment on table agent.message_citations is
  'Which passages produced an answer. quoted_text and document_title are snapshots, not joins - the chunk and the document may be deleted and the evidence must survive them.';

create unique index if not exists message_citations_message_rank_unique
  on agent.message_citations (message_id, rank);

create index if not exists message_citations_org_created_idx
  on agent.message_citations (org_id, created_at desc);

create index if not exists message_citations_document_idx
  on agent.message_citations (document_id, org_id)
  where document_id is not null;

create index if not exists message_citations_chunk_idx
  on agent.message_citations (chunk_id)
  where chunk_id is not null;

drop trigger if exists trg_message_citations_freeze_org_id on agent.message_citations;
create trigger trg_message_citations_freeze_org_id
  before update on agent.message_citations
  for each row execute function agent.freeze_org_id();

alter table agent.message_citations enable row level security;

-- ===========================================================================
-- 10. agent.verification_runs
-- ===========================================================================
--
-- The trust mechanism: an agent is proven against the tenant's own
-- configuration before a customer ever talks to it, and publishing is blocked
-- while a gate fails.
--
-- `agent_version_id` AND `graded_digest` are both load-bearing. A run grades ONE
-- snapshot, and because the draft row is edited in place, the version id alone
-- does not identify the text that was graded — see agent.stamp_version_digest().
-- The publish gate must require all three: passed, same version, same digest.
--
-- A3 MUST NOT GRANT `authenticated` INSERT HERE. A tenant that can write its own
-- `status = 'passed', gates_total = 12, gates_passed = 12` row publishes an
-- agent that was never graded, and the console shows 12/12 on the one screen the
-- whole product is built around.

create table if not exists agent.verification_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  agent_id uuid not null,
  -- Which snapshot was graded. Set null on delete so the run survives a version
  -- being pruned, but a publish gate must treat null as "not cleared".
  agent_version_id uuid,
  -- The config_digest of that snapshot at the moment it was graded.
  graded_digest text,

  status text not null default 'queued',

  -- Denormalised because these two numbers are printed on three screens (the
  -- agent card, the detail page, the report) and they must agree. GATES ONLY:
  -- an advisory check is reported but never stands between a merchant and
  -- publishing, so counting soft cases here would make the score mean something
  -- different from what the Publish button does. Soft counts are separate.
  gates_total integer not null default 0,
  gates_passed integer not null default 0,
  soft_total integer not null default 0,
  soft_passed integer not null default 0,

  -- False means the runner was allowed to call side-effecting tools against a
  -- connected system. A verification run that writes to a merchant's real
  -- inventory is worse than no verification, so the safe value is the default
  -- and an unsafe run is visible on the row forever.
  sandboxed boolean not null default true,

  -- 'manual' | 'publish' | 'persona_change' | 'knowledge_change' | 'schedule'
  triggered_by text not null default 'manual',
  triggered_by_user_id uuid,

  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  -- Runner failure (the model was unreachable), as distinct from cases failing.
  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint verification_runs_id_org_unique unique (id, org_id),
  constraint verification_runs_id_agent_unique unique (id, agent_id),

  foreign key (agent_id, org_id) references agent.agents (id, org_id)
    on delete cascade,
  foreign key (agent_version_id, agent_id)
    references agent.agent_versions (id, agent_id)
    on delete set null (agent_version_id),

  constraint verification_runs_status_check
    check (status in ('queued', 'running', 'passed', 'failed', 'error', 'canceled')),
  constraint verification_runs_triggered_by_check
    check (triggered_by in ('manual', 'publish', 'persona_change', 'knowledge_change', 'schedule')),
  constraint verification_runs_counts_check
    check (
      gates_total >= 0 and soft_total >= 0
      and gates_passed between 0 and gates_total
      and soft_passed between 0 and soft_total
    )
);

comment on table agent.verification_runs is
  'One graded run against one agent_versions snapshot. Publish requires status=passed AND agent_version_id=v.id AND graded_digest=v.config_digest. gates_passed/gates_total are gate-only because that is what the Publish button reads.';

comment on column agent.verification_runs.graded_digest is
  'agent_versions.config_digest as it stood when this run graded it. The draft row is edited in place, so without this a merchant can pass verification and then rewrite the persona before publishing.';

comment on column agent.verification_runs.sandboxed is
  'False means the runner could fire side-effecting tools at a connected system. Recorded permanently - a run that wrote to a merchant real inventory must be visible afterwards.';

create index if not exists verification_runs_agent_created_idx
  on agent.verification_runs (agent_id, created_at desc);

create index if not exists verification_runs_org_created_idx
  on agent.verification_runs (org_id, created_at desc);

create index if not exists verification_runs_version_idx
  on agent.verification_runs (agent_version_id, agent_id)
  where agent_version_id is not null;

drop trigger if exists trg_verification_runs_freeze_org_id on agent.verification_runs;
create trigger trg_verification_runs_freeze_org_id
  before update on agent.verification_runs
  for each row execute function agent.freeze_org_id();

drop trigger if exists trg_verification_runs_set_updated_at on agent.verification_runs;
create trigger trg_verification_runs_set_updated_at
  before update on agent.verification_runs
  for each row execute function agent.set_updated_at();

alter table agent.verification_runs enable row level security;

-- ===========================================================================
-- 11. agent.verification_results
-- ===========================================================================
--
-- One row per case per run. The report screen renders straight off this, and a
-- failed gate has to leave as a task the owner can actually do ("no delivery
-- zones on file - upload a document or mark the zones"), never as
-- "verification failed".
--
-- `assertion` and `remediation_hint` are LOCALISED jsonb, unlike
-- `approvals.summary`. They are platform-authored case copy parameterised by the
-- merchant's configuration, and nobody approves a remediation hint — they read
-- an instruction. Storing one language shows an Uzbek-only shop owner a Russian
-- sentence on the exact screen standing between them and going live.
--
-- `prompt` and `response` stay single-language on purpose: they are what was
-- actually said.

create table if not exists agent.verification_results (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  run_id uuid not null,

  -- Stable identifier of the case within its suite ('vc_hours', 'vc_injection').
  -- Cases are template-owned and parameterised by the tenant's configuration,
  -- so the key is what lets two runs be compared; the prompt text may differ
  -- between them because the merchant's hours changed.
  case_key text not null,
  -- Snapshotted, not referenced: the report must still read correctly after the
  -- suite is edited.
  prompt text not null,
  lang text,
  assertion jsonb not null,
  severity text not null,

  passed boolean not null,
  -- What the agent actually said. This is the evidence; without it "failed" is
  -- an assertion the merchant has to take on faith.
  response text,
  tools_called text[] not null default '{}'::text[],
  -- Only on a failure, and written as a task the owner can do, in every language
  -- the console renders in.
  remediation_hint jsonb,
  latency_ms integer,

  created_at timestamptz not null default now(),

  foreign key (run_id, org_id) references agent.verification_runs (id, org_id)
    on delete cascade,

  constraint verification_results_severity_check check (severity in ('gate', 'soft')),
  constraint verification_results_lang_check
    check (lang is null or lang in ('uz', 'ru', 'en')),
  constraint verification_results_assertion_langs_check
    check (assertion ?& array['uz', 'ru', 'en']),
  constraint verification_results_remediation_langs_check
    check (remediation_hint is null or remediation_hint ?& array['uz', 'ru', 'en']),
  constraint verification_results_remediation_check
    check (passed or remediation_hint is not null)
);

comment on table agent.verification_results is
  'One case per run. severity gate blocks publishing; soft is advisory. A failing case must carry remediation_hint - the report renders it as a task, not an error - and both it and assertion are {uz,ru,en} because the merchant reads them in their own language.';

create unique index if not exists verification_results_run_case_unique
  on agent.verification_results (run_id, case_key);

-- "What is blocking publish" - the only query the gate needs.
create index if not exists verification_results_run_failed_gates_idx
  on agent.verification_results (run_id)
  where severity = 'gate' and not passed;

create index if not exists verification_results_org_idx
  on agent.verification_results (org_id);

drop trigger if exists trg_verification_results_freeze_org_id on agent.verification_results;
create trigger trg_verification_results_freeze_org_id
  before update on agent.verification_results
  for each row execute function agent.freeze_org_id();

alter table agent.verification_results enable row level security;

-- ===========================================================================
-- 12. agent.audit_log
-- ===========================================================================
--
-- Every tool call an agent makes, in a form a merchant can read and cite. This
-- is the record that answers "what did it do on my behalf", so:
--
--   * it OUTLIVES ITS SUBJECT. `agent_id` and `conversation_id` are ON DELETE
--     SET NULL and `actor_user_id` has no foreign key, because an audit row that
--     erases who did it when the account is deleted is not an audit row.
--   * it OUTLIVES ITS ORGANISATION'S DELETION. `org_id` is ON DELETE RESTRICT,
--     so offboarding a merchant cannot silently take the trail with it. See the
--     purge runbook on agent.conversations.
--   * it is APPEND-ONLY BY TRIGGER, not by comment. `service_role` has no UPDATE
--     or DELETE here (section 16) and `agent.audit_log_append_only()` refuses
--     anything but the FK null-out even from the owner.
--
-- `arguments` and `result` are REDACTED BEFORE THEY GET HERE. Card
-- numbers, API keys, provider secrets and customer phone numbers must never
-- land in this table - it is the surface most likely to be exported to CSV and
-- mailed around.
--
-- bigint identity rather than uuid, matching payments.logs: append-heavy, never
-- referenced by anything else, and monotonic ids keep the newest-first scan
-- cheap.

create table if not exists agent.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete restrict,
  agent_id uuid,
  conversation_id uuid,

  -- Display string exactly as the log shows it: "customer - Telegram",
  -- "Bakhrom - console", "system - verification". Keep it for display; filter on
  -- the structured pair below, because a format nobody promised to keep stable
  -- is not a filter.
  actor text not null,
  actor_kind text not null default 'system',
  -- auth.users when a person did it. No FK: see above.
  actor_user_id uuid,

  tool text not null,
  -- One human-readable line ("3 documents matched", "Escalated to Dilnoza").
  result text,
  outcome text not null default 'ok',
  latency_ms integer,

  -- Redacted arguments. Never raw.
  arguments jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  foreign key (agent_id, org_id) references agent.agents (id, org_id)
    on delete set null (agent_id),
  foreign key (conversation_id, org_id)
    references agent.conversations (id, org_id)
    on delete set null (conversation_id),

  constraint audit_log_actor_kind_check
    check (actor_kind in ('customer', 'user', 'system')),
  constraint audit_log_outcome_check
    check (outcome in ('ok', 'error', 'denied', 'pending')),
  constraint audit_log_latency_check check (latency_ms is null or latency_ms >= 0)
);

comment on table agent.audit_log is
  'Append-only record of tool calls, enforced by agent.audit_log_append_only(). arguments and result must be redacted by the caller - secrets never reach this table. Survives deletion of the agent and the conversation on purpose, and blocks deletion of the organisation.';

-- The audit screen's default query, and the CSV export's date window.
create index if not exists audit_log_org_created_idx
  on agent.audit_log (org_id, created_at desc);

create index if not exists audit_log_agent_created_idx
  on agent.audit_log (agent_id, created_at desc)
  where agent_id is not null;

-- Filter by tool, then by date.
create index if not exists audit_log_org_tool_created_idx
  on agent.audit_log (org_id, tool, created_at desc);

-- "Who told the agent to do that?" — the first question in any dispute.
create index if not exists audit_log_org_actor_created_idx
  on agent.audit_log (org_id, actor_kind, actor_user_id, created_at desc);

create index if not exists audit_log_conversation_idx
  on agent.audit_log (conversation_id, org_id)
  where conversation_id is not null;

drop trigger if exists trg_audit_log_append_only on agent.audit_log;
create trigger trg_audit_log_append_only
  before update or delete on agent.audit_log
  for each row execute function agent.audit_log_append_only();

alter table agent.audit_log enable row level security;

-- ===========================================================================
-- 13. agent.approvals — the gate in front of anything that changes something
-- ===========================================================================
--
-- Anything that writes, sends, pays, cancels or deletes stops here. The
-- platform rule the runtime is given is that if the gate has not returned, the
-- action has not happened and the agent must not tell the customer it has -
-- which is why `decided_at` and `executed_at` are separate columns. An approval
-- that was granted and then never executed is a real failure mode and has to be
-- visible as one.
--
-- THREE MECHANISMS, ALL IN POSTGRES:
--   * `request_key` stops a retried agent turn from writing 40 units off twice.
--     A deterministic key the caller composes (conversation + turn + tool),
--     unique per agent, so the second insert is rejected rather than surfacing
--     as a second card a manager cheerfully approves. Same claim-first shape as
--     payments.idempotency_keys.
--   * `agent.settle_approval_once()` stops the SAME card being decided twice
--     from two surfaces. The card is pushed to the console and to a manager's
--     phone; without this, two `set status = 'approved'` statements both
--     succeed, both callers are told they won, and 80 units of tea leave the
--     inventory. `delivered_surfaces` records everywhere the card went and
--     `telegram_chat_id` / `telegram_message_id` are the handle needed to kill
--     the losing inline keyboard.
--   * `expires_at` is NOT NULL with a default. A nullable expiry meant a card
--     inserted without one was invisible to the sweep and stayed pending
--     forever, while the customer who asked at 21:00 simply never got an answer.
--
-- `conversation_id` is ON DELETE SET NULL, matching audit_log. The approval
-- holds who authorised a write-off and when; deleting the conversation must not
-- leave the tool call in the audit log with the decision behind it erased.

create table if not exists agent.approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  agent_id uuid not null,
  -- The customer on the other end, waiting.
  conversation_id uuid,

  -- Deterministic per requested action. See the block above.
  request_key text not null,

  tool text not null,
  -- Redacted arguments, same rule as audit_log.
  arguments jsonb not null default '{}'::jsonb,

  -- The sentence a human reads before deciding, written once by the agent at
  -- request time, with the language it was written in alongside it.
  --
  -- This deliberately differs from the console mock, which carries a
  -- {uz,ru,en} record. A destructive action must be described exactly as it
  -- will be executed: paying for three model translations of "write off 40
  -- units of Assam tea" buys a paraphrase that can drift from the action, and
  -- the paraphrase is what the manager approves.
  summary text not null,
  summary_lang text not null default 'uz',
  -- Display name of the requester as the console shows it. Normally derived
  -- from agent_id; kept denormalised so the card still reads correctly after
  -- the agent is renamed.
  requested_by text,

  -- Where the request was RAISED, and everywhere the card was DELIVERED. The
  -- same approval is pushed to Telegram so a manager can answer from their
  -- phone; whoever touches it first wins, and the loser gets a hard error.
  surface text not null default 'console',
  delivered_surfaces text[] not null default '{}'::text[],
  telegram_chat_id text,
  telegram_message_id bigint,

  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  -- An unanswered gate must age out rather than hang forever: a customer
  -- waiting on a pending approval nobody will ever see is worse than a refusal.
  expires_at timestamptz not null default (now() + interval '30 minutes'),

  decided_at timestamptz,
  decided_by uuid,
  decided_surface text,
  decision_note text,

  -- Separate from decided_at on purpose: approved-but-not-executed is a
  -- distinct, real state.
  executed_at timestamptz,
  execution_result text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (agent_id, org_id) references agent.agents (id, org_id)
    on delete cascade,
  foreign key (conversation_id, org_id)
    references agent.conversations (id, org_id)
    on delete set null (conversation_id),

  constraint approvals_surface_check check (surface in ('console', 'telegram')),
  constraint approvals_delivered_surfaces_check
    check (delivered_surfaces <@ array['console', 'telegram']::text[]),
  constraint approvals_decided_surface_check
    check (decided_surface is null or decided_surface in ('console', 'telegram')),
  constraint approvals_status_check
    check (status in ('pending', 'approved', 'rejected', 'expired', 'canceled')),
  -- Anything that left the pending state has a moment it left it. 'canceled'
  -- counts: the agent withdrawing a request is a resolution, and an approvals
  -- list that cannot say when a card disappeared is not an audit trail.
  -- 'expired' is the one exception - `expires_at` already records that moment
  -- and no one decided anything.
  constraint approvals_decided_at_check
    check ((status in ('pending', 'expired')) = (decided_at is null)),
  -- Nothing executes without an approval.
  constraint approvals_executed_check
    check (executed_at is null or status = 'approved')
);

comment on table agent.approvals is
  'Human gate in front of side-effecting tool calls. request_key is unique per agent so a retried turn cannot produce two cards for one action; agent.settle_approval_once() means one card cannot be decided twice from two surfaces. decided_at and executed_at are separate: approved-but-never-executed is a real state.';

comment on column agent.approvals.summary is
  'One sentence in one language, written at request time. Not translated: a manager must approve the action as it will be executed, not a paraphrase of it.';

comment on column agent.approvals.delivered_surfaces is
  'Everywhere this card was pushed. Together with telegram_chat_id/telegram_message_id it is what lets the losing surface be invalidated once someone decides.';

-- The claim. This is the mechanism that makes a duplicate write-off impossible.
create unique index if not exists approvals_request_key_unique
  on agent.approvals (agent_id, request_key);

-- The approvals screen's only query.
create index if not exists approvals_org_pending_idx
  on agent.approvals (org_id, requested_at)
  where status = 'pending';

-- The expiry sweep. Every pending card is now in it.
create index if not exists approvals_expiring_idx
  on agent.approvals (expires_at)
  where status = 'pending';

-- Resolving an inline-keyboard callback back to its card.
create index if not exists approvals_telegram_card_idx
  on agent.approvals (telegram_chat_id, telegram_message_id)
  where telegram_message_id is not null;

create index if not exists approvals_conversation_idx
  on agent.approvals (conversation_id, org_id)
  where conversation_id is not null;

create index if not exists approvals_org_created_idx
  on agent.approvals (org_id, created_at desc);

drop trigger if exists trg_approvals_freeze_org_id on agent.approvals;
create trigger trg_approvals_freeze_org_id
  before update on agent.approvals
  for each row execute function agent.freeze_org_id();

drop trigger if exists trg_approvals_set_updated_at on agent.approvals;
create trigger trg_approvals_set_updated_at
  before update on agent.approvals
  for each row execute function agent.set_updated_at();

drop trigger if exists trg_approvals_settle_once on agent.approvals;
create trigger trg_approvals_settle_once
  before update on agent.approvals
  for each row execute function agent.settle_approval_once();

alter table agent.approvals enable row level security;

-- ===========================================================================
-- 14. agent.integrations — the connection behind a tool
-- ===========================================================================
--
-- `agents.tools` lists tool NAMES. This is the connection each one needs: the 1C
-- endpoint, the Google Sheets id, the Telegram bot, the Krafta catalogue key.
-- The setup wizard already renders a per-integration row with a "Not connected"
-- badge and a Connect button, and the agent detail screen renders
-- `requiredIntegrations` — four of the six shipped templates cannot do the thing
-- the merchant picked them for without this.
--
-- It is NOT `agents.settings`. That blob is console-readable the moment A3
-- grants SELECT, and `payments` already keeps secrets in a dedicated table
-- (`org_provider_account_secrets`) for exactly this reason. `secret_ref` is a
-- pointer into the secret store; the secret itself never lands in this schema.
--
-- Org-scoped, not agent-scoped: a merchant connects 1C once and every agent they
-- own can use it.

create table if not exists agent.integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,

  provider text not null,
  status text not null default 'pending',
  -- Non-secret configuration only: base url, sheet id, bot username.
  config jsonb not null default '{}'::jsonb,
  -- Pointer into the secret store. NEVER the secret.
  secret_ref text,

  connected_at timestamptz,
  last_error text,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint integrations_provider_check
    check (provider in ('1c', 'google_sheets', 'telegram', 'krafta_catalogue', 'krafta_pay')),
  constraint integrations_status_check
    check (status in ('pending', 'connected', 'error', 'revoked'))
);

comment on table agent.integrations is
  'One connection per provider per organisation. config holds non-secret settings only; secret_ref points into the secret store. Never put a token in agent.agents.settings.';

create unique index if not exists integrations_org_provider_unique
  on agent.integrations (org_id, provider);

create index if not exists integrations_org_status_idx
  on agent.integrations (org_id, status);

drop trigger if exists trg_integrations_freeze_org_id on agent.integrations;
create trigger trg_integrations_freeze_org_id
  before update on agent.integrations
  for each row execute function agent.freeze_org_id();

drop trigger if exists trg_integrations_set_updated_at on agent.integrations;
create trigger trg_integrations_set_updated_at
  before update on agent.integrations
  for each row execute function agent.set_updated_at();

alter table agent.integrations enable row level security;

-- ===========================================================================
-- 15. Mutually-referencing foreign keys
-- ===========================================================================
--
-- agents <-> agent_versions and agent_versions -> verification_runs are cycles,
-- so they cannot be declared inline. Added here with the same existence guard
-- the payments migrations use, so re-running this file is a no-op.
--
-- Each one is pinned to the SAME AGENT, not merely to the same organisation:
-- `(live_version_id, id) references agent_versions (id, agent_id)`. These are the
-- columns most likely to be written straight from a console payload — an id the
-- client just rendered — and A3 will grant `authenticated` UPDATE on
-- `agent.agents`. Unpinned, a member of org A could set their own agent's
-- `live_version_id` to a version belonging to org B and then press "restore the
-- live version", copying B's persona, compiled prompt, tool list and escalation
-- Telegram chat id onto their own agent. Pinning to agent_id subsumes the org
-- check and also makes "which version is live" answerable: the version-history
-- panel lists `where agent_id = $1`, and an unpinned pointer would name a row
-- that panel never shows.
--
-- `agent.agents.id` is never null, so MATCH SIMPLE leaves each constraint
-- unchecked exactly when the pointer is null — the intended "never published"
-- state. Column-list ON DELETE SET NULL (PG 15+; this database is 17.6) nulls
-- only the pointer, never the row's own id.

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'agents_live_version_id_fkey'
       and conrelid = 'agent.agents'::regclass
  ) then
    alter table agent.agents
      add constraint agents_live_version_id_fkey
      foreign key (live_version_id, id)
      references agent.agent_versions (id, agent_id)
      on delete set null (live_version_id);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'agents_draft_version_id_fkey'
       and conrelid = 'agent.agents'::regclass
  ) then
    alter table agent.agents
      add constraint agents_draft_version_id_fkey
      foreign key (draft_version_id, id)
      references agent.agent_versions (id, agent_id)
      on delete set null (draft_version_id);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'agents_last_verification_run_id_fkey'
       and conrelid = 'agent.agents'::regclass
  ) then
    alter table agent.agents
      add constraint agents_last_verification_run_id_fkey
      foreign key (last_verification_run_id, id)
      references agent.verification_runs (id, agent_id)
      on delete set null (last_verification_run_id);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'agent_versions_verification_run_id_fkey'
       and conrelid = 'agent.agent_versions'::regclass
  ) then
    alter table agent.agent_versions
      add constraint agent_versions_verification_run_id_fkey
      foreign key (verification_run_id, agent_id)
      references agent.verification_runs (id, agent_id)
      on delete set null (verification_run_id);
  end if;
end $$;

create index if not exists agents_live_version_idx
  on agent.agents (live_version_id, id)
  where live_version_id is not null;

create index if not exists agents_draft_version_idx
  on agent.agents (draft_version_id, id)
  where draft_version_id is not null;

-- Behind the third SET NULL foreign key above.
create index if not exists agents_last_verification_run_idx
  on agent.agents (last_verification_run_id, id)
  where last_verification_run_id is not null;

-- ===========================================================================
-- 16. Grants
-- ===========================================================================
--
-- service_role only. It bypasses RLS, and every writer today is a server-side
-- path that has already resolved the caller's organisation: the eve runtime
-- channel (which derives tenantId from verified route auth, never from a
-- prompt or a tool argument) and the console's server actions.
--
-- But service_role does NOT get to erase the evidence. There is no other copy of
-- `agent.conversations` (the invoice's backing rows) or `agent.audit_log` (what
-- the agent did on the merchant's behalf) anywhere — the rollback file says so
-- itself. A mis-scoped cleanup job or a "clear test data" helper pointed at the
-- wrong org would otherwise turn a merchant's dispute into Krafta's word against
-- theirs. Deletion of those rows is a deliberate human act with the postgres
-- role, following the purge runbook on agent.conversations.

grant select, insert, update, delete on all tables in schema agent to service_role;

revoke delete on agent.conversations, agent.messages from service_role;
revoke update, delete on agent.audit_log from service_role;

-- Runtime-written tables. A3 grants `authenticated` SELECT ONLY on these; the
-- revokes are a no-op today (authenticated holds no table privileges) and exist
-- to record the intent next to the reason. A tenant that can INSERT into
-- verification_runs writes its own passing run and publishes an agent that was
-- never graded; a tenant that can INSERT into conversations writes its own bill.
revoke insert, update, delete on
  agent.conversations, agent.messages, agent.message_citations,
  agent.doc_chunks, agent.verification_runs, agent.verification_results,
  agent.audit_log
from authenticated;
