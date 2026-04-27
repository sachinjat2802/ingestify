import type { IChunker, Chunk, ChunkerOptions } from '../types/index.js';
import { randomUUID } from 'crypto';

/**
 * Splits text on sentence boundaries, grouping sentences into chunks
 * that don't exceed the maximum size.
 *
 * @example
 * ```typescript
 * const chunker = new SentenceChunker({ maxSize: 1000 });
 * const chunks = chunker.chunk(text, 'doc.pdf');
 * ```
 */
export class SentenceChunker implements IChunker {
  readonly name = 'SentenceChunker';
  private defaultMaxSize: number;
  private defaultOverlap: number;

  constructor(options?: { maxSize?: number; overlap?: number }) {
    this.defaultMaxSize = options?.maxSize || 1000;
    this.defaultOverlap = options?.overlap || 0;
  }

  chunk(text: string, sourceFile: string, options?: ChunkerOptions): Chunk[] {
    const maxSize = options?.maxSize || this.defaultMaxSize;
    const overlap = options?.overlap || this.defaultOverlap;

    // Split into sentences using regex
    const sentences = this.splitSentences(text);

    if (sentences.length === 0) {
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

    const chunks: Chunk[] = [];
    let currentSentences: string[] = [];
    let currentLength = 0;
    let chunkStartOffset = 0;
    let currentOffset = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.length;

      // If adding this sentence would exceed maxSize, flush current chunk
      if (currentLength + sentenceLength > maxSize && currentSentences.length > 0) {
        const content = currentSentences.join('');
        chunks.push({
          id: randomUUID(),
          content,
          index: chunks.length,
          totalChunks: 0,
          sourceFile,
          startOffset: chunkStartOffset,
          endOffset: chunkStartOffset + content.length,
          metadata: { chunker: this.name, sentenceCount: currentSentences.length },
        });

        // Handle overlap by keeping last N characters worth of sentences
        if (overlap > 0) {
          let overlapLength = 0;
          const overlapSentences: string[] = [];
          for (let i = currentSentences.length - 1; i >= 0; i--) {
            if (overlapLength + currentSentences[i].length > overlap) break;
            overlapSentences.unshift(currentSentences[i]);
            overlapLength += currentSentences[i].length;
          }
          currentSentences = overlapSentences;
          currentLength = overlapLength;
          chunkStartOffset = currentOffset - overlapLength;
        } else {
          currentSentences = [];
          currentLength = 0;
          chunkStartOffset = currentOffset;
        }
      }

      currentSentences.push(sentence);
      currentLength += sentenceLength;
      currentOffset += sentenceLength;
    }

    // Flush remaining
    if (currentSentences.length > 0) {
      const content = currentSentences.join('');
      chunks.push({
        id: randomUUID(),
        content,
        index: chunks.length,
        totalChunks: 0,
        sourceFile,
        startOffset: chunkStartOffset,
        endOffset: chunkStartOffset + content.length,
        metadata: { chunker: this.name, sentenceCount: currentSentences.length },
      });
    }

    // Update total counts
    chunks.forEach(c => (c.totalChunks = chunks.length));

    return chunks;
  }

  /** Split text into sentences while preserving trailing spaces/newlines. */
  private splitSentences(text: string): string[] {
    // Split on sentence-ending punctuation followed by whitespace
    const parts = text.match(/[^.!?\n]+[.!?\n]+[\s]*/g);
    if (!parts) return text.length > 0 ? [text] : [];

    // Check if there's remaining text not captured
    const captured = parts.join('');
    if (captured.length < text.length) {
      parts.push(text.slice(captured.length));
    }

    return parts;
  }
}
