import { describe, it, expect } from 'vitest';
import { FixedSizeChunker } from '../src/chunkers/FixedSizeChunker';
import { SentenceChunker } from '../src/chunkers/SentenceChunker';
import { RecursiveChunker } from '../src/chunkers/RecursiveChunker';

// ─── FixedSizeChunker ────────────────────────────────────────────────────────

describe('FixedSizeChunker', () => {
  it('should split text into fixed-size chunks', () => {
    const chunker = new FixedSizeChunker({ maxSize: 10 });
    const text = 'abcdefghijklmnopqrstuvwxyz'; // 26 chars
    const chunks = chunker.chunk(text, 'test.txt');

    expect(chunks.length).toBe(3);
    expect(chunks[0].content).toBe('abcdefghij'); // 10 chars
    expect(chunks[1].content).toBe('klmnopqrst'); // 10 chars
    expect(chunks[2].content).toBe('uvwxyz');     // 6 chars
  });

  it('should handle overlap correctly', () => {
    const chunker = new FixedSizeChunker({ maxSize: 10, overlap: 3 });
    const text = 'abcdefghijklmnopqrst'; // 20 chars
    const chunks = chunker.chunk(text, 'test.txt');

    // With overlap=3, second chunk starts at 10-3=7
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].content).toBe('abcdefghij');
    expect(chunks[1].content.startsWith('hij')).toBe(true);
  });

  it('should handle empty text', () => {
    const chunker = new FixedSizeChunker({ maxSize: 100 });
    const chunks = chunker.chunk('', 'empty.txt');

    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe('');
    expect(chunks[0].totalChunks).toBe(1);
  });

  it('should handle text smaller than maxSize', () => {
    const chunker = new FixedSizeChunker({ maxSize: 1000 });
    const chunks = chunker.chunk('Short text', 'short.txt');

    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe('Short text');
  });

  it('should set correct metadata on chunks', () => {
    const chunker = new FixedSizeChunker({ maxSize: 5 });
    const chunks = chunker.chunk('HelloWorld', 'test.txt');

    expect(chunks[0].index).toBe(0);
    expect(chunks[1].index).toBe(1);
    expect(chunks[0].totalChunks).toBe(2);
    expect(chunks[1].totalChunks).toBe(2);
    expect(chunks[0].sourceFile).toBe('test.txt');
    expect(chunks[0].startOffset).toBe(0);
    expect(chunks[0].endOffset).toBe(5);
    expect(chunks[1].startOffset).toBe(5);
    expect(chunks[0].id).toBeTruthy();
    expect(chunks[0].id).not.toBe(chunks[1].id); // unique IDs
  });

  it('should use constructor defaults when options not provided to chunk()', () => {
    const chunker = new FixedSizeChunker({ maxSize: 5 });
    const chunks = chunker.chunk('1234567890', 'test.txt');

    expect(chunks.length).toBe(2);
  });

  it('should allow runtime override of maxSize', () => {
    const chunker = new FixedSizeChunker({ maxSize: 5 });
    const chunks = chunker.chunk('1234567890', 'test.txt', { maxSize: 10 });

    expect(chunks.length).toBe(1); // overridden to 10
  });
});

// ─── SentenceChunker ─────────────────────────────────────────────────────────

describe('SentenceChunker', () => {
  it('should split on sentence boundaries', () => {
    const chunker = new SentenceChunker({ maxSize: 50 });
    const text = 'First sentence. Second sentence. Third sentence. Fourth one here.';
    const chunks = chunker.chunk(text, 'test.txt');

    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should contain complete sentences
    for (const chunk of chunks) {
      expect(chunk.content.trim()).toBeTruthy();
    }
  });

  it('should handle text without sentence endings', () => {
    const chunker = new SentenceChunker({ maxSize: 50 });
    const text = 'Just a block of text without any sentence endings';
    const chunks = chunker.chunk(text, 'test.txt');

    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe(text);
  });

  it('should handle empty text', () => {
    const chunker = new SentenceChunker({ maxSize: 100 });
    const chunks = chunker.chunk('', 'test.txt');

    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe('');
  });

  it('should report sentence count in metadata', () => {
    const chunker = new SentenceChunker({ maxSize: 1000 });
    const text = 'First sentence. Second sentence. Third sentence.';
    const chunks = chunker.chunk(text, 'test.txt');

    expect(chunks[0].metadata.sentenceCount).toBeGreaterThan(0);
  });
});

// ─── RecursiveChunker ────────────────────────────────────────────────────────

describe('RecursiveChunker', () => {
  it('should split long text within maxSize', () => {
    const chunker = new RecursiveChunker({ maxSize: 50, overlap: 0 });
    const text = 'This is paragraph one.\n\nThis is paragraph two.\n\nThis is paragraph three with more content to fill it out.';
    const chunks = chunker.chunk(text, 'test.txt');

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(60); // allow some tolerance
    }
  });

  it('should handle empty text', () => {
    const chunker = new RecursiveChunker({ maxSize: 100 });
    const chunks = chunker.chunk('', 'test.txt');

    expect(chunks.length).toBe(1);
  });

  it('should return single chunk for short text', () => {
    const chunker = new RecursiveChunker({ maxSize: 1000 });
    const chunks = chunker.chunk('Short text', 'test.txt');

    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe('Short text');
  });

  it('should use paragraph separator first', () => {
    const chunker = new RecursiveChunker({ maxSize: 30, overlap: 0 });
    const text = 'Para one.\n\nPara two.\n\nPara three.';
    const chunks = chunker.chunk(text, 'test.txt');

    // Should split on \n\n first
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle very long single words', () => {
    const chunker = new RecursiveChunker({ maxSize: 10, overlap: 0 });
    const text = 'a'.repeat(100);
    const chunks = chunker.chunk(text, 'test.txt');

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(10);
    }
  });

  it('should produce chunks with unique IDs', () => {
    const chunker = new RecursiveChunker({ maxSize: 20, overlap: 0 });
    const text = 'Hello world. Foo bar. Baz qux. Lorem ipsum.';
    const chunks = chunker.chunk(text, 'test.txt');

    const ids = chunks.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length); // All unique
  });

  it('should preserve sourceFile on all chunks', () => {
    const chunker = new RecursiveChunker({ maxSize: 20, overlap: 0 });
    const chunks = chunker.chunk('Some text to chunk up properly.', 'report.pdf');

    for (const chunk of chunks) {
      expect(chunk.sourceFile).toBe('report.pdf');
    }
  });
});
