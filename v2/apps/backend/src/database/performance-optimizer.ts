import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export interface DatabaseMetrics {
  connectionCount: number;
  activeQueries: number;
  slowQueries: Array<{
    query: string;
    duration: number;
    timestamp: Date;
  }>;
  indexUsage: Array<{
    tableName: string;
    indexName: string;
    scans: number;
    tuples: number;
  }>;
  tableStats: Array<{
    tableName: string;
    rowCount: number;
    size: string;
    indexSize: string;
  }>;
}

export interface QueryOptimizationSuggestion {
  type: 'INDEX' | 'QUERY_REWRITE' | 'PARTITIONING' | 'ARCHIVING';
  table: string;
  description: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  sql?: string;
}

export class DatabasePerformanceOptimizer {
  private prisma: PrismaClient;
  private slowQueryThreshold: number = 1000; // 1 second
  private metricsHistory: DatabaseMetrics[] = [];

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // Analyze database performance and provide metrics
  async analyzePerformance(): Promise<DatabaseMetrics> {
    logger.info('Analyzing database performance');

    try {
      const [
        connectionStats,
        slowQueries,
        indexUsage,
        tableStats,
      ] = await Promise.all([
        this.getConnectionStats(),
        this.getSlowQueries(),
        this.getIndexUsage(),
        this.getTableStats(),
      ]);

      const metrics: DatabaseMetrics = {
        connectionCount: connectionStats.total,
        activeQueries: connectionStats.active,
        slowQueries,
        indexUsage,
        tableStats,
      };

      // Store metrics history
      this.metricsHistory.push(metrics);
      if (this.metricsHistory.length > 100) {
        this.metricsHistory.shift(); // Keep only last 100 metrics
      }

      return metrics;
    } catch (error) {
      logger.error('Failed to analyze database performance', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Get optimization suggestions based on current performance
  async getOptimizationSuggestions(): Promise<QueryOptimizationSuggestion[]> {
    const suggestions: QueryOptimizationSuggestion[] = [];

    try {
      // Analyze missing indexes
      const missingIndexes = await this.findMissingIndexes();
      suggestions.push(...missingIndexes);

      // Analyze slow queries
      const slowQueryOptimizations = await this.analyzeSlowQueries();
      suggestions.push(...slowQueryOptimizations);

      // Check for table partitioning opportunities
      const partitioningSuggestions = await this.checkPartitioningOpportunities();
      suggestions.push(...partitioningSuggestions);

      // Check for archiving opportunities
      const archivingSuggestions = await this.checkArchivingOpportunities();
      suggestions.push(...archivingSuggestions);

      return suggestions.sort((a, b) => {
        const impactOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        return impactOrder[b.impact] - impactOrder[a.impact];
      });
    } catch (error) {
      logger.error('Failed to get optimization suggestions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  // Create recommended indexes
  async createRecommendedIndexes(): Promise<void> {
    logger.info('Creating recommended database indexes');

    const indexQueries = [
      // Trading performance indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_symbol_side_price 
       ON orders(instrument_symbol, side, price) 
       WHERE status IN ('WORKING', 'PARTIALLY_FILLED')`,

      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_created_desc 
       ON orders(user_id, created_at DESC) 
       WHERE status != 'CANCELLED'`,

      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_symbol_timestamp_desc 
       ON trades(instrument_symbol, timestamp DESC)`,

      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_user_timestamp 
       ON trades(buyer_user_id, timestamp DESC)`,

      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_seller_timestamp 
       ON trades(seller_user_id, timestamp DESC)`,

      // Position and balance indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_positions_account_updated 
       ON positions(account_id, last_updated DESC)`,

      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_balances_account_currency 
       ON balances(account_id, currency)`,

      // User and session indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_token_expires 
       ON user_sessions(token, expires_at) 
       WHERE expires_at > NOW()`,

      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auth_providers_user_provider 
       ON auth_providers(user_id, provider)`,

      // Audit and system indexes
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_timestamp 
       ON audit_logs(user_id, timestamp DESC) 
       WHERE user_id IS NOT NULL`,

      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_action_timestamp 
       ON audit_logs(action, timestamp DESC)`,

      // Composite indexes for complex queries
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_complex_query 
       ON orders(instrument_symbol, user_id, status, created_at DESC)`,

      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_market_data 
       ON trades(instrument_symbol, timestamp DESC, price, quantity)`,
    ];

    for (const query of indexQueries) {
      try {
        await this.prisma.$executeRawUnsafe(query);
        logger.debug('Created index successfully', { query: query.substring(0, 100) + '...' });
      } catch (error) {
        logger.error('Failed to create index', {
          query: query.substring(0, 100) + '...',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info('Finished creating recommended indexes');
  }

  // Optimize database configuration
  async optimizeConfiguration(): Promise<void> {
    logger.info('Optimizing database configuration');

    const optimizationQueries = [
      // Connection and memory settings
      `ALTER SYSTEM SET max_connections = '200'`,
      `ALTER SYSTEM SET shared_buffers = '256MB'`,
      `ALTER SYSTEM SET effective_cache_size = '1GB'`,
      `ALTER SYSTEM SET work_mem = '4MB'`,
      `ALTER SYSTEM SET maintenance_work_mem = '64MB'`,

      // Query optimization settings
      `ALTER SYSTEM SET random_page_cost = '1.1'`,
      `ALTER SYSTEM SET effective_io_concurrency = '200'`,
      `ALTER SYSTEM SET default_statistics_target = '100'`,

      // WAL and checkpoint settings
      `ALTER SYSTEM SET wal_buffers = '16MB'`,
      `ALTER SYSTEM SET checkpoint_completion_target = '0.9'`,
      `ALTER SYSTEM SET checkpoint_timeout = '10min'`,

      // Logging settings for monitoring
      `ALTER SYSTEM SET log_min_duration_statement = '1000'`, // Log slow queries
      `ALTER SYSTEM SET log_checkpoints = 'on'`,
      `ALTER SYSTEM SET log_connections = 'on'`,
      `ALTER SYSTEM SET log_disconnections = 'on'`,
    ];

    for (const query of optimizationQueries) {
      try {
        await this.prisma.$executeRawUnsafe(query);
        logger.debug('Applied configuration', { setting: query.split('=')[0].split(' ').pop() });
      } catch (error) {
        logger.warn('Failed to apply configuration', {
          query,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Reload configuration
    try {
      await this.prisma.$executeRawUnsafe(`SELECT pg_reload_conf()`);
      logger.info('Database configuration reloaded');
    } catch (error) {
      logger.error('Failed to reload configuration', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Update table statistics
  async updateStatistics(): Promise<void> {
    logger.info('Updating database statistics');

    const tables = [
      'users', 'orders', 'trades', 'positions', 'balances', 
      'instruments', 'accounts', 'audit_logs'
    ];

    for (const table of tables) {
      try {
        await this.prisma.$executeRawUnsafe(`ANALYZE ${table}`);
        logger.debug('Updated statistics', { table });
      } catch (error) {
        logger.error('Failed to update statistics', {
          table,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info('Database statistics updated');
  }

  // Vacuum and maintenance
  async performMaintenance(): Promise<void> {
    logger.info('Performing database maintenance');

    const maintenanceTasks = [
      { name: 'VACUUM ANALYZE orders', query: 'VACUUM ANALYZE orders' },
      { name: 'VACUUM ANALYZE trades', query: 'VACUUM ANALYZE trades' },
      { name: 'VACUUM ANALYZE positions', query: 'VACUUM ANALYZE positions' },
      { name: 'VACUUM ANALYZE balances', query: 'VACUUM ANALYZE balances' },
      { name: 'REINDEX orders', query: 'REINDEX TABLE orders' },
      { name: 'REINDEX trades', query: 'REINDEX TABLE trades' },
    ];

    for (const task of maintenanceTasks) {
      try {
        const startTime = Date.now();
        await this.prisma.$executeRawUnsafe(task.query);
        const duration = Date.now() - startTime;
        logger.info('Maintenance task completed', { 
          task: task.name, 
          durationMs: duration 
        });
      } catch (error) {
        logger.error('Maintenance task failed', {
          task: task.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  // Archive old data
  async archiveOldData(daysToKeep: number = 90): Promise<void> {
    logger.info('Archiving old data', { daysToKeep });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    try {
      // Archive old audit logs
      const archivedAuditLogs = await this.prisma.auditLog.deleteMany({
        where: {
          timestamp: { lt: cutoffDate },
        },
      });

      // Archive old user sessions
      const archivedSessions = await this.prisma.userSession.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });

      // Archive old email verifications
      const archivedVerifications = await this.prisma.emailVerification.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });

      // Archive old password resets
      const archivedResets = await this.prisma.passwordReset.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });

      logger.info('Data archiving completed', {
        auditLogs: archivedAuditLogs.count,
        sessions: archivedSessions.count,
        verifications: archivedVerifications.count,
        passwordResets: archivedResets.count,
      });
    } catch (error) {
      logger.error('Data archiving failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Private helper methods
  private async getConnectionStats(): Promise<{ total: number; active: number }> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ total: number; active: number }>>`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE state = 'active') as active
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;
      
      return result[0] || { total: 0, active: 0 };
    } catch (error) {
      return { total: 0, active: 0 };
    }
  }

  private async getSlowQueries(): Promise<Array<{ query: string; duration: number; timestamp: Date }>> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        query: string;
        mean_exec_time: number;
        calls: number;
      }>>`
        SELECT 
          query,
          mean_exec_time as duration,
          calls,
          NOW() as timestamp
        FROM pg_stat_statements 
        WHERE mean_exec_time > ${this.slowQueryThreshold}
        ORDER BY mean_exec_time DESC 
        LIMIT 10
      `;

      return result.map(r => ({
        query: r.query.substring(0, 200) + '...',
        duration: r.mean_exec_time,
        timestamp: new Date(),
      }));
    } catch (error) {
      return [];
    }
  }

  private async getIndexUsage(): Promise<Array<{
    tableName: string;
    indexName: string;
    scans: number;
    tuples: number;
  }>> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        schemaname: string;
        tablename: string;
        indexname: string;
        idx_scan: number;
        idx_tup_read: number;
      }>>`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan,
          idx_tup_read
        FROM pg_stat_user_indexes 
        ORDER BY idx_scan DESC
        LIMIT 20
      `;

      return result.map(r => ({
        tableName: r.tablename,
        indexName: r.indexname,
        scans: r.idx_scan,
        tuples: r.idx_tup_read,
      }));
    } catch (error) {
      return [];
    }
  }

  private async getTableStats(): Promise<Array<{
    tableName: string;
    rowCount: number;
    size: string;
    indexSize: string;
  }>> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        tablename: string;
        n_tup_ins: number;
        table_size: string;
        index_size: string;
      }>>`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins + n_tup_upd + n_tup_del as row_count,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as table_size,
          pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as index_size
        FROM pg_stat_user_tables 
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 10
      `;

      return result.map(r => ({
        tableName: r.tablename,
        rowCount: r.n_tup_ins,
        size: r.table_size,
        indexSize: r.index_size,
      }));
    } catch (error) {
      return [];
    }
  }

  private async findMissingIndexes(): Promise<QueryOptimizationSuggestion[]> {
    const suggestions: QueryOptimizationSuggestion[] = [];

    // Check for missing indexes based on common query patterns
    try {
      const result = await this.prisma.$queryRaw<Array<{
        schemaname: string;
        tablename: string;
        seq_scan: number;
        seq_tup_read: number;
        idx_scan: number;
      }>>`
        SELECT 
          schemaname,
          tablename,
          seq_scan,
          seq_tup_read,
          COALESCE(idx_scan, 0) as idx_scan
        FROM pg_stat_user_tables 
        WHERE seq_scan > idx_scan * 2 
        AND seq_tup_read > 1000
        ORDER BY seq_tup_read DESC
      `;

      for (const table of result) {
        suggestions.push({
          type: 'INDEX',
          table: table.tablename,
          description: `Table ${table.tablename} has high sequential scan ratio (${table.seq_scan} seq scans vs ${table.idx_scan} index scans)`,
          impact: 'HIGH',
        });
      }
    } catch (error) {
      // Ignore errors in analysis
    }

    return suggestions;
  }

  private async analyzeSlowQueries(): Promise<QueryOptimizationSuggestion[]> {
    const suggestions: QueryOptimizationSuggestion[] = [];

    // This would analyze slow queries and suggest optimizations
    // For now, return common optimization suggestions
    suggestions.push({
      type: 'QUERY_REWRITE',
      table: 'orders',
      description: 'Consider using LIMIT with ORDER BY for large result sets',
      impact: 'MEDIUM',
    });

    return suggestions;
  }

  private async checkPartitioningOpportunities(): Promise<QueryOptimizationSuggestion[]> {
    const suggestions: QueryOptimizationSuggestion[] = [];

    try {
      // Check table sizes for partitioning candidates
      const largeTables = await this.prisma.$queryRaw<Array<{
        tablename: string;
        row_count: number;
      }>>`
        SELECT 
          tablename,
          n_tup_ins + n_tup_upd + n_tup_del as row_count
        FROM pg_stat_user_tables 
        WHERE n_tup_ins + n_tup_upd + n_tup_del > 1000000
        ORDER BY row_count DESC
      `;

      for (const table of largeTables) {
        if (table.tablename === 'trades' || table.tablename === 'audit_logs') {
          suggestions.push({
            type: 'PARTITIONING',
            table: table.tablename,
            description: `Table ${table.tablename} has ${table.row_count} rows and could benefit from time-based partitioning`,
            impact: 'HIGH',
          });
        }
      }
    } catch (error) {
      // Ignore errors in analysis
    }

    return suggestions;
  }

  private async checkArchivingOpportunities(): Promise<QueryOptimizationSuggestion[]> {
    const suggestions: QueryOptimizationSuggestion[] = [];

    try {
      // Check for old data that could be archived
      const oldDataCount = await this.prisma.auditLog.count({
        where: {
          timestamp: {
            lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
          },
        },
      });

      if (oldDataCount > 10000) {
        suggestions.push({
          type: 'ARCHIVING',
          table: 'audit_logs',
          description: `${oldDataCount} old audit log entries could be archived to improve performance`,
          impact: 'MEDIUM',
        });
      }
    } catch (error) {
      // Ignore errors in analysis
    }

    return suggestions;
  }
}

// Export singleton instance
export const dbOptimizer = new DatabasePerformanceOptimizer(new PrismaClient());