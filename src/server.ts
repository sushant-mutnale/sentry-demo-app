import './instrument.js';
import * as Sentry from '@sentry/node';
import { buildApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled rejection');
  Sentry.captureException(reason);
});

process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'uncaught exception');
  Sentry.captureException(error);
});

const app = buildApp();

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info(
    {
      port: env.PORT,
      environment: env.SENTRY_ENVIRONMENT,
      release: env.SENTRY_RELEASE,
      dsnConfigured: Boolean(env.SENTRY_DSN),
    },
    'sentry-demo-app listening',
  );
  console.log(`
  sentry-demo-app
  ------------------------------------------------------------
  web UI      http://localhost:${env.PORT}/web
  health      http://localhost:${env.PORT}/health
  fire all    http://localhost:${env.PORT}/debug/sentry
  logs        ./logs/app.log
  release     ${env.SENTRY_RELEASE} (${env.SENTRY_ENVIRONMENT})
  dsn         ${env.SENTRY_DSN ? 'configured' : 'MISSING - set SENTRY_DSN in .env'}
`);
} catch (error) {
  logger.error({ err: error }, 'failed to start');
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    await Sentry.close(2_000);
    process.exit(0);
  });
}
