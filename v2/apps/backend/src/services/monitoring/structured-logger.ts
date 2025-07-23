import winston from 'winston';
import { config } from '../../config';

export interface LogContext {
  userId?: string;
  accountId?: string;
  orderId?: string;
  tradeId?: string;
  instrumentSymbol?: string;
  requestId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  operation?: string;
  duration?: number;
  statusCode?: number;
  errorCode?: string;
  [key: string]: any;
}

export interface PerformanceMetric {
  operation: string;
  duration: number;
  success: boolean;
  timestamp: Date;
  context?: LogContext;
}

export interface SecurityEvent {
  type: 'LOGIN_ATTEMPT' | 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'UNAUTHORIZED_ACCESS' | 'SUSPICIOUS_ACTIVITY';
  userId?: string;
  ipAddress: string;
  userAgent?: string;
  details: any;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: Date;
}

export interface BusinessEvent {
  type: 'ORDER_PLACED' | 'ORDER_CANCELLED' | 'TRADE_EXECUTED' | 'POSITION_UPDATED' | 'BALANCE_CHANGED';
  userId: string;
  accountId?: string;
  details: any;
  timestamp: Date;
}

class StructuredLogger {
  private winston: winston.Logger;
  private performanceMetrics: PerformanceMetric[] = [];
  private securityEvents: SecurityEvent[] = [];
  private businessEvents: BusinessEvent[] = [];

  constructor() {
    this.winston = this.createWinstonLogger();
  }

  // Core logging methods with structured context
  debug(message: string, context?: LogContext): void {
    this.winston.debug(message, this.enrichContext(context));
  }

  info(message: string, context?: LogContext): void {
    this.winston.info(message, this.enrichContext(context));
  }

  warn(message: string, context?: LogContext): void {
    this.winston.warn(message, this.enrichContext(context));
  }

  error(message: string, error?: Error | any, context?: LogContext): void {
    const enrichedContext = this.enrichContext(context);
    
    if (error instanceof Error) {
      enrichedContext.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error) {
      enrichedContext.error = error;
    }

    this.winston.error(message, enrichedContext);
  }

  // Performance logging
  logPerformance(metric: PerformanceMetric): void {
    this.performanceMetrics.push(metric);
    
    // Keep only last 1000 metrics in memory
    if (this.performanceMetrics.length > 1000) {
      this.performanceMetrics.shift();
    }

    const logLevel = metric.duration > 5000 ? 'warn' : 'info';
    this.winston[logLevel]('Performance metric recorded', {
      ...this.enrichContext(metric.context),
      operation: metric.operation,
      duration: metric.duration,
      success: metric.success,
      performanceMetric: true,
    });
  }

  // Security event logging
  logSecurityEvent(event: SecurityEvent): void {
    this.securityEvents.push(event);
    
    // Keep only last 1000 events in memory
    if (this.securityEvents.length > 1000) {
      this.securityEvents.shift();
    }

    const logLevel = event.severity === 'CRITICAL' ? 'error' : 
                    event.severity === 'HIGH' ? 'warn' : 'info';

    this.winston[logLevel]('Security event recorded', {
      securityEvent: true,
      type: event.type,
      userId: event.userId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      severity: event.severity,
      details: event.details,
      timestamp: event.timestamp,
    });
  }

  // Business event logging
  logBusinessEvent(event: BusinessEvent): void {
    this.businessEvents.push(event);
    
    // Keep only last 1000 events in memory
    if (this.businessEvents.length > 1000) {
      this.businessEvents.shift();
    }

    this.winston.info('Business event recorded', {
      businessEvent: true,
      type: event.type,
      userId: event.userId,
      accountId: event.accountId,
      details: event.details,
      timestamp: event.timestamp,
    });
  }

  // HTTP request logging
  logHttpRequest(req: any, res: any, duration: number): void {
    const context: LogContext = {
      requestId: req.id,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id,
    };

    const logLevel = res.statusCode >= 500 ? 'error' : 
                    res.statusCode >= 400 ? 'warn' : 'info';

    this.winston[logLevel]('HTTP request completed', {
      ...this.enrichContext(context),
      httpRequest: true,
    });
  }

  // Database query logging
  logDatabaseQuery(query: string, duration: number, success: boolean, context?: LogContext): void {
    const logLevel = !success ? 'error' : duration > 1000 ? 'warn' : 'debug';
    
    this.winston[logLevel]('Database query executed', {
      ...this.enrichContext(context),
      query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
      duration,
      success,
      databaseQuery: true,
    });
  }

  // Cache operation logging
  logCacheOperation(operation: string, key: string, hit: boolean, duration?: number, context?: LogContext): void {
    this.winston.debug('Cache operation', {
      ...this.enrichContext(context),
      cacheOperation: true,
      operation,
      key,
      hit,
      duration,
    });
  }

  // Trading operation logging
  logTradingOperation(operation: string, details: any, context?: LogContext): void {
    this.winston.info('Trading operation', {
      ...this.enrichContext(context),
      tradingOperation: true,
      operation,
      details,
    });
  }

  // Get performance metrics
  getPerformanceMetrics(limit: number = 100): PerformanceMetric[] {
    return this.performanceMetrics.slice(-limit);
  }

  // Get security events
  getSecurityEvents(limit: number = 100): SecurityEvent[] {
    return this.securityEvents.slice(-limit);
  }

  // Get business events
  getBusinessEvents(limit: number = 100): BusinessEvent[] {
    return this.businessEvents.slice(-limit);
  }

  // Performance timing utility
  startTimer(operation: string, context?: LogContext): () => void {
    const startTime = Date.now();
    
    return (success: boolean = true) => {
      const duration = Date.now() - startTime;
      this.logPerformance({
        operation,
        duration,
        success,
        timestamp: new Date(),
        context,
      });
    };
  }

  // Create child logger with persistent context
  child(context: LogContext): ChildLogger {
    return new ChildLogger(this, context);
  }

  private createWinstonLogger(): winston.Logger {
    const logFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? 
          `\n${JSON.stringify(meta, null, 2)}` : '';
        return `${timestamp} [${level}]: ${message}${metaStr}`;
      })
    );

    const logger = winston.createLogger({
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
      format: logFormat,
      defaultMeta: { 
        service: 'trading-exchange-api',
        version: process.env.APP_VERSION || '1.0.0',
        environment: config.nodeEnv,
        hostname: require('os').hostname(),
      },
      transports: [
        // Error logs
        new winston.transports.File({ 
          filename: 'logs/error.log', 
          level: 'error',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
        // Combined logs
        new winston.transports.File({ 
          filename: 'logs/combined.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 10,
        }),
        // Performance logs
        new winston.transports.File({ 
          filename: 'logs/performance.log',
          level: 'info',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
            winston.format((info) => {
              return info.performanceMetric ? info : false;
            })()
          ),
        }),
        // Security logs
        new winston.transports.File({ 
          filename: 'logs/security.log',
          level: 'info',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
            winston.format((info) => {
              return info.securityEvent ? info : false;
            })()
          ),
        }),
        // Business logs
        new winston.transports.File({ 
          filename: 'logs/business.log',
          level: 'info',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
            winston.format((info) => {
              return info.businessEvent ? info : false;
            })()
          ),
        }),
      ],
    });

    // Add console transport for non-production environments
    if (config.nodeEnv !== 'production') {
      logger.add(
        new winston.transports.Console({
          format: consoleFormat,
        })
      );
    }

    return logger;
  }

  private enrichContext(context?: LogContext): LogContext {
    const enriched: LogContext = {
      timestamp: new Date().toISOString(),
      ...context,
    };

    // Add correlation ID if not present
    if (!enriched.correlationId) {
      enriched.correlationId = this.generateCorrelationId();
    }

    return enriched;
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

class ChildLogger {
  constructor(
    private parent: StructuredLogger,
    private persistentContext: LogContext
  ) {}

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, { ...this.persistentContext, ...context });
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, { ...this.persistentContext, ...context });
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, { ...this.persistentContext, ...context });
  }

  error(message: string, error?: Error | any, context?: LogContext): void {
    this.parent.error(message, error, { ...this.persistentContext, ...context });
  }

  logPerformance(metric: Omit<PerformanceMetric, 'context'>): void {
    this.parent.logPerformance({
      ...metric,
      context: { ...this.persistentContext, ...metric.context },
    });
  }

  startTimer(operation: string, context?: LogContext): () => void {
    return this.parent.startTimer(operation, { ...this.persistentContext, ...context });
  }
}

// Export singleton instance
export const structuredLogger = new StructuredLogger();

// Export for backward compatibility
export const logger = structuredLogger;