import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { apiError } from './http-error.js';

/** Validates a request body or query with a zod schema and answers 400 validation_error with per-field details. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw apiError(
      400,
      'validation_error',
      'The request is invalid',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
}
