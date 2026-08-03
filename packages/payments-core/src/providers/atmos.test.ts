import { describe, it, expect } from "vitest";
import { AtmosError, classifyAtmosFailure } from "./atmos";

// An AtmosError as thrown by the bind/charge helpers: the redacted provider body
// with the `result.code` the classifier keys on.
const atmosErr = (code: string) =>
  new AtmosError("atmos_bind_init_failed", { result: { code, description: "x" } });

describe("classifyAtmosFailure", () => {
  it("keeps genuine card-validation codes as card_invalid", () => {
    expect(classifyAtmosFailure(atmosErr("STPIMS-ERR-009"))).toBe("card_invalid"); // wrong params
    expect(classifyAtmosFailure(atmosErr("STPIMS-ERR-067"))).toBe("card_invalid"); // wrong card
    // A bare code with no partner prefix still classifies.
    expect(classifyAtmosFailure(atmosErr("ERR-009"))).toBe("card_invalid");
  });

  it("treats an Atmos internal error (ERR-001) as temporary, not a bad card", () => {
    // The live-observed regression: ERR-001 "Внутренняя ошибка" was shown as a
    // card error and cleared on retry.
    expect(classifyAtmosFailure(atmosErr("STPIMS-ERR-001"))).toBe("temporary");
  });

  it("treats transport/timeout failures (non-AtmosError) as temporary", () => {
    expect(classifyAtmosFailure(new Error("fetch failed"))).toBe("temporary");
    expect(classifyAtmosFailure(new TypeError("network timeout"))).toBe("temporary");
    expect(classifyAtmosFailure(new Error("atmos_token_failed"))).toBe("temporary");
  });

  it("treats an AtmosError with no result code as temporary", () => {
    expect(classifyAtmosFailure(new AtmosError("atmos_bind_init_failed", {}))).toBe("temporary");
  });

  it("leaves other/unknown Atmos codes for the caller's own default copy", () => {
    expect(classifyAtmosFailure(atmosErr("STPIMS-ERR-042"))).toBe("other");
  });
});
