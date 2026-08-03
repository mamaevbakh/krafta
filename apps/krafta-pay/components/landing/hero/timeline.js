import * as THREE from "three";

/**
 * The shot, as data.
 *
 * Four beats, matching the source page's rhythm:
 *   close    — the two figures start near each other
 *   apart    — they drift apart, camera pulls back
 *   approach — they converge again, camera pushes in
 *   contact  — hands meet, spark fires
 *   pass     — they sweep past the camera and fade
 *
 * Everything is keyed on normalised scroll progress, so the whole sequence is
 * scrubbable in both directions with no hidden state.
 */

export const BEATS = {
  close: [0.0, 0.16],
  apart: [0.16, 0.46],
  approach: [0.46, 0.72],
  contact: [0.72, 0.79],
  pass: [0.79, 1.0],
};

/**
 * Fallback contact point. At runtime the real one is derived from the two
 * characters' actual shoulder positions — see HeroScene._updateContact.
 *
 * Hard-coding it was a bug: a 3.6-unit-tall figure has ~1.05 units of arm, so
 * any fixed point more than that from the shoulder is unreachable and the IK
 * silently clamps short instead of touching.
 */
export const CONTACT_POINT = new THREE.Vector3(0, 1.1, -0.3);

/**
 * Camera distances stay tight — the source page frames its figures large enough
 * that the viewport crops them, and they read as monumental rather than as
 * people standing in a landscape. Pulling back far enough to fit whole bodies is
 * what made the first pass look like a diorama.
 *
 * Tight is not the same as arbitrary, though. Measured with scripts/frame-probe
 * (NDC extents of each figure, -1..1 = the viewport), the previous track had two
 * outright faults rather than stylistic ones:
 *
 *   p=0.46  charB spanned x [1.03, 1.24] — wholly outside the right edge, fit 0.
 *   p=0.79  figures spanned y down to -2.27, pushing the joined hands to y 0.93
 *           and clipping the spark against the top edge.
 *
 * So: the apart beat pulls back and narrows the spread enough to keep both
 * figures on screen, and the contact beat is built around the contact point
 * itself, seating it near y +0.2 where the eye already is, rather than letting
 * it drift wherever the bodies happen to put it.
 */
export const CAMERA_TRACK = [
  { p: 0.0, pos: [0, 0.55, 4.9], look: [0, 0.5, 0], fov: 42 },
  { p: 0.16, pos: [0, 0.6, 5.9], look: [0, 0.5, 0], fov: 43 },
  { p: 0.46, pos: [0.3, 0.75, 8.3], look: [0, 0.55, 0], fov: 46 },
  { p: 0.72, pos: [0.15, 1.45, 6.3], look: [0, 1.5, -0.3], fov: 40 },
  { p: 0.79, pos: [-0.12, 1.5, 6.0], look: [0, 1.55, -0.3], fov: 39 },
  { p: 1.0, pos: [0, 1.5, 2.2], look: [0, 1.2, -7], fov: 50 },
];

/**
 * Per-character keyframes. `rz` is a slight in-plane tilt that sells the leap.
 * Mirrored between the two, but deliberately not perfectly symmetrical.
 */
export const CHAR_TRACK = {
  charA: [
    { p: 0.0, x: -2.3, y: -0.15, z: -0.9, rz: 0.02 },
    { p: 0.16, x: -2.7, y: -0.18, z: -0.9, rz: 0.025 },
    // Spread is bounded by what the lens can hold, not by how far apart the
    // beat "wants" them: past about ±5 they cross the frame edge outright.
    { p: 0.46, x: -4.9, y: -0.5, z: -1.9, rz: 0.07 },
    // Flat figures cannot extend an arm, so the contact spacing is set by the
    // artwork: the reaching hand sits at the plane's outer edge, and the plane
    // is half its own width across. Half of charA's 2.9-unit width is ~1.45, so
    // seating her at -1.45 puts her hand on the centre line. The mesh version
    // used -1.18 and the wider image planes overlapped bodies at that spacing.
    { p: 0.72, x: -1.45, y: -0.02, z: -0.4, rz: 0.03 },
    { p: 0.79, x: -1.41, y: 0.0, z: -0.4, rz: 0.028 },
    { p: 1.0, x: -2.6, y: 0.5, z: 2.1, rz: -0.02 },
  ],
  charB: [
    { p: 0.0, x: 2.4, y: 0.1, z: -1.6, rz: -0.02 },
    { p: 0.16, x: 2.9, y: 0.12, z: -1.6, rz: -0.025 },
    { p: 0.46, x: 5.1, y: 0.45, z: -2.6, rz: -0.065 },
    { p: 0.72, x: 1.9, y: 0.06, z: -0.55, rz: -0.03 },
    { p: 0.79, x: 1.86, y: 0.05, z: -0.55, rz: -0.028 },
    { p: 1.0, x: 2.8, y: 0.62, z: 2.0, rz: 0.02 },
  ],
};

/* ---------- sampling ---------- */

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const damp = (cur, target, lambda, dt) =>
  lerp(cur, target, 1 - Math.exp(-lambda * dt));

/** Normalised, eased position within a [from,to] window. */
export const range = (p, from, to) => smoothstep(clamp((p - from) / (to - from), 0, 1));

/** Generic keyframe sampler — finds the bracketing pair and eases between them. */
export function sampleTrack(track, p, keys) {
  const t = clamp(p, 0, 1);
  let i = 0;
  while (i < track.length - 2 && t > track[i + 1].p) i++;
  const a = track[i];
  const b = track[i + 1];
  const k = smoothstep(clamp((t - a.p) / (b.p - a.p), 0, 1));

  const out = {};
  for (const key of keys) {
    if (Array.isArray(a[key])) {
      out[key] = a[key].map((v, j) => lerp(v, b[key][j], k));
    } else {
      out[key] = lerp(a[key], b[key], k);
    }
  }
  return out;
}

export const sampleCamera = (p) => sampleTrack(CAMERA_TRACK, p, ["pos", "look", "fov"]);
export const sampleChar = (which, p) =>
  sampleTrack(CHAR_TRACK[which], p, ["x", "y", "z", "rz"]);

/**
 * How far each figure is "reaching", 0–1. Ramps up through the approach beat,
 * holds through contact, releases on the pass. Drives IK on rigged meshes and
 * arm tilt on the flat ones.
 */
export function reachAmount(p) {
  const up = range(p, BEATS.approach[0], BEATS.contact[0]);
  const down = range(p, BEATS.contact[1], BEATS.pass[0] + 0.08);
  return up * (1 - down);
}

/**
 * Figure opacity — they dissolve as they sweep past the lens.
 *
 * The fade has to lead the exit, not trail it. Measured, the figures are already
 * ~85% outside the frame by p=0.9, so a fade that only began there left them
 * fully opaque while leaving the shot: they read as snapping away rather than
 * passing. Starting at 0.84 and going near-transparent means the dissolve is
 * doing the work by the time the throw is large.
 */
export function characterFade(p) {
  return 1 - range(p, 0.84, 0.98) * 0.97;
}
