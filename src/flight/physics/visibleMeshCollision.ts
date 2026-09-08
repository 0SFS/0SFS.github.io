import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { DEG_TO_RAD, ecefToGeodetic, geodeticToEcef } from "foss-earth/cameraMath";
import type { SurfaceQuery } from "foss-earth/runtime";
import { readFlightState } from "../bridge/ecefBridge";
import type { FlightState } from "./flightState";
import { captureSimulation, restoreSimulation, type SimulationSnapshot } from "./safeFlightState";

const MAX_COLLISION_ALTITUDE_METERS = 150;
const CONTACT_CLEARANCE_METERS = 1.5;
const RESTITUTION = 0.25;
const FEET_PER_METER = 1 / 0.3048;

const PROBES = [
  { name: "nose", left: 0, up: 0.7, forward: 4.5 },
  { name: "center", left: 0, up: -0.2, forward: 0 },
  { name: "left-wing", left: 5.5, up: 0.6, forward: 0.2 },
  { name: "right-wing", left: -5.5, up: 0.6, forward: 0.2 },
  { name: "tail", left: 0, up: 1.4, forward: -3.8 },
] as const;

interface EcefVector { x: number; y: number; z: number }

function add(a: EcefVector, b: EcefVector): EcefVector { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scale(vector: EcefVector, factor: number): EcefVector { return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor }; }
function subtract(a: EcefVector, b: EcefVector): EcefVector { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function length(vector: EcefVector): number { return Math.hypot(vector.x, vector.y, vector.z); }
function dot(a: EcefVector, b: EcefVector): number { return a.x * b.x + a.y * b.y + a.z * b.z; }

function localAxes(state: FlightState): { north: EcefVector; east: EcefVector; up: EcefVector; forward: EcefVector; left: EcefVector } {
  const lat = state.latDeg * DEG_TO_RAD, lon = state.lonDeg * DEG_TO_RAD;
  const north = { x: -Math.sin(lat) * Math.cos(lon), y: -Math.sin(lat) * Math.sin(lon), z: Math.cos(lat) };
  const east = { x: -Math.sin(lon), y: Math.cos(lon), z: 0 };
  const up = { x: Math.cos(lat) * Math.cos(lon), y: Math.cos(lat) * Math.sin(lon), z: Math.sin(lat) };
  const forward = add(scale(north, Math.cos(state.headingRad)), scale(east, Math.sin(state.headingRad)));
  const left = add(scale(north, -Math.sin(state.headingRad)), scale(east, Math.cos(state.headingRad)));
  return { north, east, up, forward, left };
}

function probePosition(state: FlightState, probe: typeof PROBES[number]): EcefVector {
  const axes = localAxes(state);
  return add(geodeticToEcef(state.latDeg * DEG_TO_RAD, state.lonDeg * DEG_TO_RAD, state.altMeters),
    add(scale(axes.left, probe.left), add(scale(axes.up, probe.up), scale(axes.forward, probe.forward))));
}

export function createVisibleMeshCollision(sdk: JSBSimSdk, surface: SurfaceQuery) {
  let previousState: FlightState | null = null;
  let lastSafeSnapshot: SimulationSnapshot | null = null;

  return {
    reset(): void { previousState = null; lastSafeSnapshot = null; },
    update(): boolean {
      const current = readFlightState(sdk);
      const support = surface.sample(current.latDeg, current.lonDeg);
      if (!previousState || !support || current.altMeters - support.heightMeters > MAX_COLLISION_ALTITUDE_METERS) {
        previousState = current;
        lastSafeSnapshot = captureSimulation(sdk);
        return false;
      }

      for (const probe of PROBES) {
        const from = probePosition(previousState, probe);
        const to = probePosition(current, probe);
        const movement = subtract(to, from);
        const distance = length(movement);
        if (distance < 0.05) continue;
        const hit = surface.raycast(from, movement, distance);
        if (!hit || hit.distanceMeters >= distance - 0.02) continue;
        if (!lastSafeSnapshot) return false;

        const axes = localAxes(current);
        const normal = hit.normal;
        const northVelocity = sdk.getPropertyValue("velocities/v-north-fps") * 0.3048;
        const eastVelocity = sdk.getPropertyValue("velocities/v-east-fps") * 0.3048;
        const upVelocity = -sdk.getPropertyValue("velocities/v-down-fps") * 0.3048;
        const velocity = add(scale(axes.north, northVelocity), add(scale(axes.east, eastVelocity), scale(axes.up, upVelocity)));
        const normalSpeed = dot(velocity, normal);
        const bounced = normalSpeed < 0 ? subtract(velocity, scale(normal, (1 + RESTITUTION) * normalSpeed)) : velocity;
        const position = add(hit.point, scale(normal, CONTACT_CLEARANCE_METERS));
        const geodetic = ecefToGeodetic(position.x, position.y, position.z);
        lastSafeSnapshot.initial["ic/lat-geod-deg"] = geodetic.latRad / DEG_TO_RAD;
        lastSafeSnapshot.initial["ic/long-gc-deg"] = geodetic.lonRad / DEG_TO_RAD;
        lastSafeSnapshot.initial["ic/h-sl-ft"] = geodetic.altMeters * FEET_PER_METER;
        lastSafeSnapshot.initial["ic/vn-fps"] = dot(bounced, axes.north) * FEET_PER_METER;
        lastSafeSnapshot.initial["ic/ve-fps"] = dot(bounced, axes.east) * FEET_PER_METER;
        lastSafeSnapshot.initial["ic/vd-fps"] = -dot(bounced, axes.up) * FEET_PER_METER;
        restoreSimulation(sdk, lastSafeSnapshot);
        previousState = readFlightState(sdk);
        lastSafeSnapshot = captureSimulation(sdk);
        return true;
      }

      previousState = current;
      lastSafeSnapshot = captureSimulation(sdk);
      return false;
    },
  };
}