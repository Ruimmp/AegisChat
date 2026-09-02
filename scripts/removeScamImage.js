const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { log } = require('../src/utils/logger');
const { removeScamImage } = require('../src/services/scamDatabase');
const { dbPath, learnedImagesDir } = require('../src/config');

const listScamImages = () => {
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare('SELECT hash, url, created_at FROM scam_images ORDER BY created_at DESC').all();
  db.close();
  return rows;
};

const removeLearnedImageFiles = (hash, dir = learnedImagesDir) => {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(dir)) {
    if (path.parse(entry).name === hash) {
      fs.unlinkSync(path.join(dir, entry));
      removed++;
    }
  }
  return removed;
};

const main = () => {
  const hash = process.argv[2];

  if (!hash) {
    const rows = listScamImages();
    if (rows.length === 0) {
      log.info('No scam image hashes in the database.');
      return;
    }
    log.info(`${rows.length} scam image hash(es) in the database:`);
    for (const row of rows) {
      log.info(`${row.hash}  ${row.created_at}  ${row.url}`);
    }
    log.info('Run "npm run unscam -- <hash>" to remove one.');
    return;
  }

  const removedFromDb = removeScamImage(hash);
  const removedFiles = removeLearnedImageFiles(hash);

  if (removedFromDb) {
    log.info(`Removed scam image hash from database: ${hash}`);
  } else {
    log.warn(`No scam image found in database with hash: ${hash}`);
  }

  if (removedFiles > 0) {
    log.info(`Removed ${removedFiles} learned image file(s) for hash: ${hash}`);
  }

  if (!removedFromDb && removedFiles === 0) {
    log.warn(`Hash ${hash} was not found in the database or learned-images folder.`);
  } else {
    log.info('Cleanup complete — this hash will not be re-seeded.');
  }
};

main();
