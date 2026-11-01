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

install(self, {"schemaVersion":1,"base":"/","scope":"/","workerFile":"foss-earth-sw.js","cacheNamespace":"0sfs-app-files","identity":null,"retention":"retain-older","isolation":"enforce","keepFiles":false,"files":[{"url":"/assets/abstractAudioBus-C7DOF6da.js"},{"url":"/assets/abstractSoundInstance-BqYjg609.js"},{"url":"/assets/abstractSoundSource-Cnu8WkdW.js"},{"url":"/assets/animation-DCqrrLVJ.js"},{"url":"/assets/animationGroup-zpF4I0ib.js"},{"url":"/assets/atlasImagery.worker-DUeB22SI.js"},{"url":"/assets/attitudeRenderer-vi7xqOYa.js"},{"url":"/assets/audio-dsp-hg0dJa9T.wasm"},{"url":"/assets/audioEngine-rPJIF2VO.js"},{"url":"/assets/babylon-shader-store-D-XQlhUT.js"},{"url":"/assets/babylon-shaders-glsl-KXp7RBuG.js"},{"url":"/assets/babylon-shaders-static-6Emcicep.js"},{"url":"/assets/babylon-shaders-wgsl-DXw1mixw.js"},{"url":"/assets/baseTexture.polynomial-D2S9MB_P.js"},{"url":"/assets/basisTextureLoader-D_N_-JdW.js"},{"url":"/assets/brdfTextureTools-brcPcsF9.js"},{"url":"/assets/browser-SVqs8N5c.js"},{"url":"/assets/buffer-Fqm-Uhlp.js"},{"url":"/assets/cameraInputsManager-CmaY7cN_.js"},{"url":"/assets/cameraMath-DfPPPPhe.js"},{"url":"/assets/centeredStick-Bzbcw-CR.js"},{"url":"/assets/client-Bf3Rdj-x.js"},{"url":"/assets/compassCenterSphere-3UbGX3DM.js"},{"url":"/assets/constants-CyZt4oGm.js"},{"url":"/assets/controlPosition-CdclOC0t.css"},{"url":"/assets/controlPosition-CNPRQW0_.js"},{"url":"/assets/createFlightSimApp-BKN562Fk.css"},{"url":"/assets/createFlightSimApp-DzqPjv_v.js"},{"url":"/assets/createFullscreenNotice-BxTURdSS.js"},{"url":"/assets/createFullscreenNotice-k1miaR4J.css"},{"url":"/assets/createMultiplayerFeature-Dmm9pngN.js"},{"url":"/assets/createMultiplayerFeature-DzCGQ0Cc.css"},{"url":"/assets/createPhoneControllerApp-DNTAjGxr.js"},{"url":"/assets/createPhoneControllerApp-DZW6ovbV.css"},{"url":"/assets/createPhoneControlSession-BOU2T5fV.js"},{"url":"/assets/createPhonePairingPanel-Cquj6mWe.js"},{"url":"/assets/createPhonePairingPanel-CUZwpwy7.css"},{"url":"/assets/cubemapToSphericalPolynomial-ofbn2C4q.js"},{"url":"/assets/dataBuffer-C-wqV4qF.js"},{"url":"/assets/dds-BfEzUl-Q.js"},{"url":"/assets/ddsTextureLoader-BuPhtGAI.js"},{"url":"/assets/decorators-BOtej2xA.js"},{"url":"/assets/devTools-DmD3AOL3.js"},{"url":"/assets/drawWrapper-DxEc7k4_.js"},{"url":"/assets/drawWrapper.functions-t22iQNzU.js"},{"url":"/assets/droneFeature-CQH0KqHE.js"},{"url":"/assets/droneFeature-DYVxQlpF.css"},{"url":"/assets/dspProcessor-B313eoNk.js"},{"url":"/assets/dumpTools-Dpdlbn-Z.js"},{"url":"/assets/effectFallbacks-sBrljMdo.js"},{"url":"/assets/effectRenderer-CKwPUB-H.js"},{"url":"/assets/egm2008-15-nvvz7MYe.bin"},{"url":"/assets/egm2008-30-BpPXoGjA.bin"},{"url":"/assets/egm2008-60-bDxgbz8U.bin"},{"url":"/assets/electric-sound-DF_AvSp5.wasm"},{"url":"/assets/engine-smoke-flipbook-LU3ukRVc.png"},{"url":"/assets/engineStore-DYzBhiRl.js"},{"url":"/assets/envTextureLoader-CXAiibMp.js"},{"url":"/assets/exrTextureLoader-Ct7W2DqL.js"},{"url":"/assets/f135-exhaust-lut.manifest-D7l9CMQO.json"},{"url":"/assets/f135-exhaust-spatial-Bz5-hsfX.png"},{"url":"/assets/floatingOriginMatrixOverrides-D4gbxt6t.js"},{"url":"/assets/flowGraphArrayIndexBlock-IQiidDeW.js"},{"url":"/assets/flowGraphAssetsContext-WtUyuDAI.js"},{"url":"/assets/flowGraphAsyncExecutionBlock-BiLpVBmb.js"},{"url":"/assets/flowGraphBezierCurveEasingBlock-BlTLNIq8.js"},{"url":"/assets/flowGraphBinaryOperationBlock-e-EmYR3S.js"},{"url":"/assets/flowGraphBlock-BfCG8hXK.js"},{"url":"/assets/flowGraphBranchBlock-CqdDR0Ox.js"},{"url":"/assets/flowGraphCachedOperationBlock-BZG3roOp.js"},{"url":"/assets/flowGraphCancelDelayBlock-CySrrY69.js"},{"url":"/assets/flowGraphCodeExecutionBlock-C5mMwimc.js"},{"url":"/assets/flowGraphConditionalDataBlock-C8ufVsuW.js"},{"url":"/assets/flowGraphConsoleLogBlock-C2Uk6U9R.js"},{"url":"/assets/flowGraphConstantBlock-CnvnuqDY.js"},{"url":"/assets/flowGraphContextBlock-Ds3d3Skq.js"},{"url":"/assets/flowGraphCounterBlock-o3C7HwPS.js"},{"url":"/assets/flowGraphDataSwitchBlock-DKb_Vh9k.js"},{"url":"/assets/flowGraphDebounceBlock-BoCuib5d.js"},{"url":"/assets/flowGraphDoNBlock-DyxCLDGd.js"},{"url":"/assets/flowGraphEasingBlock-DOfaqnf_.js"},{"url":"/assets/flowGraphExecutionBlock-Crzm0aiI.js"},{"url":"/assets/flowGraphExecutionBlockWithOutSignal-BxPQEddy.js"},{"url":"/assets/flowGraphFlipFlopBlock-BAXjTvYe.js"},{"url":"/assets/flowGraphForLoopBlock-BQUWd7DB.js"},{"url":"/assets/flowGraphFunctionReferenceBlock-Bu371W7n.js"},{"url":"/assets/flowGraphGetAssetBlock-Ue_2F34V.js"},{"url":"/assets/flowGraphGetPropertyBlock-CzPmHV5D.js"},{"url":"/assets/flowGraphGetVariableBlock-BwJ7XJ5F.js"},{"url":"/assets/flowGraphGLTFDataProvider-DlWj8WEu.js"},{"url":"/assets/flowGraphIndexOfBlock-DVHnlE-8.js"},{"url":"/assets/flowGraphInterpolationBlock-DQEccFlX.js"},{"url":"/assets/flowGraphJsonPointerParserBlock-CH-jIgR0.js"},{"url":"/assets/flowGraphMathBlocks-BdF-0zdj.js"},{"url":"/assets/flowGraphMathCombineExtractBlocks-BFeFWRzx.js"},{"url":"/assets/flowGraphMatrixMathBlocks--Gj-Z735.js"},{"url":"/assets/flowGraphMeshPickEventBlock-CTGxZUtY.js"},{"url":"/assets/flowGraphMultiGateBlock-bl-mo5md.js"},{"url":"/assets/flowGraphPauseAnimationBlock-C9eX9lMY.js"},{"url":"/assets/flowGraphPlayAnimationBlock-CUoe7lWE.js"},{"url":"/assets/flowGraphPointerOutEventBlock-5O7fodOY.js"},{"url":"/assets/flowGraphPointerOverEventBlock-Dy4Q9QHU.js"},{"url":"/assets/flowGraphReceiveCustomEventBlock-30625MON.js"},{"url":"/assets/flowGraphSceneReadyEventBlock-Dh_0lOcw.js"},{"url":"/assets/flowGraphSceneTickEventBlock-CzjE4qMj.js"},{"url":"/assets/flowGraphSendCustomEventBlock-dAWUVpoX.js"},{"url":"/assets/flowGraphSequenceBlock-BtB3ZnFu.js"},{"url":"/assets/flowGraphSetDelayBlock-DWsuU2wf.js"},{"url":"/assets/flowGraphSetPropertyBlock-DiBikviW.js"},{"url":"/assets/flowGraphSetVariableBlock-9izmzGhX.js"},{"url":"/assets/flowGraphStopAnimationBlock-CIGVUeIb.js"},{"url":"/assets/flowGraphSwitchBlock-eMCdl1W6.js"},{"url":"/assets/flowGraphThrottleBlock-CyEiJKjh.js"},{"url":"/assets/flowGraphTransformCoordinatesSystemBlock-BVN_YmMC.js"},{"url":"/assets/flowGraphTypeToTypeBlocks-D1qQ9tQE.js"},{"url":"/assets/flowGraphUnaryOperationBlock-BlKNjrT1.js"},{"url":"/assets/flowGraphVectorMathBlocks-B_AK6n8B.js"},{"url":"/assets/flowGraphWaitAllBlock-C0tC47cj.js"},{"url":"/assets/flowGraphWhileLoopBlock-CrjkYQKa.js"},{"url":"/assets/glTFLoaderAnimation-DUYAiYr5.js"},{"url":"/assets/google-BntCiirv.js"},{"url":"/assets/google-xHymeLgs.wasm"},{"url":"/assets/googlePreparation.worker-BFX40oM6.js"},{"url":"/assets/ground-CF29-xhB.wasm"},{"url":"/assets/groundBvh.worker-CrDYIc_c.js"},{"url":"/assets/guid-BXdVC_j_.js"},{"url":"/assets/hdrTextureLoader-aw7jKcU5.js"},{"url":"/assets/iesTextureLoader-ELzMbfkv.js"},{"url":"/assets/imageProcessing-B7Rl-J-0.js"},{"url":"/assets/index-0QodE6uK.js"},{"url":"/assets/index-MN_rVQG5.css"},{"url":"/assets/index.babylonjs-B8Nu0VZg.js"},{"url":"/assets/index.core-plugins-6SPqBI3G.js"},{"url":"/assets/instancedMesh-Bui3cmRP.js"},{"url":"/assets/jpeg-js-DU_N4NI8.js"},{"url":"/assets/jsbsim_wasm-C7GUNUg3.wasm"},{"url":"/assets/jsbsim_wasm-DLJo4X8N.mjs"},{"url":"/assets/jsQR-DhH5ppsp.js"},{"url":"/assets/ktxTextureLoader-B54E3sJX.js"},{"url":"/assets/light-B3sLucDr.js"},{"url":"/assets/lightConstants-BpHU2fVr.js"},{"url":"/assets/LoaderBase-ATuDWTDB-Dma9wrKU.js"},{"url":"/assets/logger-CuBYPcDK.js"},{"url":"/assets/material.detailMapConfiguration-DMadxWVJ.js"},{"url":"/assets/math.axis-BKDwMMGi.js"},{"url":"/assets/math.color-B_LYgpDI.js"},{"url":"/assets/math.path-B1uV_wUg.js"},{"url":"/assets/math.plane-Bcw0Mmsf.js"},{"url":"/assets/math.scalar.functions-lnL7TJ7T.js"},{"url":"/assets/math.size-CITA4RnG.js"},{"url":"/assets/math.vector-cmnMnUM-.js"},{"url":"/assets/mesh-DFxJSXU-.js"},{"url":"/assets/mesh.vertexData.functions-CD4JOR2q.js"},{"url":"/assets/meshBuilder-C7wwqaHI.js"},{"url":"/assets/multirotor-Bv42DhvO.wasm"},{"url":"/assets/node-B7GW8kl9.js"},{"url":"/assets/observable-BmPG9gPP.js"},{"url":"/assets/openpbrMaterial-Xu64bspb.js"},{"url":"/assets/openpbrMaterialLoadingAdapter-C0_mdvY9.js"},{"url":"/assets/pairing-DWiIb-2o.js"},{"url":"/assets/pbrMaterial-BzCMiMSD.js"},{"url":"/assets/pbrMaterialLoadingAdapter-jP7tiQSn.js"},{"url":"/assets/peerTransport-BWmhHrwI.js"},{"url":"/assets/perfCounter-DMZLh1nB.js"},{"url":"/assets/phoneAttitude-CzGE4WnI.js"},{"url":"/assets/PhoneQuadcopter-BXr6mx7f.js"},{"url":"/assets/PhoneQuadcopter-D2lsS6mP.css"},{"url":"/assets/pointerEvents-Cgm5D4Vl.js"},{"url":"/assets/precisionDate-CfCevjl-.js"},{"url":"/assets/preload-helper-BLdHbfdN.js"},{"url":"/assets/quadEngineMonitor-CmTP9trg.css"},{"url":"/assets/quadEngineMonitor-sLZN7wos.js"},{"url":"/assets/raster-DlwdWSMe.wasm"},{"url":"/assets/renderTargetTexture-BGC42VS8.js"},{"url":"/assets/rgbdTextureTools-BC91mUC3.js"},{"url":"/assets/rolldown-runtime-hePW80VL.js"},{"url":"/assets/scene-C5-HKzYJ.js"},{"url":"/assets/settings-DqUiLXCH.js"},{"url":"/assets/shaderLanguage-CsgORKnQ.js"},{"url":"/assets/shaderMaterial-piHOTlHd.js"},{"url":"/assets/shell-ypJPH--8.js"},{"url":"/assets/sky-CRaPsUzR.wasm"},{"url":"/assets/sky-shared-D-4V-MY1.wasm"},{"url":"/assets/skyEvaluation.worker-DYZYEH6r.js"},{"url":"/assets/skySharedHelper.worker-BqIP9ECd.js"},{"url":"/assets/spatialWebAudio-Dqo5z6Mu.js"},{"url":"/assets/spatialWebAudioUpdaterComponent-DG5vJVRQ.js"},{"url":"/assets/standardMaterial-BKmf9GMO.js"},{"url":"/assets/starCatalogue-DSWPyUwb.js"},{"url":"/assets/terrain-Dz5EuTp6.wasm"},{"url":"/assets/terrainDecode.worker-F-l5Ll0F.js"},{"url":"/assets/terrainHeights.worker-CCvKcwnp.js"},{"url":"/assets/terrainMesh.worker-Cakeqgjx.js"},{"url":"/assets/terrainRegionOverlay-DcwD-duz.js"},{"url":"/assets/texture-DEg7YZ8K.js"},{"url":"/assets/textureTools-BBuD7BEB.js"},{"url":"/assets/tgaTextureLoader-CqhhocF6.js"},{"url":"/assets/thinEngine-BEX39FLr.js"},{"url":"/assets/tools-fPRER5-H.js"},{"url":"/assets/tools.functions-DFcfoCMe.js"},{"url":"/assets/typeStore-Cu_sj2zM.js"},{"url":"/assets/useFullscreenOffer-CKvTWFvN.js"},{"url":"/assets/viewer-D3lQ4gdT.js"},{"url":"/assets/voice-DaR2s9SC.wasm"},{"url":"/assets/voice-oDR292aE.wasm"},{"url":"/assets/webAudioBaseSubGraph-DHgSoCh-.js"},{"url":"/assets/webAudioBus-gFsnGNE3.js"},{"url":"/assets/webAudioMainBus-BIDnQ44p.js"},{"url":"/assets/webAudioParameterComponent-B-p7nT7n.js"},{"url":"/assets/webAudioSoundSource--oyYLHha.js"},{"url":"/assets/webAudioStaticSound-DXDf3_iq.js"},{"url":"/assets/webAudioStreamingSound-B9-K7FIB.js"},{"url":"/assets/webRequest-dqz0dHXK.js"}],"retainedFiles":[]});
