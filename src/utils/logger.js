import config from '../config/index.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel];

const write = (level, message, meta = {}) => {
  if (config.isTest || LEVELS[level] < threshold) return;

  const entry = { time: new Date().toISOString(), level, message, ...meta };
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;

  if (config.isProduction) {
    // Structured JSON lines for log aggregators (Datadog, ELK, CloudWatch, ...)
    stream(JSON.stringify(entry));
  } else {
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    stream(`[${entry.time}] ${level.toUpperCase().padEnd(5)} ${message}${extra}`);
  }
};

const logger = {
  debug: (msg, meta) => write('debug', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};

export default logger;
