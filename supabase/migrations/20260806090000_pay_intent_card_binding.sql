-- Does this payment need the customer's card kept?
--
-- Every Uzum checkout we register today asks for `operationType: BINDING` —
-- "save this card" — and then charges the saved card in a second, invisible
-- order. For a subscription that is right: renewals have to charge something
-- later. For a one-time payment it is wrong twice over. The customer is shown
-- «Добавить карту» when all they wanted to do was pay, and we keep a card
-- nobody asked us to keep, for a payment that will never recur.
--
-- The adapter cannot safely infer this. "An intent with no invoice" is the
-- discriminator used elsewhere for one-offs, and it is wrong here: the portal
-- card update, all three card-setup flows and platform-fee provisioning have no
-- invoice either, and every one of them MUST bind. So the intent says what it
-- needs, and says it at the moment it is created, where the answer is known.
--
-- DEFAULT 'required' is the load-bearing part. Every existing row and every
-- writer that does not opt in keeps today's behaviour, so this migration
-- changes nothing on its own and needs no backfill. Only three call sites ever
-- pass 'none', and each is a route family that structurally cannot create a
-- subscription. A new flow added tomorrow binds until someone deliberately
-- teaches it otherwise — the safe direction.

alter table payments.payment_intents
  add column if not exists card_binding text not null default 'required';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payment_intents_card_binding_check'
  ) then
    alter table payments.payment_intents
      add constraint payment_intents_card_binding_check
      check (card_binding in ('required', 'none'));
  end if;
end $$;

comment on column payments.payment_intents.card_binding is
  'required = register the provider order as a card binding (subscriptions, card updates). none = a one-off; register a plain payment and keep no card. Defaults to required so anything unrecognised keeps the safer behaviour.';
