import { CircuitBreaker, CircuitState, CircuitBreakerError } from '../../src/lib/circuitBreaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-service',
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      successThreshold: 2,
      requestTimeoutMs: 5000,
    });
  });

  describe('CLOSED state', () => {
    it('should execute function normally when circuit is closed', async () => {
      const result = await breaker.execute(() => Promise.resolve('success'));
      expect(result).toBe('success');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should track failures and remain closed under threshold', async () => {
      const failFn = () => Promise.reject(new Error('fail'));
      
      // 2 failures (threshold is 3)
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getFailureCount()).toBe(2);
    });

    it('should open circuit after reaching failure threshold', async () => {
      const failFn = () => Promise.reject(new Error('fail'));
      
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      }
      
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reset failure count on success', async () => {
      const failFn = () => Promise.reject(new Error('fail'));
      const successFn = () => Promise.resolve('ok');
      
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await breaker.execute(successFn);
      
      expect(breaker.getFailureCount()).toBe(0);
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      // Trip the circuit breaker
      const failFn = () => Promise.reject(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(failFn); } catch {}
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should fail fast when circuit is open', async () => {
      await expect(
        breaker.execute(() => Promise.resolve('should not run'))
      ).rejects.toThrow(CircuitBreakerError);
    });

    it('should use fallback when provided and circuit is open', async () => {
      const breakerWithFallback = new CircuitBreaker({
        name: 'test-fallback',
        failureThreshold: 1,
        resetTimeoutMs: 10000,
        fallback: () => 'fallback-value',
      });

      // Trip it
      try {
        await breakerWithFallback.execute(() => Promise.reject(new Error('fail')));
      } catch {}

      const result = await breakerWithFallback.execute(() => Promise.resolve('normal'));
      expect(result).toBe('fallback-value');
    });
  });

  describe('HALF_OPEN state', () => {
    it('should transition to HALF_OPEN after reset timeout', async () => {
      const breaker = new CircuitBreaker({
        name: 'test-halfopen',
        failureThreshold: 1,
        resetTimeoutMs: 100, // 100ms for test speed
        successThreshold: 1,
        requestTimeoutMs: 5000,
      });

      // Trip
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Next call should try (HALF_OPEN)
      const result = await breaker.execute(() => Promise.resolve('recovered'));
      expect(result).toBe('recovered');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Timeout', () => {
    it('should timeout slow requests', async () => {
      const slowBreaker = new CircuitBreaker({
        name: 'test-timeout',
        failureThreshold: 5,
        requestTimeoutMs: 100,
        resetTimeoutMs: 1000,
      });

      const slowFn = () => new Promise<string>(resolve => 
        setTimeout(() => resolve('too slow'), 500)
      );

      await expect(slowBreaker.execute(slowFn)).rejects.toThrow('timed out');
    });
  });
});
