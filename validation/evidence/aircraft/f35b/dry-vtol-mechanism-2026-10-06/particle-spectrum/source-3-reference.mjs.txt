// Independent test/reference path: frequency-form Planck law and quarter-nm
// trapezoidal integration of linearly interpolated official CIE observations.
// This does not call the production Planck, XYZ or RGB integration functions.
export function referenceRadiance(wavelengthNm, temperatureK) {
  const frequency = 299792458 / (wavelengthNm * 1e-9);
  const photonEnergy = 6.62607015e-34 * frequency;
  const perHertz = 2 * photonEnergy * frequency ** 2 / 299792458 ** 2
    / (Math.exp(photonEnergy / (1.380649e-23 * temperatureK)) - 1);
  return perHertz * frequency ** 2 / 299792458;
}
export function referencePhotometricRgb(observer, temperatureK, emissivity = 1) {
  const xyz = [0, 0, 0];
  const stepNm = 0.25;
  for (let index = 0; index <= 470 / stepNm; index++) {
    const nm = 360 + index * stepNm, position = nm - 360;
    const low = Math.floor(position), high = Math.min(470, low + 1), f = position - low;
    const endpoint = index === 0 || index === 470 / stepNm ? 0.5 : 1;
    const radiance = referenceRadiance(nm, temperatureK) * emissivity * 683 * stepNm * 1e-9 * endpoint;
    for (let channel = 0; channel < 3; channel++) xyz[channel] += radiance
      * (observer[low][channel + 1] * (1 - f) + observer[high][channel + 1] * f);
  }
  const rgb = [[3.2404542, -1.5371385, -0.4985314], [-0.969266, 1.8760108, 0.041556],
    [0.0556434, -0.2040259, 1.0572252]].map(row => Math.max(0, row.reduce((sum, v, i) => sum + v * xyz[i], 0)));
  const y = luminance(rgb);
  return rgb.map(value => y > 0 ? value * xyz[1] / y : 0);
}
export function luminance(rgb) { return 0.2126729 * rgb[0] + 0.7151522 * rgb[1] + 0.072175 * rgb[2]; }

/** Independent quarter-nm frequency-Planck integration; no production XYZ helper. */
export function referenceParticleXyz(observer, temperatureK, exponent, referenceNm = 550) {
  const xyz = [0, 0, 0], step = .25;
  for (let i = 0; i <= 470 / step; i++) {
    const nm = 360 + i * step, position = nm - 360, low = Math.floor(position), high = Math.min(470, low + 1);
    const f = position - low, endpoint = i === 0 || i === 470 / step ? .5 : 1;
    const radiance = referenceRadiance(nm, temperatureK) * (referenceNm / nm) ** exponent * 683 * step * 1e-9 * endpoint;
    for (let channel = 0; channel < 3; channel++) xyz[channel] += radiance
      * (observer[low][channel + 1] * (1 - f) + observer[high][channel + 1] * f);
  }
  return xyz;
}

/** Integrate direct frequency radiance on a logarithmic grid, independent of the bake's dimensionless moment. */
export function referenceParticlePlanckMean(temperatureK, exponent, referenceNm = 550) {
  const low = Math.log(1e6), high = Math.log(1e18), count = 32768, step = (high - low) / count;
  let radiance = 0;
  for (let i = 0; i <= count; i++) {
    const frequency = Math.exp(low + i * step), x = 6.62607015e-34 * frequency / (1.380649e-23 * temperatureK);
    const perHertz = 2 * 6.62607015e-34 * frequency ** 3 / 299792458 ** 2 / Math.expm1(x);
    const spectralOpacity = (referenceNm * 1e-9 * frequency / 299792458) ** exponent;
    radiance += perHertz * spectralOpacity * frequency * (i === 0 || i === count ? .5 : 1) * step;
  }
  return radiance / (5.670374419e-8 * temperatureK ** 4 / Math.PI);
}
