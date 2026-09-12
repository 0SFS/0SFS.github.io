# SF50 owner/instructor data request

Status: draft only; not sent. Date: 2026-09-12.

## Public sources found before sending this request

The [public FlightData sample directory](https://www.flightdata.com/shared) lists 12 SF50 entries, including serials 0045 and 0009. Ordinary headless navigation retrieved a public serial-0045 dashboard; its chart sampling is predominantly six seconds. Do not describe it as an original one-second log. The updated acquisition audit retains the snapshot and access attempts. We have not contacted the owner/provider, bulk-downloaded its flight history, or obtained fixture redistribution permission.

Prefer asking whether an already shared ordinary flight has an authorized raw export and a minimal loading/configuration summary over asking anyone to make a new flight. Exhaust the normal public/provider route before seeking internal manufacturer data.

## Suggested request

We are building an open-source SF50 simulator and would like to compare it with recorded ordinary-flight behavior. Would you be comfortable sharing an existing flight/engine CSV log and a redacted loading/configuration summary for a normal flight?

No new flight, unusual maneuver, intentional stall, maximum-braking exercise, avionics modification, or maintenance action is requested. Please do not operate or configure equipment differently for this project. Export should follow the applicable aircraft/avionics documentation and the owner's normal authorized process.

Before transferring anything, we would agree on which information may be used privately for analysis and which, if any, may be included in an open-source test fixture. A private analysis permission does not imply permission to publish the log.

## Minimum accompanying context

- Aircraft generation, serial/configuration range, applicable AFM revision and thrust-schedule supplement.
- Avionics/software and engine/FADEC configuration, if already documented and shareable.
- Flight date/time basis and source export method; no assumed UTC conversion.
- Redacted empty-weight/CG record, actual seating/baggage arrangement, installed removable seats, and fuel quantities. Approximate values must be labeled approximate.
- Departure/arrival runway, surface state, slope if known, and weather/pressure/temperature/wind.
- Normal flap/gear, bleed/anti-ice, air conditioning and automation states where known.
- A short description of the relevant ordinary segment: steady cruise, climb, normal takeoff, approach/flare or rollout.
- Known faults, warnings, unusual conditions, interventions or missing channels. We would exclude unsuitable segments rather than characterize them as normal behavior.
- Permission terms for private analysis, derivative numerical fixtures, publication, attribution/anonymity and retention.

Do not send passenger identities, personal addresses, account credentials, or unredacted maintenance/logbook material when a minimal configuration summary is sufficient. Position/date information can reveal travel; agree on redaction before transfer. Keep an authorized original separately so any redaction or coordinate translation is documented and does not corrupt timing, atmosphere or distance.

## Export routes to investigate, not universal instructions

The legacy [Garmin Perspective Touch guide 190-01979-01 Rev A](https://static.garmin.com/pumac/190-01979-01_a.pdf), section 8.11, printed page 628/PDF page 646, now confirms SD-card logging for its documented software/configuration. It specifies once-per-second writing and separate CMC data, while warning that not every installation supplies every channel.

The [Garmin Touch+ guide](https://static.garmin.com/pumac/190-02470-02_a.pdf), section 8.10, describes once-per-second SD-card flight-data CSV recording, with installation-dependent channels. It is not evidence that every G1 avionics version has identical logging.

[Cirrus IQ documentation](https://cirrusaircraft.com/cirrus-iq-faq/) describes CSV export for eligible connected aircraft. It identifies Vision Jet IQ hardware beginning at serial 0463. Do not request IQ access from an owner whose aircraft does not support it.

Prefer existing raw exports over screenshots, resampled dashboard charts, app-generated scores, or route-only track logs. Preserve the original column headers, units, sample timestamps and metadata. Do not assume control-surface position or brake pedal force is available just because attitude and engine data are logged.

## Internal acceptance checklist

- Confirm owner authorization and allowed downstream use before ingesting non-public data.
- Hash and retain the original under the agreed access/retention policy.
- Inventory actual channels, missingness, duplicates, clock resets, update cadence and quantization.
- Establish applicable aircraft configuration and required operating conditions.
- Review normal-operation segments with a qualified owner/instructor; do not infer safety from a smooth-looking trace.
- Distinguish commanded from measured inputs and sensed from derived outputs.
- Assign entire flights/conditions to calibration or holdout before tuning.
- Mark each proposed test as blocked, calibration-only or eligible for independent comparison.
- Use professional flight-test planning if dedicated data collection is ever needed; this request does not authorize such testing.
