"use strict";
/** Extracted from Earth App/vite/appFilesWorker.js; host policy controls retention.
 * Pages are always network-first; no media cache or app/runtime is constructed.
 * Cross-origin isolation (docs/docs/proposals/webassembly.md, step 3): the build
 * says whether it may isolate (manifest.isolation), the page says whether it
 * wants to in the worker's own address, `?keep=1&isolate=1`, which survives the
 * worker being stopped; a page changes either by registering another address. */
function install(worker, manifest) {
  const policy = new URL(worker.location.href).searchParams;
  // An address without a policy is an older page's: it kept files and did not isolate. A build that keeps nothing never does.
  const keeping = manifest.keepFiles !== false && policy.get("keep") !== "0";
  const isolation = manifest.isolation ?? "off";
  const isolating = isolation !== "off" && policy.get("isolate") === "1";
  const suffix = isolation === "report-only" ? "-Report-Only" : "";
  // COEP require-corp, not credentialless, which Safari may lack; CORP so an isolated page elsewhere may load these files.
  const isolationHeaders = isolating ? [[`Cross-Origin-Opener-Policy${suffix}`, "same-origin"],
    [`Cross-Origin-Embedder-Policy${suffix}`, "require-corp"], ["Cross-Origin-Resource-Policy", "cross-origin"]] : [];
  // Bodiless statuses: a Response with one of these cannot be given a body, even an empty stream.
  const bodiless = new Set([101, 103, 204, 205, 304]);
  /** The response as served, with the isolation headers; stored responses keep what the server sent. Status 0 and opaque redirects cannot be rebuilt. */
  const served = response => {
    if (!isolationHeaders.length || !response || response.status === 0 || response.type === "opaqueredirect" || response.type === "opaque") return response;
    const headers = new Headers(response.headers);
    for (const [name, value] of isolationHeaders) headers.set(name, value);
    return new Response(bodiless.has(response.status) ? null : response.body, { status: response.status, statusText: response.statusText, headers });
  };
  // Documents and workers carry the page's isolation; other same-origin loads need no headers, so they pass by unless kept.
  const needsHeaders = request => request.mode === "navigate" || request.destination === "worker" || request.destination === "sharedworker";
  const files = manifest.files.map(file => file.url);
  const paths = new Set(files.map(name => new URL(name, worker.location.href).pathname));
  // One store for the worker's own address: a build's files, whichever of its pages asked for them.
  const cacheName = `${manifest.cacheNamespace} ${new URL(worker.location.href).pathname}`;
  const base = new URL(manifest.base, worker.location.origin);
  const retained = new Set(manifest.retainedFiles.map(file => new URL(file.url, worker.location.href).pathname));
  const matchOptions = { ignoreVary: true, ignoreSearch: true };
  // Set when the page turns keeping off: until the page closes, this worker still sees its requests, and passes them by.
  let forgotten = false;

  /** A response worth keeping: the file itself, from this site. */
  const keepable = response => Boolean(response) && response.ok && response.status === 200 && response.type === "basic" && !response.redirected;

  /** The path of a URL this build lists, or null. */
  const listed = href => {
    let url;
    try { url = new URL(href, worker.location.href); } catch { return null; }
    return url.origin === worker.location.origin && paths.has(url.pathname) ? url.pathname : null;
  };

  async function answer(event, request, path) {
    const cache = await worker.caches.open(cacheName);
    const kept = await cache.match(path, matchOptions);
    if (kept) return kept;
    const response = await worker.fetch(request);
    if (keepable(response)) event.waitUntil(cache.put(path, response.clone()).catch(() => {}));
    return response;
  }

  worker.addEventListener("install", event => {
    // Nothing is fetched ahead: files are kept as the app asks for them. The new list takes over at once.
    event.waitUntil(worker.skipWaiting());
  });

  worker.addEventListener("activate", event => {
    event.waitUntil((async () => {
      // The page is asked for while the worker starts, not after.
      await worker.registration.navigationPreload?.enable().catch(() => {});
      // A worker that keeps nothing has no store: what an earlier one kept goes, as the page that turned keeping off asks.
      if (!keeping) await worker.caches.delete(cacheName).catch(() => {});
      else {
        const cache = await worker.caches.open(cacheName);
        // Older pages may still request their files. Deletion is an explicit host
        // policy; retained legacy resources survive either activation policy.
        if (manifest.retention === "current-only") for (const request of await cache.keys()) {
          if (!paths.has(new URL(request.url).pathname) && !retained.has(new URL(request.url).pathname)) await cache.delete(request);
        }
      }
      await worker.clients.claim();
    })());
  });

  worker.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;
    if (request.mode === "navigate") {
      event.respondWith((async () => {
        // The request made while the worker started, if the browser made one; a failed one is asked again, as a page without this worker would be.
        const preloaded = await Promise.resolve(event.preloadResponse).catch(() => undefined);
        return served(preloaded || await worker.fetch(request));
      })());
      return;
    }
    // As coi-serviceworker: a request that may only be answered from the browser's cache is not this worker's to fetch.
    if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
    let url;
    try { url = new URL(request.url); } catch { return; }
    const own = url.origin === worker.location.origin;
    const isolate = () => { if (isolationHeaders.length && own && needsHeaders(request)) event.respondWith(worker.fetch(request).then(served)); };
    if (forgotten || !keeping) { isolate(); return; }
    const path = listed(request.url);
    if (path) { event.respondWith(answer(event, request, path).then(served)); return; }
    // Existing older files are usable by still-open pages. Do not acquire an
    // unknown file merely because the worker controls the deployment root.
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) { isolate(); return; }
    if (retained.has(url.pathname) || manifest.retention === "retain-older") event.respondWith((async () => {
      const cache = await worker.caches.open(cacheName);
      const old = await cache.match(url.pathname, matchOptions);
      if (old) return served(old);
      if (retained.has(url.pathname)) return served(await answer(event, request, url.pathname));
      return served(await worker.fetch(request));
    })());
    else isolate();
  });

  // The page names what it loaded before this worker controlled it; those files are kept from the browser's cache.
  worker.addEventListener("message", event => {
    const data = event.data;
    if (manifest.identity && data?.identity !== manifest.identity) return;
    if (data?.type === "foss-earth-forget") forgotten = true;
    if (!keeping || data?.type !== "foss-earth-keep" || !Array.isArray(data.urls)) return;
    forgotten = false;
    event.waitUntil((async () => {
      const cache = await worker.caches.open(cacheName);
      for (const href of data.urls) {
        const path = typeof href === "string" ? listed(href) : null;
        if (forgotten || !path || await cache.match(path, matchOptions)) continue;
        const response = await worker.fetch(path, { cache: "force-cache" }).catch(() => null);
        if (keepable(response)) await cache.put(path, response).catch(() => {});
      }
    })());
  });
}

install(self, {"schemaVersion":1,"base":"/","scope":"/","workerFile":"foss-earth-sw.js","cacheNamespace":"0sfs-app-files","identity":null,"retention":"retain-older","isolation":"enforce","keepFiles":false,"files":[{"url":"/assets/abstractAudioBus-C7DOF6da.js"},{"url":"/assets/abstractSoundInstance-BqYjg609.js"},{"url":"/assets/abstractSoundSource-Cnu8WkdW.js"},{"url":"/assets/animation-DCqrrLVJ.js"},{"url":"/assets/animationGroup-BvyL0azD.js"},{"url":"/assets/atlasImagery.worker-DUeB22SI.js"},{"url":"/assets/audio-dsp-EFvwdOhP.wasm"},{"url":"/assets/audioEngine-CREut1Mj.js"},{"url":"/assets/babylon-shader-store-D-XQlhUT.js"},{"url":"/assets/babylon-shaders-glsl-KXp7RBuG.js"},{"url":"/assets/babylon-shaders-static-6Emcicep.js"},{"url":"/assets/babylon-shaders-wgsl-DXw1mixw.js"},{"url":"/assets/baseTexture.polynomial-t9nBS5sZ.js"},{"url":"/assets/basisTextureLoader-D_N_-JdW.js"},{"url":"/assets/brdfTextureTools-BY0e8viL.js"},{"url":"/assets/buffer-Fqm-Uhlp.js"},{"url":"/assets/client-D_ZNDEUU.js"},{"url":"/assets/compassCenterSphere-BWE00PMz.js"},{"url":"/assets/constants-CyZt4oGm.js"},{"url":"/assets/controlPosition-CdclOC0t.css"},{"url":"/assets/controlPosition-TbCPYC-9.js"},{"url":"/assets/createFlightSimApp-3Sx8UnSK.css"},{"url":"/assets/createFlightSimApp-Do__5gme.js"},{"url":"/assets/createFullscreenNotice-B9NL174q.js"},{"url":"/assets/createFullscreenNotice-k1miaR4J.css"},{"url":"/assets/createPhoneControllerApp-B_mUpZga.css"},{"url":"/assets/createPhoneControllerApp-BAa_sDIu.js"},{"url":"/assets/createPhoneControlSession-CL4Hh4Pc.js"},{"url":"/assets/createPhonePairingPanel-CMsWJve6.js"},{"url":"/assets/createPhonePairingPanel-CUZwpwy7.css"},{"url":"/assets/cubemapToSphericalPolynomial-B4Mynn5O.js"},{"url":"/assets/dataBuffer-C-wqV4qF.js"},{"url":"/assets/dds-sUTxmG_c.js"},{"url":"/assets/ddsTextureLoader-CadV9VSy.js"},{"url":"/assets/decorators-BOtej2xA.js"},{"url":"/assets/devTools-DmD3AOL3.js"},{"url":"/assets/drawWrapper-DxEc7k4_.js"},{"url":"/assets/drawWrapper.functions-t22iQNzU.js"},{"url":"/assets/dspProcessor-DjaQhk10.js"},{"url":"/assets/dumpTools-Dpdlbn-Z.js"},{"url":"/assets/effectFallbacks-sBrljMdo.js"},{"url":"/assets/effectRenderer-CKwPUB-H.js"},{"url":"/assets/egm2008-15-nvvz7MYe.bin"},{"url":"/assets/egm2008-30-BpPXoGjA.bin"},{"url":"/assets/egm2008-60-bDxgbz8U.bin"},{"url":"/assets/engine-smoke-flipbook-LU3ukRVc.png"},{"url":"/assets/engineStore-DYzBhiRl.js"},{"url":"/assets/envTextureLoader-BonsfPvT.js"},{"url":"/assets/exrTextureLoader-Ct7W2DqL.js"},{"url":"/assets/f135-exhaust-lut.manifest-Cj0EhDXS.json"},{"url":"/assets/f135-exhaust-spatial-Bz5-hsfX.png"},{"url":"/assets/floatingOriginMatrixOverrides-D4gbxt6t.js"},{"url":"/assets/flowGraphArrayIndexBlock-C4f-Y0jL.js"},{"url":"/assets/flowGraphAssetsContext-WtUyuDAI.js"},{"url":"/assets/flowGraphAsyncExecutionBlock-BiLpVBmb.js"},{"url":"/assets/flowGraphBezierCurveEasingBlock-F77gu6sK.js"},{"url":"/assets/flowGraphBinaryOperationBlock-e-EmYR3S.js"},{"url":"/assets/flowGraphBlock-BfCG8hXK.js"},{"url":"/assets/flowGraphBranchBlock-CqdDR0Ox.js"},{"url":"/assets/flowGraphCachedOperationBlock-BZG3roOp.js"},{"url":"/assets/flowGraphCancelDelayBlock-8qjycl-1.js"},{"url":"/assets/flowGraphCodeExecutionBlock-C5mMwimc.js"},{"url":"/assets/flowGraphConditionalDataBlock-C8ufVsuW.js"},{"url":"/assets/flowGraphConsoleLogBlock-C2Uk6U9R.js"},{"url":"/assets/flowGraphConstantBlock-CnvnuqDY.js"},{"url":"/assets/flowGraphContextBlock-Ds3d3Skq.js"},{"url":"/assets/flowGraphCounterBlock-o3C7HwPS.js"},{"url":"/assets/flowGraphDataSwitchBlock-BJ0kAvdB.js"},{"url":"/assets/flowGraphDebounceBlock-BoCuib5d.js"},{"url":"/assets/flowGraphDoNBlock-DyxCLDGd.js"},{"url":"/assets/flowGraphEasingBlock-r4rSWvHg.js"},{"url":"/assets/flowGraphExecutionBlock-Crzm0aiI.js"},{"url":"/assets/flowGraphExecutionBlockWithOutSignal-BxPQEddy.js"},{"url":"/assets/flowGraphFlipFlopBlock-BAXjTvYe.js"},{"url":"/assets/flowGraphForLoopBlock-BrzMfxRn.js"},{"url":"/assets/flowGraphFunctionReferenceBlock-Bu371W7n.js"},{"url":"/assets/flowGraphGetAssetBlock-BQ1atIBR.js"},{"url":"/assets/flowGraphGetPropertyBlock-CzPmHV5D.js"},{"url":"/assets/flowGraphGetVariableBlock-BwJ7XJ5F.js"},{"url":"/assets/flowGraphGLTFDataProvider-DjoXZBYg.js"},{"url":"/assets/flowGraphIndexOfBlock-DVHnlE-8.js"},{"url":"/assets/flowGraphInterpolationBlock-DQEccFlX.js"},{"url":"/assets/flowGraphJsonPointerParserBlock-CH-jIgR0.js"},{"url":"/assets/flowGraphMathBlocks-D5DUt_KF.js"},{"url":"/assets/flowGraphMathCombineExtractBlocks-BFeFWRzx.js"},{"url":"/assets/flowGraphMatrixMathBlocks--Gj-Z735.js"},{"url":"/assets/flowGraphMeshPickEventBlock-9NHcJhdN.js"},{"url":"/assets/flowGraphMultiGateBlock-bl-mo5md.js"},{"url":"/assets/flowGraphPauseAnimationBlock-C9eX9lMY.js"},{"url":"/assets/flowGraphPlayAnimationBlock-BDU1ohmw.js"},{"url":"/assets/flowGraphPointerOutEventBlock-DmVdgEvf.js"},{"url":"/assets/flowGraphPointerOverEventBlock-Dr9YVgGj.js"},{"url":"/assets/flowGraphReceiveCustomEventBlock-DXBNNiNZ.js"},{"url":"/assets/flowGraphSceneReadyEventBlock-CSfEWXbS.js"},{"url":"/assets/flowGraphSceneTickEventBlock-DdnOWm7U.js"},{"url":"/assets/flowGraphSendCustomEventBlock-dAWUVpoX.js"},{"url":"/assets/flowGraphSequenceBlock-BtB3ZnFu.js"},{"url":"/assets/flowGraphSetDelayBlock-DWsuU2wf.js"},{"url":"/assets/flowGraphSetPropertyBlock-DiBikviW.js"},{"url":"/assets/flowGraphSetVariableBlock-9izmzGhX.js"},{"url":"/assets/flowGraphStopAnimationBlock-CIGVUeIb.js"},{"url":"/assets/flowGraphSwitchBlock-CpbnzePz.js"},{"url":"/assets/flowGraphThrottleBlock-CyEiJKjh.js"},{"url":"/assets/flowGraphTransformCoordinatesSystemBlock-BVN_YmMC.js"},{"url":"/assets/flowGraphTypeToTypeBlocks-D1qQ9tQE.js"},{"url":"/assets/flowGraphUnaryOperationBlock-BlKNjrT1.js"},{"url":"/assets/flowGraphVectorMathBlocks-DDaa-dBG.js"},{"url":"/assets/flowGraphWaitAllBlock-C0tC47cj.js"},{"url":"/assets/flowGraphWhileLoopBlock-CrjkYQKa.js"},{"url":"/assets/glTFLoaderAnimation-1eoJDOvu.js"},{"url":"/assets/google-BpBslfgT.js"},{"url":"/assets/google-xHymeLgs.wasm"},{"url":"/assets/googlePreparation.worker-BFX40oM6.js"},{"url":"/assets/ground-C4qXQ7WB.wasm"},{"url":"/assets/groundBvh.worker-B1pji26f.js"},{"url":"/assets/guid-BXdVC_j_.js"},{"url":"/assets/hdrTextureLoader-aw7jKcU5.js"},{"url":"/assets/iesTextureLoader-ELzMbfkv.js"},{"url":"/assets/imageProcessing-B7Rl-J-0.js"},{"url":"/assets/index-DGI90eOu.css"},{"url":"/assets/index-lsSmagG-.js"},{"url":"/assets/index.babylonjs-DAImZpO4.js"},{"url":"/assets/index.core-plugins-6SPqBI3G.js"},{"url":"/assets/instancedMesh-Bui3cmRP.js"},{"url":"/assets/jsbsim_wasm-C7GUNUg3.wasm"},{"url":"/assets/jsbsim_wasm-DLJo4X8N.mjs"},{"url":"/assets/jsQR-DhH5ppsp.js"},{"url":"/assets/ktxTextureLoader-CrjMe27S.js"},{"url":"/assets/light-B3sLucDr.js"},{"url":"/assets/lightConstants-BpHU2fVr.js"},{"url":"/assets/LoaderBase-ATuDWTDB-Dma9wrKU.js"},{"url":"/assets/logger-CuBYPcDK.js"},{"url":"/assets/material.detailMapConfiguration-DMadxWVJ.js"},{"url":"/assets/math.axis-BKDwMMGi.js"},{"url":"/assets/math.color-B_LYgpDI.js"},{"url":"/assets/math.path-B1uV_wUg.js"},{"url":"/assets/math.plane-Bcw0Mmsf.js"},{"url":"/assets/math.scalar.functions-lnL7TJ7T.js"},{"url":"/assets/math.size-CITA4RnG.js"},{"url":"/assets/math.vector-cmnMnUM-.js"},{"url":"/assets/mesh-DFxJSXU-.js"},{"url":"/assets/mesh.vertexData.functions-CD4JOR2q.js"},{"url":"/assets/node-B7GW8kl9.js"},{"url":"/assets/observable-BmPG9gPP.js"},{"url":"/assets/openpbrMaterial-DKAnHL8B.js"},{"url":"/assets/openpbrMaterialLoadingAdapter-DmMtJHSv.js"},{"url":"/assets/pairing-CEV4z0hO.js"},{"url":"/assets/pbrMaterial-ChIp8O6U.js"},{"url":"/assets/pbrMaterialLoadingAdapter-DejuDYHA.js"},{"url":"/assets/perfCounter-DMZLh1nB.js"},{"url":"/assets/pointerEvents-Cgm5D4Vl.js"},{"url":"/assets/precisionDate-CfCevjl-.js"},{"url":"/assets/preload-helper-BLdHbfdN.js"},{"url":"/assets/raster-DlwdWSMe.wasm"},{"url":"/assets/rgbdTextureTools-C-eli28z.js"},{"url":"/assets/rolldown-runtime-hePW80VL.js"},{"url":"/assets/scene-C5-HKzYJ.js"},{"url":"/assets/shell-BLAwgXrp.js"},{"url":"/assets/sky-CRaPsUzR.wasm"},{"url":"/assets/sky-shared-D-4V-MY1.wasm"},{"url":"/assets/skyEvaluation.worker-sAyVobbx.js"},{"url":"/assets/skySharedHelper.worker-BqIP9ECd.js"},{"url":"/assets/spatialWebAudio-Dqo5z6Mu.js"},{"url":"/assets/spatialWebAudioUpdaterComponent-DG5vJVRQ.js"},{"url":"/assets/starCatalogue-DSWPyUwb.js"},{"url":"/assets/terrain-Dz5EuTp6.wasm"},{"url":"/assets/terrainDecode.worker-BNKJ71HV.js"},{"url":"/assets/terrainHeights.worker-DQVlRbzT.js"},{"url":"/assets/terrainMesh.worker-1-etjltD.js"},{"url":"/assets/texture-DEg7YZ8K.js"},{"url":"/assets/textureTools-Be9kc1D7.js"},{"url":"/assets/tgaTextureLoader-CqhhocF6.js"},{"url":"/assets/thinEngine-BEX39FLr.js"},{"url":"/assets/tools-fPRER5-H.js"},{"url":"/assets/tools.functions-DFcfoCMe.js"},{"url":"/assets/typeStore-Cu_sj2zM.js"},{"url":"/assets/useFullscreenOffer-AB-OEO4c.js"},{"url":"/assets/viewer-BSXFyZcH.js"},{"url":"/assets/webAudioBaseSubGraph-DHgSoCh-.js"},{"url":"/assets/webAudioBus-gFsnGNE3.js"},{"url":"/assets/webAudioMainBus-BIDnQ44p.js"},{"url":"/assets/webAudioParameterComponent-B-p7nT7n.js"},{"url":"/assets/webAudioSoundSource-DNqFMgWw.js"},{"url":"/assets/webAudioStaticSound-BPgWpoZ3.js"},{"url":"/assets/webAudioStreamingSound-C8ytlZxc.js"},{"url":"/assets/webRequest-dqz0dHXK.js"}],"retainedFiles":[]});
