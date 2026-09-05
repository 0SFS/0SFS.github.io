var z = Object.defineProperty;
var J = (h, e, t) => e in h ? z(h, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : h[e] = t;
var U = (h, e, t) => J(h, typeof e != "symbol" ? e + "" : e, t);
class S {
  /**
   * Sets the active "XRSession" value to use to scheduling rAF callbacks.
   * @param {XRSession} session
   */
  static setXRSession(e) {
    e !== this.session && (this.flushPending(), this.session = e);
  }
  /**
   * Request animation frame (defer to XR session if set)
   * @param {Function} cb
   * @returns {number}
   */
  static requestAnimationFrame(e) {
    const { session: t, pending: s } = this;
    let i;
    const a = () => {
      s.delete(i), e();
    };
    return t ? i = t.requestAnimationFrame(a) : i = requestAnimationFrame(a), s.set(i, e), i;
  }
  /**
   * Cancel animation frame via handle (defer to XR session if set)
   * @param {number} handle
   */
  static cancelAnimationFrame(e) {
    const { pending: t, session: s } = this;
    t.delete(e), s ? s.cancelAnimationFrame(e) : cancelAnimationFrame(e);
  }
  /**
   * Flush and complete pending AFs (defer to XR session if set)
   */
  static flushPending() {
    this.pending.forEach((e, t) => {
      e(), this.cancelAnimationFrame(t);
    });
  }
}
U(S, "pending", /* @__PURE__ */ new Map()), U(S, "session", null);
const x = 2 ** 30;
class T {
  /**
   * Comparator used to determine eviction order. Items that sort last are evicted first.
   * Defaults to `null` (eviction order is by last-used time).
   * @type {UnloadPriorityCallback|null}
   */
  get unloadPriorityCallback() {
    return this._unloadPriorityCallback;
  }
  set unloadPriorityCallback(e) {
    e.length === 1 ? (console.warn('LRUCache: "unloadPriorityCallback" function has been changed to take two arguments.'), this._unloadPriorityCallback = (t, s) => {
      const i = e(t), a = e(s);
      return i < a ? -1 : i > a ? 1 : 0;
    }) : this._unloadPriorityCallback = e;
  }
  constructor() {
    this.minSize = 6e3, this.maxSize = 8e3, this.minBytesSize = 0.3 * x, this.maxBytesSize = 0.4 * x, this.unloadPercent = 0.05, this.autoMarkUnused = !0, this.itemSet = /* @__PURE__ */ new Map(), this.itemList = [], this.usedSet = /* @__PURE__ */ new Set(), this.callbacks = /* @__PURE__ */ new Map(), this.unloadingHandle = -1, this.cachedBytes = 0, this.bytesMap = /* @__PURE__ */ new Map(), this.loadedSet = /* @__PURE__ */ new Set(), this._unloadPriorityCallback = null;
    const e = this.itemSet;
    this.defaultPriorityCallback = (t) => e.get(t);
  }
  /**
   * Returns whether the cache has reached its maximum item count or byte size.
   * @returns {boolean}
   */
  isFull() {
    return this.itemSet.size >= this.maxSize || this.cachedBytes >= this.maxBytesSize;
  }
  /**
   * Returns the byte size registered for the given item, or 0 if not tracked.
   * @param {any} item
   * @returns {number}
   */
  getMemoryUsage(e) {
    return this.bytesMap.get(e) || 0;
  }
  /**
   * Sets the byte size for the given item, updating the total `cachedBytes` count.
   * @param {any} item
   * @param {number} bytes
   */
  setMemoryUsage(e, t) {
    const { bytesMap: s, itemSet: i } = this;
    i.has(e) && (this.cachedBytes -= s.get(e) || 0, s.set(e, t), this.cachedBytes += t);
  }
  /**
   * Adds an item to the cache. Returns false if the item already exists or the cache is full.
   * @param {any} item
   * @param {RemoveCallback} removeCb - Called with the item when it is evicted
   * @returns {boolean}
   */
  add(e, t) {
    const s = this.itemSet;
    if (s.has(e) || this.isFull())
      return !1;
    const i = this.usedSet, a = this.itemList, n = this.callbacks;
    return a.push(e), i.add(e), s.set(e, Date.now()), n.set(e, t), !0;
  }
  /**
   * Returns whether the given item is in the cache.
   * @param {any} item
   * @returns {boolean}
   */
  has(e) {
    return this.itemSet.has(e);
  }
  /**
   * Removes an item from the cache immediately, invoking its removal callback.
   * Returns false if the item was not in the cache.
   * @param {any} item
   * @returns {boolean}
   */
  remove(e) {
    const t = this.usedSet, s = this.itemSet, i = this.itemList, a = this.bytesMap, n = this.callbacks, o = this.loadedSet;
    if (s.has(e)) {
      this.cachedBytes -= a.get(e) || 0, a.delete(e), n.get(e)(e);
      const u = i.indexOf(e);
      return i.splice(u, 1), t.delete(e), s.delete(e), n.delete(e), o.delete(e), !0;
    }
    return !1;
  }
  /**
   * Marks whether an item has finished loading. Unloaded items may be evicted early
   * when the cache is over its max size limits, even if they are marked as used.
   * @param {any} item
   * @param {boolean} value
   */
  setLoaded(e, t) {
    const { itemSet: s, loadedSet: i } = this;
    s.has(e) && (t === !0 ? i.add(e) : i.delete(e));
  }
  /**
   * Marks an item as used in the current frame, preventing it from being evicted.
   * @param {any} item
   */
  markUsed(e) {
    const t = this.itemSet, s = this.usedSet;
    t.has(e) && !s.has(e) && (t.set(e, Date.now()), s.add(e));
  }
  /**
   * Marks an item as unused, making it eligible for eviction.
   * @param {any} item
   */
  markUnused(e) {
    this.usedSet.delete(e);
  }
  /**
   * Marks all items in the cache as unused.
   */
  markAllUnused() {
    this.usedSet.clear();
  }
  /**
   * Returns whether the given item is currently marked as used.
   * @param {any} item
   * @returns {boolean}
   */
  isUsed(e) {
    return this.usedSet.has(e);
  }
  /**
   * Evicts unused items until the cache is within its min size and byte limits.
   * Items are sorted by `unloadPriorityCallback` before eviction.
   */
  // TODO: this should be renamed because it's not necessarily unloading all unused content
  // Maybe call it "cleanup" or "unloadToMinSize"
  unloadUnusedContent() {
    const {
      unloadPercent: e,
      minSize: t,
      maxSize: s,
      itemList: i,
      itemSet: a,
      usedSet: n,
      loadedSet: o,
      callbacks: u,
      bytesMap: m,
      minBytesSize: r,
      maxBytesSize: y
    } = this, f = i.length - n.size, B = i.length - o.size, g = Math.max(Math.min(i.length - t, f), 0), p = this.cachedBytes - r, w = this.unloadPriorityCallback || this.defaultPriorityCallback;
    let k = !1;
    const F = g > 0 && f > 0 || B && i.length > s;
    if (f && this.cachedBytes > r || B && this.cachedBytes > y || F) {
      i.sort((l, d) => {
        const P = n.has(l), R = n.has(d);
        if (P === R) {
          const A = o.has(l), _ = o.has(d);
          return A === _ ? -w(l, d) : A ? 1 : -1;
        } else
          return P ? 1 : -1;
      });
      const L = Math.max(t * e, g * e), C = Math.ceil(Math.min(L, f, g)), v = Math.max(e * p, e * r), E = Math.min(v, p);
      let c = 0, b = 0;
      for (; this.cachedBytes - b > y || i.length - c > s; ) {
        const l = i[c], d = m.get(l) || 0;
        if (n.has(l) && o.has(l) || this.cachedBytes - b - d < y && i.length - c <= s)
          break;
        b += d, c++;
      }
      for (; b < E || c < C; ) {
        const l = i[c], d = m.get(l) || 0;
        if (n.has(l) || this.cachedBytes - b - d < r && c >= C)
          break;
        b += d, c++;
      }
      i.splice(0, c).forEach((l) => {
        this.cachedBytes -= m.get(l) || 0, u.get(l)(l), m.delete(l), a.delete(l), u.delete(l), o.delete(l), n.delete(l);
      }), k = c < g || b < p && c < f, k = k && c > 0;
    }
    k && (this.unloadingHandle = S.requestAnimationFrame(() => this.scheduleUnload()));
  }
  /**
   * Schedules `unloadUnusedContent` to run asynchronously via microtask.
   */
  scheduleUnload() {
    S.cancelAnimationFrame(this.unloadingHandle), this.scheduled || (this.scheduled = !0, queueMicrotask(() => {
      this.scheduled = !1, this.unloadUnusedContent();
    }));
  }
}
class M extends Error {
  constructor() {
    super("PriorityQueue: Item removed"), this.name = "PriorityQueueItemRemovedError";
  }
}
class G {
  /**
   * returns whether tasks are queued or actively running
   * @readonly
   * @type {boolean}
   */
  get running() {
    return this.items.length !== 0 || this.currJobs !== 0;
  }
  /**
   * Callback used to schedule when to run jobs next, so more work doesn't happen in a
   * single frame than there is time for. Defaults to `requestAnimationFrame`. Should be
   * overridden in scenarios where `requestAnimationFrame` is not reliable, such as when
   * running in WebXR.
   * @type {SchedulingCallback}
   * @deprecated
   */
  get schedulingCallback() {
    return this._schedulingCallback;
  }
  set schedulingCallback(e) {
    console.log('PriorityQueue: Setting "schedulingCallback" has been deprecated. Use Scheduler to switch to an XRSession rAF, instead.'), this._schedulingCallback = e;
  }
  constructor() {
    this.maxJobs = 6, this.items = [], this.callbacks = /* @__PURE__ */ new Map(), this.currJobs = 0, this.scheduled = !1, this.autoUpdate = !0, this.priorityCallback = null, this._schedulingCallback = (e) => {
      S.requestAnimationFrame(e);
    }, this._runjobs = () => {
      this.scheduled = !1, this.tryRunJobs();
    };
  }
  /**
   * Sorts the pending item list using `priorityCallback`, if set.
   */
  sort() {
    const e = this.priorityCallback, t = this.items;
    e !== null && t.sort(e);
  }
  /**
   * Returns whether the given item is currently queued.
   * @param {any} item
   * @returns {boolean}
   */
  has(e) {
    return this.callbacks.has(e);
  }
  /**
   * Adds an item to the queue and returns a Promise that resolves when the item's
   * callback completes, or rejects if the item is removed before running.
   * @param {any} item
   * @param {ItemCallback} callback - Invoked with `item` when it is dequeued; may return a Promise
   * @returns {Promise<any>}
   */
  add(e, t) {
    const s = {
      callback: t,
      reject: null,
      resolve: null,
      promise: null
    };
    return s.promise = new Promise((i, a) => {
      const n = this.items, o = this.callbacks;
      s.resolve = i, s.reject = a, n.unshift(e), o.set(e, s), this.autoUpdate && this.scheduleJobRun();
    }), s.promise;
  }
  /**
   * Removes an item from the queue, rejecting its promise with `PriorityQueueItemRemovedError`.
   * @param {any} item
   */
  remove(e) {
    const t = this.items, s = this.callbacks, i = t.indexOf(e);
    if (i !== -1) {
      const a = s.get(e);
      a.promise.catch((n) => {
        if (!(n instanceof M))
          throw n;
      }), a.reject(new M()), t.splice(i, 1), s.delete(e);
    }
  }
  /**
   * Removes all queued items for which `filter` returns true.
   * @param {FilterCallback} filter - Called with each item; return true to remove
   */
  removeByFilter(e) {
    const { items: t } = this;
    for (let s = 0; s < t.length; s++) {
      const i = t[s];
      e(i) && (this.remove(i), s--);
    }
  }
  /**
   * Immediately attempts to dequeue and run pending jobs up to `maxJobs` concurrency.
   */
  tryRunJobs() {
    this.sort();
    const e = this.items, t = this.callbacks, s = this.maxJobs;
    let i = 0;
    const a = () => {
      this.currJobs--, this.autoUpdate && this.scheduleJobRun();
    };
    for (; s > this.currJobs && e.length > 0 && i < s; ) {
      this.currJobs++, i++;
      const n = e.pop(), { callback: o, resolve: u, reject: m } = t.get(n);
      t.delete(n);
      let r;
      try {
        r = o(n);
      } catch (y) {
        m(y), a();
      }
      r instanceof Promise ? r.then(u).catch(m).finally(a) : (u(r), a());
    }
  }
  /**
   * Schedules a deferred call to `tryRunJobs` via `schedulingCallback`.
   */
  scheduleJobRun() {
    this.scheduled || (this._schedulingCallback(this._runjobs), this.scheduled = !0);
  }
}
const N = -1, Q = 0, j = 1, q = 2, H = 3, O = 4, W = 6378137, X = 1 / 298.257223563, Y = 6356752314245179e-9;
export {
  N as F,
  O as L,
  H as P,
  j as Q,
  S,
  Q as U,
  X as W,
  q as a,
  T as b,
  G as c,
  M as d,
  Y as e,
  W as f
};
//# sourceMappingURL=constants-CNHQJ8U_.js.map
