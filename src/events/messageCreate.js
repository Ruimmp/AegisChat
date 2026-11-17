const config = require('../config');
const { log, truncate } = require('../utils/logger');
const { scan } = require('../services/scamDetector');

const describeChannel = (channel) => {
  if (!channel) return 'unknown';
  if (channel.isThread()) return `thread '${channel.name || channel.id}' under #${channel.parent?.name || channel.parentId || 'unknown'}`;
  if (channel.isVoiceBased()) return `voice chat of '${channel.name || channel.id}'`;
  return `#${channel.name || channel.id}`;
};

const setupMessageCreate = (client) => {
  client.on('messageCreate', async (msg) => {
    log.debug(
      `Received message from ${msg.author.tag} in guild ${msg.guildId} (${describeChannel(msg.channel)}): ${truncate(msg.content || '[no text]', 100)} attachments=${msg.attachments.size}`
    );

    if (msg.author.bot) {
      log.debug('Ignored bot message');
      return;
    }

    if (msg.guildId !== config.guildId) {
      log.debug(`Ignored message from guild ${msg.guildId}, expected ${config.guildId}`);
      return;
    }

    const ageDays = msg.author.createdAt ? Math.floor((Date.now() - msg.author.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 999;

    const userContext = { ageDays, recentMessages: 0 };

    let result;
    try {
      result = await scan(
        msg.content,
        userContext,
        msg.attachments.map((a) => ({ name: a.name, url: a.url }))
      );
    } catch (err) {
      log.error(`Scan failed: ${err.message}`);
      return;
    }

    if (!result || result.action === 'ignore') {
      log.debug(`Scan result: ignore (triggers: ${JSON.stringify(result?.triggers || [])})`);
      return;
    }

    const confidence = result.confidence || 0;
    const isScam = result.isScam === true;
    const deleted = isScam && confidence >= config.confidenceThreshold && result.action === 'delete';

    log.info(
      `USER: ${msg.author.tag} (${msg.author.id}) | AGE: ${ageDays}d | WHERE: ${describeChannel(msg.channel)} | MSG: ${truncate(msg.content || '[no text]', 120)} | RESULT: action=${result.action} confidence=${confidence} isScam=${isScam} reason=${result.reason} deleted=${deleted ? 'Yes' : 'No'}`
    );

    if (deleted) {
      try {
        await msg.delete();
        log.info(`Deleted scam message from ${msg.author.tag}: ${truncate(msg.content || '[no text]')}`);
      } catch (err) {
        log.error(`Failed to delete message: ${err.message}`);
      }
    }

    if (confidence >= config.reviewThreshold) {
      const logChannel = await client.channels.fetch(config.logChannelId).catch(() => null);
      if (logChannel?.isTextBased()) {
        const embed = {
          title: `AegisChat Review: ${isScam ? 'SCAM DETECTED' : 'Suspicious'}`,
          url: msg.url,
          description: truncate(msg.content || '[no text]', 500),
          fields: [
            { name: 'User', value: `${msg.author.tag} (${msg.author.id})`, inline: true },
            { name: 'Channel', value: `<#${msg.channelId}>`, inline: true },
            { name: 'Confidence', value: `${confidence}%`, inline: true },
            { name: 'Reason', value: result.reason, inline: false },
            { name: 'Action', value: result.action, inline: true },
            {
              name: 'Deleted',
              value: isScam && confidence >= config.confidenceThreshold && result.action === 'delete' ? 'Yes' : 'No',
              inline: true,
            },
          ],
          timestamp: msg.createdAt.toISOString(),
          color: isScam ? 0xff0000 : 0xffa500,
        };

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  });
};

module.exports = { setupMessageCreate };
