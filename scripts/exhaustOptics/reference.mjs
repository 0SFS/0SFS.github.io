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
