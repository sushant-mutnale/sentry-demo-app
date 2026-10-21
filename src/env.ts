import { execSync } from 'node:child_process';

function gitSha(): string | undefined {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

export const env = {
  PORT: Number(process.env.PORT ?? 3000),
  SENTRY_DSN: process.env.SENTRY_DSN ?? '',
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT ?? 'development',
  SENTRY_RELEASE: process.env.SENTRY_RELEASE || gitSha() || 'local',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  DATABASE_PATH: process.env.DATABASE_PATH ?? './data/demo.db',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6399',
  POOL_TIMEOUT_MS: Number(process.env.POOL_TIMEOUT_MS ?? 5000),
} as const;
