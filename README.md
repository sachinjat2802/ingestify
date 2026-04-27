# 🚀 Ingestify

A composable, pipeline-based data ingestion toolkit for **Next.js** and **Node.js** projects.

Parse, chunk, transform, validate, and store data from any file source — with a single fluent API.

---

## ✨ Features

- 📄 **6 Built-in Parsers** — PDF, DOCX, CSV/TSV, Excel, JSON/JSONL, Plain Text
- ✂️ **3 Chunking Strategies** — Fixed-size, Sentence-boundary, Recursive (LangChain-style)
- 🪝 **Middleware Engine** — Filter, deduplicate, or modify chunks in flight
- 🛡️ **Resilient Storage** — Retry with exponential backoff & Circuit Breaker patterns
- ✅ **Zod Validation** — Validate output against any Zod schema
- 💾 **Pluggable Storage** — Memory, API, or build your own adapter
- ⚡ **Next.js Integration** — `createUploadHandler` for API routes + `useIngest` React hook
- 📊 **Rich Events** — Strongly-typed event emitter for tracking pipeline lifecycle
- 🚫 **Cancellation** — AbortController support for long-running pipelines
- 🌲 **Tree-shakeable** — Only bundle what you use
- 📦 **Dual Format** — ESM + CommonJS with full TypeScript types

---

## 📦 Installation

```bash
npm install ingestify
```

### Install parsers you need (optional peer dependencies):

```bash
# PDF support
npm install pdf-parse

# Word documents
npm install mammoth

# CSV/TSV
npm install papaparse

# Excel
npm install xlsx

# Schema validation
npm install zod
```

---

## 🚀 Quick Start

### The Easiest Way (Zero Config)

If you just want to drop a file in and get parsed, chunked data back, use the `ingest()` helper:

```typescript
import { ingest } from 'ingestify';

// Automatically parses PDF/DOCX/CSV/etc and chunks it
const result = await ingest(fileBuffer, 'report.pdf', {
  chunkSize: 500,
  chunkOverlap: 50
});

console.log(`Extracted ${result.chunks.length} chunks!`);
```

### Advanced Pipeline (Full Control)

```typescript
import { 
  createPipeline, 
  AutoParser, 
  RecursiveChunker, 
  MemoryAdapter,
  RetryableStorageAdapter,
  deduplicateChunks,
  filterEmptyChunks
} from 'ingestify';

const pipeline = createPipeline('my-ingestion')
  .parse(new AutoParser())                           // auto-detect file type
  .chunk(new RecursiveChunker({ maxSize: 1000, overlap: 100 }))
  .use(filterEmptyChunks())                          // Built-in middleware
  .use(deduplicateChunks())
  .transform(async (chunks, ctx) => {
    // Add custom metadata to each chunk
    return chunks.map(c => ({
      ...c,
      metadata: { ...c.metadata, projectId: ctx.metadata.projectId }
    }));
  })
  .store(new RetryableStorageAdapter(new MemoryAdapter(), { maxRetries: 3 }))
  .on('progress', (p) => console.log(`${p.percent}% — ${p.message}`))
  .build();

// Run it
const result = await pipeline.run(fileBuffer, 'report.pdf', {
  metadata: { projectId: 'proj-123' }
});

console.log(`✅ ${result.chunks.length} chunks created in ${result.stats.totalTimeMs}ms`);
```

### Handling Massive Files (1GB+)

Standard pipelines hold the parsed file in memory (`Buffer` -> `String`). If you try to ingest a 5GB CSV or JSONL file, your Next.js server will crash with an "Out of Memory" (OOM) error.

For massive files, use the `createStreamPipeline`. It reads the file line-by-line using Node streams, chunks it in batches, stores it, and instantly frees the memory.

```typescript
import { createStreamPipeline, MemoryAdapter } from 'ingestify';
import fs from 'fs';

const pipeline = createStreamPipeline('massive-csv')
  .setBatchSize(5000) // Process 5000 lines at a time
  .transform(async (chunks) => {
    // Modify your chunks as usual
    return chunks;
  })
  .store(new MemoryAdapter())
  .build();

// Pass a ReadableStream instead of a Buffer
const stream = fs.createReadStream('huge-10GB-dataset.csv');

const result = await pipeline.run(stream, 'huge-10GB-dataset.csv');
console.log(`Processed ${result.linesProcessed} lines using almost zero RAM!`);
```

### Next.js API Route

```typescript
// app/api/ingest/route.ts
import { createUploadHandler } from 'ingestify/nextjs';
import { createPipeline, AutoParser, RecursiveChunker } from 'ingestify';

const pipeline = createPipeline('upload')
  .parse(new AutoParser())
  .chunk(new RecursiveChunker({ maxSize: 500 }))
  .build();

export const POST = createUploadHandler({
  pipeline,
  maxFileSize: '25mb',
  allowedTypes: ['application/pdf', '.docx', '.csv'],
  onComplete: async (result) => {
    // Save to your DB, trigger webhooks, etc.
  },
});
```

### React Upload Component

```tsx
'use client';
import { useIngest } from 'ingestify/nextjs';

export function FileUploader() {
  const { upload, status, progress, result, error, reset } = useIngest('/api/ingest', {
    metadata: { userId: 'user-123' },
    onSuccess: (res) => console.log('Ingested!', res),
  });

  return (
    <div>
      <input
        type="file"
        accept=".pdf,.docx,.csv,.xlsx"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        disabled={status === 'uploading' || status === 'processing'}
      />

      {status === 'processing' && <p>Processing... {progress}%</p>}
      {status === 'complete' && <p>✅ Created {result?.chunks} chunks</p>}
      {status === 'error' && <p>❌ {error?.message}</p>}
      {status !== 'idle' && <button onClick={reset}>Reset</button>}
    </div>
  );
}
```

---

## 📖 API Reference

### `createPipeline(name)`

Creates a pipeline builder with a fluent API.

| Method | Description |
|--------|-------------|
| `.parse(parser)` | Add a parser (multiple parsers = auto-select by MIME type) |
| `.chunk(chunker, options?)` | Set the chunking strategy |
| `.transform(fn)` | Add a transform function (can add multiple) |
| `.use(middleware)` | Add a middleware function (filter, deduplicate, etc.) |
| `.validate(validator)` | Set a Zod validator |
| `.store(adapter)` | Set a storage adapter |
| `.on(event, callback)` | Listen to pipeline events (`pipeline:start`, `progress`, `step:before`, etc.) |
| `.maxFileSize(bytes)` | Set max file size |
| `.allowTypes(types)` | Restrict allowed MIME types |
| `.logLevel(level)` | Set log verbosity (`debug` \| `info` \| `warn` \| `error` \| `silent`) |
| `.build()` | Build the pipeline |

### Parsers

| Parser | File Types | Peer Dependency |
|--------|------------|-----------------|
| `PDFParser` | `.pdf` | `pdf-parse` |
| `DOCXParser` | `.docx` | `mammoth` |
| `CSVParser` | `.csv`, `.tsv` | `papaparse` |
| `ExcelParser` | `.xlsx`, `.xls` | `xlsx` |
| `JSONParser` | `.json`, `.jsonl` | — |
| `TextParser` | `.txt`, `.md`, `.html`, `.xml` | — |
| `AutoParser` | All of the above | — |

### Chunkers

| Chunker | Strategy |
|---------|----------|
| `FixedSizeChunker` | Split at fixed character count with overlap |
| `SentenceChunker` | Split on sentence boundaries |
| `RecursiveChunker` | Recursively split using separator hierarchy (paragraphs → sentences → words) |

### Storage Adapters

| Adapter | Use Case |
|---------|----------|
| `MemoryAdapter` | Development, testing, prototyping |
| `APIAdapter` | POST to external API endpoint |
| `RetryableStorageAdapter` | Wrapper that adds exponential backoff retries |
| `CircuitBreakerAdapter` | Wrapper that fails fast when downstream is down |

---

## 🔧 Custom Adapters

### Custom Parser

```typescript
import type { IParser, ParsedDocument } from 'ingestify';

class MyParser implements IParser {
  supportedTypes = ['application/x-custom'];

  canParse(mimeType: string) {
    return this.supportedTypes.includes(mimeType);
  }

  async parse(buffer: Buffer, fileName: string) {
    // Your parsing logic
    return { fileName, mimeType: 'application/x-custom', content: '...', metadata: {} };
  }
}
```

### Custom Storage Adapter

```typescript
import type { IStorageAdapter, StorageRecord } from 'ingestify';

class PostgresAdapter implements IStorageAdapter {
  name = 'PostgresAdapter';

  async store(record: StorageRecord) {
    // INSERT INTO your_table ...
    return { id: record.id };
  }

  async retrieve(id: string) { /* SELECT ... */ }
  async list(filter?) { /* SELECT ... */ }
  async delete(id: string) { /* DELETE ... */ }
}
```

---

## 📄 License

MIT
#   i n g e s t i f y  
 