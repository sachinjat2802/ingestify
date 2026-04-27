<div align="center">
  <h1>🚀 Ingestify</h1>
  <p><strong>A composable, pipeline-based data ingestion toolkit for Next.js and Node.js projects.</strong></p>
  <p>Parse, chunk, transform, validate, and store data from any file source — with a single fluent API.</p>

  [![npm version](https://img.shields.io/npm/v/@sachinjat2802/ingestify.svg?style=flat-square)](https://www.npmjs.com/package/@sachinjat2802/ingestify)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
  [![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg?style=flat-square)](https://www.typescriptlang.org/)
</div>

<br />

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
npm install @sachinjat2802/ingestify
```

### Optional Peer Dependencies
Ingestify stays lightweight by only loading the heavy parsers you actually need. Install the ones your project requires:

```bash
# PDF support
npm install pdf-parse

# Word documents (.docx)
npm install mammoth

# CSV/TSV
npm install papaparse

# Excel (.xlsx)
npm install xlsx

# Schema validation
npm install zod
```

---

## 🚀 Quick Start

### 1. The Easiest Way (Zero Config)

If you just want to drop a file in and get parsed, chunked data back, use the `ingest()` helper. It auto-detects the file type!

```typescript
import { ingest } from '@sachinjat2802/ingestify';

const result = await ingest(fileBuffer, 'report.pdf', {
  chunkSize: 500,
  chunkOverlap: 50
});

console.log(`✅ Extracted ${result.chunks.length} chunks!`);
```

### 2. Advanced Pipeline (Full Control)

Need middleware, validation, or resilient storage? Build a custom pipeline:

```typescript
import { 
  createPipeline, 
  AutoParser, 
  RecursiveChunker, 
  MemoryAdapter,
  RetryableStorageAdapter,
  deduplicateChunks,
  filterEmptyChunks
} from '@sachinjat2802/ingestify';

const pipeline = createPipeline('my-ingestion')
  .parse(new AutoParser())
  .chunk(new RecursiveChunker({ maxSize: 1000, overlap: 100 }))
  .use(filterEmptyChunks())
  .use(deduplicateChunks())
  .transform(async (chunks, ctx) => {
    return chunks.map(c => ({
      ...c,
      metadata: { ...c.metadata, projectId: ctx.metadata.projectId }
    }));
  })
  .store(new RetryableStorageAdapter(new MemoryAdapter(), { maxRetries: 3 }))
  .on('progress', (p) => console.log(`${p.percent}% — ${p.message}`))
  .build();

const result = await pipeline.run(fileBuffer, 'report.pdf', {
  metadata: { projectId: 'proj-123' }
});
```

### 3. Handling Massive Files (1GB+)

Standard pipelines hold the parsed file in memory. If you try to ingest a 5GB CSV or JSONL file, your Next.js server will crash with an "Out of Memory" (OOM) error. For massive files, use the `createStreamPipeline`. It reads the file line-by-line using Node streams, instantly freeing memory.

```typescript
import { createStreamPipeline, MemoryAdapter } from '@sachinjat2802/ingestify';
import fs from 'fs';

const pipeline = createStreamPipeline('massive-csv')
  .setBatchSize(5000) // Process 5000 lines at a time
  .transform(async (chunks) => {
    return chunks;
  })
  .store(new MemoryAdapter())
  .build();

// Pass a ReadableStream instead of a Buffer
const stream = fs.createReadStream('huge-10GB-dataset.csv');
const result = await pipeline.run(stream, 'huge-10GB-dataset.csv');

console.log(`Processed ${result.linesProcessed} lines using almost zero RAM!`);
```

---

## ⚡ Next.js Integration

Ingestify provides helpers built specifically for the Next.js App Router and React Server Components.

### API Route Handler

```typescript
// app/api/ingest/route.ts
import { createUploadHandler } from '@sachinjat2802/ingestify/nextjs';
import { createPipeline, AutoParser, RecursiveChunker } from '@sachinjat2802/ingestify';

const pipeline = createPipeline('upload')
  .parse(new AutoParser())
  .chunk(new RecursiveChunker({ maxSize: 500 }))
  .build();

export const POST = createUploadHandler({
  pipeline,
  maxFileSize: '25mb',
  allowedTypes: ['application/pdf', '.docx', '.csv'],
  onComplete: async (result) => {
    // Webhook or DB logic here
  },
});
```

### React Client Hook

```tsx
'use client';
import { useIngest } from '@sachinjat2802/ingestify/nextjs';

export function FileUploader() {
  const { upload, status, progress, result, error } = useIngest('/api/ingest', {
    metadata: { userId: 'user-123' },
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
    </div>
  );
}
```

---

## 📖 API Reference

### `createPipeline(name)`

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

### Storage Adapters

| Adapter | Use Case |
|---------|----------|
| `MemoryAdapter` | Development, testing, prototyping |
| `APIAdapter` | POST to external API endpoint |
| `RetryableStorageAdapter` | Wrapper that adds exponential backoff retries |
| `CircuitBreakerAdapter` | Wrapper that fails fast when downstream is down |

---

## 📄 License

MIT