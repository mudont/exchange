import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { databaseMonitor } from '../../services/database-monitor';
import { dbOptimizer } from '../../database/performance-optimizer';
import { connectionPool } from '../../database/connection-pool';
import { queryOptimizer } from '../../database/query-optimizer';
import { logger } from '../../utils/logger';

export async function databaseRoutes(fastify: FastifyInstance) {
  // Get database health status
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await databaseMonitor.performHealthCheck();
      
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 206 : 503;
      
      return reply.status(statusCode).send({
        success: true,
        data: health,
      });
    } catch (error) {
      logger.error('Failed to get database health', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'DATABASE_HEALTH_ERROR',
          message: 'Failed to check database health',
        },
      });
    }
  });

  // Get database performance metrics
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [
        performanceMetrics,
        connectionMetrics,
        statistics,
      ] = await Promise.all([
        dbOptimizer.analyzePerformance(),
        connectionPool.getMetrics(),
        databaseMonitor.getDatabaseStatistics(),
      ]);

      return reply.send({
        success: true,
        data: {
          performance: performanceMetrics,
          connectionPool: connectionMetrics,
          statistics,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to get database metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'DATABASE_METRICS_ERROR',
          message: 'Failed to retrieve database metrics',
        },
      });
    }
  });

  // Get performance recommendations
  fastify.get('/recommendations', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const recommendations = await databaseMonitor.getPerformanceRecommendations();
      
      return reply.send({
        success: true,
        data: {
          recommendations,
          count: recommendations.length,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to get performance recommendations', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'DATABASE_RECOMMENDATIONS_ERROR',
          message: 'Failed to retrieve performance recommendations',
        },
      });
    }
  });

  // Execute database optimization
  fastify.post('/optimize', {
    schema: {
      body: {
        type: 'object',
        properties: {
          type: { 
            type: 'string', 
            enum: ['indexes', 'statistics', 'maintenance', 'configuration'] 
          },
        },
        required: ['type'],
      },
    },
  }, async (request: FastifyRequest<{ 
    Body: { type: 'indexes' | 'statistics' | 'maintenance' | 'configuration' } 
  }>, reply: FastifyReply) => {
    try {
      const { type } = request.body;
      
      const result = await databaseMonitor.executeOptimization(type);
      
      return reply.send({
        success: result.success,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to execute database optimization', {
        type: request.body.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'DATABASE_OPTIMIZATION_ERROR',
          message: 'Failed to execute database optimization',
        },
      });
    }
  });

  // Analyze query performance
  fastify.post('/analyze-query', {
    schema: {
      body: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  }, async (request: FastifyRequest<{ Body: { query: string } }>, reply: FastifyReply) => {
    try {
      const { query } = request.body;
      
      // Security check - only allow SELECT queries
      if (!query.trim().toLowerCase().startsWith('select')) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_QUERY',
            message: 'Only SELECT queries are allowed for analysis',
          },
        });
      }
      
      const analysis = await queryOptimizer.analyzeQuery(query);
      
      return reply.send({
        success: true,
        data: analysis,
      });
    } catch (error) {
      logger.error('Failed to analyze query', {
        query: request.body.query.substring(0, 100),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'QUERY_ANALYSIS_ERROR',
          message: 'Failed to analyze query',
        },
      });
    }
  });

  // Optimize query
  fastify.post('/optimize-query', {
    schema: {
      body: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  }, async (request: FastifyRequest<{ Body: { query: string } }>, reply: FastifyReply) => {
    try {
      const { query } = request.body;
      
      const optimizations = queryOptimizer.optimizeQuery(query);
      
      return reply.send({
        success: true,
        data: {
          originalQuery: query,
          optimizations,
          count: optimizations.length,
        },
      });
    } catch (error) {
      logger.error('Failed to optimize query', {
        query: request.body.query.substring(0, 100),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'QUERY_OPTIMIZATION_ERROR',
          message: 'Failed to optimize query',
        },
      });
    }
  });

  // Benchmark query performance
  fastify.post('/benchmark-query', {
    schema: {
      body: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          iterations: { type: 'number', minimum: 1, maximum: 100 },
        },
        required: ['query'],
      },
    },
  }, async (request: FastifyRequest<{ 
    Body: { query: string; iterations?: number } 
  }>, reply: FastifyReply) => {
    try {
      const { query, iterations = 10 } = request.body;
      
      // Security check - only allow SELECT queries
      if (!query.trim().toLowerCase().startsWith('select')) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_QUERY',
            message: 'Only SELECT queries are allowed for benchmarking',
          },
        });
      }
      
      const benchmark = await queryOptimizer.benchmarkQuery(query, iterations);
      
      return reply.send({
        success: true,
        data: {
          query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
          benchmark,
        },
      });
    } catch (error) {
      logger.error('Failed to benchmark query', {
        query: request.body.query.substring(0, 100),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'QUERY_BENCHMARK_ERROR',
          message: 'Failed to benchmark query',
        },
      });
    }
  });

  // Compare two queries
  fastify.post('/compare-queries', {
    schema: {
      body: {
        type: 'object',
        properties: {
          query1: { type: 'string' },
          query2: { type: 'string' },
        },
        required: ['query1', 'query2'],
      },
    },
  }, async (request: FastifyRequest<{ 
    Body: { query1: string; query2: string } 
  }>, reply: FastifyReply) => {
    try {
      const { query1, query2 } = request.body;
      
      // Security check - only allow SELECT queries
      if (!query1.trim().toLowerCase().startsWith('select') || 
          !query2.trim().toLowerCase().startsWith('select')) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_QUERY',
            message: 'Only SELECT queries are allowed for comparison',
          },
        });
      }
      
      const comparison = await queryOptimizer.compareQueries(query1, query2);
      
      return reply.send({
        success: true,
        data: comparison,
      });
    } catch (error) {
      logger.error('Failed to compare queries', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'QUERY_COMPARISON_ERROR',
          message: 'Failed to compare queries',
        },
      });
    }
  });

  // Get database alerts
  fastify.get('/alerts', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100 },
        },
      },
    },
  }, async (request: FastifyRequest<{ 
    Querystring: { limit?: number } 
  }>, reply: FastifyReply) => {
    try {
      const { limit = 50 } = request.query;
      
      const alerts = databaseMonitor.getAlertHistory(limit);
      
      return reply.send({
        success: true,
        data: {
          alerts,
          count: alerts.length,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to get database alerts', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'DATABASE_ALERTS_ERROR',
          message: 'Failed to retrieve database alerts',
        },
      });
    }
  });

  // Resolve database alert
  fastify.patch('/alerts/:alertId/resolve', {
    schema: {
      params: {
        type: 'object',
        properties: {
          alertId: { type: 'string' },
        },
        required: ['alertId'],
      },
    },
  }, async (request: FastifyRequest<{ Params: { alertId: string } }>, reply: FastifyReply) => {
    try {
      const { alertId } = request.params;
      
      const resolved = databaseMonitor.resolveAlert(alertId);
      
      if (resolved) {
        return reply.send({
          success: true,
          data: {
            alertId,
            resolved: true,
            timestamp: new Date(),
          },
        });
      } else {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'ALERT_NOT_FOUND',
            message: 'Alert not found',
          },
        });
      }
    } catch (error) {
      logger.error('Failed to resolve alert', {
        alertId: request.params.alertId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'ALERT_RESOLVE_ERROR',
          message: 'Failed to resolve alert',
        },
      });
    }
  });

  // Archive old data
  fastify.post('/archive', {
    schema: {
      body: {
        type: 'object',
        properties: {
          daysToKeep: { type: 'number', minimum: 1, maximum: 365 },
        },
      },
    },
  }, async (request: FastifyRequest<{ 
    Body: { daysToKeep?: number } 
  }>, reply: FastifyReply) => {
    try {
      const { daysToKeep = 90 } = request.body;
      
      await dbOptimizer.archiveOldData(daysToKeep);
      
      return reply.send({
        success: true,
        data: {
          message: `Data older than ${daysToKeep} days has been archived`,
          daysToKeep,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to archive data', {
        daysToKeep: request.body.daysToKeep,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'DATA_ARCHIVE_ERROR',
          message: 'Failed to archive data',
        },
      });
    }
  });

  // Get connection pool statistics
  fastify.get('/connection-pool', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = connectionPool.getMetrics();
      
      return reply.send({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error('Failed to get connection pool metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CONNECTION_POOL_ERROR',
          message: 'Failed to retrieve connection pool metrics',
        },
      });
    }
  });
}

export default databaseRoutes;