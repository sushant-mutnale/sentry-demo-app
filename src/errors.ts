export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Mirrors the shape of Prisma's P2024 pool-timeout error so stack traces, tags and
 * the `mechanism` look like the real thing in Sentry. This demo does not use Prisma.
 */
export class PrismaClientKnownRequestError extends Error {
  readonly code = 'P2024';
  readonly clientVersion = '6.7.0';
  readonly meta: Record<string, unknown>;

  constructor(message: string, meta: Record<string, unknown> = {}) {
    super(message);
    this.name = 'PrismaClientKnownRequestError';
    this.meta = meta;
  }
}

export class StripeInvalidRequestError extends Error {
  readonly type = 'StripeInvalidRequestError';
  readonly code = 'resource_missing';
  readonly statusCode = 404;
  readonly requestId = `req_${Math.random().toString(36).slice(2, 12)}`;

  constructor(customerId: string) {
    super(`No such customer: '${customerId}'`);
    this.name = 'StripeInvalidRequestError';
  }
}

export class JobFailedError extends Error {
  readonly jobId: string;
  readonly attempts: number;

  constructor(jobName: string, attempts: number, cause: unknown) {
    super(`${jobName} failed after ${attempts} attempts`, { cause });
    this.name = 'JobFailedError';
    this.jobId = `job_${Math.random().toString(36).slice(2, 10)}`;
    this.attempts = attempts;
  }
}
