// @vitest-environment jsdom
import { FreeCamera, NullEngine, Scene, TransformNode, Vector3, VertexBuffer, type Mesh } from "@babylonjs/core";
import type { SkyGroundLight } from "foss-earth/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AIRCRAFT_LIGHTS, ANTI_COLLISION, BEAMS, flash } from "./aircraftLights";
import { createAircraftLights, type AircraftLightSettings } from "./createAircraftLights";

const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
});

const SETTINGS: AircraftLightSettings = {
  navigation: true, antiCollision: true, landing: true, groundLight: true, sizePx: 32, liftMeters: 0.3, referenceNits: 1000,
};

function setup(aircraftId: "cessna-172" | "f-35b", overrides: Partial<AircraftLightSettings> = {}) {
  const engine = new NullEngine({ renderWidth: 800, renderHeight: 800, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 });
  engines.push(engine);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  // The aircraft's body axes are the scene's here, its reference point 1 m up; a chase camera behind and above it.
  const body = new TransformNode("body", scene);
  body.position.set(0, 1, 0);
  const camera = new FreeCamera("chase", new Vector3(0, 6, -25), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  scene.activeCamera = camera;
  const settings = { ...SETTINGS, ...overrides };
  const groundLights: Array<readonly SkyGroundLight[]> = [];
  const timers: Array<{ id: number; callback: () => void; delayMs: number }> = [];
  let nextTimer = 1;
  const clock = { ms: 10_000, gear: 1, running: true };
  const requestRender = vi.fn();
  const lights = createAircraftLights({
    scene, parent: body, aircraftId, modelOffset: { x: 0, y: -1, z: 0 },
    getSettings: () => settings,
    getWhiteLuminance: () => 2.4,
    setGroundLights: shown => groundLights.push(shown),
    getGearDownNorm: () => clock.gear,
    isRunning: () => clock.running,
    requestRender,
    now: () => clock.ms,
    timers: {
      set: (callback, delayMs) => { timers.push({ id: nextTimer, callback, delayMs }); return nextTimer++; },
      clear: id => { const index = timers.findIndex(timer => timer.id === id); if (index >= 0) timers.splice(index, 1); },
    },
  });
  const frame = () => scene.onBeforeRenderObservable.notifyObservers(scene);
  return { scene, body, camera, settings, lights, groundLights, timers, clock, requestRender, frame, points: () => scene.getMeshByName("light-points") as Mesh };
}

describe("aircraft lights in the scene", () => {
  it("draws each of the aircraft's lights as a point on its airframe, as bright towards the camera as it shines", () => {
    const h = setup("cessna-172");
    h.frame();
    const points = h.points();
    expect(points.getTotalVertices()).toBe(AIRCRAFT_LIGHTS["cessna-172"].length * 4);
    expect(points.isEnabled()).toBe(true);
    const brightness = (index: number) => {
      const colors = points.getVerticesData(VertexBuffer.ColorKind)!;
      return Math.max(colors[index * 16], colors[index * 16 + 1], colors[index * 16 + 2]);
    };
    // From behind and above: the white tail light shines this way; the red and green shine forward and to their sides, so barely.
    const kinds = AIRCRAFT_LIGHTS["cessna-172"].map(light => light.kind);
    const tail = brightness(kinds.indexOf("position-tail"));
    expect(tail).toBeGreaterThan(1);
    // The landing lamp faces forward: from behind it is dark; from in front and off its beam, its lens glows.
    expect(brightness(kinds.indexOf("landing"))).toBe(0);
    h.camera.position.set(30, 4, 30);
    h.camera.setTarget(new Vector3(0, 1, 0));
    h.frame();
    expect(brightness(kinds.indexOf("landing"))).toBeGreaterThan(1);
    h.camera.position.set(0, 6, -25);
    h.camera.setTarget(new Vector3(0, 1, 0));
    h.frame();
    // Each point sits at its place on the airframe, the model offset added, drawn a little towards the camera.
    const positions = points.getVerticesData(VertexBuffer.PositionKind)!;
    const centre = (index: number) => new Vector3(
      (positions[index * 12] + positions[index * 12 + 3] + positions[index * 12 + 6] + positions[index * 12 + 9]) / 4,
      (positions[index * 12 + 1] + positions[index * 12 + 4] + positions[index * 12 + 7] + positions[index * 12 + 10]) / 4,
      (positions[index * 12 + 2] + positions[index * 12 + 5] + positions[index * 12 + 8] + positions[index * 12 + 11]) / 4,
    );
    const left = AIRCRAFT_LIGHTS["cessna-172"][kinds.indexOf("position-left")].position;
    expect(Vector3.Distance(centre(kinds.indexOf("position-left")), new Vector3(left[0], left[1], left[2]))).toBeCloseTo(0.3, 2);
  });

  it("lights the ground with its landing and taxi beams where they point, and stops when they are off", () => {
    const h = setup("cessna-172");
    h.frame();
    const shown = h.groundLights.at(-1)!;
    expect(shown.map(light => light.intensityCd[1] > 0)).toEqual([true, true]);
    const landing = shown[0];
    // At the lamp's place on the left wing, pointed a little below the nose, with its beam's cosines.
    const lamp = AIRCRAFT_LIGHTS["cessna-172"].find(light => light.kind === "landing")!;
    expect(Vector3.Distance(landing.position, new Vector3(lamp.position[0], lamp.position[1], lamp.position[2]))).toBeLessThan(1e-6);
    expect(landing.direction.z).toBeGreaterThan(0.99);
    expect(landing.direction.y).toBeLessThan(0);
    expect(landing.cosInner).toBeCloseTo(Math.cos((BEAMS.landing.innerDeg * Math.PI) / 180), 12);
    // A candela of its colour in each band: the luminance is the peak.
    expect(0.2126 * landing.intensityCd[0] + 0.7152 * landing.intensityCd[1] + 0.0722 * landing.intensityCd[2]).toBeCloseTo(BEAMS.landing.peakCd, 3);
    // Turned with the aircraft.
    h.body.rotation.y = Math.PI / 2;
    h.frame();
    expect(Math.abs(h.groundLights.at(-1)![0].direction.x)).toBeGreaterThan(0.99);
    // Off: the ground is told once, and then nothing more.
    h.settings.landing = false;
    h.lights.refresh();
    h.frame();
    expect(h.groundLights.at(-1)).toEqual([]);
    const calls = h.groundLights.length;
    h.frame();
    expect(h.groundLights).toHaveLength(calls);
  });

  it("lights a gear leg's lamps only with the gear down", () => {
    const h = setup("f-35b");
    h.frame();
    expect(h.groundLights.at(-1)).toHaveLength(2);
    h.clock.gear = 0.4;
    h.frame();
    expect(h.groundLights.at(-1)).toEqual([]);
  });

  it("asks for a frame at each flash's start and end while anti-collision lights are on, and for none otherwise", () => {
    const h = setup("cessna-172");
    expect(h.timers).toHaveLength(1);
    // The next change is the nearer of the strobe's and the beacon's.
    const seconds = h.clock.ms / 1000;
    const strobe = ANTI_COLLISION.strobe;
    const into = (((seconds - strobe.phaseSeconds) % strobe.periodSeconds) + strobe.periodSeconds) % strobe.periodSeconds;
    const strobeChange = into < strobe.flashSeconds ? strobe.flashSeconds - into : strobe.periodSeconds - into;
    expect(h.timers[0].delayMs).toBeLessThanOrEqual(strobeChange * 1000 + 1e-6);
    h.clock.ms += h.timers[0].delayMs;
    h.timers.shift()!.callback();
    expect(h.requestRender).toHaveBeenCalledOnce();
    expect(h.timers).toHaveLength(1);
    h.settings.antiCollision = false;
    h.lights.refresh();
    expect(h.timers).toHaveLength(0);
    h.lights.dispose();
    expect(h.scene.getMeshByName("light-points")).toBeNull();
  });

  it("holds its flashing lights as they are while the flight stands still, and asks for no frames until it runs again", () => {
    const h = setup("cessna-172");
    const kinds = AIRCRAFT_LIGHTS["cessna-172"].map(light => light.kind);
    const strobeLit = () => {
      h.frame();
      const colors = h.points().getVerticesData(VertexBuffer.ColorKind)!;
      return colors[kinds.indexOf("strobe") * 16] > 0;
    };
    // At 10 s the beacon is lit and the strobes dark; the beacon's end, 83 ms on, is the next change.
    expect(strobeLit()).toBe(false);
    const toBeaconEnd = (ANTI_COLLISION.beacon.flashSeconds - ((10 - ANTI_COLLISION.beacon.phaseSeconds) % ANTI_COLLISION.beacon.periodSeconds)) * 1000;
    expect(h.timers[0].delayMs).toBeCloseTo(toBeaconEnd, 6);
    // Paused: the next frame drawn sees it and stops waiting for flashes.
    h.clock.running = false;
    h.clock.ms += 20;
    expect(strobeLit()).toBe(false);
    expect(h.timers).toHaveLength(0);
    // 800 ms on the strobes would be lit; held, a frame drawn as the camera turns shows them as they were.
    h.clock.ms += 800;
    expect(flash("strobe", h.clock.ms / 1000).lit).toBe(true);
    expect(strobeLit()).toBe(false);
    expect(h.requestRender).not.toHaveBeenCalled();
    // Running again: the next frame takes their time up where it stopped, 20 ms into the wait for the beacon's end.
    h.clock.running = true;
    h.frame();
    expect(h.timers).toHaveLength(1);
    expect(h.timers[0].delayMs).toBeCloseTo(toBeaconEnd - 20, 6);
    // A timer comes a little late, as a browser's does.
    const late = 0.5;
    h.clock.ms += h.timers[0].delayMs + late;
    h.timers.shift()!.callback();
    expect(h.requestRender).toHaveBeenCalledOnce();
    // Then the strobes' flash at 10.8 s of their own time, later by the clock by the 800 ms the flight stood still.
    expect(h.timers[0].delayMs).toBeCloseTo((9 * ANTI_COLLISION.strobe.periodSeconds - 10) * 1000 - toBeaconEnd - late, 3);
    h.clock.ms += h.timers[0].delayMs + late;
    h.timers.shift()!.callback();
    expect(strobeLit()).toBe(true);
    expect(h.clock.ms).toBeCloseTo(9 * ANTI_COLLISION.strobe.periodSeconds * 1000 + 800 + late, 3);

    // With no frame drawn, a pause is seen when the flash waited for comes: it asks for no frame and waits for no other.
    const still = setup("cessna-172");
    still.clock.running = false;
    still.clock.ms += still.timers[0].delayMs + late;
    still.timers.shift()!.callback();
    expect(still.requestRender).not.toHaveBeenCalled();
    expect(still.timers).toHaveLength(0);
  });

  it("starts held when the flight is not yet running", () => {
    const engine = new NullEngine({ renderWidth: 64, renderHeight: 64, textureSize: 64, deterministicLockstep: false, lockstepMaxSteps: 1 });
    engines.push(engine);
    const scene = new Scene(engine);
    const timers: Array<() => void> = [];
    let running = false;
    createAircraftLights({
      scene, parent: new TransformNode("body", scene), aircraftId: "cessna-172", modelOffset: { x: 0, y: 0, z: 0 },
      getSettings: () => SETTINGS, getWhiteLuminance: () => 2.4, setGroundLights: () => {}, getGearDownNorm: () => 1,
      isRunning: () => running, requestRender: vi.fn(), now: () => 5_000,
      timers: { set: callback => timers.push(callback), clear: () => {} },
    });
    // Loading or paused at the start: no flash is waited for.
    expect(timers).toHaveLength(0);
    running = true;
    scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(timers).toHaveLength(1);
  });
});
