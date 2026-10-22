import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No API route matches ${req.method} ${req.originalUrl}` },
  });
};

export const errorHandler = (error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some fields need your attention',
        details: { fields: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) },
      },
    });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'The request body is not valid JSON' } });
    return;
  }

  logger.error('Unhandled request error', {
    method: req.method,
    path: req.path,
    message: error instanceof Error ? error.message : String(error),
  });

  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server. Please try again.' },
  });
};
