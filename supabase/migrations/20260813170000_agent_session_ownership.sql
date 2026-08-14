-- Krafta AI — bind every agent session to the business that started it.
--
-- THE HOLE THIS CLOSES
--
-- eve authenticates the CALLER on every request through the channel's auth
-- function, and it does that well. What it never does is authorise the
-- SESSION: the session id travels in the URL, and nothing compares it against
-- whoever is asking. This is not an eve bug — its docs put route authorization
-- on the deployer — but it is easy to miss, because every other layer we built
-- (RLS, membership re-checked per request, 404-never-403) looks like it covers
-- this and does not. Those protect the DATA. This protects the CONVERSATION,
-- which is addressed directly by id and therefore goes around all of them.
--
-- Evidence it is genuinely absent rather than merely undocumented: there is no
-- session-forbidden error code anywhere in eve's compiled output. A framework
-- that rejected the wrong principal would need one.
--
-- Without this, a merchant holding another merchant's session id can attach to
-- it and read that business's conversation with their own customer. Session
-- ids are unguessable, but "hard to guess" is a secret URL, not an access
-- control, and it degrades the moment an id is logged, screenshotted, put in a
-- support ticket, or leaked through a referrer.
--
-- Same class as the cross-tenant media delete closed in prod on 2026-07-29.
-- The lesson recorded there was that an auth fix landing is not evidence a
-- data-isolation hole closed. Hence a table and a check, not an assurance.

set local lock_timeout = '3s';

-- One row per durable agent session. Deliberately narrow: this is a security
-- lookup on the critical path of every single agent request, so it holds the
-- three facts the check needs and nothing else. Conversation content,
-- metering and transcripts live in agent.conversations, which is a different
-- job with a different write pattern.
create table if not exists agent.agent_sessions (
  -- eve's session id, as it appears in the request URL.
  session_id text primary key,

  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Who opened it. Not used for the tenant check — a colleague at the same
  -- business must be able to pick up a conversation — but required to answer
  -- "who did this" during an incident.
  user_id uuid references auth.users (id) on delete set null,

  agent_id uuid,
  -- Verification runs are marked so they can be excluded from any later
  -- reporting without inspecting message content.
  sandboxed boolean not null default false,

  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  foreign key (agent_id, org_id) references agent.agents (id, org_id)
);

comment on table agent.agent_sessions is
  'Binds an eve session id to the business that started it. eve authenticates '
  'the caller but never authorises the session, so this is the only thing '
  'stopping one merchant attaching to another merchant''s conversation.';

create index if not exists agent_sessions_org_idx
  on agent.agent_sessions (org_id, created_at desc);

-- ------------------------------------------------------------- the check ---

-- Called from the channel auth function before eve dispatches anything.
--
-- Returns TRUE when the caller may touch this session. Three outcomes worth
-- separating:
--
--   unknown session  -> true. A session id we have never seen is one being
--                       created right now; the recording hook has not run yet.
--                       Refusing here would break every new conversation.
--                       Safe because an unknown id grants no access to any
--                       EXISTING conversation — the row appears the moment the
--                       session starts, and from then on it is enforced.
--
--   same business    -> true.
--
--   other business   -> false. The caller is told nothing beyond "no".
create or replace function agent.session_belongs_to_org(
  p_session_id text,
  p_org_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select not exists (
    select 1
    from agent.agent_sessions s
    where s.session_id = p_session_id
      and s.org_id is distinct from p_org_id
  );
$$;

comment on function agent.session_belongs_to_org is
  'True unless this session is known to belong to a different business. '
  'Unknown ids pass: they are sessions being created, and they reference no '
  'existing conversation.';

-- ----------------------------------------------------------- the recorder ---

create or replace function agent.record_session_owner(
  p_session_id text,
  p_org_id uuid,
  p_user_id uuid default null,
  p_agent_id uuid default null,
  p_sandboxed boolean default false
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into agent.agent_sessions (
    session_id, org_id, user_id, agent_id, sandboxed
  )
  values (p_session_id, p_org_id, p_user_id, p_agent_id, coalesce(p_sandboxed, false))
  -- The owner is written once and never reassigned. An UPDATE of org_id here
  -- would be the whole vulnerability with extra steps: a second caller could
  -- claim an existing session by starting it again with their own tenant.
  on conflict (session_id) do update
    set last_seen_at = now()
    where agent.agent_sessions.org_id = excluded.org_id;
end;
$$;

comment on function agent.record_session_owner is
  'Records the business that started a session. Ownership is write-once — an '
  'existing row is never reassigned to another org, only touched.';

-- ------------------------------------------------------------------ RLS ---

alter table agent.agent_sessions enable row level security;

-- A business may see its own sessions. Nobody may write through the API;
-- rows come only from the recorder, called by the runtime with the service
-- key. A merchant who could insert here could claim a session id.
drop policy if exists agent_sessions_select on agent.agent_sessions;
create policy agent_sessions_select on agent.agent_sessions for select to authenticated
  using (public.is_org_role(org_id));

grant select on agent.agent_sessions to authenticated;
grant all on agent.agent_sessions to service_role;

revoke all on function agent.session_belongs_to_org(text, uuid) from public;
revoke all on function agent.record_session_owner(text, uuid, uuid, uuid, boolean) from public;
grant execute on function agent.session_belongs_to_org(text, uuid) to service_role;
grant execute on function agent.record_session_owner(text, uuid, uuid, uuid, boolean) to service_role;
