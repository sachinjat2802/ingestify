import type { IChunker, Chunk, ChunkerOptions } from '../types/index.js';
import { randomUUID } from 'crypto';

/**
 * Splits text into fixed-size character chunks with optional overlap.
 *
 * @example
 * ```typescript
 * const chunker = new FixedSizeChunker({ maxSize: 500, overlap: 50 });
 * const chunks = chunker.chunk(text, 'doc.pdf');
 * ```
 */
export class FixedSizeChunker implements IChunker {
  readonly name = 'FixedSizeChunker';
  private defaultMaxSize: number;
  private defaultOverlap: number;

  constructor(options?: { maxSize?: number; overlap?: number }) {
    this.defaultMaxSize = options?.maxSize || 1000;
    this.defaultOverlap = options?.overlap || 0;
  }

  chunk(text: string, sourceFile: string, options?: ChunkerOptions): Chunk[] {
    const maxSize = options?.maxSize || this.defaultMaxSize;
    const overlap = options?.overlap || this.defaultOverlap;
    const chunks: Chunk[] = [];

    if (!text || text.length === 0) {
      return [{
        id: randomUUID(),
        content: '',
        index: 0,
        totalChunks: 1,
        sourceFile,
        startOffset: 0,
        endOffset: 0,
        metadata: { chunker: this.name },
      }];
    }

    let start = 0;
    let index = 0;

    while (start < text.length) {
      const end = Math.min(start + maxSize, text.length);
      const content = text.slice(start, end);

      chunks.push({
        id: randomUUID(),
        content,
        index,
        totalChunks: 0, // will be updated below
        sourceFile,
        startOffset: start,
        endOffset: end,
        metadata: { chunker: this.name },
      });

      start = end - overlap;
      if (start >= text.length) break;
      if (end === text.length) break;
      index++;
    }

    // Update total counts
    chunks.forEach(c => (c.totalChunks = chunks.length));

    return chunks;
  }
}
