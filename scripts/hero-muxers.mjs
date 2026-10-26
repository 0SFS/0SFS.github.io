/** Small, bounded silent-video containers for browser WebCodecs output.
 * No transcoding: all encoded bytes are produced by Chrome's native codecs. */
import { Buffer } from 'node:buffer';

const u16 = value => { const b = Buffer.alloc(2); b.writeUInt16BE(value); return b; };
const u32 = value => { const b = Buffer.alloc(4); b.writeUInt32BE(value); return b; };
const box = (type, ...data) => { const payload = Buffer.concat(data); return Buffer.concat([u32(payload.length + 8), Buffer.from(type), payload]); };
const full = (type, version, flags, ...data) => box(type, Buffer.from([version, flags >> 16 & 255, flags >> 8 & 255, flags & 255]), ...data);
const identity = Buffer.concat([u32(65536), u32(0), u32(0), u32(0), u32(65536), u32(0), u32(0), u32(0), u32(0x40000000)]);
function samples(video, expected) {
  if (video.chunks.length !== expected || !video.chunks[0]?.key) throw new Error('Encoded frame count or first keyframe is invalid.');
  return video.chunks.map((chunk, index) => {
    if (index && chunk.timestamp <= video.chunks[index - 1].timestamp) throw new Error('Reordered/B-frame streams are outside this capture muxer.');
    return { ...chunk, bytes: Buffer.from(chunk.bytes, 'base64') };
  });
}

export function mp4(video, { width, height, fps, frames }) {
  const chunks = samples(video, frames);
  if (!video.description) throw new Error('H.264 encoder did not provide its AVC configuration.');
  const ftyp = box('ftyp', Buffer.from('isom'), u32(512), Buffer.from('isomiso2avc1mp41'));
  const mdat = box('mdat', ...chunks.map(chunk => chunk.bytes));
  const movie = offset => {
    const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(fps), u32(frames), u32(65536), u16(256), Buffer.alloc(10), identity, Buffer.alloc(24), u32(2));
    const tkhd = full('tkhd', 0, 7, u32(0), u32(0), u32(1), u32(0), u32(frames), Buffer.alloc(8), u16(0), u16(0), u16(0), u16(0), identity, u32(width * 65536), u32(height * 65536));
    const mdhd = full('mdhd', 0, 0, u32(0), u32(0), u32(fps), u32(frames), u16(0x55c4), u16(0));
    const hdlr = full('hdlr', 0, 0, u32(0), Buffer.from('vide'), Buffer.alloc(12), Buffer.from('0SFS\0'));
    const avc1 = box('avc1', Buffer.alloc(6), u16(1), Buffer.alloc(16), u16(width), u16(height), u32(72 * 65536), u32(72 * 65536), u32(0), u16(1), Buffer.alloc(32), u16(24), u16(65535), box('avcC', Buffer.from(video.description, 'base64')));
    const stsd = full('stsd', 0, 0, u32(1), avc1);
    const stts = full('stts', 0, 0, u32(1), u32(frames), u32(1));
    const stsc = full('stsc', 0, 0, u32(1), u32(1), u32(frames), u32(1));
    const stsz = full('stsz', 0, 0, u32(0), u32(frames), ...chunks.map(chunk => u32(chunk.bytes.length)));
    const stco = full('stco', 0, 0, u32(1), u32(offset));
    const keys = chunks.flatMap((chunk, index) => chunk.key ? [u32(index + 1)] : []);
    const stss = full('stss', 0, 0, u32(keys.length), ...keys);
    const stbl = box('stbl', stsd, stts, stsc, stsz, stco, stss);
    const dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));
    const minf = box('minf', full('vmhd', 0, 1, Buffer.alloc(8)), dinf, stbl);
    return box('moov', mvhd, box('trak', tkhd, box('mdia', mdhd, hdlr, minf)));
  };
  const moov = movie(ftyp.length + movie(0).length + 8);
  return Buffer.concat([ftyp, moov, mdat]); // Fast start: metadata precedes encoded media.
}

function vint(value) {
  for (let size = 1; size <= 8; size++) {
    if (BigInt(value) < (1n << BigInt(7 * size)) - 1n) {
      const b = Buffer.alloc(size);
      let encoded = BigInt(value) | 1n << BigInt(7 * size);
      for (let i = size - 1; i >= 0; i--) { b[i] = Number(encoded & 255n); encoded >>= 8n; }
      return b;
    }
  }
  throw new Error('WebM element too large.');
}
const el = (id, data) => Buffer.concat([Buffer.from(id, 'hex'), vint(data.length), data]);
const number = value => { const b = u32(value); let first = 0; while (first < 3 && b[first] === 0) first++; return b.subarray(first); };
export function webm(video, { width, height, fps, frames }) {
  const chunks = samples(video, frames);
  const header = el('1a45dfa3', Buffer.concat([el('4286', number(1)), el('42f7', number(1)), el('42f2', number(4)), el('42f3', number(8)), el('4282', Buffer.from('webm')), el('4287', number(4)), el('4285', number(2))]));
  const duration = Buffer.alloc(8); duration.writeDoubleBE(frames / fps * 1000);
  const info = el('1549a966', Buffer.concat([el('2ad7b1', number(1000000)), el('4489', duration), el('4d80', Buffer.from('0SFS')), el('5741', Buffer.from('Chrome WebCodecs'))]));
  const track = el('ae', Buffer.concat([el('d7', number(1)), el('73c5', number(1)), el('83', number(1)), el('86', Buffer.from('V_VP9')), el('23e383', number(Math.round(1e9 / fps))), el('e0', Buffer.concat([el('b0', number(width)), el('ba', number(height))]))]));
  const blocks = chunks.map(chunk => {
    const time = Buffer.alloc(2); time.writeInt16BE(Math.round(chunk.timestamp / 1000));
    return el('a3', Buffer.concat([Buffer.from([0x81]), time, Buffer.from([chunk.key ? 0x80 : 0]), chunk.bytes]));
  });
  const cluster = el('1f43b675', Buffer.concat([el('e7', number(0)), ...blocks]));
  return Buffer.concat([header, el('18538067', Buffer.concat([info, el('1654ae6b', track), cluster]))]);
}
