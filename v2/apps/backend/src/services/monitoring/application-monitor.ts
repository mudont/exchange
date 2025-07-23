import { EventEmitter } from 'events';
import { structuredLogger, LogContext, SecurityEvent, BusinessEvent } from './structured-logger';
import { metricsCollector, MetricsSnapshot } from './metrics-collector';
import { cacheManager } from '../cache/cache-manager';
import { databaseMonitor } from '../database-monitor';

export interface ApplicationHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  version: string;
  environment: string;
  components: {
    database: {
      status: 'healthy' | 'degraded' | 'critical';
      responseTime: number;
      connections: number;
    };
    cache: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      hitRate: number;
      memoryUsage: string;
    };
    api: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      requestRate: number;
      errorRate: number;
      averageResponseTime: number;
    };
    system: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      memoryUsage: number;
      cpuUsage: number;
      diskUsage: number;
    };
  };
  alerts: Array<{
    severity: 'warning' | 'error' | 'critical';
    component: string;
    message: string;
    timestamp: Date;
  }>;
}

export interface PerformanceReport {
  period: {
    start: Date;
    end: Date;
    duration: number;
  };
  requests: {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
  database: {
    queries: number;
    averageQueryTime: number;
    slowQueries: number;
    connectionPoolUtilization: number;
  };
  cache: {
    operations: number;
    hitRate: number;
    missRate: number;
    averageResponseTime: number;
  };
  business: {
    ordersPlaced: number;
    tradesExecuted: number;
    userLogins: number;
    activeUsers: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
    criticalErrors: number;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  severity: 'warning' | 'error' | 'critical';
  enabled: boolean;
  cooldownMs: number;
  lastTriggered?: Date;
}

export class ApplicationMonitor extends EventEmitter {
  private static instance: ApplicationMonitor;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private performanceData: Array<{ timestamp: Date; data: any }> = [];
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Date> = new Map();
  private startTime: Date = new Date();

  private constructor() {
    super();
    this.initializeDefaultAlertRules();
    this.setupEventListeners();
  }

  static getInstance(): ApplicationMonitor {
    if (!ApplicationMonitor.instance) {
      ApplicationMonitor.instance = new ApplicationMonitor();
    }
    return ApplicationMonitor.instance;
  }

  // Start comprehensive monitoring
  async startMonitoring(intervalMs: number = 30000): Promise<void> {
    structuredLogger.info('Starting application monitoring', { intervalMs });

    // Start metrics collection
    metricsCollector.startSystemMetricsCollection(10000);

    // Start database monitoring
    await databaseMonitor.startMonitoring(30000);

    // Start periodic health checks
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
        await this.checkAlertRules();
        this.collectPerformanceData();
      } catch (error) {
        structuredLogger.error('Monitoring check failed', error);
      }
    }, intervalMs);

    // Initial health check
    await this.performHealthCheck();

    structuredLogger.info('Application monitoring started successfully');
  }

  // Stop monitoring
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    metricsCollector.stopSystemMetricsCollection();
    databaseMonitor.stopMonitoring();

    structuredLogger.info('Application monitoring stopped');
  }

  // Get comprehensive health status
  async getHealthStatus(): Promise<ApplicationHealth> {
    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    
    try {
      const [dbHealth, cacheHealth] = await Promise.all([
        databaseMonitor.performHealthCheck(),
        cacheManager.performHealthCheck(),
      ]);

      const systemMetrics = this.getSystemMetrics();
      const apiMetrics = this.getApiMetrics();

      const components = {
        database: {
          status: dbHealth.status,
          responseTime: dbHealth.connectionPool.averageQueryTime,
          connections: dbHealth.connectionPool.totalConnections,
        },
        cache: {
          status: cacheHealth.status,
          hitRate: cacheHealth.metrics.hitRate || 0,
          memoryUsage: cacheHealth.metrics.memoryUsage,
        },
        api: {
          status: this.determineApiStatus(apiMetrics),
          requestRate: apiMetrics.requestRate,
          errorRate: apiMetrics.errorRate,
          averageResponseTime: apiMetrics.averageResponseTime,
        },
        system: {
          status: this.determineSystemStatus(systemMetrics),
          memoryUsage: systemMetrics.memoryUsage,
          cpuUsage: systemMetrics.cpuUsage,
          diskUsage: systemMetrics.diskUsage,
        },
      };

      const overallStatus = this.determineOverallStatus(components);
      const alerts = this.getActiveAlerts();

      return {
        status: overallStatus,
        timestamp: new Date(),
        uptime,
        version: process.env.APP_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        components,
        alerts,
      };
    } catch (error) {
      structuredLogger.error('Failed to get health status', error);
      
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        uptime,
        version: process.env.APP_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        components: {
          database: { status: 'critical', responseTime: 0, connections: 0 },
          cache: { status: 'unhealthy', hitRate: 0, memoryUsage: 'Unknown' },
          api: { status: 'unhealthy', requestRate: 0, errorRate: 100, averageResponseTime: 0 },
          system: { status: 'unhealthy', memoryUsage: 0, cpuUsage: 0, diskUsage: 0 },
        },
        alerts: [{
          severity: 'critical',
          component: 'monitoring',
          message: 'Health check system failure',
          timestamp: new Date(),
        }],
      };
    }
  }

  // Generate performance report
  generatePerformanceReport(periodHours: number = 24): PerformanceReport {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - periodHours * 60 * 60 * 1000);
    
    const relevantData = this.performanceData.filter(
      d => d.timestamp >= startTime && d.timestamp <= endTime
    );

    // Calculate request metrics
    const requestMetrics = this.calculateRequestMetrics(relevantData);
    const databaseMetrics = this.calculateDatabaseMetrics(relevantData);
    const cacheMetrics = this.calculateCacheMetrics(relevantData);
    const businessMetrics = this.calculateBusinessMetrics(relevantData);
    const errorMetrics = this.calculateErrorMetrics(relevantData);

    return {
      period: {
        start: startTime,
        end: endTime,
        duration: periodHours * 60 * 60 * 1000,
      },
      requests: requestMetrics,
      database: databaseMetrics,
      cache: cacheMetrics,
      business: businessMetrics,
      errors: errorMetrics,
    };
  }

  // Add custom alert rule
  addAlertRule(rule: Omit<AlertRule, 'id'>): string {
    const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const alertRule: AlertRule = { ...rule, id };
    
    this.alertRules.set(id, alertRule);
    structuredLogger.info('Alert rule added', { ruleId: id, ruleName: rule.name });
    
    return id;
  }

  // Remove alert rule
  removeAlertRule(ruleId: string): boolean {
    const removed = this.alertRules.delete(ruleId);
    if (removed) {
      structuredLogger.info('Alert rule removed', { ruleId });
    }
    return removed;
  }

  // Get all alert rules
  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  // Record custom business event
  recordBusinessEvent(event: Omit<BusinessEvent, 'timestamp'>): void {
    const fullEvent: BusinessEvent = {
      ...event,
      timestamp: new Date(),
    };
    
    structuredLogger.logBusinessEvent(fullEvent);
    this.emit('business_event', fullEvent);
  }

  // Record security event
  recordSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>): void {
    const fullEvent: SecurityEvent = {
      ...event,
      timestamp: new Date(),
    };
    
    structuredLogger.logSecurityEvent(fullEvent);
    this.emit('security_event', fullEvent);
    
    // Trigger immediate alert for high/critical security events
    if (event.severity === 'HIGH' || event.severity === 'CRITICAL') {
      this.triggerAlert('security', event.type, fullEvent.severity.toLowerCase() as any);
    }
  }

  // Get monitoring statistics
  getMonitoringStats(): {
    uptime: number;
    totalMetrics: number;
    totalLogs: number;
    alertRules: number;
    activeAlerts: number;
    performanceDataPoints: number;
  } {
    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const metricsSnapshot = metricsCollector.getSnapshot();
    
    return {
      uptime,
      totalMetrics: metricsSnapshot.summary.totalMetrics,
      totalLogs: 0, // Would need to track this
      alertRules: this.alertRules.size,
      activeAlerts: this.activeAlerts.size,
      performanceDataPoints: this.performanceData.length,
    };
  }

  // Private methods
  private async performHealthCheck(): Promise<void> {
    const health = await this.getHealthStatus();
    this.emit('health_check', health);
    
    if (health.status !== 'healthy') {
      structuredLogger.warn('Application health degraded', {
        status: health.status,
        alerts: health.alerts,
      });
    }
  }

  private async checkAlertRules(): Promise<void> {
    const metrics = metricsCollector.getSnapshot();
    const now = new Date();
    
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;
      
      // Check cooldown
      const lastTriggered = this.activeAlerts.get(rule.id);
      if (lastTriggered && (now.getTime() - lastTriggered.getTime()) < rule.cooldownMs) {
        continue;
      }
      
      // Evaluate rule condition
      const shouldTrigger = this.evaluateAlertCondition(rule, metrics);
      
      if (shouldTrigger) {
        this.triggerAlert(rule.name, rule.condition, rule.severity);
        this.activeAlerts.set(rule.id, now);
      }
    }
  }

  private evaluateAlertCondition(rule: AlertRule, metrics: MetricsSnapshot): boolean {
    // Simple condition evaluation - in production, you'd want a more sophisticated rule engine
    try {
      const condition = rule.condition.toLowerCase();
      
      if (condition.includes('error_rate')) {
        const errorRate = this.calculateCurrentErrorRate();
        return errorRate > rule.threshold;
      }
      
      if (condition.includes('response_time')) {
        const responseTime = this.calculateCurrentResponseTime();
        return responseTime > rule.threshold;
      }
      
      if (condition.includes('memory_usage')) {
        const memoryUsage = this.getCurrentMemoryUsage();
        return memoryUsage > rule.threshold;
      }
      
      return false;
    } catch (error) {
      structuredLogger.error('Failed to evaluate alert condition', error, {
        ruleId: rule.id,
        condition: rule.condition,
      });
      return false;
    }
  }

  private triggerAlert(component: string, message: string, severity: 'warning' | 'error' | 'critical'): void {
    const alert = {
      severity,
      component,
      message,
      timestamp: new Date(),
    };
    
    structuredLogger.warn('Alert triggered', alert);
    this.emit('alert', alert);
  }

  private collectPerformanceData(): void {
    const data = {
      timestamp: new Date(),
      metrics: metricsCollector.getSnapshot(),
      system: this.getSystemMetrics(),
      api: this.getApiMetrics(),
    };
    
    this.performanceData.push({ timestamp: new Date(), data });
    
    // Keep only last 24 hours of data
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.performanceData = this.performanceData.filter(d => d.timestamp >= cutoff);
  }

  private getSystemMetrics(): any {
    const process = require('process');
    const os = require('os');
    
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    
    return {
      memoryUsage: ((totalMem - freeMem) / totalMem) * 100,
      cpuUsage: os.loadavg()[0] * 100, // Simplified
      diskUsage: 0, // Would need to implement disk usage check
    };
  }

  private getApiMetrics(): any {
    // Get API metrics from metrics collector
    const requestsTotal = metricsCollector.getMetric('http_requests_total');
    const requestDuration = metricsCollector.getMetric('http_request_duration_ms');
    
    return {
      requestRate: requestsTotal?.value || 0,
      errorRate: this.calculateCurrentErrorRate(),
      averageResponseTime: requestDuration?.value || 0,
    };
  }

  private calculateCurrentErrorRate(): number {
    // Calculate error rate from metrics
    const totalRequests = metricsCollector.getMetric('http_requests_total');
    const errorRequests = metricsCollector.getMetricsByType('counter')
      .filter(m => m.name === 'http_requests_total' && m.labels?.status?.startsWith('5'))
      .reduce((sum, m) => sum + m.value, 0);
    
    if (!totalRequests || totalRequests.value === 0) return 0;
    return (errorRequests / totalRequests.value) * 100;
  }

  private calculateCurrentResponseTime(): number {
    const responseTimeMetric = metricsCollector.getMetric('http_request_duration_ms');
    return responseTimeMetric?.value || 0;
  }

  private getCurrentMemoryUsage(): number {
    const memoryMetric = metricsCollector.getMetric('process_memory_heap_used_bytes');
    const totalMemoryMetric = metricsCollector.getMetric('process_memory_heap_total_bytes');
    
    if (!memoryMetric || !totalMemoryMetric || totalMemoryMetric.value === 0) return 0;
    return (memoryMetric.value / totalMemoryMetric.value) * 100;
  }

  private determineApiStatus(metrics: any): 'healthy' | 'degraded' | 'unhealthy' {
    if (metrics.errorRate > 10) return 'unhealthy';
    if (metrics.errorRate > 5 || metrics.averageResponseTime > 2000) return 'degraded';
    return 'healthy';
  }

  private determineSystemStatus(metrics: any): 'healthy' | 'degraded' | 'unhealthy' {
    if (metrics.memoryUsage > 90 || metrics.cpuUsage > 90) return 'unhealthy';
    if (metrics.memoryUsage > 80 || metrics.cpuUsage > 80) return 'degraded';
    return 'healthy';
  }

  private determineOverallStatus(components: any): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Object.values(components).map((c: any) => c.status);
    
    if (statuses.some(s => s === 'unhealthy' || s === 'critical')) return 'unhealthy';
    if (statuses.some(s => s === 'degraded')) return 'degraded';
    return 'healthy';
  }

  private getActiveAlerts(): Array<{ severity: string; component: string; message: string; timestamp: Date }> {
    // Return recent alerts - in production, you'd maintain a proper alert store
    return [];
  }

  private calculateRequestMetrics(data: any[]): any {
    // Calculate request metrics from performance data
    return {
      total: 0,
      successful: 0,
      failed: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
    };
  }

  private calculateDatabaseMetrics(data: any[]): any {
    return {
      queries: 0,
      averageQueryTime: 0,
      slowQueries: 0,
      connectionPoolUtilization: 0,
    };
  }

  private calculateCacheMetrics(data: any[]): any {
    return {
      operations: 0,
      hitRate: 0,
      missRate: 0,
      averageResponseTime: 0,
    };
  }

  private calculateBusinessMetrics(data: any[]): any {
    return {
      ordersPlaced: 0,
      tradesExecuted: 0,
      userLogins: 0,
      activeUsers: 0,
    };
  }

  private calculateErrorMetrics(data: any[]): any {
    return {
      total: 0,
      byType: {},
      criticalErrors: 0,
    };
  }

  private initializeDefaultAlertRules(): void {
    this.addAlertRule({
      name: 'High Error Rate',
      condition: 'error_rate > threshold',
      threshold: 5,
      severity: 'warning',
      enabled: true,
      cooldownMs: 5 * 60 * 1000, // 5 minutes
    });

    this.addAlertRule({
      name: 'High Response Time',
      condition: 'response_time > threshold',
      threshold: 2000,
      severity: 'warning',
      enabled: true,
      cooldownMs: 5 * 60 * 1000,
    });

    this.addAlertRule({
      name: 'High Memory Usage',
      condition: 'memory_usage > threshold',
      threshold: 85,
      severity: 'warning',
      enabled: true,
      cooldownMs: 10 * 60 * 1000, // 10 minutes
    });
  }

  private setupEventListeners(): void {
    // Listen to database monitor events
    databaseMonitor.on('alert', (alert) => {
      this.triggerAlert('database', alert.message, alert.severity as any);
    });

    // Listen to cache manager events
    cacheManager.on('health_degraded', (health) => {
      this.triggerAlert('cache', 'Cache system degraded', 'warning');
    });
  }
}

// Export singleton instance
export const applicationMonitor = ApplicationMonitor.getInstance();