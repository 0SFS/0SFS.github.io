// Browser half of render.mjs: the pre-made MacBook Air model with the captured
// flight on its screen, lit by the phone artwork's studio and baked to a
// transparent PNG. Sizes are millimetres.
//
// World frame, as for the phones: the camera at alpha -90 and beta 90 looks
// along +Z, +X to the right and +Y up. The laptop stands on y = 0 with its
// screen toward the camera, turned `yawDegrees` about the vertical axis.
//
// The studio, materials helper and 2D finish are copied from
// scripts/bento-phones/scene.js so both devices share one light; keep them in step.
import { Engine } from '/babylon/Engines/engine.js';
import { Scene } from '/babylon/scene.js';
import { Constants } from '/babylon/Engines/constants.js';
import { ArcRotateCamera } from '/babylon/Cameras/arcRotateCamera.js';
import { DirectionalLight } from '/babylon/Lights/directionalLight.js';
import { PBRMaterial } from '/babylon/Materials/PBR/pbrMaterial.js';
import { Texture } from '/babylon/Materials/Textures/texture.js';
import { DynamicTexture } from '/babylon/Materials/Textures/dynamicTexture.js';
import { RawCubeTexture } from '/babylon/Materials/Textures/rawCubeTexture.js';
import { HDRFiltering } from '/babylon/Materials/Textures/Filtering/hdrFiltering.js';
import { CubeMapToSphericalPolynomialTools } from '/babylon/Misc/HighDynamicRange/cubemapToSphericalPolynomial.js';
import { TransformNode } from '/babylon/Meshes/transformNode.js';
import { Vector3 } from '/babylon/Maths/math.vector.js';
import { Color3, Color4 } from '/babylon/Maths/math.color.js';
import { LoadAssetContainerAsync } from '/babylon/Loading/sceneLoader.js';
import '/loaders/glTF/2.0/index.js';
import '/loaders/glTF/glTFFileLoader.js';
import '/babylon/Engines/Extensions/engine.rawTexture.js';
import '/babylon/Engines/Extensions/engine.renderTargetCube.js';
import '/babylon/Engines/Extensions/engine.dynamicTexture.js';

const DEG = Math.PI / 180;

const normalize = ([x, y, z]) => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};
const cross = ([ax, ay, az], [bx, by, bz]) => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const linear = hex => Color3.FromHexString(hex).toLinearSpace();
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

// ---------------------------------------------------------------------------
// Studio environment: a dark gradient room with soft boxes, as an HDR cube map.
// (scripts/bento-phones/scene.js)

// Babylon's cube face layout: face normal, then the world axes for file x and y.
const FACES = [
  [[1, 0, 0], [0, 0, -1], [0, -1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, -1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, 0, 1], [1, 0, 0], [0, -1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, -1, 0]],
];

function studio(direction, environment, boxes) {
  const [, y] = direction;
  const zenith = environment.zenith;
  const horizon = environment.horizon;
  const ground = environment.ground;
  const up = smoothstep(0, 0.9, y);
  const down = smoothstep(0, 0.5, -y);
  const color = [0, 1, 2].map(i => horizon[i] + (zenith[i] - horizon[i]) * up + (ground[i] - horizon[i]) * down);
  for (const box of boxes) {
    const forward = dot(direction, box.forward);
    if (forward <= 0) continue;
    const a = Math.abs(Math.atan2(dot(direction, box.right), forward));
    const b = Math.abs(Math.atan2(dot(direction, box.up), forward));
    const mask = (1 - smoothstep(box.halfWidth * (1 - box.softness), box.halfWidth, a)) * (1 - smoothstep(box.halfHeight * (1 - box.softness), box.halfHeight, b));
    if (mask <= 0) continue;
    for (let i = 0; i < 3; i++) color[i] += box.color[i] * mask;
  }
  return color;
}

// `extraBoxes` may also turn about their own axis by `rollDegrees`; the studio's own boxes have none.
async function studioCube(scene, config, extraBoxes = []) {
  const size = config.size;
  const environment = {
    zenith: linear(config.zenith).asArray(),
    horizon: linear(config.horizon).asArray(),
    ground: linear(config.ground).asArray(),
  };
  const boxes = [...config.softboxes, ...extraBoxes].map(box => {
    const forward = normalize(box.direction);
    const helper = Math.abs(forward[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
    let right = normalize(cross(helper, forward));
    let up = normalize(cross(forward, right));
    if (box.rollDegrees) {
      const [c, s] = [Math.cos(box.rollDegrees * DEG), Math.sin(box.rollDegrees * DEG)];
      [right, up] = [[0, 1, 2].map(i => right[i] * c + up[i] * s), [0, 1, 2].map(i => up[i] * c - right[i] * s)];
    }
    const color = linear(box.color).scale(box.intensity).asArray();
    return { forward, right, up, color, halfWidth: (box.sizeDegrees[0] / 2) * DEG, halfHeight: (box.sizeDegrees[1] / 2) * DEG, softness: box.softness };
  });
  const faces = FACES.map(([normal, fileX, fileY]) => {
    const data = new Float32Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (2 * (x + 0.5)) / size - 1;
        const v = (2 * (y + 0.5)) / size - 1;
        const direction = normalize([0, 1, 2].map(i => normal[i] + fileX[i] * u + fileY[i] * v));
        const color = studio(direction, environment, boxes);
        data.set([color[0], color[1], color[2], 1], (y * size + x) * 4);
      }
    }
    return data;
  });
  const cube = new RawCubeTexture(scene, faces, size, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_FLOAT, true, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
  cube.gammaSpace = false;
  cube.sphericalPolynomial = CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial({
    size, right: faces[0], left: faces[1], up: faces[2], down: faces[3], front: faces[4], back: faces[5],
    format: Constants.TEXTUREFORMAT_RGBA, type: Constants.TEXTURETYPE_FLOAT, gammaSpace: false,
  });
  let filtering = 'prefiltered';
  try {
    await new HDRFiltering(scene.getEngine()).prefilter(cube);
  } catch (error) {
    filtering = `mipmaps (${error.message})`;
  }
  return { cube, size, filtering };
}

async function buildEnvironment(scene, config) {
  const { cube, size, filtering } = await studioCube(scene, config);
  scene.environmentTexture = cube;
  scene.environmentIntensity = config.intensity;
  return { size, filtering };
}

// ---------------------------------------------------------------------------
// Materials

function pbr(name, scene, { color = '#ffffff', metallic, roughness }) {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = linear(color);
  material.metallic = metallic;
  material.roughness = roughness;
  material.backFaceCulling = false;
  return material;
}

function canvas2d(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d', { willReadFrequently: true })];
}

async function loadImage(url) {
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    throw new Error(`could not load ${url}`);
  }
  return image;
}

/** A texture from a canvas, oriented as glTF's: the canvas's top row at v = 0. */
function canvasTexture(name, canvas, scene, { gammaSpace = true } = {}) {
  const texture = new DynamicTexture(name, canvas, scene, true, Texture.TRILINEAR_SAMPLINGMODE, Constants.TEXTUREFORMAT_RGBA, false);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 16;
  texture.gammaSpace = gammaSpace;
  texture.update(false);
  return texture;
}

/**
 * The deck: the export's baked texture shows black keys on Midnight aluminium.
 * Midnight pixels become the silver `color` and keep the metal's finish; the
 * keys keep their colour and get `keys`' satin plastic one, through a
 * glTF-style metallic (blue) and roughness (green) map of the same mask.
 */
async function deckTextures(scene, url, deck, metal) {
  const image = await loadImage(url);
  const { width, height } = image;
  const [albedo, albedoCtx] = canvas2d(width, height);
  albedoCtx.drawImage(image, 0, 0);
  const pixels = albedoCtx.getImageData(0, 0, width, height);
  const [finish, finishCtx] = canvas2d(width, height);
  const finishPixels = finishCtx.createImageData(width, height);
  const source = rgb(deck.sourceColor);
  const target = rgb(deck.color);
  const [near, far] = deck.tolerance;
  const [u0, v0, u1, v1] = deck.trackpad.uv;
  const pad = { x0: u0 * width, y0: v0 * height, x1: u1 * width, y1: v1 * height };
  // The keys' shaded sides come close to the case's colour too. Only the case
  // counts: Midnight pixels joined to the texture's border, plus `edgePx` of
  // anti-aliasing around them; patches enclosed by a key's outline stay key.
  const data = pixels.data;
  const match = new Float32Array(width * height);
  for (let p = 0; p < match.length; p++) {
    match[p] = 1 - smoothstep(near, far, Math.hypot(data[p * 4] - source[0], data[p * 4 + 1] - source[1], data[p * 4 + 2] - source[2]));
  }
  const isCase = new Uint8Array(width * height);
  const queue = [];
  for (let x = 0; x < width; x++) queue.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) queue.push(y * width, y * width + width - 1);
  while (queue.length) {
    const p = queue.pop();
    if (isCase[p] || match[p] <= 0.5) continue;
    isCase[p] = 1;
    const x = p % width;
    if (x > 0) queue.push(p - 1);
    if (x < width - 1) queue.push(p + 1);
    if (p >= width) queue.push(p - width);
    if (p < width * (height - 1)) queue.push(p + width);
  }
  const caseEdge = new Uint8Array(isCase);
  for (let step = 0; step < deck.caseEdgePx; step++) {
    const previous = new Uint8Array(caseEdge);
    for (let p = 0; p < previous.length; p++) {
      if (previous[p]) continue;
      const x = p % width;
      if ((x > 0 && previous[p - 1]) || (x < width - 1 && previous[p + 1]) || (p >= width && previous[p - width]) || (p < width * (height - 1) && previous[p + width])) caseEdge[p] = 1;
    }
  }
  let recoloured = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const metalness = caseEdge[y * width + x] ? match[y * width + x] : 0;
      if (metalness > 0.5) recoloured++;
      let shade = 1;
      if (x >= pad.x0 && x < pad.x1 && y >= pad.y0 && y < pad.y1) {
        const edge = Math.min(x - pad.x0, pad.x1 - 1 - x, y - pad.y0, pad.y1 - 1 - y);
        shade = edge < deck.trackpad.edgePx ? deck.trackpad.edge : deck.trackpad.tint;
      }
      for (let c = 0; c < 3; c++) data[i + c] = Math.round((data[i + c] + (target[c] - data[i + c]) * metalness) * shade);
      finishPixels.data[i] = 0;
      finishPixels.data[i + 1] = Math.round(255 * (deck.keys.roughness + (metal.roughness - deck.keys.roughness) * metalness));
      finishPixels.data[i + 2] = Math.round(255 * (deck.keys.metallic + (metal.metallic - deck.keys.metallic) * metalness));
      finishPixels.data[i + 3] = 255;
    }
  }
  albedoCtx.putImageData(pixels, 0, 0);
  finishCtx.putImageData(finishPixels, 0, 0);
  return {
    albedo: canvasTexture('deck albedo', albedo, scene),
    finish: canvasTexture('deck finish', finish, scene, { gammaSpace: false }),
    stats: { size: [width, height], recolouredShare: Number((recoloured / (width * height)).toFixed(3)) },
  };
}

/**
 * The display, drawn into the glass's texture. The export maps the glass's
 * front face transposed: texture u runs down the display and v across it, as
 * x = xPerV v + xAtV0 and z = zPerU u + zAtU0 in model units. The capture fills
 * the panel's width at its own shape, its lower edge on the panel's; the rest
 * of the glass is `glassColor`.
 */
function screenTexture(scene, capture, screen, unit) {
  const size = screen.textureSize;
  const [canvas, ctx] = canvas2d(size, size);
  ctx.fillStyle = screen.glassColor;
  ctx.fillRect(0, 0, size, size);
  const { xPerV, xAtV0, zPerU, zAtU0 } = screen.uv;
  const width = screen.widthMm / unit;
  const height = width * capture.height / capture.width;
  const x0 = screen.centerXMm / unit - width / 2;
  const zBottom = screen.bottomZMm / unit;
  const zTop = zBottom + height;
  // Capture pixel (px, py) to canvas (u S, v S): u from z = zTop - height py / H, v from x = x0 + width px / W.
  ctx.setTransform(0, width / capture.width / xPerV * size, -height / capture.height / zPerU * size, 0,
    (zTop - zAtU0) / zPerU * size, (x0 - xAtV0) / xPerV * size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(capture, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return {
    texture: canvasTexture('screen', canvas, scene),
    stats: {
      capture: [capture.width, capture.height],
      textureSize: size,
      contentMm: [Number((width * unit).toFixed(2)), Number((height * unit).toFixed(2))],
      cameraBandMm: Number((screen.heightMm - height * unit).toFixed(2)),
      texelsAcrossContent: [Math.round(width / xPerV * size), Math.round(height / Math.abs(zPerU) * size)],
    },
  };
}

/** The display glass; `reflection`, if any, is the studio it reflects in place of the scene's. */
function screenMaterial(scene, texture, screen, lights, reflection) {
  const material = new PBRMaterial('screen', scene);
  if (reflection) material.reflectionTexture = reflection;
  material.albedoColor = Color3.Black();
  material.metallic = 0;
  material.roughness = screen.glassRoughness;
  material.emissiveTexture = texture;
  material.emissiveColor = new Color3(lights.screenEmission, lights.screenEmission, lights.screenEmission);
  material.environmentIntensity = lights.screenGlare;
  material.directIntensity = lights.screenGlare;
  material.backFaceCulling = false;
  return material;
}

// ---------------------------------------------------------------------------
// The laptop

async function buildLaptop(scene, model, lights, yawDegrees, captureUrl, reflection) {
  const unit = model.unitMillimetres;
  const container = await LoadAssetContainerAsync('scene.gltf', scene, { rootUrl: '/model/' });
  container.addAllToScene();
  const gltfRoot = container.meshes.find(mesh => mesh.name === '__root__');
  if (!gltfRoot) throw new Error('the model has no __root__ node');
  const meshes = container.meshes.filter(mesh => mesh.getTotalVertices() > 0);
  const byMaterial = name => meshes.filter(mesh => mesh.material?.name === name);

  // The lid turns about the hinge axis, parallel to x in the export's own axes.
  const frame = meshes[0].parent;
  if (!frame || meshes.some(mesh => mesh.parent !== frame)) throw new Error('the model\'s meshes do not share one parent');
  const hinge = new TransformNode('hinge', scene);
  hinge.parent = frame;
  hinge.position = new Vector3(0, model.lid.hinge.y / unit, model.lid.hinge.z / unit);
  const lid = model.lid.materials.flatMap(byMaterial);
  for (const mesh of lid) {
    mesh.parent = hinge;
    mesh.position.subtractInPlace(hinge.position);
  }
  // Babylon turns +z toward -y for a negative angle: the lid's top leans back.
  hinge.rotation.x = -(model.lid.openDegrees - model.lid.modelOpenDegrees) * DEG;

  // Materials by the export's names; the glass carries the screen.
  const replaced = {};
  const hidden = [];
  for (const [name, spec] of Object.entries(model.materials)) {
    if (name.startsWith('$')) continue;
    const targets = byMaterial(name);
    if (!targets.length) throw new Error(`the model has no ${name} material`);
    if (spec.hidden) {
      for (const mesh of targets) mesh.setEnabled(false);
      hidden.push(name);
      continue;
    }
    const material = pbr(name, scene, spec);
    for (const mesh of targets) mesh.material = material;
    replaced[name] = material;
  }
  const deck = await deckTextures(scene, `/model/${model.deck.texture}`, model.deck, model.materials[model.deck.material]);
  const deckMaterial = replaced[model.deck.material];
  deckMaterial.albedoColor = Color3.White();
  deckMaterial.albedoTexture = deck.albedo;
  deckMaterial.metallicTexture = deck.finish;
  deckMaterial.useRoughnessFromMetallicTextureAlpha = false;
  deckMaterial.useRoughnessFromMetallicTextureGreen = true;
  deckMaterial.useMetallnessFromMetallicTextureBlue = true;
  deckMaterial.metallic = 1;
  deckMaterial.roughness = 1;

  const capture = await loadImage(captureUrl);
  const screen = screenTexture(scene, capture, model.screen, unit);
  const glass = byMaterial(model.screen.material);
  if (!glass.length) throw new Error(`the model has no ${model.screen.material} material`);
  const display = screenMaterial(scene, screen.texture, model.screen, lights, reflection);
  for (const mesh of glass) mesh.material = display;

  // Millimetres, turned to face the camera, standing on y = 0.
  const laptop = new TransformNode('laptop', scene);
  gltfRoot.parent = laptop;
  laptop.scaling = new Vector3(unit, unit, unit);
  laptop.rotation.y = Math.PI - yawDegrees * DEG;
  laptop.computeWorldMatrix(true);
  let min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of meshes.filter(mesh => mesh.isEnabled())) {
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    min = Vector3.Minimize(min, box.minimumWorld);
    max = Vector3.Maximize(max, box.maximumWorld);
  }
  laptop.position.y = -min.y;
  const round = vector => vector.asArray().map(value => Number(value.toFixed(1)));
  return {
    capture,
    screen: screen.stats,
    deck: deck.stats,
    hiddenMaterials: hidden,
    boundsMm: { min: round(min.add(new Vector3(0, -min.y, 0))), max: round(max.add(new Vector3(0, -min.y, 0))) },
  };
}

// ---------------------------------------------------------------------------
// 2D finishing: shadow, crop, downscale. (scripts/bento-phones/scene.js)

function alphaBounds(ctx, width, height) {
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 2) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('the render is empty');
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function downscale(source, width, height) {
  let current = source;
  while (current.width / 2 >= width) {
    const [next, ctx] = canvas2d(Math.round(current.width / 2), Math.round(current.height / 2));
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, next.width, next.height);
    current = next;
  }
  const [result, ctx] = canvas2d(width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(current, 0, 0, width, height);
  return result;
}

function finish(rendered, spec, shadow) {
  const [art, artCtx] = canvas2d(rendered.width, rendered.height);
  artCtx.drawImage(rendered, 0, 0);
  const bounds = alphaBounds(artCtx, art.width, art.height);
  // The edge of the render is no edge of the laptop: a crop there would cut it.
  if (bounds.x === 0 || bounds.y === 0 || bounds.x + bounds.width === art.width || bounds.y + bounds.height === art.height) {
    throw new Error(`the laptop touches the edge of the ${art.width}x${art.height} render; widen the camera or the render`);
  }

  // Output pixels: the laptop spans the width minus the padding, which leaves room for the shadow.
  const [padX, padTop, padBottom] = [spec.padding.x, spec.padding.top, spec.padding.bottom];
  const scale = bounds.width / (spec.width - 2 * padX);
  const crop = {
    x: Math.round(bounds.x - padX * scale),
    y: Math.round(bounds.y - padTop * scale),
    width: Math.round(spec.width * scale),
  };
  const outputHeight = Math.round(bounds.height / scale + padTop + padBottom);
  crop.height = Math.round(outputHeight * scale);

  const [composite, ctx] = canvas2d(crop.width, crop.height);
  const [silhouette, silhouetteCtx] = canvas2d(art.width, art.height);
  silhouetteCtx.drawImage(art, 0, 0);
  silhouetteCtx.globalCompositeOperation = 'source-in';
  silhouetteCtx.fillStyle = shadow.color;
  silhouetteCtx.fillRect(0, 0, art.width, art.height);
  ctx.save();
  ctx.filter = `blur(${shadow.blur * scale}px)`;
  ctx.globalAlpha = shadow.opacity;
  ctx.drawImage(silhouette, -crop.x + shadow.offset[0] * scale, -crop.y + shadow.offset[1] * scale);
  ctx.restore();
  ctx.drawImage(art, -crop.x, -crop.y);

  const output = downscale(composite, spec.width, outputHeight);
  return {
    output,
    stats: {
      renderedPixels: [rendered.width, rendered.height],
      laptopBounds: bounds,
      crop,
      renderPixelsPerOutputPixel: Number(scale.toFixed(3)),
      laptopFillsRenderWidth: Number((bounds.width / rendered.width).toFixed(3)),
    },
  };
}

/**
 * Where regions of the capture land in the output image: each [x0, y0, x1, y1]
 * in fractions of the capture becomes its four corners (top left, top right,
 * bottom right, bottom left) in output pixels. The display is the capture's
 * rectangle on the glass's front face, which turns with the lid.
 */
function regionsInOutput(scene, camera, model, capture, finishStats, regions) {
  const unit = model.unitMillimetres;
  const screen = model.screen;
  const glass = scene.meshes.find(mesh => mesh.material?.name === 'screen');
  const width = screen.widthMm / unit, height = width * capture.height / capture.width;
  const x0 = screen.centerXMm / unit - width / 2, zTop = screen.bottomZMm / unit + height, y = screen.frontYMm / unit;
  const engine = scene.getEngine();
  const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
  const { crop, renderPixelsPerOutputPixel: scale } = finishStats;
  const project = (fx, fy) => {
    const point = Vector3.Project(new Vector3(x0 + width * fx, y, zTop - height * fy), glass.getWorldMatrix(), scene.getTransformMatrix(), viewport);
    return [Number(((point.x - crop.x) / scale).toFixed(1)), Number(((point.y - crop.y) / scale).toFixed(1))];
  };
  return Object.fromEntries(Object.entries(regions).map(([name, [fx0, fy0, fx1, fy1]]) =>
    [name, [project(fx0, fy0), project(fx1, fy0), project(fx1, fy1), project(fx0, fy1)]]));
}

// ---------------------------------------------------------------------------

export async function renderLaptop(config, { regions = {} } = {}) {
  const spec = config.render;
  const lights = spec.lights;
  const [renderWidth, renderHeight] = spec.renderSize;
  const canvas = document.createElement('canvas');
  canvas.width = renderWidth;
  canvas.height = renderHeight;
  canvas.style.cssText = `width:${renderWidth}px;height:${renderHeight}px;position:absolute;left:0;top:0`;
  document.body.append(canvas);
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: false, stencil: false, adaptToDeviceRatio: false, antialias: true });
  try {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0, 0, 0, 0);
    scene.imageProcessingConfiguration.toneMappingEnabled = false;
    scene.imageProcessingConfiguration.exposure = lights.exposure;
    const environment = await buildEnvironment(scene, lights.environment);

    const key = new DirectionalLight('key', new Vector3(...lights.key.direction), scene);
    key.intensity = lights.key.intensity;

    const camera = new ArcRotateCamera('camera', spec.camera.alphaDegrees * DEG, spec.camera.betaDegrees * DEG, spec.camera.radius, new Vector3(...spec.camera.target), scene);
    camera.fov = spec.camera.fovDegrees * DEG;
    // A tight depth range keeps the screen and the glass over it apart.
    camera.minZ = Math.max(10, spec.camera.radius - 450);
    camera.maxZ = spec.camera.radius + 450;

    // The studio plus the reflector card that only the display glass sees.
    const reflector = spec.screenReflection;
    const reflection = reflector?.intensity > 0 ? (await studioCube(scene, lights.environment, [reflector])).cube : null;

    const laptop = await buildLaptop(scene, config.model, lights, spec.yawDegrees, `/captures/${encodeURIComponent(config.captures.laptop)}`, reflection);

    await scene.whenReadyAsync();
    for (let frame = 0; frame < 3; frame++) scene.render();
    const { output, stats } = finish(canvas, spec, spec.shadow);
    stats.regions = regionsInOutput(scene, camera, config.model, laptop.capture, stats, { display: [0, 0, 1, 1], ...regions });
    delete laptop.capture;
    return {
      png: output.toDataURL('image/png').split(',')[1],
      webp: output.toDataURL('image/webp', spec.webpQuality / 100).split(',')[1],
      width: output.width,
      height: output.height,
      laptop,
      environment,
      stats,
      webgl: engine.webGLVersion,
      renderer: engine.getGlInfo().renderer,
    };
  } finally {
    engine.dispose();
    canvas.remove();
  }
}
