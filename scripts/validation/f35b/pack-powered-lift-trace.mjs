#!/usr/bin/env node
// 0sfs owns lossless retention of these aircraft validation observations.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { brotliCompressSync, brotliDecompressSync, constants, gzipSync, gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newOutputDirectory } from '../../outputDirectory.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const repository = fileURLToPath(new URL('../../../', import.meta.url));

// Differences of the IEEE754 bit patterns, modulo 2^64, never round a value.
// Separate byte planes cluster the mostly zero exponent/sign deltas. Identical
// columns are stored once; columnMap restores every original native channel.
function encodeColumns(bytes, rows, count) {
  const unique = [], hashes = new Map(), columnMap = [];
  for (let c = 0; c < count; c++) {
    const column = bytes.subarray(c * rows * 8, (c + 1) * rows * 8);
    const hash = sha256(column);
    if (hashes.has(hash)) {
      const index = hashes.get(hash);
      assert.ok(column.equals(unique[index]));
      columnMap.push(index);
    } else {
      hashes.set(hash, unique.length);
      columnMap.push(unique.length);
      unique.push(column);
    }
  }
  const encoded = Buffer.alloc(unique.length * rows * 8);
  for (let c = 0; c < unique.length; c++) {
    let previousLo = 0, previousHi = 0;
    for (let r = 0; r < rows; r++) {
      const lo = unique[c].readUInt32LE(r * 8), hi = unique[c].readUInt32LE(r * 8 + 4);
      const deltaLo = (lo - previousLo) >>> 0;
      const deltaHi = (hi - previousHi - (lo < previousLo ? 1 : 0)) >>> 0;
      for (let b = 0; b < 4; b++) {
        encoded[(c * 8 + b) * rows + r] = deltaLo >>> (8 * b);
        encoded[(c * 8 + b + 4) * rows + r] = deltaHi >>> (8 * b);
      }
      previousLo = lo; previousHi = hi;
    }
  }
  return { encoded, columnMap, uniqueColumns: unique.length };
}

function decodeColumns(encoded, rows, uniqueColumns) {
  assert.equal(encoded.length, rows * uniqueColumns * 8);
  const bytes = Buffer.alloc(encoded.length);
  for (let c = 0; c < uniqueColumns; c++) {
    let previousLo = 0, previousHi = 0;
    for (let r = 0; r < rows; r++) {
      let deltaLo = 0, deltaHi = 0;
      for (let b = 0; b < 4; b++) {
        deltaLo |= encoded[(c * 8 + b) * rows + r] << (8 * b);
        deltaHi |= encoded[(c * 8 + b + 4) * rows + r] << (8 * b);
      }
      const lo = (previousLo + (deltaLo >>> 0)) >>> 0;
      const hi = (previousHi + (deltaHi >>> 0) + (lo < previousLo ? 1 : 0)) >>> 0;
      bytes.writeUInt32LE(lo, (c * rows + r) * 8);
      bytes.writeUInt32LE(hi, (c * rows + r) * 8 + 4);
      previousLo = lo; previousHi = hi;
    }
  }
  return bytes;
}

function decodeCsv(bytes, rows, columns, columnMap) {
  const lines = [columns.join(',')];
  for (let r = 0; r < rows; r++)
    lines.push(columns.map((_, c) => bytes.readDoubleLE((columnMap[c] * rows + r) * 8)).join(','));
  return lines.join('\n') + '\n';
}
const [mode, input, destination] = process.argv.slice(2);
if (mode === '--help') {
  console.log('Usage: node scripts/validation/f35b/pack-powered-lift-trace.mjs --pack trace.csv.gz [new-manifest.json]\n       node scripts/validation/f35b/pack-powered-lift-trace.mjs --unpack manifest.json [new-trace.csv.gz]');
  process.exit(0);
}
assert.ok(['--pack', '--unpack'].includes(mode) && input);
if (mode === '--pack') {
  const original = await readFile(input), csv = gunzipSync(original);
  const [header, ...rows] = csv.toString('utf8').trimEnd().split('\n');
  const columns = header.split(','), samples = rows.map(row => row.split(',').map(Number));
  assert.ok(samples.every(row => row.length === columns.length));
  // Column order clusters each native channel's adjacent accepted steps. IEEE
  // doubles preserve every bit of the decoded observations, including residuals.
  const bytes = Buffer.alloc(samples.length * columns.length * 8);
  for (let c = 0; c < columns.length; c++) for (let r = 0; r < samples.length; r++)
    bytes.writeDoubleLE(samples[r][c], (c * samples.length + r) * 8);
  const { encoded, columnMap, uniqueColumns } = encodeColumns(bytes, samples.length, columns.length);
  const packed = brotliCompressSync(encoded, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } });
  const out = destination ?? path.join(newOutputDirectory('validation', 'f135-trace-retention'), 'trace.json');
  const dataName = path.basename(out, '.json') + '.f64-delta.br';
  const manifest = { schema: '0sfs-f135-physics-trace/2',
    encoding: 'deduplicated columns; IEEE754 uint64 little-endian bit-pattern delta modulo 2^64; eight byte planes per column',
    compression: 'brotli', compressionQuality: 6,
    rows: samples.length, columns, columnMap, uniqueColumns, data: dataName,
    dataSha256: sha256(packed), originalGzipSha256: sha256(original), decodedCsvSha256: sha256(csv),
    original: path.basename(input), originalSourcePath: path.relative(repository, path.resolve(input)),
    originalGzipBytes: original.length, decodedCsvBytes: csv.length, dataBytes: packed.length,
    restorationRuntime: { node: process.version, zlib: process.versions.zlib } };
  // Verify exact CSV recovery before retaining a representation.
  const recovered = decodeCsv(decodeColumns(brotliDecompressSync(packed), samples.length, uniqueColumns),
    samples.length, columns, columnMap);
  assert.equal(sha256(recovered), manifest.decodedCsvSha256);
  assert.equal(sha256(gzipSync(recovered)), manifest.originalGzipSha256);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(path.join(path.dirname(out), dataName), packed, { flag: 'wx' });
  await writeFile(out, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ manifest: out, rows: samples.length, columns: columns.length,
    uniqueColumns, originalBytes: original.length, retainedBytes: packed.length }));
} else {
  const manifest = JSON.parse(await readFile(input, 'utf8'));
  assert.ok(['0sfs-f135-physics-trace/1', '0sfs-f135-physics-trace/2'].includes(manifest.schema));
  assert.equal(path.basename(manifest.data), manifest.data);
  const packed = await readFile(path.join(path.dirname(input), manifest.data));
  assert.equal(sha256(packed), manifest.dataSha256);
  const { rows, columns } = manifest;
  const old = manifest.schema.endsWith('/1');
  const columnMap = old ? columns.map((_, c) => c) : manifest.columnMap;
  const count = old ? columns.length : manifest.uniqueColumns;
  assert.ok(Number.isSafeInteger(rows) && rows > 0 && Number.isSafeInteger(count) && count > 0);
  assert.equal(columnMap.length, columns.length);
  assert.ok(columnMap.every(c => Number.isSafeInteger(c) && c >= 0 && c < count));
  assert.ok(old || manifest.compression === undefined || manifest.compression === 'brotli');
  const encoded = manifest.compression === 'brotli' ? brotliDecompressSync(packed) : gunzipSync(packed);
  const bytes = old ? encoded : decodeColumns(encoded, rows, count);
  assert.equal(bytes.length, rows * count * 8);
  const csv = decodeCsv(bytes, rows, columns, columnMap);
  assert.equal(sha256(csv), manifest.decodedCsvSha256);
  const compressed = gzipSync(csv);
  assert.equal(sha256(compressed), manifest.originalGzipSha256);
  const out = destination ?? path.join(newOutputDirectory('validation', 'f135-trace-restoration'), manifest.original);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, compressed, { flag: 'wx' });
  console.log(JSON.stringify({ trace: out, sha256: sha256(compressed) }));
}
