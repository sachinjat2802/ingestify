import type { PipelineContext, Chunk, ParsedDocument } from '../types/index.js';

// ─── Event Types ─────────────────────────────────────────────────────────────

export interface PipelineEvents {
  /** Fired before any step executes */
  'step:before': { step: string; stepIndex: number; totalSteps: number };
  /** Fired after a step completes */
  'step:after': { step: string; stepIndex: number; totalSteps: number; durationMs: number };
  /** Progress update */
  'progress': { step: string; stepIndex: number; totalSteps: number; percent: number; message: string };
  /** Parsing complete */
  'parse:complete': { document: ParsedDocument; durationMs: number };
  /** Chunking complete */
  'chunk:complete': { chunks: Chunk[]; count: number; durationMs: number };
  /** Transform applied */
  'transform:complete': { transformIndex: number; totalTransforms: number; chunkCount: number; durationMs: number };
  /** Pipeline started */
  'pipeline:start': { pipelineName: string; fileName: string; fileSizeBytes: number };
  /** Pipeline completed successfully */
  'pipeline:complete': { pipelineName: string; totalTimeMs: number; chunkCount: number };
  /** Pipeline error */
  'pipeline:error': { pipelineName: string; error: Error; step?: string };
  /** Pipeline was cancelled */
  'pipeline:cancelled': { pipelineName: string; step: string };
}

export type PipelineEventName = keyof PipelineEvents;

type EventHandler<T> = (data: T) => void | Promise<void>;

// ─── Typed Event Emitter ─────────────────────────────────────────────────────

/**
 * A strongly-typed event emitter for pipeline lifecycle events.
 * Follows the Observer pattern — supports multiple listeners per event.
 *
 * @example
 * ```typescript
 * const emitter = new PipelineEventEmitter();
 *
 * emitter.on('pipeline:start', ({ fileName }) => {
 *   console.log(`Processing ${fileName}`);
 * });
 *
 * emitter.on('progress', ({ percent, message }) => {
 *   progressBar.update(percent, message);
 * });
 *
 * emitter.on('pipeline:error', ({ error }) => {
 *   Sentry.captureException(error);
 * });
 * ```
 */
export class PipelineEventEmitter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners = new Map<string, Set<EventHandler<any>>>();

  /** Register an event listener. Returns an unsubscribe function. */
  on<K extends PipelineEventName>(event: K, handler: EventHandler<PipelineEvents[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  /** Register a one-time event listener. */
  once<K extends PipelineEventName>(event: K, handler: EventHandler<PipelineEvents[K]>): () => void {
    const wrappedHandler: EventHandler<PipelineEvents[K]> = (data) => {
      this.off(event, wrappedHandler);
      return handler(data);
    };
    return this.on(event, wrappedHandler);
  }

  /** Remove a specific event listener. */
  off<K extends PipelineEventName>(event: K, handler: EventHandler<PipelineEvents[K]>): void {
    this.listeners.get(event)?.delete(handler);
  }

  /** Remove all listeners for an event, or all listeners entirely. */
  removeAllListeners(event?: PipelineEventName): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /** Emit an event to all registered listeners. */
  async emit<K extends PipelineEventName>(event: K, data: PipelineEvents[K]): Promise<void> {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    // Fire all handlers — don't let one failure stop others
    const promises = Array.from(handlers).map(async (handler) => {
      try {
        await handler(data);
      } catch (err) {
        console.error(`[ingestify] Event handler error for "${event}":`, err);
      }
    });

    await Promise.all(promises);
  }

  /** Get the count of listeners for an event. */
  listenerCount(event: PipelineEventName): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
