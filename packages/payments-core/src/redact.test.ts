import { describe, it, expect } from "vitest";
import { redactSensitive } from "./redact";

describe("redactSensitive", () => {
  it("masks card numbers, OTP, tokens, and secrets by key", () => {
    const out = redactSensitive({
      card_number: "8600490744313347",
      cardNumber: "8600490744313347",
      pan: "986009******1840",
      expiry: "2810",
      cvc: "123",
      otp: "111111",
      card_token: "tok_live_abc123",
      bindingId: "bind_xyz",
      access_token: "eyJhbGciOi",
      consumer_secret: "shh",
      api_key: "krp_live_x",
      authorization: "Basic abc",
      password: "hunter2",
    });
    for (const key of Object.keys(out)) {
      expect(out[key as keyof typeof out]).toBe("[redacted]");
    }
  });

  it("normalizes key casing and separators when matching", () => {
    const out = redactSensitive({
      "Card_Number": "8600490744313347",
      "CARD-TOKEN": "tok",
      "Otp": "111111",
    }) as Record<string, unknown>;
    expect(out["Card_Number"]).toBe("[redacted]");
    expect(out["CARD-TOKEN"]).toBe("[redacted]");
    expect(out["Otp"]).toBe("[redacted]");
  });

  it("preserves non-sensitive fields, including Atmos identifiers and status codes", () => {
    const input = {
      account: "12345",
      amount: 5000000,
      store_id: "0001",
      transaction_id: 202072,
      status_code: "0",
      result: { code: "OK", description: "Нет ошибок" },
    };
    expect(redactSensitive(input)).toEqual(input);
  });

  it("scrubs a PAN-shaped digit run even in an unexpected field, keeping last 4", () => {
    const out = redactSensitive({ note: "card 8600490744313347 declined" }) as {
      note: string;
    };
    expect(out.note).toBe("card ************3347 declined");
  });

  it("does not mask 13-digit millisecond timestamps or short amounts", () => {
    const input = { confirm_time: 1656326529324, total: 5000000 };
    expect(redactSensitive(input)).toEqual(input);
  });

  it("recurses through nested objects and arrays", () => {
    const out = redactSensitive({
      data: { card: { pan: "8600490744313347" }, ok: true },
      cards: [{ card_token: "a" }, { card_token: "b" }],
    }) as any;
    expect(out.data.card.pan).toBe("[redacted]");
    expect(out.data.ok).toBe(true);
    expect(out.cards[0].card_token).toBe("[redacted]");
    expect(out.cards[1].card_token).toBe("[redacted]");
  });

  it("preserves null/undefined under a sensitive key (so masked DB columns stay null)", () => {
    const out = redactSensitive({ card_token: null, otp: undefined }) as Record<
      string,
      unknown
    >;
    expect(out.card_token).toBeNull();
    expect(out.otp).toBeUndefined();
  });

  it("never mutates the input", () => {
    const input = { card_number: "8600490744313347", account: "1" };
    const snapshot = JSON.parse(JSON.stringify(input));
    redactSensitive(input);
    expect(input).toEqual(snapshot);
  });
});
