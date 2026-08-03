import * as THREE from "three";

/**
 * A figure drawn from a cut-out image rather than a mesh.
 *
 * The scene drives every character through the same surface — the timeline sets
 * `root` position and rotation, then calls `setOpacity` and `update` each frame,
 * and asks for `handPosition()` to place the contact spark. This class satisfies
 * that contract with a single textured plane, so the whole camera track, beat
 * timing and spark logic are reused unchanged.
 *
 * The one thing a flat figure cannot do is move its arm, so the reach is carried
 * by the artwork: supply images that are already in an outstretched pose, and
 * the beats bring the two figures together until the painted hands meet.
 *
 * `handUV` is what makes that land. It marks where the hand sits *within the
 * image*, in 0..1 texture coordinates with (0,0) at bottom-left. Without it the
 * spark fires at the plane's centre — the figure's midriff — which is why the
 * previous placeholder looked wrong. Measure it once per generated image:
 * open the PNG, read the hand's pixel position, divide by width and height.
 */
export class PlaneCharacter {
  /**
   * @param {object}   opts
   * @param {string}   opts.url      cut-out image with a real alpha channel
   * @param {number}   opts.height   world height; keep near 3.6 to match the
   *                                 camera track, which was tuned at that scale
   * @param {boolean}  opts.flip     mirror horizontally
   * @param {[number,number]} opts.handUV  reaching hand, in texture coords
   */
  constructor({ url, height = 3.6, flip = false, handUV = [0.5, 0.78] }) {
    this.url = url;
    this.height = height;
    this.flip = flip;
    this.handUV = handUV;
    this.root = new THREE.Group();
    this._hand = new THREE.Object3D();
    this.root.add(this._hand);
  }

  async load(loadTexture) {
    const tex = await loadTexture(this.url);
    tex.colorSpace = THREE.SRGBColorSpace;

    const aspect = (tex.image?.width || 1) / (tex.image?.height || 1);
    const width = this.height * aspect;

    this.material = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      // Trims the fringe left by soft cut-out edges without eating the
      // semi-transparent hair and fabric that sell the silhouette.
      alphaTest: 0.02,
      depthWrite: false,
      toneMapped: true,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, this.height), this.material);
    if (this.flip) this.mesh.scale.x = -1;
    this.root.add(this.mesh);

    // Park the hand marker at the anchor. Mirroring the plane mirrors the
    // artwork, so the anchor has to mirror with it or the spark lands on the
    // wrong side of the body.
    const u = this.flip ? 1 - this.handUV[0] : this.handUV[0];
    this._hand.position.set((u - 0.5) * width, (this.handUV[1] - 0.5) * this.height, 0.01);

    this._baseScale = 1;
    return this;
  }

  setOpacity(v) {
    if (this.material) this.material.opacity = v;
  }

  /**
   * @param {number} _p     scroll progress (unused: the pose is baked into the art)
   * @param {number} reach  0..1 from the timeline
   */
  update(_p, reach) {
    if (!this.mesh) return;
    // A flat figure has no arm to extend, so the reach reads as a small lean
    // and lift instead. Kept subtle — a plane that scales much at all stops
    // looking like a body and starts looking like a card.
    const s = this._baseScale * (1 + reach * 0.03);
    this.mesh.scale.set(this.flip ? -s : s, s, 1);
    this.mesh.position.y = reach * 0.06;
  }

  /** World position of the reaching hand, for the contact spark. */
  handPosition(out = new THREE.Vector3()) {
    this._hand.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this._hand.matrixWorld);
  }

  /** Present so the scene can treat plane and mesh figures identically. */
  setShading() {}

  dispose() {
    this.mesh?.geometry.dispose();
    this.material?.map?.dispose();
    this.material?.dispose();
  }
}
