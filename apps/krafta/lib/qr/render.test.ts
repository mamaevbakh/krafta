import { describe, expect, it } from "vitest";

import { DEFAULT_QR_STYLE } from "./config";
import { renderQrSvg } from "./render";

// Smoke tests for the QR renderer. We don't try to scan the result in
// the test runner (would need a QR decoder), but we lock down enough
// structural invariants to catch obvious regressions:
//   - the output is a valid <svg> with a viewBox
//   - the QR module path lands in the output
//   - the wordmark overlay is present by default and absent on opt-out
//   - the legacy hooks (withWordmark / wordmark) still work
//   - the studio config drives gradients / logo / frame / shapes
describe("renderQrSvg", () => {
  it("returns a self-contained SVG with a viewBox", async () => {
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234");
    expect(svg.trim().startsWith("<svg")).toBe(true);
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
    expect(svg).toMatch(/<path /);
  });

  it("includes a non-trivial QR module path", async () => {
    // Module rendering uses a single <path d="..."> with one M/h/v/z per
    // dark module. With a short URL the count is in the hundreds, so the
    // path data is well over 100 chars.
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234");
    const pathMatch = svg.match(/<path d="([^"]+)" fill="#000000"\/>/);
    expect(pathMatch).not.toBeNull();
    expect(pathMatch![1].length).toBeGreaterThan(100);
  });

  it("includes the Krafta vector wordmark by default", async () => {
    // The pre-baked Krafta vector path is identified by its first move
    // command which is unique to the glyph cluster.
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234");
    expect(svg).toContain("M22.6 -71.4");
    expect(svg).not.toContain("<text");
  });

  it("omits the wordmark when withWordmark=false (legacy hook)", async () => {
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234", {
      withWordmark: false,
    });
    expect(svg).not.toContain("M22.6 -71.4");
    expect(svg).not.toContain("<text");
  });

  it("falls back to <text> for a custom wordmark string (legacy hook)", async () => {
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234", {
      wordmark: "AcmeCo",
    });
    expect(svg).toContain("AcmeCo");
    expect(svg).toContain("<text");
    expect(svg).toMatch(/font-family="'Helvetica Neue'/);
    expect(svg).not.toContain("M22.6 -71.4");
  });

  it("XML-escapes wordmark text on the text-fallback branch", async () => {
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

  it("applies a foreground gradient when one is in the style", async () => {
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234", {
      style: {
        ...DEFAULT_QR_STYLE,
        fgGradient: {
          type: "linear",
          rotation: 90,
          stops: [
            { offset: 0, color: "#000000" },
            { offset: 1, color: "#FF5500" },
          ],
        },
      },
    });
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain('fill="url(#qr-fg)"');
    expect(svg).toContain("#FF5500");
  });

  it("renders dotted modules when style.moduleShape = 'dots'", async () => {
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234", {
      style: { ...DEFAULT_QR_STYLE, moduleShape: "dots" },
    });
    // Dots are SVG arcs (a r r ...) — square modules use h/v/z. Dots have
    // arc commands, squares don't.
    expect(svg).toMatch(/a0\.45 0\.45/);
  });

  it("renders circular eye outers when style.eyeOuterShape = 'circle'", async () => {
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234", {
      style: { ...DEFAULT_QR_STYLE, eyeOuterShape: "circle" },
    });
    // Concentric circles render as two arcs in one evenodd path.
    expect(svg).toMatch(/a3\.5 3\.5 0 1 1/);
  });

  it("embeds a logo image and skips the Krafta wordmark when a logo is set", async () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234", {
      style: {
        ...DEFAULT_QR_STYLE,
        logo: { src: dataUrl, size: 0.22, margin: 1 },
      },
    });
    expect(svg).toContain("<image");
    expect(svg).toContain(dataUrl);
    expect(svg).not.toContain("M22.6 -71.4");
  });

  it("appends a frame strip when style.frame is set", async () => {
    const svg = await renderQrSvg("https://krafta.org/q/abcd1234", {
      style: {
        ...DEFAULT_QR_STYLE,
        frame: { text: "Scan to order", color: null },
      },
    });
    expect(svg).toContain("SCAN TO ORDER");
    // The viewBox height should exceed its width when a frame is present.
    const vbMatch = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    expect(vbMatch).not.toBeNull();
    const w = Number(vbMatch![1]);
    const h = Number(vbMatch![2]);
    expect(h).toBeGreaterThan(w);
  });
});
