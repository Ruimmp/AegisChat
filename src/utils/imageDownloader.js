const axios = require('axios');
const crypto = require('crypto');
const { log } = require('./logger');

const MAX_IMAGE_BYTES = 1_000_000;

const downloadImageBuffer = async (url) => {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    const buffer = Buffer.from(response.data, 'binary');
    if (buffer.length > MAX_IMAGE_BYTES) return null;
    const contentType = response.headers['content-type'] || 'image/png';
    const mimeType = contentType.split(';')[0].trim();
    return { buffer, mimeType };
  } catch (err) {
    log.warn(`Failed to download image: ${err.message}`);
    return null;
  }
};

const toBase64DataUrl = (buffer, mimeType) => `data:${mimeType};base64,${buffer.toString('base64')}`;

const computeImageHash = (buffer) => {
  if (!buffer || !Buffer.isBuffer(buffer)) return null;
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

module.exports = { downloadImageBuffer, toBase64DataUrl, computeImageHash };
