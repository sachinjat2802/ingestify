import { createPipeline } from './pipeline/Pipeline.js';
import { AutoParser } from './parsers/index.js';
import { RecursiveChunker } from './chunkers/index.js';
import { ZodValidator } from './validators/index.js';
import type { IngestResult } from './types/index.js';

export interface QuickIngestOptions {
  /** Maximum size of each text chunk (default: 1000) */
  chunkSize?: number;
  /** Overlap between chunks (default: 100) */
  chunkOverlap?: number;
  /** Zod schema to validate the final output against */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema?: any;
  /** Custom metadata to attach to the context */
  metadata?: Record<string, unknown>;
  /** Pipeline name (default: "quick-ingest") */
  pipelineName?: string;
}

/**
 * A dead-simple, zero-config function to ingest a file.
 * Automatically parses, chunks, and optionally validates data.
 * 
 * @example
 * ```typescript
 * import { ingest } from 'ingestify';
 * 
 * const result = await ingest(fileBuffer, 'report.pdf', { chunkSize: 500 });
 * console.log(result.chunks);
 * ```
 */
export async function ingest(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  fileName: string,
  options?: QuickIngestOptions
): Promise<IngestResult> {
  const pipelineName = options?.pipelineName || 'quick-ingest';
  
  const builder = createPipeline(pipelineName)
    .parse(new AutoParser())
    .chunk(new RecursiveChunker({
      maxSize: options?.chunkSize ?? 1000,
      overlap: options?.chunkOverlap ?? 100,
    }))
    .logLevel('warn'); // Keep it quiet by default

  if (options?.schema) {
    builder.validate(new ZodValidator(options.schema));
  }

  const pipeline = builder.build();

  return pipeline.run(buffer, fileName, {
    metadata: options?.metadata,
  });
}
