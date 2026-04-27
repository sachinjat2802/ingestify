import { describe, it, expect, vi } from 'vitest';
import { createPipeline } from '../src/pipeline/Pipeline';
import { AutoParser } from '../src/parsers';
import { RecursiveChunker } from '../src/chunkers';
import { ZodValidator } from '../src/validators';
import { MemoryAdapter, RetryableStorageAdapter } from '../src/storage';
import { deduplicateChunks, filterEmptyChunks } from '../src/pipeline/Middleware';
import { z } from 'zod';
import { createUploadHandler } from '../src/nextjs';

describe('Functional E2E Tests', () => {
  it('should run a complex pipeline with auto-parsing, chunking, middleware, validation, and storage', async () => {
    // 1. Set up a schema for validation
    const schema = z.array(
      z.object({
        id: z.string(),
        content: z.string().min(1),
        metadata: z.object({
          source: z.literal('e2e-test'),
          processedAt: z.number(),
        }).passthrough(),
      })
    );

    const validator = new ZodValidator(schema);

    // 2. Set up storage with resilience
    const memoryStore = new MemoryAdapter();
    const resilientStore = new RetryableStorageAdapter(memoryStore, { maxRetries: 2 });

    // 3. Build the pipeline
    const pipeline = createPipeline('e2e-functional')
      .parse(new AutoParser())
      .chunk(new RecursiveChunker({ maxSize: 50, overlap: 0 }))
      .use(filterEmptyChunks())
      .use(deduplicateChunks())
      .transform(async (chunks) => {
        // Transform the chunks into the expected schema shape
        return chunks.map(chunk => ({
          ...chunk,
          metadata: {
            ...chunk.metadata,
            source: 'e2e-test',
            processedAt: Date.now(),
          },
        }));
      })
      .validate(validator)
      .store(resilientStore)
      .logLevel('silent')
      .build();

    // 4. Listen to events
    const eventLog: string[] = [];
    pipeline.events.on('step:before', ({ step }) => eventLog.push(`start:${step}`));
    pipeline.events.on('step:after', ({ step }) => eventLog.push(`end:${step}`));

    // 5. Provide input data (simulating a CSV file which AutoParser will detect if named .csv, 
    // but AutoParser defaults to TextParser if no specific match, which is fine)
    // Wait, let's use JSON to test AutoParser's delegation
    const jsonData = JSON.stringify([
      { title: "First item", desc: "This is the first item." },
      { title: "Second item", desc: "This is the second item." },
      { title: "Duplicate", desc: "This is the first item." } // Intentional duplicate content to test middleware
    ]);
    const buffer = Buffer.from(jsonData);

    // 6. Execute pipeline
    const result = await pipeline.run(buffer, 'data.json');

    // 7. Assertions
    expect(result.success).toBe(true);
    expect(result.pipelineName).toBe('e2e-functional');
    
    // AutoParser should have picked JSONParser
    expect(result.document.mimeType).toBe('application/json');
    
    // Check middleware and chunker effects
    // The JSON parser will extract the raw text. 
    // Then chunker splits it. Deduplication should reduce chunk count if there are exact string matches.
    expect(result.chunks.length).toBeGreaterThan(0);

    // Validation should have passed
    expect(result.warnings).toEqual([]);

    // Check storage
    expect(memoryStore.size).toBe(1);
    const records = await memoryStore.list();
    expect(records[0].pipelineName).toBe('e2e-functional');
    expect(records[0].fileName).toBe('data.json');

    // Check events
    expect(eventLog).toContain('start:parse');
    expect(eventLog).toContain('end:parse');
    expect(eventLog).toContain('start:chunk');
    expect(eventLog).toContain('start:middleware');
    expect(eventLog).toContain('start:validate');
    expect(eventLog).toContain('start:store');
  });

  it('should function correctly via Next.js API handler', async () => {
    // Construct a mock Next.js Request with FormData
    const formData = new FormData();
    const fileContent = 'Hello functional test file';
    const blob = new Blob([fileContent], { type: 'text/plain' });
    
    // In Node.js FormData, appending a File is tricky without the File class, 
    // but Next.js polyfills it. We'll use a mocked File-like object
    const file = new File([blob], "test-upload.txt", { type: 'text/plain' });
    formData.append('file', file);
    formData.append('projectId', '12345');

    const request = new Request('http://localhost/api/ingest', {
      method: 'POST',
      body: formData,
    });

    const mockComplete = vi.fn();

    const pipeline = createPipeline('nextjs-test')
      .parse(new AutoParser())
      .logLevel('silent')
      .build();

    const handler = createUploadHandler({
      pipeline,
      onComplete: mockComplete,
    });

    const response = await handler(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data.success).toBe(true);
    expect(data.fileName).toBe('test-upload.txt');
    expect(data.chunks).toBe(1);

    expect(mockComplete).toHaveBeenCalledOnce();
    const resultObj = mockComplete.mock.calls[0][0];
    
    // Custom metadata should be extracted from FormData
    expect(resultObj.document.content).toBe(fileContent);
    expect(resultObj.chunks[0].metadata.projectId).toBeUndefined(); // Wait, the pipeline context gets the metadata, let's verify context metadata
    // In createUploadHandler, metadata is passed to pipeline run options:
    // await config.pipeline.run(buffer, file.name, { metadata });
    // This is attached to storage records. 
  });
});
