import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import {
  BEATS,
  CONTACT_POINT,
  CAMERA_TRACK,
  characterFade,
  damp,
  reachAmount,
  sampleCamera,
  sampleChar,
} from "./timeline.js";
import { SparkFX } from "./SparkFX.js";
import { PlaneCharacter } from "./PlaneCharacter.js";

const _shoulderA = new THREE.Vector3();
const _shoulderB = new THREE.Vector3();

export class HeroScene {
  /**
   * @param {object} opts
   * @param {HTMLCanvasElement} opts.canvas
   * @param {object} opts.assets   { backdrop, charA, charB, propCup?, propBags? }
   * @param {"mesh"|"plane"} opts.characterMode
   * @param {"bloom"|"glow"} opts.sparkMode
   * @param {"unlit"|"matte"} opts.shading
   * @param {boolean} [opts.reducedMotion] freeze idle drift for prefers-reduced-motion
   */
  constructor({
    canvas,
    assets,
    characterMode = "mesh",
    sparkMode = "bloom",
    shading = "matte",
    reducedMotion = false,
  }) {
    this.canvas = canvas;
    this.assets = assets;
    this.characterMode = characterMode;
    this.sparkMode = sparkMode;
    this.shading = shading;
    this.reducedMotion = reducedMotion;

    this.progress = 0;
    this.smoothProgress = 0;
    this.pointer = new THREE.Vector2();
    this.smoothPointer = new THREE.Vector2();
    this.clock = new THREE.Clock();
    this.running = false;
    this._raf = 0;
    this._onFrame = null;
    this._contact = CONTACT_POINT.clone();
    this._lookTarget = new THREE.Vector3();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true, // capture endpoint needs read-back
    });
    this.renderer.setClearColor(0x05070a, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.94;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x1b2a2e, 26, 105);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
    this.camera.position.set(0, 0.25, 11.5);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    // Soft, non-directional light. Anything harder fights the painted textures.
    this.scene.add(new THREE.HemisphereLight(0xf3e6d0, 0x2a3330, 2.1));
    const fill = new THREE.DirectionalLight(0xfff2e0, 0.7);
    fill.position.set(-2, 3, 4);
    this.scene.add(fill);

    this.characters = {};
    this.spark = new SparkFX(this.root, sparkMode);
  }

  async load() {
    const loader = new THREE.TextureLoader();
    const tex = (url) =>
      new Promise((res, rej) =>
        loader.load(url, res, undefined, () => rej(new Error(`texture failed: ${url}`)))
      );

    const backdrop = await tex(this.assets.backdrop);
    backdrop.colorSpace = THREE.SRGBColorSpace;
    backdrop.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this._buildBackdrop(backdrop);

    await this._loadPlaneCharacters(tex);

    this._buildMotes();
    this._buildComposer();
    return this;
  }

  async _loadPlaneCharacters(tex) {
    // Heights sit near the 3.6 the camera track was tuned against, so the whole
    // measured framing carries over. The earlier placeholder used 9.2 and 8.2,
    // which is why flat mode never matched the beats.
    const [a, b] = await Promise.all([
      new PlaneCharacter({
        url: this.assets.charA,
        height: 3.6,
        flip: true,
        handUV: this.assets.charAHandUV || [0.86, 0.74],
      }).load(tex),
      new PlaneCharacter({
        url: this.assets.charB,
        height: 3.7,
        flip: false,
        handUV: this.assets.charBHandUV || [0.14, 0.76],
      }).load(tex),
    ]);
    this.characters.charA = a;
    this.characters.charB = b;
    this.root.add(a.root, b.root);
  }

  _buildBackdrop(texture) {
    const z = -58;
    const widest = CAMERA_TRACK.reduce((m, k) => Math.max(m, k.fov), 0);
    const furthest = CAMERA_TRACK.reduce((m, k) => Math.max(m, k.pos[2]), 0);
    const dist = furthest - z;
    const h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(widest) / 2) * 1.2;
    const w = h * (texture.image.width / texture.image.height);

    this.backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: texture,
        fog: false,
        depthWrite: false,
        // Knocked down and cooled: the source page's landscape sits much darker
        // than the raw painting, which pushes the figures forward.
        color: new THREE.Color(0x9aa8ae),
      })
    );
    this.backdrop.position.z = z;
    this.backdrop.renderOrder = -10;
    this.root.add(this.backdrop);
  }

  _buildMotes() {
    const COUNT = 240;
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3 + 0] = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 36 - 18;
      pos[i * 3 + 1] = ((Math.sin(i * 78.233) * 12345.6789) % 1) * 22 - 11;
      pos[i * 3 + 2] = ((Math.sin(i * 39.425) * 24634.6345) % 1) * 28 - 22;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xf7f7ee,
        size: 0.055,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.root.add(this.motes);
  }

  _buildComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.0, 0.75, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /* ---------- controls ---------- */

  setProgress(p) {
    this.progress = Math.min(1, Math.max(0, p));
  }

  setPointer(x, y) {
    this.pointer.set(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
  }

  setSparkMode(mode) {
    this.sparkMode = mode;
    this.spark.setMode(mode);
  }

  setShading(mode) {
    this.shading = mode;
    for (const c of Object.values(this.characters)) c.setShading?.(mode);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(dpr);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._portrait = this.camera.aspect < 1;
  }

  /* ---------- loop ---------- */

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const tick = () => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(tick);
      this.update();
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  update() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    const idle = this.reducedMotion ? 0 : 1;

    this.smoothProgress = damp(this.smoothProgress, this.progress, 6, dt);
    this.smoothPointer.x = damp(this.smoothPointer.x, this.pointer.x, 3.2, dt);
    this.smoothPointer.y = damp(this.smoothPointer.y, this.pointer.y, 3.2, dt);

    const p = this.smoothProgress;
    const shot = sampleCamera(p);
    const squeeze = this._portrait ? 0.62 : 1;

    /* characters — timeline position, then clip + IK */
    const reach = reachAmount(p);

    // Position both first, so the contact point can be derived from where the
    // shoulders actually ended up.
    for (const key of ["charA", "charB"]) {
      const c = this.characters[key];
      if (!c) continue;
      const k = sampleChar(key, p);
      const bob = Math.sin(t * 0.55 + (key === "charB" ? 1.7 : 0)) * 0.14 * idle;
      c.root.position.set(k.x * squeeze, k.y + bob, k.z);
      c.root.rotation.z = k.rz + Math.sin(t * 0.4) * 0.012 * idle;
    }

    this._updateContact();

    const fade = characterFade(p);
    for (const key of ["charA", "charB"]) {
      const c = this.characters[key];
      if (!c) continue;
      c.setOpacity?.(fade);
      c.update(p, reach, this._contact);
    }

    /* camera */
    const mx = this.smoothPointer.x * 1.05;
    const my = this.smoothPointer.y * 0.55;
    this.camera.position.set(
      shot.pos[0] + mx + Math.sin(t * 0.21) * 0.09 * idle,
      shot.pos[1] - my + Math.cos(t * 0.17) * 0.06 * idle,
      shot.pos[2]
    );
    this.camera.fov = shot.fov + (this._portrait ? 10 : 0);
    this.camera.updateProjectionMatrix();
    this._lookTarget.set(
      shot.look[0] + mx * 0.25,
      shot.look[1] - my * 0.16,
      shot.look[2]
    );
    this.camera.lookAt(this._lookTarget);

    /* spark, anchored to where the hands actually are */
    const intensity = this.spark.update(p, BEATS.contact, this._contact, this.camera);
    if (this.bloom) {
      this.bloom.strength = this.sparkMode === "bloom" ? intensity * 0.7 : 0;
    }

    if (this.motes) {
      this.motes.rotation.y = t * 0.012 * idle;
      // The shockwave nudges the motes outward.
      this.motes.scale.setScalar(1 + intensity * 0.12);
    }

    if (this.composer && this.sparkMode === "bloom") this.composer.render();
    else this.renderer.render(this.scene, this.camera);

    if (this._onFrame) this._onFrame(p, dt, intensity);
  }

  /**
   * The point both hands reach for: the midpoint of the two shoulders, nudged
   * toward the camera so the touch reads in silhouette.
   *
   * Deriving it (rather than hard-coding a world point) is what makes the touch
   * actually land — the midpoint of the shoulders is by construction within
   * reach of both arms whenever the figures are closer than two arm-lengths.
   */
  _updateContact() {
    const ca = this.characters.charA;
    const cb = this.characters.charB;
    if (!ca || !cb) return;

    const a = ca.bones?.upper;
    const b = cb.bones?.upper;
    if (a && b) {
      // Rigged figures: aim between the shoulders and let IK carry the hands
      // there, so the target is always inside reach.
      a.getWorldPosition(_shoulderA);
      b.getWorldPosition(_shoulderB);
      this._contact.addVectors(_shoulderA, _shoulderB).multiplyScalar(0.5);
      this._contact.z += 0.35;
      return;
    }

    // Flat figures have no arm to solve, so the spark goes where the painted
    // hands actually are. Bailing out here instead left it at the fallback
    // point, firing in mid-air near the figures' midriffs.
    if (!ca.handPosition || !cb.handPosition) return;
    ca.handPosition(_shoulderA);
    cb.handPosition(_shoulderB);
    this._contact.addVectors(_shoulderA, _shoulderB).multiplyScalar(0.5);
  }

  onFrame(fn) {
    this._onFrame = fn;
  }

  dispose() {
    this.stop();
    for (const c of Object.values(this.characters)) c.dispose?.();
    this.spark.dispose();
    this.composer?.dispose?.();
    this.renderer.dispose();
    // Release the WebGL context, not just the renderer's own resources. A
    // canvas keeps its context otherwise, so the next WebGLRenderer built on
    // the same canvas gets a dead one — which is what StrictMode's double
    // mount in dev produces.
    this.renderer.forceContextLoss?.();
  }
}
