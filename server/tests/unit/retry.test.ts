import { withRetry } from '../../src/lib/retry';

describe('withRetry', () => {
  it('should resolve immediately on first success', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    
    const result = await withRetry(fn);
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');
    
    const result = await withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 10,
      jitter: false,
    });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after all retries exhausted', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('permanent failure'));
    
    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 10, jitter: false })
    ).rejects.toThrow('permanent failure');
    
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry non-retryable errors', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('invalid token'));
    
    await expect(
      withRetry(fn, {
        maxAttempts: 5,
        initialDelayMs: 10,
        isRetryable: (err) => !err.message.includes('invalid'),
      })
    ).rejects.toThrow('invalid token');
    
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should call onRetry callback before each retry', async () => {
    const onRetry = jest.fn();
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('error'))
      .mockResolvedValue('ok');
    
    await withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 10,
      onRetry,
      jitter: false,
    });
    
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      expect.any(Error),
      1,
      expect.any(Number)
    );
  });

  it('should apply exponential backoff', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const startTime = Date.now();
    
    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 50,
        backoffMultiplier: 2,
        jitter: false,
      })
    ).rejects.toThrow();
    
    const elapsed = Date.now() - startTime;
    // 50ms + 100ms = 150ms minimum (with some tolerance)
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });

  it('should cap delay at maxDelayMs', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const startTime = Date.now();
    
    await expect(
      withRetry(fn, {
        maxAttempts: 4,
        initialDelayMs: 50,
        maxDelayMs: 75,
        backoffMultiplier: 10,
        jitter: false,
      })
    ).rejects.toThrow();
    
    const elapsed = Date.now() - startTime;
    // 50 + 75 + 75 = 200ms max (capped at 75ms)
    expect(elapsed).toBeLessThan(500);
  });
});
