const fs = require('fs');
const path = require('path');
const { log } = require('../src/utils/logger');
const { computeImageHash } = require('../src/utils/imageDownloader');
const { computePerceptualHash } = require('../src/utils/perceptualHash');
const { addScamImage } = require('../src/services/scamDatabase');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const SEED_DIR = process.env.SEED_IMAGES_DIR || path.join(__dirname, '..', 'seed-images');

const walkImages = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkImages(fullPath));
    } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
};

const seedScamImages = async (dir = SEED_DIR) => {
  const files = walkImages(dir);
  if (files.length === 0) {
    log.debug(`No seed images found in ${dir}`);
    return 0;
  }

  let seeded = 0;
  for (const filePath of files) {
    const buffer = fs.readFileSync(filePath);
    const hash = computeImageHash(buffer);
    const phash = await computePerceptualHash(buffer);
    addScamImage(hash, `local-seed://${path.relative(dir, filePath)}`, phash);
    seeded++;
  }

  log.info(`Seeded ${seeded} scam image(s) from ${dir} into local database`);
  return seeded;
};

if (require.main === module) {
  seedScamImages().catch((err) => {
    log.error(`Seed failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { seedScamImages };
