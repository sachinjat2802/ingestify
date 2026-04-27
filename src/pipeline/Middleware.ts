import type { Chunk, PipelineContext, ParsedDocument } from '../types/index.js';

// ─── Middleware Types ────────────────────────────────────────────────────────

export interface MiddlewareContext extends PipelineContext {
  document: ParsedDocument;
  step: string;
}

export type MiddlewareFn = (
  chunks: Chunk[],
  context: MiddlewareContext,
  next: () => Promise<Chunk[]>
) => Promise<Chunk[]>;

/**
 * Middleware engine for the pipeline transform layer.
 * Follows the Middleware / Chain of Responsibility pattern.
 *
 * Each middleware can:
 * - Modify chunks before passing to the next middleware
 * - Short-circuit the chain by not calling `next()`
 * - Modify chunks returned from downstream middleware
 * - Handle errors from downstream middleware
 *
 * @example
 * ```typescript
 * const engine = new MiddlewareEngine();
 *
 * // Logging middleware
 * engine.use(async (chunks, ctx, next) => {
 *   console.log(`Before: ${chunks.length} chunks`);
 *   const result = await next();
 *   console.log(`After: ${result.length} chunks`);
 *   return result;
 * });
 *
 * // Filtering middleware
 * engine.use(async (chunks, ctx, next) => {
 *   const filtered = chunks.filter(c => c.content.length > 10);
 *   return next(); // pass filtered chunks downstream
 * });
 *
 * // Deduplication middleware
 * engine.use(async (chunks, ctx, next) => {
 *   const seen = new Set<string>();
 *   const unique = chunks.filter(c => {
 *     if (seen.has(c.content)) return false;
 *     seen.add(c.content);
 *     return true;
 *   });
 *   return unique;
 * });
 * ```
 */
export class MiddlewareEngine {
  private middlewares: MiddlewareFn[] = [];

  /** Add middleware to the chain. */
  use(fn: MiddlewareFn): this {
    this.middlewares.push(fn);
    return this;
  }

  /** Execute the middleware chain. */
  async execute(chunks: Chunk[], context: MiddlewareContext): Promise<Chunk[]> {
    if (this.middlewares.length === 0) {
      return chunks;
    }

    let index = 0;

    const next = async (): Promise<Chunk[]> => {
      if (index >= this.middlewares.length) {
        return chunks;
      }

      const middleware = this.middlewares[index++];
      return middleware(chunks, context, next);
    };

    return next();
  }

  /** Get the number of registered middlewares. */
  get count(): number {
    return this.middlewares.length;
  }
}

// ─── Built-in Middleware Factories ────────────────────────────────────────────

/**
 * Creates a middleware that filters out chunks with empty or whitespace-only content.
 */
export function filterEmptyChunks(): MiddlewareFn {
  return async (chunks, _ctx, next) => {
    const filtered = chunks.filter(c => c.content.trim().length > 0);
    chunks.length = 0;
    chunks.push(...filtered);
    return next();
  };
}

/**
 * Creates a middleware that deduplicates chunks by content hash.
 */
export function deduplicateChunks(): MiddlewareFn {
  return async (chunks, _ctx, next) => {
    const seen = new Set<string>();
    const unique = chunks.filter(c => {
      const key = c.content.trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    chunks.length = 0;
    chunks.push(...unique);
    return next();
  };
}

/**
 * Creates a middleware that adds metadata to each chunk.
 */
export function addMetadata(metadata: Record<string, unknown>): MiddlewareFn {
  return async (chunks, _ctx, next) => {
    for (const chunk of chunks) {
      chunk.metadata = { ...chunk.metadata, ...metadata };
    }
    return next();
  };
}

/**
 * Creates a middleware that limits the number of chunks.
 */
export function limitChunks(maxChunks: number): MiddlewareFn {
  return async (chunks, _ctx, next) => {
    if (chunks.length > maxChunks) {
      chunks.length = maxChunks;
    }
    // Update totalChunks
    for (const chunk of chunks) {
      chunk.totalChunks = chunks.length;
    }
    return next();
  };
}

/**
 * Creates a middleware that logs chunk stats.
 */
export function logChunkStats(): MiddlewareFn {
  return async (chunks, ctx, next) => {
    const totalChars = chunks.reduce((sum, c) => sum + c.content.length, 0);
    const avgSize = chunks.length > 0 ? Math.round(totalChars / chunks.length) : 0;
    ctx.logger.info(
      `[${ctx.step}] ${chunks.length} chunks, ${totalChars} total chars, avg ${avgSize} chars/chunk`
    );
    return next();
  };
}
