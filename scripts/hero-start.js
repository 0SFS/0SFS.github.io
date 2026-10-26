// Reposition a frozen starting flight without advancing its engine or simulation clock.
export function startGroundKey(scene) {
  return [scene.latitude, scene.longitude, scene.heightAboveGroundMeters].join('/');
}

export function flightAtStart(template, scene, ground) {
  const initial = { ...template.simulation.initial };
  const turn = (scene.headingDegrees - initial['ic/psi-true-deg']) * Math.PI / 180;
  const north = initial['ic/vn-fps'], east = initial['ic/ve-fps'];
  Object.assign(initial, {
    'ic/lat-geod-deg': scene.latitude, 'ic/long-gc-deg': scene.longitude,
    'ic/psi-true-deg': scene.headingDegrees,
    'ic/h-sl-ft': ground.altitudeMeters / .3048,
    'ic/terrain-elevation-ft': ground.groundHeightMeters / .3048,
    'ic/vn-fps': north * Math.cos(turn) - east * Math.sin(turn),
    'ic/ve-fps': north * Math.sin(turn) + east * Math.cos(turn),
  });
  return { ...template, latDeg: scene.latitude, lonDeg: scene.longitude,
    headingDeg: scene.headingDegrees, altMeters: ground.altitudeMeters,
    aboveGroundMeters: ground.altitudeMeters - ground.groundHeightMeters,
    simulation: { ...template.simulation, initial } };
}
