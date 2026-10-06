# FlightGear F-35B JSBSim candidate

This directory retains an experimental FlightGear F-35B flight-model candidate.
These original bytes remain unchanged. A separately modified experimental
runtime copy now lives in [public/jsbsim-data](../../../../public/jsbsim-data/aircraft/F-35B-jsbsim/NOTICE.md).
No simulation validation was run during the original source acquisition;
subsequent installed-SDK functional results are retained in
[the acceptance record](../../../../validation/evidence/aircraft/f35b/installed-sdk-acceptance.json).

See [the F-35B FDM proposal](../../../../docs/proposals/f35b-fdm.md) for the
recommended JSBSim path, earlier smoke-test limits, STOVL dependencies, and
source wiring defect.

The files listed in [manifest.json](manifest.json) are unmodified bytes from
the official FGAddon `F-35B.zip`, revision 15340, acquired on 2026-10-05. The
manifest records the archive identity, original member paths, file hashes,
sizes, and credits. Six files form the complete referenced JSBSim dependency
closure, including the aircraft XML. The FlightGear entry point, both Nasal
fan mixers, and package licence are also retained. The archive contains no
separate README or credits text; aircraft credits remain in the XML.

[License.txt](License.txt) contains GPLv3; the aircraft XML explicitly names
GPL. Keep these source and licence notices when adopting or modifying the FDM
or translating its Nasal code. The separately acquired Sketchfab exterior is
CC BY 4.0 and has its own attribution; its licence does not apply to these
FlightGear files.

The XML declares a trial model derived from F-16 and Aeromatic work. The prior
2026-09-19 heuristic flight smoke was untrimmed and does not validate aircraft
fidelity or hover. The JSBSim entry point includes `fan-yasim.nas` despite the
presence of `fan-jsbsim.nas`; retaining the source does not fix that defect.
Textures, aircraft meshes, sounds, and unrelated systems are excluded.
