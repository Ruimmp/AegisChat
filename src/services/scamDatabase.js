const { Database } = require('bun:sqlite');
const path = require('path');
const { log } = require('../utils/logger');
const { hammingDistance } = require('../utils/perceptualHash');
const { phashThreshold } = require('../config');

const DB_PATH = path.join(__dirname, '..', '..', 'aegis.db');

const db = new Database(DB_PATH);

db.run(`PRAGMA journal_mode = WAL`);

db.exec(`
  CREATE TABLE IF NOT EXISTS scam_images (
    hash TEXT PRIMARY KEY,
    url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

try {
  db.run(`ALTER TABLE scam_images ADD COLUMN phash TEXT`);
} catch (err) {
  if (!err.message.includes('duplicate column')) {
    log.warn(`Failed to migrate scam_images table: ${err.message}`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS pending_queue (
    url TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

const isKnownScamImageHash = (hash) => {
  if (!hash) return false;
  try {
    const row = db.prepare('SELECT hash FROM scam_images WHERE hash = ?').get(hash);
    return !!row;
  } catch (err) {
    log.warn(`Failed to check scam image hash: ${err.message}`);
    return false;
  }
};

const addScamImage = (hash, url, phash = null) => {
  if (!hash) return;
  try {
    const stmt = db.prepare('INSERT OR IGNORE INTO scam_images (hash, url, phash) VALUES (?, ?, ?)');
    stmt.run(hash, url, phash);
  } catch (err) {
    log.warn(`Failed to add scam image: ${err.message}`);
  }
};

const findSimilarScamImage = (phash, threshold = phashThreshold) => {
  if (!phash) return null;
  try {
    const rows = db.prepare('SELECT hash, url, phash FROM scam_images WHERE phash IS NOT NULL').all();
    for (const row of rows) {
      if (hammingDistance(phash, row.phash) <= threshold) return row;
    }
    return null;
  } catch (err) {
    log.warn(`Failed to search similar scam images: ${err.message}`);
    return null;
  }
};

const addToPendingQueue = (url) => {
  try {
    const stmt = db.prepare('INSERT OR IGNORE INTO pending_queue (url) VALUES (?)');
    stmt.run(url);
  } catch (err) {
    log.warn(`Failed to add to pending queue: ${err.message}`);
  }
};

const removeFromPendingQueue = (url) => {
  try {
    const stmt = db.prepare('DELETE FROM pending_queue WHERE url = ?');
    stmt.run(url);
  } catch (err) {
    log.warn(`Failed to remove from pending queue: ${err.message}`);
  }
};

const getPendingQueue = () => {
  try {
    const rows = db.prepare('SELECT url FROM pending_queue').all();
    return rows.map((row) => row.url);
  } catch (err) {
    log.warn(`Failed to read pending queue: ${err.message}`);
    return [];
  }
};

const clearPendingQueue = () => {
  try {
    db.prepare('DELETE FROM pending_queue').run();
  } catch (err) {
    log.warn(`Failed to clear pending queue: ${err.message}`);
  }
};

module.exports = {
  isKnownScamImageHash,
  findSimilarScamImage,
  addScamImage,
  addToPendingQueue,
  removeFromPendingQueue,
  getPendingQueue,
  clearPendingQueue,
};
