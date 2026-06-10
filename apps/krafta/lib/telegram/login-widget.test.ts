import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";

import { validateTelegramLoginPayload } from "./login-widget";

// Forge payloads exactly the way Telegram signs them (legacy widget spec):
// secret_key = SHA256(bot_token); hash = hex(HMAC_SHA256(secret, sorted
// "key=value" lines of every field except hash)). The e2e spec reuses this
// same forging recipe against the dev bot token.

const BOT_TOKEN = "1234567890:TEST-token-for-vitest";
const NOW = 1_760_000_000;

function sign(fields: Record<string, string | number>): string {
  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHash("sha256").update(BOT_TOKEN).digest();
  return createHmac("sha256", secret).update(dataCheckString).digest("hex");
}

function payload(
  overrides: Record<string, unknown> = {},
  fields: Record<string, string | number> = {
    id: 987654321,
    first_name: "Bobur",
    username: "bobur_uz",
    auth_date: NOW - 30,
  },
) {
  return { ...fields, hash: sign(fields), ...overrides };
}

const OPTS = { botToken: BOT_TOKEN, nowSeconds: NOW };

describe("validateTelegramLoginPayload", () => {
  it("accepts a correctly signed payload and types it", () => {
    const result = validateTelegramLoginPayload(payload(), OPTS);
    expect(result.id).toBe(987654321);
    expect(result.first_name).toBe("Bobur");
    expect(result.username).toBe("bobur_uz");
    expect(result.last_name).toBeUndefined();
  });

  it("includes every received field in the check string (extra fields signed)", () => {
    const fields = {
      id: 42,
      first_name: "Aziza",
      auth_date: NOW - 5,
      photo_url: "https://t.me/i/userpic/320/x.jpg",
      some_future_field: "ok",
    };
    expect(() =>
      validateTelegramLoginPayload({ ...fields, hash: sign(fields) }, OPTS),
    ).not.toThrow();
  });

  it("rejects a tampered field", () => {
    expect(() =>
      validateTelegramLoginPayload(payload({ id: 111 }), OPTS),
    ).toThrow(/signature is invalid/);
  });

  it("rejects an unsigned extra field", () => {
    expect(() =>
      validateTelegramLoginPayload(payload({ injected: "x" }), OPTS),
    ).toThrow(/signature is invalid/);
  });

  it("rejects a dropped signed field", () => {
    const p = payload();
    delete (p as Record<string, unknown>).username;
    expect(() => validateTelegramLoginPayload(p, OPTS)).toThrow(
      /signature is invalid/,
    );
  });

  it("rejects the wrong bot token", () => {
    expect(() =>
      validateTelegramLoginPayload(payload(), {
        ...OPTS,
        botToken: "1234567890:DIFFERENT",
      }),
    ).toThrow(/signature is invalid/);
  });

  it("rejects a missing or malformed hash", () => {
    expect(() =>
      validateTelegramLoginPayload(payload({ hash: undefined }), OPTS),
    ).toThrow(/missing `hash`/);
    expect(() =>
      validateTelegramLoginPayload(payload({ hash: "zz".repeat(32) }), OPTS),
    ).toThrow(/missing `hash`/);
  });

  it("rejects an expired auth_date (default 10 min window)", () => {
    const fields = {
      id: 1,
      first_name: "Old",
      auth_date: NOW - 11 * 60,
    };
    expect(() =>
      validateTelegramLoginPayload({ ...fields, hash: sign(fields) }, OPTS),
    ).toThrow(/expired/);
  });

  it("accepts within the window and tolerates small forward skew", () => {
    for (const delta of [-9 * 60, -1, 30]) {
      const fields = { id: 1, first_name: "Skew", auth_date: NOW + delta };
      expect(() =>
        validateTelegramLoginPayload({ ...fields, hash: sign(fields) }, OPTS),
      ).not.toThrow();
    }
  });

  it("rejects auth_date too far in the future", () => {
    const fields = { id: 1, first_name: "Future", auth_date: NOW + 5 * 60 };
    expect(() =>
      validateTelegramLoginPayload({ ...fields, hash: sign(fields) }, OPTS),
    ).toThrow(/in the future/);
  });

  it("rejects non-scalar fields outright", () => {
    expect(() =>
      validateTelegramLoginPayload(payload({ user: { id: 1 } }), OPTS),
    ).toThrow(/not a scalar/);
  });

  it("rejects a signed-but-nonsensical id or missing first_name", () => {
    const noName = { id: 7, auth_date: NOW - 1 };
    expect(() =>
      validateTelegramLoginPayload({ ...noName, hash: sign(noName) }, OPTS),
    ).toThrow(/first_name/);
    const badId = { id: "abc", first_name: "X", auth_date: NOW - 1 };
    expect(() =>
      validateTelegramLoginPayload({ ...badId, hash: sign(badId) }, OPTS),
    ).toThrow(/`id` is malformed/);
  });
});
