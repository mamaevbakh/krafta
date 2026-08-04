import { describe, expect, it } from "vitest";

import { fingerprintBody, readIdempotencyKey } from "./idempotency";

describe("fingerprintBody", () => {
  it("ignores key order, because a retry may serialise differently", () => {
    // The same logical request re-encoded by a different JSON writer must not
    // read as a different body — that would turn every retry into a 422.
    expect(fingerprintBody({ a: 1, b: 2 })).toBe(fingerprintBody({ b: 2, a: 1 }));
  });

  it("is stable through nesting and arrays", () => {
    expect(fingerprintBody({ x: { p: 1, q: [1, { m: 2, n: 3 }] } })).toBe(
      fingerprintBody({ x: { q: [1, { n: 3, m: 2 }], p: 1 } }),
    );
  });

  it("changes when a value changes", () => {
    // This is what catches a client reusing one key for two different charges.
    expect(fingerprintBody({ amountMinor: 100 })).not.toBe(
      fingerprintBody({ amountMinor: 200 }),
    );
  });

  it("distinguishes a missing key from an explicit null", () => {
    expect(fingerprintBody({ a: 1 })).not.toBe(fingerprintBody({ a: 1, b: null }));
  });

  it("treats undefined as absent, since JSON drops it in transit anyway", () => {
    expect(fingerprintBody({ a: 1, b: undefined })).toBe(fingerprintBody({ a: 1 }));
  });

  it("does not collide across scalar types", () => {
    expect(fingerprintBody({ a: 1 })).not.toBe(fingerprintBody({ a: "1" }));
  });
});

describe("readIdempotencyKey", () => {
  const withHeaders = (headers: Record<string, string>) =>
    new Request("https://pay.krafta.org/api/checkout_sessions", { headers });

  it("is null when the caller has not opted in", () => {
    // No header means unchanged behaviour for every existing integration.
    expect(readIdempotencyKey(withHeaders({}))).toBeNull();
  });

  it("reads the header case-insensitively and trims it", () => {
    expect(readIdempotencyKey(withHeaders({ "Idempotency-Key": "  k-1 " }))).toBe("k-1");
  });

  it("treats a whitespace-only header as absent rather than as a key", () => {
    expect(readIdempotencyKey(withHeaders({ "Idempotency-Key": "   " }))).toBeNull();
  });

  it("rejects a key too long to store", () => {
    expect(() =>
      readIdempotencyKey(withHeaders({ "Idempotency-Key": "x".repeat(256) })),
    ).toThrowError(/255/);
  });
});
