// Security testing utilities
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      // Remove null bytes, excessive whitespace
      return obj.replace(/\0/g, '').trim();
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = {};
      for (const key in obj) {
        sanitized[key] = sanitize(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);
  next();
};

// SQL Injection prevention validator
export const validateNoSQLInjection = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      
      // Additional SQL injection patterns
      const sqlPatterns = [
        /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
        /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
        /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
        /exec(\s|\+)+(s|x)p\w+/i
      ];

      const checkValue = (value: any): boolean => {
        if (typeof value === 'string') {
          return sqlPatterns.some(pattern => pattern.test(value));
        }
        if (typeof value === 'object' && value !== null) {
          return Object.values(value).some(checkValue);
        }
        return false;
      };

      if (checkValue(req.body) || checkValue(req.query)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid input detected' 
        });
      }

      next();
    } catch (error) {
      res.status(400).json({ 
        success: false, 
        error: 'Validation failed' 
      });
    }
  };
};

// XSS Prevention
export const sanitizeXSS = (input: string): string => {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  const reg = /[&<>"'/]/ig;
  return input.replace(reg, (match) => map[match]);
};

// Path traversal prevention
export const validateFilePath = (filePath: string): boolean => {
  const pathTraversalPattern = /(\.\.(\/|\\))|(\.\.(\/|\\))/g;
  return !pathTraversalPattern.test(filePath);
};

// File upload security
export const validateFileUpload = (file: Express.Multer.File): { valid: boolean; error?: string } => {
  // Allowed MIME types
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/wav',
    'audio/webm',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  // Blocked extensions
  const blockedExtensions = [
    '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
    '.msi', '.dll', '.sh', '.php', '.asp', '.aspx', '.jsp'
  ];

  // Check MIME type
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return { valid: false, error: 'File type not allowed' };
  }

  // Check extension
  const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
  if (blockedExtensions.includes(ext)) {
    return { valid: false, error: 'File extension not allowed' };
  }

  // Check for double extensions
  const parts = file.originalname.toLowerCase().split('.');
  if (parts.length > 2) {
    for (let i = 0; i < parts.length - 1; i++) {
      if (blockedExtensions.includes('.' + parts[i])) {
        return { valid: false, error: 'Invalid file name' };
      }
    }
  }

  // Check file size (100MB max)
  const maxSize = 100 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, error: 'File too large' };
  }

  return { valid: true };
};

// Rate limiting configuration
export const createRateLimitConfig = (windowMs: number, max: number) => {
  return {
    windowMs,
    max,
    message: { success: false, error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  };
};

// Common rate limits
export const rateLimits = {
  auth: createRateLimitConfig(15 * 60 * 1000, 5),        // 5 attempts per 15 minutes
  api: createRateLimitConfig(60 * 1000, 100),            // 100 requests per minute
  fileUpload: createRateLimitConfig(60 * 1000, 10),      // 10 uploads per minute
  message: createRateLimitConfig(60 * 1000, 60),         // 60 messages per minute
};

// CSRF Token validation
export const validateCSRFToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers['x-csrf-token'];
  const sessionToken = (req as any).session?.csrfToken;

  if (!token || token !== sessionToken) {
    return res.status(403).json({ 
      success: false, 
      error: 'Invalid CSRF token' 
    });
  }

  next();
};

// Password strength validation
export const validatePasswordStrength = (password: string): { valid: boolean; error?: string } => {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }

  if (password.length > 128) {
    return { valid: false, error: 'Password too long' };
  }

  // Check for common weak passwords
  const weakPasswords = [
    'password', '12345678', 'qwerty', 'abc123', 'password123',
    '11111111', '1234567890', 'letmein', 'welcome', 'monkey'
  ];

  if (weakPasswords.includes(password.toLowerCase())) {
    return { valid: false, error: 'Password too weak' };
  }

  // Require at least one uppercase, one lowercase, one number
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (!hasUpper || !hasLower || !hasNumber) {
    return { 
      valid: false, 
      error: 'Password must contain uppercase, lowercase, and numbers' 
    };
  }

  return { valid: true };
};

// Timing-safe comparison
export const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
};
