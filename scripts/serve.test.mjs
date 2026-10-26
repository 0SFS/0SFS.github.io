import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startSiteServer } from './serve.mjs';

describe('local video delivery', () => {
  let directory, server, url;
  before(async () => {
    const build = fileURLToPath(new URL('../build/', import.meta.url));
    await mkdir(build, { recursive: true });
    directory = await mkdtemp(build + 'video-server-');
    await writeFile(directory + '/clip.mp4', 'abcdefghij');
    await writeFile(directory + '/clip.webm', 'abcdefghij');
    ({ server, url } = await startSiteServer({ root: directory, port: 0 }));
  });
  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  it('serves both video MIME types and HEAD without a body', async () => {
    for (const [name, type] of [['clip.mp4', 'video/mp4'], ['clip.webm', 'video/webm']]) {
      const response = await fetch(url + name, { method: 'HEAD' });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), type);
      assert.equal(response.headers.get('content-length'), '10');
      assert.equal(response.headers.get('accept-ranges'), 'bytes');
      assert.equal(await response.text(), '');
    }
  });
  it('returns the exact requested byte range, including open and suffix ranges', async () => {
    for (const [range, contentRange, text] of [
      ['bytes=0-3', 'bytes 0-3/10', 'abcd'],
      ['bytes=6-', 'bytes 6-9/10', 'ghij'],
      ['bytes=-3', 'bytes 7-9/10', 'hij'],
      ['bytes=8-100', 'bytes 8-9/10', 'ij'],
    ]) {
      const response = await fetch(url + 'clip.mp4', { headers: { Range: range } });
      assert.equal(response.status, 206);
      assert.equal(response.headers.get('content-range'), contentRange);
      assert.equal(response.headers.get('content-length'), String(text.length));
      assert.equal(await response.text(), text);
    }
  });
  it('rejects unsatisfiable ranges without sending the file', async () => {
    for (const range of ['bytes=10-', 'bytes=5-3', 'bytes=-0']) {
      const response = await fetch(url + 'clip.mp4', { headers: { Range: range } });
      assert.equal(response.status, 416);
      assert.equal(response.headers.get('content-range'), 'bytes */10');
      assert.equal(await response.text(), '');
    }
  });
});
