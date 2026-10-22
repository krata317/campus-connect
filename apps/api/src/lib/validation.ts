import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { validationError } from './errors';

export function parseBody<TSchema extends ZodTypeAny>(schema: TSchema, body: unknown): z.infer<TSchema> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw validationError(
      result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '_root',
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export function parseQuery<TSchema extends ZodTypeAny>(schema: TSchema, query: unknown): z.infer<TSchema> {
  const result = schema.safeParse(query ?? {});
  if (!result.success) {
    throw validationError(
      result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '_root',
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export const asyncHandler =
  <T extends Request>(handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: T, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
