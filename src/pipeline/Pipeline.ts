import type {
  PipelineConfig,
  PipelineContext,
  ParsedDocument,
  Chunk,
  IngestResult,
  IngestStats,
  ProgressUpdate,
  IParser,
  IChunker,
  IValidator,
  IStorageAdapter,
  ChunkerOptions,
  LogLevel,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { detectMimeType, matchesMimeType, formatFileSize } from '../utils/fileType.js';
import {
  IngestifyError,
  FileSizeError,
  UnsupportedFileError,
  PipelineCancelledError,
} from '../utils/errors.js';
import { PipelineEventEmitter, type PipelineEventName, type PipelineEvents } from './EventEmitter.js';
import { MiddlewareEngine, type MiddlewareFn } from './Middleware.js';
import { randomUUID } from 'crypto';

// ─── Transformer Function Type ───────────────────────────────────────────────

type TransformFn = (
  chunks: Chunk[],
  context: PipelineContext & { document: ParsedDocument }
) => Chunk[] | Promise<Chunk[]>;

// ─── Pipeline Builder ────────────────────────────────────────────────────────

/**
 * Fluent builder for constructing ingestion pipelines.
 * Implements the Builder pattern with method chaining.
 *
 * @example
 * ```typescript
 * const pipeline = createPipeline('my-pipeline')
 *   .parse(new PDFParser())
 *   .chunk(new RecursiveChunker({ maxSize: 1000 }))
 *   .use(filterEmptyChunks())
 *   .use(deduplicateChunks())
 *   .transform(async (chunks, ctx) => chunks)
 *   .validate(new ZodValidator(schema))
 *   .store(new MemoryAdapter())
 *   .on('progress', (p) => console.log(p.percent))
 *   .build();
 *
 * const result = await pipeline.run(buffer, 'report.pdf');
 * ```
 */
export class PipelineBuilder {
  private config: PipelineConfig;
  private parsers: IParser[] = [];
  private chunker?: IChunker;
  private chunkerOptions?: ChunkerOptions;
  private transformers: TransformFn[] = [];
  private validator?: IValidator;
  private storageAdapter?: IStorageAdapter;
  private emitter = new PipelineEventEmitter();
  private middleware = new MiddlewareEngine();
  // Legacy callbacks (still supported, bridged to emitter)
  private progressCallback?: (update: ProgressUpdate) => void;
  private errorCallback?: (error: Error) => void;

  constructor(name: string) {
    this.config = { name, logLevel: 'info' };
  }

  /** Set the log level for this pipeline. */
  logLevel(level: LogLevel): this {
    this.config.logLevel = level;
    return this;
  }

  /** Set maximum allowed file size. Accepts bytes or strings like '50mb'. */
  maxFileSize(size: number): this {
    this.config.maxFileSize = size;
    return this;
  }

  /** Restrict allowed file types. Accepts MIME types or extensions like '.pdf'. */
  allowTypes(types: string[]): this {
    this.config.allowedTypes = types;
    return this;
  }

  /** Add a parser. Multiple parsers can be registered — the right one is picked by MIME type. */
  parse(parser: IParser): this {
    this.parsers.push(parser);
    return this;
  }

  /** Set the chunker with optional configuration. */
  chunk(chunker: IChunker, options?: ChunkerOptions): this {
    this.chunker = chunker;
    this.chunkerOptions = options;
    return this;
  }

  /** Add a transform function. Multiple transforms are applied in order. */
  transform(fn: TransformFn): this {
    this.transformers.push(fn);
    return this;
  }

  /** Add middleware to the pipeline. Executed during the transform phase. */
  use(fn: MiddlewareFn): this {
    this.middleware.use(fn);
    return this;
  }

  /** Set a validator for the final output. */
  validate(validator: IValidator): this {
    this.validator = validator;
    return this;
  }

  /** Set the storage adapter. */
  store(adapter: IStorageAdapter): this {
    this.storageAdapter = adapter;
    return this;
  }

  /**
   * Register a typed event listener (Observer pattern).
   * Replaces simple callbacks with a full event system.
   */
  on<K extends PipelineEventName>(event: K, handler: (data: PipelineEvents[K]) => void): this {
    this.emitter.on(event, handler);
    return this;
  }

  /** Register a progress callback (legacy — prefer `.on('progress', ...)` ). */
  onProgress(callback: (update: ProgressUpdate) => void): this {
    this.progressCallback = callback;
    return this;
  }

  /** Register an error callback (legacy — prefer `.on('pipeline:error', ...)` ). */
  onError(callback: (error: Error) => void): this {
    this.errorCallback = callback;
    return this;
  }

  /** Build the pipeline into an executable instance. */
  build(): Pipeline {
    if (this.parsers.length === 0) {
      throw new IngestifyError(
        'At least one parser must be registered',
        'CONFIG_ERROR'
      );
    }

    return new Pipeline(
      this.config,
      this.parsers,
      this.emitter,
      this.middleware,
      this.chunker,
      this.chunkerOptions,
      this.transformers,
      this.validator,
      this.storageAdapter,
      this.progressCallback,
      this.errorCallback
    );
  }
}

// ─── Pipeline Executor ───────────────────────────────────────────────────────

interface RunOptions {
  /** Custom metadata to attach to the pipeline context. */
  metadata?: Record<string, unknown>;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

export class Pipeline {
  private readonly logger;

  constructor(
    private config: PipelineConfig,
    private parsers: IParser[],
    private emitter: PipelineEventEmitter,
    private middleware: MiddlewareEngine,
    private chunker?: IChunker,
    private chunkerOptions?: ChunkerOptions,
    private transformers: TransformFn[] = [],
    private validator?: IValidator,
    private storageAdapter?: IStorageAdapter,
    private progressCallback?: (update: ProgressUpdate) => void,
    private errorCallback?: (error: Error) => void
  ) {
    this.logger = createLogger(`ingestify:${config.name}`, config.logLevel);
  }

  /** Get the event emitter for external event listening. */
  get events(): PipelineEventEmitter {
    return this.emitter;
  }

  /** Execute the pipeline on a file buffer. */
  async run(
    input: Buffer | ArrayBuffer | Uint8Array,
    fileName: string,
    options: RunOptions = {}
  ): Promise<IngestResult> {
    const startTime = performance.now();
    const stepTimings: Record<string, number> = {};
    const warnings: string[] = [];

    // Normalize input to Buffer — use zero-copy when possible
    const buffer = this.normalizeInput(input);

    // Build context
    const context: PipelineContext = {
      pipelineName: this.config.name,
      metadata: { ...this.config.metadata, ...options.metadata },
      state: new Map(),
      logger: this.logger,
      signal: options.signal,
    };

    // Count total steps
    const totalSteps = this.countSteps();
    let currentStep = 0;

    const emitProgress = async (step: string, message: string) => {
      currentStep++;
      const update: ProgressUpdate = {
        step,
        stepIndex: currentStep - 1,
        totalSteps,
        percent: Math.round((currentStep / totalSteps) * 100),
        message,
      };
      this.progressCallback?.(update);
      await this.emitter.emit('progress', update);
    };

    const checkCancelled = async (step: string) => {
      if (options.signal?.aborted) {
        await this.emitter.emit('pipeline:cancelled', {
          pipelineName: this.config.name,
          step,
        });
        throw new PipelineCancelledError(this.config.name, step);
      }
    };

    try {
      // ─── Emit start ─────────────────────────────────────────────────
      await this.emitter.emit('pipeline:start', {
        pipelineName: this.config.name,
        fileName,
        fileSizeBytes: buffer.length,
      });

      this.logger.info(`Starting pipeline "${this.config.name}" for file "${fileName}" (${formatFileSize(buffer.length)})`);

      // ─── Pre-flight checks ──────────────────────────────────────────
      if (this.config.maxFileSize && buffer.length > this.config.maxFileSize) {
        throw new FileSizeError(buffer.length, this.config.maxFileSize);
      }

      const mimeType = detectMimeType(fileName);

      if (this.config.allowedTypes?.length) {
        const allowed = this.config.allowedTypes.some(t => matchesMimeType(mimeType, t));
        if (!allowed) {
          throw new UnsupportedFileError(mimeType, fileName);
        }
      }

      // ─── Step 1: Parse ──────────────────────────────────────────────
      await checkCancelled('parse');
      await this.emitter.emit('step:before', { step: 'parse', stepIndex: 0, totalSteps });
      const parseStart = performance.now();
      await emitProgress('parse', `Parsing ${fileName}...`);

      const parser = this.findParser(mimeType, fileName);
      const document = await parser.parse(buffer, fileName);
      document.mimeType = mimeType;

      const parseDuration = performance.now() - parseStart;
      stepTimings['parse'] = parseDuration;
      await this.emitter.emit('step:after', { step: 'parse', stepIndex: 0, totalSteps, durationMs: parseDuration });
      await this.emitter.emit('parse:complete', { document, durationMs: parseDuration });
      this.logger.info(`Parsed: ${document.content.length} characters extracted`);

      // ─── Step 2: Chunk ──────────────────────────────────────────────
      let chunks: Chunk[] = [];

      if (this.chunker) {
        await checkCancelled('chunk');
        await this.emitter.emit('step:before', { step: 'chunk', stepIndex: 1, totalSteps });
        const chunkStart = performance.now();
        await emitProgress('chunk', 'Chunking content...');

        chunks = this.chunker.chunk(document.content, fileName, this.chunkerOptions);

        const chunkDuration = performance.now() - chunkStart;
        stepTimings['chunk'] = chunkDuration;
        await this.emitter.emit('step:after', { step: 'chunk', stepIndex: 1, totalSteps, durationMs: chunkDuration });
        await this.emitter.emit('chunk:complete', { chunks, count: chunks.length, durationMs: chunkDuration });
        this.logger.info(`Chunked: ${chunks.length} chunks created`);
      } else {
        // Null Object pattern — single chunk when no chunker configured
        chunks = [{
          id: randomUUID(),
          content: document.content,
          index: 0,
          totalChunks: 1,
          sourceFile: fileName,
          startOffset: 0,
          endOffset: document.content.length,
          metadata: {},
        }];
      }

      // ─── Step 3: Middleware ──────────────────────────────────────────
      if (this.middleware.count > 0) {
        await checkCancelled('middleware');
        await this.emitter.emit('step:before', { step: 'middleware', stepIndex: 2, totalSteps });
        const mwStart = performance.now();
        await emitProgress('middleware', 'Running middleware...');

        chunks = await this.middleware.execute(chunks, {
          ...context,
          document,
          step: 'middleware',
        });

        const mwDuration = performance.now() - mwStart;
        stepTimings['middleware'] = mwDuration;
        await this.emitter.emit('step:after', { step: 'middleware', stepIndex: 2, totalSteps, durationMs: mwDuration });
        this.logger.info(`Middleware: ${this.middleware.count} middleware(s) applied`);
      }

      // ─── Step 4: Transform ──────────────────────────────────────────
      if (this.transformers.length > 0) {
        for (let i = 0; i < this.transformers.length; i++) {
          await checkCancelled(`transform-${i}`);
          await this.emitter.emit('step:before', { step: `transform-${i}`, stepIndex: 3, totalSteps });
          const txStart = performance.now();
          await emitProgress('transform', `Applying transform ${i + 1}/${this.transformers.length}...`);

          try {
            // Immutable data flow — create new array from transform
            const transformed = await this.transformers[i](chunks, { ...context, document });
            chunks = [...transformed]; // Defensive copy
          } catch (err) {
            const msg = `Transform ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`;
            warnings.push(msg);
            this.logger.warn(msg);
          }

          const txDuration = performance.now() - txStart;
          stepTimings[`transform-${i}`] = txDuration;
          await this.emitter.emit('step:after', { step: `transform-${i}`, stepIndex: 3, totalSteps, durationMs: txDuration });
          await this.emitter.emit('transform:complete', {
            transformIndex: i,
            totalTransforms: this.transformers.length,
            chunkCount: chunks.length,
            durationMs: txDuration,
          });
        }
        this.logger.info(`Transforms applied: ${this.transformers.length}`);
      }

      // ─── Step 5: Validate ──────────────────────────────────────────
      let validatedData: unknown = chunks;

      if (this.validator) {
        await checkCancelled('validate');
        await this.emitter.emit('step:before', { step: 'validate', stepIndex: 4, totalSteps });
        const valStart = performance.now();
        await emitProgress('validate', 'Validating output...');

        const result = this.validator.validate(chunks);
        if (!result.success) {
          const errors = result.errors || [];
          warnings.push(...errors.map(e => `Validation: ${e.path} — ${e.message}`));
          this.logger.warn(`Validation had ${errors.length} issue(s)`);
        } else {
          validatedData = result.data ?? chunks;
        }

        const valDuration = performance.now() - valStart;
        stepTimings['validate'] = valDuration;
        await this.emitter.emit('step:after', { step: 'validate', stepIndex: 4, totalSteps, durationMs: valDuration });
      }

      // ─── Step 6: Store ─────────────────────────────────────────────
      if (this.storageAdapter) {
        await checkCancelled('store');
        await this.emitter.emit('step:before', { step: 'store', stepIndex: 5, totalSteps });
        const storeStart = performance.now();
        await emitProgress('store', 'Storing results...');

        await this.storageAdapter.store({
          id: randomUUID(),
          pipelineName: this.config.name,
          fileName,
          chunks,
          data: validatedData,
          metadata: context.metadata,
          createdAt: new Date(),
        });

        const storeDuration = performance.now() - storeStart;
        stepTimings['store'] = storeDuration;
        await this.emitter.emit('step:after', { step: 'store', stepIndex: 5, totalSteps, durationMs: storeDuration });
        this.logger.info(`Stored via ${this.storageAdapter.name}`);
      }

      // ─── Build Result ──────────────────────────────────────────────
      const totalTimeMs = performance.now() - startTime;

      const stats: IngestStats = {
        totalTimeMs,
        stepTimings,
        chunkCount: chunks.length,
        fileSizeBytes: buffer.length,
        characterCount: document.content.length,
      };

      this.logger.info(`Pipeline complete in ${totalTimeMs.toFixed(0)}ms`);

      await this.emitter.emit('pipeline:complete', {
        pipelineName: this.config.name,
        totalTimeMs,
        chunkCount: chunks.length,
      });

      return {
        success: true,
        pipelineName: this.config.name,
        document,
        chunks,
        data: validatedData,
        stats,
        warnings,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Pipeline failed: ${err.message}`);
      this.errorCallback?.(err);
      await this.emitter.emit('pipeline:error', {
        pipelineName: this.config.name,
        error: err,
      });
      throw error;
    }
  }

  /** Normalize input to Buffer with zero-copy optimization. */
  private normalizeInput(input: Buffer | ArrayBuffer | Uint8Array): Buffer {
    if (Buffer.isBuffer(input)) return input;

    if (input instanceof ArrayBuffer) {
      // Zero-copy: create Buffer view over the same ArrayBuffer
      return Buffer.from(input);
    }

    if (input instanceof Uint8Array) {
      // Zero-copy: create Buffer view over the same underlying ArrayBuffer
      return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    }

    return Buffer.from(input as ArrayBuffer);
  }

  /** Find the right parser for the given MIME type. */
  private findParser(mimeType: string, fileName: string): IParser {
    const parser = this.parsers.find(p => p.canParse(mimeType));
    if (!parser) {
      throw new UnsupportedFileError(mimeType, fileName);
    }
    return parser;
  }

  /** Count total pipeline steps for progress tracking. */
  private countSteps(): number {
    let count = 1; // parse is always present
    if (this.chunker) count++;
    if (this.middleware.count > 0) count++;
    count += this.transformers.length;
    if (this.validator) count++;
    if (this.storageAdapter) count++;
    return count;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a new pipeline builder.
 *
 * @param name - A human-readable name for the pipeline (used in logs and results)
 */
export function createPipeline(name: string): PipelineBuilder {
  return new PipelineBuilder(name);
}
