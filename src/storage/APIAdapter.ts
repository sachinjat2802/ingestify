import type { IStorageAdapter, StorageRecord } from '../types/index.js';
import { StorageError } from '../utils/errors.js';

export interface APIAdapterConfig {
  /** The endpoint URL to POST records to. */
  endpoint: string;
  /** Optional headers to include in requests. */
  headers?: Record<string, string>;
  /** Optional timeout in milliseconds (default: 30000). */
  timeout?: number;
  /** Optional custom fetch function (for environments where global fetch isn't available). */
  fetchFn?: typeof fetch;
}

/**
 * Storage adapter that sends records to an external API via HTTP.
 *
 * @example
 * ```typescript
 * const storage = new APIAdapter({
 *   endpoint: 'https://api.example.com/ingest',
 *   headers: { Authorization: 'Bearer token' },
 * });
 * ```
 */
export class APIAdapter implements IStorageAdapter {
  readonly name = 'APIAdapter';
  private config: Required<Omit<APIAdapterConfig, 'fetchFn'>> & { fetchFn: typeof fetch };

  constructor(config: APIAdapterConfig) {
    this.config = {
      endpoint: config.endpoint,
      headers: config.headers || {},
      timeout: config.timeout || 30000,
      fetchFn: config.fetchFn || globalThis.fetch,
    };
  }

  async store(record: StorageRecord): Promise<{ id: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await this.config.fetchFn(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify(record),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new StorageError(
          `API returned ${response.status}: ${response.statusText}`,
          { endpoint: this.config.endpoint, status: response.status }
        );
      }

      const result = await response.json();
      return { id: result.id || record.id };
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(
        `Failed to store via API: ${err instanceof Error ? err.message : String(err)}`,
        { endpoint: this.config.endpoint }
      );
    }
  }

  async retrieve(id: string): Promise<StorageRecord | null> {
    try {
      const response = await this.config.fetchFn(`${this.config.endpoint}/${id}`, {
        headers: this.config.headers,
      });

      if (response.status === 404) return null;
      if (!response.ok) {
        throw new StorageError(`API returned ${response.status}`, { id });
      }

      return await response.json();
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(
        `Failed to retrieve from API: ${err instanceof Error ? err.message : String(err)}`,
        { id }
      );
    }
  }

  async list(filter?: Record<string, unknown>): Promise<StorageRecord[]> {
    const params = filter ? '?' + new URLSearchParams(
      Object.entries(filter).map(([k, v]) => [k, String(v)])
    ).toString() : '';

    try {
      const response = await this.config.fetchFn(`${this.config.endpoint}${params}`, {
        headers: this.config.headers,
      });

      if (!response.ok) {
        throw new StorageError(`API returned ${response.status}`, { filter });
      }

      return await response.json();
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(
        `Failed to list from API: ${err instanceof Error ? err.message : String(err)}`,
        { filter }
      );
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const response = await this.config.fetchFn(`${this.config.endpoint}/${id}`, {
        method: 'DELETE',
        headers: this.config.headers,
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}
