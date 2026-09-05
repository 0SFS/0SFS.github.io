import { B as E, T as L } from "./B3DMLoaderBase-BsPRd_IY.js";
import { L as O, g as j, r as S } from "./LoaderBase-ATuDWTDB.js";
import { TransformNode as W } from "@babylonjs/core/Meshes/transformNode";
import { Matrix as u, Quaternion as A, Vector3 as i } from "@babylonjs/core/Maths/math.vector";
import { Frustum as N } from "@babylonjs/core/Maths/math.frustum";
import { Observable as Q } from "@babylonjs/core/Misc/observable";
import { Plane as U } from "@babylonjs/core/Maths/math.plane";
import { LoadAssetContainerAsync as X } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF/2.0";
import { BoundingSphere as Y } from "@babylonjs/core/Culling/boundingSphere";
import { BoundingBox as G } from "@babylonjs/core/Culling/boundingBox";
const P = /* @__PURE__ */ u.Identity();
class V extends O {
  /**
   * @param {Scene} scene - The Babylon.js scene to load assets into.
   */
  constructor(e) {
    super(), this.scene = e, this.adjustmentTransform = u.Identity();
  }
  /**
   * @param {ArrayBuffer} buffer - The raw GLTF or GLB file data.
   * @param {string} uri - URI used for resolving relative resources.
   * @param {string} extension - File extension, either `'gltf'` or `'glb'`.
   * @returns {Promise<{scene: TransformNode, container: AssetContainer, metadata: Object|null}>}
   */
  async parse(e, t, n) {
    const { scene: s, workingPath: r, adjustmentTransform: o } = this;
    let a = r;
    a.length && !/[\\/]$/.test(a) && (a += "/");
    const c = n === "gltf" ? ".gltf" : ".glb";
    let f = null;
    const h = await X(
      new File([e], t),
      s,
      {
        pluginExtension: c,
        rootUrl: a,
        pluginOptions: {
          gltf: {
            onParsed: (w) => {
              f = w.json;
            }
          }
        }
      }
    );
    h.addAllToScene();
    const d = h.rootNodes[0];
    d.rotationQuaternion = A.Identity();
    const m = d.computeWorldMatrix(!0);
    return o.multiplyToRef(m, P), P.decompose(d.scaling, d.rotationQuaternion, d.position), {
      scene: d,
      container: h,
      metadata: f
    };
  }
}
class H extends E {
  /**
   * @param {Scene} scene - The Babylon.js scene to load assets into.
   */
  constructor(e) {
    super(), this.scene = e, this.adjustmentTransform = u.Identity();
  }
  /**
   * @param {ArrayBuffer} buffer - The raw B3DM file data.
   * @param {string} uri - URI used for resolving relative resources.
   * @returns {Promise<Object>}
   */
  async parse(e, t) {
    const n = super.parse(e), { scene: s, workingPath: r, fetchOptions: o, adjustmentTransform: a } = this, c = new V(s);
    c.workingPath = r, c.fetchOptions = o, a && (c.adjustmentTransform = a);
    const f = await c.parse(n.glbBytes, t, "glb"), h = f.scene;
    return {
      ...n,
      scene: h,
      container: f.container,
      metadata: f.metadata
    };
  }
}
const _ = /* @__PURE__ */ new i();
class Z {
  constructor() {
    this.min = new i(-1, -1, -1), this.max = new i(1, 1, 1), this.transform = u.Identity(), this.inverseTransform = u.Identity(), this.points = new Array(8).fill(null).map(() => new i());
  }
  update() {
    const { min: e, max: t, points: n, transform: s } = this;
    s.invertToRef(this.inverseTransform);
    let r = 0;
    for (let o = 0; o <= 1; o++)
      for (let a = 0; a <= 1; a++)
        for (let c = 0; c <= 1; c++)
          n[r].set(
            o === 0 ? e.x : t.x,
            a === 0 ? e.y : t.y,
            c === 0 ? e.z : t.z
          ), i.TransformCoordinatesToRef(
            n[r],
            s,
            n[r]
          ), r++;
  }
  clampPoint(e, t) {
    const { min: n, max: s, transform: r, inverseTransform: o } = this;
    return i.TransformCoordinatesToRef(e, o, t), t.x = Math.max(n.x, Math.min(s.x, t.x)), t.y = Math.max(n.y, Math.min(s.y, t.y)), t.z = Math.max(n.z, Math.min(s.z, t.z)), i.TransformCoordinatesToRef(t, r, t), t;
  }
  distanceToPoint(e) {
    return this.clampPoint(e, _), i.Distance(_, e);
  }
  intersectsFrustum(e) {
    return G.IsInFrustum(this.points, e);
  }
}
const g = /* @__PURE__ */ new i(), b = /* @__PURE__ */ new i(), T = /* @__PURE__ */ new i(), y = /* @__PURE__ */ new i(), I = /* @__PURE__ */ new i();
class $ {
  constructor() {
    this.sphere = null, this.obb = null;
  }
  setSphereData(e, t, n, s, r) {
    const o = new Y(I, I), a = o.centerWorld.set(e, t, n);
    i.TransformCoordinatesToRef(a, r, a), r.decompose(y, null, null), o.radiusWorld = s * Math.max(Math.abs(y.x), Math.abs(y.y), Math.abs(y.z)), this.sphere = o;
  }
  setObbData(e, t) {
    const n = new Z();
    g.set(e[3], e[4], e[5]), b.set(e[6], e[7], e[8]), T.set(e[9], e[10], e[11]);
    const s = g.length(), r = b.length(), o = T.length();
    g.normalize(), b.normalize(), T.normalize(), s === 0 && i.CrossToRef(b, T, g), r === 0 && i.CrossToRef(g, T, b), o === 0 && i.CrossToRef(g, b, T), n.transform = u.FromValues(
      g.x,
      b.x,
      T.x,
      e[0],
      g.y,
      b.y,
      T.y,
      e[1],
      g.z,
      b.z,
      T.z,
      e[2],
      0,
      0,
      0,
      1
    ).transpose().multiply(t), n.min.set(-s, -r, -o), n.max.set(s, r, o), n.update(), this.obb = n;
  }
  distanceToPoint(e) {
    const { sphere: t, obb: n } = this;
    let s = -1 / 0, r = -1 / 0;
    return t && (s = i.Distance(e, t.centerWorld) - t.radiusWorld, s = Math.max(s, 0)), n && (r = n.distanceToPoint(e)), s > r ? s : r;
  }
  intersectsFrustum(e) {
    const { sphere: t, obb: n } = this;
    return t && !t.isInFrustum(e) || n && !n.intersectsFrustum(e) ? !1 : !!(t || n);
  }
}
const D = /* @__PURE__ */ u.Identity(), C = /* @__PURE__ */ new i(), B = /* @__PURE__ */ new Array(6).fill(null).map(() => new U(0, 0, 0, 0));
class ce extends L {
  /**
   * @param {string} url - URL of the root tileset JSON.
   * @param {Scene} scene - The Babylon.js scene to render tiles into.
   */
  constructor(e, t) {
    super(e), this.scene = t, this.group = new W("tiles-root", t), this.checkCollisions = !1, this._upRotationMatrix = u.Identity(), this._observables = /* @__PURE__ */ new Map();
  }
  addEventListener(e, t) {
    this._observables.has(e) || this._observables.set(e, new Q()), this._observables.get(e).add(t);
  }
  removeEventListener(e, t) {
    if (!this._observables.has(e))
      return;
    this._observables.get(e).removeCallback(t);
  }
  dispatchEvent(e) {
    if (!this._observables.has(e.type))
      return;
    this._observables.get(e.type).notifyObservers(e);
  }
  loadRootTileset(...e) {
    return super.loadRootTileset(...e).then((t) => {
      const { asset: n } = t;
      switch ((n && n.gltfUpAxis || "y").toLowerCase()) {
        case "x":
          u.RotationYToRef(-Math.PI / 2, this._upRotationMatrix);
          break;
        case "y":
          u.RotationXToRef(Math.PI / 2, this._upRotationMatrix);
          break;
      }
      return t;
    });
  }
  preprocessNode(e, t, n = null) {
    super.preprocessNode(e, t, n);
    const s = u.Identity();
    e.transform && u.FromValuesToRef(...e.transform, s), n && s.multiplyToRef(n.engineData.transform, s);
    const r = u.Identity();
    s.invertToRef(r);
    const o = new $();
    "sphere" in e.boundingVolume && o.setSphereData(...e.boundingVolume.sphere, s), "box" in e.boundingVolume && o.setObbData(e.boundingVolume.box, s), e.engineData.transform = s, e.engineData.transformInverse = r, e.engineData.boundingVolume = o, e.engineData.active = !1, e.engineData.scene = null, e.engineData.container = null;
  }
  async parseTile(e, t, n, s, r) {
    const o = t.engineData, a = this.scene, c = j(s), f = this.fetchOptions, h = o.transform, d = this._upRotationMatrix;
    let m = null;
    const w = (S(e) || n).toLowerCase();
    switch (w) {
      case "b3dm": {
        const l = new H(a);
        l.workingPath = c, l.fetchOptions = f, l.adjustmentTransform.copyFrom(d), m = await l.parse(e, s);
        break;
      }
      case "gltf":
      case "glb": {
        const l = new V(a);
        l.workingPath = c, l.fetchOptions = f, l.adjustmentTransform.copyFrom(d), m = await l.parse(e, s, n);
        break;
      }
      default:
        throw new Error(`BabylonTilesRenderer: Content type "${w}" not supported.`);
    }
    const p = m.scene;
    if (p.setEnabled(!1), p.computeWorldMatrix(!0).multiply(h).decompose(p.scaling, p.rotationQuaternion, p.position), r.aborted) {
      m.container.dispose();
      return;
    }
    if (this.checkCollisions)
      for (const l of p.getChildMeshes())
        l.checkCollisions = !0;
    o.scene = p, o.container = m.container, o.metadata = m.metadata || null;
  }
  disposeTile(e) {
    super.disposeTile(e);
    const t = e.engineData;
    t.container && (t.container.dispose(), t.container = null, t.scene = null, t.metadata = null);
  }
  setTileVisible(e, t) {
    const s = e.engineData.scene;
    s && (t ? (s.parent = this.group, s.setEnabled(!0)) : (s.parent = null, s.setEnabled(!1)), super.setTileVisible(e, t));
  }
  calculateBytesUsed(e) {
    return 1;
  }
  calculateTileViewError(e, t) {
    const { scene: n } = this, r = e.engineData.boundingVolume, o = n.activeCamera, a = n.getEngine(), c = a.getHardwareScalingLevel(), f = a.getRenderWidth() * c, h = a.getRenderHeight() * c, m = o.getProjectionMatrix().m, w = m[15] === 1;
    let p, l;
    if (w) {
      const R = 2 / m[0], F = 2 / m[5];
      l = Math.max(F / h, R / f);
    } else
      p = 2 / m[5] / h;
    this.group.getWorldMatrix().invertToRef(D), i.TransformCoordinatesToRef(o.globalPosition, D, C), N.GetPlanesToRef(o.getTransformationMatrix(!0), B);
    const k = B.map((R) => R.transform(D)), M = r.distanceToPoint(C);
    let v;
    w ? v = e.geometricError / l : v = M === 0 ? 1 / 0 : e.geometricError / (M * p);
    const z = r.intersectsFrustum(k);
    t.inView = z, t.error = v, t.distanceFromCamera = M;
  }
  /**
   * Disposes the renderer, releasing all loaded tile content and the root transform node.
   * @returns {void}
   */
  dispose() {
    super.dispose(), this.group.dispose();
  }
}
export {
  ce as TilesRenderer
};
//# sourceMappingURL=index.babylonjs.js.map
