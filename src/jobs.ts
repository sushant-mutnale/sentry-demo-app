import * as Sentry from '@sentry/node';
import { logger } from './logger.js';
import { JobFailedError } from './errors.js';

const MAX_ATTEMPTS = 3;

export interface JobResult {
  jobId: string;
  attempts: number;
  status: 'succeeded';
}

export async function runJob(jobName: string, failWith?: string): Promise<JobResult> {
  const jobId = `job_${Math.random().toString(36).slice(2, 10)}`;

  return Sentry.startSpan(
    { op: 'queue.task', name: `run ${jobName}`, attributes: { 'job.name': jobName, 'job.id': jobId } },
    async () => {
      let lastError: unknown;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        Sentry.addBreadcrumb({
          category: 'queue',
          level: attempt === MAX_ATTEMPTS ? 'error' : 'warning',
          message: `${jobName} attempt ${attempt}/${MAX_ATTEMPTS}`,
          data: { jobId, attempt },
        });
        logger.info({ jobId, jobName, attempt }, 'job attempt started');
        Sentry.logger.info('job attempt started', { jobId, jobName, attempt });

        try {
          await new Promise((resolvePromise, rejectPromise) => {
            setTimeout(() => {
              if (failWith) {
                rejectPromise(new Error(`upstream queue unavailable (${failWith})`));
                return;
              }
              resolvePromise(undefined);
            }, 40);
          });

          logger.info({ jobId, jobName, attempt }, 'job succeeded');
          return { jobId, attempts: attempt, status: 'succeeded' as const };
        } catch (error) {
          lastError = error;
          logger.warn({ jobId, jobName, attempt, err: error }, 'job attempt failed');
          Sentry.logger.warn('job attempt failed', { jobId, jobName, attempt });
        }
      }

      throw new JobFailedError(jobName, MAX_ATTEMPTS, lastError);
    },
  );
}
