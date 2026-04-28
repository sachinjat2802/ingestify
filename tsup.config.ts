import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'parsers/index': 'src/parsers/index.ts',
    'chunkers/index': 'src/chunkers/index.ts',
    'storage/index': 'src/storage/index.ts',
    'nextjs/server': 'src/nextjs/server.ts',
    'nextjs/client': 'src/nextjs/client.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  external: [
    'react',
    'next',
    'zod',
    'pdf-parse',
    'mammoth',
    'papaparse',
    'xlsx',
  ],
  banner: {
    js: '/* ingestify - Data Ingestion Toolkit */',
  },
});
