import { z } from 'zod';
import { structuredLogger } from '../services/monitoring/structured-logger';

/**
 * Security configuration and environment validation
 */

// Environment variable validation schema
const SecurityConfigSchema = z.object({
  // JWT Configuration
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  // API Key Configuration
  API_KEY_SECRET: z.string().min(32, 'API key secret must be at least 32 characters'),
  
  // Password Configuration
  PASSWORD_MIN_LENGTH: z.string().transform(Number).pipe(z.number().min(8)).default('12'),
  PASSWORD_REQUIRE_UPPERCASE: z.string().transform(val => val === 'true').default('true'),
  PASSWORD_REQUIRE_LOWERCASE: z.string().transform(val => val === 'true').default('true'),
  PASSWORD_REQUIRE_NUMBERS: z.string().transform(val => val === 'true').default('true'),
  PASSWORD_REQUIRE_SYMBOLS: z.string().transform(val => val === 'true').default('true'),
  PASSWORD_MAX_AGE_DAYS: z.string().transform(Number).pipe(z.number().positive()).default('90'),
  
  // Session Configuration
  SESSION_SECRET: z.string().min(32, 'Session secret must be at least 32 characters'),
  SESSION_TIMEOUT_MINUTES: z.string().transform(Number).pipe(z.number().positive()).default('30'),
  SESSION_ABSOLUTE_TIMEOUT_HOURS: z.string().transform(Number).pipe(z.number().positive()).default('8'),
  
  // Rate Limiting Configuration
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).pipe(z.number().positive()).default('900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().positive()).default('100'),
  RATE_LIMIT_AUTH_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().positive()).default('5'),
  RATE_LIMIT_TRADING_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().positive()).default('30'),
  
  // CORS Configuration
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  CORS_CREDENTIALS: z.string().transform(val => val === 'true').default('true'),
  
  // HTTPS Configuration
  FORCE_HTTPS: z.string().transform(val => val === 'true').default('false'),
  HTTPS_PORT: z.string().transform(Number).pipe(z.number().positive()).optional(),
  SSL_CERT_PATH: z.string().optional(),
  SSL_KEY_PATH: z.string().optional(),
  
  // Database Security
  DB_SSL_MODE: z.enum(['disable', 'require', 'verify-ca', 'verify-full']).default('require'),
  DB_CONNECTION_LIMIT: z.string().transform(Number).pipe(z.number().positive()).default('20'),
  DB_IDLE_TIMEOUT_MS: z.string().transform(Number).pipe(z.number().positive()).default('30000'),
  
  // Redis Security
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.string().transform(val => val === 'true').default('false'),
  
  // File Upload Security
  MAX_FILE_SIZE_MB: z.string().transform(Number).pipe(z.number().positive()).default('10'),
  ALLOWED_FILE_TYPES: z.string().default('image/jpeg,image/png,image/gif,application/pdf'),
  
  // IP Security
  TRUSTED_PROXIES: z.string().default(''),
  IP_WHITELIST: z.string().default(''),
  IP_BLACKLIST: z.string().default(''),
  
  // Audit Configuration
  AUDIT_LOG_RETENTION_DAYS: z.string().transform(Number).pipe(z.number().positive()).default('90'),
  SECURITY_EVENT_RETENTION_DAYS: z.string().transform(Number).pipe(z.number().positive()).default('365'),
  
  // Encryption Configuration
  ENCRYPTION_KEY: z.string().min(32, 'Encryption key must be at least 32 characters'),
  ENCRYPTION_ALGORITHM: z.string().default('aes-256-gcm'),
  
  // Two-Factor Authentication
  TOTP_ISSUER: z.string().default('Trading Exchange'),
  TOTP_WINDOW: z.string().transform(Number).pipe(z.number().positive()).default('1'),
  
  // Security Headers
  CSP_REPORT_URI: z.string().optional(),
  HSTS_MAX_AGE: z.string().transform(Number).pipe(z.number().positive()).default('31536000'), // 1 year
  
  // Environment
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
});

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

class SecurityConfigManager {
  private static instance: SecurityConfigManager;
  private config: SecurityConfig;

  private constructor() {
    this.config = this.validateAndLoadConfig();
    this.validateProductionSecurity();
  }

  static getInstance(): SecurityConfigManager {
    if (!SecurityConfigManager.instance) {
      SecurityConfigManager.instance = new SecurityConfigManager();
    }
    return SecurityConfigManager.instance;
  }

  getConfig(): SecurityConfig {
    return this.config;
  }

  private validateAndLoadConfig(): SecurityConfig {
    try {
      const config = SecurityConfigSchema.parse(process.env);
      
      structuredLogger.info('Security configuration loaded successfully', {
        environment: config.NODE_ENV,
        httpsEnabled: config.FORCE_HTTPS,
        corsOrigin: config.CORS_ORIGIN,
      });

      return config;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const missingVars = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        structuredLogger.error('Security configuration validation failed', {
          missingVariables: missingVars,
        });

        throw new Error(`Security configuration validation failed: ${JSON.stringify(missingVars)}`);
      }

      throw error;
    }
  }

  private validateProductionSecurity(): void {
    if (this.config.NODE_ENV === 'production') {
      const issues: string[] = [];

      // Check for secure secrets
      if (this.config.JWT_SECRET.length < 64) {
        issues.push('JWT_SECRET should be at least 64 characters in production');
      }

      if (this.config.API_KEY_SECRET.length < 64) {
        issues.push('API_KEY_SECRET should be at least 64 characters in production');
      }

      if (this.config.SESSION_SECRET.length < 64) {
        issues.push('SESSION_SECRET should be at least 64 characters in production');
      }

      // Check HTTPS configuration
      if (!this.config.FORCE_HTTPS) {
        issues.push('HTTPS should be enforced in production');
      }

      // Check database security
      if (this.config.DB_SSL_MODE === 'disable') {
        issues.push('Database SSL should be enabled in production');
      }

      // Check CORS configuration
      if (this.config.CORS_ORIGIN === 'http://localhost:3000') {
        issues.push('CORS origin should be configured for production domain');
      }

      // Check password requirements
      if (this.config.PASSWORD_MIN_LENGTH < 12) {
        issues.push('Password minimum length should be at least 12 characters in production');
      }

      if (issues.length > 0) {
        structuredLogger.warn('Production security issues detected', { issues });
        
        if (process.env.STRICT_SECURITY === 'true') {
          throw new Error(`Production security validation failed: ${issues.join(', ')}`);
        }
      }
    }
  }

  // Security policy getters
  getPasswordPolicy() {
    return {
      minLength: this.config.PASSWORD_MIN_LENGTH,
      requireUppercase: this.config.PASSWORD_REQUIRE_UPPERCASE,
      requireLowercase: this.config.PASSWORD_REQUIRE_LOWERCASE,
      requireNumbers: this.config.PASSWORD_REQUIRE_NUMBERS,
      requireSymbols: this.config.PASSWORD_REQUIRE_SYMBOLS,
      maxAgeDays: this.config.PASSWORD_MAX_AGE_DAYS,
    };
  }

  getSessionPolicy() {
    return {
      secret: this.config.SESSION_SECRET,
      timeoutMinutes: this.config.SESSION_TIMEOUT_MINUTES,
      absoluteTimeoutHours: this.config.SESSION_ABSOLUTE_TIMEOUT_HOURS,
    };
  }

  getRateLimitPolicy() {
    return {
      windowMs: this.config.RATE_LIMIT_WINDOW_MS,
      maxRequests: this.config.RATE_LIMIT_MAX_REQUESTS,
      authMaxRequests: this.config.RATE_LIMIT_AUTH_MAX_REQUESTS,
      tradingMaxRequests: this.config.RATE_LIMIT_TRADING_MAX_REQUESTS,
    };
  }

  getCorsPolicy() {
    return {
      origin: this.config.CORS_ORIGIN.split(',').map(origin => origin.trim()),
      credentials: this.config.CORS_CREDENTIALS,
    };
  }

  getFileUploadPolicy() {
    return {
      maxSizeMB: this.config.MAX_FILE_SIZE_MB,
      allowedTypes: this.config.ALLOWED_FILE_TYPES.split(',').map(type => type.trim()),
    };
  }

  getIPSecurityPolicy() {
    return {
      trustedProxies: this.config.TRUSTED_PROXIES ? this.config.TRUSTED_PROXIES.split(',').map(ip => ip.trim()) : [],
      whitelist: this.config.IP_WHITELIST ? this.config.IP_WHITELIST.split(',').map(ip => ip.trim()) : [],
      blacklist: this.config.IP_BLACKLIST ? this.config.IP_BLACKLIST.split(',').map(ip => ip.trim()) : [],
    };
  }

  getEncryptionPolicy() {
    return {
      key: this.config.ENCRYPTION_KEY,
      algorithm: this.config.ENCRYPTION_ALGORITHM,
    };
  }

  getTOTPPolicy() {
    return {
      issuer: this.config.TOTP_ISSUER,
      window: this.config.TOTP_WINDOW,
    };
  }

  getAuditPolicy() {
    return {
      logRetentionDays: this.config.AUDIT_LOG_RETENTION_DAYS,
      securityEventRetentionDays: this.config.SECURITY_EVENT_RETENTION_DAYS,
    };
  }

  // Security validation methods
  validatePassword(password: string): { valid: boolean; errors: string[] } {
    const policy = this.getPasswordPolicy();
    const errors: string[] = [];

    if (password.length < policy.minLength) {
      errors.push(`Password must be at least ${policy.minLength} characters long`);
    }

    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (policy.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (policy.requireSymbols && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // Check for common weak passwords
    const commonPasswords = [
      'password', '123456', 'password123', 'admin', 'qwerty',
      'letmein', 'welcome', 'monkey', '1234567890', 'password1'
    ];

    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common and easily guessable');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  isProductionEnvironment(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  isDevelopmentEnvironment(): boolean {
    return this.config.NODE_ENV === 'development';
  }

  isTestEnvironment(): boolean {
    return this.config.NODE_ENV === 'test';
  }
}

// Export singleton instance
export const securityConfig = SecurityConfigManager.getInstance();

// Security constants
export const SECURITY_CONSTANTS = {
  // Token expiration times
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '7d',
  PASSWORD_RESET_TOKEN_EXPIRY: '1h',
  EMAIL_VERIFICATION_TOKEN_EXPIRY: '24h',
  
  // Rate limiting
  DEFAULT_RATE_LIMIT: 100,
  AUTH_RATE_LIMIT: 5,
  TRADING_RATE_LIMIT: 30,
  MARKET_DATA_RATE_LIMIT: 300,
  
  // Security headers
  SECURITY_HEADERS: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  },
  
  // File upload limits
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'text/csv'],
  
  // Session configuration
  SESSION_COOKIE_NAME: 'trading_session',
  CSRF_TOKEN_NAME: 'csrf_token',
  
  // Encryption
  ENCRYPTION_KEY_LENGTH: 32,
  IV_LENGTH: 16,
  TAG_LENGTH: 16,
  
  // Audit
  MAX_AUDIT_LOG_SIZE: 1000000, // 1MB
  AUDIT_LOG_ROTATION_DAYS: 30,
};

// Security utility functions
export const SecurityUtils = {
  generateSecureToken: (length: number = 32): string => {
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('hex');
  },
  
  hashPassword: async (password: string): Promise<string> => {
    const bcrypt = require('bcrypt');
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  },
  
  verifyPassword: async (password: string, hash: string): Promise<boolean> => {
    const bcrypt = require('bcrypt');
    return bcrypt.compare(password, hash);
  },
  
  encryptData: (data: string, key: string): { encrypted: string; iv: string; tag: string } => {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(SECURITY_CONSTANTS.IV_LENGTH);
    const cipher = crypto.createCipher(algorithm, key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  },
  
  decryptData: (encryptedData: string, key: string, iv: string, tag: string): string => {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const decipher = crypto.createDecipher(algorithm, key, Buffer.from(iv, 'hex'));
    
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  },
  
  sanitizeForLog: (data: any): any => {
    if (typeof data === 'string') {
      return data.replace(/password|token|secret|key/gi, '[REDACTED]');
    }
    
    if (typeof data === 'object' && data !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        if (/password|token|secret|key/i.test(key)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = SecurityUtils.sanitizeForLog(value);
        }
      }
      return sanitized;
    }
    
    return data;
  },
};