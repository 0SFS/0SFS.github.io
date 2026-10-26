/**
 * Just enough PNG for the laptop capture: read a size, and join screenshots
 * taken in horizontal bands into one image without resampling. Handles the
 * 8-bit, non-interlaced images Chrome writes.
 */
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };
// Ancillary chunks that say how to read the colours; kept from the first band.
const COLOUR_CHUNKS = new Set(['sRGB', 'iCCP', 'gAMA', 'cHRM', 'cICP', 'pHYs']);

function chunks(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  const list = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    list.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return list;
}

/** Width and height from the IHDR chunk. */
export function pngSize(buffer) {
  const header = chunks(buffer)[0];
  if (header?.type !== 'IHDR') throw new Error('PNG without IHDR');
  return { width: header.data.readUInt32BE(0), height: header.data.readUInt32BE(4) };
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Decodes an 8-bit, non-interlaced PNG to unfiltered rows. */
export function decodePng(buffer) {
  const list = chunks(buffer);
  const ihdr = list[0].data;
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  const [bitDepth, colourType, , , interlace] = ihdr.subarray(8, 13);
  const channels = CHANNELS[colourType];
  if (bitDepth !== 8 || !channels || interlace !== 0) throw new Error(`unsupported PNG (bit depth ${bitDepth}, colour type ${colourType}, interlace ${interlace})`);
  const filtered = inflateSync(Buffer.concat(list.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data)));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    if (filter > 4) throw new Error(`bad PNG filter ${filter}`);
    const source = y * (stride + 1) + 1;
    const row = y * stride, prior = row - stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[row + x - channels] : 0;
      const up = y > 0 ? pixels[prior + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[prior + x - channels] : 0;
      const value = filtered[source + x];
      pixels[row + x] = filter === 0 ? value : filter === 1 ? value + left : filter === 2 ? value + up
        : filter === 3 ? value + ((left + up) >> 1) : value + paeth(left, up, upLeft);
    }
  }
  return { width, height, colourType, channels, pixels, colourChunks: list.filter(chunk => COLOUR_CHUNKS.has(chunk.type)) };
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(data, crc32(head.subarray(4))) >>> 0);
  return Buffer.concat([head, data, tail]);
}

/** Encodes unfiltered rows, choosing each row's filter by the usual smallest-sum rule. */
export function encodePng({ width, height, colourType, channels, pixels, colourChunks = [] }) {
  const stride = width * channels;
  const out = Buffer.alloc((stride + 1) * height);
  const candidate = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride, prior = row - stride;
    let best = Infinity;
    for (let filter = 0; filter <= 4; filter++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const left = x >= channels ? pixels[row + x - channels] : 0;
        const up = y > 0 ? pixels[prior + x] : 0;
        const upLeft = y > 0 && x >= channels ? pixels[prior + x - channels] : 0;
        const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : paeth(left, up, upLeft);
        const value = (pixels[row + x] - predictor) & 255;
        candidate[x] = value;
        sum += value < 128 ? value : 256 - value;
      }
      if (sum < best) {
        best = sum;
        out[y * (stride + 1)] = filter;
        candidate.copy(out, y * (stride + 1) + 1);
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, colourType, 0, 0, 0], 8);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), ...colourChunks.map(({ type, data }) => chunk(type, data)),
    chunk('IDAT', deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Joins PNGs of equal width and format, top to bottom, pixel for pixel. */
export function stitchPngRows(buffers) {
  const bands = buffers.map(decodePng);
  const [first] = bands;
  for (const band of bands) {
    if (band.width !== first.width || band.colourType !== first.colourType) throw new Error('screenshot bands differ in width or format');
  }
  return encodePng({ ...first, height: bands.reduce((sum, band) => sum + band.height, 0), pixels: Buffer.concat(bands.map(band => band.pixels)) });
}
