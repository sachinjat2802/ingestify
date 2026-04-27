// ─── Core Types ──────────────────────────────────────────────────────────────

/**
 * Represents a parsed document with extracted content and metadata.
 */
export interface ParsedDocument {
  /** Original file name */
  fileName: string;
  /** MIME type of the source file */
  mimeType: string;
  /** Extracted raw text content */
  content: string;
  /** File metadata (size, pages, author, etc.) */
  metadata: Record<string, unknown>;
  /** Binary buffer of the original file */
  rawBuffer?: Buffer;
}

/**
 * A chunk of text produced by a chunker.
 */
export interface Chunk {
  /** Unique chunk identifier */
  id: string;
  /** The text content of this chunk */
  content: string;
  /** Index of this chunk in the sequence */
  index: number;
  /** Total number of chunks */
  totalChunks: number;
  /** Source document file name */
  sourceFile: string;
  /** Character offset in the original document */
  startOffset: number;
  /** Character end offset in the original document */
  endOffset: number;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Result of a completed pipeline execution.
 */
export interface IngestResult<T = unknown> {
  /** Whether the pipeline completed successfully */
  success: boolean;
  /** Pipeline name */
  pipelineName: string;
  /** Parsed document data */
  document: ParsedDocument;
  /** Generated chunks */
  chunks: Chunk[];
  /** Validated/transformed output data */
  data: T;
  /** Execution stats */
  stats: IngestStats;
  /** Errors encountered (non-fatal) */
  warnings: string[];
}

/**
 * Pipeline execution statistics.
 */
export interface IngestStats {
  /** Total execution time in milliseconds */
  totalTimeMs: number;
  /** Time per step */
  stepTimings: Record<string, number>;
  /** Number of chunks generated */
  chunkCount: number;
  /** Original file size in bytes */
  fileSizeBytes: number;
  /** Characters extracted */
  characterCount: number;
}

/**
 * Progress update during pipeline execution.
 */
export interface ProgressUpdate {
  /** Current step name */
  step: string;
  /** Step index (0-based) */
  stepIndex: number;
  /** Total steps */
  totalSteps: number;
  /** Percentage complete (0-100) */
  percent: number;
  /** Human-readable message */
  message: string;
}

// ─── Pipeline Types ──────────────────────────────────────────────────────────

/**
 * Shared context passed through pipeline steps.
 */
export interface PipelineContext {
  /** Pipeline name */
  pipelineName: string;
  /** User-provided metadata */
  metadata: Record<string, unknown>;
  /** Accumulated state across steps */
  state: Map<string, unknown>;
  /** Logger instance */
  logger: Logger;
  /** Signal for cancellation */
  signal?: AbortSignal;
}

/**
 * A single step in the pipeline.
 */
export interface IPipelineStep<TIn = unknown, TOut = unknown> {
  /** Step name for logging/progress */
  name: string;
  /** Execute this step */
  execute(input: TIn, context: PipelineContext): Promise<TOut>;
}

// ─── Parser Types ────────────────────────────────────────────────────────────

export interface ParserOptions {
  /** Encoding for text files (default: utf-8) */
  encoding?: BufferEncoding;
  /** Extra parser-specific options */
  [key: string]: unknown;
}

export interface IParser {
  /** Supported MIME types */
  supportedTypes: string[];
  /** Parse a file buffer into a ParsedDocument */
  parse(buffer: Buffer, fileName: string, options?: ParserOptions): Promise<ParsedDocument>;
  /** Check if this parser can handle the given MIME type */
  canParse(mimeType: string): boolean;
}

// ─── Chunker Types ───────────────────────────────────────────────────────────

export interface ChunkerOptions {
  /** Maximum chunk size in characters */
  maxSize?: number;
  /** Overlap between chunks in characters */
  overlap?: number;
  /** Separator to split on */
  separators?: string[];
}

export interface IChunker {
  /** Chunker name */
  name: string;
  /** Split text into chunks */
  chunk(text: string, sourceFile: string, options?: ChunkerOptions): Chunk[];
}

// ─── Validator Types ─────────────────────────────────────────────────────────

export interface ValidationResult<T = unknown> {
  success: boolean;
  data?: T;
  errors?: Array<{ path: string; message: string }>;
}

export interface IValidator<T = unknown> {
  /** Validate data against a schema */
  validate(data: unknown): ValidationResult<T>;
}

// ─── Storage Types ───────────────────────────────────────────────────────────

export interface StorageRecord {
  id: string;
  pipelineName: string;
  fileName: string;
  chunks: Chunk[];
  data: unknown;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface IStorageAdapter {
  /** Adapter name */
  name: string;
  /** Store ingested data */
  store(record: StorageRecord): Promise<{ id: string }>;
  /** Retrieve by ID */
  retrieve(id: string): Promise<StorageRecord | null>;
  /** List all records */
  list(filter?: Record<string, unknown>): Promise<StorageRecord[]>;
  /** Delete by ID */
  delete(id: string): Promise<boolean>;
}

// ─── Logger Types ────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// ─── Pipeline Config Types ───────────────────────────────────────────────────

export interface PipelineConfig {
  /** Pipeline name */
  name: string;
  /** Log level */
  logLevel?: LogLevel;
  /** Maximum file size in bytes */
  maxFileSize?: number;
  /** Allowed MIME types */
  allowedTypes?: string[];
  /** Custom metadata to attach */
  metadata?: Record<string, unknown>;
}
