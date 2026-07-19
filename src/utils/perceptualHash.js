const sharp = require('sharp');
const { log } = require('./logger');

const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;

const computePerceptualHash = async (buffer) => {
  try {
    const { data } = await sharp(buffer)
      .grayscale()
      .resize(HASH_WIDTH, HASH_HEIGHT, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let hash = 0n;
    for (let row = 0; row < HASH_HEIGHT; row++) {
      for (let col = 0; col < HASH_WIDTH - 1; col++) {
        const left = data[row * HASH_WIDTH + col];
        const right = data[row * HASH_WIDTH + col + 1];
        hash = (hash << 1n) | (left > right ? 1n : 0n);
      }
    }

    return hash.toString(16).padStart(16, '0');
  } catch (err) {
    log.warn(`Failed to compute perceptual hash: ${err.message}`);
    return null;
  }
};

const hammingDistance = (hashA, hashB) => {
  if (!hashA || !hashB) return Infinity;
  let a = BigInt(`0x${hashA}`);
  let b = BigInt(`0x${hashB}`);
  let xor = a ^ b;
  let distance = 0;
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
};

module.exports = { computePerceptualHash, hammingDistance };
