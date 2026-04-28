<div align="center">
  <h1>🚀 Ingestify</h1>
  <p><strong>A composable, pipeline-based data ingestion toolkit for Next.js and Node.js projects.</strong></p>
  <p>Parse, chunk, transform, validate, and store data from any file source — with a single fluent API.</p>

  [![npm version](https://img.shields.io/npm/v/ingestify.svg?style=flat-square&color=007acc)](https://www.npmjs.com/package/ingestify)
  [![npm downloads](https://img.shields.io/npm/dt/ingestify.svg?style=flat-square&color=2ea44f)](https://www.npmjs.com/package/ingestify)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
  [![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
</div>

<br />

> **Ingestify** simplifies the messy process of extracting data from files (PDFs, Word docs, Spreadsheets, etc.) and preparing it for AI applications, databases, or search engines. It handles the heavy lifting so you can focus on building.

## ✨ Why Ingestify?

- **Zero Config for Beginners** — Drop a file in, get parsed chunks back. It auto-detects the format.
- **Fluent Pipeline API** — Chain parsers, chunkers, transformers, and storage adapters effortlessly.
- **Next.js & React Ready** — Native `createUploadHandler` for API routes and a `useIngest` hook for the client.
- **Memory Efficient** — Process massive 10GB+ files using Node.js streams without crashing your server.
- **Modular & Tree-shakeable** — Only bundle the parsers you actually use.

---

## 🚀 Features

- 📄 **6 Built-in Parsers** — `PDF`, `DOCX`, `CSV`/`TSV`, `Excel`, `JSON`/`JSONL`, `Plain Text`
- ✂️ **3 Chunking Strategies** — Fixed-size, Sentence-boundary, Recursive (LangChain-style)
- 🪝 **Middleware Engine** — Filter, deduplicate, or modify chunks in flight
- 🛡️ **Resilient Storage** — Retry with exponential backoff & Circuit Breaker patterns
- ✅ **Zod Validation** — Validate output against any Zod schema
- 💾 **Pluggable Storage** — Memory, API, or build your own custom adapter
- 📊 **Rich Events** — Strongly-typed event emitter for tracking pipeline lifecycle
- 🚫 **Cancellation** — `AbortController` support for long-running pipelines
- 📦 **Dual Format** — ESM + CommonJS with full TypeScript types

---

## 📦 Installation

Install the core package:

```bash
npm install ingestify
# or
yarn add ingestify
# or
pnpm add ingestify
```

## 🛠️ Quick Start

### 1. The Easiest Way (Zero Config)

If you just want to drop a file in and get parsed, chunked data back, use the `ingest()` helper. It auto-detects the file type!

```typescript
import { ingest } from 'ingestify';
import fs from 'fs';

const fileBuffer = fs.readFileSync('report.pdf');

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
} from 'ingestify';

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

Standard pipelines hold the parsed file in memory. If you try to ingest a 5GB CSV or JSONL file, your Node server will crash with an "Out of Memory" (OOM) error. 

For massive datasets, use `createStreamPipeline`. It reads the file chunk-by-chunk using Node streams, instantly freeing memory.

```typescript
import { createStreamPipeline, MemoryAdapter } from 'ingestify';
import fs from 'fs';

const pipeline = createStreamPipeline('massive-csv')
  .setBatchSize(5000) // Process 5000 lines at a time
  .transform(async (chunks) => {
    // Process or enrich chunks
    return chunks;
  })
  .store(new MemoryAdapter())
  .build();

// Pass a Node.js ReadableStream instead of a Buffer
const stream = fs.createReadStream('huge-10GB-dataset.csv');
const result = await pipeline.run(stream, 'huge-10GB-dataset.csv');

console.log(`✅ Processed ${result.linesProcessed} lines using almost zero RAM!`);
```

---

## ⚡ Next.js Integration

Ingestify provides helpers built specifically for the **Next.js App Router** and **React Server Components**.

### API Route Handler

Easily create an endpoint to handle file uploads and ingestion in one go.

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
    // Trigger webhooks, save to database, etc.
    console.log('Upload complete!', result.chunks.length);
  },
});
```

### React Client Hook

Use the built-in React hook to manage file uploads and track progress state.

```tsx
'use client';
import { useIngest } from 'ingestify/nextjs';

export function FileUploader() {
  const { upload, status, progress, result, error } = useIngest('/api/ingest', {
    metadata: { userId: 'user-123' },
  });

  return (
    <div className="uploader-card">
      <input
        type="file"
        accept=".pdf,.docx,.csv,.xlsx"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        disabled={status === 'uploading' || status === 'processing'}
      />
      
      {status === 'processing' && (
        <div className="progress-bar">
          Processing... {progress}%
        </div>
      )}
      
      {error && <p className="error">{error.message}</p>}
      {result && <p className="success">Done! {result.chunks.length} chunks ready.</p>}
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
| `.transform(fn)` | Add an async transform function (can add multiple) |
| `.use(middleware)` | Add a middleware function (e.g., `filterEmptyChunks()`) |
| `.validate(validator)` | Set a Zod validator for output validation |
| `.store(adapter)` | Set a storage adapter (`MemoryAdapter`, `APIAdapter`, etc.) |
| `.on(event, callback)` | Listen to pipeline events (`pipeline:start`, `progress`, etc.) |
| `.maxFileSize(bytes)` | Restrict maximum allowed file size |
| `.allowTypes(types)` | Restrict allowed MIME types (e.g. `['application/pdf']`) |
| `.logLevel(level)` | Set log verbosity (`debug` \| `info` \| `warn` \| `error` \| `silent`) |
| `.build()` | Finalize and build the pipeline |

### Parsers

| Parser | Supported Files |
|--------|-----------------|
| `PDFParser` | `.pdf` |
| `DOCXParser` | `.docx` |
| `CSVParser` | `.csv`, `.tsv` |
| `ExcelParser` | `.xlsx`, `.xls` |
| `JSONParser` | `.json`, `.jsonl` |
| `TextParser` | `.txt`, `.md`, `.html`, `.xml` |
| `AutoParser` | All of the above |

### Storage Adapters

| Adapter | Best For |
|---------|----------|
| `MemoryAdapter` | Development, testing, prototyping |
| `APIAdapter` | Sending chunks directly to an external webhook/API |
| `RetryableStorageAdapter` | Wrapper that adds exponential backoff retries |
| `CircuitBreakerAdapter` | Wrapper that fails fast when a downstream service is down |

---

## 🤝 Contributing

We welcome contributions! Please open an issue or submit a pull request on GitHub.

## 📄 License

[MIT](https://opensource.org/licenses/MIT) © Sachin Jat