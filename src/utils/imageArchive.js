const fs = require('fs');
const path = require('path');
const { log } = require('./logger');
const { learnedImagesDir } = require('../config');

const EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const extensionFromMime = (mimeType) => EXTENSION_BY_MIME[mimeType] || '.jpg';

const archiveScamImage = (buffer, hash, mimeType, dir = learnedImagesDir) => {
  if (!buffer || !hash) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${hash}${extensionFromMime(mimeType)}`);
    if (fs.existsSync(filePath)) return;
    fs.writeFileSync(filePath, buffer);
  } catch (err) {
    log.warn(`Failed to archive scam image: ${err.message}`);
  }
};

module.exports = { archiveScamImage };
