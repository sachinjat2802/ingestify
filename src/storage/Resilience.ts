import type { IStorageAdapter, StorageRecord } from '../types/index.js';
import { StorageError } from '../utils/errors.js';

// ─── Retry Options ───────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 500) */
  initialDelayMs?: number;
  /** Backoff multiplier (default: 2) — delay doubles each retry */
  backoffMultiplier?: number;
  /** Maximum delay cap in milliseconds (default: 10000) */
  maxDelayMs?: number;
  /** Custom function to decide if an error is retryable */
  isRetryable?: (error: Error) => boolean;
  /** Callback on each retry attempt */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

/**
 * Decorator that wraps any `IStorageAdapter` with retry + exponential backoff.
 * Follows the Decorator pattern — transparently adds reliability to any adapter.
 *
 * @example
 * ```typescript
 * const apiAdapter = new APIAdapter({ endpoint: 'https://api.example.com/ingest' });
 *
 * const reliableAdapter = new RetryableStorageAdapter(apiAdapter, {
 *   maxRetries: 3,
 *   initialDelayMs: 500,
 *   backoffMultiplier: 2,
 *   onRetry: (err, attempt, delay) => {
 *     console.log(`Retry ${attempt} after ${delay}ms: ${err.message}`);
 *   },
 * });
 * ```
 */
export class RetryableStorageAdapter implements IStorageAdapter {
  readonly name: string;
  private opts: Required<Omit<RetryOptions, 'isRetryable' | 'onRetry'>> & {
    isRetryable: (error: Error) => boolean;
    onRetry?: (error: Error, attempt: number, delayMs: number) => void;
  };

  constructor(
    private adapter: IStorageAdapter,
    options?: RetryOptions
  ) {
    this.name = `Retryable(${adapter.name})`;
    this.opts = {
      maxRetries: options?.maxRetries ?? 3,
      initialDelayMs: options?.initialDelayMs ?? 500,
      backoffMultiplier: options?.backoffMultiplier ?? 2,
      maxDelayMs: options?.maxDelayMs ?? 10000,
      isRetryable: options?.isRetryable ?? defaultIsRetryable,
      onRetry: options?.onRetry,
    };
  }

  async store(record: StorageRecord): Promise<{ id: string }> {
    return this.withRetry(() => this.adapter.store(record), 'store');
  }

  async retrieve(id: string): Promise<StorageRecord | null> {
    return this.withRetry(() => this.adapter.retrieve(id), 'retrieve');
  }

  async list(filter?: Record<string, unknown>): Promise<StorageRecord[]> {
    return this.withRetry(() => this.adapter.list(filter), 'list');
  }

  async delete(id: string): Promise<boolean> {
    return this.withRetry(() => this.adapter.delete(id), 'delete');
  }

  private async withRetry<T>(fn: () => Promise<T>, operation: string): Promise<T> {
    let lastError: Error | null = null;
    let delay = this.opts.initialDelayMs;

    for (let attempt = 0; attempt <= this.opts.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry if error is not retryable or we're out of attempts
        if (attempt >= this.opts.maxRetries || !this.opts.isRetryable(lastError)) {
          break;
        }

        // Add jitter: ±25% of the delay
        const jitter = delay * 0.25 * (Math.random() * 2 - 1);
        const actualDelay = Math.min(delay + jitter, this.opts.maxDelayMs);

        this.opts.onRetry?.(lastError, attempt + 1, actualDelay);

        await sleep(actualDelay);
        delay *= this.opts.backoffMultiplier;
      }
    }

    throw new StorageError(
      `${operation} failed after ${this.opts.maxRetries + 1} attempts: ${lastError?.message}`,
      { operation, lastError: lastError?.message }
    );
  }
}

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures to trip the breaker (default: 5) */
  failureThreshold?: number;
  /** Cooldown period in milliseconds before trying again (default: 30000) */
  cooldownMs?: number;
  /** Number of successful calls in HALF_OPEN to close the breaker (default: 2) */
  successThreshold?: number;
  /** Callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

/**
 * Circuit breaker decorator for storage adapters.
 * Follows the Circuit Breaker pattern — fails fast when downstream is unhealthy.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Downstream is unhealthy, all requests fail immediately
 * - HALF_OPEN: Testing if downstream has recovered
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreakerAdapter(apiAdapter, {
 *   failureThreshold: 5,
 *   cooldownMs: 30000,
 *   onStateChange: (from, to) => console.log(`Circuit: ${from} → ${to}`),
 * });
 * ```
 */
export class CircuitBreakerAdapter implements IStorageAdapter {
  readonly name: string;
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private opts: Required<Omit<CircuitBreakerOptions, 'onStateChange'>> & {
    onStateChange?: (from: CircuitState, to: CircuitState) => void;
  };

  constructor(
    private adapter: IStorageAdapter,
    options?: CircuitBreakerOptions
  ) {
    this.name = `CircuitBreaker(${adapter.name})`;
    this.opts = {
      failureThreshold: options?.failureThreshold ?? 5,
      cooldownMs: options?.cooldownMs ?? 30000,
      successThreshold: options?.successThreshold ?? 2,
      onStateChange: options?.onStateChange,
    };
  }

  /** Get the current circuit state. */
  getState(): CircuitState {
    return this.state;
  }

  /** Manually reset the circuit breaker to CLOSED. */
  reset(): void {
    this.transition('CLOSED');
    this.failureCount = 0;
    this.successCount = 0;
  }

  async store(record: StorageRecord): Promise<{ id: string }> {
    return this.execute(() => this.adapter.store(record), 'store');
  }

  async retrieve(id: string): Promise<StorageRecord | null> {
    return this.execute(() => this.adapter.retrieve(id), 'retrieve');
  }

  async list(filter?: Record<string, unknown>): Promise<StorageRecord[]> {
    return this.execute(() => this.adapter.list(filter), 'list');
  }

  async delete(id: string): Promise<boolean> {
    return this.execute(() => this.adapter.delete(id), 'delete');
  }

  private async execute<T>(fn: () => Promise<T>, operation: string): Promise<T> {
    // Check if we should allow the request
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed < this.opts.cooldownMs) {
        throw new StorageError(
          `Circuit breaker is OPEN for ${this.adapter.name}. ${operation} rejected. Try again in ${Math.ceil((this.opts.cooldownMs - elapsed) / 1000)}s.`,
          { state: this.state, operation, cooldownRemaining: this.opts.cooldownMs - elapsed }
        );
      }
      // Cooldown elapsed, move to HALF_OPEN
      this.transition('HALF_OPEN');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.opts.successThreshold) {
        this.transition('CLOSED');
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else {
      this.failureCount = 0; // Reset on success in CLOSED state
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.transition('OPEN');
      this.successCount = 0;
    } else if (this.failureCount >= this.opts.failureThreshold) {
      this.transition('OPEN');
    }
  }

  private transition(newState: CircuitState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      this.opts.onStateChange?.(oldState, newState);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Default retryable check — retries on network/timeout errors, not on validation errors */
function defaultIsRetryable(error: Error): boolean {
  const message = error.message.toLowerCase();
  // Retry on network errors, timeouts, 5xx
  if (message.includes('fetch') || message.includes('network') || message.includes('timeout')) return true;
  if (message.includes('econnrefused') || message.includes('econnreset')) return true;
  if (message.includes('503') || message.includes('502') || message.includes('504')) return true;
  if (message.includes('429')) return true; // rate limit
  // Don't retry on 4xx (client errors)
  if (message.includes('400') || message.includes('401') || message.includes('403') || message.includes('404')) return false;
  return false;
}
