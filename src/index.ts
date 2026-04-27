// ─── Quick Start ─────────────────────────────────────────────────────────────
export { ingest } from './quickstart.js';
export type { QuickIngestOptions } from './quickstart.js';

// ─── Pipeline ────────────────────────────────────────────────────────────────
export { createPipeline, Pipeline, PipelineBuilder } from './pipeline/Pipeline.js';
export { createStreamPipeline, StreamPipeline, StreamPipelineBuilder } from './pipeline/StreamPipeline.js';
export type { StreamPipelineOptions } from './pipeline/StreamPipeline.js';
export { PipelineEventEmitter } from './pipeline/EventEmitter.js';
export type { PipelineEvents, PipelineEventName } from './pipeline/EventEmitter.js';
export { MiddlewareEngine, filterEmptyChunks, deduplicateChunks, addMetadata, limitChunks, logChunkStats } from './pipeline/Middleware.js';
export type { MiddlewareFn, MiddlewareContext } from './pipeline/Middleware.js';

// ─── Parsers ─────────────────────────────────────────────────────────────────
export {
  AutoParser,
  PDFParser,
  DOCXParser,
  CSVParser,
  ExcelParser,
  JSONParser,
  TextParser,
  ParserRegistry,
} from './parsers/index.js';

// ─── Chunkers ────────────────────────────────────────────────────────────────
export {
  FixedSizeChunker,
  SentenceChunker,
  RecursiveChunker,
} from './chunkers/index.js';

// ─── Validators ──────────────────────────────────────────────────────────────
export { ZodValidator } from './validators/index.js';

// ─── Storage ─────────────────────────────────────────────────────────────────
export { MemoryAdapter, APIAdapter, RetryableStorageAdapter, CircuitBreakerAdapter } from './storage/index.js';
export type { APIAdapterConfig, RetryOptions, CircuitBreakerOptions, CircuitState } from './storage/index.js';

// ─── Utilities ───────────────────────────────────────────────────────────────
export { createLogger, silentLogger } from './utils/logger.js';
export { detectMimeType, getExtension, formatFileSize, parseFileSize } from './utils/fileType.js';
export {
  IngestifyError,
  ParseError,
  UnsupportedFileError,
  FileSizeError,
  ValidationError,
  StorageError,
  PipelineError,
  PipelineCancelledError,
} from './utils/errors.js';

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  ParsedDocument,
  Chunk,
  IngestResult,
  IngestStats,
  ProgressUpdate,
  PipelineContext,
  IPipelineStep,
  IParser,
  ParserOptions,
  IChunker,
  ChunkerOptions,
  IValidator,
  ValidationResult,
  IStorageAdapter,
  StorageRecord,
  PipelineConfig,
  Logger,
  LogLevel,
} from './types/index.js';
