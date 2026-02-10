import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

/**
 * Validate request body against a Zod schema.
 * Strips unknown fields to prevent mass assignment attacks.
 */
export const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // SECURITY: Use .parse which strips unknown keys by default with strict schemas
      const parsed = schema.parse(req.body);
      // Replace body with parsed (sanitized) version
      req.body = parsed;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
};

/**
 * Validate query parameters against a Zod schema
 */
export const validateQuery = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
};

export default { validate, validateQuery };
