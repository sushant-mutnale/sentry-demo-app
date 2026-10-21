import { createConnection } from 'node:net';
import * as Sentry from '@sentry/node';
import { z } from 'zod';
import { env } from './env.js';
import { findOrder } from './db.js';
import { chargeOrder } from './payments.js';
import { callModel } from './ai.js';
import { logger } from './logger.js';
import { HttpError, PrismaClientKnownRequestError, StripeInvalidRequestError } from './errors.js';

export const FAIL_MODES = ['pool', 'type', 'stripe', 'zod', 'timeout', 'redis', 'unhandled'] as const;
export type FailMode = (typeof FAIL_MODES)[number];

const ToolCallSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(100),
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function poolTimeout(): Promise<never> {
  return Sentry.startSpan(
    {
      op: 'db.sql',
      name: 'BEGIN transaction',
      attributes: { 'db.system': 'postgresql', 'db.operation': 'BEGIN', 'db.pool.size': 17 },
    },
    async (span) => {
      Sentry.addBreadcrumb({
        category: 'prisma',
        level: 'warning',
        message: 'connection pool exhausted',
        data: { active: 17, idle: 0, waiting: 6 },
      });
      logger.warn({ pool: { size: 17, active: 17, idle: 0, waiting: 6 } }, 'pool exhausted');
      Sentry.logger.warn('connection pool exhausted', { active: 17, idle: 0, waiting: 6 });

      await sleep(env.POOL_TIMEOUT_MS);
      span.setStatus({ code: 2, message: 'internal_error' });

      throw new PrismaClientKnownRequestError(
        'Timed out fetching a new connection from the connection pool. (More info: http://pris.ly/d/pool-errors)',
        { code: 'P2024', clientVersion: '6.7.0', connectionLimit: 17, poolTimeoutMs: env.POOL_TIMEOUT_MS },
      );
    },
  );
}

async function typeError(): Promise<never> {
  const order = findOrder('ord_bad_items');
  if (!order) throw new HttpError(500, 'SEED_MISSING', 'ord_bad_items was not seeded');

  Sentry.addBreadcrumb({ category: 'payment', message: 'charging order', data: { orderId: order.id } });
  logger.info({ orderId: order.id }, 'charging order');
  Sentry.logger.info('charging order', { orderId: order.id, itemCount: order.items?.length ?? 0 });

  await chargeOrder(order);
  throw new HttpError(500, 'UNREACHABLE', 'chargeOrder should have thrown');
}

async function stripeError(): Promise<never> {
  Sentry.addBreadcrumb({
    category: 'stripe',
    message: 'customers.retrieve',
    data: { customer: 'cus_Qw3rTy9LmN0p', latency_ms: 212 },
  });
  Sentry.logger.warn('stripe customer lookup failed', { customer: 'cus_Qw3rTy9LmN0p', errorCode: 'resource_missing' });
  throw new StripeInvalidRequestError('cus_Qw3rTy9LmN0p');
}

function zodError(): never {
  Sentry.addBreadcrumb({ category: 'console', level: 'warning', message: 'tool call rejected by schema' });
  Sentry.logger.warn('tool call rejected by schema', { tool: 'sentry_mcp.search_issues' });
  ToolCallSchema.parse({ query: 'is:unresolved', limit: 'twenty' });
  throw new HttpError(500, 'UNREACHABLE', 'zod parse should have thrown');
}

async function timeoutError(): Promise<never> {
  await callModel('Summarise the latest Sentry incident for workspace ws_a91f4c2e7d');
  throw new HttpError(500, 'UNREACHABLE', 'callModel should have thrown');
}

async function redisError(): Promise<never> {
  Sentry.addBreadcrumb({
    category: 'redis',
    level: 'debug',
    message: `connecting to ${env.REDIS_URL}`,
  });
  logger.warn({ redisUrl: env.REDIS_URL }, 'connecting to redis');

  const target = new URL(env.REDIS_URL);
  const port = Number(target.port || 6379);

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const socket = createConnection({ host: target.hostname, port });
    socket.once('connect', () => {
      socket.destroy();
      resolvePromise();
    });
    socket.once('error', (error) => {
      socket.destroy();
      rejectPromise(error);
    });
  });

  throw new HttpError(500, 'UNREACHABLE', 'redis connect should have thrown');
}

function unhandledRejection(): { scheduled: true } {
  Sentry.addBreadcrumb({ category: 'job', level: 'warning', message: 'reconciliation worker scheduled' });
  Sentry.logger.warn('scheduling reconciliation worker', { job: 'billing-reconcile' });
  void Promise.reject(new Error('Unhandled rejection: billing reconciliation worker crashed'));
  return { scheduled: true };
}

export async function triggerFailure(mode: FailMode): Promise<never | { scheduled: true }> {
  switch (mode) {
    case 'pool':
      return poolTimeout();
    case 'type':
      return typeError();
    case 'stripe':
      return stripeError();
    case 'zod':
      return zodError();
    case 'timeout':
      return timeoutError();
    case 'redis':
      return redisError();
    case 'unhandled':
      return unhandledRejection();
    default:
      throw new HttpError(400, 'INVALID_FAIL_MODE', `Unknown failure mode: ${String(mode)}`);
  }
}
