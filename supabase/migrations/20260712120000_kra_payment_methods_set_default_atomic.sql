-- Atomic default-flag flip for payments.payment_methods.
--
-- Bug: persistBindingPaymentMethodForCustomer (packages/payments-core) inserts
-- every newly-bound card with is_default=true and never clears the flag on the
-- customer's other cards. Verified live on dev: binding a second Atmos card
-- left BOTH rows is_default=true simultaneously — any `.eq('is_default', true)
-- .single()` caller breaks, and the Krafta Pay customer portal rendered "По
-- умолчанию" on two cards at once.
--
-- A plain two-step fix (UPDATE others false, then UPDATE target true) from the
-- app is still racy under concurrent binds. This single UPDATE statement is
-- atomic in Postgres regardless of caller — no transaction wrapping needed.
--
-- Applied to the dev branch via MCP; this file is the source of truth for the
-- eventual prod merge.

CREATE OR REPLACE FUNCTION payments.set_default_payment_method(
  p_customer_id uuid,
  p_payment_method_id uuid
) RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = payments, pg_temp
AS $$
  UPDATE payments.payment_methods
  SET is_default = (id = p_payment_method_id)
  WHERE customer_id = p_customer_id
    AND is_default IS DISTINCT FROM (id = p_payment_method_id);
$$;

COMMENT ON FUNCTION payments.set_default_payment_method(uuid, uuid) IS
  'Atomically makes p_payment_method_id the sole is_default=true payment method for p_customer_id in a single UPDATE statement.';

REVOKE ALL ON FUNCTION payments.set_default_payment_method(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payments.set_default_payment_method(uuid, uuid) TO service_role;
