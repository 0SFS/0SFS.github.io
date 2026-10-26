// Shared by capture, the injected editor and its tests. Camera angles are relative to the aircraft.
export function cameraAt(camera, seconds, duration) {
  const points = camera.keyframes;
  if (camera.mode !== 'manual' || !points?.length) return {
    yawDegrees: camera.orbitDegrees + (camera.mode === 'manual' ? 0 : (camera.orbitEndDegrees - camera.orbitDegrees) * seconds / duration),
    pitchDegrees: Math.atan2(camera.heightMeters, camera.distanceMeters) * 180 / Math.PI,
    distanceMeters: camera.distanceMeters,
    fieldOfViewDegrees: camera.fieldOfViewDegrees,
  };
  if (seconds <= points[0].timeSeconds) return { ...points[0] };
  const end = points.findIndex(point => point.timeSeconds >= seconds);
  if (end < 0) return { ...points.at(-1) };
  const a = points[end - 1], b = points[end];
  const u = (seconds - a.timeSeconds) / (b.timeSeconds - a.timeSeconds);
  // Take the short route across ±180°. Dense recorded samples retain full turns.
  const turn = ((b.yawDegrees - a.yawDegrees + 540) % 360) - 180;
  return {
    yawDegrees: a.yawDegrees + turn * u,
    pitchDegrees: a.pitchDegrees + (b.pitchDegrees - a.pitchDegrees) * u,
    distanceMeters: a.distanceMeters + (b.distanceMeters - a.distanceMeters) * u,
    fieldOfViewDegrees: a.fieldOfViewDegrees + (b.fieldOfViewDegrees - a.fieldOfViewDegrees) * u,
  };
}

export function validateCamera(camera, duration) {
  const inRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  if (camera.mode !== undefined && !['scripted', 'manual'].includes(camera.mode)) throw new Error('Invalid camera mode.');
  if (!inRange(camera.distanceMeters, 8, 500) || !inRange(camera.heightMeters, 0, 30)
    || !inRange(camera.orbitDegrees, -180, 180) || !inRange(camera.orbitEndDegrees, -180, 180)
    || !inRange(camera.fieldOfViewDegrees, 25, 100)) throw new Error('Invalid chase camera.');
  if (camera.keyframes !== undefined) {
    if (!Array.isArray(camera.keyframes) || camera.keyframes.length > 901) throw new Error('Invalid camera path.');
    let previous = -1;
    for (const point of camera.keyframes) {
      if (!inRange(point.timeSeconds, 0, duration) || point.timeSeconds <= previous
        || !inRange(point.yawDegrees, -180, 180) || !inRange(point.pitchDegrees, -60, 81)
        || !inRange(point.distanceMeters, 8, 500) || !inRange(point.fieldOfViewDegrees, 25, 100)) throw new Error('Invalid camera keyframe.');
      previous = point.timeSeconds;
    }
  }
}

export function putCameraPoint(points, point) {
  const next = points.filter(value => Math.abs(value.timeSeconds - point.timeSeconds) > 1e-6);
  next.push(point);
  return next.sort((a, b) => a.timeSeconds - b.timeSeconds);
}
