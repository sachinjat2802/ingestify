import { describe, it, expect, vi } from 'vitest';
import { createPipeline } from '../src/pipeline/Pipeline';
import { TextParser } from '../src/parsers/TextParser';
import { JSONParser } from '../src/parsers/JSONParser';
import { FixedSizeChunker } from '../src/chunkers/FixedSizeChunker';
import { MemoryAdapter } from '../src/storage/MemoryAdapter';
import { FileSizeError, UnsupportedFileError, PipelineCancelledError } from '../src/utils/errors';

// ─── Pipeline Builder ────────────────────────────────────────────────────────

describe('Pipeline Builder', () => {
  it('should throw if no parser is registered', () => {
    expect(() => {
      createPipeline('empty').build();
    }).toThrow('At least one parser must be registered');
  });

  it('should build a minimal pipeline with just a parser', () => {
    const pipeline = createPipeline('minimal')
      .parse(new TextParser())
      .build();

    expect(pipeline).toBeDefined();
  });
});

// ─── Pipeline Execution ──────────────────────────────────────────────────────

describe('Pipeline Execution', () => {
  it('should run a simple pipeline end-to-end', async () => {
    const pipeline = createPipeline('e2e')
      .parse(new TextParser())
      .logLevel('silent')
      .build();

    const buffer = Buffer.from('Hello, World!');
    const result = await pipeline.run(buffer, 'test.txt');

    expect(result.success).toBe(true);
    expect(result.pipelineName).toBe('e2e');
    expect(result.document.content).toBe('Hello, World!');
    expect(result.chunks.length).toBe(1);
    expect(result.stats.totalTimeMs).toBeGreaterThan(0);
    expect(result.stats.fileSizeBytes).toBe(13);
  });

  it('should chunk content when chunker is provided', async () => {
    const pipeline = createPipeline('chunked')
      .parse(new TextParser())
      .chunk(new FixedSizeChunker({ maxSize: 5 }))
      .logLevel('silent')
      .build();

    const result = await pipeline.run(Buffer.from('HelloWorld'), 'test.txt');

    expect(result.chunks.length).toBe(2);
    expect(result.chunks[0].content).toBe('Hello');
    expect(result.chunks[1].content).toBe('World');
  });

  it('should store results when adapter is provided', async () => {
    const storage = new MemoryAdapter();

    const pipeline = createPipeline('stored')
      .parse(new TextParser())
      .store(storage)
      .logLevel('silent')
      .build();

    await pipeline.run(Buffer.from('Store this'), 'data.txt');

    expect(storage.size).toBe(1);
  });
});

// ─── Validation & Cancellation ───────────────────────────────────────────────

describe('Pipeline Validation', () => {
  it('should reject files exceeding maxFileSize', async () => {
    const pipeline = createPipeline('sized')
      .parse(new TextParser())
      .maxFileSize(10)
      .logLevel('silent')
      .build();

    const bigBuffer = Buffer.alloc(100, 'x');

    await expect(pipeline.run(bigBuffer, 'big.txt'))
      .rejects.toThrow(FileSizeError);
  });

  it('should reject disallowed file types', async () => {
    const pipeline = createPipeline('typed')
      .parse(new TextParser())
      .allowTypes(['application/pdf'])
      .logLevel('silent')
      .build();

    await expect(pipeline.run(Buffer.from('text'), 'test.txt'))
      .rejects.toThrow(UnsupportedFileError);
  });
});

describe('Pipeline Cancellation', () => {
  it('should cancel pipeline via AbortController', async () => {
    const controller = new AbortController();
    controller.abort();

    const pipeline = createPipeline('cancellable')
      .parse(new TextParser())
      .logLevel('silent')
      .build();

    await expect(
      pipeline.run(Buffer.from('test'), 'test.txt', { signal: controller.signal })
    ).rejects.toThrow(PipelineCancelledError);
  });
});

// ─── Events ──────────────────────────────────────────────────────────────────

describe('Pipeline Events', () => {
  it('should emit pipeline:start event', async () => {
    const startSpy = vi.fn();

    const pipeline = createPipeline('events')
      .parse(new TextParser())
      .on('pipeline:start', startSpy)
      .logLevel('silent')
      .build();

    await pipeline.run(Buffer.from('test'), 'test.txt');

    expect(startSpy).toHaveBeenCalledOnce();
  });
});

// ─── Middleware ──────────────────────────────────────────────────────────────

describe('Pipeline Middleware', () => {
  it('should run middleware', async () => {
    let mwRan = false;
    const pipeline = createPipeline('mw')
      .parse(new TextParser())
      .use(async (chunks, ctx, next) => {
        mwRan = true;
        return next();
      })
      .logLevel('silent')
      .build();

    await pipeline.run(Buffer.from('test'), 'test.txt');
    expect(mwRan).toBe(true);
  });
});
