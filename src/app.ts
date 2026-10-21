import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import Fastify from 'fastify';
import * as Sentry from '@sentry/node';
import { z } from 'zod';
import { env } from './env.js';
import { logger } from './logger.js';
import { findOrder, markOrderPaid } from './db.js';
import { chargeOrder } from './payments.js';
import { runJob } from './jobs.js';
import { FAIL_MODES, triggerFailure, type FailMode } from './failures.js';
import { HttpError, StripeInvalidRequestError } from './errors.js';

const publicDir = resolve('public');

const require = createRequire(import.meta.url);
const sentryBrowserVersion = (require('@sentry/browser/package.json') as { version: string }).version;

const CheckoutSchema = z.object({
  orderId: z.string().min(1),
  promoCode: z.string().optional(),
});

const JobQuerySchema = z.object({
  job: z.string().min(1).default('billing-reconcile'),
  fail: z.string().optional(),
});

let lastDebugRun = 0;

export function buildApp() {
  const app = Fastify({ loggerInstance: logger });

  Sentry.setupFastifyErrorHandler(app);

  app.addHook('onRequest', async (req) => {
    const headerEmail = req.headers['x-user-email'];
    const email = typeof headerEmail === 'string' ? headerEmail : 'demo.user@example.com';
    const workspaceId = String(req.headers['x-workspace-id'] ?? 'ws_a91f4c2e7d');

    const scope = Sentry.getIsolationScope();
    scope.setUser({ id: `usr_${email.split('@')[0]}`, email });
    scope.setTags({ 'workspace.id': workspaceId, service: 'sentry-demo-app' });
    scope.setTag('http.route', req.routeOptions.url ?? req.url);
    scope.addBreadcrumb({
      category: 'http',
      level: 'info',
      message: `${req.method} ${req.url}`,
      data: { requestId: req.id, userAgent: req.headers['user-agent'] },
    });

    logger.info({ requestId: req.id, method: req.method, url: req.url }, 'request started');
  });

  app.addHook('onSend', async (_req, reply) => {
    const traceId = Sentry.getActiveSpan()?.spanContext().traceId;
    if (traceId) reply.header('x-demo-trace-id', traceId);
  });

  app.get('/health', async () => ({
    ok: true,
    release: env.SENTRY_RELEASE,
    environment: env.SENTRY_ENVIRONMENT,
  }));

  app.get('/orders/:id', async (req) => {
    const { id } = req.params as { id: string };

    const order = await Sentry.startSpan(
      {
        op: 'db.sql',
        name: 'SELECT orders WHERE id = ?',
        attributes: { 'db.system': 'sqlite', 'db.operation': 'SELECT' },
      },
      async () => findOrder(id),
    );

    if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', `Order ${id} not found`);

    logger.info({ orderId: order.id, amountCents: order.amountCents }, 'order fetched');
    Sentry.logger.info('order fetched', { orderId: order.id, workspaceId: order.workspaceId });

    return order;
  });

  app.post('/checkout', async (req) => {
    const body = CheckoutSchema.parse(req.body);
    const order = findOrder(body.orderId);
    if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', `Order ${body.orderId} not found`);

    Sentry.addBreadcrumb({
      category: 'payment',
      message: 'charging order',
      data: { orderId: order.id, amountCents: order.amountCents },
    });

    const charge = await chargeOrder(order);
    markOrderPaid(order.id);

    logger.info({ orderId: order.id, chargeId: charge.chargeId }, 'checkout completed');
    Sentry.logger.info('checkout completed', { orderId: order.id, chargeId: charge.chargeId });

    return { ok: true, charge };
  });

  app.post('/webhooks/stripe', async (req) => {
    const event = req.body as {
      id?: string;
      type?: string;
      data?: { object?: { customer?: string } };
    };

    Sentry.addBreadcrumb({
      category: 'http',
      message: 'stripe webhook received',
      data: { eventId: event.id, type: event.type },
    });

    if (event.type !== 'invoice.paid') return { received: true };

    const customer = event.data?.object?.customer ?? 'cus_Qw3rTy9LmN0p';
    Sentry.logger.warn('stripe customer lookup', { customer, eventType: event.type });
    throw new StripeInvalidRequestError(customer);
  });

  app.post('/jobs/run', async (req) => {
    const query = JobQuerySchema.parse(req.query);
    return runJob(query.job, query.fail);
  });

  app.get('/admin/boom', async (req) => {
    const raw = (req.query as { fail?: string }).fail;
    if (!raw || !FAIL_MODES.includes(raw as FailMode)) {
      throw new HttpError(400, 'INVALID_FAIL_MODE', `fail must be one of: ${FAIL_MODES.join(', ')}`);
    }

    return triggerFailure(raw as FailMode);
  });

  app.get('/debug/sentry', async (_req, reply) => {
    if (Date.now() - lastDebugRun < 10_000) {
      throw new HttpError(429, 'RATE_LIMITED', 'Wait 10s between /debug/sentry runs');
    }
    lastDebugRun = Date.now();

    const results: Record<string, string> = {};
    for (const mode of FAIL_MODES) {
      try {
        await triggerFailure(mode);
        results[mode] = 'no error thrown';
      } catch (error) {
        Sentry.captureException(error);
        results[mode] = error instanceof Error ? error.name : 'unknown';
      }
    }

    reply.code(202);
    return { dispatched: results };
  });

  app.get('/config.js', async (_req, reply) => {
    const config = {
      dsn: env.SENTRY_DSN,
      environment: env.SENTRY_ENVIRONMENT,
      release: env.SENTRY_RELEASE,
      // Browser bundle version follows the installed @sentry/browser so the two never drift.
      sentryBundle: `https://browser.sentry-cdn.com/${sentryBrowserVersion}/bundle.min.js`,
    };
    reply.type('application/javascript').send(`window.__DEMO_CONFIG__ = ${JSON.stringify(config)};`);
  });

  app.get('/', async (_req, reply) => reply.redirect('/web'));

  app.get('/web', async (_req, reply) => {
    reply.type('text/html').send(readFileSync(resolve(publicDir, 'index.html')));
  });

  app.get('/web/app.js', async (_req, reply) => {
    reply.type('application/javascript').send(readFileSync(resolve(publicDir, 'app.js')));
  });

  return app;
}
