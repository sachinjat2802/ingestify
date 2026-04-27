import type { IStorageAdapter, StorageRecord } from '../types/index.js';

/**
 * In-memory storage adapter. Great for development, testing, and prototyping.
 * Data is lost when the process exits.
 *
 * @example
 * ```typescript
 * const storage = new MemoryAdapter();
 * const pipeline = createPipeline('test').parse(...).store(storage).build();
 *
 * await pipeline.run(buffer, 'file.pdf');
 * const records = await storage.list();
 * ```
 */
export class MemoryAdapter implements IStorageAdapter {
  readonly name = 'MemoryAdapter';
  private records: Map<string, StorageRecord> = new Map();

  async store(record: StorageRecord): Promise<{ id: string }> {
    this.records.set(record.id, { ...record });
    return { id: record.id };
  }

  async retrieve(id: string): Promise<StorageRecord | null> {
    return this.records.get(id) || null;
  }

  async list(filter?: Record<string, unknown>): Promise<StorageRecord[]> {
    let records = Array.from(this.records.values());

    if (filter) {
      records = records.filter(record => {
        return Object.entries(filter).every(([key, value]) => {
          if (key === 'pipelineName') return record.pipelineName === value;
          if (key === 'fileName') return record.fileName === value;
          return record.metadata[key] === value;
        });
      });
    }

    return records;
  }

  async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }

  /** Clear all stored records. */
  clear(): void {
    this.records.clear();
  }

  /** Get the count of stored records. */
  get size(): number {
    return this.records.size;
  }
}
