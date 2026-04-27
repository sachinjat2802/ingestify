/**
 * Custom error classes for Ingestify.
 * Provides structured, actionable error information.
 */

export class IngestifyError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'IngestifyError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ParseError extends IngestifyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'PARSE_ERROR', details);
    this.name = 'ParseError';
  }
}

export class UnsupportedFileError extends IngestifyError {
  constructor(mimeType: string, fileName: string) {
    super(
      `Unsupported file type "${mimeType}" for file "${fileName}"`,
      'UNSUPPORTED_FILE',
      { mimeType, fileName }
    );
    this.name = 'UnsupportedFileError';
  }
}

export class FileSizeError extends IngestifyError {
  constructor(fileSize: number, maxSize: number) {
    super(
      `File size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds limit of ${(maxSize / 1024 / 1024).toFixed(2)}MB`,
      'FILE_TOO_LARGE',
      { fileSize, maxSize }
    );
    this.name = 'FileSizeError';
  }
}

export class ValidationError extends IngestifyError {
  public readonly validationErrors: Array<{ path: string; message: string }>;

  constructor(errors: Array<{ path: string; message: string }>) {
    super(
      `Validation failed with ${errors.length} error(s): ${errors.map(e => e.message).join(', ')}`,
      'VALIDATION_ERROR',
      { errors }
    );
    this.name = 'ValidationError';
    this.validationErrors = errors;
  }
}

export class StorageError extends IngestifyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'STORAGE_ERROR', details);
    this.name = 'StorageError';
  }
}

export class PipelineError extends IngestifyError {
  public readonly step: string;

  constructor(message: string, step: string, details?: Record<string, unknown>) {
    super(message, 'PIPELINE_ERROR', { ...details, step });
    this.name = 'PipelineError';
    this.step = step;
  }
}

export class PipelineCancelledError extends IngestifyError {
  constructor(pipelineName: string, step: string) {
    super(
      `Pipeline "${pipelineName}" was cancelled during step "${step}"`,
      'PIPELINE_CANCELLED',
      { pipelineName, step }
    );
    this.name = 'PipelineCancelledError';
  }
}
