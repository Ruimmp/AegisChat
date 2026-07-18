const PREFIX = '[AegisChat]';

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const level = process.env.LOG_LEVEL || 'info';

const shouldLog = (lvl) => {
  const current = LOG_LEVELS[level] ?? 1;
  const msgLevel = LOG_LEVELS[lvl] ?? 1;
  return msgLevel >= current;
};

const log = {
  debug: (msg) => {
    if (shouldLog('debug')) console.debug(`${PREFIX} DEBUG: ${msg}`);
  },
  info: (msg) => {
    if (shouldLog('info')) console.log(`${PREFIX} INFO: ${msg}`);
  },
  warn: (msg) => {
    if (shouldLog('warn')) console.warn(`${PREFIX} WARN: ${msg}`);
  },
  error: (msg) => {
    if (shouldLog('error')) console.error(`${PREFIX} ERROR: ${msg}`);
  },
};

const formatDate = (date = new Date()) => date.toISOString().replace('T', ' ').slice(0, 19);

const truncate = (str, max = 200) => (str.length > max ? str.slice(0, max) + '...' : str);

module.exports = { log, formatDate, truncate };
