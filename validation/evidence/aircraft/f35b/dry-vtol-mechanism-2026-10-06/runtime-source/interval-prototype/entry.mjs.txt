import { Matrix, Quaternion, Vector3 } from "@babylonjs/core";
//#region src/flight/aircraft/engineReactionEmission.ts
/** The small rectangular chemistry table is evaluated once per changed physical state. */
function sampleEngineReactionParcel(data, kelvin, pressurePascal) {
	if (!Number.isFinite(kelvin) || kelvin <= 0 || !Number.isFinite(pressurePascal) || pressurePascal <= 0) return void 0;
	const temperatures = [...new Set(data.cases.map((row) => row.reactantTemperatureKelvin))].sort((a, b) => a - b);
	const pressures = [...new Set(data.cases.map((row) => row.pressurePascal))].sort((a, b) => a - b);
	if (!temperatures.length || !pressures.length) return void 0;
	const bounds = (axis, v, logarithmic = false) => {
		const value = Math.max(axis[0], Math.min(axis.at(-1), v));
		const hi = axis.findIndex((x) => x >= value), lo = Math.max(0, hi - 1);
		const coordinate = (x) => logarithmic ? Math.log(x) : x;
		return {
			lo: axis[lo],
			hi: axis[hi],
			f: axis[hi] > axis[lo] ? (coordinate(value) - coordinate(axis[lo])) / (coordinate(axis[hi]) - coordinate(axis[lo])) : 0,
			clamped: value !== v
		};
	};
	const t = bounds(temperatures, kelvin), p = bounds(pressures, pressurePascal, true);
	let productTemperatureKelvin = 0, chBandEnergyJoulesPerKgFuel = 0, logYield = 0, positiveYield = true;
	for (const [temperature, wt] of [[t.lo, 1 - t.f], [t.hi, t.f]]) for (const [pressure, wp] of [[p.lo, 1 - p.f], [p.hi, p.f]]) {
		if (wt * wp === 0) continue;
		const row = data.cases.find((r) => r.reactantTemperatureKelvin === temperature && r.pressurePascal === pressure);
		if (!row || !Number.isFinite(row.productTemperatureKelvin) || row.productTemperatureKelvin <= 0 || !Number.isFinite(row.chBandEnergyJoulesPerKgFuel) || row.chBandEnergyJoulesPerKgFuel < 0) return void 0;
		productTemperatureKelvin += wt * wp * row.productTemperatureKelvin;
		chBandEnergyJoulesPerKgFuel += wt * wp * row.chBandEnergyJoulesPerKgFuel;
		if (row.chBandEnergyJoulesPerKgFuel > 0) logYield += wt * wp * Math.log(row.chBandEnergyJoulesPerKgFuel);
		else positiveYield = false;
	}
	return {
		productTemperatureKelvin,
		chBandEnergyJoulesPerKgFuel: positiveYield ? Math.exp(logYield) : chBandEnergyJoulesPerKgFuel,
		inputWasClamped: t.clamped || p.clamped
	};
}
/**
* Two-point temperature PDF, with the SAME constant-cp mean enthalpy as the
* native bath. At equal pressure and molecular weight, volume is proportional
* to mass * T. Evaluate B(T) in each state, never B(mean T) for the whole flame.
* This is an unresolved-mixture hypothesis, not a second heat integrator.
*/
function engineReactionTemperaturePdf(meanKelvin, coldKelvin, hotKelvin, unmixedFraction) {
	if (hotKelvin <= meanKelvin || meanKelvin <= coldKelvin || unmixedFraction <= 0) return {
		coldKelvin: meanKelvin,
		hotKelvin: meanKelvin,
		hotMassFraction: 0,
		hotVolumeFraction: 0
	};
	const hotMassFraction = (meanKelvin - coldKelvin) / (hotKelvin - coldKelvin) * Math.max(0, Math.min(1, unmixedFraction));
	return {
		coldKelvin: (meanKelvin - hotMassFraction * hotKelvin) / (1 - hotMassFraction),
		hotKelvin,
		hotMassFraction,
		hotVolumeFraction: hotMassFraction * hotKelvin / meanKelvin
	};
}
//#endregion
//#region src/flight/aircraft/engineGasOptics.ts
/** 0sfs owns the dimensional aircraft gas optical approximation, not engine heat dynamics. */
const DEFAULT_ENGINE_GAS_AXIAL_SAMPLES = 64;
const DEFAULT_ENGINE_GAS_RADIAL_SAMPLES = 32;
/** One last geometry entry per live profile; collected with the profile. */
const geometryWeightCache = /* @__PURE__ */ new WeakMap();
function cachedGasGeometryWeights(data, width, height, domain, explicitFlowDomain, input, radiusExpansionRatio) {
	const key = JSON.stringify([
		width,
		height,
		explicitFlowDomain,
		...domain.axialDistanceRangeMeters,
		...domain.sections.flatMap((s) => [
			s.distanceMeters,
			s.radiusMeters,
			s.innerRadiusMeters ?? 0,
			s.areaFactor ?? 1
		])
	]);
	const cached = geometryWeightCache.get(data);
	if (cached?.key === key) return cached.weights;
	const total = explicitFlowDomain ? void 0 : gasFieldVolumeWeights(width, height, input.radiusMeters, input.lengthMeters, radiusExpansionRatio);
	const weights = total ? {
		total,
		exterior: total
	} : integrateGasFlowFieldVolumeWeights(width, height, domain);
	geometryWeightCache.set(data, {
		key,
		weights
	});
	return weights;
}
/** Profile validation happens once at resource construction, never per frame. */
function validateEngineGasOpticalData(data) {
	const table = data.blackbody;
	if (!["gray-emission-absorption-v1", "imposed-gas-bath-v2"].includes(data.model) || table.unit !== "cd/m2" || table.temperatureKelvinRange.length !== 2 || table.temperatureKelvinRange.some((v) => !Number.isFinite(v) || v <= 0) || table.temperatureKelvinRange[1] <= table.temperatureKelvinRange[0] || table.samples.length < 2 || table.samples.some((rgb) => rgb.length !== 3 || rgb.some((v) => !Number.isFinite(v) || v < 0)) || !Number.isFinite(data.fuelHeatingValueJPerKg) || data.fuelHeatingValueJPerKg <= 0 || !Number.isFinite(data.normalizedDensityVolume) || data.normalizedDensityVolume <= 0 || data.excitedRgbLumensPerWatt.length !== 3 || data.excitedRgbLumensPerWatt.some((v) => !Number.isFinite(v) || v < 0) || [data.dry, data.afterburner].some((p) => ![
		p.absorptionPerMeter,
		p.particleFuelPowerFraction,
		p.excitedFuelPowerFraction
	].every((v) => Number.isFinite(v) && v >= 0) || p.particleFuelPowerFraction + p.excitedFuelPowerFraction > 1)) throw new RangeError("Invalid dimensional gas optical data");
	const corrected = data.model === "imposed-gas-bath-v2";
	const particle = data.particleSpectrum;
	if (particle && (particle.model !== "power-law-soot-v1" || !corrected || !Number.isFinite(particle.referenceWavelengthNm) || particle.referenceWavelengthNm <= 0 || !Number.isFinite(particle.absorptionAngstromExponent) || particle.absorptionAngstromExponent < 0 || particle.absorptionAngstromExponentRange.length !== 2 || particle.absorptionAngstromExponentRange.some((v) => !Number.isFinite(v) || v < 0) || particle.absorptionAngstromExponentRange[0] > particle.absorptionAngstromExponent || particle.absorptionAngstromExponentRange[1] < particle.absorptionAngstromExponent || [particle.xyz, particle.rgb].some((p) => p.unit !== "cd/m2" || p.temperatureKelvinRange.length !== 2 || p.temperatureKelvinRange.some((v, i) => v !== table.temperatureKelvinRange[i]) || p.samples.length !== table.samples.length || p.samples.some((row) => row.length !== 3 || row.some((v) => !Number.isFinite(v) || v < 0))) || particle.planckMeanAbsorptionRatio.unit !== "relative-to-reference-absorption" || particle.planckMeanAbsorptionRatio.temperatureKelvinRange.length !== 2 || particle.planckMeanAbsorptionRatio.temperatureKelvinRange.some((v, i) => v !== table.temperatureKelvinRange[i]) || particle.planckMeanAbsorptionRatio.samples.length !== table.samples.length || particle.planckMeanAbsorptionRatio.samples.some((v) => !Number.isFinite(v) || v <= 0))) throw new RangeError("Invalid particle absorption spectrum");
	if (corrected && (data.temperatureMeaning !== "imposed-native-gas-bath-proxy" || data.chemistryStatus !== (data.reactionParcel ? "surrogate-parcel" : "unavailable") || !data.spatialField || data.dry.excitedFuelPowerFraction !== 0 || data.afterburner.excitedFuelPowerFraction !== 0 || data.dry.absorptionPerMeter !== data.afterburner.absorptionPerMeter || data.dry.particleFuelPowerFraction !== data.afterburner.particleFuelPowerFraction)) throw new RangeError("Corrected gas optics require an explicit proxy and declared chemistry source");
	if (data.reactionParcel && (data.reactionParcel.model !== "ndodecane-ch-a-parcel-v1" || ![
		data.reactionParcel.pressureToAmbientRatio,
		data.reactionParcel.reactionLengthMeters,
		data.reactionParcel.varianceMixingLengthMeters
	].every((v) => Number.isFinite(v) && v > 0) || data.reactionParcel.chXyzLumensPerWatt.some((v) => !Number.isFinite(v) || v < 0) || !data.reactionParcel.cases.length)) throw new RangeError("Invalid reaction parcel optical table");
	const field = data.spatialField;
	if (field && (field.model !== (corrected ? "axisymmetric-gas-bath-v2" : "axisymmetric-mixing-v1") || !Number.isInteger(field.width) || !Number.isInteger(field.height) || field.width < 2 || field.height < 2 || field.basisSamples.length !== field.width * field.height || field.basisSamples.some((row) => row.length !== 4 || row.some((v) => !Number.isFinite(v) || v < 0) || row[0] > 1) || field.axialRadiusRange[0] !== 0 || !Number.isFinite(field.axialRadiusRange[1]) || field.axialRadiusRange[1] <= 0 || !Number.isFinite(field.spreadingSlope) || field.spreadingSlope < 0 || field.spreadingSlope > 1 || !corrected && (!Number.isFinite(field.specificHeatRatio) || field.specificHeatRatio <= 1 || field.specificHeatRatio > 2 || !field.exitMach || Object.values(field.exitMach).some((v) => !Number.isFinite(v) || v < 0 || v > 5)) || Object.values(field.supportLengthScale).some((v) => !Number.isFinite(v) || v <= 0 || v > 1) || field.ambientTemperatureKelvinRange.length !== 2 || field.ambientTemperatureKelvinRange.some((v) => !Number.isFinite(v) || v <= 0) || field.ambientTemperatureKelvinRange[1] <= field.ambientTemperatureKelvinRange[0] || Object.values(field.excitedSpecies).some((v) => !Number.isFinite(v.powerFraction) || v.powerFraction < 0 || v.powerFraction > 1 || v.rgbLumensPerWatt.length !== 3 || v.rgbLumensPerWatt.some((c) => !Number.isFinite(c) || c < 0) || v.xyzLumensPerWatt.length !== 3 || v.xyzLumensPerWatt.some((c) => !Number.isFinite(c) || c < 0)) || field.blackbodyXyz.unit !== "cd/m2" || field.blackbodyXyz.samples.length !== data.blackbody.samples.length || field.blackbodyXyz.temperatureKelvinRange.some((v, i) => v !== data.blackbody.temperatureKelvinRange[i]) || field.blackbodyXyz.samples.some((rgb) => rgb.length !== 3 || rgb.some((v) => !Number.isFinite(v) || v < 0)) || Math.abs(field.excitedSpecies.ch.powerFraction + field.excitedSpecies.c2.powerFraction - (corrected ? 0 : 1)) > 1e-10)) throw new RangeError("Invalid spatial gas optical data");
}
/** Log interpolation preserves positive absolute amplitude over the Planck tail. */
function interpolateGasBlackbody(data, kelvin) {
	return interpolateAbsoluteEmission(data.blackbody, kelvin);
}
/** Absolute RGB interpolation shared by independent solid regions and gas continuum. */
function interpolateAbsoluteEmission(table, kelvin) {
	const { temperatureKelvinRange: range, samples } = table;
	if (!Number.isFinite(kelvin) || kelvin < range[0] || kelvin > range[1] || samples.length < 2) return null;
	const position = (kelvin - range[0]) / (range[1] - range[0]) * (samples.length - 1);
	if (kelvin === range[0]) return samples[0];
	if (kelvin === range[1]) return samples[samples.length - 1];
	const lower = Math.floor(position), upper = Math.min(lower + 1, samples.length - 1), f = position - lower;
	return samples[lower].map((a, c) => {
		const b = samples[upper][c];
		return a > 0 && b > 0 ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * f) : a + (b - a) * f;
	});
}
/** Precomputed Planck mean; no spectral integration is performed at runtime. */
function particlePlanckMeanRatio(data, kelvin) {
	const table = data.particleSpectrum?.planckMeanAbsorptionRatio;
	if (!table) return 1;
	const [lo, hi] = table.temperatureKelvinRange;
	if (!Number.isFinite(kelvin) || kelvin < lo || kelvin > hi) return NaN;
	const position = (kelvin - lo) / (hi - lo) * (table.samples.length - 1);
	const lower = Math.floor(position), upper = Math.min(lower + 1, table.samples.length - 1);
	return table.samples[lower] + (table.samples[upper] - table.samples[lower]) * (position - lower);
}
/** Upper-bound isotropic source accounting; not a closed engine-energy solution. */
function evaluateEngineGasOptics(profile, input) {
	const data = profile.gasEmission;
	const mode = input.augmentation ? "afterburner" : "dry";
	const corrected = data?.model === "imposed-gas-bath-v2";
	const zero = {
		valid: false,
		mode,
		fuelPowerW: 0,
		emittingVolumeM3: 0,
		absorptionPerMeter: 0,
		particlePowerUpperBoundW: 0,
		excitedPowerW: 0,
		totalSourcePowerUpperBoundW: 0,
		allowedPowerW: 0,
		absorptionWasCapped: false,
		blackbodyRgbCdPerM2: [
			0,
			0,
			0
		],
		sourceRgbCdPerM3: [
			0,
			0,
			0
		],
		isotropicIntensityRgbCd: [
			0,
			0,
			0
		],
		exteriorIsotropicIntensityRgbCd: [
			0,
			0,
			0
		],
		temperatureMeaning: corrected ? "imposed-native-gas-bath-proxy" : "legacy-static-exit-hypothesis",
		chemistryStatus: corrected ? "unavailable" : "legacy-imposed",
		sourceBoundaryTemperatureKelvin: 0,
		...corrected ? {} : { staticExitTemperatureKelvin: 0 },
		chPowerW: 0,
		c2PowerW: 0
	};
	if (!data || !Number.isFinite(input.fuelFlowKgPerSecond) || input.fuelFlowKgPerSecond <= 0 || !Number.isFinite(input.radiusMeters) || input.radiusMeters <= 0 || !Number.isFinite(input.lengthMeters) || input.lengthMeters <= 0) return zero;
	const blackbody = interpolateGasBlackbody(data, input.temperatureKelvin ?? NaN);
	if (!blackbody) return zero;
	if (data.spatialField) return evaluateSpatialGasOptics(data, input, zero);
	if (corrected) return zero;
	const parameters = data[mode];
	const fuelPowerW = input.fuelFlowKgPerSecond * data.fuelHeatingValueJPerKg;
	const emittingVolumeM3 = input.radiusMeters ** 2 * input.lengthMeters * data.normalizedDensityVolume;
	const particlePowerPerAbsorption = 4 * 5.670374419e-8 * input.temperatureKelvin ** 4 * emittingVolumeM3;
	const particleBudgetW = fuelPowerW * parameters.particleFuelPowerFraction;
	const absorptionPerMeter = Math.min(parameters.absorptionPerMeter, particleBudgetW / particlePowerPerAbsorption);
	const particlePowerUpperBoundW = absorptionPerMeter * particlePowerPerAbsorption;
	const excitedPowerW = (input.augmentation && Number.isFinite(input.afterburnerBurnedFuelFlowKgPerSecond) ? Math.max(0, Math.min(input.fuelFlowKgPerSecond, input.afterburnerBurnedFuelFlowKgPerSecond)) : 0) * data.fuelHeatingValueJPerKg * parameters.excitedFuelPowerFraction;
	const sourceRgbCdPerM3 = blackbody.map((value, channel) => absorptionPerMeter * value + excitedPowerW / (4 * Math.PI * emittingVolumeM3) * data.excitedRgbLumensPerWatt[channel]);
	if (![
		fuelPowerW,
		emittingVolumeM3,
		absorptionPerMeter,
		particlePowerUpperBoundW,
		excitedPowerW,
		...sourceRgbCdPerM3
	].every(Number.isFinite)) return zero;
	return {
		valid: true,
		mode,
		fuelPowerW,
		emittingVolumeM3,
		absorptionPerMeter,
		particlePowerUpperBoundW,
		excitedPowerW,
		totalSourcePowerUpperBoundW: particlePowerUpperBoundW + excitedPowerW,
		allowedPowerW: fuelPowerW * (parameters.particleFuelPowerFraction + parameters.excitedFuelPowerFraction),
		absorptionWasCapped: absorptionPerMeter < parameters.absorptionPerMeter,
		blackbodyRgbCdPerM2: blackbody,
		sourceRgbCdPerM3,
		isotropicIntensityRgbCd: sourceRgbCdPerM3.map((value) => value * emittingVolumeM3),
		exteriorIsotropicIntensityRgbCd: sourceRgbCdPerM3.map((value) => value * emittingVolumeM3),
		temperatureMeaning: "legacy-static-exit-hypothesis",
		chemistryStatus: "legacy-imposed",
		sourceBoundaryTemperatureKelvin: input.temperatureKelvin,
		staticExitTemperatureKelvin: input.temperatureKelvin,
		chPowerW: 0,
		c2PowerW: 0
	};
}
/** Homogeneous-segment solution, including the zero-extinction limit. */
function integrateGasSegment(sourceRgbCdPerM3, absorptionPerMeter, pathMeters) {
	if (sourceRgbCdPerM3.length !== 3 || sourceRgbCdPerM3.some((value) => !Number.isFinite(value) || value < 0) || !Number.isFinite(absorptionPerMeter) || absorptionPerMeter < 0 || !Number.isFinite(pathMeters) || pathMeters < 0) throw new RangeError("Gas transfer needs finite nonnegative dimensional inputs");
	const opacity = -Math.expm1(-absorptionPerMeter * pathMeters);
	const effectivePathMeters = absorptionPerMeter > 0 ? opacity / absorptionPerMeter : pathMeters;
	return {
		transmittance: 1 - opacity,
		radianceRgbCdPerM2: sourceRgbCdPerM3.map((value) => value * effectivePathMeters)
	};
}
/** Declared computational support; brightness is determined by local fields. */
function engineGasSupportLength(profile, baseLength, power, augmentation) {
	const mode = augmentation ? "afterburner" : "dry";
	return baseLength * (profile.gasEmission?.spatialField?.supportLengthScale[mode] ?? (augmentation ? .7 + .3 * Math.max(0, Math.min(1, power)) : .2));
}
/** Offline bases are interpolated in physical axial distance / exit radius. */
function sampleGasSpatialBasis(data, axialRadii, radialFraction) {
	if (!Number.isFinite(axialRadii) || !Number.isFinite(radialFraction) || axialRadii < 0 || axialRadii > data.axialRadiusRange[1] || radialFraction < 0 || radialFraction > 1) return [
		0,
		0,
		0,
		0
	];
	const x = axialRadii / data.axialRadiusRange[1] * (data.width - 1), y = radialFraction * (data.height - 1);
	const x0 = Math.floor(x), x1 = Math.min(data.width - 1, x0 + 1), y0 = Math.floor(y), y1 = Math.min(data.height - 1, y0 + 1);
	const fx = x - x0, fy = y - y0;
	return [
		0,
		1,
		2,
		3
	].map((c) => (1 - fy) * ((1 - fx) * data.basisSamples[y0 * data.width + x0][c] + fx * data.basisSamples[y0 * data.width + x1][c]) + fy * ((1 - fx) * data.basisSamples[y1 * data.width + x0][c] + fx * data.basisSamples[y1 * data.width + x1][c]));
}
/** Integral of a piecewise-linear nodal hat times coordinate^power on [0,1]. */
function hatMoment(index, count, power) {
	const h = 1 / (count - 1), u = index * h;
	const integral = (lo, hi, p) => (hi ** (p + 1) - lo ** (p + 1)) / (p + 1);
	let value = 0;
	if (index > 0) value += (integral(u - h, u, power + 1) - (u - h) * integral(u - h, u, power)) / h;
	if (index < count - 1) value += ((u + h) * integral(u, u + h, power) - integral(u, u + h, power + 1)) / h;
	return value;
}
/** Exact weights for the actual bilinear source field, including expanding area. */
function gasFieldVolumeWeights(width, height, radiusMeters, lengthMeters, radiusExpansionRatio) {
	const axial = Float64Array.from({ length: width }, (_, x) => hatMoment(x, width, 0) + 2 * radiusExpansionRatio * hatMoment(x, width, 1) + radiusExpansionRatio ** 2 * hatMoment(x, width, 2));
	const radial = Float64Array.from({ length: height }, (_, y) => hatMoment(y, height, 1));
	const scale = 2 * Math.PI * radiusMeters ** 2 * lengthMeters;
	return Float64Array.from({ length: width * height }, (_, index) => scale * axial[index % width] * radial[Math.floor(index / width)]);
}
function validEngineGasFlowDomain(domain) {
	const [lo, hi] = domain.axialDistanceRangeMeters;
	return Number.isFinite(lo) && Number.isFinite(hi) && lo <= 0 && hi > 0 && hi > lo && domain.sections.length >= 2 && domain.sections[0].distanceMeters === lo && domain.sections[domain.sections.length - 1].distanceMeters === hi && domain.sections.every((s, i) => Number.isFinite(s.distanceMeters) && (!i || s.distanceMeters >= domain.sections[i - 1].distanceMeters) && Number.isFinite(s.radiusMeters) && s.radiusMeters > 0 && Number.isFinite(s.innerRadiusMeters ?? 0) && (s.innerRadiusMeters ?? 0) >= 0 && (s.innerRadiusMeters ?? 0) < s.radiusMeters && Number.isFinite(s.areaFactor ?? 1) && (s.areaFactor ?? 1) > 0 && (s.areaFactor ?? 1) <= 1);
}
/** Linear authored cross sections; s is physical path distance, not a world axis. */
function sampleEngineGasFlowSection(domain, distanceMeters) {
	const sections = domain.sections;
	let i = 1;
	while (i < sections.length - 1 && distanceMeters >= sections[i].distanceMeters) i++;
	const a = sections[i - 1], b = sections[i];
	const f = b.distanceMeters === a.distanceMeters ? 1 : Math.max(0, Math.min(1, (distanceMeters - a.distanceMeters) / (b.distanceMeters - a.distanceMeters)));
	const mix = (x, y) => x + (y - x) * f;
	return {
		radiusMeters: mix(a.radiusMeters, b.radiusMeters),
		innerRadiusMeters: mix(a.innerRadiusMeters ?? 0, b.innerRadiusMeters ?? 0),
		areaFactor: mix(a.areaFactor ?? 1, b.areaFactor ?? 1)
	};
}
/** Integral of v times a radial nodal hat above the solid centerbody. */
function radialHatAbove(index, count, innerFraction) {
	const h = 1 / (count - 1), v = index * h;
	const primitive = (a, b, slope, intercept) => slope * (b ** 3 - a ** 3) / 3 + intercept * (b ** 2 - a ** 2) / 2;
	let result = 0;
	if (index > 0 && innerFraction < v) {
		const lo = Math.max(v - h, innerFraction);
		result += primitive(lo, v, 1 / h, -(v - h) / h);
	}
	if (index < count - 1 && innerFraction < v + h) result += primitive(Math.max(v, innerFraction), v + h, -1 / h, (v + h) / h);
	return Math.max(0, result);
}
/**
* Integrates the actual bilinear source over ruled annular sections. Without a
* centerbody the integrand is polynomial and Gauss8 is exact. With a hole, split
* at every radial-hat crossing; the smooth rational remainder has an independent
* convergence check. This is offline-per-state geometry work, not ray work.
*/
function gasFlowFieldVolumeWeights(width, height, domain) {
	return integrateGasFlowFieldVolumeWeights(width, height, domain).total;
}
function integrateGasFlowFieldVolumeWeights(width, height, domain) {
	const [lo, hi] = domain.axialDistanceRangeMeters, length = hi - lo;
	const splits = [
		0,
		...domain.sections.map((s) => s.distanceMeters),
		...Array.from({ length: width }, (_, i) => lo + length * i / (width - 1))
	];
	for (let i = 1; i < domain.sections.length; i++) {
		const a = domain.sections[i - 1], b = domain.sections[i];
		for (let y = 1; y < height - 1; y++) {
			const v = y / (height - 1);
			const start = (a.innerRadiusMeters ?? 0) - v * a.radiusMeters;
			const end = (b.innerRadiusMeters ?? 0) - v * b.radiusMeters;
			if (start * end < 0) splits.push(a.distanceMeters + (b.distanceMeters - a.distanceMeters) * start / (start - end));
		}
	}
	splits.sort((a, b) => a - b);
	const points = [...new Set(splits)];
	const nodes = [
		-.9602898564975363,
		-.7966664774136267,
		-.525532409916329,
		-.1834346424956498,
		.1834346424956498,
		.525532409916329,
		.7966664774136267,
		.9602898564975363
	];
	const quadrature = [
		.1012285362903763,
		.2223810344533745,
		.3137066458778873,
		.362683783378362,
		.362683783378362,
		.3137066458778873,
		.2223810344533745,
		.1012285362903763
	];
	const weights = new Float64Array(width * height);
	const exterior = new Float64Array(width * height);
	for (let i = 1; i < points.length; i++) {
		const half = (points[i] - points[i - 1]) / 2, center = (points[i] + points[i - 1]) / 2;
		for (let q = 0; q < nodes.length; q++) {
			const s = center + half * nodes[q], section = sampleEngineGasFlowSection(domain, s);
			const x = (s - lo) / length * (width - 1), x0 = Math.min(width - 2, Math.floor(x)), f = x - x0;
			const scale = 2 * Math.PI * section.radiusMeters ** 2 * section.areaFactor * half * quadrature[q];
			for (let y = 0; y < height; y++) {
				const w = scale * radialHatAbove(y, height, section.innerRadiusMeters / section.radiusMeters);
				weights[y * width + x0] += w * (1 - f);
				weights[y * width + x0 + 1] += w * f;
				if (s >= 0) {
					exterior[y * width + x0] += w * (1 - f);
					exterior[y * width + x0 + 1] += w * f;
				}
			}
		}
	}
	return {
		total: weights,
		exterior
	};
}
function evaluateSpatialGasOptics(data, input, zero) {
	const spatial = data.spatialField;
	const ambient = input.ambientTemperatureKelvin;
	const width = input.axialSamples ?? 64;
	const height = input.radialSamples ?? 32;
	if (ambient === void 0 || !Number.isFinite(ambient) || ambient < spatial.ambientTemperatureKelvinRange[0] || ambient > spatial.ambientTemperatureKelvinRange[1] || !Number.isInteger(width) || !Number.isInteger(height) || width < 8 || width > 64 || height < 8 || height > 64) return zero;
	const corrected = data.model === "imposed-gas-bath-v2";
	const mode = input.augmentation ? "afterburner" : "dry", parameters = data[corrected ? "dry" : mode];
	const mach = spatial.exitMach?.[mode] ?? 0;
	const sourceBoundaryTemperatureKelvin = corrected ? input.temperatureKelvin : input.temperatureKelvin / (1 + .5 * (spatial.specificHeatRatio - 1) * mach * mach);
	const radiusExpansionRatio = spatial.spreadingSlope * input.lengthMeters / input.radiusMeters;
	const domain = corrected && input.flowDomain ? input.flowDomain : {
		axialDistanceRangeMeters: [0, input.lengthMeters],
		sections: [{
			distanceMeters: 0,
			radiusMeters: input.radiusMeters
		}, {
			distanceMeters: input.lengthMeters,
			radiusMeters: input.radiusMeters * (1 + radiusExpansionRatio)
		}]
	};
	if (!validEngineGasFlowDomain(domain)) return zero;
	const domainWeights = cachedGasGeometryWeights(data, width, height, domain, corrected && Boolean(input.flowDomain), input, radiusExpansionRatio);
	const volumeWeightsM3 = domainWeights.total;
	const exteriorVolumeWeightsM3 = domainWeights.exterior;
	if (!Number.isFinite(radiusExpansionRatio) || volumeWeightsM3.some((v) => !Number.isFinite(v) || v < 0)) return zero;
	const count = width * height, rgba = new Float32Array(count * 4);
	const particleTemperatureKelvin = new Float64Array(count);
	const particlePhotopicYCdPerM3 = new Float64Array(count);
	const particleSourceRgbCdPerM3 = new Float64Array(count * 3);
	const chSourceRgbCdPerM3 = new Float64Array(count * 3), c2SourceRgbCdPerM3 = new Float64Array(count * 3);
	const particlePowerDensityWPerM3 = new Float64Array(count);
	const chPowerDensityWPerM3 = new Float64Array(count), c2PowerDensityWPerM3 = new Float64Array(count);
	const sigma = 5.670374419e-8;
	const parcelData = corrected ? data.reactionParcel : void 0;
	const upstream = input.upstreamGasTemperatureKelvin;
	const parcel = parcelData && upstream !== void 0 && input.ambientPressurePascal !== void 0 ? sampleEngineReactionParcel(parcelData, upstream, input.ambientPressurePascal * parcelData.pressureToAmbientRatio) : void 0;
	const parcelBurned = parcel && Number.isFinite(input.afterburnerBurnedFuelFlowKgPerSecond) ? Math.max(0, Math.min(input.fuelFlowKgPerSecond, input.afterburnerBurnedFuelFlowKgPerSecond)) : 0;
	const parcelActive = parcelBurned > 0;
	const reactionLength = parcelData?.reactionLengthMeters ?? 0;
	const axialStep = (domain.axialDistanceRangeMeters[1] - domain.axialDistanceRangeMeters[0]) / (width - 1);
	const reactionDomainResolved = domain.axialDistanceRangeMeters[0] + reactionLength + axialStep <= 0;
	const kernelIntegral = (u) => u / 2 - Math.sin(2 * Math.PI * u) / (4 * Math.PI);
	const halfReactionCell = reactionLength > 0 ? .5 * axialStep / reactionLength : 0;
	let emittingVolumeM3 = 0, particlePowerPerAbsorption = 0, chBasisVolume = 0, c2BasisVolume = 0;
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		const index = y * width + x, weight = volumeWeightsM3[index];
		const [start, end] = domain.axialDistanceRangeMeters;
		const distance = start + x / (width - 1) * (end - start);
		const basis = sampleGasSpatialBasis(spatial, Math.max(0, distance) / input.radiusMeters, y / (height - 1));
		const kelvin = ambient + (sourceBoundaryTemperatureKelvin - ambient) * basis[0];
		particleTemperatureKelvin[index] = kelvin;
		const cold = ambient + ((upstream ?? sourceBoundaryTemperatureKelvin) - ambient) * basis[0];
		const hot = ambient + ((parcel?.productTemperatureKelvin ?? sourceBoundaryTemperatureKelvin) - ambient) * basis[0];
		const pdf = parcelActive ? engineReactionTemperaturePdf(kelvin, cold, hot, Math.exp(-Math.max(0, distance) / parcelData.varianceMixingLengthMeters)) : void 0;
		const hotFraction = pdf?.hotVolumeFraction ?? 0;
		const coldK = pdf?.coldKelvin ?? kelvin, hotK = pdf?.hotKelvin ?? kelvin;
		const emissionTable = data.particleSpectrum?.xyz ?? spatial.blackbodyXyz;
		const coldXyz = interpolateAbsoluteEmission(emissionTable, coldK) ?? [
			0,
			0,
			0
		];
		const hotXyz = hotFraction > 0 ? interpolateAbsoluteEmission(emissionTable, hotK) ?? [
			0,
			0,
			0
		] : coldXyz;
		const xyz = coldXyz.map((value, c) => value * (1 - hotFraction) + hotXyz[c] * hotFraction);
		const rgb = signedLinearRgbFromXyz(xyz);
		particlePhotopicYCdPerM3[index] = basis[1] * xyz[1];
		for (let c = 0; c < 3; c++) particleSourceRgbCdPerM3[index * 3 + c] = basis[1] * rgb[c];
		rgba[index * 4 + 3] = basis[1];
		particlePowerDensityWPerM3[index] = 4 * sigma * basis[1] * ((1 - hotFraction) * coldK ** 4 * particlePlanckMeanRatio(data, coldK) + (hotFraction > 0 ? hotFraction * hotK ** 4 * particlePlanckMeanRatio(data, hotK) : 0));
		const progress = reactionLength > 0 ? (distance - start) / reactionLength : -1;
		const lo = Math.max(0, progress - halfReactionCell), hi = Math.min(1, progress + halfReactionCell);
		const chWeight = parcelActive && reactionDomainResolved && progress >= 0 && progress <= 1 && hi > lo ? basis[1] * (kernelIntegral(hi) - kernelIntegral(lo)) / (hi - lo) : 0;
		chPowerDensityWPerM3[index] = parcelData ? chWeight : basis[2];
		c2PowerDensityWPerM3[index] = basis[3];
		emittingVolumeM3 += weight;
		particlePowerPerAbsorption += weight * particlePowerDensityWPerM3[index];
		chBasisVolume += weight * chPowerDensityWPerM3[index];
		c2BasisVolume += weight * basis[3];
	}
	const fuelPowerW = input.fuelFlowKgPerSecond * data.fuelHeatingValueJPerKg;
	const storageMargin = 1 - 2 ** -22;
	const particleBudgetW = fuelPowerW * parameters.particleFuelPowerFraction;
	const absorptionPerMeter = Math.min(parameters.absorptionPerMeter, particlePowerPerAbsorption > 0 ? particleBudgetW * storageMargin / particlePowerPerAbsorption : parameters.absorptionPerMeter);
	const particlePowerUpperBoundW = absorptionPerMeter * particlePowerPerAbsorption;
	const excitedAllocationW = (!corrected && input.augmentation && Number.isFinite(input.afterburnerBurnedFuelFlowKgPerSecond) ? Math.max(0, Math.min(input.fuelFlowKgPerSecond, input.afterburnerBurnedFuelFlowKgPerSecond)) : 0) * data.fuelHeatingValueJPerKg * parameters.excitedFuelPowerFraction * storageMargin;
	const parcelChPowerW = parcelBurned * Math.min(parcel?.chBandEnergyJoulesPerKgFuel ?? 0, data.fuelHeatingValueJPerKg * (1 - parameters.particleFuelPowerFraction));
	const chPowerW = chBasisVolume > 0 ? parcelData ? parcelChPowerW * storageMargin : excitedAllocationW * spatial.excitedSpecies.ch.powerFraction : 0;
	const c2PowerW = c2BasisVolume > 0 ? excitedAllocationW * spatial.excitedSpecies.c2.powerFraction : 0;
	const excitedPowerW = chPowerW + c2PowerW;
	const isotropicIntensityRgbCd = [
		0,
		0,
		0
	];
	const exteriorIsotropicIntensityRgbCd = [
		0,
		0,
		0
	];
	const chXyz = parcelData?.chXyzLumensPerWatt ?? spatial.excitedSpecies.ch.xyzLumensPerWatt;
	const chRgb = signedLinearRgbFromXyz(chXyz);
	const c2Rgb = signedLinearRgbFromXyz(spatial.excitedSpecies.c2.xyzLumensPerWatt);
	let maxSourceCdPerM3 = 0, maxAbsorptionPerMeter = 0;
	for (let index = 0; index < count; index++) {
		particlePowerDensityWPerM3[index] *= absorptionPerMeter;
		chPowerDensityWPerM3[index] *= chBasisVolume > 0 ? chPowerW / chBasisVolume : 0;
		c2PowerDensityWPerM3[index] *= c2BasisVolume > 0 ? c2PowerW / c2BasisVolume : 0;
		rgba[index * 4 + 3] *= absorptionPerMeter;
		maxAbsorptionPerMeter = Math.max(maxAbsorptionPerMeter, rgba[index * 4 + 3]);
		const mixed = [
			0,
			0,
			0
		];
		for (let c = 0; c < 3; c++) {
			const offset = index * 3 + c;
			particleSourceRgbCdPerM3[offset] *= absorptionPerMeter;
			chSourceRgbCdPerM3[offset] = chPowerDensityWPerM3[index] / (4 * Math.PI) * chRgb[c];
			c2SourceRgbCdPerM3[offset] = c2PowerDensityWPerM3[index] / (4 * Math.PI) * c2Rgb[c];
			mixed[c] = particleSourceRgbCdPerM3[offset] + chSourceRgbCdPerM3[offset] + c2SourceRgbCdPerM3[offset];
		}
		const source = gamutMapEngineEmission(mixed, particlePhotopicYCdPerM3[index] * absorptionPerMeter + (chPowerDensityWPerM3[index] * chXyz[1] + c2PowerDensityWPerM3[index] * spatial.excitedSpecies.c2.xyzLumensPerWatt[1]) / (4 * Math.PI));
		for (let c = 0; c < 3; c++) {
			rgba[index * 4 + c] = source[c];
			maxSourceCdPerM3 = Math.max(maxSourceCdPerM3, rgba[index * 4 + c]);
			isotropicIntensityRgbCd[c] += rgba[index * 4 + c] * volumeWeightsM3[index];
			exteriorIsotropicIntensityRgbCd[c] += rgba[index * 4 + c] * exteriorVolumeWeightsM3[index];
		}
	}
	if (![
		emittingVolumeM3,
		fuelPowerW,
		absorptionPerMeter,
		particlePowerUpperBoundW,
		excitedPowerW,
		maxSourceCdPerM3,
		maxAbsorptionPerMeter,
		...isotropicIntensityRgbCd
	].every(Number.isFinite) || emittingVolumeM3 <= 0) return zero;
	return {
		valid: true,
		mode,
		fuelPowerW,
		emittingVolumeM3,
		absorptionPerMeter,
		particlePowerUpperBoundW,
		excitedPowerW,
		totalSourcePowerUpperBoundW: particlePowerUpperBoundW + excitedPowerW,
		allowedPowerW: fuelPowerW * (parameters.particleFuelPowerFraction + parameters.excitedFuelPowerFraction) + parcelChPowerW,
		absorptionWasCapped: absorptionPerMeter < parameters.absorptionPerMeter,
		blackbodyRgbCdPerM2: interpolateAbsoluteEmission(data.blackbody, sourceBoundaryTemperatureKelvin) ?? [
			0,
			0,
			0
		],
		sourceRgbCdPerM3: isotropicIntensityRgbCd.map((v) => v / emittingVolumeM3),
		isotropicIntensityRgbCd,
		exteriorIsotropicIntensityRgbCd,
		temperatureMeaning: corrected ? "imposed-native-gas-bath-proxy" : "legacy-static-exit-hypothesis",
		chemistryStatus: parcelData ? "surrogate-parcel" : corrected ? "unavailable" : "legacy-imposed",
		reactionInputWasClamped: parcel?.inputWasClamped,
		reactionDomainResolved,
		sourceBoundaryTemperatureKelvin,
		...corrected ? {} : { staticExitTemperatureKelvin: sourceBoundaryTemperatureKelvin },
		chPowerW,
		c2PowerW,
		field: {
			width,
			height,
			rgba,
			radiusExpansionRatio,
			axialDistanceRangeMeters: domain.axialDistanceRangeMeters,
			sections: domain.sections,
			maxSourceCdPerM3,
			maxAbsorptionPerMeter,
			particleTemperatureKelvin,
			particleSourceRgbCdPerM3,
			chSourceRgbCdPerM3,
			c2SourceRgbCdPerM3,
			particlePowerDensityWPerM3,
			chPowerDensityWPerM3,
			c2PowerDensityWPerM3,
			volumeWeightsM3,
			exteriorVolumeWeightsM3
		}
	};
}
/** XYZ → signed linear sRGB: retain out-of-gamut contributions until mixed. */
function signedLinearRgbFromXyz(xyz) {
	return [
		3.2404542 * xyz[0] - 1.5371385 * xyz[1] - .4985314 * xyz[2],
		-.969266 * xyz[0] + 1.8760108 * xyz[1] + .041556 * xyz[2],
		.0556434 * xyz[0] - .2040259 * xyz[1] + 1.0572252 * xyz[2]
	];
}
/** Apply once after local spectral components mix, preserving their photopic Y. */
function gamutMapEngineEmission(rgb, photopicY) {
	const clipped = rgb.map((v) => Math.max(0, v));
	const y = .2126729 * clipped[0] + .7151522 * clipped[1] + .072175 * clipped[2];
	return clipped.map((v) => y > 0 ? v * photopicY / y : 0);
}
/** Match the renderer's endpoint-aligned manual bilinear field sampling. */
function sampleEngineGasField(result, axialFraction, radialFraction) {
	const field = result.field;
	const zero = {
		inside: false,
		sourceRgbCdPerM3: [
			0,
			0,
			0
		],
		absorptionPerMeter: 0,
		particleTemperatureKelvin: 0,
		particleSourceRgbCdPerM3: [
			0,
			0,
			0
		],
		chSourceRgbCdPerM3: [
			0,
			0,
			0
		],
		c2SourceRgbCdPerM3: [
			0,
			0,
			0
		],
		particlePowerDensityWPerM3: 0,
		chPowerDensityWPerM3: 0,
		c2PowerDensityWPerM3: 0
	};
	if (!field || !Number.isFinite(axialFraction) || !Number.isFinite(radialFraction) || axialFraction < 0 || axialFraction > 1 || radialFraction < 0 || radialFraction > 1) return zero;
	const [lo, hi] = field.axialDistanceRangeMeters;
	const section = sampleEngineGasFlowSection(field, lo + axialFraction * (hi - lo));
	if (radialFraction * section.radiusMeters < section.innerRadiusMeters) return zero;
	const x = axialFraction * (field.width - 1), y = radialFraction * (field.height - 1);
	const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, field.width - 1), y1 = Math.min(y0 + 1, field.height - 1);
	const fx = x - x0, fy = y - y0;
	const sample = (array, stride, c) => (1 - fy) * ((1 - fx) * array[(y0 * field.width + x0) * stride + c] + fx * array[(y0 * field.width + x1) * stride + c]) + fy * ((1 - fx) * array[(y1 * field.width + x0) * stride + c] + fx * array[(y1 * field.width + x1) * stride + c]);
	return {
		inside: true,
		sourceRgbCdPerM3: [
			0,
			1,
			2
		].map((c) => sample(field.rgba, 4, c)),
		absorptionPerMeter: sample(field.rgba, 4, 3),
		particleTemperatureKelvin: sample(field.particleTemperatureKelvin, 1, 0),
		particleSourceRgbCdPerM3: [
			0,
			1,
			2
		].map((c) => sample(field.particleSourceRgbCdPerM3, 3, c)),
		chSourceRgbCdPerM3: [
			0,
			1,
			2
		].map((c) => sample(field.chSourceRgbCdPerM3, 3, c)),
		c2SourceRgbCdPerM3: [
			0,
			1,
			2
		].map((c) => sample(field.c2SourceRgbCdPerM3, 3, c)),
		particlePowerDensityWPerM3: sample(field.particlePowerDensityWPerM3, 1, 0),
		chPowerDensityWPerM3: sample(field.chPowerDensityWPerM3, 1, 0),
		c2PowerDensityWPerM3: sample(field.c2PowerDensityWPerM3, 1, 0)
	};
}
//#endregion
//#region src/flight/aircraft/generated/f135EngineData.ts
const F135_ENGINE_GEOMETRY = {
	"profileId": "f135-pw600-rigid-aperture-v2",
	"attachment": [
		0,
		2.18165447,
		2.86385
	],
	"circumferentialSegments": 96,
	"petals": 16,
	"bearingTiltDegrees": 23.75,
	"forwardBearingLength": .28,
	"middleBearingLength": .48,
	"ductInnerRadius": .5,
	"ductOuterRadius": .53,
	"nozzleLength": .55,
	"closedThroatRadius": .35,
	"openThroatRadius": .44,
	"closedExitRadius": .4,
	"openExitRadius": .565,
	"inletRadius": .545,
	"inletStation": -3.85,
	"coreFacingAnnulusStation": -.38,
	"coreFacingAnnulusInnerRadius": .28,
	"coreFacingAnnulusOuterRadius": .47,
	"aftBearingLength": .28,
	"aperture": {
		"kind": "rigid-cd-flaps-v1",
		"segmentCount": 16,
		"inletRadius": .5,
		"convergentLength": .3,
		"divergentLength": .3,
		"closedConvergentRad": .5235987755982989,
		"openConvergentRad": .2013579207903308,
		"closedDivergentRad": .16744807921968935,
		"openDivergentRad": .4297754313045277,
		"convergentSealLength": .295,
		"divergentSealLength": .315,
		"fairingBaseRadius": .55,
		"fairingBaseZ": .018,
		"fairingLength": .585,
		"flapThicknessMeters": .002,
		"sealThicknessMeters": 7e-4,
		"materialDensityKgM3": 8200,
		"sealHalfWidth": .05,
		"convergentBaseHalfWidth": .082,
		"convergentTipHalfWidth": .06,
		"divergentBaseHalfWidth": .058,
		"divergentTipHalfWidth": .07,
		"fairingBaseHalfWidth": .09,
		"fairingTipHalfWidth": .071,
		"fairingThicknessMeters": .0015,
		"fairingSealHalfWidth": .062,
		"fairingSealLength": .6,
		"fairingFollowerNormalOffset": .025,
		"throatShoeLength": .02,
		"fairingSlotStart": .518,
		"fairingSlotEnd": .568,
		"fairingSlotHalfWidth": .007
	},
	"assets": [
		{
			"variant": "full",
			"path": "aircraft/f-35b/engine/F135-PW-600-full.glb",
			"triangles": 24024,
			"bytes": 1864272,
			"sha256": "0fc8083a3a4d5d5d76946ea3602d4a23ebc508e58301145e489c59c1801ff71f"
		},
		{
			"variant": "installed",
			"path": "aircraft/f-35b/engine/F135-PW-600-installed.glb",
			"triangles": 12592,
			"bytes": 1037840,
			"sha256": "4e7d837e2ab5303ab9d90a3b3321baa469e5fc204acad7e0b2f59185990aa341"
		},
		{
			"variant": "airframe",
			"path": "aircraft/f-35b/F-35B_AF267-airframe.glb",
			"triangles": 11467,
			"bytes": 1444788,
			"sha256": "76c76d6230fcf3259e2552d793f95f5421a2ab3cc35f39a5ebf01817b38d5814"
		}
	]
};
//#endregion
//#region src/flight/aircraft/engineGasSupport.ts
const add = (a, b) => [
	a[0] + b[0],
	a[1] + b[1],
	a[2] + b[2]
];
const subtract = (a, b) => [
	a[0] - b[0],
	a[1] - b[1],
	a[2] - b[2]
];
const scale = (a, n) => [
	a[0] * n,
	a[1] * n,
	a[2] * n
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0]
];
const mix = (a, b, t) => add(a, scale(subtract(b, a), t));
const norm = (a) => Math.hypot(...a);
const normalize = (a) => scale(a, 1 / norm(a));
const vector = (v) => [
	v.x,
	v.y,
	v.z
];
const ring = (z, radius, angle = 0, center) => ({
	center: center ?? [
		0,
		0,
		z
	],
	radialU: [
		Math.cos(angle),
		0,
		-Math.sin(angle)
	],
	radialV: [
		0,
		1,
		0
	],
	radiusMeters: radius
});
const g = F135_ENGINE_GEOMETRY, beta = g.bearingTiltDegrees * Math.PI / 180;
/**
* These stations describe the retained original mesh, not measured engine stations.
* The opaque centrebody ends at −0.08 m; its finite last ring is represented by
* a radius discontinuity at that station, not invented glowing gas inside metal.
*/
const F135_ENGINE_GAS_SUPPORT = {
	rootNode: "F135_Engine",
	nozzleNode: "F135_Nozzle",
	nozzleInletRadiusMeters: g.aperture.inletRadius,
	nozzleSegmentCount: g.aperture.segmentCount,
	nozzleSealHalfWidthMeters: g.aperture.sealHalfWidth,
	ducts: [
		{
			id: "augmentor",
			attachmentNode: "F135_Engine",
			start: ring(-.75, g.ductInnerRadius),
			end: ring(0, g.ductInnerRadius),
			innerRadiusKnots: [
				[0, .29],
				[.32 / .75, .26],
				[.6 / .75, .15],
				[.67 / .75, .015],
				[.67 / .75, 0],
				[1, 0]
			]
		},
		{
			id: "forward-duct",
			attachmentNode: "F135_Bearing1",
			start: ring(0, g.ductInnerRadius),
			end: ring(g.forwardBearingLength, g.ductInnerRadius, beta)
		},
		{
			id: "middle-duct",
			attachmentNode: "F135_Bearing2",
			start: ring(0, g.ductInnerRadius),
			end: ring(0, g.ductInnerRadius, -2 * beta, [
				-Math.sin(beta) * g.middleBearingLength,
				0,
				Math.cos(beta) * g.middleBearingLength
			])
		},
		{
			id: "aft-duct",
			attachmentNode: "F135_Bearing3",
			start: ring(0, g.ductInnerRadius),
			end: ring(0, g.ductInnerRadius, beta, [
				Math.sin(beta) * g.aftBearingLength,
				0,
				Math.cos(beta) * g.aftBearingLength
			])
		}
	]
};
function gasSupportInnerRadius(section, fraction) {
	const knots = section.innerRadiusKnots;
	if (!knots.length) return 0;
	for (let i = knots.length - 1; i >= 0; i--) if (fraction >= knots[i][0]) {
		if (i === knots.length - 1) return knots[i][1];
		const next = knots[i + 1], t = (fraction - knots[i][0]) / (next[0] - knots[i][0]);
		return knots[i][1] + t * (next[1] - knots[i][1]);
	}
	return knots[0][1];
}
/** Forward map used by independent continuity and volume diagnostics. */
function engineGasSectionPoint(section, fraction, radialFraction, angle) {
	const radius = section.startRadius + fraction * (section.endRadius - section.startRadius);
	return add(mix(section.startCenter, section.endCenter, fraction), scale(add(scale(mix(section.startU, section.endU, fraction), Math.cos(angle)), scale(section.radialV, Math.sin(angle))), radius * radialFraction));
}
/** Exact inverse of the authored ruled circular bearing lofts. No straight-cylinder substitution. */
function sampleEngineGasSection(section, point, segmentCount = 16, sealHalfWidth = .05) {
	const p = subtract(point, section.startCenter), d = subtract(section.endCenter, section.startCenter), du = subtract(section.endU, section.startU);
	const cross2 = (a, b) => dot(cross(a, b), section.radialV);
	const a = -cross2(d, du), b = cross2(p, du) - cross2(d, section.startU), c = cross2(p, section.startU);
	let roots;
	if (Math.abs(a) < 1e-12 * Math.max(1, Math.abs(b))) roots = Math.abs(b) > 1e-14 ? [-c / b] : [];
	else {
		const discriminant = b * b - 4 * a * c;
		if (discriminant < 0) return null;
		const q = -.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(discriminant));
		roots = [q / a, q === 0 ? -b / (2 * a) : c / q];
	}
	for (const value of roots) {
		const endTolerance = 1e-6 / Math.max(norm(d), 1e-6);
		if (value < -endTolerance || value > 1 + endTolerance) continue;
		const fraction = Math.max(0, Math.min(1, value)), u = mix(section.startU, section.endU, fraction), relative = subtract(p, scale(d, fraction));
		const x = dot(relative, u) / dot(u, u), y = dot(relative, section.radialV), radius = section.startRadius + fraction * (section.endRadius - section.startRadius), r = Math.hypot(x, y);
		if (r > radius + 1e-7 || r < gasSupportInnerRadius(section, fraction) - 1e-7) continue;
		if (section.nozzleSealClip) {
			const half = Math.PI / segmentCount, sealRadius = (radius - sealHalfWidth * Math.sin(half)) / Math.cos(half);
			const step = 2 * half, angle = Math.atan2(y, x) - half, wrapped = angle - step * Math.round(angle / step);
			if (r * Math.cos(wrapped) > sealRadius + 1e-7) continue;
		}
		return {
			fraction,
			distanceMeters: section.startDistance + fraction * (section.endDistance - section.startDistance),
			radialFraction: r / radius,
			radiusMeters: radius
		};
	}
	return null;
}
function sampleEngineGasSupport(support, point) {
	for (let index = 0; index < support.sections.length; index++) {
		const sample = sampleEngineGasSection(support.sections[index], point, support.nozzleSegmentCount, support.nozzleSealHalfWidthMeters);
		if (sample) return {
			sectionIndex: index,
			...sample
		};
	}
	return null;
}
/** Circular loft volume minus the centrebody; conservative seal clips only reduce it. */
function engineGasSectionVolume(section) {
	const length = section.endDistance - section.startDistance;
	const knots = section.innerRadiusKnots.length ? section.innerRadiusKnots : [[0, 0], [1, 0]];
	let volume = 0;
	for (let i = 0; i < knots.length - 1; i++) {
		const [begin, innerBegin] = knots[i], [end, innerEnd] = knots[i + 1];
		for (const u of [.5 - .5 / Math.sqrt(3), .5 + .5 / Math.sqrt(3)]) {
			const t = begin + u * (end - begin), radius = section.startRadius + t * (section.endRadius - section.startRadius), innerRadius = innerBegin + u * (innerEnd - innerBegin);
			volume += Math.PI * (radius * radius - innerRadius * innerRadius) * (section.startAreaFactor + t * (section.endAreaFactor - section.startAreaFactor)) * length * (end - begin) / 2;
		}
	}
	return volume;
}
/** Read live rigid transforms without writing any aircraft node or geometry. */
function bindEngineGasSupport(root, definition) {
	if (root.name !== definition.rootNode) throw new Error(`Gas support needs ${definition.rootNode}`);
	const nodes = [root, ...root.getDescendants(false)], resolve = (name) => {
		const node = nodes.find((candidate) => candidate.name === name);
		if (!node) throw new Error(`Gas support is missing ${name}`);
		return node;
	};
	const frames = /* @__PURE__ */ new Map();
	const frameFor = (node) => {
		let frame = frames.get(node);
		if (!frame) {
			frame = {
				node,
				matrix: Matrix.Identity(),
				accepted: Matrix.Identity()
			};
			frames.set(node, frame);
		}
		return frame;
	};
	const ducts = definition.ducts.map((duct) => ({
		duct,
		frame: frameFor(resolve(duct.attachmentNode))
	}));
	const nozzle = frameFor(resolve(definition.nozzleNode));
	const boundFrames = [...frames.values()];
	const localMatrix = Matrix.Identity(), eulerRotation = Quaternion.Identity();
	let revision = 0, cached;
	let lastThroatRadius = NaN, lastThroatZ = NaN, lastExitRadius = NaN, lastExitZ = NaN;
	let lastLength = NaN, lastSlope = NaN;
	return {
		root,
		update(aperture, exteriorLengthMeters, spreadingSlope) {
			if (!Number.isFinite(exteriorLengthMeters) || !(exteriorLengthMeters > 0) || !Number.isFinite(spreadingSlope) || !(spreadingSlope >= 0)) throw new Error("Gas support needs finite positive exterior length and nonnegative spreading");
			const rootWorld = root.computeWorldMatrix(true).m, metresPerUnit = Math.hypot(rootWorld[0], rootWorld[1], rootWorld[2]);
			if (!Number.isFinite(metresPerUnit) || Math.abs(metresPerUnit - 1) > 1e-5) throw new Error("Authored F135 gas support requires metre-scale engine geometry");
			let changed = !cached || aperture.throatRadius !== lastThroatRadius || aperture.throatZ !== lastThroatZ || aperture.exitRadius !== lastExitRadius || aperture.exitZ !== lastExitZ || exteriorLengthMeters !== lastLength || spreadingSlope !== lastSlope;
			for (const frame of boundFrames) {
				Matrix.IdentityToRef(frame.matrix);
				let current = frame.node;
				while (current !== root) {
					const rotation = current.rotationQuaternion ?? Quaternion.FromEulerVectorToRef(current.rotation, eulerRotation);
					Matrix.ComposeToRef(current.scaling, rotation, current.position, localMatrix);
					frame.matrix.multiplyToRef(localMatrix, frame.matrix);
					if (!current.parent) throw new Error("Gas support node is outside its engine root");
					current = current.parent;
				}
				if (!frame.matrix.equals(frame.accepted)) changed = true;
			}
			if (!changed) return cached;
			const transformRing = (matrix, value) => {
				return {
					center: vector(Vector3.TransformCoordinates(Vector3.FromArray(value.center), matrix)),
					u: normalize(vector(Vector3.TransformNormal(Vector3.FromArray(value.radialU), matrix))),
					v: normalize(vector(Vector3.TransformNormal(Vector3.FromArray(value.radialV), matrix))),
					radius: value.radiusMeters
				};
			};
			const definitions = [
				...ducts,
				{
					frame: nozzle,
					duct: {
						id: "convergent",
						attachmentNode: definition.nozzleNode,
						start: ring(0, definition.nozzleInletRadiusMeters),
						end: ring(aperture.throatZ, aperture.throatRadius)
					}
				},
				{
					frame: nozzle,
					duct: {
						id: "divergent",
						attachmentNode: definition.nozzleNode,
						start: ring(aperture.throatZ, aperture.throatRadius),
						end: ring(aperture.exitZ, aperture.exitRadius)
					}
				},
				{
					frame: nozzle,
					duct: {
						id: "exterior",
						attachmentNode: definition.nozzleNode,
						start: ring(aperture.exitZ, aperture.exitRadius),
						end: ring(aperture.exitZ + exteriorLengthMeters, aperture.exitRadius + spreadingSlope * exteriorLengthMeters)
					}
				}
			];
			const sections = [];
			let distance = 0;
			for (const { frame, duct } of definitions) {
				const start = transformRing(frame.matrix, duct.start), end = transformRing(frame.matrix, duct.end);
				const d = subtract(duct.end.center, duct.start.center), length = norm(d);
				if (dot(start.v, end.v) < .999999 || length <= 0) throw new Error("Gas support requires shared ring V and positive section length");
				sections.push({
					id: duct.id,
					startCenter: start.center,
					endCenter: end.center,
					startU: start.u,
					endU: end.u,
					radialV: start.v,
					startRadius: start.radius,
					endRadius: end.radius,
					startDistance: distance,
					endDistance: distance + length,
					startAreaFactor: dot(d, cross(duct.start.radialU, duct.start.radialV)) / length,
					endAreaFactor: dot(d, cross(duct.end.radialU, duct.end.radialV)) / length,
					innerRadiusKnots: "innerRadiusKnots" in duct ? duct.innerRadiusKnots ?? [] : [],
					nozzleSealClip: duct.id === "convergent" || duct.id === "divergent"
				});
				distance += length;
			}
			const exitDistance = sections.at(-1).startDistance;
			for (const section of sections) {
				section.startDistance -= exitDistance;
				section.endDistance -= exitDistance;
			}
			const knots = [];
			for (const section of sections) {
				const inner = section.innerRadiusKnots.length ? section.innerRadiusKnots : [[0, 0], [1, 0]];
				for (const [t, innerRadiusMeters] of inner) {
					const knot = {
						distanceMeters: section.startDistance + t * (section.endDistance - section.startDistance),
						radiusMeters: section.startRadius + t * (section.endRadius - section.startRadius),
						innerRadiusMeters,
						areaFactor: section.startAreaFactor + t * (section.endAreaFactor - section.startAreaFactor)
					};
					const prior = knots.at(-1);
					if (!prior || prior.distanceMeters !== knot.distanceMeters || prior.radiusMeters !== knot.radiusMeters || prior.innerRadiusMeters !== knot.innerRadiusMeters || prior.areaFactor !== knot.areaFactor) knots.push(knot);
				}
			}
			const min = [
				Infinity,
				Infinity,
				Infinity
			], max = [
				-Infinity,
				-Infinity,
				-Infinity
			];
			for (const section of sections) for (const [center, u, radius] of [[
				section.startCenter,
				section.startU,
				section.startRadius
			], [
				section.endCenter,
				section.endU,
				section.endRadius
			]]) for (let i = 0; i < 3; i++) {
				const extent = radius * Math.hypot(u[i], section.radialV[i]);
				min[i] = Math.min(min[i], center[i] - extent);
				max[i] = Math.max(max[i], center[i] + extent);
			}
			for (const frame of boundFrames) frame.accepted.copyFrom(frame.matrix);
			lastThroatRadius = aperture.throatRadius;
			lastThroatZ = aperture.throatZ;
			lastExitRadius = aperture.exitRadius;
			lastExitZ = aperture.exitZ;
			lastLength = exteriorLengthMeters;
			lastSlope = spreadingSlope;
			cached = {
				revision: ++revision,
				sections,
				flowDomain: {
					axialDistanceRangeMeters: [sections[0].startDistance, sections.at(-1).endDistance],
					sections: knots
				},
				bounds: {
					min,
					max
				},
				nozzleSegmentCount: definition.nozzleSegmentCount,
				nozzleSealHalfWidthMeters: definition.nozzleSealHalfWidthMeters
			};
			return cached;
		}
	};
}
//#endregion
//#region src/flight/aircraft/engineNozzleRig.ts
const X = new Vector3(1, 0, 0), Z = new Vector3(0, 0, 1);
function nozzleApertureGeometry(command, p) {
	const u = Number.isFinite(command) ? Math.max(0, Math.min(1, command)) : 0;
	const convergent = p.closedConvergentRad + (p.openConvergentRad - p.closedConvergentRad) * u;
	const divergent = p.closedDivergentRad + (p.openDivergentRad - p.closedDivergentRad) * u;
	const throatRadius = p.inletRadius - p.convergentLength * Math.sin(convergent);
	const throatZ = p.convergentLength * Math.cos(convergent);
	const exitRadius = throatRadius + p.divergentLength * Math.sin(divergent);
	const exitZ = throatZ + p.divergentLength * Math.cos(divergent);
	const half = Math.PI / p.segmentCount;
	const sealRadius = (radius) => (radius - p.sealHalfWidth * Math.sin(half)) / Math.cos(half);
	const area = (radius) => {
		const r = sealRadius(radius), h = p.sealHalfWidth, step = 2 * half;
		return p.segmentCount * (r * h * (1 - Math.cos(step)) + (r * r - h * h) * Math.sin(step) / 2);
	};
	const fairingAngle = Math.atan2(exitRadius + p.fairingFollowerNormalOffset * Math.cos(divergent) - p.fairingBaseRadius, exitZ - p.fairingFollowerNormalOffset * Math.sin(divergent) - p.fairingBaseZ);
	return {
		convergent,
		divergent,
		throatRadius,
		throatZ,
		exitRadius,
		exitZ,
		throatArea: area(throatRadius),
		exitArea: area(exitRadius),
		sealBaseRadius: sealRadius(p.inletRadius),
		sealThroatRadius: sealRadius(throatRadius),
		sealConvergent: Math.atan(Math.tan(convergent) / Math.cos(half)),
		sealDivergent: Math.atan(Math.tan(divergent) / Math.cos(half)),
		fairingAngle,
		fairingSealAngle: Math.atan(Math.tan(fairingAngle) / Math.cos(half)),
		fairingSealBaseRadius: (p.fairingBaseRadius - p.fairingSealHalfWidth * Math.sin(half)) / Math.cos(half)
	};
}
/** Two inclined circular joints with counter-rotation; the first bearing supplies yaw. */
function threeBearingAngles(pitch, yaw, beta) {
	const middle = 2 * Math.asin(Math.min(1, Math.max(0, Math.sin(pitch / 4) / Math.sin(beta))));
	const compensation = Math.atan2(Math.cos(beta) * Math.sin(middle / 2), Math.cos(middle / 2));
	return [
		-yaw - compensation,
		middle,
		-middle
	];
}
function bindEngineNozzleRig(nodes, definition) {
	const bearings = definition.bearingNames.map((name) => nodes.find((node) => node.name === name));
	if (bearings.some((node) => !node)) throw new Error("Engine asset is missing a declared swivel bearing");
	const parts = bearings.map((node) => ({
		node,
		rest: node.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(node.rotation)
	}));
	const profile = definition.apertureMechanism;
	const required = (name) => {
		const node = nodes.find((candidate) => candidate.name === name);
		if (!node) throw new Error(`Engine asset is missing rigid nozzle part ${name}`);
		return node;
	};
	const apertureParts = Array.from({ length: profile.segmentCount }, (_, index) => {
		const theta = index * 2 * Math.PI / profile.segmentCount;
		return [
			"Convergent",
			"Divergent",
			"ConvergentSeal",
			"DivergentSeal",
			"ConvergentSealShoe",
			"Fairing",
			"FairingSeal"
		].map((role) => {
			const angle = theta + (role.includes("Seal") ? Math.PI / profile.segmentCount : 0);
			return {
				role,
				node: required(`F135_${role}_${String(index + 1).padStart(2, "0")}`),
				cos: Math.cos(angle),
				sin: Math.sin(angle),
				azimuth: Quaternion.RotationAxis(Z, angle - Math.PI / 2)
			};
		});
	}).flat();
	const exhaust = required("F135_Exhaust");
	let geometry = nozzleApertureGeometry(0, profile);
	let lastPitch = NaN, lastYaw = NaN, lastAperture = NaN;
	return {
		update(pitch, yaw, aperture) {
			if (pitch !== void 0 && yaw !== void 0 && Number.isFinite(pitch) && Number.isFinite(yaw) && (pitch !== lastPitch || yaw !== lastYaw)) {
				const angles = threeBearingAngles(pitch, yaw, definition.bearingInclinationRad);
				for (let i = 0; i < parts.length; i++) parts[i].node.rotationQuaternion = parts[i].rest.multiply(Quaternion.RotationAxis(Z, angles[i]));
				lastPitch = pitch;
				lastYaw = yaw;
			}
			if (aperture !== void 0 && Number.isFinite(aperture)) {
				const bounded = Math.max(0, Math.min(1, aperture));
				if (bounded === lastAperture) return;
				geometry = nozzleApertureGeometry(bounded, profile);
				for (const part of apertureParts) {
					let radius, z, angle;
					switch (part.role) {
						case "Convergent":
							radius = profile.inletRadius;
							z = 0;
							angle = geometry.convergent;
							break;
						case "Divergent":
							radius = geometry.throatRadius;
							z = geometry.throatZ;
							angle = -geometry.divergent;
							break;
						case "ConvergentSeal":
							radius = geometry.sealBaseRadius;
							z = 0;
							angle = geometry.sealConvergent;
							break;
						case "ConvergentSealShoe":
							radius = geometry.sealThroatRadius;
							z = geometry.throatZ;
							angle = geometry.sealConvergent;
							break;
						case "DivergentSeal":
							radius = geometry.sealThroatRadius;
							z = geometry.throatZ;
							angle = -geometry.sealDivergent;
							break;
						case "FairingSeal":
							radius = geometry.fairingSealBaseRadius;
							z = profile.fairingBaseZ;
							angle = -geometry.fairingSealAngle;
							break;
						case "Fairing":
							radius = profile.fairingBaseRadius;
							z = profile.fairingBaseZ;
							angle = -geometry.fairingAngle;
							break;
					}
					part.node.position.set(radius * part.cos, radius * part.sin, z);
					part.node.rotationQuaternion = part.azimuth.multiply(Quaternion.RotationAxis(X, angle));
				}
				exhaust.position.z = geometry.exitZ;
				lastAperture = bounded;
			}
		},
		partCount: apertureParts.length,
		get apertureGeometry() {
			return geometry;
		}
	};
}
//#endregion
export { DEFAULT_ENGINE_GAS_AXIAL_SAMPLES, DEFAULT_ENGINE_GAS_RADIAL_SAMPLES, F135_ENGINE_GAS_SUPPORT, F135_ENGINE_GEOMETRY, bindEngineGasSupport, bindEngineNozzleRig, engineGasSectionPoint, engineGasSectionVolume, engineGasSupportLength, evaluateEngineGasOptics, gamutMapEngineEmission, gasFieldVolumeWeights, gasFlowFieldVolumeWeights, gasSupportInnerRadius, integrateGasSegment, interpolateAbsoluteEmission, interpolateGasBlackbody, sampleEngineGasField, sampleEngineGasFlowSection, sampleEngineGasSection, sampleEngineGasSupport, sampleGasSpatialBasis, signedLinearRgbFromXyz, validEngineGasFlowDomain, validateEngineGasOpticalData };
