# OSFS software dependency graph

This graph separates distributable software from live services and creative
assets. A line to a service does not mean OSFS owns, redistributes, or licenses
that service's data.

```mermaid
flowchart TB
  OSFS["OSFS browser application<br/>TypeScript + React + Vite"]
  FE["FOSS Earth<br/>local file dependency<br/>AGPL-3.0-only"]
  BJS["Babylon.js Core + Loaders<br/>Apache-2.0"]
  TILES["3d-tiles-renderer<br/>NASA AMMOS / Caltech<br/>Apache-2.0"]
  JSW["@0x62/jsbsim-wasm SDK<br/>MIT"]
  JSB["JSBSim engine in WASM<br/>LGPL-2.1"]
  DATA["JSBSim C172 XML<br/>rights unresolved"]
  ASSETS["Aircraft GLB / Blender / images<br/>per-asset rights unresolved"]
  PEER["PeerJS client<br/>MIT"]
  QR["QR code<br/>MIT"]
  GOOGLE["Google Maps Tiles API<br/>service and data terms"]
  MAPS["Raster / terrain / search providers<br/>provider terms and attribution"]
  SIGNAL["PeerJS Cloud + STUN<br/>external operations"]

  OSFS --> FE
  OSFS --> JSW --> JSB
  OSFS --> DATA
  OSFS --> ASSETS
  OSFS --> PEER
  OSFS --> QR
  FE --> BJS
  FE --> TILES
  TILES --> GOOGLE
  FE --> MAPS
  PEER --> SIGNAL
```

The immediate release-critical paths are the local FOSS Earth dependency, the
JSBSim C172 XML, and aircraft assets. Their license/provenance evidence must be
complete before OSFS can offer a single project-wide release license. The
software inventory is in [THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md);
the exact JSBSim integration is in [JSBSim WASM](jsbsim-wasm.md).
