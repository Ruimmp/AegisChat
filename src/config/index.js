const path = require('path');
require('dotenv').config();

const REQUIRED = ['DISCORD_BOT_TOKEN', 'OPENROUTER_API_KEY', 'GUILD_ID', 'LOG_CHANNEL_ID'];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`AegisChat: Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const config = {
  token: process.env.DISCORD_BOT_TOKEN,
  openRouterKey: process.env.OPENROUTER_API_KEY,
  model: process.env.OPENROUTER_MODEL,
  guildId: process.env.GUILD_ID,
  logChannelId: process.env.LOG_CHANNEL_ID,
  confidenceThreshold: parseInt(process.env.CONFIDENCE_THRESHOLD || '85', 10),
  reviewThreshold: parseInt(process.env.REVIEW_THRESHOLD || '60', 10),
  phashThreshold: parseInt(process.env.PHASH_THRESHOLD || '14', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', '..', 'aegis.db'),
};

module.exports = config;
