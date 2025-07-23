import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';
import { structuredLogger } from './monitoring/structured-logger';

/**
 * Comprehensive input validation and sanitization service
 */

// Custom validation schemas
export const ValidationSchemas = {
  // User input schemas
  email: z.string().email().max(254).toLowerCase(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  name: z.string()
    .min(1, 'Name is required')
    .max(50, 'Name must be less than 50 characters')
    .regex(/^[a-zA-Z\s'-]+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes'),
  
  // Trading input schemas
  quantity: z.string()
    .regex(/^\d+(\.\d{1,8})?$/, 'Invalid quantity format')
    .refine(val => parseFloat(val) > 0, 'Quantity must be greater than 0')
    .refine(val => parseFloat(val) <= 1000000, 'Quantity too large'),
  
  price: z.string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Invalid price format')
    .refine(val => parseFloat(val) > 0, 'Price must be greater than 0')
    .refine(val => parseFloat(val) <= 10000000, 'Price too large'),
  
  orderSide: z.enum(['buy', 'sell']),
  orderType: z.enum(['limit', 'market', 'stop', 'stop_limit']),
  
  // ID schemas
  uuid: z.string().uuid('Invalid ID format'),
  instrumentSymbol: z.string()
    .min(3, 'Symbol too short')
    .max(10, 'Symbol too long')
    .regex(/^[A-Z0-9-]+$/, 'Symbol can only contain uppercase letters, numbers, and hyphens'),
  
  // API input schemas
  apiKeyName: z.string()
    .min(1, 'API key name is required')
    .max(100, 'API key name too long')
    .regex(/^[a-zA-Z0-9\s-_]+$/, 'API key name contains invalid characters'),
  
  // Pagination schemas
  limit: z.number().int().min(1).max(1000).default(50),
  offset: z.number().int().min(0).default(0),
  
  // Date schemas
  dateString: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  
  // Search schemas
  searchQuery: z.string()
    .max(100, 'Search query too long')
    .regex(/^[a-zA-Z0-9\s-_.]+$/, 'Search query contains invalid characters'),
};

// Input sanitization functions
export class InputSanitizer {
  /**
   * Sanitize HTML content to prevent XSS attacks
   */
  static sanitizeHTML(input: string): string {
    if (typeof input !== 'string') return '';
    
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: [], // No HTML tags allowed
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
    });
  }
  
  /**
   * Sanitize SQL input to prevent SQL injection
   */
  static sanitizeSQL(input: string): string {
    if (typeof input !== 'string') return '';
    
    return input
      .replace(/'/g, "''") // Escape single quotes
      .replace(/;/g, '') // Remove semicolons
      .replace(/--/g, '') // Remove SQL comments
      .replace(/\/\*/g, '') // Remove block comment start
      .replace(/\*\//g, '') // Remove block comment end
      .replace(/xp_/gi, '') // Remove extended procedures
      .replace(/sp_/gi, '') // Remove stored procedures
      .replace(/exec/gi, '') // Remove exec commands
      .replace(/execute/gi, '') // Remove execute commands
      .replace(/union/gi, '') // Remove union statements
      .replace(/select/gi, '') // Remove select statements
      .replace(/insert/gi, '') // Remove insert statements
      .replace(/update/gi, '') // Remove update statements
      .replace(/delete/gi, '') // Remove delete statements
      .replace(/drop/gi, '') // Remove drop statements
      .replace(/create/gi, '') // Remove create statements
      .replace(/alter/gi, ''); // Remove alter statements
  }
  
  /**
   * Sanitize file paths to prevent directory traversal
   */
  static sanitizeFilePath(input: string): string {
    if (typeof input !== 'string') return '';
    
    return input
      .replace(/\.\./g, '') // Remove parent directory references
      .replace(/\\/g, '/') // Normalize path separators
      .replace(/\/+/g, '/') // Remove multiple slashes
      .replace(/^\//, '') // Remove leading slash
      .replace(/\/$/, '') // Remove trailing slash
      .replace(/[<>:"|?*]/g, ''); // Remove invalid filename characters
  }
  
  /**
   * Sanitize user input for logging
   */
  static sanitizeForLogging(input: any): any {
    if (typeof input === 'string') {
      return input
        .replace(/password/gi, '[REDACTED]')
        .replace(/token/gi, '[REDACTED]')
        .replace(/key/gi, '[REDACTED]')
        .replace(/secret/gi, '[REDACTED]')
        .substring(0, 1000); // Limit length
    }
    
    if (typeof input === 'object' && input !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        if (key.toLowerCase().includes('password') || 
            key.toLowerCase().includes('token') || 
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('key')) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeForLogging(value);
        }
      }
      return sanitized;
    }
    
    return input;
  }
  
  /**
   * Sanitize numeric input
   */
  static sanitizeNumber(input: any, options: {
    min?: number;
    max?: number;
    decimals?: number;
  } = {}): number | null {
    const num = parseFloat(input);
    
    if (isNaN(num) || !isFinite(num)) {
      return null;
    }
    
    if (options.min !== undefined && num < options.min) {
      return null;
    }
    
    if (options.max !== undefined && num > options.max) {
      return null;
    }
    
    if (options.decimals !== undefined) {
      return parseFloat(num.toFixed(options.decimals));
    }
    
    return num;
  }
  
  /**
   * Sanitize array input
   */
  static sanitizeArray(input: any, maxLength: number = 100): any[] {
    if (!Array.isArray(input)) {
      return [];
    }
    
    return input
      .slice(0, maxLength)
      .map(item => {
        if (typeof item === 'string') {
          return this.sanitizeHTML(item);
        }
        return item;
      });
  }
}

// Validation middleware factory
export function createValidationMiddleware<T>(schema: z.ZodSchema<T>, source: 'body' | 'query' | 'params' = 'body') {
  return async function validationMiddleware(request: any, reply: any) {
    try {
      const data = request[source];
      const validatedData = schema.parse(data);
      
      // Replace the original data with validated data
      request[source] = validatedData;
      
      structuredLogger.debug('Input validation passed', {
        source,
        path: request.url,
        method: request.method,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        structuredLogger.warn('Input validation failed', {
          source,
          path: request.url,
          method: request.method,
          errors: validationErrors,
          ip: request.ip,
        });
        
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Input validation failed',
            details: validationErrors,
          },
        });
      }
      
      structuredLogger.error('Validation middleware error', error, {
        source,
        path: request.url,
        method: request.method,
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation error occurred',
        },
      });
    }
  };
}

// Common validation schemas for API endpoints
export const APIValidationSchemas = {
  // Authentication
  login: z.object({
    email: ValidationSchemas.email,
    password: z.string().min(1, 'Password is required'),
  }),
  
  register: z.object({
    email: ValidationSchemas.email,
    password: ValidationSchemas.password,
    firstName: ValidationSchemas.name,
    lastName: ValidationSchemas.name,
  }),
  
  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: ValidationSchemas.password,
  }),
  
  // Trading
  placeOrder: z.object({
    instrumentId: ValidationSchemas.uuid,
    side: ValidationSchemas.orderSide,
    type: ValidationSchemas.orderType,
    quantity: ValidationSchemas.quantity,
    price: ValidationSchemas.price.optional(),
  }).refine(data => {
    // Price is required for limit orders
    if (data.type === 'limit' && !data.price) {
      return false;
    }
    return true;
  }, {
    message: 'Price is required for limit orders',
    path: ['price'],
  }),
  
  cancelOrder: z.object({
    orderId: ValidationSchemas.uuid,
  }),
  
  // Pagination
  pagination: z.object({
    limit: ValidationSchemas.limit,
    offset: ValidationSchemas.offset,
  }),
  
  // Filtering
  orderFilter: z.object({
    instrumentId: ValidationSchemas.uuid.optional(),
    side: ValidationSchemas.orderSide.optional(),
    status: z.enum(['pending', 'filled', 'cancelled', 'partially_filled']).optional(),
    startDate: ValidationSchemas.dateString.optional(),
    endDate: ValidationSchemas.dateString.optional(),
  }),
  
  // API Key management
  createApiKey: z.object({
    name: ValidationSchemas.apiKeyName,
    permissions: z.array(z.string()).max(20).optional(),
    expiresAt: ValidationSchemas.dateString.optional(),
  }),
};

// Rate limiting validation
export class RateLimitValidator {
  private static suspiciousPatterns = [
    /\b(union|select|insert|update|delete|drop|create|alter)\b/gi,
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /\.\.\//g,
    /\/etc\/passwd/gi,
    /\/proc\/self\/environ/gi,
  ];
  
  static isSuspiciousInput(input: string): boolean {
    return this.suspiciousPatterns.some(pattern => pattern.test(input));
  }
  
  static validateRequestFrequency(requests: number[], windowMs: number, maxRequests: number): boolean {
    const now = Date.now();
    const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
    return validRequests.length <= maxRequests;
  }
}

// File upload validation
export class FileUploadValidator {
  private static allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/csv',
    'application/json',
  ];
  
  private static maxFileSize = 10 * 1024 * 1024; // 10MB
  
  static validateFile(file: {
    mimetype: string;
    size: number;
    filename: string;
  }): { valid: boolean; error?: string } {
    // Check file type
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      return {
        valid: false,
        error: `File type ${file.mimetype} is not allowed`,
      };
    }
    
    // Check file size
    if (file.size > this.maxFileSize) {
      return {
        valid: false,
        error: `File size ${file.size} exceeds maximum allowed size of ${this.maxFileSize} bytes`,
      };
    }
    
    // Check filename
    const sanitizedFilename = InputSanitizer.sanitizeFilePath(file.filename);
    if (sanitizedFilename !== file.filename) {
      return {
        valid: false,
        error: 'Filename contains invalid characters',
      };
    }
    
    return { valid: true };
  }
}

// Export validation utilities
export const ValidationUtils = {
  schemas: ValidationSchemas,
  apiSchemas: APIValidationSchemas,
  sanitizer: InputSanitizer,
  rateLimitValidator: RateLimitValidator,
  fileUploadValidator: FileUploadValidator,
  createMiddleware: createValidationMiddleware,
};