const { log } = require('../utils/logger');
const { analyzeMessage } = require('./ai.service');
const { downloadImageBuffer, toBase64DataUrl, computeImageHash } = require('../utils/imageDownloader');
const { isKnownScamImageHash, addScamImage, addToPendingQueue, getPendingQueue, removeFromPendingQueue } = require('./scamDatabase');

const SUSPICIOUS_DOMAINS = ['bit.ly', 'tinyurl.com', 'shorturl.at', 'buff.ly', 'freebtc'];

const KEYWORDS = ['btc', 'eth', 'bitcoin', 'ethereum', 'free', 'mrbeast', 'elon', 'musk'];

const urlRegex = /https?:\/\/[^\s]+/i;

const isNewAccount = (ageDays) => ageDays < 30;

const hasSuspiciousUrl = (text) => {
  const urls = text.match(urlRegex) || [];
  return urls.some((url) => SUSPICIOUS_DOMAINS.some((d) => url.toLowerCase().includes(d)));
};

const hasScamKeywords = (text) => {
  const lower = text.toLowerCase();
  return KEYWORDS.some((kw) => lower.includes(kw));
};

const scoreHeuristic = (text, ageDays, recentMessages, attachments = []) => {
  const triggers = [];

  if (hasSuspiciousUrl(text)) triggers.push('suspicious_url');
  if (hasScamKeywords(text)) triggers.push('scam_keywords');

  if (isNewAccount(ageDays)) triggers.push('new_account');
  if (recentMessages > 20 && hasScamKeywords(text)) triggers.push('high_velocity');

  const hasAttachments = attachments.length > 0;
  const isLowText = !text || text.trim().length <= 5;
  if (isNewAccount(ageDays) && hasAttachments && isLowText) {
    triggers.push('suspicious_behavior');
  }

  if (hasAttachments) {
    triggers.push('has_images');
  }

  return triggers;
};

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
    const base64 = toBase64DataUrl(downloaded.buffer, downloaded.mimeType);
    results.push({ url, hash, base64 });
  }
  return results;
};

const scan = async (content, userContext, attachments = []) => {
  const scanText = buildScanText(content, attachments);
  const { ageDays, recentMessages } = userContext;
  const triggers = scoreHeuristic(scanText, ageDays, recentMessages, attachments);

  if (triggers.length === 0) {
    return { action: 'ignore', confidence: 0, reason: 'No heuristics triggered', triggers: [] };
  }

  const imageUrls = attachments.filter((a) => a.url).map((a) => a.url);
  log.debug(`Scan triggered with triggers=${JSON.stringify(triggers)} images=${imageUrls.length}`);

  const images = await fetchImageData(imageUrls);
  log.debug(`Downloaded ${images.length} image(s) for analysis`);

  const knownScamImage = images.find((img) => isKnownScamImageHash(img.hash));
  if (knownScamImage) {
    log.debug(`Known scam image detected: ${knownScamImage.url}`);
    return {
      isScam: true,
      confidence: 100,
      reason: 'Known scam image from local database',
      action: 'delete',
      triggers: [...triggers, 'known_scam_image'],
    };
  }

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
      addScamImage(img.hash, img.url);
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

    const base64 = toBase64DataUrl(downloaded.buffer, downloaded.mimeType);
    const aiResult = await analyzeMessage('', { ageDays: 999, recentMessages: 0 }, [base64]);

    if (!aiResult) {
      log.debug(`AI still unavailable for pending image: ${url}`);
      continue;
    }

    if (aiResult.isScam) {
      addScamImage(hash, url);
      log.info(`Pending image confirmed as scam and added to database: ${url}`);
    } else {
      log.debug(`Pending image cleared by AI: ${url}`);
    }

    removeFromPendingQueue(url);
  }
};

module.exports = { scan, hasSuspiciousUrl, hasScamKeywords, buildScanText, processPendingQueue };
