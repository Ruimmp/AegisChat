const { log } = require('../utils/logger');
const { analyzeMessage } = require('./ai.service');
const { downloadImageBuffer, toBase64DataUrl, computeImageHash } = require('../utils/imageDownloader');
const { computePerceptualHash } = require('../utils/perceptualHash');
const { archiveScamImage } = require('../utils/imageArchive');
const {
  isKnownScamImageHash,
  findSimilarScamImage,
  addScamImage,
  addToPendingQueue,
  getPendingQueue,
  removeFromPendingQueue,
} = require('./scamDatabase');

const MIN_IMAGES_FOR_AI = 2;

const isNewAccount = (ageDays) => ageDays < 30;

const buildScanText = (content, attachments = []) => {
  const parts = [content];
  for (const att of attachments) {
    if (att.name) parts.push(att.name);
    if (att.url) parts.push(att.url);
  }
  return parts.filter(Boolean).join(' ');
};

const fetchImageData = async (urls = [], maxImages = 3) => {
  const results = [];
  const selected = urls.slice(0, maxImages);
  for (const url of selected) {
    const downloaded = await downloadImageBuffer(url);
    if (!downloaded) continue;
    const hash = computeImageHash(downloaded.buffer);
    const phash = await computePerceptualHash(downloaded.buffer);
    const base64 = toBase64DataUrl(downloaded.buffer, downloaded.mimeType);
    results.push({ url, hash, phash, base64, buffer: downloaded.buffer, mimeType: downloaded.mimeType });
  }
  return results;
};

const scan = async (content, userContext, attachments = []) => {
  const imageUrls = attachments.filter((a) => a.url).map((a) => a.url);

  if (imageUrls.length === 0) {
    return { action: 'ignore', confidence: 0, reason: 'No images to analyze', triggers: [] };
  }

  const { ageDays } = userContext;
  const scanText = buildScanText(content, attachments);

  const images = await fetchImageData(imageUrls);
  log.debug(`Downloaded ${images.length} image(s) for analysis`);

  const knownScamImage = images.find((img) => isKnownScamImageHash(img.hash));
  if (knownScamImage) {
    log.debug(`Known scam image detected (exact match): ${knownScamImage.url}`);
    return {
      isScam: true,
      confidence: 100,
      reason: 'Known scam image from local database',
      action: 'delete',
      triggers: ['known_scam_image'],
    };
  }

  for (const img of images) {
    const similar = findSimilarScamImage(img.phash);
    if (similar) {
      log.debug(`Known scam image detected (similar, hash=${img.phash} matched ${similar.phash}): ${img.url}`);
      addScamImage(img.hash, img.url, img.phash);
      archiveScamImage(img.buffer, img.hash, img.mimeType);
      return {
        isScam: true,
        confidence: 100,
        reason: 'Visually similar to a known scam image in local database',
        action: 'delete',
        triggers: ['known_scam_image_similar'],
      };
    }
  }

  const shouldEscalateToAI = isNewAccount(ageDays) || images.length >= MIN_IMAGES_FOR_AI;
  if (!shouldEscalateToAI) {
    log.debug(`Skipping AI: established account with ${images.length} unrecognized image(s)`);
    return { action: 'ignore', confidence: 0, reason: 'Established account, single unrecognized image', triggers: [] };
  }

  const triggers = [isNewAccount(ageDays) ? 'new_account' : 'multi_image_burst'];
  const imagesBase64 = images.map((img) => img.base64);
  const aiResult = await analyzeMessage(scanText, userContext, imagesBase64);

  if (!aiResult) {
    for (const url of imageUrls) {
      addToPendingQueue(url);
    }
    log.debug(`AI unavailable, added ${imageUrls.length} image(s) to pending queue for later analysis`);
    return { action: 'warn', confidence: 50, reason: 'AI unavailable, heuristics only', triggers };
  }

  log.debug(`AI result: isScam=${aiResult.isScam} confidence=${aiResult.confidence} action=${aiResult.action} reason=${aiResult.reason}`);

  if (aiResult.isScam && images.length > 0) {
    for (const img of images) {
      addScamImage(img.hash, img.url, img.phash);
      archiveScamImage(img.buffer, img.hash, img.mimeType);
    }
    log.debug(`Added ${images.length} scam image(s) to local database`);
  }

  return { ...aiResult, triggers };
};

const processPendingQueue = async () => {
  const queue = getPendingQueue();
  if (queue.length === 0) return;

  log.info(`Processing pending queue: ${queue.length} image(s)`);

  for (const url of queue) {
    const downloaded = await downloadImageBuffer(url);
    if (!downloaded) {
      log.debug(`Failed to download pending image: ${url}`);
      removeFromPendingQueue(url);
      continue;
    }

    const hash = computeImageHash(downloaded.buffer);
    if (isKnownScamImageHash(hash)) {
      log.debug(`Pending image already known: ${url}`);
      removeFromPendingQueue(url);
      continue;
    }

    const phash = await computePerceptualHash(downloaded.buffer);
    const similar = findSimilarScamImage(phash);
    if (similar) {
      log.debug(`Pending image matches known scam image (similar): ${url}`);
      addScamImage(hash, url, phash);
      archiveScamImage(downloaded.buffer, hash, downloaded.mimeType);
      removeFromPendingQueue(url);
      continue;
    }

    const base64 = toBase64DataUrl(downloaded.buffer, downloaded.mimeType);
    const aiResult = await analyzeMessage('', { ageDays: 999, recentMessages: 0 }, [base64]);

    if (!aiResult) {
      log.debug(`AI still unavailable for pending image: ${url}`);
      continue;
    }

    if (aiResult.isScam) {
      addScamImage(hash, url, phash);
      archiveScamImage(downloaded.buffer, hash, downloaded.mimeType);
      log.info(`Pending image confirmed as scam and added to database: ${url}`);
    } else {
      log.debug(`Pending image cleared by AI: ${url}`);
    }

    removeFromPendingQueue(url);
  }
};

module.exports = { scan, buildScanText, processPendingQueue };
