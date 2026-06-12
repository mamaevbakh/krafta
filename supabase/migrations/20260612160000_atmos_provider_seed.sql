-- Register 'atmos' as a payment provider.
--
-- payments.providers is a hard FK target for org_provider_accounts.provider_id,
-- payment_attempts.provider_id, payment_methods.provider_id, and
-- checkout_sessions.selected_provider_id. Without this row, every insert in the
-- Atmos flow (selecting the provider, saving the card token, recording the
-- charge attempt) fails with a foreign-key violation. Seeded here so the
-- provider-independent Phase 0 work and the later Atmos adapter have a valid
-- provider id to reference.
--
-- Atmos is INLINE + SAVE_CARD + RECURRING, unlike Uzum (redirect/binding-first):
-- the card form lives on pay.krafta.uz, the card is saved as a reusable token,
-- and renewals charge that token off-session.

insert into payments.providers (id, display_name, is_active, capabilities)
values (
  'atmos',
  'Atmos',
  true,
  jsonb_build_object(
    'inline', true,
    'save_card', true,
    'recurring', true,
    'currencies', jsonb_build_array('UZS')
  )
)
on conflict (id) do update
  set display_name = excluded.display_name,
      is_active    = excluded.is_active,
      capabilities = excluded.capabilities;
