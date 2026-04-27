import type { IValidator, ValidationResult } from '../types/index.js';

/**
 * Validates data using a Zod schema.
 * Requires `zod` as a peer dependency.
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const schema = z.array(z.object({
 *   content: z.string().min(1),
 *   metadata: z.record(z.unknown()),
 * }));
 *
 * const validator = new ZodValidator(schema);
 * const result = validator.validate(chunks);
 * ```
 */
export class ZodValidator<T = unknown> implements IValidator<T> {
  private schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: { issues: Array<{ path: (string | number)[]; message: string }> } } };

  constructor(schema: { safeParse: (data: unknown) => unknown }) {
    this.schema = schema as typeof this.schema;
  }

  validate(data: unknown): ValidationResult<T> {
    const result = this.schema.safeParse(data);

    if (result.success) {
      return {
        success: true,
        data: result.data as T,
      };
    }

    const errors = (result.error?.issues || []).map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));

    return {
      success: false,
      errors,
    };
  }
}
