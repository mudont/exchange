import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { dbOptimizer, DatabaseMetrics } from '../database/performance-optimizer';
import { connectionPool, ConnectionPoolMetrics } from '../database/connection-pool';
import { queryOptimizer } from '../database/query-optimizer';
import { EventEmitter } from 'events';

export interface DatabaseHealth {
  status: 'healthy' | 'degraded' | 'critical';
  connectionPool: ConnectionPoolMetrics;
  performance: DatabaseMetrics;
  issues: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    message: string;
    recommendation: string;
  }>;
  lastCheck: Date;
}

export interface DatabaseAlert {
  id: string;
  timestamp: Date;
  severity: 'warning' | 'error' | 'critical';
  category: string;
  message: string;
  metrics?: any;
  resolved: boolean;
}

export class DatabaseMonitorService extends EventEmitter {
  private static instance: DatabaseMonitorService;
  private prisma: PrismaClient;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private alertHistory: DatabaseAlert[] = [];
  private thresholds = {
    connectionPool: {
      maxWaitingRequests: 10,
      maxAcquireTime: 5000, // 5 seconds
      maxErrorRate: 5, // 5%
    },
    performance: {
      maxSlowQueries: 5,
      maxConnectionCount: 50,
      maxAverageQueryTime: 1000, // 1 second
    },
  };

  private constructor() {
    super();
    this.prisma = new PrismaClient();
  }

  static getInstance(): DatabaseMonitorService {
    if (!DatabaseMonitorService.instance) {
      DatabaseMonitorService.instance = new DatabaseMonitorService();
    }
    return DatabaseMonitorService.instance;
  }

  // Start database monitoring
  async startMonitoring(intervalMs: number = 30000): Promise<void> {
    logger.info('Starting database monitoring', { intervalMs });

    // Initial health check
    await this.performHealthCheck();

    // Schedule periodic monitoring
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Database monitoring check failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, intervalMs);

    logger.info('Database monitoring started');
  }

  // Stop database monitoring
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Database monitoring stopped');
    }
  }

  // Perform comprehensive health check
  async performHealthCheck(): Promise<DatabaseHealth> {
    const startTime = Date.now();
    
    try {
      const [connectionPoolMetrics, performanceMetrics] = await Promise.all([
        connectionPool.getMetrics(),
        dbOptimizer.analyzePerformance(),
      ]);

      const issues = this.analyzeIssues(connectionPoolMetrics, performanceMetrics);
      const status = this.determineHealthStatus(issues);

      const health: DatabaseHealth = {
        status,
        connectionPool: connectionPoolMetrics,
        performance: performanceMetrics,
        issues,
        lastCheck: new Date(),
      };

      // Generate alerts for critical issues
      await this.processAlerts(issues);

      // Emit health status event
      this.emit('health_check', health);

      const duration = Date.now() - startTime;
      logger.debug('Database health check completed', { 
        status, 
        issuesCount: issues.length,
        durationMs: duration 
      });

      return health;
    } catch (error) {
      logger.error('Database health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      const criticalHealth: DatabaseHealth = {
        status: 'critical',
        connectionPool: {
          totalConnections: 0,
          activeConnections: 0,
          idleConnections: 0,
          waitingRequests: 0,
          averageAcquireTime: 0,
          averageQueryTime: 0,
          errorRate: 100,
          lastHealthCheck: new Date(),
        },
        performance: {
          connectionCount: 0,
          activeQueries: 0,
          slowQueries: [],
          indexUsage: [],
          tableStats: [],
        },
        issues: [{
          severity: 'critical',
          category: 'System',
          message: 'Database health check failed',
          recommendation: 'Check database connectivity and system resources',
        }],
        lastCheck: new Date(),
      };

      this.emit('health_check', criticalHealth);
      return criticalHealth;
    }
  }

  // Get database performance recommendations
  async getPerformanceRecommendations(): Promise<Array<{
    category: string;
    recommendation: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    implementation: string;
  }>> {
    try {
      const [optimizerSuggestions, queryRecommendations] = await Promise.all([
        dbOptimizer.getOptimizationSuggestions(),
        queryOptimizer.getPerformanceRecommendations(),
      ]);

      // Combine and prioritize recommendations
      const allRecommendations = [
        ...optimizerSuggestions.map(s => ({
          category: s.type,
          recommendation: s.description,
          impact: s.impact,
          implementation: s.sql || 'Manual implementation required',
        })),
        ...queryRecommendations,
      ];

      // Sort by impact
      return allRecommendations.sort((a, b) => {
        const impactOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        return impactOrder[b.impact] - impactOrder[a.impact];
      });
    } catch (error) {
      logger.error('Failed to get performance recommendations', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  // Execute database optimization
  async executeOptimization(type: 'indexes' | 'statistics' | 'maintenance' | 'configuration'): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    logger.info('Executing database optimization', { type });

    try {
      switch (type) {
        case 'indexes':
          await dbOptimizer.createRecommendedIndexes();
          return {
            success: true,
            message: 'Database indexes created successfully',
          };

        case 'statistics':
          await dbOptimizer.updateStatistics();
          return {
            success: true,
            message: 'Database statistics updated successfully',
          };

        case 'maintenance':
          await dbOptimizer.performMaintenance();
          return {
            success: true,
            message: 'Database maintenance completed successfully',
          };

        case 'configuration':
          await dbOptimizer.optimizeConfiguration();
          return {
            success: true,
            message: 'Database configuration optimized successfully',
          };

        default:
          return {
            success: false,
            message: 'Unknown optimization type',
          };
      }
    } catch (error) {
      logger.error('Database optimization failed', {
        type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        message: `Database optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Get alert history
  getAlertHistory(limit: number = 50): DatabaseAlert[] {
    return this.alertHistory
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // Resolve an alert
  resolveAlert(alertId: string): boolean {
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      this.emit('alert_resolved', alert);
      return true;
    }
    return false;
  }

  // Get database statistics
  async getDatabaseStatistics(): Promise<{
    tables: Array<{
      name: string;
      rowCount: number;
      size: string;
      indexSize: string;
    }>;
    indexes: Array<{
      tableName: string;
      indexName: string;
      size: string;
      usage: number;
    }>;
    connections: {
      total: number;
      active: number;
      idle: number;
    };
    performance: {
      averageQueryTime: number;
      slowQueryCount: number;
      cacheHitRatio: number;
    };
  }> {
    try {
      const [tableStats, indexStats, connectionStats] = await Promise.all([
        this.getTableStatistics(),
        this.getIndexStatistics(),
        this.getConnectionStatistics(),
      ]);

      const performanceMetrics = await dbOptimizer.analyzePerformance();

      return {
        tables: tableStats,
        indexes: indexStats,
        connections: connectionStats,
        performance: {
          averageQueryTime: connectionPool.getMetrics().averageQueryTime,
          slowQueryCount: performanceMetrics.slowQueries.length,
          cacheHitRatio: 95, // Would calculate from actual cache statistics
        },
      };
    } catch (error) {
      logger.error('Failed to get database statistics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Private helper methods
  private analyzeIssues(
    connectionMetrics: ConnectionPoolMetrics,
    performanceMetrics: DatabaseMetrics
  ): Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    message: string;
    recommendation: string;
  }> {
    const issues = [];

    // Analyze connection pool issues
    if (connectionMetrics.waitingRequests > this.thresholds.connectionPool.maxWaitingRequests) {
      issues.push({
        severity: 'high' as const,
        category: 'Connection Pool',
        message: `High number of waiting requests: ${connectionMetrics.waitingRequests}`,
        recommendation: 'Consider increasing connection pool size or optimizing query performance',
      });
    }

    if (connectionMetrics.averageAcquireTime > this.thresholds.connectionPool.maxAcquireTime) {
      issues.push({
        severity: 'medium' as const,
        category: 'Connection Pool',
        message: `Slow connection acquisition: ${connectionMetrics.averageAcquireTime}ms`,
        recommendation: 'Check connection pool configuration and database load',
      });
    }

    if (connectionMetrics.errorRate > this.thresholds.connectionPool.maxErrorRate) {
      issues.push({
        severity: 'high' as const,
        category: 'Connection Pool',
        message: `High error rate: ${connectionMetrics.errorRate}%`,
        recommendation: 'Investigate database connectivity and query errors',
      });
    }

    // Analyze performance issues
    if (performanceMetrics.slowQueries.length > this.thresholds.performance.maxSlowQueries) {
      issues.push({
        severity: 'medium' as const,
        category: 'Performance',
        message: `${performanceMetrics.slowQueries.length} slow queries detected`,
        recommendation: 'Review and optimize slow queries, consider adding indexes',
      });
    }

    if (performanceMetrics.connectionCount > this.thresholds.performance.maxConnectionCount) {
      issues.push({
        severity: 'high' as const,
        category: 'Performance',
        message: `High connection count: ${performanceMetrics.connectionCount}`,
        recommendation: 'Monitor connection usage and consider connection pooling optimization',
      });
    }

    if (connectionMetrics.averageQueryTime > this.thresholds.performance.maxAverageQueryTime) {
      issues.push({
        severity: 'medium' as const,
        category: 'Performance',
        message: `Slow average query time: ${connectionMetrics.averageQueryTime}ms`,
        recommendation: 'Analyze query performance and consider database optimization',
      });
    }

    return issues;
  }

  private determineHealthStatus(issues: Array<{ severity: string }>): 'healthy' | 'degraded' | 'critical' {
    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const highIssues = issues.filter(i => i.severity === 'high').length;
    const mediumIssues = issues.filter(i => i.severity === 'medium').length;

    if (criticalIssues > 0) return 'critical';
    if (highIssues > 2 || (highIssues > 0 && mediumIssues > 3)) return 'degraded';
    if (highIssues > 0 || mediumIssues > 2) return 'degraded';
    
    return 'healthy';
  }

  private async processAlerts(issues: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    message: string;
    recommendation: string;
  }>): Promise<void> {
    for (const issue of issues) {
      if (issue.severity === 'high' || issue.severity === 'critical') {
        const alert: DatabaseAlert = {
          id: this.generateAlertId(),
          timestamp: new Date(),
          severity: issue.severity === 'critical' ? 'critical' : 'error',
          category: issue.category,
          message: issue.message,
          resolved: false,
        };

        this.alertHistory.push(alert);
        
        // Keep only last 1000 alerts
        if (this.alertHistory.length > 1000) {
          this.alertHistory.shift();
        }

        this.emit('alert', alert);
      }
    }
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async getTableStatistics(): Promise<Array<{
    name: string;
    rowCount: number;
    size: string;
    indexSize: string;
  }>> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        tablename: string;
        n_tup_ins: number;
        n_tup_upd: number;
        n_tup_del: number;
        table_size: string;
        index_size: string;
      }>>`
        SELECT 
          tablename,
          n_tup_ins + n_tup_upd + n_tup_del as row_count,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as table_size,
          pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as index_size
        FROM pg_stat_user_tables 
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 20
      `;

      return result.map(r => ({
        name: r.tablename,
        rowCount: r.n_tup_ins + r.n_tup_upd + r.n_tup_del,
        size: r.table_size,
        indexSize: r.index_size,
      }));
    } catch (error) {
      return [];
    }
  }

  private async getIndexStatistics(): Promise<Array<{
    tableName: string;
    indexName: string;
    size: string;
    usage: number;
  }>> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        tablename: string;
        indexname: string;
        idx_scan: number;
        index_size: string;
      }>>`
        SELECT 
          tablename,
          indexname,
          idx_scan,
          pg_size_pretty(pg_relation_size(indexrelid)) as index_size
        FROM pg_stat_user_indexes 
        ORDER BY idx_scan DESC
        LIMIT 20
      `;

      return result.map(r => ({
        tableName: r.tablename,
        indexName: r.indexname,
        size: r.index_size,
        usage: r.idx_scan,
      }));
    } catch (error) {
      return [];
    }
  }

  private async getConnectionStatistics(): Promise<{
    total: number;
    active: number;
    idle: number;
  }> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        total: number;
        active: number;
        idle: number;
      }>>`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE state = 'active') as active,
          COUNT(*) FILTER (WHERE state = 'idle') as idle
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;

      return result[0] || { total: 0, active: 0, idle: 0 };
    } catch (error) {
      return { total: 0, active: 0, idle: 0 };
    }
  }
}

// Export singleton instance
export const databaseMonitor = DatabaseMonitorService.getInstance();