import type { IChunker, Chunk, ChunkerOptions } from '../types/index.js';
import { randomUUID } from 'crypto';

/**
 * Recursively splits text using a hierarchy of separators.
 * Similar to LangChain's RecursiveCharacterTextSplitter.
 * Tries to keep semantically related text together.
 *
 * Default separator hierarchy: paragraphs → newlines → sentences → words → characters
 *
 * @example
 * ```typescript
 * const chunker = new RecursiveChunker({ maxSize: 1000, overlap: 100 });
 * const chunks = chunker.chunk(longText, 'document.pdf');
 * ```
 */
export class RecursiveChunker implements IChunker {
  readonly name = 'RecursiveChunker';
  private defaultMaxSize: number;
  private defaultOverlap: number;
  private defaultSeparators: string[];

  constructor(options?: { maxSize?: number; overlap?: number; separators?: string[] }) {
    this.defaultMaxSize = options?.maxSize || 1000;
    this.defaultOverlap = options?.overlap || 100;
    this.defaultSeparators = options?.separators || [
      '\n\n',  // paragraphs
      '\n',    // newlines
      '. ',    // sentences
      ', ',    // clauses
      ' ',     // words
      '',      // characters (last resort)
    ];
  }

  chunk(text: string, sourceFile: string, options?: ChunkerOptions): Chunk[] {
    const maxSize = options?.maxSize || this.defaultMaxSize;
    const overlap = options?.overlap || this.defaultOverlap;
    const separators = options?.separators || this.defaultSeparators;

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

    const splits = this.recursiveSplit(text, separators, maxSize);
    const mergedChunks = this.mergeWithOverlap(splits, maxSize, overlap);

    // Build Chunk objects
    let offset = 0;
    const chunks: Chunk[] = mergedChunks.map((content, index) => {
      // Find the actual offset in the original text
      const startOffset = text.indexOf(content.slice(0, 50), Math.max(0, offset - overlap));
      const actualStart = startOffset >= 0 ? startOffset : offset;

      const chunk: Chunk = {
        id: randomUUID(),
        content,
        index,
        totalChunks: mergedChunks.length,
        sourceFile,
        startOffset: actualStart,
        endOffset: actualStart + content.length,
        metadata: { chunker: this.name },
      };

      offset = actualStart + content.length;
      return chunk;
    });

    return chunks;
  }

  /** Recursively split text using the separator hierarchy. */
  private recursiveSplit(text: string, separators: string[], maxSize: number): string[] {
    if (text.length <= maxSize) {
      return [text.trim()].filter(Boolean);
    }

    // Find the best separator (first one that exists in the text)
    let bestSeparator = '';
    let remainingSeparators = separators;

    for (let i = 0; i < separators.length; i++) {
      if (separators[i] === '' || text.includes(separators[i])) {
        bestSeparator = separators[i];
        remainingSeparators = separators.slice(i + 1);
        break;
      }
    }

    // Split on the best separator
    const parts = bestSeparator === ''
      ? text.split('')
      : text.split(bestSeparator);

    const results: string[] = [];
    let current = '';

    for (const part of parts) {
      const candidate = current
        ? current + bestSeparator + part
        : part;

      if (candidate.length <= maxSize) {
        current = candidate;
      } else {
        // Flush current
        if (current) {
          results.push(current);
        }

        // If this part alone exceeds maxSize, recursively split it
        if (part.length > maxSize) {
          const subSplits = this.recursiveSplit(part, remainingSeparators, maxSize);
          results.push(...subSplits);
          current = '';
        } else {
          current = part;
        }
      }
    }

    // Flush remaining
    if (current) {
      results.push(current);
    }

    return results.map(s => s.trim()).filter(Boolean);
  }

  /** Merge splits and add overlap between adjacent chunks. */
  private mergeWithOverlap(splits: string[], maxSize: number, overlap: number): string[] {
    if (splits.length <= 1 || overlap === 0) {
      return splits;
    }

    const merged: string[] = [];

    for (let i = 0; i < splits.length; i++) {
      if (i === 0) {
        merged.push(splits[i]);
        continue;
      }

      // Add overlap from the end of the previous chunk
      const prevChunk = splits[i - 1];
      const overlapText = prevChunk.slice(-overlap);

      const withOverlap = overlapText + ' ' + splits[i];

      // If overlap makes it too big, just use the split as-is
      if (withOverlap.length > maxSize) {
        merged.push(splits[i]);
      } else {
        merged.push(withOverlap.trim());
      }
    }

    return merged;
  }
}
