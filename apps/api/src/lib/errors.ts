export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'EMAIL_UNAVAILABLE'
  | 'GONE'
  | 'INTERNAL_ERROR';

export interface FieldError {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);

export const validationError = (fields: FieldError[], message = 'Some fields need your attention') =>
  new AppError(400, 'VALIDATION_ERROR', message, { fields });

export const unauthorized = (message = 'You need to sign in to continue') => new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have access to this resource') => new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message);

export const conflict = (message: string, details?: unknown) => new AppError(409, 'CONFLICT', message, details);

export const gone = (message = 'This link is no longer valid') => new AppError(410, 'GONE', message);

export const emailUnavailable = (message: string) => new AppError(503, 'EMAIL_UNAVAILABLE', message);

export const tooManyRequests = (message: string) => new AppError(429, 'RATE_LIMITED', message);
