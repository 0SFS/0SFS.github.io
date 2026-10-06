# Conditional reacting-parcel optical closure

This is an **uncalibrated n-dodecane surrogate**, not an F135 chemistry solution.
0sfs owns the offline optical bake; it consumes native burned-fuel and thermal
state without replacing engine dynamics. Cantera is a development-only tool.

`bake_parcel.py` solves an adiabatic constant-pressure parcel using Cantera's
`nDodecane_Reitz.yaml` ideal-gas phase. The installed 3.2.0 file has 100 species
and 553 reactions. Its introduction retains the original paper's 432-reaction
description; the actual shipped file and generator hashes are recorded in the
artifact. [Mechanism and original paper](https://github.com/Cantera/cantera/blob/v3.2.0/data/nDodecane_Reitz.yaml)

CH(A) is postprocessed in quasi-steady state. The Carl and Peeters formation
rates and major-species quenching rates come from Nori's tables 7.1 and 2.2.
Those mechanisms were compared with methane and preheated Jet-A flames. That
supports the method, not validation of this different precursor mechanism,
parcel flow, pressure domain or engine. In particular, high-pressure behavior
and large-hydrocarbon quenching remain uncertain.
[Nori dissertation](https://www.seitzman.gatech.edu/nori_venkata_n_200808_phd.pdf),
[Nori and Seitzman paper](https://www.sciencedirect.com/science/article/pii/S1540748908001089)

With concentrations in mol/cm³:

```text
P_CH = k_Carl,O [C2H][O] + k_Carl,O2 [C2H][O2]
Q_CH = sum(k_quencher [quencher])
[CH(A)] = P_CH / (A_CH + Q_CH)
q_CH = [CH(A)] A_CH N_A (h c / 431 nm) × 10^6  [W/m³]
yield_CH = integral(q_CH / density dt) / converted fuel mass fraction [J/kg]
```

The companion Peeters result quantifies one rate-set sensitivity; it is **not a
complete uncertainty bound**. The photon count is represented at the dominant
431 nm band for inexpensive CIE integration. This is a declared spectral
reduction, not a measured full CH(A-X) line distribution. No C2 source is
invented: its required ground-state precursors are absent from this reduced
mechanism. This does not establish physically zero C2 emission.

The surrogate oxidizer is 15 mol% O2. Its other constituents are a blend of
79:21 N2:O2 air and complete stoichiometric n-dodecane combustion products. It
does not claim measured turbine-outlet composition. The table covers inlet
600–1200 K, 0.2–5 atm and equivalence ratios 0.8 and 1.0. The inlet mixture,
pressure, spatial support and mixing closure must remain named assumptions;
they cannot be inferred uniquely from the engine's bulk gas temperature.

At runtime, use the table's per-converted-fuel yield only when native **burned**
fuel is positive. Do not replay the parcel's autoignition delay: it describes
this isolated homogeneous reactor, whereas the native engine has already
established burning. The recorded >1%-peak CH duration is a chemistry diagnostic,
not a nozzle residence time. Native fuel flow multiplied by J/kg produces W;
distribute those watts over the physical internal reaction region and divide by
4π for isotropic radiance. Do not create an exterior CH reaction region from
the same source or transport the excited species for metres.

The parcel also supplies hot-product temperature, density, heat capacity and
enthalpy. A separate mixture approximation can preserve bulk enthalpy while
retaining hotter reacting parcels; evaluating Planck emission only at the mean
temperature loses that distinction. Published afterburner measurements show
radial temperature gradients and local mixtures differing from bulk fuel/air
ratios. These support a spatial mixture hypothesis, not this engine's precise
distribution. [NASA nozzle profiles](https://ntrs.nasa.gov/api/citations/19760007043/downloads/19760007043.pdf),
[NASA afterburner study](https://ntrs.nasa.gov/api/citations/19710020641/downloads/19710020641.pdf)

The equilibrium temperature is retained as a thermochemical reference. The
kinetic parcel need not reach exact equilibrium: the CH pulse can finish before
slow product reactions. The integration requires nearly complete parent-fuel
conversion, at least 95% of the equilibrium temperature rise, and a CH tail
below 10⁻⁶ of the peak after at least 20 ms. None of these establishes complete
Jet-A combustion or a measured F135 combustion efficiency. Soot loading and
thermal radiation remain a separate model; this solver does not determine soot.

Reproduce from the repository root (all tooling, cache and temporary files stay
under `build/`):

```sh
mkdir -p build/tools/combustion build/tools/combustion-tmp build/tools/pip-cache
TMPDIR="$PWD/build/tools/combustion-tmp" PIP_CACHE_DIR="$PWD/build/tools/pip-cache" \
  python3 -m pip install --target build/tools/combustion \
  -r scripts/exhaustOptics/combustion/requirements.txt
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  PYTHONPATH="$PWD/build/tools/combustion" \
  python3 scripts/exhaustOptics/combustion/bake_parcel.py
```

The default output uses `scripts/outputDirectory.mjs`. `--out` selects a retained
evidence folder; `--quick` computes only the nominal 1000 K / 3 atm / phi 1 case.
Per-step traces retain the actual adaptive solver intervals. Generated artifacts
must retain provenance and qualification alongside the runtime data.

Run `check_parcel.py` with the same environment for selected refined-integration
and independent off-grid parcel comparisons. It writes a separate dated report.
