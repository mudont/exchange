import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { structuredLogger } from '../services/monitoring/structured-logger';
import { metricsCollector } from '../services/monitoring/metrics-collector';

/**
 * Security middleware for implementing various security best practices
 */

// Security headers middleware
export async function securityHeaders(request: FastifyRequest, reply: FastifyReply) {
  // Prevent clickjacking attacks
  reply.header('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  reply.header('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  reply.header('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  reply.header('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Note: In production, remove unsafe-inline and unsafe-eval
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  
  // Strict Transport Security (HTTPS only)
  if (request.headers['x-forwarded-proto'] === 'https' || request.protocol === 'https') {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Permissions Policy (formerly Feature Policy)
  reply.header('Permissions-Policy', [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=(self)',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
  ].join(', '));
}

// Input sanitization middleware
export async function inputSanitization(request: FastifyRequest, reply: FastifyReply) {
  if (request.body && typeof request.body === 'object') {
    sanitizeObject(request.body);
  }
  
  if (request.query && typeof request.query === 'object') {
    sanitizeObject(request.query);
  }
  
  if (request.params && typeof request.params === 'object') {
    sanitizeObject(request.params);
  }
}

// Recursively sanitize object properties
function sanitizeObject(obj: any): void {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (typeof obj[key] === 'string') {
        // Remove potentially dangerous characters
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
          .replace(/javascript:/gi, '') // Remove javascript: protocol
          .replace(/on\w+\s*=/gi, '') // Remove event handlers
          .trim();
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  }
}

// Request size limiting middleware
export async function requestSizeLimit(request: FastifyRequest, reply: FastifyReply) {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const contentLength = request.headers['content-length'];
  
  if (contentLength && parseInt(contentLength) > maxSize) {
    metricsCollector.incrementCounter('security_request_size_exceeded', 1, {
      ip: request.ip,
      path: request.url,
    });
    
    structuredLogger.warn('Request size limit exceeded', {
      ip: request.ip,
      path: request.url,
      contentLength,
      maxSize,
    });
    
    return reply.status(413).send({
      success: false,
      error: {
        code: 'REQUEST_TOO_LARGE',
        message: 'Request entity too large',
      },
    });
  }
}

// IP whitelist/blacklist middleware
export function createIPFilter(options: {
  whitelist?: string[];
  blacklist?: string[];
  trustProxy?: boolean;
}) {
  return async function ipFilter(request: FastifyRequest, reply: FastifyReply) {
    const clientIP = getClientIP(request, options.trustProxy);
    
    // Check blacklist first
    if (options.blacklist && isIPInList(clientIP, options.blacklist)) {
      metricsCollector.incrementCounter('security_ip_blocked', 1, {
        ip: clientIP,
        reason: 'blacklisted',
      });
      
      structuredLogger.warn('Blocked request from blacklisted IP', {
        ip: clientIP,
        path: request.url,
      });
      
      return reply.status(403).send({
        success: false,
        error: {
          code: 'IP_BLOCKED',
          message: 'Access denied',
        },
      });
    }
    
    // Check whitelist if configured
    if (options.whitelist && !isIPInList(clientIP, options.whitelist)) {
      metricsCollector.incrementCounter('security_ip_blocked', 1, {
        ip: clientIP,
        reason: 'not_whitelisted',
      });
      
      structuredLogger.warn('Blocked request from non-whitelisted IP', {
        ip: clientIP,
        path: request.url,
      });
      
      return reply.status(403).send({
        success: false,
        error: {
          code: 'IP_NOT_ALLOWED',
          message: 'Access denied',
        },
      });
    }
  };
}

// Get client IP address
function getClientIP(request: FastifyRequest, trustProxy: boolean = false): string {
  if (trustProxy) {
    // Check various proxy headers
    const xForwardedFor = request.headers['x-forwarded-for'];
    const xRealIP = request.headers['x-real-ip'];
    const cfConnectingIP = request.headers['cf-connecting-ip'];
    
    if (cfConnectingIP && typeof cfConnectingIP === 'string') {
      return cfConnectingIP;
    }
    
    if (xRealIP && typeof xRealIP === 'string') {
      return xRealIP;
    }
    
    if (xForwardedFor && typeof xForwardedFor === 'string') {
      return xForwardedFor.split(',')[0].trim();
    }
  }
  
  return request.ip || 'unknown';
}

// Check if IP is in list (supports CIDR notation)
function isIPInList(ip: string, list: string[]): boolean {
  return list.some(item => {
    if (item.includes('/')) {
      // CIDR notation
      return isIPInCIDR(ip, item);
    } else {
      // Exact match
      return ip === item;
    }
  });
}

// Check if IP is in CIDR range
function isIPInCIDR(ip: string, cidr: string): boolean {
  try {
    const [network, prefixLength] = cidr.split('/');
    const networkParts = network.split('.').map(Number);
    const ipParts = ip.split('.').map(Number);
    
    if (networkParts.length !== 4 || ipParts.length !== 4) {
      return false;
    }
    
    const prefix = parseInt(prefixLength);
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    
    const networkInt = (networkParts[0] << 24) | (networkParts[1] << 16) | (networkParts[2] << 8) | networkParts[3];
    const ipInt = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    
    return (networkInt & mask) === (ipInt & mask);
  } catch (error) {
    structuredLogger.error('Error checking CIDR range', error, { ip, cidr });
    return false;
  }
}

// Request logging middleware for security monitoring
export async function securityLogging(request: FastifyRequest, reply: FastifyReply) {
  const startTime = Date.now();
  const clientIP = getClientIP(request, true);
  const userAgent = request.headers['user-agent'] || 'unknown';
  const userId = (request as any).user?.id;
  
  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\.\//g, // Directory traversal
    /<script/gi, // XSS attempts
    /union.*select/gi, // SQL injection
    /exec\s*\(/gi, // Code execution
    /eval\s*\(/gi, // Code evaluation
  ];
  
  const url = request.url;
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(url));
  
  if (isSuspicious) {
    metricsCollector.incrementCounter('security_suspicious_request', 1, {
      ip: clientIP,
      path: request.url,
      method: request.method,
    });
    
    structuredLogger.warn('Suspicious request detected', {
      ip: clientIP,
      path: request.url,
      method: request.method,
      userAgent,
      userId,
    });
  }
  
  // Log all requests for security analysis
  reply.addHook('onSend', async () => {
    const duration = Date.now() - startTime;
    
    structuredLogger.info('Security request log', {
      ip: clientIP,
      method: request.method,
      path: request.url,
      statusCode: reply.statusCode,
      duration,
      userAgent,
      userId,
      suspicious: isSuspicious,
    });
  });
}

// CORS configuration for security
export const corsOptions = {
  origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    // Define allowed origins
    const allowedOrigins = [
      'http://localhost:3000', // Development frontend
      'https://localhost:3000', // Development frontend (HTTPS)
      process.env.FRONTEND_URL, // Production frontend
      process.env.ADMIN_URL, // Admin panel
    ].filter(Boolean);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      structuredLogger.warn('CORS origin blocked', { origin });
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  maxAge: 86400, // 24 hours
};

// Session security middleware
export async function sessionSecurity(request: FastifyRequest, reply: FastifyReply) {
  // Check for session fixation attacks
  const sessionId = request.headers['x-session-id'];
  if (sessionId && typeof sessionId === 'string') {
    // Validate session ID format
    if (!/^[a-zA-Z0-9-_]{32,}$/.test(sessionId)) {
      structuredLogger.warn('Invalid session ID format', {
        sessionId,
        ip: request.ip,
      });
      
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_SESSION',
          message: 'Invalid session format',
        },
      });
    }
  }
  
  // Set secure cookie attributes
  reply.addHook('onSend', async () => {
    const cookies = reply.getHeaders()['set-cookie'];
    if (cookies) {
      const secureCookies = Array.isArray(cookies) 
        ? cookies.map(addSecureCookieAttributes)
        : [addSecureCookieAttributes(cookies as string)];
      
      reply.header('Set-Cookie', secureCookies);
    }
  });
}

// Add secure attributes to cookies
function addSecureCookieAttributes(cookie: string): string {
  let secureCookie = cookie;
  
  // Add HttpOnly if not present
  if (!secureCookie.includes('HttpOnly')) {
    secureCookie += '; HttpOnly';
  }
  
  // Add Secure if HTTPS
  if (process.env.NODE_ENV === 'production' && !secureCookie.includes('Secure')) {
    secureCookie += '; Secure';
  }
  
  // Add SameSite
  if (!secureCookie.includes('SameSite')) {
    secureCookie += '; SameSite=Strict';
  }
  
  return secureCookie;
}

// Register all security middleware
export async function registerSecurityMiddleware(fastify: FastifyInstance) {
  // Register security headers
  fastify.addHook('onRequest', securityHeaders);
  
  // Register input sanitization
  fastify.addHook('preHandler', inputSanitization);
  
  // Register request size limiting
  fastify.addHook('onRequest', requestSizeLimit);
  
  // Register security logging
  fastify.addHook('onRequest', securityLogging);
  
  // Register session security
  fastify.addHook('onRequest', sessionSecurity);
  
  structuredLogger.info('Security middleware registered');
}