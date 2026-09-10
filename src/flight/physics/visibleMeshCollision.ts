import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { DEG_TO_RAD, ecefToGeodetic, geodeticToEcef } from "foss-earth/cameraMath";
import type { SurfaceQuery } from "foss-earth/runtime";
import { readFlightState } from "../bridge/ecefBridge";
import { BODY_COLLISION_PROBES, MAX_BODY_COLLISION_ALTITUDE_METERS } from "./collisionGeometry";
import { interpolateFlightState, type FlightState } from "./flightState";
import { captureSimulation, restoreSimulation } from "./safeFlightState";

const CONTACT_CLEARANCE_METERS = 0.01;
const RESTITUTION = 0.25;
const FEET_PER_METER = 1 / 0.3048;

interface EcefVector { x: number; y: number; z: number }

function add(a: EcefVector, b: EcefVector): EcefVector { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scale(vector: EcefVector, factor: number): EcefVector { return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor }; }
function subtract(a: EcefVector, b: EcefVector): EcefVector { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function length(vector: EcefVector): number { return Math.hypot(vector.x, vector.y, vector.z); }
function dot(a: EcefVector, b: EcefVector): number { return a.x * b.x + a.y * b.y + a.z * b.z; }

function localAxes(state: FlightState): { north: EcefVector; east: EcefVector; up: EcefVector } {
  const lat = state.latDeg * DEG_TO_RAD, lon = state.lonDeg * DEG_TO_RAD;
  const north = { x: -Math.sin(lat) * Math.cos(lon), y: -Math.sin(lat) * Math.sin(lon), z: Math.cos(lat) };
  const east = { x: -Math.sin(lon), y: Math.cos(lon), z: 0 };
  const up = { x: Math.cos(lat) * Math.cos(lon), y: Math.cos(lat) * Math.sin(lon), z: Math.sin(lat) };
  return { north, east, up };
}

function probeOffset(state: FlightState, probe: typeof BODY_COLLISION_PROBES[number]): EcefVector {
  const axes = localAxes(state);
  const levelForward = add(scale(axes.north, Math.cos(state.headingRad)), scale(axes.east, Math.sin(state.headingRad)));
  const levelRight = add(scale(axes.north, -Math.sin(state.headingRad)), scale(axes.east, Math.cos(state.headingRad)));
  const forward = add(scale(levelForward, Math.cos(state.pitchRad)), scale(axes.up, Math.sin(state.pitchRad)));
  const pitchedUp = subtract(scale(axes.up, Math.cos(state.pitchRad)), scale(levelForward, Math.sin(state.pitchRad)));
  const left = subtract(scale(pitchedUp, Math.sin(state.rollRad)), scale(levelRight, Math.cos(state.rollRad)));
  const up = add(scale(pitchedUp, Math.cos(state.rollRad)), scale(levelRight, Math.sin(state.rollRad)));
  return add(scale(left, probe.left), add(scale(up, probe.up), scale(forward, probe.forward)));
}

function probePosition(state: FlightState, probe: typeof BODY_COLLISION_PROBES[number]): EcefVector {
  return add(geodeticToEcef(state.latDeg * DEG_TO_RAD, state.lonDeg * DEG_TO_RAD, state.altMeters),
    probeOffset(state, probe));
}

export interface VisibleMeshCollisionOptions {
  /** Values above one deliberately add energy, for the optional arcade mode. */
  getRestitution?: () => number;
}

export function createVisibleMeshCollision(sdk: JSBSimSdk, surface: SurfaceQuery, options: VisibleMeshCollisionOptions = {}) {
  let previousState: FlightState | null = null;

  return {
    reset(): void { previousState = null; },
    update(): boolean {
      const current = readFlightState(sdk);
      const support = surface.sample(current.latDeg, current.lonDeg);
      if (!previousState || !support || current.altMeters - support.heightMeters > MAX_BODY_COLLISION_ALTITUDE_METERS) {
        previousState = current;
        return false;
      }

      let impact: { fraction: number; point: EcefVector; normal: EcefVector; probe: typeof BODY_COLLISION_PROBES[number] } | null = null;
      for (const probe of BODY_COLLISION_PROBES) {
        const from = probePosition(previousState, probe);
        const to = probePosition(current, probe);
        const movement = subtract(to, from);
        const distance = length(movement);
        if (!Number.isFinite(distance) || distance < 0.0001) continue;
        const hit = surface.raycast(from, movement, distance);
        if (!hit || !Number.isFinite(hit.distanceMeters) || hit.distanceMeters < 0
          || hit.distanceMeters > distance) continue;
        const normalLength = length(hit.normal);
        if (!Number.isFinite(normalLength) || normalLength < 1e-10
          || ![hit.point.x, hit.point.y, hit.point.z].every(Number.isFinite)) continue;
        let normal = scale(hit.normal, 1 / normalLength);
        if (dot(movement, normal) > 0) normal = scale(normal, -1);
        const fraction = hit.distanceMeters / distance;
        if (!impact || fraction < impact.fraction) impact = { fraction, point: hit.point, normal, probe };
      }

      if (impact) {
        const axes = localAxes(current);
        const normal = impact.normal;
        const northVelocity = sdk.getPropertyValue("velocities/v-north-fps") * 0.3048;
        const eastVelocity = sdk.getPropertyValue("velocities/v-east-fps") * 0.3048;
        const upVelocity = -sdk.getPropertyValue("velocities/v-down-fps") * 0.3048;
        const velocity = add(scale(axes.north, northVelocity), add(scale(axes.east, eastVelocity), scale(axes.up, upVelocity)));
        const normalSpeed = dot(velocity, normal);
        const requestedRestitution = options.getRestitution?.() ?? RESTITUTION;
        const restitution = Number.isFinite(requestedRestitution) ? Math.min(2, Math.max(0, requestedRestitution)) : RESTITUTION;
        const bounced = normalSpeed < 0 ? subtract(velocity, scale(normal, (1 + restitution) * normalSpeed)) : velocity;
        const contactState = interpolateFlightState(previousState, current, impact.fraction);
        const longitudeDelta = ((current.lonDeg - previousState.lonDeg + 540) % 360) - 180;
        contactState.lonDeg = previousState.lonDeg + longitudeDelta * impact.fraction;
        // A wing/nose hit is a point ON the aircraft, not the aircraft's centre.
        // Rewind to contact and leave only a centimetre of separation. The old
        // placement shifted the entire centre to a probe hit plus 1.5 metres.
        const position = add(subtract(impact.point, probeOffset(contactState, impact.probe)),
          scale(normal, CONTACT_CLEARANCE_METERS));
        const geodetic = ecefToGeodetic(position.x, position.y, position.z);
        const contactAxes = localAxes({ ...contactState, latDeg: geodetic.latRad / DEG_TO_RAD, lonDeg: geodetic.lonRad / DEG_TO_RAD });
        // Terrain contact may have just adopted a newer surface. Preserve that
        // floor and the current controls instead of restoring a stale snapshot.
        const snapshot = captureSimulation(sdk);
        snapshot.initial["ic/lat-geod-deg"] = geodetic.latRad / DEG_TO_RAD;
        snapshot.initial["ic/long-gc-deg"] = geodetic.lonRad / DEG_TO_RAD;
        snapshot.initial["ic/h-sl-ft"] = geodetic.altMeters * FEET_PER_METER;
        snapshot.initial["ic/phi-deg"] = contactState.rollRad / DEG_TO_RAD;
        snapshot.initial["ic/theta-deg"] = contactState.pitchRad / DEG_TO_RAD;
        snapshot.initial["ic/psi-true-deg"] = contactState.headingRad / DEG_TO_RAD;
        snapshot.initial["ic/vn-fps"] = dot(bounced, contactAxes.north) * FEET_PER_METER;
        snapshot.initial["ic/ve-fps"] = dot(bounced, contactAxes.east) * FEET_PER_METER;
        snapshot.initial["ic/vd-fps"] = -dot(bounced, contactAxes.up) * FEET_PER_METER;
        restoreSimulation(sdk, snapshot);
        previousState = readFlightState(sdk);
        return true;
      }

      previousState = current;
      return false;
    },
  };
}
