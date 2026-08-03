/**
 * Page capture harness — the visual feedback loop for the hero.
 *
 *   node scripts/shoot.mjs                      # hero timeline, 6 frames
 *   node scripts/shoot.mjs --full               # + full-page tall capture
 *   node scripts/shoot.mjs --at 0.5             # a single scroll position
 *   node scripts/shoot.mjs --mobile             # 390x844 viewport
 *
 * Why this exists: the in-app Browser pane does not composite when it is not
 * displayed, which parks the tab in `visibilityState: "hidden"`. rAF is then
 * suspended outright — measured, never fired across 2s — so the WebGL hero
 * never starts and screenshots time out. Headless Chromium composites offscreen
 * regardless, so the scene actually runs and frames can be pulled at exact
 * scroll offsets.
 *
 * SwiftShader is forced rather than left to autodetect: the default headless
 * GPU path silently yields a context that fails the renderer's capability
 * checks, which reads as "the scene is broken" rather than "there is no GPU".
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);

const URL = opt("url", process.env.PORT ? `http://localhost:${process.env.PORT}` : "http://localhost:3000");
const OUT = path.resolve("captures");
const MOBILE = flag("mobile");
const VIEWPORT = MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 };

/** Scroll positions through the hero's 420svh scroll region, as 0..1 of its scrub. */
const BEATS = argv.includes("--at")
  ? [{ p: Number(opt("at", 0)), name: `at-${opt("at", 0)}` }]
  : [
      { p: 0.0, name: "0-close" },
      { p: 0.2, name: "1-apart" },
      { p: 0.45, name: "2-wide" },
      { p: 0.68, name: "3-approach" },
      { p: 0.76, name: "4-contact" },
      { p: 0.95, name: "5-pass" },
    ];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on("requestfailed", (r) => problems.push(`404/fail: ${r.url().slice(-70)}`));

await page.goto(URL, { waitUntil: "networkidle", timeout: 60_000 });

// The hero reports itself ready by fading the canvas in; that is also the point
// at which models are loaded and the first frame has been drawn.
const ready = await page
  .waitForFunction(
    () => {
      const c = document.querySelector("canvas");
      return !!c && c.width > 0 && getComputedStyle(c).opacity === "1";
    },
    { timeout: 45_000 }
  )
  .then(() => true)
  .catch(() => false);

const diag = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const gl = c && (c.getContext("webgl2") || c.getContext("webgl"));
  const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
  return {
    canvas: c ? { w: c.width, h: c.height, opacity: getComputedStyle(c).opacity } : null,
    scene: !!(c && c.__heroScene),
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl ? "masked" : "no context",
    scrollHeight: document.body.scrollHeight,
  };
});

console.log(`hero ready: ${ready}`);
console.log(`  canvas   : ${JSON.stringify(diag.canvas)}`);
console.log(`  scene    : ${diag.scene}`);
console.log(`  renderer : ${diag.renderer}`);

const shots = [];
for (const b of BEATS) {
  // Map 0..1 onto the hero's own scroll region rather than the whole document,
  // so the beat names keep meaning as sections are added below the fold.
  await page.evaluate((p) => {
    const stage = document.querySelector("[data-hero-scroll]") || document.querySelector("section");
    const rect = stage.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const span = rect.height - window.innerHeight;
    window.scrollTo(0, top + span * p);
  }, b.p);
  // Let the scrubbed timeline settle: damping is frame-rate independent but
  // still needs frames to converge, and SwiftShader draws slowly.
  await page.waitForTimeout(900);
  const file = path.join(OUT, `${MOBILE ? "m-" : ""}hero-${b.name}.png`);
  await page.screenshot({ path: file });
  shots.push(file);
  console.log(`  ${b.name} -> ${path.basename(file)}`);
}

if (flag("sections")) {
  // One viewport-sized frame per content section, taken at the section's own
  // top, so each can be reviewed as it is actually seen rather than as a slice
  // of one very tall full-page capture.
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll("[data-section-id]")].map((n) => n.dataset.sectionId)
  );
  for (const [i, id] of [...new Set(ids)].entries()) {
    await page.evaluate((sid) => {
      const n = document.querySelector(`[data-section-id="${sid}"]`);
      window.scrollTo(0, n.getBoundingClientRect().top + window.scrollY);
    }, id);
    // Reveal runs opacity 0 -> 1 with a translate and is still at 0 after 900ms;
    // measured, it settles by ~2s. Capturing earlier photographs the animation
    // mid-flight and reads as a contrast bug that is not there.
    await page.waitForTimeout(2200);
    const file = path.join(OUT, `${MOBILE ? "m-" : ""}sec-${String(i + 1).padStart(2, "0")}-${id}.png`);
    await page.screenshot({ path: file });
    shots.push(file);
    console.log(`  ${id} -> ${path.basename(file)}`);
  }
}

if (flag("full")) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const file = path.join(OUT, `${MOBILE ? "m-" : ""}page-full.png`);
  await page.screenshot({ path: file, fullPage: true });
  shots.push(file);
  console.log(`  full page -> ${path.basename(file)}`);
}

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of [...new Set(problems)].slice(0, 15)) console.log("  " + p);
}

await browser.close();
if (!ready) process.exitCode = 1;
