import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import multer from 'multer';
import { config } from '../config';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  // SECURITY: Never expose stack traces or internal error details in production
  const isDev = config.nodeEnv !== 'production';

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  // Prisma known request errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': // Unique constraint violation
        return res.status(409).json({ error: 'A record with this value already exists' });
      case 'P2025': // Record not found
        return res.status(404).json({ error: 'Record not found' });
      case 'P2003': // Foreign key constraint
        return res.status(400).json({ error: 'Related record not found' });
      default:
        if (isDev) console.error('Prisma error:', err.code, err.message);
        return res.status(500).json({ error: 'Database error' });
    }
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
    });
  }

  // Multer file upload errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large' });
    }
    return res.status(400).json({ error: 'Upload error' });
  }

  // JSON parse errors
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  // SECURITY: Log full error server-side but only return generic message to client
  console.error('Unhandled error:', isDev ? err : err.message);
  return res.status(500).json({
    error: 'Internal server error',
    // Only include details in development
    ...(isDev && { detail: err.message }),
  });
};

export const notFound = (req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
};
