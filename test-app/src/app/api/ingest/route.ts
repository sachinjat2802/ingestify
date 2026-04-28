import { createUploadHandler } from 'ingestify/nextjs/server';
import { createPipeline, AutoParser, RecursiveChunker } from 'ingestify';

const pipeline = createPipeline('upload')
  .parse(new AutoParser())
  .chunk(new RecursiveChunker({ maxSize: 500 }))
  .build();

export const POST = createUploadHandler({
  pipeline,
  maxFileSize: '25mb',
  returnChunks: true,
  // Allow all common document types for testing
  allowedTypes: [
    'application/pdf', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
    'text/csv', 
    'text/plain', 
    'application/json',
    '.xlsx',
    '.xls'
  ],
  onComplete: async (result) => {
    console.log('Upload complete! Total chunks:', result.chunks.length);
  },
});
