/**
 * Framing probe — turns "the figures look wrong" into numbers.
 *
 *   node scripts/frame-probe.mjs
 *
 * For each beat it walks the scroll to that position, takes each character's
 * world-space bounding box, projects all eight corners through the live camera,
 * and reports the NDC extents. NDC is -1..1, so anything outside that is off
 * screen; `fit` is the fraction of the box actually inside the viewport.
 *
 * Eyeballing screenshots caught that figures were leaving frame but could not
 * say by how much, which is exactly the information needed to retune a track.
 */
import { chromium } from "playwright";

const URL = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : process.env.PORT ? `http://localhost:${process.env.PORT}` : "http://localhost:3000";

const BEATS = [0.0, 0.16, 0.3, 0.46, 0.6, 0.72, 0.79, 0.9, 1.0];

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForFunction(
  () => {
    const c = document.querySelector("canvas");
    return !!c && c.width > 0 && getComputedStyle(c).opacity === "1";
  },
  { timeout: 45_000 }
);

const rows = [];
for (const p of BEATS) {
  await page.evaluate((pp) => {
    const stage = document.querySelector("[data-hero-scroll]") || document.querySelector("section");
    const rect = stage.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    window.scrollTo(0, top + (rect.height - window.innerHeight) * pp);
  }, p);
  await page.waitForTimeout(800);

  const r = await page.evaluate(() => {
    const s = document.querySelector("canvas").__heroScene;
    if (!s) return null;
    const cam = s.camera;
    cam.updateMatrixWorld(true);
    const out = {};
    for (const [name, ch] of Object.entries(s.characters || {})) {
      const obj = ch.group || ch.root || ch.object3D || ch;
      if (!obj || !obj.traverse) continue;
      // Build the AABB by hand so this does not depend on a THREE import here.
      let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
      obj.updateMatrixWorld(true);
      obj.traverse((n) => {
        const g = n.geometry;
        if (!g || !g.attributes || !g.attributes.position) return;
        if (!g.boundingBox) g.computeBoundingBox();
        const bb = g.boundingBox;
        for (const sx of [bb.min.x, bb.max.x])
          for (const sy of [bb.min.y, bb.max.y])
            for (const sz of [bb.min.z, bb.max.z]) {
              const v = { x: sx, y: sy, z: sz };
              const e = n.matrixWorld.elements;
              const w = 1 / (e[3] * v.x + e[7] * v.y + e[11] * v.z + e[15] || 1);
              const wx = (e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12]) * w;
              const wy = (e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13]) * w;
              const wz = (e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]) * w;
              mnx = Math.min(mnx, wx); mxx = Math.max(mxx, wx);
              mny = Math.min(mny, wy); mxy = Math.max(mxy, wy);
              mnz = Math.min(mnz, wz); mxz = Math.max(mxz, wz);
            }
      });
      if (mnx > 1e8) continue;

      const vp = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse);
      let nx = 1e9, ny = 1e9, Xx = -1e9, Xy = -1e9;
      for (const x of [mnx, mxx]) for (const y of [mny, mxy]) for (const z of [mnz, mxz]) {
        const e = vp.elements;
        const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
        const cx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / cw;
        const cy = (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw;
        nx = Math.min(nx, cx); Xx = Math.max(Xx, cx);
        ny = Math.min(ny, cy); Xy = Math.max(Xy, cy);
      }
      const insideW = Math.max(0, Math.min(Xx, 1) - Math.max(nx, -1));
      const insideH = Math.max(0, Math.min(Xy, 1) - Math.max(ny, -1));
      const fit = ((insideW / (Xx - nx)) * (insideH / (Xy - ny))) || 0;
      out[name] = {
        world: { h: +(mxy - mny).toFixed(2), x: +((mnx + mxx) / 2).toFixed(2) },
        ndc: { x: [+nx.toFixed(2), +Xx.toFixed(2)], y: [+ny.toFixed(2), +Xy.toFixed(2)] },
        fit: +fit.toFixed(2),
      };
    }
    // Where the spark actually fires, in NDC. This is the beat's focal point,
    // so it is the thing the contact framing has to be built around.
    let contact = null;
    if (s._contact) {
      const e = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse).elements;
      const { x, y, z } = s._contact;
      const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
      contact = {
        world: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)],
        ndc: [
          +((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw).toFixed(2),
          +((e[1] * x + e[5] * y + e[9] * z + e[13]) / cw).toFixed(2),
        ],
      };
    }
    return { cam: { pos: cam.position.toArray().map((v) => +v.toFixed(2)), fov: +cam.fov.toFixed(1) }, out, contact };
  });
  rows.push({ p, ...r });
}

console.log("\np     camera pos/fov          char   ndcX            ndcY            fit");
console.log("-".repeat(88));
for (const r of rows) {
  const cam = `[${r.cam.pos.join(",")}] ${r.cam.fov}`;
  let first = true;
  for (const [name, v] of Object.entries(r.out)) {
    const warn = v.fit < 0.92 ? "  <-- clipped" : "";
    console.log(
      `${String(r.p).padEnd(6)}${(first ? cam : "").padEnd(24)}${name.padEnd(7)}` +
        `[${String(v.ndc.x[0]).padStart(6)},${String(v.ndc.x[1]).padStart(6)}]  ` +
        `[${String(v.ndc.y[0]).padStart(6)},${String(v.ndc.y[1]).padStart(6)}]  ${v.fit}${warn}`
    );
    first = false;
  }
  if (r.contact) {
    const [cx, cy] = r.contact.ndc;
    const off = Math.abs(cx) > 0.85 || Math.abs(cy) > 0.85 ? "  <-- spark near edge" : "";
    console.log(`      contact world ${JSON.stringify(r.contact.world)} -> ndc [${cx}, ${cy}]${off}`);
  }
}
console.log("\nNDC is -1..1; fit is the fraction of the figure inside the viewport.");
await browser.close();
