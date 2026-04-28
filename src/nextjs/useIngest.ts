'use client';

import { useState, useCallback, useRef } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type IngestStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

export interface IngestResponse {
  success: boolean;
  fileName: string;
  chunks: number | any[];
  stats: {
    totalTimeMs: number;
    chunkCount: number;
    fileSizeBytes: number;
    characterCount: number;
  };
  warnings: string[];
  data: unknown;
}

export interface UseIngestOptions {
  /** Extra headers to send with the upload request. */
  headers?: Record<string, string>;
  /** Extra metadata to send as form fields. */
  metadata?: Record<string, unknown>;
  /** Callback on success. */
  onSuccess?: (result: IngestResponse) => void;
  /** Callback on error. */
  onError?: (error: Error) => void;
  /** Callback on progress (estimated). */
  onProgress?: (percent: number) => void;
}

export interface UseIngestReturn {
  /** Upload a file to the ingestion endpoint. */
  upload: (file: File, extraMetadata?: Record<string, unknown>) => Promise<IngestResponse | null>;
  /** Upload multiple files. */
  uploadMultiple: (files: File[], extraMetadata?: Record<string, unknown>) => Promise<IngestResponse[]>;
  /** Current status. */
  status: IngestStatus;
  /** Upload/processing progress (0-100). */
  progress: number;
  /** The result of the last successful upload. */
  result: IngestResponse | null;
  /** The results of the last batch upload. */
  results: IngestResponse[];
  /** Error if status is 'error'. */
  error: Error | null;
  /** Whether an upload is in progress. */
  isLoading: boolean;
  /** Reset state back to idle. */
  reset: () => void;
  /** Cancel the current upload. */
  cancel: () => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * React hook for uploading files to an ingestify API endpoint.
 *
 * @param endpoint - The API route URL (e.g., '/api/ingest')
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * function UploadPage() {
 *   const { upload, status, progress, result, error } = useIngest('/api/ingest', {
 *     metadata: { projectId: '123' },
 *     onSuccess: (res) => console.log('Done!', res),
 *   });
 *
 *   return (
 *     <div>
 *       <input type="file" onChange={(e) => {
 *         if (e.target.files?.[0]) upload(e.target.files[0]);
 *       }} />
 *       {status === 'uploading' && <p>Uploading... {progress}%</p>}
 *       {status === 'complete' && <p>✅ {result?.chunks} chunks created</p>}
 *       {error && <p>❌ {error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useIngest(endpoint: string, options: UseIngestOptions = {}): UseIngestReturn {
  const [status, setStatus] = useState<IngestStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [results, setResults] = useState<IngestResponse[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(0);
    setResult(null);
    setResults([]);
    setError(null);
    abortRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
    setProgress(0);
  }, []);

  const upload = useCallback(
    async (file: File, extraMetadata?: Record<string, unknown>): Promise<IngestResponse | null> => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        setStatus('uploading');
        setProgress(0);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);

        // Add metadata
        const allMetadata = { ...options.metadata, ...extraMetadata };
        Object.entries(allMetadata).forEach(([key, value]) => {
          formData.append(key, typeof value === 'string' ? value : JSON.stringify(value));
        });

        // Simulate upload progress (XHR doesn't have progress in fetch API)
        const progressInterval = setInterval(() => {
          setProgress((prev: number) => {
            const next = Math.min(prev + 5, 85);
            options.onProgress?.(next);
            return next;
          });
        }, 200);

        setStatus('processing');

        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          headers: options.headers,
          signal: controller.signal,
        });

        clearInterval(progressInterval);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(errorData.error || `Upload failed with status ${response.status}`);
        }

        const data: IngestResponse = await response.json();

        setProgress(100);
        options.onProgress?.(100);
        setResult(data);
        setStatus('complete');
        options.onSuccess?.(data);

        return data;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setStatus('idle');
          return null;
        }

        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setStatus('error');
        options.onError?.(error);
        return null;
      }
    },
    [endpoint, options]
  );

  const uploadMultiple = useCallback(
    async (files: File[], extraMetadata?: Record<string, unknown>): Promise<IngestResponse[]> => {
      const allResults: IngestResponse[] = [];

      for (let i = 0; i < files.length; i++) {
        const overallProgress = Math.round((i / files.length) * 100);
        setProgress(overallProgress);

        const result = await upload(files[i], {
          ...extraMetadata,
          batchIndex: i,
          batchTotal: files.length,
        });

        if (result) {
          allResults.push(result);
        }
      }

      setResults(allResults);
      setProgress(100);
      setStatus('complete');

      return allResults;
    },
    [upload]
  );

  return {
    upload,
    uploadMultiple,
    status,
    progress,
    result,
    results,
    error,
    isLoading: status === 'uploading' || status === 'processing',
    reset,
    cancel,
  };
}
