import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { structuredLogger } from './monitoring/structured-logger';
import { metricsCollector } from './monitoring/metrics-collector';
import { redisService } from './cache/redis-service';

/**
 * Security audit and monitoring service
 */

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  userId?: string;
  ip: string;
  userAgent?: string;
  details: Record<string, any>;
  timestamp: Date;
  resolved: boolean;
}

export enum SecurityEventType {
  FAILED_LOGIN = 'failed_login',
  SUSPICIOUS_REQUEST = 'suspicious_request',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  INVALID_TOKEN = 'invalid_token',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  DATA_BREACH_ATTEMPT = 'data_breach_attempt',
  BRUTE_FORCE_ATTACK = 'brute_force_attack',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  XSS_ATTEMPT = 'xss_attempt',
  CSRF_ATTEMPT = 'csrf_attempt',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  ACCOUNT_LOCKOUT = 'account_lockout',
  PASSWORD_POLICY_VIOLATION = 'password_policy_violation',
  API_ABUSE = 'api_abuse',
  SUSPICIOUS_TRADING = 'suspicious_trading',
}

export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export class SecurityAuditService {
  private static instance: SecurityAuditService;
  private prisma: PrismaClient;
  private redis: Redis;
  private alertThresholds: Map<SecurityEventType, number> = new Map();

  private constructor() {
    this.prisma = new PrismaClient();
    this.redis = redisService.getClient();
    this.initializeAlertThresholds();
  }

  static getInstance(): SecurityAuditService {
    if (!SecurityAuditService.instance) {
      SecurityAuditService.instance = new SecurityAuditService();
    }
    return SecurityAuditService.instance;
  }

  /**
   * Log a security event
   */
  async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const securityEvent: SecurityEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date(),
      resolved: false,
    };

    try {
      // Store in database for persistence
      await this.storeSecurityEvent(securityEvent);

      // Store in Redis for real-time monitoring
      await this.cacheSecurityEvent(securityEvent);

      // Check for alert conditions
      await this.checkAlertConditions(securityEvent);

      // Update metrics
      this.updateSecurityMetrics(securityEvent);

      // Log to structured logger
      structuredLogger.warn('Security event logged', {
        eventId: securityEvent.id,
        type: securityEvent.type,
        severity: securityEvent.severity,
        userId: securityEvent.userId,
        ip: securityEvent.ip,
        details: securityEvent.details,
      });

    } catch (error) {
      structuredLogger.error('Failed to log security event', error, {
        eventType: event.type,
        severity: event.severity,
      });
    }
  }

  /**
   * Check for brute force attacks
   */
  async checkBruteForceAttack(ip: string, userId?: string): Promise<boolean> {
    const timeWindow = 15 * 60 * 1000; // 15 minutes
    const maxAttempts = 5;

    try {
      const key = `brute_force:${ip}:${userId || 'anonymous'}`;
      const attempts = await this.redis.get(key);
      const attemptCount = attempts ? parseInt(attempts) : 0;

      if (attemptCount >= maxAttempts) {
        await this.logSecurityEvent({
          type: SecurityEventType.BRUTE_FORCE_ATTACK,
          severity: SecuritySeverity.HIGH,
          userId,
          ip,
          details: {
            attemptCount,
            timeWindow: timeWindow / 1000,
          },
        });

        return true;
      }

      // Increment attempt counter
      await this.redis.setex(key, timeWindow / 1000, attemptCount + 1);
      return false;

    } catch (error) {
      structuredLogger.error('Error checking brute force attack', error, { ip, userId });
      return false;
    }
  }

  /**
   * Monitor suspicious trading patterns
   */
  async monitorTradingActivity(userId: string, orderData: {
    quantity: string;
    price?: string;
    instrumentId: string;
    side: string;
  }): Promise<void> {
    try {
      const suspiciousPatterns = await this.detectSuspiciousTrading(userId, orderData);

      if (suspiciousPatterns.length > 0) {
        await this.logSecurityEvent({
          type: SecurityEventType.SUSPICIOUS_TRADING,
          severity: SecuritySeverity.MEDIUM,
          userId,
          ip: 'system',
          details: {
            patterns: suspiciousPatterns,
            orderData,
          },
        });
      }

    } catch (error) {
      structuredLogger.error('Error monitoring trading activity', error, { userId });
    }
  }

  /**
   * Detect account takeover attempts
   */
  async detectAccountTakeover(userId: string, ip: string, userAgent: string): Promise<boolean> {
    try {
      // Check for unusual login patterns
      const recentLogins = await this.getRecentLogins(userId, 24 * 60 * 60 * 1000); // 24 hours

      const suspiciousIndicators = [];

      // Check for multiple IPs
      const uniqueIPs = new Set(recentLogins.map(login => login.ip));
      if (uniqueIPs.size > 5) {
        suspiciousIndicators.push('multiple_ips');
      }

      // Check for unusual user agents
      const uniqueUserAgents = new Set(recentLogins.map(login => login.userAgent));
      if (uniqueUserAgents.size > 3) {
        suspiciousIndicators.push('multiple_user_agents');
      }

      // Check for rapid succession logins
      const rapidLogins = recentLogins.filter((login, index) => {
        if (index === 0) return false;
        const timeDiff = login.timestamp.getTime() - recentLogins[index - 1].timestamp.getTime();
        return timeDiff < 60000; // Less than 1 minute
      });

      if (rapidLogins.length > 3) {
        suspiciousIndicators.push('rapid_logins');
      }

      if (suspiciousIndicators.length > 0) {
        await this.logSecurityEvent({
          type: SecurityEventType.UNAUTHORIZED_ACCESS,
          severity: SecuritySeverity.HIGH,
          userId,
          ip,
          userAgent,
          details: {
            indicators: suspiciousIndicators,
            recentLoginCount: recentLogins.length,
            uniqueIPs: Array.from(uniqueIPs),
          },
        });

        return true;
      }

      return false;

    } catch (error) {
      structuredLogger.error('Error detecting account takeover', error, { userId, ip });
      return false;
    }
  }

  /**
   * Generate security report
   */
  async generateSecurityReport(timeRange: {
    startDate: Date;
    endDate: Date;
  }): Promise<{
    summary: {
      totalEvents: number;
      eventsByType: Record<SecurityEventType, number>;
      eventsBySeverity: Record<SecuritySeverity, number>;
      topIPs: Array<{ ip: string; count: number }>;
      topUsers: Array<{ userId: string; count: number }>;
    };
    events: SecurityEvent[];
    recommendations: string[];
  }> {
    try {
      const events = await this.getSecurityEvents(timeRange);

      const summary = {
        totalEvents: events.length,
        eventsByType: this.groupEventsByType(events),
        eventsBySeverity: this.groupEventsBySeverity(events),
        topIPs: this.getTopIPs(events),
        topUsers: this.getTopUsers(events),
      };

      const recommendations = this.generateRecommendations(summary);

      return {
        summary,
        events,
        recommendations,
      };

    } catch (error) {
      structuredLogger.error('Error generating security report', error);
      throw error;
    }
  }

  /**
   * Check system security health
   */
  async checkSecurityHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    issues: Array<{
      type: string;
      severity: SecuritySeverity;
      description: string;
      recommendation: string;
    }>;
    score: number;
  }> {
    const issues = [];
    let score = 100;

    try {
      // Check for recent high-severity events
      const recentEvents = await this.getRecentSecurityEvents(60 * 60 * 1000); // Last hour
      const criticalEvents = recentEvents.filter(e => e.severity === SecuritySeverity.CRITICAL);
      const highEvents = recentEvents.filter(e => e.severity === SecuritySeverity.HIGH);

      if (criticalEvents.length > 0) {
        issues.push({
          type: 'critical_events',
          severity: SecuritySeverity.CRITICAL,
          description: `${criticalEvents.length} critical security events in the last hour`,
          recommendation: 'Immediate investigation required',
        });
        score -= 30;
      }

      if (highEvents.length > 5) {
        issues.push({
          type: 'high_events',
          severity: SecuritySeverity.HIGH,
          description: `${highEvents.length} high-severity security events in the last hour`,
          recommendation: 'Review and investigate high-severity events',
        });
        score -= 20;
      }

      // Check for brute force attacks
      const bruteForceEvents = recentEvents.filter(e => e.type === SecurityEventType.BRUTE_FORCE_ATTACK);
      if (bruteForceEvents.length > 0) {
        issues.push({
          type: 'brute_force',
          severity: SecuritySeverity.HIGH,
          description: `${bruteForceEvents.length} brute force attacks detected`,
          recommendation: 'Consider implementing additional rate limiting or IP blocking',
        });
        score -= 15;
      }

      // Check for SQL injection attempts
      const sqlInjectionEvents = recentEvents.filter(e => e.type === SecurityEventType.SQL_INJECTION_ATTEMPT);
      if (sqlInjectionEvents.length > 0) {
        issues.push({
          type: 'sql_injection',
          severity: SecuritySeverity.HIGH,
          description: `${sqlInjectionEvents.length} SQL injection attempts detected`,
          recommendation: 'Review input validation and parameterized queries',
        });
        score -= 15;
      }

      const status = score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical';

      return {
        status,
        issues,
        score: Math.max(0, score),
      };

    } catch (error) {
      structuredLogger.error('Error checking security health', error);
      return {
        status: 'critical',
        issues: [{
          type: 'system_error',
          severity: SecuritySeverity.CRITICAL,
          description: 'Unable to check security health',
          recommendation: 'Check system logs and database connectivity',
        }],
        score: 0,
      };
    }
  }

  // Private methods
  private initializeAlertThresholds(): void {
    this.alertThresholds.set(SecurityEventType.FAILED_LOGIN, 10);
    this.alertThresholds.set(SecurityEventType.BRUTE_FORCE_ATTACK, 1);
    this.alertThresholds.set(SecurityEventType.SQL_INJECTION_ATTEMPT, 1);
    this.alertThresholds.set(SecurityEventType.XSS_ATTEMPT, 1);
    this.alertThresholds.set(SecurityEventType.PRIVILEGE_ESCALATION, 1);
    this.alertThresholds.set(SecurityEventType.DATA_BREACH_ATTEMPT, 1);
  }

  private generateEventId(): string {
    return `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async storeSecurityEvent(event: SecurityEvent): Promise<void> {
    // In a real implementation, you would store this in a dedicated security events table
    // For now, we'll use structured logging as the primary storage
    structuredLogger.info('Security event stored', {
      eventId: event.id,
      type: event.type,
      severity: event.severity,
      timestamp: event.timestamp,
    });
  }

  private async cacheSecurityEvent(event: SecurityEvent): Promise<void> {
    const key = `security_event:${event.id}`;
    await this.redis.setex(key, 24 * 60 * 60, JSON.stringify(event)); // 24 hours
  }

  private async checkAlertConditions(event: SecurityEvent): Promise<void> {
    const threshold = this.alertThresholds.get(event.type);
    if (!threshold) return;

    const timeWindow = 60 * 60 * 1000; // 1 hour
    const recentEvents = await this.getRecentEventsByType(event.type, timeWindow);

    if (recentEvents.length >= threshold) {
      await this.triggerSecurityAlert(event.type, recentEvents.length, threshold);
    }
  }

  private async triggerSecurityAlert(eventType: SecurityEventType, count: number, threshold: number): Promise<void> {
    structuredLogger.error('Security alert triggered', {
      eventType,
      count,
      threshold,
      timestamp: new Date(),
    });

    metricsCollector.incrementCounter('security_alerts_triggered', 1, {
      eventType,
    });

    // In a real implementation, you would send notifications here
    // (email, Slack, PagerDuty, etc.)
  }

  private updateSecurityMetrics(event: SecurityEvent): void {
    metricsCollector.incrementCounter('security_events_total', 1, {
      type: event.type,
      severity: event.severity,
    });

    if (event.userId) {
      metricsCollector.incrementCounter('security_events_by_user', 1, {
        userId: event.userId,
        type: event.type,
      });
    }

    metricsCollector.incrementCounter('security_events_by_ip', 1, {
      ip: event.ip,
      type: event.type,
    });
  }

  private async detectSuspiciousTrading(userId: string, orderData: any): Promise<string[]> {
    const patterns = [];

    // Check for unusually large orders
    const quantity = parseFloat(orderData.quantity);
    if (quantity > 100) { // Configurable threshold
      patterns.push('large_order');
    }

    // Check for rapid order placement
    const recentOrders = await this.getRecentUserOrders(userId, 5 * 60 * 1000); // 5 minutes
    if (recentOrders.length > 10) {
      patterns.push('rapid_orders');
    }

    // Check for unusual price patterns
    if (orderData.price) {
      const price = parseFloat(orderData.price);
      const marketPrice = await this.getMarketPrice(orderData.instrumentId);
      
      if (marketPrice && Math.abs(price - marketPrice) / marketPrice > 0.1) { // 10% deviation
        patterns.push('unusual_price');
      }
    }

    return patterns;
  }

  private async getRecentLogins(userId: string, timeWindow: number): Promise<Array<{
    ip: string;
    userAgent: string;
    timestamp: Date;
  }>> {
    // Mock implementation - in reality, you'd query your login logs
    return [];
  }

  private async getSecurityEvents(timeRange: { startDate: Date; endDate: Date }): Promise<SecurityEvent[]> {
    // Mock implementation - in reality, you'd query your security events table
    return [];
  }

  private async getRecentSecurityEvents(timeWindow: number): Promise<SecurityEvent[]> {
    // Mock implementation
    return [];
  }

  private async getRecentEventsByType(eventType: SecurityEventType, timeWindow: number): Promise<SecurityEvent[]> {
    // Mock implementation
    return [];
  }

  private async getRecentUserOrders(userId: string, timeWindow: number): Promise<any[]> {
    // Mock implementation
    return [];
  }

  private async getMarketPrice(instrumentId: string): Promise<number | null> {
    // Mock implementation
    return null;
  }

  private groupEventsByType(events: SecurityEvent[]): Record<SecurityEventType, number> {
    const grouped: Record<string, number> = {};
    events.forEach(event => {
      grouped[event.type] = (grouped[event.type] || 0) + 1;
    });
    return grouped as Record<SecurityEventType, number>;
  }

  private groupEventsBySeverity(events: SecurityEvent[]): Record<SecuritySeverity, number> {
    const grouped: Record<string, number> = {};
    events.forEach(event => {
      grouped[event.severity] = (grouped[event.severity] || 0) + 1;
    });
    return grouped as Record<SecuritySeverity, number>;
  }

  private getTopIPs(events: SecurityEvent[]): Array<{ ip: string; count: number }> {
    const ipCounts: Record<string, number> = {};
    events.forEach(event => {
      ipCounts[event.ip] = (ipCounts[event.ip] || 0) + 1;
    });

    return Object.entries(ipCounts)
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getTopUsers(events: SecurityEvent[]): Array<{ userId: string; count: number }> {
    const userCounts: Record<string, number> = {};
    events.forEach(event => {
      if (event.userId) {
        userCounts[event.userId] = (userCounts[event.userId] || 0) + 1;
      }
    });

    return Object.entries(userCounts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private generateRecommendations(summary: any): string[] {
    const recommendations = [];

    if (summary.eventsByType[SecurityEventType.BRUTE_FORCE_ATTACK] > 0) {
      recommendations.push('Implement stronger rate limiting for authentication endpoints');
      recommendations.push('Consider implementing CAPTCHA for repeated failed login attempts');
    }

    if (summary.eventsByType[SecurityEventType.SQL_INJECTION_ATTEMPT] > 0) {
      recommendations.push('Review and strengthen input validation');
      recommendations.push('Ensure all database queries use parameterized statements');
    }

    if (summary.eventsByType[SecurityEventType.XSS_ATTEMPT] > 0) {
      recommendations.push('Implement Content Security Policy (CSP) headers');
      recommendations.push('Review output encoding and sanitization');
    }

    if (summary.eventsBySeverity[SecuritySeverity.CRITICAL] > 0) {
      recommendations.push('Immediate investigation of critical security events required');
    }

    return recommendations;
  }
}

// Export singleton instance
export const securityAuditService = SecurityAuditService.getInstance();