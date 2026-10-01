import { applyDecorators, Body, PipeTransform, Query } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { Errors } from '../errors/app-error.js';

/** Validates and transforms input with a Zod schema; failures become VALIDATION_FAILED with field issues. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw Errors.validation(
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      );
    }
    return result.data;
  }
}

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
}

/** Parameter decorator: validated request body. Pair with `@ApiZodBody(schema)` for OpenAPI. */
export const ZodBody = (schema: z.ZodType) => Body(new ZodValidationPipe(schema));
/** Parameter decorator: validated query string. */
export const ZodQuery = (schema: z.ZodType) => Query(new ZodValidationPipe(schema));

export const ApiZodBody = (schema: z.ZodType) => applyDecorators(ApiBody({ schema: jsonSchema(schema) }));
export const ApiZodQuery = (name: string, schema: z.ZodType) =>
  applyDecorators(ApiQuery({ name, required: false, schema: jsonSchema(schema) }));
