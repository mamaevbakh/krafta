/**
 * Finds each figure's reaching hand and prints the handUV to paste into
 * HeroCanvas.
 *
 *   node scripts/measure-hands.mjs
 *   node scripts/measure-hands.mjs --side right   # if the arm reaches right
 *
 * The contact spark is placed from handUV. A flat figure cannot move its arm, so
 * if the anchor is wrong the spark fires somewhere on the torso and the whole
 * contact beat reads as broken — which is exactly what happened with guessed
 * values. This measures it instead: scan in from one edge for the first column
 * with real opacity, which for an outstretched-arm cut-out is the hand.
 *
 * Assumes the arm is the furthest-reaching part of the silhouette on that side.
 * If a scarf or prop juts out further, the number will land on that instead —
 * check the printed y against the artwork before trusting it.
 */
import sharp from "sharp";
import path from "node:path";
import { existsSync } from "node:fs";

const argv = process.argv.slice(2);
const side = argv.includes("--side") ? argv[argv.indexOf("--side") + 1] : "left";
const files = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--side");

const targets = files.length
  ? files
  : ["public/hero/assets/char-a.webp", "public/hero/assets/char-b.webp"];

for (const rel of targets) {
  const file = path.resolve(rel);
  if (!existsSync(file)) {
    console.log(`${rel}: not found`);
    continue;
  }

  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  // Require a few opaque pixels in the column so a stray antialiased speck or a
  // single dust pixel cannot be mistaken for the hand.
  const MIN_RUN = 3;
  let col = -1;
  let ys = [];
  const order = side === "right"
    ? [...Array(W).keys()].reverse()
    : [...Array(W).keys()];

  for (const x of order) {
    const hits = [];
    for (let y = 0; y < H; y++) if (data[(y * W + x) * C + 3] > 128) hits.push(y);
    if (hits.length >= MIN_RUN) { col = x; ys = hits; break; }
  }
  if (col < 0) { console.log(`${rel}: no opaque pixels found — is the alpha channel real?`); continue; }

  const yc = ys.reduce((a, b) => a + b, 0) / ys.length;
  // Step inboard from the fingertip toward the palm, so the spark sits on the
  // hand rather than floating off the fingernail.
  const inset = side === "right" ? -W * 0.02 : W * 0.02;
  const u = (col + inset) / W;
  const v = 1 - yc / H;

  console.log(
    `${path.basename(rel).padEnd(16)} ${W}x${H}  hand at px (${col}, ${Math.round(yc)})  ` +
      `->  handUV [${u.toFixed(3)}, ${v.toFixed(3)}]`
  );
}

console.log("\nPaste into components/hero/HeroCanvas.tsx as charAHandUV / charBHandUV.");
console.log("Measure on the image as generated — mirroring is applied at runtime.");
