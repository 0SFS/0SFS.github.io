#!/usr/bin/env python3
"""Derive installed FJ33-5A ground-idle fuel flow from a public SF50 recorder.

NTSB docket WPR20FA051 (N52CV, Cirrus SF50) includes a 1 Hz recorder export
with an engine fuel-flow channel. The session starts with the engine off, then
holds a steady low-power state after start until the recording ends. That
steady state is the only installed idle fuel flow found in public data.

The raw export stays in the ignored raw/ directory; this script verifies it
against the audit manifest's SHA-256 and writes only derived statistics.
"""

import argparse
import csv
import hashlib
import json
import pathlib
import statistics

# Kept separate, as in diagnose-sf50-cruise-fuel-flow.py: JSBSim's JET-A
# density and the AFM's nominal density.
JSBSIM_JET_A_LB_PER_US_GAL = 6.74
AFM_NOMINAL_LB_PER_US_GAL = 6.76
SOURCE_ID = "audit-wpr20-recorder"
FUEL_FLOW = "Eng1 Fuel Flow"
OIL_PRESSURE = "Eng1 Oil Press"
ALTERNATORS = ("Alternator 1", "Alternator 2")
# Engine running: oil pressure present and well above zero, and fuel flowing.
MIN_RUNNING_OIL_PSI = 40.0
START_TRANSIENT_S = 30
SHUTDOWN_GUARD_S = 10


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, help="New output JSON path")
    return parser.parse_args()


def number(text):
    try:
        value = float(text)
    except ValueError:
        return None
    # The export marks invalid samples with -99999 or -9999.9.
    return None if value <= -9999.0 else value


def seconds(clock):
    h, m, s = (int(part) for part in clock.split(":"))
    return h * 3600 + m * 60 + s


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[max(0, min(len(ordered) - 1, round(fraction * (len(ordered) - 1))))]


def summary(samples):
    flows = [s["ff"] for s in samples]
    return {
        "samples": len(flows),
        "from": samples[0]["clock"],
        "to": samples[-1]["clock"],
        "durationS": samples[-1]["t"] - samples[0]["t"],
        "meanUsGph": statistics.fmean(flows),
        "medianUsGph": statistics.median(flows),
        "stdevUsGph": statistics.stdev(flows),
        "minUsGph": min(flows),
        "maxUsGph": max(flows),
        "p05UsGph": percentile(flows, 0.05),
        "p95UsGph": percentile(flows, 0.95),
    }


def main():
    args = parse_args()
    out = pathlib.Path(args.out)
    if out.exists():
        raise SystemExit(f"Refusing to overwrite an existing derivation: {out}")
    root = pathlib.Path(__file__).resolve().parent.parent
    evidence = root / "planes/Cirrus_Vision_Jet/tests/public-evidence"
    manifest = json.loads((evidence / "public-audit-manifest.json").read_text())
    source = next(s for s in manifest["sources"] if s.get("id") == SOURCE_ID)
    raw = (evidence / "raw" / source["file"]).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != source["sha256"]:
        raise SystemExit(f"{source['file']} does not match the audit manifest SHA-256")

    rows = list(csv.reader(raw.decode("utf-8").splitlines()))
    header_at = next(i for i, row in enumerate(rows) if row and row[0].startswith("Time"))
    header, units = rows[header_at], rows[header_at + 1]
    col = {name: header.index(name) for name in (FUEL_FLOW, OIL_PRESSURE, *ALTERNATORS)}
    assert units[col[FUEL_FLOW]] == "(gph)" and units[col[OIL_PRESSURE]] == "(psi)", units

    samples = []
    for row in rows[header_at + 3:]:
        if len(row) < len(header) or not row[0]:
            continue
        samples.append({
            "clock": row[0], "t": seconds(row[0]),
            "ff": number(row[col[FUEL_FLOW]]), "oil": number(row[col[OIL_PRESSURE]]),
            "alternatorsA": [number(row[col[name]]) for name in ALTERNATORS],
        })
    running = [s for s in samples
               if s["oil"] is not None and s["oil"] >= MIN_RUNNING_OIL_PSI
               and s["ff"] is not None and s["ff"] > 0.0]
    gaps = [b["t"] - a["t"] for a, b in zip(running, running[1:])]
    if max(gaps) > 2:
        raise SystemExit("Engine-running samples are not one contiguous segment")
    start, end = running[0]["t"], running[-1]["t"]
    engine_off_before = [s for s in samples if s["t"] < start and s["ff"] == 0.0 and s["oil"] == 0.0]

    def window(transient, guard):
        return [s for s in running if start + transient <= s["t"] <= end - guard]

    selected = window(START_TRANSIENT_S, SHUTDOWN_GUARD_S)
    stats = summary(selected)
    mean_gph = stats["meanUsGph"]
    proposed_pph = round(mean_gph * AFM_NOMINAL_LB_PER_US_GAL)

    rated_thrust_lbf, model_tsfc = 1846.0, 0.65
    jsbsim_estimate_pph = 107.0 * rated_thrust_lbf ** 0.2
    alternator_valid = sum(1 for s in selected if all(a is not None for a in s["alternatorsA"]))
    first_minute = [s for s in selected if s["t"] <= selected[0]["t"] + 60]
    last_minute = [s for s in selected if s["t"] >= selected[-1]["t"] - 60]

    def mean_of(samples, value):
        values = [v for v in (value(s) for s in samples) if v is not None]
        return statistics.fmean(values) if values else None

    steadiness = {
        "fuelFlowFirstMinuteMeanUsGph": mean_of(first_minute, lambda s: s["ff"]),
        "fuelFlowLastMinuteMeanUsGph": mean_of(last_minute, lambda s: s["ff"]),
        "oilPressureFirstMinuteMeanPsi": mean_of(first_minute, lambda s: s["oil"]),
        "oilPressureLastMinuteMeanPsi": mean_of(last_minute, lambda s: s["oil"]),
        "alternatorCurrentA": {
            name: {"window": mean_of(selected, lambda s, i=i: s["alternatorsA"][i]),
                   "firstMinute": mean_of(first_minute, lambda s, i=i: s["alternatorsA"][i]),
                   "lastMinute": mean_of(last_minute, lambda s, i=i: s["alternatorsA"][i])}
            for i, name in enumerate(ALTERNATORS)
        },
        "alternatorValidWindowSamples": alternator_valid,
    }

    result = {
        "schemaVersion": 1,
        "date": "2026-09-13",
        "purpose": "Source an installed FJ33-5A idle fuel flow for engine/fj33_5a.xml, which currently inherits JSBSim's thrust-only estimate.",
        "status": "source-backed-estimate",
        "appliedToPackage": False,
        "source": {
            "docket": "NTSB WPR20FA051",
            "aircraft": "N52CV, Cirrus SF50",
            "manifest": "public-audit-manifest.json",
            "manifestId": SOURCE_ID,
            "url": source["url"],
            "sha256": digest,
            "verifiedAgainstManifest": True,
            "channels": {FUEL_FLOW: "gph", OIL_PRESSURE: "psi"},
            "sampleRateHz": 1,
            "redistribution": "The export is not committed; public availability is not treated as permission to redistribute it.",
        },
        "method": {
            "engineRunning": f"oil pressure valid and >= {MIN_RUNNING_OIL_PSI:g} psi, and fuel flow valid and > 0",
            "sentinels": "values <= -9999 are invalid",
            "window": f"engine-running samples excluding the first {START_TRANSIENT_S} s after start and the last {SHUTDOWN_GUARD_S} s before the recording ends",
            "whyIdle": "The recorder has no N1, N2 or throttle channel. The segment is taken as idle because it is the only engine-running state in the session, follows directly from start, holds steady for minutes, and burns a small fraction of rated fuel flow. It is an inference from the recording, not a recorded lever position.",
        },
        "session": {
            "samples": len(samples),
            "engineOffSamplesBeforeStart": len(engine_off_before),
            "engineRunning": summary(running),
            "maximumGapWhileRunningS": max(gaps),
        },
        "idle": stats,
        "steadiness": steadiness,
        "sensitivityOfMeanUsGph": {
            f"transient{t}s-guard{g}s": statistics.fmean(s["ff"] for s in window(t, g))
            for t in (0, 30, 60) for g in (0, 10, 30)
        },
        "massFlow": {
            "lbmPerHourAtAfmNominalDensity": mean_gph * AFM_NOMINAL_LB_PER_US_GAL,
            "lbmPerHourAtJsbsimJetADensity": mean_gph * JSBSIM_JET_A_LB_PER_US_GAL,
            "densityConventionSensitivityFraction": AFM_NOMINAL_LB_PER_US_GAL / JSBSIM_JET_A_LB_PER_US_GAL - 1.0,
            "stdevLbmPerHourAtAfmNominalDensity": stats["stdevUsGph"] * AFM_NOMINAL_LB_PER_US_GAL,
        },
        "proposedIdleFuelFlowLbmPerHour": proposed_pph,
        "proposedBasis": "Window mean at the AFM nominal density, rounded to whole lbm/hr, which is finer than the sample spread.",
        "corroboration": {
            "jsbsimEstimateLbmPerHour": jsbsim_estimate_pph,
            "jsbsimEstimateOverRecorded": jsbsim_estimate_pph / (mean_gph * AFM_NOMINAL_LB_PER_US_GAL),
            "modelStaticMaxFuelFlowLbmPerHour": rated_thrust_lbf * model_tsfc,
            "recordedIdleFractionOfModelStaticMax": mean_gph * AFM_NOMINAL_LB_PER_US_GAL / (rated_thrust_lbf * model_tsfc),
            "modelStaticMaxBasis": "AFM rated thrust 1846 lbf times the package's estimated TSFC 0.65; the TSFC is not source-backed, so this ratio is a plausibility check only.",
            "lowestAfmCruiseRowsUsGph": {"5000ftIsa": 54, "15000ftIsa": 50},
            "recordedIdleFractionOfLowestCruiseRows": {"5000ftIsa": mean_gph / 54, "15000ftIsa": mean_gph / 50},
        },
        "eventContext": {
            "summary": "The recorded session is the ground operation in which a cabin fire occurred. The fire was not an engine fire; its effect on electrical and bleed load during the window is not known.",
            "docketItems": [
                {"item": 1, "title": "Materials Laboratory Fire Factual Report 21-031",
                 "url": "https://data.ntsb.gov/Docket/Document/docBLOB?ID=14295435&FileExtension=pdf&FileName=21-031%20Factual-Rel.pdf",
                 "relevant": "Examination focused on the right passenger sidewall wire bundles and the underfloor area; conductors below the right egress window showed welding and beading."},
                {"item": 6, "title": "Airframe Examination Report",
                 "url": "https://data.ntsb.gov/Docket/Document/docBLOB?ID=14462664&FileExtension=pdf&FileName=FINAL%20-%20Airframe%20Examination-WPR20FA051-Rel.pdf",
                 "relevant": "The engine and engine compartment appeared undamaged, although the compressor blades were sooted and the right side of the nacelle outer shell was burnt about halfway along its length."},
                {"item": 9, "title": "FAA Emergency Airworthiness Directive 2020-03-50",
                 "url": "https://data.ntsb.gov/Docket/Document/docBLOB?ID=14292800&FileExtension=pdf&FileName=2020-03-50_Emergency-Rel.pdf",
                 "relevant": "Prompted by a cabin fire on an SF50 during ground operations, with smoke from behind the right sidewall panel; issued to prevent an electrical short and uncontained cabin fire."},
            ],
            "retained": "Reviewed copies are kept only in the ignored build/validation/sf50-idle-fuel-flow-20260913/wpr20-docket/ directory and are not redistributed.",
        },
        "limitations": [
            "One airframe and one recorded session.",
            ("Recorded during the ground operation in which a cabin electrical fire occurred; the engine was not damaged. "
             f"Fuel flow averages {steadiness['fuelFlowFirstMinuteMeanUsGph']:.2f} gph in the first minute of the window and "
             f"{steadiness['fuelFlowLastMinuteMeanUsGph']:.2f} gph in the last, and oil pressure "
             f"{steadiness['oilPressureFirstMinuteMeanPsi']:.0f} and {steadiness['oilPressureLastMinuteMeanPsi']:.0f} psi. "
             f"Alternator 1 current is not steady: {steadiness['alternatorCurrentA']['Alternator 1']['window']:.0f} A over the window against "
             f"{steadiness['alternatorCurrentA']['Alternator 1']['firstMinute']:.0f} A and "
             f"{steadiness['alternatorCurrentA']['Alternator 1']['lastMinute']:.0f} A in its first and last minutes. "
             "Abnormal electrical or bleed load during the window cannot be excluded."),
            "Ground idle only. Pressure altitude, temperature, bleed/ECS state and taxi versus stationary are not recorded.",
            ("Alternator current is recorded for the whole window; ECS and bleed extraction are not."
             if alternator_valid == stats["samples"] else
             f"Alternator current is valid in only {alternator_valid} of {stats['samples']} window samples; ECS and bleed extraction are not recorded."),
            "Fuel flow is an avionics-computed volume flow; its density convention is unknown. US gallons are assumed for this N-registered aircraft.",
            "JSBSim applies idle fuel flow as one constant at every altitude and Mach. In-flight idle may be scheduled higher than ground idle; the model has no separate flight-idle floor.",
            "The recorder is quarantined for replay in public-audit-recorder-review.json. This uses one channel as a scalar, not as a replay.",
        ],
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: result[k] for k in ("idle", "massFlow", "proposedIdleFuelFlowLbmPerHour", "sensitivityOfMeanUsGph")}, indent=1))
    print(json.dumps(steadiness, indent=1))


if __name__ == "__main__":
    main()
