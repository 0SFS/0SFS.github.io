import "@babylonjs/core";
import { DEG_TO_RAD } from "foss-earth/cameraMath";
import { GOOGLE_ERROR_TARGET_BOUNDS } from "foss-earth/mapDetailPolicy";
//#region src/flight/physics/flightState.ts
const EMPTY_FLIGHT_STATE = {
	latDeg: 0,
	lonDeg: 0,
	altMeters: 0,
	rollRad: 0,
	pitchRad: 0,
	headingRad: 0,
	airspeedKts: 0,
	northVelocityFps: 0,
	eastVelocityFps: 0,
	verticalSpeedFps: 0,
	throttleNorm: 0
};
function feetToMeters(ft) {
	return ft * .3048;
}
function degreesToRadians(deg) {
	return deg * DEG_TO_RAD;
}
//#endregion
//#region src/flight/bridge/ecefBridge.ts
function readFlightState(sdk) {
	return {
		latDeg: sdk.getPropertyValue("position/lat-geod-deg"),
		lonDeg: sdk.getPropertyValue("position/long-gc-deg"),
		altMeters: feetToMeters(sdk.getPropertyValue("position/h-sl-ft")),
		rollRad: degreesToRadians(sdk.getPropertyValue("attitude/phi-deg")),
		pitchRad: degreesToRadians(sdk.getPropertyValue("attitude/theta-deg")),
		headingRad: degreesToRadians(sdk.getPropertyValue("attitude/psi-deg")),
		airspeedKts: sdk.getPropertyValue("velocities/vc-kts"),
		northVelocityFps: sdk.getPropertyValue("velocities/v-north-fps"),
		eastVelocityFps: sdk.getPropertyValue("velocities/v-east-fps"),
		verticalSpeedFps: -sdk.getPropertyValue("velocities/v-down-fps"),
		throttleNorm: sdk.getPropertyValue("fcs/throttle-cmd-norm")
	};
}
//#endregion
//#region src/flight/diagnostics/flightLog.ts
const CONSOLE_METHOD = {
	info: "log",
	warn: "warn",
	error: "error"
};
function createFlightLog(options = {}) {
	const capacity = options.capacity ?? 200;
	const sink = options.console === void 0 ? globalThis.console : options.console;
	const start = (options.now ?? (() => Date.now()))();
	const now = options.now ?? (() => Date.now());
	let entries = [];
	let nextId = 1;
	const listeners = /* @__PURE__ */ new Set();
	const push = (level, source, message, detail) => {
		entries = [{
			id: nextId++,
			atMs: now() - start,
			level,
			source,
			message,
			...detail ? { detail } : {}
		}, ...entries].slice(0, capacity);
		if (sink) {
			const args = [`[${source}] ${message}`];
			if (detail) args.push(detail);
			sink[CONSOLE_METHOD[level]](...args);
		}
		for (const listener of listeners) listener(entries);
	};
	return {
		push,
		info: (source, message, detail) => push("info", source, message, detail),
		warn: (source, message, detail) => push("warn", source, message, detail),
		error: (source, message, detail) => push("error", source, message, detail),
		entries: () => entries,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		clear() {
			entries = [];
			for (const listener of listeners) listener(entries);
		}
	};
}
createFlightLog();
//#endregion
//#region src/flight/jsbsim/fuelTanks.ts
/** One spelling per tank, bracketed even for tank 0, as saved flights record it. */
function fuelTankContentsPath(index) {
	return `propulsion/tank[${index}]/contents-lbs`;
}
/** Every tank the flight model has. Its catalogue spells tank 0 without brackets. */
function fuelTankIndices(reader) {
	if (typeof reader.queryPropertyCatalog !== "function") return [];
	let text;
	try {
		text = reader.queryPropertyCatalog("propulsion/tank");
	} catch {
		return [];
	}
	const indices = /* @__PURE__ */ new Set();
	for (const line of text.split(/\r?\n/)) {
		const match = /^propulsion\/tank(?:\[(\d+)\])?\/contents-lbs\b/.exec(line.trim());
		if (match) indices.add(Number(match[1] ?? 0));
	}
	return [...indices].sort((a, b) => a - b);
}
//#endregion
//#region src/flight/physics/safeFlightState.ts
/**
* Which envelope checks a state fails, as readable strings.
*
* The loop pauses the simulator on an invalid state, so the reason has to be
* recoverable after the fact — "invalid" alone is not actionable.
*/
function invalidFlightStateReasons(state) {
	const reasons = [];
	for (const [key, value] of Object.entries(state)) if (!Number.isFinite(value)) reasons.push(`${key} is ${value}`);
	if (Math.abs(state.latDeg) > 90) reasons.push(`latDeg ${state.latDeg.toFixed(4)} outside +-90`);
	if (Math.abs(state.lonDeg) > 180) reasons.push(`lonDeg ${state.lonDeg.toFixed(4)} outside +-180`);
	if (Math.abs(state.altMeters) >= 1e5) reasons.push(`altMeters ${state.altMeters.toFixed(1)} beyond 100000`);
	if (!(state.airspeedKts >= 0)) reasons.push(`airspeedKts ${state.airspeedKts} below 0`);
	if (state.airspeedKts >= 1500) reasons.push(`airspeedKts ${state.airspeedKts.toFixed(1)} beyond 1500`);
	if (Math.abs(state.verticalSpeedFps) >= 5e3) reasons.push(`verticalSpeedFps ${state.verticalSpeedFps.toFixed(1)} beyond 5000`);
	return reasons;
}
function validFlightState(state) {
	return invalidFlightStateReasons(state).length === 0;
}
const controls = [
	"fcs/throttle-cmd-norm",
	"fcs/mixture-cmd-norm",
	"fcs/elevator-cmd-norm",
	"fcs/aileron-cmd-norm",
	"fcs/rudder-cmd-norm",
	"fcs/pitch-trim-cmd-norm",
	"fcs/roll-trim-cmd-norm",
	"gear/gear-cmd-norm",
	"gear/gear-pos-norm",
	"fcs/flap-cmd-norm",
	"fcs/left-brake-cmd-norm",
	"fcs/right-brake-cmd-norm",
	"atmosphere/wind-north-fps",
	"atmosphere/wind-east-fps",
	"atmosphere/wind-down-fps"
];
const optionalAircraftControls = [
	"fcs/stovl-cmd-norm",
	"fcs/stovl-pos-norm",
	"fcs/control-law-mode"
];
const modelControls = /* @__PURE__ */ new WeakMap();
const modelEngineThermalState = /* @__PURE__ */ new WeakMap();
function engineThermalStateProperties(sdk) {
	const cached = modelEngineThermalState.get(sdk);
	if (cached) return cached;
	const catalog = /* @__PURE__ */ new Map();
	if (typeof sdk.queryPropertyCatalog === "function") for (const line of sdk.queryPropertyCatalog("propulsion/engine").split(/\r?\n/)) {
		const match = /^(\S+)\s+\(([RW]+)\)\s*$/.exec(line.trim());
		if (match) catalog.set(match[1], match[2]);
	}
	const properties = [...catalog].flatMap(([state, access]) => {
		if (!/^propulsion\/engine(?:\[\d+\])?\/thermal\/metal-temperature-state-k$/.test(state) || !access.includes("R") || !access.includes("W")) return [];
		const initialized = state.replace(/metal-temperature-state-k$/, "initialized");
		return catalog.get(initialized)?.includes("R") ? [{
			state,
			initialized
		}] : [];
	});
	modelEngineThermalState.set(sdk, properties);
	return properties;
}
function captureEngineThermalState(sdk) {
	return engineThermalStateProperties(sdk).flatMap(({ state, initialized }) => {
		const ready = sdk.getPropertyValue(initialized);
		if (!Number.isFinite(ready) || ready <= .5) return [];
		const temperature = sdk.getPropertyValue(state);
		return Number.isFinite(temperature) && temperature > 0 ? [[state, temperature]] : [];
	});
}
/** Restore observed native wall state before RunIC or warm engine initialization. */
function restoreEngineThermalState(sdk, snapshotControls) {
	for (const { state } of engineThermalStateProperties(sdk)) {
		const temperature = snapshotControls[state];
		if (Number.isFinite(temperature) && temperature > 0) sdk.setPropertyValue(state, temperature);
	}
}
function restoreControls(sdk, snapshotControls) {
	for (const [property, value] of Object.entries(snapshotControls)) {
		if (/^propulsion\/engine(?:\[\d+\])?\/thermal\//.test(property)) continue;
		sdk.setPropertyValue(property, value);
	}
}
function controlsForModel(sdk) {
	const cached = modelControls.get(sdk);
	if (cached) return cached;
	const catalog = new Set(typeof sdk.queryPropertyCatalog === "function" ? sdk.queryPropertyCatalog("fcs/").split(/\r?\n/).map((line) => line.trim().split(/\s+/)[0]) : []);
	const paths = [
		...controls,
		...optionalAircraftControls.filter((path) => catalog.has(path)),
		...(sdk.queryPropertyCatalog?.("stores/external-tank") ?? "").split(/\r?\n/).map((line) => line.trim().split(/\s+/)[0]).filter((path) => /^stores\/external-tank(?:\[\d+\])?\/attached$/.test(path)),
		...fuelTankIndices(sdk).map(fuelTankContentsPath)
	];
	modelControls.set(sdk, paths);
	return paths;
}
const initialProperties = {
	"ic/lat-geod-deg": "position/lat-geod-deg",
	"ic/long-gc-deg": "position/long-gc-deg",
	"ic/h-sl-ft": "position/h-sl-ft",
	"ic/terrain-elevation-ft": "position/terrain-elevation-asl-ft",
	"ic/phi-deg": "attitude/phi-deg",
	"ic/theta-deg": "attitude/theta-deg",
	"ic/psi-true-deg": "attitude/psi-deg",
	"ic/vn-fps": "velocities/v-north-fps",
	"ic/ve-fps": "velocities/v-east-fps",
	"ic/vd-fps": "velocities/v-down-fps",
	"ic/p-rad_sec": "velocities/p-rad_sec",
	"ic/q-rad_sec": "velocities/q-rad_sec",
	"ic/r-rad_sec": "velocities/r-rad_sec"
};
function captureSimulation(sdk) {
	const timing = sdk;
	return {
		initial: Object.fromEntries(Object.entries(initialProperties).map(([ic, property]) => [ic, sdk.getPropertyValue(property)])),
		controls: Object.fromEntries([...controlsForModel(sdk).map((property) => [property, sdk.getPropertyValue(property)]), ...captureEngineThermalState(sdk)]),
		running: sdk.getPropertyValue("propulsion/engine/set-running") > .5,
		simTimeS: timing.getSimTime?.() ?? sdk.getPropertyValue("simulation/sim-time-sec")
	};
}
/** Clear contact forces and integrator history before rebuilding valid kinematics. */
function restoreSimulation(sdk, snapshot) {
	if (![
		...Object.values(snapshot.initial),
		...Object.values(snapshot.controls),
		snapshot.simTimeS
	].every(Number.isFinite)) throw new Error("Invalid simulation snapshot");
	sdk.resetToInitialConditions(2);
	restoreEngineThermalState(sdk, snapshot.controls);
	sdk.setSimTime?.(snapshot.simTimeS);
	for (const [property, value] of Object.entries(snapshot.initial)) sdk.setPropertyValue(property, value);
	restoreControls(sdk, snapshot.controls);
	if (!sdk.runIc()) throw new Error("Flight state reinitialization failed");
	if (snapshot.running) sdk.setPropertyValue("propulsion/set-running", -1);
	else sdk.setPropertyValue("propulsion/engine/set-running", 0);
	restoreControls(sdk, snapshot.controls);
	if (!sdk.runIc()) throw new Error("Flight engine reinitialization failed");
	restoreControls(sdk, snapshot.controls);
}
const FIXED_DT = 1 / 120;
FIXED_DT * 6;
//#endregion
//#region src/flight/aircraft/engineRotorDefinitions.ts
const C172_ROTOR_BLADES = Object.freeze({
	outer: 2,
	inner: null,
	outerEstimated: false,
	innerEstimated: false
});
const FJ33_ROTOR_BLADES = Object.freeze({
	outer: 16,
	inner: 30,
	outerEstimated: false,
	innerEstimated: true
});
const F135_ROTOR_BLADES = Object.freeze({
	outer: 22,
	inner: 36,
	outerEstimated: true,
	innerEstimated: true
});
//#endregion
//#region src/flight/aircraft/sf50Variants.ts
const SF50_VARIANTS = [
	{
		id: "g1",
		aircraftId: "cirrus-vision-jet",
		model: "sf50",
		label: "Cirrus Vision Jet G1",
		maxOperatingAltitudeFt: 28e3,
		summary: "G1 development model. Public AFM inputs applied; calibration ongoing. Shared exterior mesh.",
		evidenceScope: "Historical AFM 31452-001 Rev 4 and explicitly identified G1 recordings.",
		sources: ["https://flightsimcoach.com/wp-content/uploads/2020/12/SF50-POH.pdf"],
		physicsStatus: "development-baseline",
		independentlyValidated: false
	},
	{
		id: "g2",
		aircraftId: "cirrus-vision-jet-g2",
		model: "sf50-g2",
		label: "Cirrus Vision Jet G2",
		maxOperatingAltitudeFt: 31e3,
		summary: "G2, not G2+. G1-based development physics and shared mesh; G2 performance is not yet calibrated.",
		evidenceScope: "G2/FL310 configuration. G2+ updated-thrust tables are kept separate.",
		sources: ["https://cirrusaircraft.com/story/cirrus-aircraft-unveils-generation-2-vision-jet/"],
		physicsStatus: "development-baseline",
		independentlyValidated: false
	},
	{
		id: "g3",
		aircraftId: "cirrus-vision-jet-g3",
		model: "sf50-g3",
		label: "Cirrus Vision Jet G3",
		maxOperatingAltitudeFt: 31e3,
		summary: "G3 development profile. Shared G1-based physics and mesh, not yet a calibrated G3 engine, cabin or avionics simulation.",
		evidenceScope: "2026 manufacturer specifications only; no approved G3 AFM performance matrix acquired.",
		sources: ["https://cirrusaircraft.com/story/cirrus-unveils-new-g3-vision-jet/", "https://cirrusaircraft.com/aircraft/vision-jet/"],
		physicsStatus: "development-baseline",
		independentlyValidated: false
	}
];
/** Never fall back to a different generation's evidence. */
function getSf50Variant(id) {
	const variant = SF50_VARIANTS.find((entry) => entry.id === id);
	if (!variant) throw new RangeError("Unsupported SF50 generation: " + String(id));
	return variant;
}
//#endregion
//#region src/flight/physics/collisionGeometry.ts
/** Body points swept against visible terrain/building triangles each physics step.
* Offsets are metres from the propagated aircraft centre: left, up, forward.
* These are point probes, not the vertices of a solid collision hull.
*/
const BODY_COLLISION_PROBES = [
	{
		name: "nose",
		left: 0,
		up: .7,
		forward: 4.5
	},
	{
		name: "center",
		left: 0,
		up: -.2,
		forward: 0
	},
	{
		name: "left-wing",
		left: 5.5,
		up: .6,
		forward: .2
	},
	{
		name: "right-wing",
		left: -5.5,
		up: .6,
		forward: .2
	},
	{
		name: "tail",
		left: 0,
		up: 1.4,
		forward: -3.8
	}
];
/** SF50 three-view approximation, relative to the initial model's empty CG.
* Source: planes/Cirrus_Vision_Jet/agent_workspace/measurements/sf50_reference.md.
* These are conservative body probes, not wheel contacts or a validated hull.
*/
const SF50_BODY_COLLISION_PROBES = [
	{
		name: "nose",
		left: 0,
		up: .2,
		forward: 4.064
	},
	{
		name: "belly",
		left: 0,
		up: -.82,
		forward: 0
	},
	{
		name: "left-wing",
		left: 5.898,
		up: .14,
		forward: -.25
	},
	{
		name: "right-wing",
		left: -5.898,
		up: .14,
		forward: -.25
	},
	{
		name: "left-tail",
		left: 2.24,
		up: 2.2,
		forward: -4.94
	},
	{
		name: "right-tail",
		left: -2.24,
		up: 2.2,
		forward: -4.94
	}
];
//#endregion
//#region src/flight/jsbsim/fdmProfiles.ts
const C172_STATI = {
	staticMeters: 1.33,
	staticPitchRad: 2.48 * Math.PI / 180,
	pitchArmMeters: 4.5,
	rollArmMeters: 5.5
};
const SF50_STATI = {
	staticMeters: 1.12,
	staticPitchRad: 0,
	pitchArmMeters: 4.68,
	rollArmMeters: 5.9
};
function createSf50Profile(variantId) {
	const variant = getSf50Variant(variantId);
	return {
		model: variant.model,
		sf50VariantId: variant.id,
		maxOperatingAltitudeFt: variant.maxOperatingAltitudeFt,
		engine: "turbine",
		rotorBlades: FJ33_ROTOR_BLADES,
		startSpeed: {
			property: "propulsion/engine[0]/n2",
			runningAt: 53.4
		},
		rudderSign: 1,
		stance: SF50_STATI,
		gauges: {
			primary: "propulsion/engine[0]/n1",
			secondary: "propulsion/engine[0]/n2",
			label: "N1 %"
		},
		initialThrottleNorm: .35,
		initialGearDown: false,
		flapPosition: {
			property: "fcs/flap-pos-norm",
			fullTravel: 1
		},
		automaticFlaps: {
			kind: "assist",
			approach: [
				[0, 1],
				[100, 1],
				[140, .5],
				[160, .5],
				[180, 0]
			],
			takeoffNorm: .5,
			takeoffRetractionKts: [110, 115],
			climbThrottleNorm: .7,
			retractWithGear: true
		},
		runwayPresets: {
			departure: {
				airspeedKts: 0,
				throttleNorm: 0,
				flapsNorm: .5,
				pitchDeg: 0
			},
			arrival: {
				airspeedKts: 85,
				throttleNorm: .35,
				flapsNorm: 1,
				pitchDeg: 3
			}
		},
		bodyCollisionProbes: SF50_BODY_COLLISION_PROBES
	};
}
const FDM_PROFILES = {
	"cessna-172": {
		model: "c172p",
		engine: "piston",
		rotorBlades: C172_ROTOR_BLADES,
		maxEngineRpm: 2700,
		startSpeed: {
			property: "propulsion/engine[0]/engine-rpm",
			runningAt: .8 * 550
		},
		rudderSign: -1,
		stance: C172_STATI,
		gauges: {
			primary: "propulsion/engine[0]/propeller-rpm",
			secondary: "propulsion/engine[0]/engine-rpm",
			label: "RPM"
		},
		initialThrottleNorm: .65,
		initialGearDown: true,
		flapPosition: {
			property: "fcs/flap-pos-deg",
			fullTravel: 30
		},
		automaticFlaps: {
			kind: "assist",
			approach: [
				[0, 1],
				[65, 1],
				[80, 1 / 3],
				[95, 1 / 3],
				[105, 0]
			],
			takeoffNorm: 0,
			takeoffRetractionKts: [65, 75],
			climbThrottleNorm: .7,
			retractWithGear: false
		},
		runwayPresets: {
			departure: {
				airspeedKts: 0,
				throttleNorm: 0,
				flapsNorm: 0,
				pitchDeg: 2.48
			},
			arrival: {
				airspeedKts: 75,
				throttleNorm: .35,
				flapsNorm: 0,
				pitchDeg: 3
			}
		},
		bodyCollisionProbes: BODY_COLLISION_PROBES
	},
	"cirrus-vision-jet": createSf50Profile("g1"),
	"cirrus-vision-jet-g2": createSf50Profile("g2"),
	"cirrus-vision-jet-g3": createSf50Profile("g3"),
	"f-35b": {
		model: "F-35B-jsbsim",
		requiredReadOnlyModelProperties: ["propulsion/engine[0]/body-force-z-lbs"],
		forceEngineLabels: {
			0: "Main engine",
			1: "Lift fan",
			2: "Right roll post",
			3: "Left roll post"
		},
		dataPaths: {
			enginePath: "aircraft/F-35B-jsbsim/Engines",
			systemsPath: "aircraft/F-35B-jsbsim/Systems"
		},
		stovl: {
			commandProperty: "fcs/stovl-cmd-norm",
			positionProperty: "fcs/stovl-pos-norm"
		},
		automaticFlaps: {
			kind: "native",
			commandProperty: "fcs/flaps-auto-enabled"
		},
		controlLaw: {
			commandProperty: "fcs/control-law-mode",
			enabledProperty: "fcs/fbw-enabled",
			automaticMode: "fly-by-wire"
		},
		engine: "turbine",
		rotorBlades: F135_ROTOR_BLADES,
		startSpeed: {
			property: "propulsion/engine[0]/n2",
			runningAt: 60
		},
		rudderSign: -1,
		stance: {
			staticMeters: 1.267,
			staticPitchRad: 1.18 * Math.PI / 180,
			pitchArmMeters: 6.5,
			rollArmMeters: 5.350764
		},
		gauges: {
			primary: "propulsion/engine[0]/n1",
			secondary: "propulsion/engine[0]/n2",
			label: "N1 %"
		},
		initialThrottleNorm: .48,
		initialAirspeedKts: 300,
		initialPitchDeg: 1.92,
		initialGearDown: false,
		initialProperties: {
			"fcs/stovl-cmd-norm": 0,
			"fcs/stovl-pos-norm": 0,
			"fcs/stovl-augmentation-inhibit": 0,
			"fcs/throttle1": 0,
			"fcs/throttle2": 0,
			"fcs/throttle3": 0,
			"fcs/mixture-cmd-norm": 1,
			"fcs/pitch-trim-cmd-norm": -.059,
			"fcs/roll-trim-cmd-norm": 0,
			"propulsion/engine[0]/pitch-angle-rad": 0,
			"propulsion/engine[0]/yaw-angle-rad": 0
		},
		flapPosition: {
			property: "fcs/flap-pos-norm",
			fullTravel: 1,
			minNorm: -.1
		},
		runwayPresets: {
			departure: {
				airspeedKts: 0,
				throttleNorm: 0,
				flapsNorm: 0,
				pitchDeg: 1.18
			},
			arrival: {
				airspeedKts: 160,
				throttleNorm: .5,
				flapsNorm: 0,
				pitchDeg: 5
			}
		},
		bodyCollisionProbes: []
	}
};
function getFdmProfile(aircraftId) {
	return FDM_PROFILES[aircraftId];
}
//#endregion
//#region src/flight/aircraft/engineExhaustProfiles.ts
const f135OpticalProfile = {
	"id": "f135-visible-approximation-v1",
	"width": 64,
	"height": 32,
	"colorSpace": "linear-srgb",
	"dry": {
		"firstRow": 0,
		"rowCount": 16,
		"temperatureKelvinRange": [300, 1800]
	},
	"afterburner": {
		"firstRow": 16,
		"rowCount": 16,
		"temperatureKelvinRange": [1e3, 3e3]
	},
	"hudAccentHex": "#ff9450",
	"surfaceEmission": {
		"temperatureKelvinRange": [300, 1800],
		"unit": "cd/m2",
		"samples": [
			[
				387111264519e-32,
				0,
				0
			],
			[
				428157741619e-31,
				0,
				0
			],
			[
				405877848699e-30,
				0,
				0
			],
			[
				335052287291e-29,
				0,
				0
			],
			[
				244123607706e-28,
				0,
				0
			],
			[
				158813148182e-27,
				0,
				0
			],
			[
				931636620955e-27,
				0,
				0
			],
			[
				497081859068e-26,
				0,
				0
			],
			[
				243055922853e-25,
				0,
				0
			],
			[
				10964208592e-23,
				0,
				0
			],
			[
				459009757302e-24,
				0,
				0
			],
			[
				179290147044e-23,
				0,
				0
			],
			[
				656556984723e-23,
				0,
				0
			],
			[
				226395707723e-22,
				0,
				0
			],
			[
				738029387064e-22,
				0,
				0
			],
			[
				228281505743e-21,
				0,
				0
			],
			[
				672217746092e-21,
				0,
				0
			],
			[
				1.89027327948e-9,
				0,
				0
			],
			[
				5.0902877089e-9,
				0,
				0
			],
			[
				1.31612062064e-8,
				0,
				0
			],
			[
				3.27514797982e-8,
				0,
				0
			],
			[
				7.86168926982e-8,
				0,
				0
			],
			[
				1.82409298946e-7,
				0,
				0
			],
			[
				4.09878847279e-7,
				0,
				0
			],
			[
				8.9353834156e-7,
				0,
				0
			],
			[
				189294171987e-17,
				0,
				0
			],
			[
				390296724414e-17,
				0,
				0
			],
			[
				7843458312e-15,
				0,
				0
			],
			[
				153834805181e-16,
				0,
				0
			],
			[
				294833300989e-16,
				0,
				0
			],
			[
				552813109366e-16,
				0,
				0
			],
			[
				.000101515445011,
				0,
				0
			],
			[
				.000182759409304,
				0,
				0
			],
			[
				.000322875500796,
				0,
				0
			],
			[
				.000560255626414,
				0,
				0
			],
			[
				.000955646605686,
				0,
				0
			],
			[
				.00160365313135,
				0,
				0
			],
			[
				.0026493975964,
				0,
				0
			],
			[
				.00431231011129,
				0,
				0
			],
			[
				.00691964621616,
				0,
				0
			],
			[
				.0109531080896,
				0,
				0
			],
			[
				.0171129035276,
				0,
				0
			],
			[
				.0264047433561,
				0,
				0
			],
			[
				.0402566812346,
				0,
				0
			],
			[
				.0606743697398,
				0,
				0
			],
			[
				.0904452730019,
				0,
				0
			],
			[
				.133404668294,
				0,
				0
			],
			[
				.19477891477,
				0,
				0
			],
			[
				.281624492888,
				0,
				0
			],
			[
				.403384745873,
				0,
				0
			],
			[
				.572590104167,
				0,
				0
			],
			[
				.805731859935,
				0,
				0
			],
			[
				1.12434429101,
				0,
				0
			],
			[
				1.55633511598,
				0,
				0
			],
			[
				2.13760989183,
				0,
				0
			],
			[
				2.91404203329,
				0,
				0
			],
			[
				3.94384662219,
				0,
				0
			],
			[
				5.2606785878,
				.0118192639634,
				0
			],
			[
				6.95766069358,
				.035114248198,
				0
			],
			[
				9.14274229396,
				.0718450408615,
				0
			],
			[
				11.9392510346,
				.127513047204,
				0
			],
			[
				15.4973129291,
				.209405908079,
				0
			],
			[
				19.9986986575,
				.327067582704,
				0
			],
			[
				25.6623584544,
				.492867353065,
				0
			],
			[
				32.7507132009,
				.722683593521,
				0
			],
			[
				41.5767720162,
				1.03671984112,
				0
			],
			[
				52.5121490095,
				1.46047245726,
				0
			],
			[
				65.9960538461,
				2.02587097811,
				0
			],
			[
				82.5453323788,
				2.77261409659,
				0
			],
			[
				102.765634759,
				3.74972608894,
				0
			],
			[
				127.363789136,
				5.01736037878,
				0
			],
			[
				157.161459277,
				6.64887880503,
				0
			],
			[
				193.110164123,
				8.73323701092,
				0
			],
			[
				236.307736499,
				11.3777081821,
				0
			],
			[
				288.016296831,
				14.7109791159,
				0
			],
			[
				349.681815844,
				18.8866542829,
				0
			],
			[
				422.955337768,
				24.0872051298,
				0
			],
			[
				509.71593267,
				30.5284033511,
				0
			],
			[
				612.095442985,
				38.4642782138,
				0
			],
			[
				732.50508541,
				48.1926392298,
				0
			],
			[
				873.663964799,
				60.061206533,
				0
			],
			[
				1038.62955181,
				74.4743922075,
				0
			],
			[
				1230.83017069,
				91.9007765226,
				0
			],
			[
				1454.09953774,
				112.881323549,
				0
			],
			[
				1712.71338512,
				138.038380942,
				0
			],
			[
				2011.42819776,
				168.085508797,
				0
			],
			[
				2355.52208492,
				203.838182347,
				0
			],
			[
				2750.83780047,
				246.225412971,
				0
			],
			[
				3203.82791913,
				296.3023314,
				0
			],
			[
				3721.60216823,
				355.263776242,
				0
			],
			[
				4311.97690727,
				424.458929923,
				0
			],
			[
				4983.52673997,
				505.407042928,
				0
			],
			[
				5745.63823576,
				599.814285748,
				0
			],
			[
				6608.56573023,
				709.591766278,
				0
			],
			[
				7583.48916645,
				836.874748544,
				0
			],
			[
				8682.57393164,
				984.043106514,
				0
			],
			[
				9919.03263634,
				1153.7430445,
				0
			],
			[
				11307.1887761,
				1348.9101132,
				0
			],
			[
				12862.5422086,
				1572.79354773,
				0
			],
			[
				14601.8363734,
				1828.98195128,
				0
			],
			[
				16543.1271723,
				2121.43034508,
				0
			],
			[
				18705.8534269,
				2454.48860211,
				0
			],
			[
				21110.9088187,
				2832.93127906,
				0
			],
			[
				23780.7152155,
				3261.98885755,
				0
			],
			[
				26739.2972819,
				3747.38040215,
				0
			],
			[
				30012.3582651,
				4295.34763966,
				0
			],
			[
				33627.3568456,
				4912.69045988,
				0
			],
			[
				37613.5849361,
				5606.80383537,
				0
			],
			[
				42002.2463108,
				6385.71615329,
				0
			],
			[
				46826.5359405,
				7258.12894937,
				0
			],
			[
				52121.7199116,
				8233.45803011,
				0
			],
			[
				57925.2157986,
				9321.87596583,
				0
			],
			[
				64276.6733638,
				10534.3559336,
				0
			],
			[
				71218.0554515,
				11882.7168853,
				0
			],
			[
				78793.7189474,
				13379.6700138,
				0
			],
			[
				87050.4956694,
				15038.8664838,
				0
			],
			[
				96037.7730587,
				16874.9463948,
				0
			],
			[
				105807.574539,
				18903.5889375,
				0
			],
			[
				116414.639414,
				21141.5637015,
				0
			],
			[
				127916.502167,
				23606.7830916,
				0
			],
			[
				140373.571046,
				26318.3558051,
				0
			],
			[
				153849.205793,
				29296.6413204,
				0
			],
			[
				168409.794399,
				32563.3053442,
				0
			],
			[
				184124.828767,
				36141.3761629,
				0
			],
			[
				201066.979151,
				40055.3018412,
				0
			],
			[
				219312.167265,
				44331.0082071,
				0
			],
			[
				238939.637939,
				48995.9575643,
				0
			],
			[
				260032.029219,
				54079.2080664,
				0
			]
		]
	},
	"temporalEmission": {
		"periodSeconds": .8,
		"samples": [
			1.020521,
			1.01902484,
			1.01541466,
			1.01791022,
			1.02024696,
			1.01407798,
			1.00523472,
			1.00666866,
			1.01861519,
			1.02754827,
			1.02582603,
			1.02112685,
			1.02147446,
			1.02087689,
			1.00923438,
			.99053833,
			.979479,
			.98097516,
			.98458534,
			.98208978,
			.97975304,
			.98592202,
			.99476528,
			.99333134,
			.98138481,
			.97245173,
			.97417397,
			.97887315,
			.97852554,
			.97912311,
			.99076562,
			1.00946167
		]
	},
	textureUrl: new URL("./generated/f135-exhaust-lut.png", import.meta.url).href,
	provenanceUrl: new URL("./generated/f135-exhaust-lut.manifest.json", import.meta.url).href
};
const profiles = new Map([[f135OpticalProfile.id, f135OpticalProfile]]);
function getEngineExhaustOpticalProfile(id) {
	return profiles.get(id);
}
//#endregion
//#region src/flight/aircraft/aircraftIds.ts
const AIRCRAFT_IDS = [
	"cessna-172",
	"cirrus-vision-jet",
	"cirrus-vision-jet-g2",
	"cirrus-vision-jet-g3",
	"f-35b"
];
//#endregion
//#region src/flight/aircraft/aircraftCatalog.ts
/**
* Selectable aircraft and their level-of-detail meshes.
*
* Model axis convention: the sim's body frame is +X left, +Y up, +Z nose
* (see `flightAttitudeToQuaternion`). glTF's own convention is -Z forward, so
* an asset authored the standard way needs a 180 deg yaw to line up. That is
* a pure rotation, not a mirror, so chirality (propeller twist) is preserved.
*/
/** Drop each visual root to align with its profile's settled ground stance. */
const modelOffsetY = (id) => -getFdmProfile(id).stance.staticMeters;
const AIRCRAFT_LOD_IDS = [
	"auto",
	"hd",
	"lod3",
	"lod2",
	"lod1",
	"lod0"
];
const PROCEDURAL = {
	artist: "felipegalin0",
	note: "Measured reconstruction, designed explicitly for max runtime speed."
};
const THUMBNAIL_CREDIT = {
	artist: PROCEDURAL.artist,
	note: "Static render of the existing procedural LOD3 aircraft mesh."
};
const F35B_CREDIT = {
	artist: "AF267",
	note: "Sketchfab model, converted from the author's Blender source.",
	licence: "CC BY 4.0",
	sourceUrl: "https://sketchfab.com/3d-models/lockheed-martin-f-35b-lightning-ii-5d54a6af45974ad386ae74d42b33374a"
};
const SF50_FAMILY_VARIANTS = [...SF50_VARIANTS.map((variant) => ({
	id: variant.id,
	aircraftId: variant.aircraftId,
	label: variant.id.toUpperCase()
})), {
	id: "g2+",
	aircraftId: "cirrus-vision-jet-g2",
	label: "G2+"
}];
/** Family cards choose an airframe; variants below the gallery choose its package. */
const AIRCRAFT_FAMILIES = [
	{
		id: "cessna-172",
		label: "Cessna 172 Skyhawk",
		summary: "High-wing trainer. Flight model and visuals both available.",
		thumbnail: {
			path: "aircraft/thumbnails/cessna-172.png",
			credit: THUMBNAIL_CREDIT
		},
		defaultAircraftId: "cessna-172",
		variants: [{
			id: "cessna-172",
			aircraftId: "cessna-172",
			label: "Cessna 172 Skyhawk"
		}]
	},
	{
		id: "cirrus-vision-jet",
		label: "Cirrus Vision Jet",
		summary: "Single-engine personal jet. G1, G2, G2+ and G3 variants.",
		thumbnail: {
			path: "aircraft/thumbnails/cirrus-vision-jet.png",
			credit: THUMBNAIL_CREDIT
		},
		defaultAircraftId: "cirrus-vision-jet",
		variants: SF50_FAMILY_VARIANTS,
		variantLabel: "Generation",
		developmentNote: "G1, G2 and G3 have separate runtime packages. G2+ is currently mapped to the G2 runtime while separate physics/package support is not yet implemented. Choosing a generation does not provide calibrated generation-specific performance, a new cabin or complete generation-specific avionics."
	},
	{
		id: "f-35b",
		label: "Lockheed Martin F-35B Lightning II",
		summary: "STOVL fighter. Experimental flight model and AF267 exterior model.",
		thumbnail: {
			path: "aircraft/thumbnails/f-35b.png",
			credit: {
				...F35B_CREDIT,
				note: "Static render of AF267's F-35B model."
			}
		},
		defaultAircraftId: "f-35b",
		variants: [{
			id: "f-35b",
			aircraftId: "f-35b",
			label: "F-35B"
		}],
		developmentNote: "Experimental F-16/Aeromatic-derived JSBSim flight model. F-35B performance and STOVL behavior are not validated."
	}
];
const CIRRUS_LODS = [
	{
		id: "hd",
		label: "HD — highest detail",
		triangles: 7294,
		path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_HilosRun.glb",
		autoFromMeters: 0,
		credit: {
			artist: "hilos run",
			note: "Sketchfab model, textured. Higher detail, but modelled gear-up.",
			licence: "CC Attribution",
			sourceUrl: "https://sketchfab.com/3d-models/cirrus-vision-sf50-d46dd06b4b5646acaed90993db34d639"
		},
		optIn: true
	},
	{
		id: "lod3",
		label: "LOD3 — near",
		triangles: 1654,
		path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD3.glb",
		autoFromMeters: 0,
		credit: PROCEDURAL
	},
	{
		id: "lod2",
		label: "LOD2 — medium",
		triangles: 926,
		path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD2.glb",
		autoFromMeters: 65,
		credit: PROCEDURAL
	},
	{
		id: "lod1",
		label: "LOD1 — far",
		triangles: 438,
		path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD1.glb",
		autoFromMeters: 170,
		credit: PROCEDURAL
	}
];
[
	modelOffsetY("cessna-172"),
	...SF50_VARIANTS.map((variant) => ({
		id: variant.aircraftId,
		familyId: "cirrus-vision-jet",
		label: variant.label,
		summary: variant.summary,
		modelYawRad: Math.PI,
		modelOffset: {
			x: 0,
			y: modelOffsetY(variant.aircraftId),
			z: 0
		},
		propellerBlades: 0,
		lods: CIRRUS_LODS
	})),
	(modelOffsetY("f-35b"), 3.18098 + modelOffsetY("f-35b"), getEngineExhaustOpticalProfile("f135-visible-approximation-v1").hudAccentHex)
];
//#endregion
//#region src/flight/hud/engineSpoolMotion.ts
/** Below half a brightness-pattern pitch so its two lobes retain a forward correspondence. */
const DEFAULT_MAX_PATTERN_STEP = .45;
Math.PI * 2;
//#endregion
//#region src/flight/settings/groundInteractionSettings.ts
const GROUND_LOCKABLE_KEYS = [
	"rotation",
	"forceModel",
	"contactModel",
	"backend",
	"tireAudio",
	"haptics",
	"wheelVisuals"
];
const GROUND_CHOICES = {
	rotation: [
		"off",
		"instant",
		"inertia"
	],
	forceModel: [
		"jsbsim",
		"coupled-rigid",
		"combined-slip",
		"compliant-soil"
	],
	contactModel: [
		"shared",
		"per-wheel-point",
		"footprint",
		"swept"
	],
	backend: [
		"auto",
		"cpu-js",
		"cpu-wasm",
		"worker",
		"gpu"
	],
	tireAudio: [
		"off",
		"slip",
		"contact",
		"geometry",
		"detailed"
	],
	haptics: [
		"off",
		"landing",
		"roughness"
	],
	wheelVisuals: ["off", "asset"]
};
/** Each choice's name, for its row and its parameter. */
const GROUND_FIELD_LABELS = {
	rotation: "Wheel response",
	forceModel: "Ground forces",
	contactModel: "Ground contact",
	tireAudio: "Tire audio",
	haptics: "Haptics",
	wheelVisuals: "Wheel visuals",
	backend: "Compute backend"
};
/** Pilot-facing names shared by Ground handling, Debug and status text. */
const GROUND_CHOICE_LABELS = {
	rotation: {
		off: "Off",
		instant: "Instant rolling",
		inertia: "Finite inertia"
	},
	forceModel: {
		"jsbsim": "Existing JSBSim",
		"coupled-rigid": "Coupled rigid wheel",
		"combined-slip": "Combined-slip tire",
		"compliant-soil": "Compliant tire and soil"
	},
	contactModel: {
		"shared": "Shared terrain",
		"per-wheel-point": "Per-wheel support",
		"footprint": "Wheel footprint",
		"swept": "Swept wheel shape"
	},
	backend: {
		"auto": "Auto (CPU today)",
		"cpu-js": "CPU · JavaScript",
		"cpu-wasm": "CPU · WASM",
		"worker": "Worker",
		"gpu": "GPU"
	},
	tireAudio: {
		off: "Off",
		slip: "Slip cue",
		contact: "Contact cues",
		geometry: "Geometry rolling",
		detailed: "Detailed"
	},
	haptics: {
		off: "Off",
		landing: "Landing cues",
		roughness: "Roughness"
	},
	wheelVisuals: {
		off: "Off",
		asset: "Asset wheel rotation"
	}
};
/** The least work: JSBSim's own ground forces and nothing added (the Ground: Minimal preset). */
const DEFAULT_GROUND_INTERACTION_SETTINGS = Object.freeze({
	version: 1,
	selection: "manual",
	rotation: "off",
	forceModel: "jsbsim",
	contactModel: "shared",
	backend: "auto",
	tireAudio: "off",
	haptics: "off",
	wheelVisuals: "off",
	tireAudioVolume: .7,
	hapticStrength: .6,
	locked: {}
});
const lockParameterId = (key) => `osfs.ground.lock.${key}`;
const choiceParameterId = (key) => `osfs.ground.${key}`;
[...GROUND_LOCKABLE_KEYS.map(choiceParameterId), ...GROUND_LOCKABLE_KEYS.map(lockParameterId)];
//#endregion
//#region src/flight/settings/flightParameters.ts
/**
* Every flight parameter: the values 0sfs adds to FOSS Earth's settings
* registry, each with its unit, bounds, default and the reason for it. This is
* the only place a flight default is written; code reads the effective value
* through the registry. Spec: docs/proposals/flight-settings.md.
*/
const PSF = {
	id: "psf",
	text: "psf"
};
const FEET_PER_SECOND = {
	id: "ft/s",
	text: "ft/s"
};
const NEWTON_SECONDS = {
	id: "N·s",
	text: "N·s"
};
const JOULES = {
	id: "J",
	text: "J"
};
const RADIANS_PER_SECOND_SQUARED = {
	id: "rad/s²",
	text: "rad/s²"
};
const KNOTS = {
	id: "kt",
	text: "kt"
};
const MAP_DETAIL = {
	tab: "map",
	section: "detail"
};
const MODEL = {
	tab: "aircraft",
	section: "model"
};
const MESH_INSPECTOR = {
	tab: "aircraft",
	section: "mesh-inspector"
};
const INSTRUMENTS = {
	tab: "renderer",
	section: "instruments"
};
const EXHAUST = {
	tab: "renderer",
	section: "aircraft-exhaust"
};
const EXTERNAL_TANKS = {
	tab: "renderer",
	section: "external-tanks"
};
const FORCES = {
	tab: "debug",
	section: "forces"
};
const AIRCRAFT_VISUALS = {
	tab: "debug",
	section: "aircraft-visuals"
};
const CAMERA = {
	tab: "aircraft",
	section: "camera"
};
const START = {
	tab: "aircraft",
	section: "start"
};
const PHONE_CAMERA = {
	tab: "remote",
	section: "camera"
};
const SOUND = {
	tab: "sound",
	section: "sound"
};
const ENGINE = {
	tab: "engine",
	section: "engine"
};
const ASSISTS = {
	tab: "aircraft",
	section: "assists"
};
const FLIGHT_CONTROLS = {
	tab: "aircraft",
	section: "flight-controls"
};
const GROUND = {
	tab: "aircraft",
	section: "ground"
};
const AUTOPILOT = {
	tab: "autopilot",
	section: "package"
};
const GAMEPAD = {
	tab: "controls",
	section: "gamepad"
};
const KEYBOARD = {
	tab: "controls",
	section: "keyboard"
};
const ORBIT = {
	tab: "controls",
	section: "orbit"
};
const FEEDBACK = {
	tab: "controls",
	section: "feedback"
};
const STOVL = {
	tab: "controls",
	section: "stovl"
};
const FAMILY_VARIANTS = AIRCRAFT_FAMILIES.flatMap((family) => family.variants);
const AIRCRAFT_CHOICES = AIRCRAFT_IDS.map((id) => ({
	id,
	label: FAMILY_VARIANTS.find((variant) => variant.aircraftId === id)?.label ?? id
}));
const GENERATION_CHOICES = AIRCRAFT_FAMILIES.flatMap((family) => family.variants.map((variant) => ({
	id: variant.id,
	label: family.variants.length > 1 ? `${family.label} ${variant.label}` : variant.label
})));
const LOD_LABELS = {
	auto: "Auto, by chase distance",
	hd: "HD, highest detail",
	lod3: "LOD3, near",
	lod2: "LOD2, medium",
	lod1: "LOD1, far",
	lod0: "LOD0, silhouette"
};
const main = (home) => ({
	...home,
	level: "main"
});
const all = (home) => ({
	...home,
	level: "all"
});
const within = (min, max) => () => ({
	min,
	max
});
/** The pre-registry defaults of the keyboard stick, which the migration and the Reset button share. */
const KEYBOARD_STICK_SOURCE = "src/flight/input/keyboardStickResponse.ts";
const OSFS_PARAMETERS = [
	{
		id: "osfs.aircraft.wireframe",
		label: "Show polygon edges",
		description: "Draw orange triangle edges over selected parts of the loaded aircraft. Select parts in the mesh tree; deselecting leaves their surfaces visible. Turning this off releases the edge drawing resources.",
		unit: "none",
		kind: "boolean",
		default: false,
		defaultReason: "Inspecting model geometry is optional; normal flight needs no extra edge draws.",
		home: main(MESH_INSPECTOR),
		appliesLive: true,
		source: "src/flight/createFlightSimApp.ts"
	},
	{
		id: "osfs.debug.renderStowedGear",
		label: "Render stowed landing gear",
		description: "Keep enclosed wheels and struts drawable at full retraction to inspect their stowed pose. Bay doors remain visible in either mode.",
		unit: "none",
		kind: "boolean",
		default: false,
		defaultReason: "Fully enclosed landing gear needs no draw calls during normal flight.",
		home: main(AIRCRAFT_VISUALS),
		appliesLive: true,
		source: "src/flight/aircraft/createAircraftModel.ts"
	},
	{
		id: "osfs.forces.enabled",
		label: "Show aircraft forces",
		description: "Draw native force vectors at their observed application points. Off releases the overlay and stops its native reads.",
		unit: "none",
		kind: "boolean",
		default: false,
		defaultReason: "Force arrows are an optional flight-model diagnostic.",
		home: main(FORCES),
		appliesLive: true,
		source: "src/flight/diagnostics/createForcesDebugOverlay.ts"
	},
	{
		id: "osfs.forces.newtonsPerMeter",
		label: "Arrow force scale",
		description: "Force represented by one metre of arrow length. Smaller values magnify forces without changing the simulation.",
		unit: {
			id: "N/m",
			text: "N/m"
		},
		kind: "number",
		step: 100,
		bounds: within(100, 2e5),
		default: 2e4,
		defaultReason: "A 200 kN force is ten metres long; lower this for smaller aircraft.",
		home: main(FORCES),
		appliesLive: true,
		source: "src/flight/diagnostics/createForcesDebugOverlay.ts"
	},
	{
		id: "osfs.forces.maxArrowMeters",
		label: "Maximum arrow length",
		description: "Caps displayed arrows at this length. Labels retain the actual force and mark capped arrows.",
		unit: "m",
		kind: "number",
		step: 1,
		bounds: within(1, 100),
		default: 20,
		defaultReason: "Keeps diagnostic arrows near the aircraft when a force spikes.",
		home: main(FORCES),
		appliesLive: true,
		source: "src/flight/diagnostics/createForcesDebugOverlay.ts"
	},
	{
		id: "osfs.forces.labels",
		label: "Force labels",
		description: "Show each native force's name and magnitude in kilonewtons beside its arrow.",
		unit: "none",
		kind: "boolean",
		default: true,
		defaultReason: "Names distinguish the lift fan, roll posts and aerodynamic components.",
		home: main(FORCES),
		appliesLive: true,
		source: "src/flight/diagnostics/createForcesDebugOverlay.ts"
	},
	{
		id: "osfs.forces.labelRefreshHz",
		label: "Force label refresh",
		description: "Maximum label texture updates per simulation second. Arrows still follow the latest accepted native forces each frame.",
		unit: "Hz",
		kind: "number",
		step: 1,
		bounds: within(1, 20),
		default: 5,
		defaultReason: "Readable numbers with bounded text and texture upload work; paused native time holds their values.",
		home: main(FORCES),
		appliesLive: true,
		source: "src/flight/diagnostics/createForcesDebugOverlay.ts"
	},
	{
		id: "osfs.aircraft.id",
		label: "Aircraft",
		description: "The flight model, contact geometry, gauges and visuals that load together.",
		unit: "none",
		kind: "choice",
		choices: AIRCRAFT_CHOICES,
		default: "cessna-172",
		defaultReason: "The original default aircraft.",
		home: all(MODEL),
		appliesLive: false,
		source: "src/flight/createFlightSimApp.ts"
	},
	{
		id: "osfs.aircraft.generation",
		label: "Generation",
		description: "Which package of the aircraft's family flies, such as the Vision Jet's G2+.",
		unit: "none",
		kind: "choice",
		choices: GENERATION_CHOICES,
		default: "cessna-172",
		defaultReason: "The default aircraft's only generation; another aircraft uses its own first generation.",
		home: all(MODEL),
		appliesLive: false,
		source: "src/flight/aircraft/aircraftCatalog.ts"
	},
	{
		id: "osfs.aircraft.lod",
		label: "Model detail",
		description: "Which of the aircraft's models is drawn; Auto picks one by the chase camera's distance.",
		unit: "none",
		kind: "choice",
		choices: AIRCRAFT_LOD_IDS.map((id) => ({
			id,
			label: LOD_LABELS[id]
		})),
		default: "auto",
		defaultReason: "The original default: a distant aircraft draws a coarser model.",
		home: all(MODEL),
		appliesLive: true,
		source: "src/flight/aircraft/aircraftCatalog.ts"
	},
	{
		id: "osfs.flight.minimum",
		label: "Flight minimum",
		description: "The coarsest Google 3D Tiles detail a spawn near the ground accepts; the hold keeps detail at least this fine until departure.",
		unit: "px",
		kind: "number",
		scale: "log2",
		step: .05,
		bounds: () => ({
			min: GOOGLE_ERROR_TARGET_BOUNDS.finest,
			max: GOOGLE_ERROR_TARGET_BOUNDS.coarsest,
			reason: "The range of Google 3D Tiles error targets"
		}),
		default: 4096,
		defaultReason: "2^12 px, the value the low-spawn hold has used since it was added; it has not been tuned against a measurement.",
		home: all(MAP_DETAIL),
		appliesLive: true,
		source: "src/flight/worldDetail.ts"
	},
	{
		id: "osfs.flight.holdBelow",
		label: "Hold detail below",
		description: "A spawn closer than this to the sampled surface holds Google 3D Tiles at the Flight minimum until departure.",
		unit: "m",
		kind: "number",
		step: 5,
		bounds: within(0, 2e3),
		default: 100,
		defaultReason: "The value the low-spawn hold has used since it was added; it has not been tuned against a measurement.",
		home: all(MAP_DETAIL),
		appliesLive: true,
		source: "src/flight/worldDetail.ts"
	},
	{
		id: "osfs.flight.holdReleaseAfter",
		label: "Release the hold after",
		description: "How long the aircraft must fly above the hold height before the hold ends, in simulated seconds.",
		unit: "s",
		kind: "number",
		step: .25,
		bounds: within(0, 60),
		default: 1,
		defaultReason: "The original value: one simulated second clear of the hold height counts as a departure.",
		home: all(MAP_DETAIL),
		appliesLive: true,
		source: "src/flight/worldDetail.ts"
	},
	{
		id: "osfs.flight.allowCoarserThisSession",
		label: "Allow coarser terrain for this session",
		description: "Suspends the Flight minimum: a spawn may start below it, and a held requirement ends. Resets when the game reloads.",
		unit: "none",
		kind: "boolean",
		default: false,
		defaultReason: "The Flight minimum is a safety requirement; waiving it is a deliberate, temporary choice.",
		home: main(MAP_DETAIL),
		appliesLive: true,
		source: "src/flight/createFlightSimApp.ts",
		session: true
	},
	{
		id: "osfs.externalTanks.debrisLifetimeSeconds",
		label: "Released tank lifetime",
		description: "How long a jettisoned fuel tank remains visible, in simulated seconds. Zero hides it as soon as it is released.",
		unit: "s",
		kind: "number",
		step: .1,
		bounds: within(0, 120),
		default: 15,
		defaultReason: "Fifteen seconds shows the separation while bounding the time spent updating falling tanks.",
		home: main(EXTERNAL_TANKS),
		appliesLive: true,
		source: "src/flight/aircraft/createExternalTankVisuals.ts"
	},
	{
		id: "osfs.externalTanks.maxDetachedTanks",
		label: "Released tank limit",
		description: "Maximum released fuel tanks kept visible at once. Zero hides released tanks; installed tanks still appear on the aircraft.",
		unit: {
			id: "tanks",
			text: "tanks"
		},
		kind: "number",
		step: 1,
		bounds: within(0, 2),
		default: 2,
		defaultReason: "One released tank per station shows both separations and bounds retained geometry and update work.",
		home: main(EXTERNAL_TANKS),
		appliesLive: true,
		source: "src/flight/aircraft/createExternalTankVisuals.ts"
	},
	{
		id: "osfs.exhaust.enabled",
		label: "Aircraft exhaust",
		description: "Draw hot exhaust and afterburner on aircraft with an exhaust profile. Turning this off releases its rendering resources.",
		unit: "none",
		kind: "boolean",
		default: true,
		defaultReason: "Show the configured engine's visual state alongside its moving nozzle.",
		home: main(EXHAUST),
		appliesLive: true,
		source: "src/flight/aircraft/createEngineExhaust.ts"
	},
	{
		id: "osfs.exhaust.sampleCount",
		label: "Exhaust samples",
		description: "Samples through each visible exhaust pixel. More samples improve the volume's smoothness and use more GPU time.",
		unit: {
			id: "samples/pixel",
			text: "samples/pixel"
		},
		kind: "number",
		step: 1,
		bounds: within(4, 32),
		default: 8,
		defaultReason: "A short bounded lookup loop for a small plume; increase only if visible steps need smoothing.",
		home: main(EXHAUST),
		appliesLive: true,
		source: "src/flight/aircraft/createEngineExhaust.ts"
	},
	{
		id: "osfs.exhaust.maxDistanceMeters",
		label: "Exhaust draw distance",
		description: "Stop drawing exhaust farther than this distance from the viewing camera.",
		unit: "m",
		kind: "number",
		step: 1,
		bounds: within(1, 2e4),
		default: 2e3,
		defaultReason: "Avoid shading a tiny plume at long range while retaining exterior chase and flyby views.",
		home: main(EXHAUST),
		appliesLive: true,
		source: "src/flight/aircraft/createEngineExhaust.ts"
	},
	{
		id: "osfs.exhaust.intensity",
		label: "Exhaust brightness",
		description: "Visual emission gain for the approximate optical profile. This changes neither engine power nor afterburner engagement.",
		unit: "ratio",
		kind: "number",
		step: .01,
		bounds: within(0, 8),
		default: 1,
		defaultReason: "Use the profile's reference display brightness; the F135 profile is not radiometrically calibrated.",
		home: main(EXHAUST),
		appliesLive: true,
		source: "src/flight/aircraft/createEngineExhaust.ts"
	},
	{
		id: "osfs.exhaust.surfaceReferenceNits",
		label: "Nozzle glow white reference",
		description: "Metal luminance mapped to display white. Lower values brighten hot hardware without changing its temperature or the flame. Scene exposure is not physically calibrated.",
		unit: {
			id: "cd/m²",
			text: "cd/m²"
		},
		kind: "number",
		step: 1,
		bounds: within(1, 1e5),
		default: 1e3,
		defaultReason: "A provisional display reference for visible thermal emission; tune to the scene lighting, not engine temperature.",
		home: main(EXHAUST),
		appliesLive: true,
		source: "src/flight/aircraft/createEngineHotSurfaceGlow.ts"
	},
	{
		id: "osfs.exhaust.smoke.enabled",
		label: "Exhaust smoke",
		description: "Draws sparse smoke sprites for engines with a smoke profile; off releases the particle resources.",
		unit: "none",
		kind: "boolean",
		default: true,
		defaultReason: "A faint short trail complements the nozzle glow; appearance is an approximation, not a soot-emissions measurement.",
		home: main(EXHAUST),
		appliesLive: true,
		source: "src/flight/aircraft/createEngineSmoke.ts"
	},
	{
		id: "osfs.exhaust.smoke.maxParticles",
		label: "Smoke particle budget",
		description: "Maximum live smoke sprites per configured engine. This bounds geometry, history memory and particle update work.",
		unit: {
			id: "particles/engine",
			text: "particles/engine"
		},
		kind: "number",
		step: 1,
		bounds: within(0, 512),
		default: 64,
		defaultReason: "A small fixed pool leaves room for short trails without an unbounded particle history.",
		home: main(EXHAUST),
		appliesLive: true,
		source: "src/flight/aircraft/createEngineSmoke.ts"
	},
	{
		id: "osfs.exhaust.smoke.emissionPerSecond",
		label: "Smoke emission",
		description: "Maximum emitted smoke sprites each simulated second per running configured engine.",
		unit: "per-s",
		kind: "number",
		step: .1,
		bounds: within(0, 128),
		default: 8,
		defaultReason: "Sparse emission keeps translucent overlap small at the default short lifetime.",
		home: main(EXHAUST),
		appliesLive: true,
		source: "src/flight/aircraft/createEngineSmoke.ts"
	},
	{
		id: "osfs.exhaust.smoke.lifetimeSeconds",
		label: "Smoke lifetime",
		description: "How long a smoke sprite remains in the world before returning to the fixed pool, in simulated seconds.",
		unit: "s",
		kind: "number",
		step: .1,
		bounds: within(.1, 10),
		default: 2,
		defaultReason: "A short trail limits translucent screen coverage and keeps the main exhaust readable.",
		home: main(EXHAUST),
		appliesLive: true,
		source: "src/flight/aircraft/createEngineSmoke.ts"
	},
	{
		id: "osfs.exhaust.smoke.maxDistanceMeters",
		label: "Smoke draw distance",
		description: "Maximum camera distance at which engine smoke is emitted and drawn, in metres.",
		unit: "m",
		kind: "number",
		step: 1,
		bounds: within(1, 2e4),
		default: 1e3,
		defaultReason: "The sparse default smoke is intended for nearby aircraft views.",
		home: main(EXHAUST),
		appliesLive: true,
		source: "src/flight/aircraft/createEngineSmoke.ts"
	},
	{
		id: "osfs.exhaust.smoke.opacity",
		label: "Smoke opacity",
		description: "Peak per-sprite opacity before the engine profile and lifetime fade. Higher values make overlapping sprites more apparent.",
		unit: "ratio",
		kind: "number",
		step: .001,
		bounds: within(0, 1),
		default: .025,
		defaultReason: "Modern jet exhaust is not a dense rocket smoke trail; this is a restrained visual approximation.",
		home: main(EXHAUST),
		appliesLive: true,
		source: "src/flight/aircraft/createEngineSmoke.ts"
	},
	{
		id: "osfs.renderer.attitudeIndicator",
		label: "Attitude indicator",
		description: "Which API draws the attitude indicator.",
		unit: "none",
		kind: "choice",
		choices: [
			{
				id: "auto",
				label: "Auto",
				description: "The GPU when the globe runs on WebGPU, Canvas 2D otherwise."
			},
			{
				id: "webgpu",
				label: "WebGPU",
				description: "On the globe's GPU device."
			},
			{
				id: "canvas2d",
				label: "Canvas 2D",
				description: "The browser rasterises its lines and text every frame, which costs more."
			}
		],
		default: "auto",
		defaultReason: "Uses the GPU whenever the globe already has a WebGPU device to share.",
		home: main(INSTRUMENTS),
		appliesLive: true,
		source: "src/flight/hud/attitudeRenderer.ts"
	},
	{
		id: "osfs.renderer.engineOrbs",
		label: "Engine shaft indicators",
		description: "The graphics API used for the rotating shaft dots; numeric engine readings remain visible when off.",
		unit: "none",
		kind: "choice",
		choices: [
			{
				id: "auto",
				label: "Auto",
				description: "Shared WebGPU device, then WebGL2, then WebGL1."
			},
			{
				id: "webgpu",
				label: "WebGPU",
				description: "Uses the shared device where available, with WebGL fallback."
			},
			{
				id: "webgl2",
				label: "WebGL2",
				description: "Uses WebGL2, falling back to WebGL1."
			},
			{
				id: "webgl1",
				label: "WebGL1",
				description: "Uses the basic WebGL backend."
			},
			{
				id: "off",
				label: "Off",
				description: "Static engine readings without an orb rendering context."
			}
		],
		default: "auto",
		defaultReason: "Reuses the globe's GPU device when available.",
		home: main(INSTRUMENTS),
		appliesLive: true,
		source: "src/flight/hud/engineSpoolRenderer.ts"
	},
	{
		id: "osfs.camera.orbitPitchLimits",
		label: "Orbit pitch limits",
		description: "How far below and above the aircraft the chase camera may orbit.",
		unit: "deg",
		kind: "range",
		step: 1,
		bounds: within(-89, 89),
		default: {
			min: -60,
			max: 81
		},
		defaultReason: "The original limits, π/3 below and 0.45π above the aircraft's horizontal.",
		home: all(CAMERA),
		appliesLive: true,
		source: "src/flight/createFlightSimApp.ts"
	},
	{
		id: "osfs.camera.orbitReturnTime",
		label: "Orbit return time",
		description: "With Return behind aircraft on release, the time constant of the camera's return to its resting place.",
		unit: "s",
		kind: "number",
		step: .05,
		bounds: within(.05, 5),
		default: .45,
		defaultReason: "The original value: about 95% of the way back in 1.35 s.",
		home: all(CAMERA),
		appliesLive: true,
		source: "src/flight/createFlightSimApp.ts"
	},
	{
		id: "osfs.camera.orbitRestoreYaw",
		label: "Resting orbit heading",
		description: "Where the chase camera returns to, measured from straight behind the aircraft; positive is to the right.",
		unit: "deg",
		kind: "number",
		step: 1,
		bounds: within(-180, 180),
		default: 0,
		defaultReason: "Straight behind, where the chase camera starts.",
		home: all(CAMERA),
		appliesLive: true,
		source: "src/flight/createFlightSimApp.ts"
	},
	{
		id: "osfs.camera.chaseDistance",
		label: "Chase distance",
		description: "How far behind the aircraft the chase camera starts.",
		unit: "m",
		kind: "number",
		step: .5,
		bounds: within(4, 200),
		default: 14,
		defaultReason: "The original chase offset.",
		home: all(CAMERA),
		appliesLive: false,
		source: "src/flight/aircraft/createPlaceholderAircraft.ts"
	},
	{
		id: "osfs.camera.chaseHeight",
		label: "Chase height",
		description: "How far above the aircraft the chase camera starts; with the distance it sets the resting orbit pitch.",
		unit: "m",
		kind: "number",
		step: .1,
		bounds: within(-20, 50),
		default: 2.2,
		defaultReason: "The original chase offset.",
		home: all(CAMERA),
		appliesLive: false,
		source: "src/flight/aircraft/createPlaceholderAircraft.ts"
	},
	{
		id: "osfs.camera.chaseZoomLimits",
		label: "Chase zoom limits",
		description: "How close and how far the chase camera may zoom.",
		unit: "m",
		kind: "range",
		scale: "log2",
		step: .1,
		bounds: within(2, 5e3),
		default: {
			min: 8,
			max: 500
		},
		defaultReason: "The original limits.",
		home: all(CAMERA),
		appliesLive: true,
		source: "src/flight/aircraft/createPlaceholderAircraft.ts"
	},
	{
		id: "osfs.camera.nearClipMeters",
		label: "Camera near clip",
		description: "The closest distance either flight camera draws. A small distance keeps the F-35B cockpit panel visible; larger distances reduce depth precision artifacts in distant scenery.",
		unit: "m",
		kind: "number",
		step: .01,
		bounds: within(.01, 2),
		default: .05,
		defaultReason: "Five centimetres keeps nearby cockpit geometry visible.",
		home: all(CAMERA),
		appliesLive: true,
		source: "src/flight/aircraft/createPlaceholderAircraft.ts"
	},
	{
		id: "osfs.camera.fieldOfView",
		label: "Field of view",
		description: "The vertical field of view of the cockpit and chase cameras; wider shows and loads more.",
		unit: "deg",
		kind: "number",
		step: 1,
		bounds: within(20, 120),
		default: 1.05 * 180 / Math.PI,
		defaultReason: "1.05 rad, the original field of view of both flight cameras.",
		home: all(CAMERA),
		appliesLive: true,
		source: "src/flight/aircraft/createPlaceholderAircraft.ts"
	},
	{
		id: "osfs.camera.gamepadOrbitYawRate",
		label: "Gamepad orbit yaw rate",
		description: "How fast a fully deflected camera stick turns the chase camera around the aircraft.",
		unit: "deg/s",
		kind: "number",
		step: 1,
		bounds: within(10, 720),
		default: 1.5 * 180 / Math.PI,
		defaultReason: "The original 1.5 rad/s: a full turn in about four seconds.",
		home: all(CAMERA),
		appliesLive: true,
		source: "src/flight/createFlightSimApp.ts"
	},
	{
		id: "osfs.camera.gamepadOrbitPitchRate",
		label: "Gamepad orbit pitch rate",
		description: "How fast a fully deflected camera stick moves the chase camera above or below the aircraft.",
		unit: "deg/s",
		kind: "number",
		step: 1,
		bounds: within(10, 720),
		default: 1.15 * 180 / Math.PI,
		defaultReason: "The original 1.15 rad/s.",
		home: all(CAMERA),
		appliesLive: true,
		source: "src/flight/createFlightSimApp.ts"
	},
	{
		id: "osfs.camera.chaseFrame",
		label: "Chase camera turns with",
		description: "Which of the aircraft's rotations every chase view follows.",
		unit: "none",
		kind: "choice",
		choices: [
			{
				id: "attitude",
				label: "Roll, pitch and heading"
			},
			{
				id: "no-roll",
				label: "Pitch and heading",
				description: "Wings level."
			},
			{
				id: "heading",
				label: "Heading only",
				description: "Horizon level."
			}
		],
		default: "attitude",
		defaultReason: "The original chase camera, which rides on the aircraft.",
		home: main(CAMERA),
		appliesLive: true,
		source: "src/flight/createFlightSimApp.ts"
	},
	{
		id: "osfs.camera.phone.send",
		label: "Phone sends",
		description: "When the phone sends a control frame. A phone that loaded before this setting existed needs a fresh QR.",
		unit: "none",
		kind: "choice",
		choices: [{
			id: "timer",
			label: "On each touch, and a 60 Hz timer",
			description: "At most 120 a second; the original."
		}, {
			id: "batch",
			label: "Once per touch frame",
			description: "About 10–17 ms sooner, and steadier."
		}],
		default: "timer",
		defaultReason: "The original behaviour, so nothing changes until a pilot compares.",
		home: main(PHONE_CAMERA),
		appliesLive: true,
		source: "src/flight/remote/createPhoneControlSession.ts"
	},
	{
		id: "osfs.camera.phone.source",
		label: "Lost or late frames",
		description: "Whether a lost frame's movement is lost, or recovered from the gesture's running total.",
		unit: "none",
		kind: "choice",
		choices: [{
			id: "delta",
			label: "Lose their movement",
			description: "The original."
		}, {
			id: "total",
			label: "Recover it from the running total",
			description: "No delay."
		}],
		default: "delta",
		defaultReason: "The original behaviour, so nothing changes until a pilot compares.",
		home: main(PHONE_CAMERA),
		appliesLive: true,
		source: "src/flight/remote/phoneCameraPlayout.ts"
	},
	{
		id: "osfs.camera.phone.present",
		label: "Draw movement",
		description: "Whether arrived movement is drawn at once, or paced on the phone's own timeline.",
		unit: "none",
		kind: "choice",
		choices: [{
			id: "arrival",
			label: "As soon as it arrives",
			description: "The original."
		}, {
			id: "playout",
			label: "Paced on the phone's timeline",
			description: "Adds the playout buffer, and smooths stalls."
		}],
		default: "arrival",
		defaultReason: "The original behaviour, so nothing changes until a pilot compares.",
		home: main(PHONE_CAMERA),
		appliesLive: true,
		source: "src/flight/remote/phoneCameraPlayout.ts"
	},
	{
		id: "osfs.camera.phone.bufferMs",
		label: "Playout buffer",
		description: "With paced drawing, how far behind the fastest delivery seen movement is drawn; 0 only smooths stalls.",
		unit: "ms",
		kind: "number",
		step: 1,
		bounds: within(0, 100),
		default: 12,
		defaultReason: "The measured recommendation; 16 ms is smooth on a 120 Hz display.",
		home: main(PHONE_CAMERA),
		appliesLive: true,
		source: "src/flight/remote/phoneCameraPlayout.ts"
	},
	{
		id: "osfs.camera.phone.catchUp",
		label: "Catch-up speed",
		description: "With paced drawing, the fastest a backlog is drawn after a stall, as a multiple of real speed.",
		unit: "ratio",
		kind: "number",
		step: .1,
		bounds: within(1, 8),
		named: [{
			id: "jump",
			label: "Jump",
			description: "Draw the whole backlog at once, as arrival does."
		}],
		default: 2,
		defaultReason: "The measured recommendation.",
		home: main(PHONE_CAMERA),
		appliesLive: true,
		source: "src/flight/remote/phoneCameraPlayout.ts"
	},
	{
		id: "osfs.camera.phone.predictMs",
		label: "Predict ahead",
		description: "With paced drawing, how far past the newest touch to extrapolate; it overshoots when the finger stops.",
		unit: "ms",
		kind: "number",
		step: 1,
		bounds: within(0, 50),
		default: 0,
		defaultReason: "Off: prediction guesses, and overshoots when the finger stops.",
		home: main(PHONE_CAMERA),
		appliesLive: true,
		source: "src/flight/remote/phoneCameraPlayout.ts"
	},
	{
		id: "osfs.start.latitude",
		label: "Start latitude",
		description: "Where a new flight starts, north of the equator.",
		unit: "deg",
		kind: "number",
		step: 1e-4,
		bounds: within(-90, 90),
		default: 44.977753,
		defaultReason: "Minneapolis, the original start.",
		home: all(START),
		appliesLive: false,
		source: "src/flight/jsbsim/bootstrapC172.ts"
	},
	{
		id: "osfs.start.longitude",
		label: "Start longitude",
		description: "Where a new flight starts, east of Greenwich.",
		unit: "deg",
		kind: "number",
		step: 1e-4,
		bounds: within(-180, 180),
		default: -93.265011,
		defaultReason: "Minneapolis, the original start.",
		home: all(START),
		appliesLive: false,
		source: "src/flight/jsbsim/bootstrapC172.ts"
	},
	{
		id: "osfs.start.heightAboveGround",
		label: "Start height",
		description: "How far above the loaded ground a new flight starts.",
		unit: "m",
		kind: "number",
		step: 10,
		bounds: within(0, 15e3),
		default: 1524,
		defaultReason: "5,000 ft, the original start height.",
		home: all(START),
		appliesLive: false,
		source: "src/flight/jsbsim/bootstrapC172.ts"
	},
	{
		id: "osfs.start.heading",
		label: "Start heading",
		description: "The true heading a new flight starts on.",
		unit: "deg",
		kind: "number",
		step: 1,
		bounds: within(0, 360),
		default: 300,
		defaultReason: "The original start heading.",
		home: all(START),
		appliesLive: false,
		source: "src/flight/jsbsim/bootstrapC172.ts"
	},
	{
		id: "osfs.start.airspeed",
		label: "Start airspeed",
		description: "The calibrated airspeed a new flight starts at.",
		unit: KNOTS,
		kind: "number",
		step: 1,
		bounds: within(0, 400),
		default: 120,
		defaultReason: "The original start airspeed.",
		home: all(START),
		appliesLive: false,
		source: "src/flight/jsbsim/bootstrapC172.ts"
	},
	{
		id: "osfs.start.throttle",
		label: "Start throttle",
		description: "The throttle a new flight starts with.",
		unit: "fraction",
		kind: "number",
		step: .01,
		bounds: within(0, 1),
		default: .65,
		defaultReason: "The Cessna 172 profile's start throttle; each aircraft sets its own when it loads (the SF50's is 0.35).",
		home: all(START),
		appliesLive: false,
		source: "src/flight/jsbsim/bootstrapC172.ts"
	},
	{
		id: "osfs.start.resume",
		label: "Resume last flight",
		description: "A new session carries on from the last saved flight: its place, attitude, speed, controls, fuel and pause. Off, or when the page address gives a start position, flights start at the start position.",
		unit: "none",
		kind: "boolean",
		default: true,
		defaultReason: "Reloading the page or changing aircraft should not undo the flight in progress.",
		home: main(START),
		appliesLive: false,
		source: "src/flight/jsbsim/savedFlight.ts"
	},
	{
		id: "osfs.start.saveInterval",
		label: "Save the flight every",
		description: "How often the flight in progress is saved for the next session while it runs. Pausing, and leaving or hiding the page, save it too.",
		unit: "s",
		kind: "number",
		step: 1,
		bounds: within(1, 600),
		default: 5,
		defaultReason: "A browser that crashes loses at most 5 s of flight, for one write of about 2 KB to browser storage each time.",
		home: all(START),
		appliesLive: true,
		source: "src/flight/createFlightSimApp.ts"
	},
	{
		id: "osfs.assist.autoFlaps",
		label: "Auto flaps",
		description: "Uses the aircraft's automatic flap controls, or a speed-based pilot assist where none is fitted. Moving a flap control takes over manually.",
		unit: "none",
		kind: "boolean",
		default: true,
		defaultReason: "Automatic flaps on every aircraft by default; the HUD Auto button edits this same setting.",
		home: main(ASSISTS),
		appliesLive: true,
		source: "src/flight/input/autoFlaps.ts"
	},
	{
		id: "osfs.assist.autoTrim",
		label: "Auto pitch trim",
		description: "Moves pitch trim to cancel the elevator force the pilot is holding.",
		unit: "none",
		kind: "boolean",
		default: true,
		defaultReason: "On, as it has been since the assist was added.",
		home: main(ASSISTS),
		appliesLive: true,
		source: "src/flight/input/autoTrim.ts"
	},
	{
		id: "osfs.assist.autoRollTrim",
		label: "Auto roll trim",
		description: "Moves roll trim to cancel the aileron force the pilot is holding.",
		unit: "none",
		kind: "boolean",
		default: true,
		defaultReason: "On, as it has been since the assist was added.",
		home: main(ASSISTS),
		appliesLive: true,
		source: "src/flight/input/autoTrim.ts"
	},
	{
		id: "osfs.assist.trimMaxRate",
		label: "Trim rate",
		description: "The fastest the auto trim moves, in full trim travel per second.",
		unit: "per-s",
		kind: "number",
		step: .01,
		bounds: within(.01, 2),
		default: .35,
		defaultReason: "The original value: full-scale trim travel in about three seconds.",
		home: all(ASSISTS),
		appliesLive: true,
		source: "src/flight/input/autoTrim.ts"
	},
	{
		id: "osfs.assist.trimDeadband",
		label: "Trim deadband",
		description: "The auto trim leaves a leftover angular acceleration smaller than this alone.",
		unit: RADIANS_PER_SECOND_SQUARED,
		kind: "number",
		step: .005,
		bounds: within(0, .5),
		default: .04,
		defaultReason: "The original value.",
		home: all(ASSISTS),
		appliesLive: true,
		source: "src/flight/input/autoTrim.ts"
	},
	{
		id: "osfs.assist.trimFilter",
		label: "Trim filter",
		description: "The time constant that smooths the leftover acceleration the auto trim cancels.",
		unit: "s",
		kind: "number",
		step: .01,
		bounds: within(.01, 2),
		default: .08,
		defaultReason: "The original value.",
		home: all(ASSISTS),
		appliesLive: true,
		source: "src/flight/input/autoTrim.ts"
	},
	{
		id: "osfs.assist.trimGain",
		label: "Trim gain",
		description: "The fraction of the leftover angular acceleration the auto trim cancels per second, before the rate limit.",
		unit: "per-s",
		kind: "number",
		step: .05,
		bounds: within(.05, 10),
		default: 1.25,
		defaultReason: "The original value.",
		home: all(ASSISTS),
		appliesLive: true,
		source: "src/flight/input/autoTrim.ts"
	},
	{
		id: "osfs.assist.trimAuthority",
		label: "Trim authority",
		description: "The dynamic pressure at which the auto trim reaches full authority; below it, its corrections shrink in proportion.",
		unit: PSF,
		kind: "number",
		step: 1,
		bounds: within(1, 200),
		default: 20,
		defaultReason: "The original value, about 77 kt at sea level.",
		home: all(ASSISTS),
		appliesLive: true,
		source: "src/flight/input/autoTrim.ts"
	},
	{
		id: "osfs.assist.trimMinAirspeed",
		label: "Trim damping airspeed floor",
		description: "The lowest true airspeed the auto trim assumes when it estimates aerodynamic damping, so the estimate stays bounded at low speed.",
		unit: FEET_PER_SECOND,
		kind: "number",
		step: 1,
		bounds: within(0, 400),
		default: 80,
		defaultReason: "The original value, about 47 kt.",
		home: all(ASSISTS),
		appliesLive: true,
		source: "src/flight/input/autoTrim.ts"
	},
	{
		id: "osfs.autopilot.backend",
		label: "Autopilot backend",
		description: "Which autopilot flies the automated axes: the one built in, or ArduPilot when it is connected.",
		unit: "none",
		kind: "choice",
		choices: [{
			id: "ours",
			label: "Built in"
		}, {
			id: "ardupilot",
			label: "ArduPilot"
		}],
		default: "ours",
		defaultReason: "The built-in autopilot needs nothing else running.",
		home: main(AUTOPILOT),
		appliesLive: true,
		source: "src/flight/autopilot/controlArbiter.ts"
	},
	autopilotAxis("roll", "Roll", "Stabilizes bank with the ailerons."),
	autopilotAxis("pitch", "Pitch", "Holds pitch attitude with the elevator."),
	autopilotAxis("yaw", "Yaw / rudder", "Yaw damper and heading hold with the rudder."),
	autopilotAxis("throttle", "Throttle", "Auto-throttle using the throttle behaviour."),
	autopilotAxis("gear", "Landing gear", "Holds the gear lever while the autopilot is engaged."),
	autopilotAxis("flaps", "Flaps", "Holds flap position while the autopilot is engaged."),
	{
		id: "osfs.autopilot.throttleMode",
		label: "Throttle behaviour",
		description: "Airspeed holds the speed at engagement with the throttle; Hold keeps the lever where it was.",
		unit: "none",
		kind: "choice",
		choices: [{
			id: "airspeed",
			label: "Hold airspeed"
		}, {
			id: "hold",
			label: "Hold lever"
		}],
		default: "airspeed",
		defaultReason: "The original behaviour.",
		home: main(AUTOPILOT),
		appliesLive: true,
		source: "src/flight/autopilot/ourAutopilot.ts"
	},
	{
		id: "osfs.autopilot.stickOverride",
		label: "Stick override",
		description: "The autopilot yields roll, pitch or yaw while the pilot deflects that control further than this, and recaptures the attitude on release.",
		unit: "fraction",
		kind: "number",
		step: .01,
		bounds: within(.01, .5),
		default: .05,
		defaultReason: "The original value.",
		home: all(AUTOPILOT),
		appliesLive: true,
		source: "src/flight/autopilot/ourAutopilot.ts"
	},
	{
		id: "osfs.ground.arcadeLaunches",
		label: "Arcade ground launches",
		description: "Exaggerated bounces: with this off, deep ground impacts stop the flight before the gear springs can launch it.",
		unit: "none",
		kind: "boolean",
		default: false,
		defaultReason: "Off, as before: a deep impact ends the flight.",
		home: main(GROUND),
		appliesLive: true,
		source: "src/flight/physics/fixedStepLoop.ts"
	},
	{
		id: "osfs.sound.enabled",
		label: "Sound",
		description: "The master switch: off releases the sound engine and silences the engine and tyres.",
		unit: "none",
		kind: "boolean",
		default: false,
		defaultReason: "Off: a saved preference cannot satisfy the browser's autoplay rule, so sound starts from a gesture.",
		home: main(SOUND),
		appliesLive: true,
		source: "src/flight/audio/createFlightAudio.ts"
	},
	{
		id: "osfs.sound.quality",
		label: "Sound tier",
		description: "Which synthesis engine runs; Auto starts at Low and moves up only to a tier qualified on this device.",
		unit: "none",
		kind: "choice",
		choices: [
			{
				id: "off",
				label: "Off"
			},
			{
				id: "low",
				label: "Low",
				description: "Procedural, light."
			},
			{
				id: "med",
				label: "Med",
				description: "Procedural, with a cabin impulse response."
			},
			{
				id: "high",
				label: "High",
				description: "Procedural engine spectra and directionality; acoustic calibration pending."
			},
			{
				id: "auto",
				label: "Auto"
			}
		],
		default: "med",
		defaultReason: "Med, for now: the owner flew with it and chose it. No tier is qualified on a device yet, so Auto still stays at Low.",
		home: main(SOUND),
		appliesLive: true,
		source: "src/flight/audio/audioQuality.ts"
	},
	soundVolume("masterVolume", "Master volume", "Scales the flight sound mix up to eight times the previous master maximum, before output limiting.", 2, "Twice the previous master maximum, chosen by the pilot after testing all volume sliders at maximum.", 8),
	soundVolume("engineVolume", "Engine volume", "Scales the engine and its afterburner sound, independently of the airframe, up to eight times its original level.", .8, "The original level is preserved; extra headroom is available for a quiet engine.", 8),
	soundVolume("afterburnerVolume", "Afterburner volume", "Scales the extra afterburner roar; one keeps its original level. Native afterburner spectrum and thrust response remain.", .5, "Half the previous added afterburner contribution after pilot feedback that it was too loud."),
	soundVolume("airframeVolume", "Airframe volume", "Scales wind and gear and flap turbulence, independently of the engine.", .6),
	{
		id: "osfs.sound.listenerCockpitBlend",
		label: "Sound position",
		description: "Blends the acoustic viewpoint from Camera (0) to Cockpit (1), including listener position, motion and cabin/exterior treatment. Intermediate viewpoints are artistic.",
		unit: "fraction",
		kind: "number",
		step: .01,
		bounds: within(0, 1),
		default: 1,
		defaultReason: "Cockpit sound stays at the pilot even when the visual camera moves outside the aircraft.",
		home: main(SOUND),
		appliesLive: true,
		source: "src/flight/audio/audioPose.ts"
	},
	{
		id: "osfs.sound.engineMuted",
		label: "Mute engine",
		description: "Silences the engine and keeps the airframe and tyres.",
		unit: "none",
		kind: "boolean",
		default: false,
		defaultReason: "The engine is heard.",
		home: main(SOUND),
		appliesLive: true,
		source: "src/flight/audio/createFlightAudio.ts"
	},
	{
		id: "osfs.sound.reducedDynamicRange",
		label: "Reduced dynamic range",
		description: "Narrows the difference between loud and quiet sounds.",
		unit: "none",
		kind: "boolean",
		default: false,
		defaultReason: "The full range the synthesis produces.",
		home: main(SOUND),
		appliesLive: true,
		source: "src/flight/audio/createFlightAudio.ts"
	},
	{
		id: "osfs.sound.downgradedFrom",
		label: "Downgraded from",
		description: "Set when a fallback dropped the tier, recording what was asked for; cleared only by Re-test.",
		unit: "none",
		kind: "choice",
		choices: [
			{
				id: "none",
				label: "Not downgraded"
			},
			{
				id: "off",
				label: "Off"
			},
			{
				id: "low",
				label: "Low"
			},
			{
				id: "med",
				label: "Med"
			},
			{
				id: "high",
				label: "High"
			},
			{
				id: "auto",
				label: "Auto"
			}
		],
		default: "none",
		defaultReason: "Nothing has been dropped yet.",
		home: all(SOUND),
		appliesLive: true,
		source: "src/flight/audio/createFlightAudio.ts"
	},
	soundLimit("low", "partials", "Low: engine oscillators", "How many engine partials Low synthesises; the N1 and N2 fundamentals come first.", "count", 2, 4, 1),
	soundLimit("low", "noiseBands", "Low: noise sources", "How many engine and airframe noise bands Low synthesises, excluding the separate tire source.", "count", 0, 5, 1),
	soundLimit("med", "partials", "Med: engine oscillators", "How many engine partials Med synthesises; the N1 and N2 fundamentals come first.", "count", 2, 12, 1),
	soundLimit("med", "noiseBands", "Med: noise sources", "How many engine and airframe noise bands Med synthesises, excluding the separate tire source.", "count", 0, 6, 1),
	soundLimit("med", "irMs", "Med: cabin impulse response", "The length of the cabin and airframe colouring Med convolves with.", "ms", 0, 20, 1),
	soundLimit("high", "partials", "High: engine oscillators", "How many engine partials High synthesises; the N1 and N2 fundamentals come first.", "count", 2, 12, 1),
	soundLimit("high", "noiseBands", "High: noise sources", "How many engine and airframe noise bands High synthesises, excluding the separate tire source.", "count", 0, 8, 1),
	soundLimit("high", "irMs", "High: cabin impulse response", "The length of the cabin and airframe colouring High convolves with.", "ms", 0, 40, 1),
	{
		id: "osfs.engineMonitor.fuelFlowUnit",
		label: "Fuel flow unit",
		description: "The unit the HUD engine line and the Engine tab show fuel flow in; clicking the HUD's fuel flow switches it.",
		unit: "none",
		kind: "choice",
		choices: [{
			id: "lb/h",
			label: "lb/h",
			description: "Pounds per hour."
		}, {
			id: "gal/h",
			label: "gal/h",
			description: "US gallons per hour."
		}],
		default: "lb/h",
		defaultReason: "The original unit.",
		home: main(ENGINE),
		appliesLive: true,
		source: "src/flight/hud/engineMonitor.ts"
	},
	{
		id: "osfs.engineMonitor.orbFps",
		label: "Shaft animation FPS ceiling",
		description: "Shaft dots follow this screen's animation frames up to this ceiling, independently of globe drawing and numeric readouts. Zero disables their renderer. Hidden, paused and unchanged indicators do not draw.",
		unit: {
			id: "frames/s",
			text: "frames/s"
		},
		kind: "number",
		step: 1,
		bounds: within(0, 1e3),
		default: 1e3,
		defaultReason: "A high ceiling lets the browser use the screen's refresh cadence, including 60, 120, 144 and 240 Hz. It does not request 1000 frames/s from the browser; lower it to spend less GPU work.",
		home: main(ENGINE),
		appliesLive: true,
		source: "src/flight/hud/engineSpoolRenderer.ts"
	},
	{
		id: "osfs.engineMonitor.orbTurnsPerSecond",
		label: "Maximum displayed shaft speed",
		description: "Requested upper limit in visual revolutions per simulated second at maximum modeled speed. Both shafts share a scale limited by this client's actual drawing cadence and the hotspot pattern step limit; the Engine tab shows the effective speed and reason. This is a scaled speed cue, not real turbine RPM.",
		unit: {
			id: "rev/s",
			text: "rev/s"
		},
		kind: "number",
		step: .05,
		bounds: within(0, 4),
		default: 2,
		defaultReason: "A two-revolution ceiling makes high engine speed visibly fast; the pattern step limit protects the two rotating hotspots when the client draws too slowly to show that speed.",
		home: main(ENGINE),
		appliesLive: true,
		source: "src/flight/hud/engineSpoolMotion.ts"
	},
	{
		id: "osfs.engineMonitor.orbMaxPatternStep",
		label: "Maximum hotspot pattern step per frame",
		description: "Maximum advance of the two-hotspot pattern per actual drawn frame, in pattern pitches. One pitch is half a revolution. Both shafts share the resulting speed scale. Staying below half a pitch preserves the hotspot cue's forward direction between submitted frames; individual blades may still alias. The Engine tab shows the effective limit.",
		unit: {
			id: "pattern pitches/frame",
			text: "pattern pitches/frame"
		},
		kind: "number",
		step: .01,
		bounds: within(.05, .49),
		default: DEFAULT_MAX_PATTERN_STEP,
		defaultReason: "A 0.45-pitch limit uses most of the available hotspot motion range while leaving a margin below the ambiguous half-pitch boundary.",
		home: main(ENGINE),
		appliesLive: true,
		source: "src/flight/hud/engineSpoolMotion.ts"
	},
	{
		id: "osfs.engineMonitor.orbPixelRatio",
		label: "Shaft indicator resolution",
		description: "Maximum drawing pixels per CSS pixel for the shaft dots, capped by the display's pixel density. More pixels increase GPU work and memory.",
		unit: {
			id: "px/CSSpx",
			text: "px/CSSpx"
		},
		kind: "number",
		step: .1,
		bounds: within(1, 3),
		default: 2,
		defaultReason: "A two-times density cap keeps the small dots clear with a small drawing surface.",
		home: main(ENGINE),
		appliesLive: true,
		source: "src/flight/hud/engineSpoolRenderer.ts"
	},
	{
		id: "osfs.ground.selection",
		label: "Ground interaction selection",
		description: "Auto substitutes a cheaper implemented choice when a request cannot run, never during a landing; Manual leaves it inactive.",
		unit: "none",
		kind: "choice",
		choices: [{
			id: "auto",
			label: "Auto within my choices"
		}, {
			id: "manual",
			label: "Manual"
		}],
		default: DEFAULT_GROUND_INTERACTION_SETTINGS.selection,
		defaultReason: "Nothing runs that the pilot did not choose.",
		home: all(GROUND),
		appliesLive: true,
		source: "src/flight/settings/groundInteractionSettings.ts"
	},
	groundChoice("rotation", "How the wheels spin up and roll; applies when paused or reset."),
	groundChoice("forceModel", "Which model computes the forces between wheels and ground; applies when paused or reset."),
	groundChoice("contactModel", "Where each wheel meets the ground; applies when paused or reset."),
	groundChoice("backend", "Where ground interaction is computed; applies when paused or reset."),
	groundChoice("tireAudio", "Which tyre sounds play."),
	groundChoice("haptics", "Which ground events vibrate a gamepad or phone."),
	groundChoice("wheelVisuals", "Whether the aircraft's wheel meshes turn."),
	groundLevel("tireAudioVolume", "Tire audio volume", "Scales the tyre sounds.", DEFAULT_GROUND_INTERACTION_SETTINGS.tireAudioVolume),
	groundLevel("hapticStrength", "Haptic strength", "Scales every ground vibration.", DEFAULT_GROUND_INTERACTION_SETTINGS.hapticStrength),
	...GROUND_LOCKABLE_KEYS.map(groundLock),
	{
		id: "osfs.aircraft.stovlConversion",
		label: "STOVL conversion",
		description: "F-35B only: 0% is conventional flight; 100% opens the lift fan and turns the rear nozzle downward. Conversion takes time. Throttle controls lift; the stick and rudder control attitude. Experimental flight model.",
		unit: "fraction",
		kind: "number",
		step: .01,
		bounds: within(0, 1),
		default: 0,
		defaultReason: "Start in conventional flight with the lift fan closed.",
		home: all(STOVL),
		appliesLive: true,
		source: "src/flight/input/applyFlightControls.ts"
	},
	{
		id: "osfs.aircraft.controlLaw",
		label: "Aircraft control law",
		description: "Auto uses the aircraft's default law. Manual sends stick, rudder and trim through the actuators without aircraft stabilization. Fly-by-wire enables the aircraft's native stabilization. Available on the F-35B; autopilot and input assists have their own settings.",
		unit: "none",
		kind: "choice",
		choices: [
			{
				id: "auto",
				label: "Auto"
			},
			{
				id: "manual",
				label: "Manual"
			},
			{
				id: "fly-by-wire",
				label: "Fly-by-wire"
			}
		],
		default: "auto",
		defaultReason: "Use each aircraft's standard control law; the F-35B defaults to fly-by-wire.",
		home: main(FLIGHT_CONTROLS),
		appliesLive: true,
		source: "src/flight/input/applyFlightControls.ts"
	},
	{
		id: "osfs.input.gamepadPollingRate",
		label: "Gamepad polling rate",
		description: "How often the application reads the controller, not the controller's own report rate.",
		unit: "Hz",
		kind: "number",
		step: 1,
		bounds: within(10, 240),
		named: [{
			id: "frame",
			label: "Every frame",
			description: "Reads input before each flight frame, with no timer cap."
		}],
		default: "frame",
		defaultReason: "A fixed rate below the frame rate can introduce visible stepping; the browser's frame rate stays the upper limit.",
		home: main(GAMEPAD),
		appliesLive: true,
		source: "src/flight/input/gamepadPolling.ts"
	},
	{
		id: "osfs.input.gamepadResponse",
		label: "Analog response",
		description: "Smooth eases pitch, roll and yaw toward each report every flight frame; Direct holds each report unchanged.",
		unit: "none",
		kind: "choice",
		choices: [{
			id: "smooth",
			label: "Smooth"
		}, {
			id: "direct",
			label: "Direct"
		}],
		default: "smooth",
		defaultReason: "The original behaviour.",
		home: main(GAMEPAD),
		appliesLive: true,
		source: "src/flight/input/flightInputManager.ts"
	},
	{
		id: "osfs.input.gamepadResponseTime",
		label: "Response time",
		description: "With Smooth, the time to approach 95% of a held stick command.",
		unit: "s",
		kind: "number",
		step: .025,
		bounds: within(.05, 2),
		default: .375,
		defaultReason: "The original filter, min(1, 8·dt) per frame.",
		home: main(GAMEPAD),
		appliesLive: true,
		source: "src/flight/input/flightInputManager.ts"
	},
	{
		id: "osfs.input.gamepadDeadzoneMode",
		label: "Stick deadzone behaviour",
		description: "Cutoff ignores the centre zone and keeps the stick's magnitude outside it; Rescaled subtracts the zone from the remaining travel.",
		unit: "none",
		kind: "choice",
		choices: [{
			id: "cutoff",
			label: "Cutoff"
		}, {
			id: "scaled",
			label: "Rescaled"
		}],
		default: "cutoff",
		defaultReason: "The original behaviour.",
		home: main(GAMEPAD),
		appliesLive: true,
		source: "src/flight/input/flightInputManager.ts"
	},
	{
		id: "osfs.input.stickDeadzone",
		label: "Stick deadzone",
		description: "Stick deflection below this is read as centred: built into a controller profile when it is created, and used by bindings without their own.",
		unit: "fraction",
		kind: "number",
		step: .01,
		bounds: within(0, .5),
		default: .08,
		defaultReason: "The original deadzone of the Xbox and Classic profiles.",
		home: all(GAMEPAD),
		appliesLive: false,
		source: "src/flight/input/gamepadToolsAdapter.ts"
	},
	{
		id: "osfs.input.gamepadSmoothing",
		label: "Controller smoothing rate",
		description: "On the input path without controller bindings, the fraction of the remaining distance the stick and throttle close per second.",
		unit: "per-s",
		kind: "number",
		step: .5,
		bounds: within(.5, 60),
		default: 8,
		defaultReason: "The original filter, min(1, 8·dt) per frame: about 95% of a held command in 0.375 s.",
		home: all(GAMEPAD),
		appliesLive: true,
		source: "src/flight/input/flightInputManager.ts"
	},
	{
		id: "osfs.input.takeoverDeadband",
		label: "Takeover deadband",
		description: "How far a control must move from where it rested before it takes over from another input.",
		unit: "fraction",
		kind: "number",
		step: .01,
		bounds: within(.01, .5),
		default: .12,
		defaultReason: "The original value.",
		home: all(GAMEPAD),
		appliesLive: true,
		source: "src/flight/input/flightInputManager.ts"
	},
	{
		id: "osfs.input.throttleRate",
		label: "Throttle rate",
		description: "How fast held throttle keys and buttons move the throttle, in full travel per second.",
		unit: "per-s",
		kind: "number",
		step: .05,
		bounds: within(.05, 5),
		default: .5,
		defaultReason: "The original value: idle to full in two seconds.",
		home: all(GAMEPAD),
		appliesLive: true,
		source: "src/flight/input/flightInputManager.ts"
	},
	{
		id: "osfs.input.keyboard.mode",
		label: "Response mode",
		description: "How held keys move the simulated stick.",
		unit: "none",
		kind: "choice",
		choices: [
			{
				id: "direct",
				label: "Direct",
				description: "Keys snap the stick to full deflection immediately."
			},
			{
				id: "smooth",
				label: "Smooth target",
				description: "Keys set a target; the stick eases toward it exponentially."
			},
			{
				id: "rate",
				label: "Rate ramp",
				description: "Keys move the stick at a tunable rate that can accelerate with hold time."
			},
			{
				id: "assist",
				label: "Flight assist",
				description: "Keys command pitch, roll and yaw rates; a PID drives the stick to match them."
			}
		],
		default: "smooth",
		defaultReason: "Reproduces the original exponential filter.",
		home: main(KEYBOARD),
		appliesLive: true,
		source: KEYBOARD_STICK_SOURCE
	},
	keyboardNumber("expo", "Expo", "Softens small keyboard deflections while keeping full range; 0 is linear.", "fraction", 0, 1, .05, 0, "The original, linear response."),
	keyboardNumber("smoothResponseSec", "Smooth response time", "Smooth: the time to reach about 95% of a held deflection.", "s", .05, 3, .025, .375, "The original filter, min(1, 8·dt) per frame."),
	keyboardNumber("smoothReturnSec", "Smooth return time", "Smooth: the time to centre after release.", "s", .05, 3, .025, .375, "The original filter, min(1, 8·dt) per frame."),
	keyboardNumber("rateTimeToFull", "Rate time to full", "Rate: seconds from centre to full deflection at the base hold rate.", "s", .1, 5, .05, .6, "The original value."),
	keyboardNumber("rateTimeToCenter", "Rate time to centre", "Rate: seconds from full deflection back to centre after release.", "s", .05, 3, .05, .25, "The original value."),
	keyboardNumber("rateAccelAfterSec", "Rate acceleration after", "Rate: how long a key is held before the ramp speeds up.", "s", 0, 3, .05, .35, "The original value."),
	keyboardNumber("rateAccelMultiplier", "Rate acceleration", "Rate: the peak ramp speed after a long hold, as a multiple of the base rate.", "ratio", 1, 8, .1, 2.5, "The original value."),
	keyboardNumber("rateMaxDeflection", "Rate maximum deflection", "Rate: the largest deflection the keyboard may reach.", "fraction", .1, 1, .05, 1, "The original value: full authority."),
	keyboardNumber("assistRollRateDeg", "Assist roll rate", "Assist: the roll rate a held aileron key commands.", "deg/s", 5, 180, 1, 45, "The original value."),
	keyboardNumber("assistPitchRateDeg", "Assist pitch rate", "Assist: the pitch rate a held elevator key commands.", "deg/s", 5, 90, 1, 20, "The original value."),
	keyboardNumber("assistYawRateDeg", "Assist yaw rate", "Assist: the yaw rate a held rudder key commands.", "deg/s", 5, 90, 1, 20, "The original value."),
	keyboardNumber("assistKp", "Assist proportional gain", "Assist: stick deflection per unit of rate error.", "ratio", 0, 5, .05, .8, "The original value."),
	keyboardNumber("assistKi", "Assist integral gain", "Assist: how fast a lasting rate error builds deflection.", "ratio", 0, 2, .01, .15, "The original value."),
	keyboardNumber("assistKd", "Assist derivative gain", "Assist: damping on how fast the rate error changes.", "ratio", 0, 1, .005, .02, "The original value."),
	keyboardNumber("assistMaxDeflection", "Assist maximum deflection", "Assist: the largest deflection the assist may command.", "fraction", .1, 1, .05, 1, "The original value: full authority."),
	{
		id: "osfs.input.touchWheelCooldown",
		label: "Touch wheel cooldown",
		description: "After a touch gesture ends, wheel pans are ignored for this long, so the browser's late synthetic ones do not orbit the camera.",
		unit: "ms",
		kind: "number",
		step: 10,
		bounds: within(0, 1e3),
		default: 180,
		defaultReason: "The original value, chosen to outlast the late wheel pans a browser synthesises after a touch ends.",
		home: all(ORBIT),
		appliesLive: true,
		source: "src/flight/input/flightCameraInput.ts"
	},
	{
		id: "osfs.feedback.hapticInterval",
		label: "Haptic interval",
		description: "Wheel contact is summarised into one vibration this often.",
		unit: "ms",
		kind: "number",
		step: 5,
		bounds: within(10, 500),
		default: 50,
		defaultReason: "The original value: one envelope per 50 ms window, never queued.",
		home: all(FEEDBACK),
		appliesLive: true,
		source: "src/flight/feedback/haptics.ts"
	},
	{
		id: "osfs.feedback.hapticMaxDuration",
		label: "Haptic maximum duration",
		description: "The longest one vibration may last.",
		unit: "ms",
		kind: "number",
		step: 5,
		bounds: within(10, 1e3),
		default: 60,
		defaultReason: "The original value, a little longer than the interval so pulses join.",
		home: all(FEEDBACK),
		appliesLive: true,
		source: "src/flight/feedback/haptics.ts"
	},
	{
		id: "osfs.feedback.minMagnitude",
		label: "Haptic threshold",
		description: "Weaker vibrations than this are not sent.",
		unit: "fraction",
		kind: "number",
		step: .01,
		bounds: within(0, .5),
		default: .03,
		defaultReason: "The original value.",
		home: all(FEEDBACK),
		appliesLive: true,
		source: "src/flight/feedback/haptics.ts"
	},
	{
		id: "osfs.feedback.touchdownReference",
		label: "Touchdown reference",
		description: "The strut impulse in one interval that gives a full-strength touchdown vibration.",
		unit: NEWTON_SECONDS,
		kind: "number",
		step: 10,
		scale: "log2",
		bounds: within(10, 1e4),
		default: 300,
		defaultReason: "An authored scale: roughly the main-gear strut impulse in the first 60 ms of a firm Cessna 172 touchdown.",
		home: all(FEEDBACK),
		appliesLive: true,
		source: "src/flight/feedback/haptics.ts"
	},
	{
		id: "osfs.feedback.slipReference",
		label: "Spin-up reference",
		description: "The tyre slip work in one interval that gives a full-strength spin-up vibration.",
		unit: JOULES,
		kind: "number",
		step: 10,
		scale: "log2",
		bounds: within(10, 1e5),
		default: 1200,
		defaultReason: "An authored scale: roughly one 50 ms interval of the modelled gentle-touchdown spin-up.",
		home: all(FEEDBACK),
		appliesLive: true,
		source: "src/flight/feedback/haptics.ts"
	}
];
function groundChoice(key, description) {
	const labels = GROUND_CHOICE_LABELS[key];
	return {
		id: `osfs.ground.${key}`,
		label: GROUND_FIELD_LABELS[key],
		description,
		unit: "none",
		kind: "choice",
		choices: GROUND_CHOICES[key].map((id) => ({
			id,
			label: labels[id]
		})),
		default: DEFAULT_GROUND_INTERACTION_SETTINGS[key],
		defaultReason: "The Minimal profile: the ground as JSBSim models it, with nothing added.",
		home: all(GROUND),
		appliesLive: true,
		source: "src/flight/settings/groundInteractionSettings.ts"
	};
}
function groundLevel(field, label, description, value) {
	return {
		id: `osfs.ground.${field}`,
		label,
		description,
		unit: "fraction",
		kind: "number",
		step: .05,
		bounds: within(0, 1),
		default: value,
		defaultReason: "The original level.",
		home: all(GROUND),
		appliesLive: true,
		source: "src/flight/createFlightSimApp.ts"
	};
}
function groundLock(key) {
	return {
		id: `osfs.ground.lock.${key}`,
		label: `Lock ${GROUND_FIELD_LABELS[key].toLowerCase()}`,
		description: "Auto cannot substitute another choice for a locked one.",
		unit: "none",
		kind: "boolean",
		default: false,
		defaultReason: "Nothing locked: Auto may substitute any choice that cannot run.",
		home: all(GROUND),
		appliesLive: true,
		source: "src/flight/settings/groundInteractionSettings.ts"
	};
}
function soundLimit(tier, field, label, description, unit, min, cap, step) {
	return {
		id: `osfs.sound.${tier}.${field}`,
		label,
		description,
		unit,
		kind: "number",
		step,
		bounds: () => ({
			min,
			max: cap,
			reason: "The tier's budget in docs/sound.md §1"
		}),
		default: cap,
		defaultReason: "The tier's full budget; shedding lowers it under load.",
		home: all(SOUND),
		appliesLive: true,
		source: "src/flight/audio/dsp/core.cpp"
	};
}
function soundVolume(field, label, description, value, defaultReason = "The original level.", maximum = 1) {
	return {
		id: `osfs.sound.${field}`,
		label,
		description,
		unit: "fraction",
		kind: "number",
		step: .05,
		bounds: within(0, maximum),
		default: value,
		defaultReason,
		home: main(SOUND),
		appliesLive: true,
		source: "src/flight/audio/createFlightAudio.ts"
	};
}
function autopilotAxis(axis, label, description) {
	return {
		id: `osfs.autopilot.axes.${axis}`,
		label: `Automate ${label.toLowerCase()}`,
		description,
		unit: "none",
		kind: "boolean",
		default: true,
		defaultReason: "The full package, as the AP button has always engaged it.",
		home: main(AUTOPILOT),
		appliesLive: true,
		source: "src/flight/autopilot/controlArbiter.ts"
	};
}
function keyboardNumber(field, label, description, unit, min, max, step, value, defaultReason) {
	return {
		id: `osfs.input.keyboard.${field}`,
		label,
		description,
		unit,
		kind: "number",
		step,
		bounds: within(min, max),
		default: value,
		defaultReason,
		home: all(KEYBOARD),
		appliesLive: true,
		source: KEYBOARD_STICK_SOURCE
	};
}
const SPECS = new Map(OSFS_PARAMETERS.map((spec) => [spec.id, spec]));
/** The spec of one flight parameter. */
function flightParameterSpec(id) {
	const spec = SPECS.get(id);
	if (!spec) throw new Error(`Unknown flight parameter ${id}`);
	return spec;
}
function catalogueDefault(id) {
	const value = flightParameterSpec(id).default;
	return typeof value === "object" ? { ...value } : value;
}
/**
* The catalogue's defaults in memory, for code that runs without a registry,
* such as a unit test. Overrides stand in for values the test sets. Writes are
* not validated and not saved.
*/
function flightParameterDefaults(overrides = {}) {
	const values = new Map(Object.entries(overrides));
	const listeners = /* @__PURE__ */ new Map();
	const notify = (id) => {
		for (const listener of [...listeners.get(id) ?? []]) listener(store.get(id));
	};
	const store = {
		get(id) {
			return values.has(id) ? values.get(id) : catalogueDefault(id);
		},
		set(id, value) {
			values.set(id, value);
			notify(id);
			return { ok: true };
		},
		setMany(next) {
			for (const [id, value] of Object.entries(next)) values.set(id, value);
			for (const id of Object.keys(next)) notify(id);
			return { ok: true };
		},
		reset(id) {
			values.delete(id);
			notify(id);
		},
		watch(id, listener) {
			const set = listeners.get(id) ?? /* @__PURE__ */ new Set();
			set.add(listener);
			listeners.set(id, set);
			return () => {
				set.delete(listener);
			};
		},
		storageError: () => null
	};
	return store;
}
//#endregion
//#region src/flight/jsbsim/bootstrapC172.ts
const catalogue = flightParameterDefaults();
const DEFAULT_OPTIONS = {
	latDeg: catalogue.get("osfs.start.latitude"),
	lonDeg: catalogue.get("osfs.start.longitude"),
	altFt: 5e3,
	headingDeg: catalogue.get("osfs.start.heading"),
	airspeedKts: catalogue.get("osfs.start.airspeed"),
	engineRunning: true
};
function mixtureForAltitude(altitudeFt) {
	const pressureRatio = Math.pow(Math.max(0, 1 - 687535e-11 * altitudeFt), 5.2561);
	return Math.min(1, Math.max(0, pressureRatio * 1.3));
}
function applyFixedDeltaT(sdk, deltaSeconds) {
	const timing = sdk;
	if (typeof timing.setDt !== "function") throw new Error("JSBSim SDK is missing setDt(); cannot configure the simulation timestep.");
	timing.setDt(deltaSeconds);
	const actual = timing.getDeltaT?.();
	if (actual !== void 0 && Number.isFinite(actual) && Math.abs(actual - deltaSeconds) > 1e-9) throw new Error(`JSBSim dt mismatch: expected ${deltaSeconds}s, got ${actual}s.`);
}
async function bootstrapAircraft(sdk, aircraftId, options = {}) {
	const opts = {
		...DEFAULT_OPTIONS,
		...options
	};
	const profile = getFdmProfile(aircraftId);
	const throttleNorm = options.throttleNorm ?? profile.initialThrottleNorm;
	const isPiston = profile.engine === "piston";
	sdk.configurePaths({
		rootDir: "/runtime",
		aircraftPath: "aircraft",
		enginePath: profile.dataPaths?.enginePath ?? "engine",
		systemsPath: profile.dataPaths?.systemsPath ?? "systems"
	});
	if (!sdk.loadModel(profile.model)) throw new Error(`JSBSim failed to load the ${aircraftId} aircraft model (${profile.model}).`);
	if (profile.requiredReadOnlyModelProperties?.length) {
		const normalize = (path) => path.replace(/\[0\]/g, "");
		const readOnly = new Set(sdk.getPropertyCatalog().flatMap((entry) => {
			const match = /^(.*?)\s+\(R\)$/.exec(entry.trim());
			return match ? [normalize(match[1])] : [];
		}));
		const missing = profile.requiredReadOnlyModelProperties.filter((path) => !readOnly.has(normalize(path)));
		if (missing.length) throw new Error(`JSBSim cannot initialize ${aircraftId}: required native read-only model properties are unavailable: ${missing.join(", ")}. Install a compatible JSBSim SDK and matching aircraft data.`);
	}
	applyFixedDeltaT(sdk, FIXED_DT);
	sdk.setPropertyValue("ic/lat-geod-deg", opts.latDeg);
	sdk.setPropertyValue("ic/long-gc-deg", opts.lonDeg);
	sdk.setPropertyValue("ic/h-sl-ft", opts.altFt);
	sdk.setPropertyValue("ic/psi-true-deg", opts.headingDeg);
	sdk.setPropertyValue("ic/theta-deg", profile.initialPitchDeg ?? 0);
	sdk.setPropertyValue("ic/phi-deg", 0);
	sdk.setPropertyValue("ic/vc-kts", options.airspeedKts ?? profile.initialAirspeedKts ?? opts.airspeedKts);
	if (profile.initialPitchDeg !== void 0) {
		sdk.setPropertyValue("ic/gamma-deg", 0);
		sdk.setPropertyValue("ic/alpha-deg", profile.initialPitchDeg);
	}
	sdk.setPropertyValue("gear/gear-cmd-norm", profile.initialGearDown ? 1 : 0);
	sdk.setPropertyValue("gear/gear-pos-norm", profile.initialGearDown ? 1 : 0);
	sdk.setPropertyValue("fcs/flap-cmd-norm", 0);
	sdk.setPropertyValue(profile.flapPosition.property, 0);
	const restoreAircraftControls = () => {
		for (const [property, value] of Object.entries(profile.initialProperties ?? {})) sdk.setPropertyValue(property, value);
	};
	restoreAircraftControls();
	if (!sdk.runIc()) throw new Error(`JSBSim RunIC failed for ${aircraftId} initial conditions.`);
	sdk.setPropertyValue("fcs/throttle-cmd-norm", throttleNorm);
	restoreAircraftControls();
	if (opts.engineRunning) sdk.setPropertyValue("propulsion/set-running", -1);
	else sdk.setPropertyValue("propulsion/engine/set-running", 0);
	if (isPiston) {
		sdk.setPropertyValue("propulsion/magneto_cmd", opts.engineRunning ? 3 : 0);
		sdk.setPropertyValue("fcs/mixture-cmd-norm", mixtureForAltitude(opts.altFt));
	}
	sdk.setPropertyValue("fcs/throttle-cmd-norm", throttleNorm);
	restoreAircraftControls();
	if (!sdk.runIc()) throw new Error(`JSBSim RunIC failed for ${aircraftId} engine initial conditions.`);
}
/** Short of running, the ring stops here, so only a finished start fills it. */
const MAX_PROGRESS_BEFORE_RUNNING = .96;
/** JSBSim spells engine 0 without brackets in its catalogue. */
function engineIndices(sdk) {
	if (typeof sdk.queryPropertyCatalog !== "function") return [0];
	let text;
	try {
		text = sdk.queryPropertyCatalog("propulsion/engine");
	} catch {
		return [0];
	}
	const indices = /* @__PURE__ */ new Set();
	for (const line of text.split(/\r?\n/)) {
		const match = /^propulsion\/engine(?:\[(\d+)\])?\/set-running\b/.exec(line.trim());
		if (match) indices.add(Number(match[1] ?? 0));
	}
	return indices.size ? [...indices].sort((a, b) => a - b) : [0];
}
function createEngineControl(sdk, profile) {
	const engines = engineIndices(sdk);
	const turbine = profile.engine === "turbine";
	const read = (property) => sdk.getPropertyValue(property);
	const isRunning = (index) => read(`propulsion/engine[${index}]/set-running`) > .5;
	const allRunning = () => engines.every(isRunning);
	const anyRunning = () => engines.some(isRunning);
	const setStarter = (on) => sdk.setPropertyValue("propulsion/starter_cmd", on ? 1 : 0);
	/** Fuel for a turbine, spark for a piston. magneto_cmd cannot be read back, so it is only ever written. */
	const setIgnition = (on) => {
		if (turbine) sdk.setPropertyValue("propulsion/cutoff_cmd", on ? 0 : 1);
		else sdk.setPropertyValue("propulsion/magneto_cmd", on ? 3 : 0);
	};
	const stop = () => {
		setStarter(false);
		setIgnition(false);
	};
	let held = false;
	let shutdownPending = false;
	let wasRunning = null;
	let last = {
		state: allRunning() ? "running" : "stopped",
		startProgress: 0,
		blocked: null
	};
	const progress = (running) => {
		if (running) return 1;
		const speed = read(profile.startSpeed.property);
		if (!Number.isFinite(speed) || profile.startSpeed.runningAt <= 0) return 0;
		return Math.min(MAX_PROGRESS_BEFORE_RUNNING, Math.max(0, speed / profile.startSpeed.runningAt));
	};
	const turnOver = () => {
		if (read("propulsion/starter_cmd") < .5) {
			setStarter(true);
			if (!turbine) setIgnition(true);
		}
		if (!turbine) return;
		const lightable = read(profile.startSpeed.property) > 15;
		if (lightable === read("propulsion/cutoff_cmd") > .5) setIgnition(lightable);
	};
	return {
		step(startHeld) {
			const running = allRunning();
			if (shutdownPending) if (anyRunning()) stop();
			else shutdownPending = false;
			const starting = startHeld && !shutdownPending;
			if (starting && !running) turnOver();
			else if (starting && !turbine && read("propulsion/starter_cmd") > .5) setStarter(false);
			else if (!starting && !running && (held || wasRunning !== false)) stop();
			held = starting;
			wasRunning = running;
			const fuel = read("propulsion/total-fuel-lbs");
			last = {
				state: shutdownPending ? "stopped" : running ? "running" : starting ? "starting" : "stopped",
				startProgress: starting ? progress(running) : running ? 1 : 0,
				blocked: !running && Number.isFinite(fuel) && fuel <= 0 ? "No fuel on board" : null
			};
			return last;
		},
		shutdown() {
			shutdownPending = true;
			stop();
			last = {
				...last,
				state: "stopped",
				startProgress: 0
			};
		},
		reading: () => last
	};
}
//#endregion
//#region src/flight/jsbsim/hydrateJsbsimData.ts
/** The same aircraft dependency selection is used by the browser and FDM tests. */
function resolveAircraftDataFiles(manifest, aircraftId) {
	const aircraft = manifest && typeof manifest === "object" && "aircraft" in manifest ? manifest.aircraft : null;
	const files = aircraft && typeof aircraft === "object" && aircraftId in aircraft ? aircraft[aircraftId] : null;
	if (!Array.isArray(files) || files.length === 0 || !files.every((path) => typeof path === "string" && path.length > 0 && !path.startsWith("/") && !path.split("/").includes(".."))) throw new Error("No valid JSBSim package defined for aircraft " + aircraftId + ".");
	return [...new Set(files)];
}
//#endregion
//#region src/flight/jsbsim/resetFlightLocation.ts
/** Apply coordinates or a runway preset to the selected aircraft model. */
function resetFlightLocation(sdk, location, terrainHeightMeters, aircraftId = "cessna-172") {
	if (!Number.isFinite(location.latDeg) || Math.abs(location.latDeg) > 90 || !Number.isFinite(location.lonDeg) || Math.abs(location.lonDeg) > 180 || location.altMeters !== void 0 && !Number.isFinite(location.altMeters)) throw new Error("Invalid geodetic location.");
	const preset = location.flightPreset;
	if (preset && (!Number.isFinite(preset.headingDeg) || !Number.isFinite(preset.groundElevationMeters) || !Number.isFinite(preset.flightPathDeg) || !["departure", "arrival"].includes(preset.mode) || location.altMeters === void 0)) throw new Error("Invalid airport flight preset.");
	if (terrainHeightMeters !== void 0 && !Number.isFinite(terrainHeightMeters)) throw new Error("Invalid terrain height");
	const profile = getFdmProfile(aircraftId);
	const runway = preset ? profile.runwayPresets[preset.mode] : null;
	const rawState = readFlightState(sdk);
	const state = validFlightState(rawState) ? rawState : {
		...EMPTY_FLIGHT_STATE,
		altMeters: 1e3,
		airspeedKts: 100,
		throttleNorm: profile.initialThrottleNorm
	};
	const saved = captureSimulation(sdk);
	const controlEntries = Object.entries(saved.controls).filter(([property, value]) => Number.isFinite(value) && !/^propulsion\/engine(?:\[\d+\])?\/thermal\//.test(property));
	const storeAttachments = Object.entries(saved.controls).filter(([property, value]) => /^stores\/external-tank(?:\[\d+\])?\/attached$/.test(property) && Number.isFinite(value));
	const restoreStoreAttachments = () => {
		for (const [property, value] of storeAttachments) sdk.setPropertyValue(property, value);
	};
	const flapPosition = sdk.getPropertyValue(profile.flapPosition.property);
	const conversion = profile.stovl ? {
		command: sdk.getPropertyValue(profile.stovl.commandProperty),
		position: sdk.getPropertyValue(profile.stovl.positionProperty)
	} : void 0;
	const restoreConversion = () => {
		if (!profile.stovl || !conversion) return;
		sdk.setPropertyValue(profile.stovl.commandProperty, runway ? 0 : conversion.command);
		sdk.setPropertyValue(profile.stovl.positionProperty, runway ? 0 : conversion.position);
	};
	const controlLawMode = profile.controlLaw ? sdk.getPropertyValue(profile.controlLaw.commandProperty) : void 0;
	const restoreControlLaw = () => {
		if (profile.controlLaw && controlLawMode !== void 0) sdk.setPropertyValue(profile.controlLaw.commandProperty, controlLawMode);
	};
	const departure = preset?.mode === "departure";
	sdk.resetToInitialConditions(2);
	restoreEngineThermalState(sdk, saved.controls);
	restoreStoreAttachments();
	const terrain = terrainHeightMeters ?? preset?.groundElevationMeters;
	sdk.setPropertyValue("ic/terrain-elevation-ft", (terrain ?? -1e4) / .3048);
	const clearanceMeters = profile.stance.staticMeters + .17;
	const requested = departure ? (terrain ?? preset.groundElevationMeters) + clearanceMeters : location.altMeters ?? state.altMeters;
	const altitude = terrain === void 0 ? requested : Math.max(requested, terrain + clearanceMeters);
	sdk.setPropertyValue("ic/h-sl-ft", altitude / .3048);
	sdk.setPropertyValue("ic/lat-geod-deg", location.latDeg);
	sdk.setPropertyValue("ic/long-gc-deg", location.lonDeg);
	sdk.setPropertyValue("ic/psi-true-deg", preset?.headingDeg ?? state.headingRad * 180 / Math.PI);
	const pitchDeg = runway?.pitchDeg ?? profile.initialPitchDeg ?? profile.stance.staticPitchRad * 180 / Math.PI;
	sdk.setPropertyValue("ic/theta-deg", pitchDeg);
	sdk.setPropertyValue("ic/phi-deg", 0);
	sdk.setPropertyValue("ic/vc-kts", runway?.airspeedKts ?? state.airspeedKts);
	sdk.setPropertyValue("ic/gamma-deg", preset?.flightPathDeg ?? 0);
	if (preset?.mode === "arrival") sdk.setPropertyValue("ic/alpha-deg", 6);
	else if (!runway && profile.initialPitchDeg !== void 0) sdk.setPropertyValue("ic/alpha-deg", pitchDeg);
	if (departure) sdk.setPropertyValue("ic/vg-fps", 0);
	if (runway) {
		sdk.setPropertyValue("fcs/elevator-cmd-norm", 0);
		sdk.setPropertyValue("fcs/aileron-cmd-norm", 0);
		sdk.setPropertyValue("fcs/rudder-cmd-norm", 0);
		sdk.setPropertyValue("fcs/pitch-trim-cmd-norm", 0);
		sdk.setPropertyValue("fcs/roll-trim-cmd-norm", 0);
		sdk.setPropertyValue("gear/gear-cmd-norm", 1);
		sdk.setPropertyValue("gear/gear-pos-norm", 1);
		sdk.setPropertyValue("fcs/flap-cmd-norm", runway.flapsNorm);
		sdk.setPropertyValue(profile.flapPosition.property, runway.flapsNorm * profile.flapPosition.fullTravel);
		sdk.setPropertyValue("fcs/left-brake-cmd-norm", departure ? 1 : 0);
		sdk.setPropertyValue("fcs/right-brake-cmd-norm", departure ? 1 : 0);
		for (const index of fuelTankIndices(sdk)) {
			const path = fuelTankContentsPath(index);
			const contents = saved.controls[path];
			if (contents !== void 0 && Number.isFinite(contents)) sdk.setPropertyValue(path, contents);
		}
	} else {
		for (const [property, value] of controlEntries) sdk.setPropertyValue(property, value);
		if (Number.isFinite(flapPosition)) sdk.setPropertyValue(profile.flapPosition.property, flapPosition);
	}
	restoreConversion();
	restoreControlLaw();
	restoreStoreAttachments();
	sdk.setPropertyValue("fcs/throttle-cmd-norm", runway?.throttleNorm ?? state.throttleNorm);
	if (!sdk.runIc()) throw new Error("JSBSim could not apply the location.");
	if (runway || saved.running) sdk.setPropertyValue("propulsion/set-running", -1);
	else sdk.setPropertyValue("propulsion/engine/set-running", 0);
	if (!runway) {
		for (const [property, value] of controlEntries) sdk.setPropertyValue(property, value);
		if (Number.isFinite(flapPosition)) sdk.setPropertyValue(profile.flapPosition.property, flapPosition);
	} else if (profile.engine === "piston") {
		sdk.setPropertyValue("propulsion/magneto_cmd", 3);
		sdk.setPropertyValue("fcs/mixture-cmd-norm", Math.min(1, Math.max(0, Math.pow(Math.max(0, 1 - 687535e-11 * altitude / .3048), 5.2561) * 1.3)));
	}
	restoreConversion();
	restoreControlLaw();
	restoreStoreAttachments();
	sdk.setPropertyValue("fcs/throttle-cmd-norm", runway?.throttleNorm ?? state.throttleNorm);
	if (!sdk.runIc()) throw new Error("JSBSim could not initialize engines at the new location.");
	if (!runway) {
		for (const [property, value] of controlEntries) sdk.setPropertyValue(property, value);
		if (Number.isFinite(flapPosition)) sdk.setPropertyValue(profile.flapPosition.property, flapPosition);
	}
	restoreConversion();
	restoreControlLaw();
	restoreStoreAttachments();
	return readFlightState(sdk);
}
//#endregion
export { bootstrapAircraft, captureSimulation, createEngineControl, flightParameterDefaults, getFdmProfile, resetFlightLocation, resolveAircraftDataFiles, restoreSimulation };
