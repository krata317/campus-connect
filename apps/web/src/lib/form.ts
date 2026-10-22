import type { FieldValues, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodTypeAny } from 'zod';
import { ApiError } from './api';

export const resolver = <T extends FieldValues>(schema: ZodTypeAny): Resolver<T> => zodResolver(schema) as unknown as Resolver<T>;

export const applyFieldErrors = <T extends FieldValues>(
  error: unknown,
  setError: (name: keyof T & string, value: { type: string; message: string }) => void,
): boolean => {
  if (!(error instanceof ApiError)) return false;
  const fields = error.fieldErrors;
  if (fields.length === 0) return false;
  for (const field of fields) {
    setError(field.path as keyof T & string, { type: 'server', message: field.message });
  }
  return true;
};
