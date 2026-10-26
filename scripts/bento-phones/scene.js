// Browser half of render.mjs: builds the phones in Babylon.js, renders one artwork
// and returns it as a transparent PNG. Every size here is in millimetres.
//
// Phone frame of reference (landscape, as built): +X along the length, +Y along the
// width, the screen faces -Z. With the camera at alpha -90 and beta 90 it looks
// straight at the screen, +X to the right and +Y up.
import { Engine } from '/babylon/Engines/engine.js';
import { Scene } from '/babylon/scene.js';
import { Constants } from '/babylon/Engines/constants.js';
import { ArcRotateCamera } from '/babylon/Cameras/arcRotateCamera.js';
import { DirectionalLight } from '/babylon/Lights/directionalLight.js';
import { PBRMaterial } from '/babylon/Materials/PBR/pbrMaterial.js';
import { Texture } from '/babylon/Materials/Textures/texture.js';
import { RawCubeTexture } from '/babylon/Materials/Textures/rawCubeTexture.js';
import { HDRFiltering } from '/babylon/Materials/Textures/Filtering/hdrFiltering.js';
import { CubeMapToSphericalPolynomialTools } from '/babylon/Misc/HighDynamicRange/cubemapToSphericalPolynomial.js';
import { Mesh } from '/babylon/Meshes/mesh.js';
import { VertexData } from '/babylon/Meshes/mesh.vertexData.js';
import { TransformNode } from '/babylon/Meshes/transformNode.js';
import { CreateSphere } from '/babylon/Meshes/Builders/sphereBuilder.js';
import { Vector3 } from '/babylon/Maths/math.vector.js';
import { Color3, Color4 } from '/babylon/Maths/math.color.js';
import '/babylon/Engines/Extensions/engine.rawTexture.js';
import '/babylon/Engines/Extensions/engine.renderTargetCube.js';

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

// ---------------------------------------------------------------------------
// Geometry

// A rounded rectangle centred on the origin, counter-clockwise, with outward normals.
function roundedRect(length, width, radius, segments = 16) {
  const points = [];
  const hx = length / 2 - radius;
  const hy = width / 2 - radius;
  [[hx, hy], [-hx, hy], [-hx, -hy], [hx, -hy]].forEach(([cx, cy], corner) => {
    for (let k = 0; k <= segments; k++) {
      const angle = (corner * 90 + (90 * k) / segments) * DEG;
      points.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), nx: Math.cos(angle), ny: Math.sin(angle) });
    }
  });
  return points;
}

// An elliptical arc in profile space: `out` is the offset outward from the outline
// (negative means inset) and `h` the height along the sweep axis.
function arc([centerOut, centerH], [radiusOut, radiusH], fromDegrees, toDegrees, steps) {
  const points = [];
  for (let k = 0; k <= steps; k++) {
    const t = (fromDegrees + ((toDegrees - fromDegrees) * k) / steps) * DEG;
    const [nOut, nH] = normalize([Math.cos(t) / radiusOut, Math.sin(t) / radiusH, 0]);
    points.push({ out: centerOut + radiusOut * Math.cos(t), h: centerH + radiusH * Math.sin(t), nOut, nH });
  }
  return points;
}

// Maps outline coordinates (x, y) and sweep height h into the mesh's local space.
function basisPoint(basis, x, y, h) {
  return [0, 1, 2].map(i => basis.origin[i] + basis.u[i] * x + basis.v[i] * y + basis.w[i] * h);
}
function basisDirection(basis, x, y, h) {
  return normalize([0, 1, 2].map(i => basis.u[i] * x + basis.v[i] * y + basis.w[i] * h));
}

function meshFrom(name, scene, positions, normals, indices, uvs) {
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  if (uvs) data.uvs = uvs;
  data.applyToMesh(mesh);
  return mesh;
}

// Sweeps a profile around an outline: the phone's rounded edges, frame and buttons.
function sweep(name, scene, outline, profile, basis) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (const o of outline) {
    for (const p of profile) {
      positions.push(...basisPoint(basis, o.x + o.nx * p.out, o.y + o.ny * p.out, p.h));
      normals.push(...basisDirection(basis, o.nx * p.nOut, o.ny * p.nOut, p.nH));
    }
  }
  const n = outline.length;
  const m = profile.length;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j;
      const b = next * m + j;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  return meshFrom(name, scene, positions, normals, indices);
}

// A flat face filling an outline (inset by `out`), facing +w or -w.
function cap(name, scene, outline, out, h, facing, basis, uvSize) {
  const points = [{ x: 0, y: 0 }, ...outline.map(o => ({ x: o.x + o.nx * out, y: o.y + o.ny * out }))];
  const positions = [];
  const normals = [];
  const uvs = [];
  const normal = basisDirection(basis, 0, 0, facing);
  for (const p of points) {
    positions.push(...basisPoint(basis, p.x, p.y, h));
    normals.push(...normal);
    if (uvSize) uvs.push(p.x / uvSize[0] + 0.5, p.y / uvSize[1] + 0.5);
  }
  const indices = [];
  for (let i = 1; i < points.length; i++) indices.push(0, i, i === points.length - 1 ? 1 : i + 1);
  return meshFrom(name, scene, positions, normals, indices, uvSize ? uvs : undefined);
}

function disc(name, scene, radius, x, y, z) {
  const outline = Array.from({ length: 48 }, (_, k) => {
    const a = (k / 48) * 2 * Math.PI;
    return { x: Math.cos(a) * radius, y: Math.sin(a) * radius, nx: 0, ny: 0 };
  });
  return cap(name, scene, outline, 0, 0, -1, { origin: [x, y, z], u: [1, 0, 0], v: [0, 1, 0], w: [0, 0, 1] });
}

function buildPhone(scene, model, materials, screenMaterial, top, name) {
  const root = new TransformNode(name, scene);
  const { length, width, thickness } = model;
  const frameInset = model.frameInset;
  const glassBevel = model.glassBevel;
  const backBevel = model.backBevel;
  const edgeHeight = model.edgeHeight;
  const zFront = -thickness / 2;
  const zBack = thickness / 2;
  const outline = roundedRect(length, width, model.cornerRadius, 18);
  const body = { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], w: [0, 0, 1] };
  const parts = [];

  // Front glass: flat face plus the rounded edge that meets the frame.
  const frontEdge = arc([-glassBevel, zFront + edgeHeight], [glassBevel - frameInset, edgeHeight], -90, 0, 12);
  parts.push([sweep(`${name}-glass-edge`, scene, outline, frontEdge, body), materials.glass]);
  parts.push([cap(`${name}-glass`, scene, outline, -glassBevel, zFront, -1, body), materials.glass]);

  // Metal frame: a slightly crowned band between the two glass panels.
  const half = thickness / 2 - edgeHeight;
  const crown = model.frameCrown;
  const crownAngle = Math.acos(1 - frameInset / crown) / DEG;
  const frame = arc([-crown, 0], [crown, half / Math.sin(crownAngle * DEG)], -crownAngle, crownAngle, 16);
  parts.push([sweep(`${name}-frame`, scene, outline, frame, body), materials.frame]);

  // Back glass.
  const backEdge = arc([-backBevel, zBack - edgeHeight], [backBevel - frameInset, edgeHeight], 0, 90, 12);
  parts.push([sweep(`${name}-back-edge`, scene, outline, backEdge, body), materials.back]);
  parts.push([cap(`${name}-back`, scene, outline, -backBevel, zBack, 1, body), materials.back]);

  // Screen, just above the glass so it never z-fights.
  const screen = model.screen;
  const screenOutline = roundedRect(screen.length, screen.width, screen.cornerRadius, 18);
  parts.push([cap(`${name}-screen`, scene, screenOutline, 0, zFront - 0.05, -1, body, [screen.length, screen.width]), screenMaterial]);

  // Punch-hole camera at the phone's top end. `top` says which end that is in landscape.
  const topSign = top === 'right' ? 1 : -1;
  const holeX = topSign * (length / 2 - model.punchHole.fromTopEdge);
  parts.push([disc(`${name}-hole`, scene, model.punchHole.diameter / 2, holeX, 0, zFront - 0.1), materials.hole]);
  parts.push([disc(`${name}-lens`, scene, model.punchHole.diameter * 0.27, holeX, 0, zFront - 0.15), materials.lens]);

  // Volume and power keys on the portrait right side, which is the top edge when the
  // phone's top points left and the bottom edge when it points right.
  const sideSign = top === 'right' ? -1 : 1;
  for (const button of model.buttons) {
    const embed = 0.3;
    const depth = button.depth + embed;
    const round = Math.min(0.25, depth / 2);
    const centerX = topSign * (length / 2 - button.from - button.length / 2);
    const basis = { origin: [centerX, sideSign * (width / 2 - embed), 0], u: [1, 0, 0], v: [0, 0, 1], w: [0, sideSign, 0] };
    const keyOutline = roundedRect(button.length, button.height, button.height / 2 - 0.01, 8);
    const profile = [{ out: 0, h: 0, nOut: 1, nH: 0 }, ...arc([-round, depth - round], [round, round], 0, 90, 6)];
    parts.push([sweep(`${name}-key`, scene, keyOutline, profile, basis), materials.button]);
    parts.push([cap(`${name}-key-top`, scene, keyOutline, -round, depth, 1, basis), materials.button]);
  }

  for (const [mesh, material] of parts) {
    mesh.material = material;
    mesh.parent = root;
  }
  return root;
}

// ---------------------------------------------------------------------------
// Studio environment: a dark gradient room with soft boxes, as an HDR cube map.

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

async function buildEnvironment(scene, config) {
  const size = config.size;
  const environment = {
    zenith: linear(config.zenith).asArray(),
    horizon: linear(config.horizon).asArray(),
    ground: linear(config.ground).asArray(),
  };
  const boxes = config.softboxes.map(box => {
    const forward = normalize(box.direction);
    const helper = Math.abs(forward[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
    const right = normalize(cross(helper, forward));
    const up = normalize(cross(forward, right));
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
  scene.environmentTexture = cube;
  scene.environmentIntensity = config.intensity;
  return { size, filtering };
}

// ---------------------------------------------------------------------------
// Materials

function pbr(name, scene, { color, metallic, roughness }) {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = linear(color);
  material.metallic = metallic;
  material.roughness = roughness;
  material.backFaceCulling = false;
  return material;
}

function buildMaterials(scene, model) {
  const c = model.materials;
  return {
    frame: pbr('frame', scene, c.frame),
    glass: pbr('glass', scene, c.glass),
    back: pbr('back', scene, c.back),
    button: pbr('button', scene, c.button),
    hole: pbr('hole', scene, c.hole),
    lens: pbr('lens', scene, c.lens),
  };
}

function loadTexture(scene, url) {
  return new Promise((resolve, reject) => {
    const texture = new Texture(url, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE, () => resolve(texture), message => reject(new Error(`could not load ${url}: ${message}`)));
    texture.anisotropicFilteringLevel = 16;
  });
}

async function screenMaterial(scene, url, model, lights) {
  const texture = await loadTexture(scene, url);
  const material = new PBRMaterial(`screen ${url}`, scene);
  material.albedoColor = Color3.Black();
  material.metallic = 0;
  material.roughness = model.materials.screenGlassRoughness;
  material.emissiveTexture = texture;
  material.emissiveColor = new Color3(lights.screenEmission, lights.screenEmission, lights.screenEmission);
  material.environmentIntensity = lights.screenGlare;
  material.directIntensity = lights.screenGlare;
  material.backFaceCulling = false;
  const size = texture.getSize();
  return { material, width: size.width, height: size.height };
}

// ---------------------------------------------------------------------------
// 2D finishing: shadow, crop, downscale.

function canvas2d(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')];
}

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
  const [phones, phonesCtx] = canvas2d(rendered.width, rendered.height);
  phonesCtx.drawImage(rendered, 0, 0);
  const bounds = alphaBounds(phonesCtx, phones.width, phones.height);

  // Output pixels: the phones span the width minus the padding, which leaves room for the shadow.
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
  const [silhouette, silhouetteCtx] = canvas2d(phones.width, phones.height);
  silhouetteCtx.drawImage(phones, 0, 0);
  silhouetteCtx.globalCompositeOperation = 'source-in';
  silhouetteCtx.fillStyle = shadow.color;
  silhouetteCtx.fillRect(0, 0, phones.width, phones.height);
  ctx.save();
  ctx.filter = `blur(${shadow.blur * scale}px)`;
  ctx.globalAlpha = shadow.opacity;
  ctx.drawImage(silhouette, -crop.x + shadow.offset[0] * scale, -crop.y + shadow.offset[1] * scale);
  ctx.restore();
  ctx.drawImage(phones, -crop.x, -crop.y);

  const output = downscale(composite, spec.width, outputHeight);
  return {
    output,
    stats: {
      renderedPixels: [rendered.width, rendered.height],
      phoneBounds: bounds,
      crop,
      renderPixelsPerOutputPixel: Number(scale.toFixed(3)),
      phonesFillRenderWidth: Number((bounds.width / rendered.width).toFixed(3)),
    },
  };
}

// ---------------------------------------------------------------------------

export async function renderArtwork(config, name, options = {}) {
  const spec = config.renders[name];
  const lights = config.renders.lights;
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
    // A tight depth range keeps the screen, glass and punch hole layers apart.
    camera.minZ = Math.max(10, spec.camera.radius - 300);
    camera.maxZ = spec.camera.radius + 300;

    const materials = buildMaterials(scene, config.model);
    const screens = [];
    if (options.debug === 'environment') {
      const chrome = CreateSphere('chrome', { diameter: 60, segments: 64 }, scene);
      chrome.material = pbr('chrome', scene, { color: '#ffffff', metallic: 1, roughness: 0.02 });
      chrome.position.x = -40;
      const satin = CreateSphere('satin', { diameter: 60, segments: 64 }, scene);
      satin.material = materials.frame;
      satin.position.x = 40;
    } else {
      for (const [index, phone] of spec.phones.entries()) {
        const screen = await screenMaterial(scene, `/captures/${phone.screen}`, config.model, lights);
        screens.push({ file: phone.screen, width: screen.width, height: screen.height });
        const root = buildPhone(scene, config.model, materials, screen.material, phone.top, `phone${index}`);
        root.position = new Vector3(...phone.position);
        root.rotation = new Vector3(...phone.rotationDegrees.map(value => value * DEG));
      }
    }

    await scene.whenReadyAsync();
    for (let frame = 0; frame < 3; frame++) scene.render();
    const { output, stats } = finish(canvas, spec, config.renders.shadow);
    return {
      png: output.toDataURL('image/png').split(',')[1],
      webp: output.toDataURL('image/webp', config.renders.webpQuality / 100).split(',')[1],
      width: output.width,
      height: output.height,
      screens,
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
