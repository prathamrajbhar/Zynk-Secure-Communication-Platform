import { createServiceLogger } from './logger';

const log = createServiceLogger('retry');

// ============================================================================
// Retry with Exponential Backoff
//
// Provides configurable retry logic with:
// - Exponential backoff with jitter
// - Configurable max retries and delays
// - Retryable error filtering
// - Timeout per attempt
// - Callback hooks for monitoring
// ============================================================================

interface RetryOptions {
  /** Maximum number of retry attempts */
  maxAttempts?: number;
  /** Initial delay in ms before first retry */
  initialDelayMs?: number;
  /** Maximum delay between retries in ms */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2 for exponential) */
  backoffMultiplier?: number;
  /** Add random jitter to prevent thundering herd */
  jitter?: boolean;
  /** Determine if an error is retryable */
  isRetryable?: (error: Error, attempt: number) => boolean;
  /** Called before each retry */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
  /** Operation name for logging */
  operationName?: string;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'operationName'>> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: () => true,
};

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number,
  jitter: boolean
): number {
  const exponentialDelay = initialDelay * Math.pow(multiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  
  if (jitter) {
    // Full jitter: random value between 0 and cappedDelay
    return Math.floor(Math.random() * cappedDelay);
  }
  
  return cappedDelay;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff
 * 
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => sendPushNotification(token, payload),
 *   { maxAttempts: 3, operationName: 'push-notification' }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if we should retry
      if (attempt >= opts.maxAttempts || !opts.isRetryable(lastError, attempt)) {
        break;
      }

      const delay = calculateDelay(
        attempt,
        opts.initialDelayMs,
        opts.maxDelayMs,
        opts.backoffMultiplier,
        opts.jitter
      );

      log.warn({
        operation: opts.operationName,
        attempt,
        maxAttempts: opts.maxAttempts,
        delayMs: delay,
        error: lastError.message,
      }, `Retrying ${opts.operationName || 'operation'} in ${delay}ms (attempt ${attempt}/${opts.maxAttempts})`);

      opts.onRetry?.(lastError, attempt, delay);

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Decorator-style retry for class methods
 */
export function retryable(options: RetryOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return withRetry(
        () => originalMethod.apply(this, args),
        { operationName: propertyKey, ...options }
      );
    };

    return descriptor;
  };
}

// ======================== Pre-configured Retry Strategies ========================

/** Retry strategy for database operations */
export const dbRetryOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  jitter: true,
  operationName: 'database',
  isRetryable: (error) => {
    const message = error.message.toLowerCase();
    // Retry on connection errors, deadlocks, serialization failures
    return message.includes('connection') 
      || message.includes('deadlock') 
      || message.includes('serialization')
      || message.includes('timeout');
  },
};

/** Retry strategy for push notifications */
export const pushRetryOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  jitter: true,
  operationName: 'push-notification',
  isRetryable: (error) => {
    // Don't retry on invalid token errors
    const message = error.message.toLowerCase();
    return !message.includes('invalid') && !message.includes('unregistered');
  },
};

/** Retry strategy for Redis operations */
export const redisRetryOptions: RetryOptions = {
  maxAttempts: 2,
  initialDelayMs: 50,
  maxDelayMs: 1000,
  jitter: true,
  operationName: 'redis',
};
