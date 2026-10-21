import * as Sentry from '@sentry/node';
import { env } from './env.js';

if (!env.SENTRY_DSN) {
  // Keep the app usable without a DSN; telemetry is simply dropped.
  console.warn('[sentry-demo-app] SENTRY_DSN is empty - events will NOT be sent. Set it in .env');
}

Sentry.init({
  dsn: env.SENTRY_DSN || undefined,
  environment: env.SENTRY_ENVIRONMENT,
  release: env.SENTRY_RELEASE,
  enableLogs: true,
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
  initialScope: {
    tags: { service: 'sentry-demo-app' },
  },
});
