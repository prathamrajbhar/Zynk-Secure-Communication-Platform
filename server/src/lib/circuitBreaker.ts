import { createServiceLogger } from './logger';
import { circuitBreakerState, circuitBreakerTrips } from './metrics';

const log = createServiceLogger('circuit-breaker');

// ============================================================================
// Circuit Breaker Pattern
//
// Prevents cascading failures when external services are unavailable.
// States:
//   CLOSED  → Normal operation, requests pass through
//   OPEN    → Service deemed unavailable, requests fail immediately
//   HALF_OPEN → Testing if service has recovered
//
// Transitions:
//   CLOSED → OPEN:      When failure count exceeds threshold
//   OPEN → HALF_OPEN:   After resetTimeout expires
//   HALF_OPEN → CLOSED: If test request succeeds
//   HALF_OPEN → OPEN:   If test request fails
// ============================================================================

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerOptions {
  /** Name of the service (for logging/metrics) */
  name: string;
  /** Number of failures before opening circuit */
  failureThreshold?: number;
  /** Time in ms before trying again (OPEN → HALF_OPEN) */
  resetTimeoutMs?: number;
  /** Number of successful requests in HALF_OPEN before closing */
  successThreshold?: number;
  /** Timeout for individual requests (ms) */
  requestTimeoutMs?: number;
  /** Custom fallback when circuit is open */
  fallback?: <T>() => T | Promise<T>;
  /** Errors to monitor (by default, all errors trip the breaker) */
  isFailure?: (error: Error) => boolean;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;
  private readonly requestTimeoutMs: number;
  private readonly fallback?: <T>() => T | Promise<T>;
  private readonly isFailure: (error: Error) => boolean;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
    this.successThreshold = options.successThreshold ?? 2;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10000;
    this.fallback = options.fallback;
    this.isFailure = options.isFailure ?? (() => true);
    
    this.updateMetrics();
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttemptTime) {
        // Transition to HALF_OPEN
        this.transition(CircuitState.HALF_OPEN);
      } else {
        // Circuit is open - fail fast
        log.warn({ service: this.name, state: this.state }, 'Circuit breaker OPEN - failing fast');
        if (this.fallback) {
          return this.fallback<T>();
        }
        throw new CircuitBreakerError(`Circuit breaker is OPEN for ${this.name}`);
      }
    }

    try {
      // Execute with timeout
      const result = await this.withTimeout(fn(), this.requestTimeoutMs);
      this.onSuccess();
      return result;
    } catch (error) {
      if (this.isFailure(error as Error)) {
        this.onFailure(error as Error);
      }
      throw error;
    }
  }

  /**
   * Record a successful execution
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.transition(CircuitState.CLOSED);
      }
    }
    this.failureCount = 0;
  }

  /**
   * Record a failed execution
   */
  private onFailure(error: Error): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    log.warn({
      service: this.name,
      state: this.state,
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
      error: error.message,
    }, `Circuit breaker failure ${this.failureCount}/${this.failureThreshold}`);

    if (this.state === CircuitState.HALF_OPEN) {
      this.transition(CircuitState.OPEN);
    } else if (this.failureCount >= this.failureThreshold) {
      this.transition(CircuitState.OPEN);
    }
  }

  /**
   * Transition to a new state
   */
  private transition(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    log.info({
      service: this.name,
      from: oldState,
      to: newState,
    }, `Circuit breaker ${this.name}: ${oldState} → ${newState}`);

    switch (newState) {
      case CircuitState.OPEN:
        this.nextAttemptTime = Date.now() + this.resetTimeoutMs;
        circuitBreakerTrips.inc({ service: this.name });
        break;
      case CircuitState.HALF_OPEN:
        this.successCount = 0;
        break;
      case CircuitState.CLOSED:
        this.failureCount = 0;
        this.successCount = 0;
        break;
    }

    this.updateMetrics();
  }

  /**
   * Execute with timeout
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => { clearTimeout(timer); resolve(result); })
        .catch((error) => { clearTimeout(timer); reject(error); });
    });
  }

  private updateMetrics(): void {
    const stateValue = this.state === CircuitState.CLOSED ? 0 
                     : this.state === CircuitState.HALF_OPEN ? 1 
                     : 2;
    circuitBreakerState.set({ service: this.name }, stateValue);
  }

  getState(): CircuitState { return this.state; }
  getFailureCount(): number { return this.failureCount; }
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

// ======================== Pre-configured Circuit Breakers ========================

/** Circuit breaker for push notification service */
export const pushNotificationBreaker = new CircuitBreaker({
  name: 'push-notifications',
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  requestTimeoutMs: 10000,
});

/** Circuit breaker for external API calls */
export const externalApiBreaker = new CircuitBreaker({
  name: 'external-api',
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  requestTimeoutMs: 5000,
});
