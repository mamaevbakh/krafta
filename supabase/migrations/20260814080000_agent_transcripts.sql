-- Krafta AI — write the conversation down.
--
-- `agent.conversations` and `agent.messages` were designed in the first schema
-- migration and nothing has ever written a row to either. That was survivable
-- while the only way to reach an agent was a preview box the merchant was
-- already looking at. It stops being survivable the moment a customer can
-- message the agent on Telegram: work happens, and the merchant cannot see it.
--
-- A merchant's first question about an AI answering their customers is never
-- "how many tokens" — it is "what did it SAY to them". Without a transcript
-- there is no answer, no way to spot the agent being wrong, and no evidence
-- when a customer claims they were promised something.
--
-- This adds one entry point. The runtime calls it per message; it finds or
-- opens the conversation and appends. One round trip, no read-then-write race
-- between concurrent messages on the same session.

set local lock_timeout = '3s';

create or replace function agent.record_message(
  p_org_id uuid,
  p_session_id text,
  p_role text,
  p_agent_id uuid default null,
  p_content text default null,
  p_origin text default 'customer',
  p_channel text default 'web',
  p_channel_ref text default null,
  p_external_user_id text default null,
  p_tool_name text default null,
  p_tool_detail text default null,
  p_escalated_to text default null,
  p_lang text default null,
  p_model text default null,
  p_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_latency_ms integer default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_conversation_id uuid;
  v_seq integer;
  v_now timestamptz := now();
begin
  if p_session_id is null or btrim(p_session_id) = '' then
    return null;
  end if;

  -- Find the conversation for this session, or open one.
  select id into v_conversation_id
  from agent.conversations
  where org_id = p_org_id and session_id = p_session_id;

  if v_conversation_id is null then
    insert into agent.conversations (
      org_id, agent_id, session_id, origin, channel, channel_ref,
      external_user_id, status, started_at, last_message_at,
      message_count, model,
      -- The check constraint requires this to equal the Tashkent month of
      -- started_at. Computed rather than passed in so a caller cannot put a
      -- conversation in the wrong billing period.
      billing_period,
      -- Only a real customer conversation is billable. A merchant testing
      -- their own draft, or a verification run, must never appear on an
      -- invoice — the constraint enforces it, this makes it true.
      countable
    )
    values (
      p_org_id, p_agent_id, p_session_id, p_origin, p_channel, p_channel_ref,
      p_external_user_id, 'open', v_now, v_now,
      0, p_model,
      (date_trunc('month', v_now at time zone 'Asia/Tashkent'))::date,
      p_origin = 'customer'
    )
    -- Two messages can arrive close enough together that both miss the SELECT
    -- above. The unique index on (org_id, session_id) turns the loser into an
    -- update instead of a crash mid-conversation.
    on conflict (org_id, session_id) do update
      set last_message_at = v_now
    returning id into v_conversation_id;
  end if;

  select coalesce(max(seq), -1) + 1 into v_seq
  from agent.messages
  where conversation_id = v_conversation_id;

  insert into agent.messages (
    org_id, conversation_id, seq, role, content,
    tool_name, tool_detail, escalated_to, lang, model,
    input_tokens, output_tokens, latency_ms
  )
  values (
    p_org_id, v_conversation_id, v_seq, p_role, p_content,
    p_tool_name, p_tool_detail, p_escalated_to, p_lang, p_model,
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    p_latency_ms
  );

  update agent.conversations set
    message_count = message_count + 1,
    last_message_at = v_now,
    input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
    output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
    model = coalesce(p_model, model),
    -- An escalation is the single most important thing a merchant can see in
    -- a list of conversations: it is the one where a person is now waiting.
    -- `open_status_check` ties status to ended_at, so 'escalated' keeps
    -- ended_at null — the conversation is still live, just not the agent's
    -- problem any more.
    status = case when p_role = 'escalation' then 'escalated' else status end,
    escalated_to = coalesce(p_escalated_to, escalated_to),
    updated_at = v_now
  where id = v_conversation_id;

  return v_conversation_id;
end;
$$;

comment on function agent.record_message is
  'Appends one message to a business''s conversation, opening it on first '
  'write. The only writer of agent.conversations and agent.messages. Computes '
  'the billing period and countability itself so a caller cannot mis-bill.';

-- One conversation per session, per business. Required by the upsert above and
-- correct on its own: a session IS a conversation.
create unique index if not exists conversations_org_session_uidx
  on agent.conversations (org_id, session_id);

-- The merchant's inbox: newest first, per agent.
create index if not exists conversations_org_agent_recent_idx
  on agent.conversations (org_id, agent_id, last_message_at desc);

-- Reading one thread in order.
create index if not exists messages_conversation_seq_idx
  on agent.messages (conversation_id, seq);

revoke all on function agent.record_message(
  uuid, text, text, uuid, text, text, text, text, text, text, text, text,
  text, text, integer, integer, integer
) from public;
grant execute on function agent.record_message(
  uuid, text, text, uuid, text, text, text, text, text, text, text, text,
  text, text, integer, integer, integer
) to service_role;
