const axios = require('axios');
const { log } = require('../utils/logger');

const SYSTEM_PROMPT = `You are a Discord security moderator specializing in image scam detection. Analyze ONLY the visual content of the attached image(s). Look for: fake giveaways, impersonation of celebrities (MrBeast, Elon Musk), cryptocurrency fraud, fake withdrawal proofs, suspicious QR codes, phishing screenshots. IGNORE text-only messages without images. Respond ONLY with valid JSON, no markdown, no explanations: {"isScam": boolean, "confidence": 0-100, "reason": "short string", "action": "delete" | "warn" | "ignore"}.`;

const buildMessages = (prompt, imagesBase64 = []) => {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

  const userContent = [];
  userContent.push({ type: 'text', text: prompt });

  for (const img of imagesBase64) {
    if (img && img.startsWith('data:')) {
      userContent.push({ type: 'image_url', image_url: { url: img } });
    }
  }

  messages.push({ role: 'user', content: userContent });
  return messages;
};

const requestCompletion = async (prompt, imagesBase64, retries, backoff) => {
  const { openRouterKey, model } = require('../config');

  try {
    return await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
        messages: buildMessages(prompt, imagesBase64),
        max_tokens: 512,
        temperature: 0.1,
      },
      {
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
  } catch (err) {
    const status = err.response?.status;
    if (status === 429) {
      log.warn(`OpenRouter rate limit hit (${retries} retries left), backing off ${backoff}ms`);
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, backoff));
        return requestCompletion(prompt, imagesBase64, retries - 1, backoff * 2);
      }
      log.warn('OpenRouter rate limit exhausted, falling back to heuristic-only');
      return null;
    }
    if (status === 404) {
      log.error(`OpenRouter model not found: ${model}. Check OPENROUTER_MODEL in .env`);
      return null;
    }
    if (retries > 0 && err.code !== 'ENOTFOUND') {
      await new Promise((r) => setTimeout(r, backoff));
      return requestCompletion(prompt, imagesBase64, retries - 1, backoff * 2);
    }
    log.error(`OpenRouter API failed: ${err.message}`);
    return null;
  }
};

const callOpenRouter = async (prompt, imagesBase64 = [], retries = 5, backoff = 2000) => {
  const response = await requestCompletion(prompt, imagesBase64, retries, backoff);
  if (!response) return null;

  const content = response.data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    log.warn('OpenRouter returned an empty response, falling back to heuristics');
    return null;
  }

  const cleaned = content.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    log.warn(`OpenRouter returned invalid JSON, falling back to heuristics: ${err.message}`);
    return null;
  }
};

const analyzeMessage = async (content, userContext, imagesBase64 = []) => {
  const prompt = `Message text: "${content}". Account age: ${userContext.ageDays} days. Recent messages: ${userContext.recentMessages}. Analyze the image(s) for scam indicators.`;

  const result = await callOpenRouter(prompt, imagesBase64);
  if (!result) return null;

  const confidence = typeof result.confidence === 'number' ? result.confidence : 0;

  return {
    isScam: result.isScam === true,
    confidence: Math.min(Math.max(confidence, 0), 100),
    reason: typeof result.reason === 'string' ? result.reason : 'No reason provided',
    action: ['delete', 'warn', 'ignore'].includes(result.action) ? result.action : 'ignore',
  };
};

module.exports = { analyzeMessage };
