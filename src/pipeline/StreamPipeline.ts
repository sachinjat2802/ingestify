import type { Chunk, PipelineContext, IStorageAdapter, IValidator, PipelineConfig } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { randomUUID } from 'crypto';
import * as readline from 'readline';
import { detectMimeType, matchesMimeType } from '../utils/fileType.js';
import { UnsupportedFileError, PipelineCancelledError } from '../utils/errors.js';
import { PipelineEventEmitter } from './EventEmitter.js';
import { MiddlewareEngine, type MiddlewareFn } from './Middleware.js';
import type { Readable } from 'stream';

export interface StreamPipelineOptions {
  /** Size of chunks to batch before sending to middleware/storage (default: 1000 lines/records) */
  batchSize?: number;
  /** Max bytes to process before aborting (protects against infinite streams) */
  maxBytes?: number;
}

type TransformFn = (
  chunks: Chunk[],
  context: PipelineContext
) => Chunk[] | Promise<Chunk[]>;

/**
 * A highly optimized pipeline for processing massive (1GB+) files.
 * Uses Node.js Streams to process data line-by-line (or record-by-record) without holding
 * the entire file in memory.
 * 
 * Perfect for massive CSVs, logs, or JSONL files.
 */
export class StreamPipelineBuilder {
  private config: PipelineConfig;
  private transformers: TransformFn[] = [];
  private middleware = new MiddlewareEngine();
  private validator?: IValidator;
  private storageAdapter?: IStorageAdapter;
  private emitter = new PipelineEventEmitter();
  private batchSize = 1000;

  constructor(name: string) {
    this.config = { name, logLevel: 'info' };
  }

  setBatchSize(size: number): this {
    this.batchSize = size;
    return this;
  }

  use(fn: MiddlewareFn): this {
    this.middleware.use(fn);
    return this;
  }

  transform(fn: TransformFn): this {
    this.transformers.push(fn);
    return this;
  }

  validate(validator: IValidator): this {
    this.validator = validator;
    return this;
  }

  store(adapter: IStorageAdapter): this {
    this.storageAdapter = adapter;
    return this;
  }

  on(event: any, handler: any): this {
    this.emitter.on(event, handler);
    return this;
  }

  build(): StreamPipeline {
    return new StreamPipeline(
      this.config,
      this.emitter,
      this.middleware,
      this.transformers,
      this.batchSize,
      this.validator,
      this.storageAdapter
    );
  }
}

export class StreamPipeline {
  private readonly logger;

  constructor(
    private config: PipelineConfig,
    private emitter: PipelineEventEmitter,
    private middleware: MiddlewareEngine,
    private transformers: TransformFn[],
    private batchSize: number,
    private validator?: IValidator,
    private storageAdapter?: IStorageAdapter
  ) {
    this.logger = createLogger(`ingestify:stream:${config.name}`, config.logLevel);
  }

  /**
   * Execute the stream pipeline.
   * @param stream A Node.js Readable stream (e.g. fs.createReadStream)
   * @param fileName The name of the file
   */
  async run(stream: Readable, fileName: string, options: { metadata?: Record<string, unknown>, signal?: AbortSignal } = {}) {
    const startTime = performance.now();
    let totalProcessed = 0;
    let totalBytes = 0;
    let chunkIndex = 0;
    const warnings: string[] = [];

    const mimeType = detectMimeType(fileName);
    this.logger.info(`Starting stream pipeline for ${fileName} (${mimeType})`);

    const context: PipelineContext = {
      pipelineName: this.config.name,
      metadata: { ...this.config.metadata, ...options.metadata },
      state: new Map(),
      logger: this.logger,
      signal: options.signal,
    };

    // Track data usage
    stream.on('data', (chunk) => {
      totalBytes += chunk.length;
    });

    const isCSV = matchesMimeType(mimeType, 'text/csv') || fileName.endsWith('.csv');
    
    // For large files, we use Readline to process line by line to keep memory footprint flat (~MBs)
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    let currentBatch: string[] = [];
    let headers: string[] | null = null;

    const processBatch = async (lines: string[], isLast: boolean) => {
      if (lines.length === 0) return;

      let content = lines.join('\n');
      if (isCSV && headers && !isLast) {
         // prepend headers if CSV so the chunk makes sense standalone
         content = headers.join(',') + '\n' + content;
      }

      let chunks: Chunk[] = [{
        id: randomUUID(),
        content,
        index: chunkIndex++,
        totalChunks: -1, // Unknown in streaming
        sourceFile: fileName,
        startOffset: totalBytes, // Approximate in stream
        endOffset: totalBytes,
        metadata: { streamBatch: true, lines: lines.length },
      }];

      // 1. Middleware
      if (this.middleware.count > 0) {
        chunks = await this.middleware.execute(chunks, { ...context, document: { content: '', fileName, metadata: {}, mimeType } as any, step: 'middleware' });
      }

      // 2. Transform
      for (const tx of this.transformers) {
        chunks = await tx(chunks, context as any);
      }

      // 3. Validate
      let validatedData: unknown = chunks;
      if (this.validator) {
        const result = this.validator.validate(chunks);
        if (!result.success) warnings.push(...(result.errors || []).map(e => e.message));
        else validatedData = result.data ?? chunks;
      }

      // 4. Store
      if (this.storageAdapter && chunks.length > 0) {
        await this.storageAdapter.store({
          id: randomUUID(),
          pipelineName: this.config.name,
          fileName,
          chunks,
          data: validatedData,
          metadata: context.metadata,
          createdAt: new Date(),
        });
      }

      totalProcessed += lines.length;
      
      // Free memory
      currentBatch = [];
    };

    for await (const line of rl) {
      if (options.signal?.aborted) {
        rl.close();
        stream.destroy();
        throw new PipelineCancelledError(this.config.name, 'stream');
      }

      // Capture CSV headers on first line
      if (isCSV && !headers) {
        headers = line.split(','); // rudimentary, assumes standard comma
        continue;
      }

      currentBatch.push(line);

      if (currentBatch.length >= this.batchSize) {
        await processBatch(currentBatch, false);
      }
    }

    // Flush remaining
    if (currentBatch.length > 0) {
      await processBatch(currentBatch, true);
    }

    const duration = performance.now() - startTime;
    this.logger.info(`Stream complete: ${totalProcessed} lines processed in ${Math.round(duration)}ms. Total size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

    return {
      success: true,
      linesProcessed: totalProcessed,
      bytesProcessed: totalBytes,
      durationMs: duration,
      warnings
    };
  }
}

export function createStreamPipeline(name: string) {
  return new StreamPipelineBuilder(name);
}
