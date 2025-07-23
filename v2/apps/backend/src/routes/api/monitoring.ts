import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { applicationMonitor } from '../../services/monitoring/application-monitor';
import { metricsCollector } from '../../services/monitoring/metrics-collector';
import { structuredLogger } from '../../services/monitoring/structured-logger';

export async function monitoringRoutes(fastify: FastifyInstance) {
  // Health check endpoint
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await applicationMonitor.getHealthStatus();
      
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 206 : 503;
      
      return reply.status(statusCode).send({
        success: true,
        data: health,
      });
    } catch (error) {
      structuredLogger.error('Failed to get health status', error);
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'HEALTH_CHECK_ERROR',
          message: 'Failed to check application health',
        },
      });
    }
  });

  // Metrics endpoint (Prometheus format)
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const prometheusMetrics = metricsCollector.exportPrometheusFormat();
      
      return reply
        .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
        .send(prometheusMetrics);
    } catch (error) {
      structuredLogger.error('Failed to export metrics', error);
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'METRICS_EXPORT_ERROR',
          message: 'Failed to export metrics',
        },
      });
    }
  });

  // Metrics endpoint (JSON format)
  fastify.get('/metrics/json', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const snapshot = metricsCollector.getSnapshot();
      
      return reply.send({
        success: true,
        data: snapshot,
      });
    } catch (error) {
      structuredLogger.error('Failed to get metrics snapshot', error);
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'METRICS_SNAPSHOT_ERROR',
          message: 'Failed to get metrics snapshot',
        },
      });
    }
  });

  // Performance report
  fastify.get('/performance', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          hours: { type: 'number', minimum: 1, maximum: 168 }, // Max 1 week
        },
      },
    },
  }, async (request: FastifyRequest<{ 
    Querystring: { hours?: number } 
  }>, reply: FastifyReply) => {
    try {
      const { hours = 24 } = request.query;
      
      const report = applicationMonitor.generatePerformanceReport(hours);
      
      return reply.send({
        success: true,
        data: report,
      });
    } catch (error) {
      structuredLogger.error('Failed to generate performance report', error);
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'PERFORMANCE_REPORT_ERROR',
          message: 'Failed to generate performance report',
        },
      });
    }
  });

  // Get alert rules
  fastify.get('/alerts/rules', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const rules = applicationMonitor.getAlertRules();
      
      return reply.send({
        success: true,
        data: {
          rules,
          count: rules.length,
        },
      });
    } catch (error) {
      structuredLogger.error('Failed to get alert rules', error);
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'ALERT_RULES_ERROR',
          message: 'Failed to retrieve alert rules',
        },
      });
    }
  });

  // Add alert rule
  fastify.post('/alerts/rules', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          condition: { type: 'string' },
          threshold: { type: 'number' },
          severity: { type: 'string', enum: ['warning', 'error', 'critical'] },
          enabled: { type: 'boolean' },
          cooldownMs: { type: 'number', minimum: 60000 }, // Min 1 minute
        },
        required: ['name', 'condition', 'threshold', 'severity'],
      },
    },
  }, async (request: FastifyRequest<{ 
    Body: {
      name: string;
      condition: string;
      threshold: number;
      severity: 'warning' | 'error' | 'critical';
      enabled?: boolean;
      cooldownMs?: number;
    }
  }>, reply: FastifyReply) => {
    try {
      const { name, condition, threshold, severity, enabled = true, cooldownMs = 300000 } = request.body;
      
      const ruleId = applicationMonitor.addAlertRule({
        name,
        condition,
        threshold,
        severity,
        enabled,
        cooldownMs,
      });
      
      return reply.status(201).send({
        success: true,
        data: {
          ruleId,
          message: 'Alert rule created successfully',
        },
      });
    } catch (error) {
      structuredLogger.error('Failed to create alert rule', error);
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'ALERT_RULE_CREATE_ERROR',
          message: 'Failed to create alert rule',
        },
      });
    }
  });

  // Remove alert rule
  fastify.delete('/alerts/rules/:ruleId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          ruleId: { type: 'string' },
        },
        required: ['ruleId'],
      },
    },
  }, async (request: FastifyRequest<{ Params: { ruleId: string } }>, reply: FastifyReply) => {
    try {
      const { ruleId } = request.params;
      
      const removed = applicationMonitor.removeAlertRule(ruleId);
      
      if (removed) {
        return reply.send({
          success: true,
          data: {
            ruleId,
            message: 'Alert rule removed successfully',
          },
        });
      } else {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'ALERT_RULE_NOT_FOUND',
            message: 'Alert rule not found',
          },
        });
      }
    } catch (error) {
      structuredLogger.error('Failed to remove alert rule', error);
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'ALERT_RULE_REMOVE_ERROR',
          message: 'Failed to remove alert rule',
        },
      });
    }
  });

  // Get monitoring statistics
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = applicationMonitor.getMonitoringStats();
      
      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      structuredLogger.error('Failed to get monitoring stats', error);
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'MONITORING_STATS_ERROR',
          message: 'Failed to retrieve monitoring statistics',
        },
      });
    }
  });

  // Record custom business event
  fastify.post('/events/business', {
    schema: {
      body: {
        type: 'object',
        properties: {
          type: { 
            type: 'string', 
            enum: ['ORDER_PLACED', 'ORDER_CANCELLED', 'TRADE_EXECUTED', 'POSITION_UPDATED', 'BALANCE_CHANGED'] 
          },
          userId: { type: 'string' },
          accountId: { type: 'string' },
          details: { type: 'object' },
        },
        required: ['type', 'userId', 'details'],
      },
    },
  }, async (request: FastifyRequest<{ 
    Body: {
      type: 'ORDER_PLACED' | 'ORDER_CANCELLED' | 'TRADE_EXECUTED' | 'POSITION_UPDATED' | 'BALANCE_CHANGED';
      userId: string;
      accountId?: string;
      details: any;
    }
  }>, reply: FastifyReply) => {
    try {
      const { type, userId, accountId, details } = request.body;
      
      applicationMonitor.recordBusinessEvent({
        type,
        userId,
        accountId,
        details,
      });
      
      return reply.status(201).send({
        success: true,
        data: {
          message: 'Business event recorded successfully',
          timestamp: new Date(),
        },
      });
    } catch (error) {
      structuredLogger.error('Failed to record business event', error);
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'BUSINESS_EVENT_ERROR',
          message: 'Failed to record business event',
        },
      });
    }
  });

  // Record security event
  fastify.post('/events/security', {
    schema: {
      body: {
        type: 'object',
        properties: {
          type: { 
            type: 'string', 
            enum: ['LOGIN_ATTEMPT', 'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'UNAUTHORIZED_ACCESS', 'SUSPICIOUS_ACTIVITY'] 
          },
          userId: { type: 'string' },
          ipAddress: { type: 'string' },
          userAgent: { type: 'string' },
          severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          details: { type: 'object' },
        },
        required: ['type', 'ipAddress', 'severity', 'details'],
      },
    },
  }, async (request: FastifyRequest<{ 
    Body: {
      type: 'LOGIN_ATTEMPT' | 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'UNAUTHORIZED_ACCESS' | 'SUSPICIOUS_ACTIVITY';
      userId?: string;
      ipAddress: string;
      userAgent?: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      details: any;
    }
  }>, reply: FastifyReply) => {
    try {
      const { type, userId, ipAddress, userAgent, severity, details } = request.body;
      
      applicationMonitor.recordSecurityEvent({
        type,
        userId,
        ipAddress,
        userAgent,
        severity,
        details,
      });
      
      return reply.status(201).send({
        success: true,
        data: {
          message: 'Security event recorded successfully',
          timestamp: new Date(),
        },
      });
    } catch (error) {
      structuredLogger.error('Failed to record security event', error);
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'SECURITY_EVENT_ERROR',
          message: 'Failed to record security event',
        },
      });
    }
  });

  // Get recent logs
  fastify.get('/logs', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
          limit: { type: 'number', minimum: 1, maximum: 1000 },
          type: { type: 'string', enum: ['performance', 'security', 'business'] },
        },
      },
    },
  }, async (request: FastifyRequest<{ 
    Querystring: { 
      level?: string; 
      limit?: number; 
      type?: 'performance' | 'security' | 'business';
    } 
  }>, reply: FastifyReply) => {
    try {
      const { limit = 100, type } = request.query;
      
      let logs: any[] = [];
      
      switch (type) {
        case 'performance':
          logs = structuredLogger.getPerformanceMetrics(limit);
          break;
        case 'security':
          logs = structuredLogger.getSecurityEvents(limit);
          break;
        case 'business':
          logs = structuredLogger.getBusinessEvents(limit);
          break;
        default:
          // For general logs, we'd need to implement log retrieval from winston
          logs = [];
      }
      
      return reply.send({
        success: true,
        data: {
          logs,
          count: logs.length,
          type: type || 'all',
        },
      });
    } catch (error) {
      structuredLogger.error('Failed to retrieve logs', error);
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'LOGS_RETRIEVAL_ERROR',
          message: 'Failed to retrieve logs',
        },
      });
    }
  });

  // Custom metric endpoint
  fastify.post('/metrics/custom', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'number' },
          type: { type: 'string', enum: ['counter', 'gauge', 'histogram', 'summary'] },
          labels: { type: 'object' },
          help: { type: 'string' },
        },
        required: ['name', 'value', 'type'],
      },
    },
  }, async (request: FastifyRequest<{ 
    Body: {
      name: string;
      value: number;
      type: 'counter' | 'gauge' | 'histogram' | 'summary';
      labels?: Record<string, string>;
      help?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { name, value, type, labels, help } = request.body;
      
      switch (type) {
        case 'counter':
          metricsCollector.incrementCounter(name, value, labels);
          break;
        case 'gauge':
          metricsCollector.setGauge(name, value, labels);
          break;
        case 'histogram':
          metricsCollector.observeHistogram(name, value, labels);
          break;
        case 'summary':
          metricsCollector.observeSummary(name, value, labels);
          break;
      }
      
      return reply.status(201).send({
        success: true,
        data: {
          message: 'Custom metric recorded successfully',
          name,
          value,
          type,
          labels,
        },
      });
    } catch (error) {
      structuredLogger.error('Failed to record custom metric', error);
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CUSTOM_METRIC_ERROR',
          message: 'Failed to record custom metric',
        },
      });
    }
  });
}

export default monitoringRoutes;