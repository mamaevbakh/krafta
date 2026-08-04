import { describe, expect, it } from "vitest";

import { synthesizeProviderEventId } from "./webhook";

/**
 * The webhook's idempotency guard keys on `payload.id`. Uzum never sends one —
 * its callback (`AcquiringCallbackData`, Checkout OpenAPI v1.10.3) carries
 * orderId, operationState, operationType, orderNumber, rrn, cardType and
 * merchantOperationId — so the guard never fired once on the only provider that
 * has ever moved money here.
 *
 * That is not a cosmetic gap. `markPaymentFailed` is deliberately ungated, and
 * its comment justifies that by saying duplicate callbacks are "already stopped
 * upstream by the webhook's event-id guard". For Uzum they were not, so one
 * retransmitted decline could walk an invoice toward `uncollectible`.
 */
describe("synthesizeProviderEventId", () => {
  const uzumCallback = (over: Record<string, unknown> = {}) => ({
    orderId: "ord-1",
    operationState: "SUCCESS",
    operationType: "AUTHORIZE",
    orderNumber: "attempt-uuid",
    rrn: "123456789",
    ...over,
  });

  it("gives one id to repeated deliveries of the same event", () => {
    // This is the whole point: Uzum retries a callback when our route 5xxs.
    expect(synthesizeProviderEventId(uzumCallback())).toBe(
      synthesizeProviderEventId(uzumCallback()),
    );
  });

  it("keeps the binding leg and the charge leg distinct", () => {
    // Every Uzum checkout registers two orders today. Collapsing them would
    // drop the charge callback as a duplicate of the binding one and lose a
    // real payment.
    expect(synthesizeProviderEventId(uzumCallback({ orderId: "binding-order" }))).not.toBe(
      synthesizeProviderEventId(uzumCallback({ orderId: "charge-order" })),
    );
  });

  it("keeps success and failure on one order distinct", () => {
    expect(synthesizeProviderEventId(uzumCallback({ operationState: "SUCCESS" }))).not.toBe(
      synthesizeProviderEventId(uzumCallback({ operationState: "FAIL" })),
    );
  });

  it("keeps AUTHORIZE and COMPLETE on one order distinct", () => {
    // A two-step order legitimately reports twice; the second must not be
    // swallowed as a replay of the first.
    expect(synthesizeProviderEventId(uzumCallback({ operationType: "AUTHORIZE" }))).not.toBe(
      synthesizeProviderEventId(uzumCallback({ operationType: "COMPLETE" })),
    );
  });

  it("is case-insensitive on state and operation", () => {
    expect(
      synthesizeProviderEventId(uzumCallback({ operationState: "success" })),
    ).toBe(synthesizeProviderEventId(uzumCallback({ operationState: "SUCCESS" })));
  });

  it("returns null rather than a partial key when there is no order id", () => {
    // A guessed key that collided would drop a real event, which is strictly
    // worse than not deduping at all.
    expect(synthesizeProviderEventId({ operationState: "SUCCESS" })).toBeNull();
    expect(synthesizeProviderEventId(null)).toBeNull();
    expect(synthesizeProviderEventId("not-an-object")).toBeNull();
  });

  it("still keys off order id when the operation fields are absent", () => {
    const id = synthesizeProviderEventId({ orderId: "ord-9" });
    expect(id).toContain("ord-9");
    expect(id).toBe(synthesizeProviderEventId({ orderId: "ord-9" }));
  });

  it("accepts the snake_case order id some payloads use", () => {
    expect(synthesizeProviderEventId({ order_id: "ord-7" })).toContain("ord-7");
  });
});
