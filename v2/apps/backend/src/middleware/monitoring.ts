import { FastifyRequest, FastifyReply } from 'fastify';
import { structuredLogger } from '../services/monitoring/structured-logger';
import { metricsCollector } from '../services/monitoring/metrics-collector';
import { applicationMonitor } from '../services/monitoring/application-monitor';

export interface MonitoringContext {
  requestId: string;
  startTime: number;
  userId?: string;
  ipAddress: string;
  userAgent?: string;
}

// Request/Response logging middleware
export async function requestLoggingMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const startTime = Date.now();
  const requestId = generateRequestId();
  
  // Add request ID to request context
  (request as any).requestId = requestId;
  
  // Extract user information if available
  const userId = (request as any).user?.id;
  const ipAddress = request.ip || 'unknown';
  const userAgent = request.headers['user-agent'];
  
  // Log incoming request
  structuredLogger.info('HTTP request started', {
    requestId,
    method: request.method,
    url: request.url,
    userId,
    ipAddress,
    userAgent,
    headers: sanitizeHeaders(request.headers),
  });
  
  // Set up response logging
  reply.addHook('onSend', async (request, reply, payload) => {
    const duration = Date.now() - startTime;
    const statusCode = reply.statusCode;
    
    // Log response
    structuredLogger.logHttpRequest(request, reply, duration);
    
    // Record metrics
    metricsCollector.recordApiRequest(
      request.method,
      getRoutePath(request.url),
      statusCode,
      duration
    );
    
    // Record business metrics for specific endpoints
    recordBusinessMetrics(request, reply, userId);
    
    return payload;
  });
}

// Error logging middleware
export async function errorLoggingMiddleware(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = (request as any).requestId;
  const userId = (request as any).user?.id;
  
  structuredLogger.error('HTTP request error', error, {
    requestId,
    method: request.method,
    url: request.url,
    userId,
    statusCode: reply.statusCode,
    errorName: error.name,
    errorMessage: error.message,
  });
  
  // Record error metrics
  metricsCollector.incrementCounter('http_errors_total', 1, {
    method: request.method.toUpperCase(),
    path: getRoutePath(request.url),
    error_type: error.name,
  });
  
  // Record security events for authentication errors
  if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
    applicationMonitor.recordSecurityEvent({
      type: 'UNAUTHORIZED_ACCESS',
      userId,
      ipAddress: request.ip || 'unknown',
      userAgent: request.headers['user-agent'],
      severity: 'MEDIUM',
      details: {
        method: request.method,
        url: request.url,
        error: error.message,
      },
    });
  }
}

// Performance monitoring middleware
export function performanceMonitoringMiddleware() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const timer = metricsCollector.startTimer('http_request_processing');
    
    reply.addHook('onSend', async () => {
      timer();
    });
  };
}

// Database query monitoring middleware
export function databaseQueryMiddleware() {
  return {
    beforeQuery: (query: string, params?: any[]) => {
      const startTime = Date.now();
      
      return {
        startTime,
        query: query.substring(0, 200), // Truncate long queries
        params: params?.slice(0, 10), // Limit parameter logging
      };
    },
    
    afterQuery: (context: any, success: boolean, error?: Error) => {
      const duration = Date.now() - context.startTime;
      
      structuredLogger.logDatabaseQuery(
        context.query,
        duration,
        success,
        { params: context.params }
      );
      
      metricsCollector.recordDatabaseQuery(
        extractQueryOperation(context.query),
        extractTableName(context.query),
        duration,
        success
      );
      
      if (!success && error) {
        structuredLogger.error('Database query failed', error, {
          query: context.query,
          duration,
        });
      }
    },
  };
}

// Cache operation monitoring middleware
export function cacheMonitoringMiddleware() {
  return {
    beforeOperation: (operation: string, key: string) => {
      return {
        startTime: Date.now(),
        operation,
        key,
      };
    },
    
    afterOperation: (context: any, hit: boolean, error?: Error) => {
      const duration = Date.now() - context.startTime;
      
      structuredLogger.logCacheOperation(
        context.operation,
        context.key,
        hit,
        duration
      );
      
      metricsCollector.recordCacheOperation(context.operation, hit);
      
      if (error) {
        structuredLogger.error('Cache operation failed', error, {
          operation: context.operation,
          key: context.key,
          duration,
        });
      }
    },
  };
}

// Trading operation monitoring middleware
export function tradingMonitoringMiddleware() {
  return {
    recordOrderPlaced: (userId: string, instrumentSymbol: string, side: string, orderId: string) => {
      structuredLogger.logTradingOperation('ORDER_PLACED', {
        userId,
        instrumentSymbol,
        side,
        orderId,
      });
      
      metricsCollector.recordOrderPlaced(instrumentSymbol, side, userId);
      
      applicationMonitor.recordBusinessEvent({
        type: 'ORDER_PLACED',
        userId,
        details: {
          instrumentSymbol,
          side,
          orderId,
        },
      });
    },
    
    recordTradeExecuted: (
      buyerUserId: string,
      sellerUserId: string,
      instrumentSymbol: string,
      quantity: number,
      price: number,
      tradeId: string
    ) => {
      structuredLogger.logTradingOperation('TRADE_EXECUTED', {
        buyerUserId,
        sellerUserId,
        instrumentSymbol,
        quantity,
        price,
        tradeId,
      });
      
      metricsCollector.recordTradeExecuted(instrumentSymbol, quantity, price);
      
      // Record business events for both users
      [buyerUserId, sellerUserId].forEach(userId => {
        applicationMonitor.recordBusinessEvent({
          type: 'TRADE_EXECUTED',
          userId,
          details: {
            instrumentSymbol,
            quantity,
            price,
            tradeId,
            role: userId === buyerUserId ? 'buyer' : 'seller',
          },
        });
      });
    },
    
    recordOrderCancelled: (userId: string, orderId: string, reason: string) => {
      structuredLogger.logTradingOperation('ORDER_CANCELLED', {
        userId,
        orderId,
        reason,
      });
      
      metricsCollector.incrementCounter('orders_cancelled_total', 1, {
        user_id: userId,
        reason,
      });
      
      applicationMonitor.recordBusinessEvent({
        type: 'ORDER_CANCELLED',
        userId,
        details: {
          orderId,
          reason,
        },
      });
    },
  };
}

// Authentication monitoring middleware
export function authMonitoringMiddleware() {
  return {
    recordLoginAttempt: (email: string, ipAddress: string, userAgent?: string) => {
      applicationMonitor.recordSecurityEvent({
        type: 'LOGIN_ATTEMPT',
        ipAddress,
        userAgent,
        severity: 'LOW',
        details: { email },
      });
    },
    
    recordLoginSuccess: (userId: string, email: string, ipAddress: string, userAgent?: string) => {
      structuredLogger.info('User login successful', {
        userId,
        email,
        ipAddress,
        userAgent,
      });
      
      metricsCollector.recordUserLogin(userId, true);
      
      applicationMonitor.recordSecurityEvent({
        type: 'LOGIN_SUCCESS',
        userId,
        ipAddress,
        userAgent,
        severity: 'LOW',
        details: { email },
      });
    },
    
    recordLoginFailure: (email: string, reason: string, ipAddress: string, userAgent?: string) => {
      structuredLogger.warn('User login failed', {
        email,
        reason,
        ipAddress,
        userAgent,
      });
      
      metricsCollector.incrementCounter('login_failures_total', 1, {
        reason,
        ip_address: ipAddress,
      });
      
      applicationMonitor.recordSecurityEvent({
        type: 'LOGIN_FAILURE',
        ipAddress,
        userAgent,
        severity: 'MEDIUM',
        details: { email, reason },
      });
    },
    
    recordSuspiciousActivity: (
      userId: string | undefined,
      activity: string,
      ipAddress: string,
      details: any
    ) => {
      structuredLogger.warn('Suspicious activity detected', {
        userId,
        activity,
        ipAddress,
        details,
      });
      
      applicationMonitor.recordSecurityEvent({
        type: 'SUSPICIOUS_ACTIVITY',
        userId,
        ipAddress,
        severity: 'HIGH',
        details: { activity, ...details },
      });
    },
  };
}

// Utility functions
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function sanitizeHeaders(headers: any): any {
  const sanitized = { ...headers };
  
  // Remove sensitive headers
  delete sanitized.authorization;
  delete sanitized.cookie;
  delete sanitized['x-api-key'];
  
  return sanitized;
}

function getRoutePath(url: string): string {
  // Extract route pattern from URL (remove query parameters and IDs)
  return url
    .split('?')[0] // Remove query parameters
    .replace(/\/[0-9a-f-]{36}/g, '/:id') // Replace UUIDs with :id
    .replace(/\/\d+/g, '/:id') // Replace numeric IDs with :id
    .replace(/\/[a-zA-Z0-9_-]{20,}/g, '/:id'); // Replace long alphanumeric IDs
}

function recordBusinessMetrics(request: FastifyRequest, reply: FastifyReply, userId?: string): void {
  const method = request.method;
  const url = request.url;
  const statusCode = reply.statusCode;
  
  // Record specific business metrics based on endpoints
  if (url.includes('/orders') && method === 'POST' && statusCode === 201) {
    metricsCollector.incrementCounter('business_orders_created_total', 1, {
      user_id: userId || 'anonymous',
    });
  }
  
  if (url.includes('/trades') && statusCode === 200) {
    metricsCollector.incrementCounter('business_trades_viewed_total', 1, {
      user_id: userId || 'anonymous',
    });
  }
  
  if (url.includes('/auth/login') && method === 'POST' && statusCode === 200) {
    metricsCollector.incrementCounter('business_logins_total', 1);
  }
}

function extractQueryOperation(query: string): string {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.startsWith('select')) return 'select';
  if (trimmed.startsWith('insert')) return 'insert';
  if (trimmed.startsWith('update')) return 'update';
  if (trimmed.startsWith('delete')) return 'delete';
  return 'other';
}

function extractTableName(query: string): string {
  const trimmed = query.trim().toLowerCase();
  
  // Simple table name extraction (would need more sophisticated parsing for complex queries)
  const fromMatch = trimmed.match(/from\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  const intoMatch = trimmed.match(/into\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  const updateMatch = trimmed.match(/update\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  
  return fromMatch?.[1] || intoMatch?.[1] || updateMatch?.[1] || 'unknown';
}

// Export monitoring middleware factory
export function createMonitoringMiddleware() {
  return {
    request: requestLoggingMiddleware,
    error: errorLoggingMiddleware,
    performance: performanceMonitoringMiddleware,
    database: databaseQueryMiddleware,
    cache: cacheMonitoringMiddleware,
    trading: tradingMonitoringMiddleware,
    auth: authMonitoringMiddleware,
  };
}