'use client';
import { useIngest } from 'ingestify/nextjs/client';

export default function Home() {
  const { upload, status, progress, result, error } = useIngest('/api/ingest', {
    metadata: { userId: 'tester-1' },
  });

  return (
    <main className="min-h-screen p-8 bg-gray-50 flex flex-col items-center justify-center font-sans">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border border-gray-100">
        <h1 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-2">
          🚀 Ingestify Test App
        </h1>
        
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-600">Select a file to parse</label>
            <input
              type="file"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  upload(e.target.files[0]);
                }
              }}
              disabled={status === 'uploading' || status === 'processing'}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-gray-200 rounded-lg p-2 w-full disabled:opacity-50 transition-all cursor-pointer"
            />
          </div>

          {status === 'processing' && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex justify-between text-sm mb-2 text-blue-800">
                <span>Processing...</span>
                <span className="font-bold">{progress}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100 font-medium">
              ❌ {error.message}
            </div>
          )}

          {result && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-100">
              <h3 className="text-green-800 font-bold mb-2 flex items-center gap-2">✅ Success!</h3>
              <p className="text-sm text-green-700">Extracted {Array.isArray(result.chunks) ? result.chunks.length : result.chunks} chunks.</p>
              
              <div className="mt-3 p-3 bg-white rounded border border-green-200 text-xs text-gray-600 shadow-inner">
                <p className="mb-2 font-medium">The pipeline processed {result.stats.characterCount} characters.</p>
                {Array.isArray(result.chunks) && result.chunks.length > 0 && (
                  <div className="max-h-60 overflow-y-auto space-y-3 mt-4 border-t border-gray-100 pt-3">
                    {result.chunks.slice(0, 5).map((chunk: any, i: number) => (
                      <div key={i} className="bg-gray-50 p-2 rounded border border-gray-100">
                        <div className="font-semibold text-gray-800 mb-1 flex justify-between">
                          <span>Chunk {i + 1}</span>
                          {chunk.metadata?.pageNumber && <span className="text-blue-600">Page {chunk.metadata.pageNumber}</span>}
                        </div>
                        <div className="font-mono text-[10px] text-gray-500 bg-gray-100 p-1 mb-1 rounded break-words">
                          ID: {chunk.id}
                        </div>
                        <p className="text-gray-700 line-clamp-3 whitespace-pre-wrap">{chunk.content}</p>
                      </div>
                    ))}
                    {result.chunks.length > 5 && (
                      <div className="text-center py-2 text-gray-500 italic bg-gray-50 rounded">
                        ...and {result.chunks.length - 5} more chunks
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
