import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import pino from 'pino';
import { env } from './env.js';

mkdirSync(resolve('logs'), { recursive: true });

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'Authorization', 'Cookie'],
    censor: '[redacted]',
  },
  base: { service: 'sentry-demo-app', release: env.SENTRY_RELEASE },
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        level: env.LOG_LEVEL,
        options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
      },
      {
        target: 'pino/file',
        level: env.LOG_LEVEL,
        options: { destination: resolve('logs/app.log'), mkdir: true },
      },
    ],
  },
});
