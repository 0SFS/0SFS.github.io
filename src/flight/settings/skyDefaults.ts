import { FOSS_EARTH_PARAMETERS, VIEWPOINT_SURFACE_LIGHTING_CHOICE, type DeviceContext, type SettingsRegistry } from "foss-earth/settings";

/**
 * The flight's own choices about FOSS Earth's sky. A globe always lights its
 * planet by each point's own Sun; a low flight sees only the ground near the
 * aircraft, where one factor for all imagery is right and cheaper, so the
 * flight offers that as a choice of its own, and makes it the default only
 * where the device is too slow for the other.
 */

/** Adds "As at the viewpoint" to Sky → Ground → Map imagery, after FOSS Earth's own choices. */
export function offerViewpointSurfaceLighting(settings: SettingsRegistry): void {
  const own = FOSS_EARTH_PARAMETERS.find(spec => spec.id === "sky.surface.lighting")?.choices ?? [];
  settings.setChoices("sky.surface.lighting", [...own, VIEWPOINT_SURFACE_LIGHTING_CHOICE]);
}

/**
 * Why a device counts as very slow for the sky, from what it reports of
 * itself and never from its name: a WebGL 1 renderer, 2 GiB of memory or
 * less, or two processor threads or fewer. Null for any other device.
 */
export function verySlowDeviceReason(context: Pick<DeviceContext, "rendererMode" | "deviceMemoryGiB" | "hardwareConcurrency">): string | null {
  if (context.rendererMode === "webgl") return "its WebGL 1 renderer";
  if (context.deviceMemoryGiB !== null && context.deviceMemoryGiB <= 2) return `its ${context.deviceMemoryGiB} GiB of memory`;
  if (context.hardwareConcurrency !== null && context.hardwareConcurrency <= 2) return `its ${context.hardwareConcurrency} processor threads`;
  return null;
}

/**
 * On a very slow device, unless the user chose otherwise: map imagery is lit
 * as at the aircraft, and the light from the ground is one colour, with no
 * image of the ground rendered for it, which a WebGL 1 renderer can read back
 * only by waiting for the GPU. Call once the renderer has started.
 */
export function applySlowDeviceSkyDefaults(settings: SettingsRegistry): void {
  const reason = verySlowDeviceReason(settings.getDeviceContext());
  if (!reason) return;
  settings.setHostDefault("sky.surface.lighting", VIEWPOINT_SURFACE_LIGHTING_CHOICE.id,
    `a very slow device by ${reason}: imagery lit as at the aircraft, right below a low flight and a few dozen operations a pixel cheaper`);
  settings.setHostDefault("sky.groundLight.mode", "uniform",
    `a very slow device by ${reason}: the light from the ground as one colour, with no image of the ground rendered and read back`);
}
