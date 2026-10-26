import { fail } from './validation.mjs';

const TYPES = {
  'image/png': b => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/gif': b => b.length > 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')),
  'image/webp': b => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};
export const IMAGE_TYPES = Object.keys(TYPES);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Uploads the token image and a metadata JSON to IPFS through Pinata and returns the metadata URI.
export function createStorage(env, fetchImpl = fetch) {
  const jwt = env.PINATA_JWT?.trim();
  const gateway = (env.IPFS_GATEWAY_URL?.trim() || 'https://ipfs.io/ipfs/').replace(/\/?$/, '/');
  const pin = async (path, init) => {
    let response;
    try { response = await fetchImpl(`https://api.pinata.cloud/pinning/${path}`, { method: 'POST', ...init, headers: { authorization: `Bearer ${jwt}`, ...(init.headers || {}) }, signal: AbortSignal.timeout(30_000) }); }
    catch { fail('Image storage is unreachable. Try again.', 502); }
    if (!response.ok) fail(response.status === 401 || response.status === 403 ? 'PINATA_JWT was rejected by Pinata. Check the key in Railway.' : 'Image storage rejected the upload.', 502);
    const hash = (await response.json().catch(() => ({})))?.IpfsHash;
    if (typeof hash !== 'string' || !/^[A-Za-z0-9]{10,100}$/.test(hash)) fail('Image storage returned an unexpected response.', 502);
    return hash;
  };
  return {
    get configured() { return Boolean(jwt); },
    async uploadToken({ image, contentType, name, symbol, description }) {
      if (!jwt) fail('Add PINATA_JWT in Railway to upload images, then redeploy.', 503);
      const check = TYPES[contentType];
      if (!check) fail('Image must be PNG, JPEG, GIF or WebP.', 415);
      if (!Buffer.isBuffer(image) || image.length === 0) fail('Choose an image file.');
      if (image.length > MAX_IMAGE_BYTES) fail('Image must be 5 MB or smaller.', 413);
      if (!check(image)) fail('The file content does not match its image type.', 415);
      const form = new FormData();
      form.append('file', new Blob([image], { type: contentType }), 'token');
      form.append('pinataMetadata', JSON.stringify({ name: `${symbol} image` }));
      const imageHash = await pin('pinFileToIPFS', { body: form });
      const metadata = { name, symbol, description, image: `${gateway}${imageHash}`, showName: true };
      const metadataHash = await pin('pinJSONToIPFS', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pinataContent: metadata, pinataMetadata: { name: `${symbol} metadata` } }) });
      return { uri: `${gateway}${metadataHash}`, image: metadata.image };
    },
  };
}
