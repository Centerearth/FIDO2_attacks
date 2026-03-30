const pino = require('pino');

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || 'debug',
  redact: {
    paths: ['req.headers.cookie', '*.password', '*.token'],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
});

module.exports = logger;
