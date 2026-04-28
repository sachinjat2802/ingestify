import type { Pipeline } from '../pipeline/Pipeline.js';
import type { IngestResult } from '../types/index.js';
import { FileSizeError, UnsupportedFileError, IngestifyError } from '../utils/errors.js';
import { parseFileSize, matchesMimeType, detectMimeType } from '../utils/fileType.js';

export interface UploadHandlerConfig {
  /** The pipeline to execute on uploaded files. */
  pipeline: Pipeline;
  /** Maximum file size (bytes or string like '50mb'). Default: '50mb'. */
  maxFileSize?: string | number;
  /** Allowed file types (MIME types or extensions). Default: all types. */
  allowedTypes?: string[];
  /** Callback after successful ingestion. */
  onComplete?: (result: IngestResult) => void | Promise<void>;
  /** Callback on error. */
  onError?: (error: Error, fileName: string) => void | Promise<void>;
  /** Custom metadata extractor from the request. */
  extractMetadata?: (formData: FormData) => Record<string, unknown>;
  /** Whether to return the actual chunk objects in the response (can be large). Default: false. */
  returnChunks?: boolean;
}

/**
 * Creates a Next.js App Router API route handler (POST) for file uploads.
 * Handles multipart form data, validates files, and runs them through your pipeline.
 *
 * @example
 * ```typescript
 * // app/api/ingest/route.ts
 * import { createUploadHandler } from 'ingestify/nextjs';
 * import { myPipeline } from '@/lib/pipeline';
 *
 * export const POST = createUploadHandler({
 *   pipeline: myPipeline,
 *   maxFileSize: '25mb',
 *   allowedTypes: ['application/pdf', '.docx', '.csv'],
 *   onComplete: async (result) => {
 *     // Save to your database, trigger next steps, etc.
 *     console.log(`Ingested ${result.chunks.length} chunks`);
 *   },
 * });
 * ```
 */
export function createUploadHandler(config: UploadHandlerConfig) {
  const maxBytes = parseFileSize(config.maxFileSize || '50mb');

  return async function handler(request: Request): Promise<Response> {
    try {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return Response.json(
          { error: 'No file provided. Send a file with the field name "file".' },
          { status: 400 }
        );
      }

      // Validate file size
      if (file.size > maxBytes) {
        throw new FileSizeError(file.size, maxBytes);
      }

      // Validate file type
      const mimeType = file.type || detectMimeType(file.name);
      if (config.allowedTypes?.length) {
        const allowed = config.allowedTypes.some(t => matchesMimeType(mimeType, t));
        if (!allowed) {
          throw new UnsupportedFileError(mimeType, file.name);
        }
      }

      // Extract metadata from form data
      const metadata = config.extractMetadata
        ? config.extractMetadata(formData)
        : extractDefaultMetadata(formData);

      // Convert File to Buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Run pipeline
      const result = await config.pipeline.run(buffer, file.name, { metadata });

      // Callback
      await config.onComplete?.(result);

      return Response.json({
        success: true,
        fileName: file.name,
        chunks: config.returnChunks ? result.chunks : result.chunks.length,
        stats: result.stats,
        warnings: result.warnings,
        data: result.data,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const fileName = 'unknown';

      await config.onError?.(err, fileName);

      if (error instanceof FileSizeError) {
        return Response.json({ error: err.message, code: 'FILE_TOO_LARGE' }, { status: 413 });
      }
      if (error instanceof UnsupportedFileError) {
        return Response.json({ error: err.message, code: 'UNSUPPORTED_FILE' }, { status: 415 });
      }
      if (error instanceof IngestifyError) {
        return Response.json({ error: err.message, code: (error as IngestifyError).code }, { status: 422 });
      }

      return Response.json(
        { error: 'Internal server error during ingestion', code: 'INTERNAL_ERROR' },
        { status: 500 }
      );
    }
  };
}

/** Extract metadata from FormData fields (excluding 'file'). */
function extractDefaultMetadata(formData: FormData): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    if (key !== 'file') {
      // Try to parse JSON values
      if (typeof value === 'string') {
        try {
          metadata[key] = JSON.parse(value);
        } catch {
          metadata[key] = value;
        }
      }
    }
  });
  return metadata;
}
