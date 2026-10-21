import * as Sentry from '@sentry/node';

const FAKE_LATENCY_MS = 10_000;

export interface ModelResponse {
  text: string;
  model: string;
  promptTokens: number;
}

/**
 * Stands in for a Gemini call. It always takes longer than the abort deadline, so the
 * request fails with the same `TimeoutError: The operation was aborted due to timeout`
 * shape a real `AbortSignal.timeout()` fetch produces.
 */
export async function callModel(prompt: string, timeoutMs = 1500): Promise<ModelResponse> {
  return Sentry.startSpan(
    {
      op: 'ai.inference',
      name: 'gemini.generateContent',
      attributes: { 'ai.model': 'gemini-3.5-flash-lite', 'ai.prompt_chars': prompt.length },
    },
    async (span) => {
      const signal = AbortSignal.timeout(timeoutMs);

      try {
        await new Promise<void>((resolvePromise, rejectPromise) => {
          const timer = setTimeout(resolvePromise, FAKE_LATENCY_MS);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            rejectPromise(signal.reason as Error);
          });
        });
      } catch (error) {
        span.setStatus({ code: 2, message: 'deadline_exceeded' });
        throw error;
      }

      return { text: 'ok', model: 'gemini-3.5-flash-lite', promptTokens: Math.ceil(prompt.length / 4) };
    },
  );
}
