import { F as p, a as N } from "./B3DMLoaderBase-BsPRd_IY.js";
import { B as C, T as F } from "./B3DMLoaderBase-BsPRd_IY.js";
import { L as f, r as b, b as P, g as A } from "./LoaderBase-ATuDWTDB.js";
import { a as R, T as W } from "./LoaderBase-ATuDWTDB.js";
import { F as J, L as Q, a as k, b as $, P as q, c as j, d as z, Q as K, S as X, U as Y, W as Z, e as ee, f as te } from "./constants-CNHQJ8U_.js";
class x extends f {
  /**
   * Parses an I3DM buffer and returns the raw tile data.
   * @param {ArrayBuffer} buffer
   * @returns {Promise<{ version: string, featureTable: FeatureTable, batchTable: BatchTable, glbBytes: Uint8Array, gltfWorkingPath: string }>}
   */
  parse(t) {
    const e = new DataView(t), L = b(e);
    console.assert(L === "i3dm");
    const i = e.getUint32(4, !0);
    console.assert(i === 1);
    const u = e.getUint32(8, !0);
    console.assert(u === t.byteLength);
    const n = e.getUint32(12, !0), a = e.getUint32(16, !0), s = e.getUint32(20, !0), r = e.getUint32(24, !0), o = e.getUint32(28, !0), l = 32, g = t.slice(
      l,
      l + n + a
    ), c = new p(
      g,
      0,
      n,
      a
    ), h = l + n + a, y = t.slice(
      h,
      h + s + r
    ), E = new N(
      y,
      c.getData("INSTANCES_LENGTH"),
      0,
      s,
      r
    ), m = h + s + r, S = new Uint8Array(t, m, u - m);
    let B = null, U = null, D = null;
    if (o)
      B = S, U = Promise.resolve();
    else {
      const d = this.resolveExternalURL(P(S));
      D = A(d), U = fetch(d, this.fetchOptions).then((T) => {
        if (!T.ok)
          throw new Error(`I3DMLoaderBase : Failed to load file "${d}" with status ${T.status} : ${T.statusText}`);
        return T.arrayBuffer();
      }).then((T) => {
        B = new Uint8Array(T);
      });
    }
    return U.then(() => ({
      version: i,
      featureTable: c,
      batchTable: E,
      glbBytes: B,
      gltfWorkingPath: D
    }));
  }
}
class G extends f {
  /**
   * Parses a PNTS buffer and returns the raw tile data.
   * @param {ArrayBuffer} buffer
   * @returns {Promise<{ version: string, featureTable: FeatureTable, batchTable: BatchTable }>}
   */
  parse(t) {
    const e = new DataView(t), L = b(e);
    console.assert(L === "pnts");
    const i = e.getUint32(4, !0);
    console.assert(i === 1);
    const u = e.getUint32(8, !0);
    console.assert(u === t.byteLength);
    const n = e.getUint32(12, !0), a = e.getUint32(16, !0), s = e.getUint32(20, !0), r = e.getUint32(24, !0), o = 28, l = t.slice(
      o,
      o + n + a
    ), g = new p(
      l,
      0,
      n,
      a
    ), c = o + n + a, h = t.slice(
      c,
      c + s + r
    ), y = new N(
      h,
      g.getData("BATCH_LENGTH") || g.getData("POINTS_LENGTH"),
      0,
      s,
      r
    );
    return Promise.resolve({
      version: i,
      featureTable: g,
      batchTable: y
    });
  }
}
class M extends f {
  /**
   * Parses a CMPT buffer and returns an object containing each inner tile's type and raw buffer.
   * @param {ArrayBuffer} buffer
   * @returns {{ version: string, tiles: Array<{ type: string, buffer: Uint8Array, version: number }> }}
   */
  parse(t) {
    const e = new DataView(t), L = b(e);
    console.assert(L === "cmpt", 'CMPTLoader: The magic bytes equal "cmpt".');
    const i = e.getUint32(4, !0);
    console.assert(i === 1, 'CMPTLoader: The version listed in the header is "1".');
    const u = e.getUint32(8, !0);
    console.assert(u === t.byteLength, "CMPTLoader: The contents buffer length listed in the header matches the file.");
    const n = e.getUint32(12, !0), a = [];
    let s = 16;
    for (let r = 0; r < n; r++) {
      const o = new DataView(t, s, 12), l = b(o), g = o.getUint32(4, !0), c = o.getUint32(8, !0), h = new Uint8Array(t, s, c);
      a.push({
        type: l,
        buffer: h,
        version: g
      }), s += c;
    }
    return {
      version: i,
      tiles: a
    };
  }
}
export {
  C as B3DMLoaderBase,
  N as BatchTable,
  M as CMPTLoaderBase,
  J as FAILED,
  p as FeatureTable,
  x as I3DMLoaderBase,
  Q as LOADED,
  k as LOADING,
  $ as LRUCache,
  f as LoaderBase,
  R as LoaderUtils,
  q as PARSING,
  G as PNTSLoaderBase,
  j as PriorityQueue,
  z as PriorityQueueItemRemovedError,
  K as QUEUED,
  X as Scheduler,
  F as TilesRendererBase,
  W as TraversalUtils,
  Y as UNLOADED,
  Z as WGS84_FLATTENING,
  ee as WGS84_HEIGHT,
  te as WGS84_RADIUS
};
//# sourceMappingURL=index.core.js.map
