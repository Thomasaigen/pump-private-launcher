import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../src/storage.mjs';

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const base = { image: png, contentType: 'image/png', name: 'Test', symbol: 'TST', description: 'd' };
function fakePinata(calls) {
  return async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ IpfsHash: url.endsWith('pinFileToIPFS') ? 'QmImageHash12345' : 'QmMetaHash123456' }), { status: 200 });
  };
}
test('uploads the image then metadata JSON and returns the metadata URI', async () => {
  const calls = [];
  const out = await createStorage({ PINATA_JWT: 'jwt' }, fakePinata(calls)).uploadToken(base);
  assert.equal(out.uri, 'https://ipfs.io/ipfs/QmMetaHash123456');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers.authorization, 'Bearer jwt');
  const meta = JSON.parse(JSON.parse(calls[1].init.body).pinataContent ? calls[1].init.body : '{}').pinataContent;
  assert.equal(meta.image, 'https://ipfs.io/ipfs/QmImageHash12345'); assert.equal(meta.symbol, 'TST');
});
test('fails closed without a key, with a wrong type, mismatched content or oversize file', async () => {
  const calls = [];
  await assert.rejects(createStorage({}, fakePinata(calls)).uploadToken(base), e => e.status === 503);
  const s = createStorage({ PINATA_JWT: 'jwt' }, fakePinata(calls));
  await assert.rejects(s.uploadToken({ ...base, contentType: 'image/svg+xml' }), e => e.status === 415);
  await assert.rejects(s.uploadToken({ ...base, image: Buffer.from('<html>') }), e => e.status === 415);
  await assert.rejects(s.uploadToken({ ...base, image: Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]) }), e => e.status === 413);
  assert.equal(calls.length, 0);
});
test('provider auth failure is reported without leaking the key', async () => {
  const s = createStorage({ PINATA_JWT: 'secret-jwt' }, async () => new Response('{}', { status: 401 }));
  await assert.rejects(s.uploadToken(base), e => e.status === 502 && !e.message.includes('secret-jwt'));
});
