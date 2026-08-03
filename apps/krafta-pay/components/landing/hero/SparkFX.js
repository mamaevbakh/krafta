import * as THREE from "three";

/**
 * The contact spark.
 *
 * Everything here is a pure function of scroll progress — no elapsed-time state,
 * no one-shot triggers. That matters for a scrubbed timeline: scrolling back up
 * has to un-fire the spark, and a trigger-based system cannot do that.
 *
 * Two looks, switchable at runtime:
 *   "bloom" — particle burst + shockwave ring + UnrealBloom post pass
 *   "glow"  — additive core + small scatter, no post-processing
 */

const SPARK_COUNT = 260;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (t) => t * t * (3 - 2 * t);
const range = (p, a, b) => smoothstep(clamp((p - a) / (b - a), 0, 1));

export class SparkFX {
  /**
   * @param {THREE.Object3D} parent
   * @param {"bloom"|"glow"} mode
   */
  constructor(parent, mode = "bloom") {
    this.mode = mode;
    this.group = new THREE.Group();
    parent.add(this.group);

    this.intensity = 0;
    this._buildCore();
    this._buildSparks();
    this._buildRing();
    this.setMode(mode);
  }

  _buildCore() {
    // A soft additive disc. Cheaper and steadier than a real light.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,245,1)");
    g.addColorStop(0.25, "rgba(255,240,200,0.65)");
    g.addColorStop(1, "rgba(255,220,160,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._coreTexture = tex;

    this.core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        opacity: 0,
      })
    );
    this.core.scale.setScalar(0.01);
    this.core.renderOrder = 20;
    this.group.add(this.core);
  }

  _buildSparks() {
    // Fixed random directions, generated once — the burst must be identical
    // every time the user scrubs through the contact window.
    const dirs = new Float32Array(SPARK_COUNT * 3);
    const speed = new Float32Array(SPARK_COUNT);
    const pos = new Float32Array(SPARK_COUNT * 3);

    for (let i = 0; i < SPARK_COUNT; i++) {
      // Deterministic pseudo-random on a sphere, biased toward the screen plane.
      const a = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const b = (Math.sin(i * 78.233) * 12345.6789) % 1;
      const theta = Math.abs(a) * Math.PI * 2;
      const phi = Math.acos(2 * Math.abs(b) - 1);
      dirs[i * 3 + 0] = Math.sin(phi) * Math.cos(theta);
      dirs[i * 3 + 1] = Math.sin(phi) * Math.sin(theta);
      dirs[i * 3 + 2] = Math.cos(phi) * 0.35;
      speed[i] = 0.45 + Math.abs((Math.sin(i * 39.425) * 24634.6345) % 1) * 1.35;
    }

    this._dirs = dirs;
    this._speed = speed;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

    // Points with no map draw as hard opaque squares — the default primitive is
    // a quad and nothing cuts it back to a disc. Untextured, the spark read as a
    // cluster of blocks rather than embers, which no amount of bloom hides.
    // Drawn here rather than loaded so the effect needs no extra asset.
    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = spriteCanvas.height = 64;
    const sctx = spriteCanvas.getContext("2d");
    const sg = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    sg.addColorStop(0, "rgba(255,255,250,1)");
    sg.addColorStop(0.35, "rgba(255,232,180,0.75)");
    sg.addColorStop(1, "rgba(255,200,120,0)");
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, 64, 64);
    const sparkTex = new THREE.CanvasTexture(spriteCanvas);
    sparkTex.colorSpace = THREE.SRGBColorSpace;
    this._sparkTexture = sparkTex;

    this.sparks = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffe9b8,
        map: sparkTex,
        alphaMap: sparkTex,
        size: 0.075,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    );
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 21;
    this.group.add(this.sparks);
  }

  _buildRing() {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.56, 64),
      new THREE.MeshBasicMaterial({
        color: 0xfff3d0,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.ring.renderOrder = 19;
    this.group.add(this.ring);
  }

  setMode(mode) {
    this.mode = mode;
    // The ring reads as overwrought without bloom behind it.
    this.ring.visible = mode === "bloom";
  }

  /**
   * @param {number} p        scroll progress
   * @param {[number,number]} window  [start, end] of the contact beat
   * @param {THREE.Vector3} at        world position of the touch
   * @param {THREE.Camera} camera
   * @returns {number} 0..1 intensity, for driving the bloom pass
   */
  update(p, window, at, camera) {
    const [start, end] = window;

    // Rise fast on contact, fall off slower afterwards.
    const rise = range(p, start - 0.02, start + 0.015);
    const fall = 1 - range(p, start + 0.02, end + 0.10);
    const intensity = rise * fall;
    this.intensity = intensity;

    this.group.position.copy(at);
    this.group.visible = intensity > 0.001;
    if (!this.group.visible) return 0;

    const big = this.mode === "bloom" ? 1 : 0.6;
    const spread = (1 - fall) * 1.5 + 0.1;

    // Core. Kept deliberately small — with bloom on, a large core blows out the
    // whole frame and hides the two figures, which are the point of the shot.
    this.core.material.opacity = intensity * (this.mode === "bloom" ? 0.55 : 0.7);
    this.core.scale.setScalar((0.22 + (1 - fall) * 0.6) * big);

    // Sparks fly outward as the beat decays
    const arr = this.sparks.geometry.attributes.position.array;
    for (let i = 0; i < SPARK_COUNT; i++) {
      const d = spread * this._speed[i] * big;
      arr[i * 3 + 0] = this._dirs[i * 3 + 0] * d;
      arr[i * 3 + 1] = this._dirs[i * 3 + 1] * d;
      arr[i * 3 + 2] = this._dirs[i * 3 + 2] * d;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.material.opacity = intensity * (this.mode === "bloom" ? 0.95 : 0.6);
    this.sparks.material.size = 0.075 * (this.mode === "bloom" ? 1 : 0.7);

    // Shockwave ring, billboarded to the camera
    if (this.ring.visible) {
      const r = 0.3 + (1 - fall) * 3.2;
      this.ring.scale.setScalar(r);
      this.ring.material.opacity = intensity * 0.35 * fall;
      this.ring.quaternion.copy(camera.quaternion);
    }

    return intensity;
  }

  dispose() {
    this._coreTexture.dispose();
    this._sparkTexture.dispose();
    this.core.material.dispose();
    this.sparks.geometry.dispose();
    this.sparks.material.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
  }
}
