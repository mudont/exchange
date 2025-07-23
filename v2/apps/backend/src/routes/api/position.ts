import { FastifyInstance } from 'fastify';
import { PositionService } from '../../services/position-service';
import { z } from 'zod';

export async function positionRoutes(fastify: FastifyInstance) {
  const positionService = new PositionService();

  // Get user's positions
  fastify.get('/', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: z.object({
        accountId: z.string().uuid().optional(),
        instrumentSymbol: z.string().optional(),
        includeZero: z.string().optional().transform(val => val === 'true'),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const query = request.query as any;
    
    const options: any = { userId };
    if (query.accountId) options.accountId = query.accountId;
    if (query.instrumentSymbol) options.instrumentSymbol = query.instrumentSymbol;
    if (query.includeZero !== undefined) options.includeZero = query.includeZero;
    
    const positions = await positionService.getUserPositions(options);
    
    return reply.send({
      success: true,
      data: positions,
      timestamp: new Date().toISOString(),
    });
  });

  // Get position by ID
  fastify.get('/:positionId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user!.id;
    const positionId = (request.params as any).positionId;
    
    const position = await positionService.getPosition(userId, positionId);
    
    return reply.send({
      success: true,
      data: position,
      timestamp: new Date().toISOString(),
    });
  });

  // Get position summary
  fastify.get('/summary/overview', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: z.object({
        accountId: z.string().uuid().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const query = request.query as any;
    
    const summary = await positionService.getPositionSummary(userId, query.accountId);
    
    return reply.send({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  });

  // Get P&L report
  fastify.get('/pnl/report', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: z.object({
        accountId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        instrumentSymbol: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const query = request.query as any;
    
    const options: any = { userId };
    if (query.accountId) options.accountId = query.accountId;
    if (query.startDate) options.startDate = new Date(query.startDate);
    if (query.endDate) options.endDate = new Date(query.endDate);
    if (query.instrumentSymbol) options.instrumentSymbol = query.instrumentSymbol;
    
    const report = await positionService.getPnLReport(options);
    
    return reply.send({
      success: true,
      data: report,
      timestamp: new Date().toISOString(),
    });
  });

  // Get position history
  fastify.get('/:positionId/history', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: z.object({
        limit: z.string().transform(Number).optional(),
        offset: z.string().transform(Number).optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const positionId = (request.params as any).positionId;
    const query = request.query as any;
    
    const options: any = {};
    if (query.limit) options.limit = parseInt(query.limit);
    if (query.offset) options.offset = parseInt(query.offset);
    
    const history = await positionService.getPositionHistory(userId, positionId, options);
    
    return reply.send({
      success: true,
      data: history,
      timestamp: new Date().toISOString(),
    });
  });

  // Close position
  fastify.post('/:positionId/close', {
    preHandler: [fastify.authenticate],
    schema: {
      body: z.object({
        quantity: z.number().positive().optional(),
        price: z.number().positive().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const positionId = (request.params as any).positionId;
    const { quantity, price } = request.body;
    
    const result = await positionService.closePosition(userId, positionId, {
      quantity,
      price,
    });
    
    return reply.send({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  });

  // Get risk metrics
  fastify.get('/risk/metrics', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: z.object({
        accountId: z.string().uuid().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const query = request.query as any;
    
    const metrics = await positionService.getRiskMetrics(userId, query.accountId);
    
    return reply.send({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    });
  });

  // Get position performance
  fastify.get('/performance/analysis', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: z.object({
        accountId: z.string().uuid().optional(),
        period: z.enum(['1d', '7d', '30d', '90d', '1y']).optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const query = request.query as any;
    
    const analysis = await positionService.getPerformanceAnalysis(userId, {
      accountId: query.accountId,
      period: query.period || '30d',
    });
    
    return reply.send({
      success: true,
      data: analysis,
      timestamp: new Date().toISOString(),
    });
  });
}