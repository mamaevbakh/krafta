import { describe, expect, it } from "vitest";

import { renderQrSvg } from "./render";

// Smoke tests for the QR renderer. We don't try to scan the result in
// the test runner (would need a QR decoder), but we lock down enough
// structural invariants to catch obvious regressions:
//   - the output is a valid <svg> with a viewBox
//   - the QR <path> from the qrcode lib lands in the output
//   - the wordmark overlay is present when withWordmark is on
//   - the wordmark text is escaped for XML safety
describe("renderQrSvg", () => {
  it("returns a self-contained SVG with a viewBox", async () => {
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234");
    expect(svg.trim().startsWith("<svg")).toBe(true);
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
    expect(svg).toMatch(/<path /);
  });

  it("includes the Krafta wordmark by default", async () => {
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234");
    expect(svg).toContain("Krafta");
    expect(svg).toContain("Helvetica Neue");
  });

  it("omits the wordmark when disabled", async () => {
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234", {
      withWordmark: false,
    });
    expect(svg).not.toContain("Krafta");
    expect(svg).not.toContain("<text");
  });

  it("honors a custom wordmark string", async () => {
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234", {
      wordmark: "AcmeCo",
    });
    expect(svg).toContain("AcmeCo");
    expect(svg).not.toContain(">Krafta<");
  });

  it("XML-escapes wordmark text", async () => {
    // Future-proofing — Krafta has no special chars, but defensive
    // escaping protects callers that pass merchant-supplied brand names.
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234", {
      wordmark: "<Bobby> & \"Drop\"",
    });
    expect(svg).toContain("&lt;Bobby&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;Drop&quot;");
    expect(svg).not.toContain("<Bobby>");
  });

  it("respects custom output size hint", async () => {
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234", {
      size: 512,
    });
    expect(svg).toContain('width="512"');
    expect(svg).toContain('height="512"');
  });
});
