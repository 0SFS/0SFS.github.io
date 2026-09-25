import{r as e}from"./index-fa2H_vXh.js";var t=[{id:`cessna-172`,label:`Cessna 172 Skyhawk`,summary:`High-wing trainer. Flight model and visuals both available.`,thumbnail:`aircraft/thumbnails/cessna-172.png`},{id:`cirrus-vision-jet`,label:`Cirrus Vision Jet`,summary:`Single-engine personal jet. G1, G2, G2+ and G3 variants.`,thumbnail:`aircraft/thumbnails/cirrus-vision-jet.png`,developmentNote:`G1, G2 and G3 have separate runtime packages. G2+ is currently mapped to the G2 runtime while separate physics/package support is not yet implemented. Choosing a generation does not provide calibrated generation-specific performance, a new cabin or complete generation-specific avionics.`}];function n(){return`https://github.com/${/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(`0SFS/0SFS.github.io`),`0SFS/0SFS.github.io`}/blob/main`}function r(e){return`/${e.replace(/^\//,``)}`}var i=[[`W / S`,`Pitch`],[`A / D`,`Roll`],[`Q / E`,`Yaw / rudder`],[`Shift / Control`,`Increase / decrease throttle`],[`F / R`,`Extend / retract flaps`],[`G`,`Raise / lower the landing gear`],[`B`,`Brake`],[`P`,`Pause`],[`V`,`Toggle first- and third-person camera`]];function a(a){let o=n(),s=o.replace(/\/blob\/main$/,``),c=document.createElement(`div`);c.className=`info-page`,c.innerHTML=`
    <a class="info-page__skip" href="#info-main">Skip to content</a>
    <header class="info-page__hero">
      <p class="info-page__mark">OSFS</p>
      <h1>Open Source Flight Simulator</h1>
      <p class="info-page__lede">A real-world browser flight simulator built to be explored, extended, and shared. Nothing to install, no account, no sign-up. It runs in a browser tab.</p>
      <p class="info-page__actions">
        <a class="info-page__start" href="./fly/">Start flying</a>
        <a class="info-page__secondary" href="${s}">Source on GitHub</a>
      </p>
    </header>
    <main id="info-main" class="info-page__main">
      <section aria-labelledby="info-what">
        <h2 id="info-what">What it is</h2>
        <p>OSFS puts streamed real-world scenery beneath your wings and JSBSim in charge of flight physics. Bank over a city you recognize. Follow the streets below. Change the wind, line up an approach, and switch to the chase camera to take it all in.</p>
        <ul class="info-page__features">
          <li><strong>Fly over the real world in 3D.</strong> Google Photorealistic 3D Tiles brings detailed cityscapes and terrain into the scene. Free raster basemaps are available too, so you can get flying without a Google API key.</li>
          <li><strong>Physics powered by JSBSim.</strong> Flight dynamics run in WebAssembly at 120 Hz, with aircraft, engine, propeller, fuel, and control simulation.</li>
          <li><strong>Explore from the cockpit or chase camera.</strong> Switch views, orbit around the aircraft, and zoom out to see where you're headed.</li>
          <li><strong>Set up your next flight.</strong> Reposition through the location panel, use airport presets, and adjust wind direction and speed.</li>
          <li><strong>Fly with your phone.</strong> Pair a phone over a QR code and use it as a touch controller.</li>
        </ul>
      </section>
      <section aria-labelledby="info-aircraft">
        <h2 id="info-aircraft">Aircraft</h2>
        <div class="info-page__aircraft">
          ${t.map(e=>`
            <article>
              <img src="${r(e.thumbnail)}" alt="" width="640" height="360" />
              <h3>${e.label}</h3>
              <p>${e.summary}</p>
              ${e.developmentNote?`<p class="info-page__note">${e.developmentNote}</p>`:``}
            </article>
          `).join(``)}
        </div>
        <p>The Cessna 172 Skyhawk is the default aircraft. The Vision Jet family can be chosen in the flight panel's Aircraft tab. More aircraft are part of where the project is headed.</p>
      </section>
      <section aria-labelledby="info-controls">
        <h2 id="info-controls">Controls</h2>
        <table>
          <caption class="info-page__caption">Default keyboard</caption>
          <thead><tr><th scope="col">Input</th><th scope="col">Action</th></tr></thead>
          <tbody>
            ${i.map(([e,t])=>`<tr><th scope="row">${e}</th><td>${t}</td></tr>`).join(``)}
          </tbody>
        </table>
        <p>Throttle and pitch trim are also vertical sliders in the lower-right corner, and the gear has a G button in the instrument row above the attitude indicator. The Controls tab in the flight panel rebinds both the keyboard and a controller.</p>
      </section>
      <section aria-labelledby="info-phone">
        <h2 id="info-phone">Phone controller</h2>
        <p>On the computer, open the simulator, then ⚙ → <strong>Remote Control</strong>. Scan the QR with your phone camera. Both ends are web pages — there is no app to install. The QR expires after two minutes and admits one phone.</p>
        <p><a href="${o}/docs/phone-controller.md">How pairing works, and what to do when it fails</a></p>
      </section>
      <section aria-labelledby="info-docs">
        <h2 id="info-docs">Documentation</h2>
        <ul>
          <li><a href="${o}/docs/development.md">Development</a></li>
          <li><a href="${o}/docs/deploying.md">Deploying to GitHub Pages</a></li>
          <li><a href="${o}/docs/jsbsim.md">How JSBSim runs in the browser</a></li>
          <li><a href="${o}/docs/sound.md">Sound</a></li>
          <li><a href="${o}/docs/foss-earth-relationship.md">FOSS Earth relationship</a></li>
          <li><a href="${o}/docs/phone-controller.md">Phone controller</a></li>
        </ul>
      </section>
    </main>
    <footer class="info-page__footer">
      <p>OSFS is <a href="${o}/LICENSE">AGPL-3.0-only</a> free software. <a href="${s}">Repository</a>.</p>
      <p>Credits and licences: <a href="${o}/NOTICE">NOTICE</a>, <a href="${o}/THIRD_PARTY_LICENSES.md">third-party licences</a>, <a href="${o}/ASSET_LICENSES.md">asset licences</a>.</p>
    </footer>
  `;let l=c.querySelector(`.info-page__start`);l instanceof HTMLAnchorElement&&l.setAttribute(`href`,e(new URL(window.location.href))),a.replaceChildren(c),document.getElementById(`info-first-paint`)?.remove(),document.getElementById(`app-log`)?.remove()}export{a as createInfoPage};