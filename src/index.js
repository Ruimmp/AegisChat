const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { log } = require('./utils/logger');
const { setupMessageCreate } = require('./events/messageCreate');
const { processPendingQueue } = require('./services/scamDetector');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once('clientReady', () => {
  log.info(`Logged in as ${client.user.tag}`);
  log.info(`Guilds: ${client.guilds.cache.map((g) => `${g.name} (${g.id})`).join(', ') || 'None'}`);

  const queueInterval = setInterval(
    async () => {
      try {
        await processPendingQueue();
      } catch (err) {
        log.error(`Pending queue processing failed: ${err.message}`);
      }
    },
    5 * 60 * 1000
  );

  process.on('SIGINT', () => {
    clearInterval(queueInterval);
    client.destroy();
    process.exit(0);
  });
});

setupMessageCreate(client);

client.on('error', (err) => log.error(`Discord client error: ${err.message}`));
process.on('unhandledRejection', (err) => log.error(`Unhandled rejection: ${err?.message || err}`));

client.login(config.token);
