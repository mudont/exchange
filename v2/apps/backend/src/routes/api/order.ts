import { FastifyInstance } from 'fastify';
import { OrderService } from '../../services/trading/order-service';
import { z } from 'zod';
import { HttpStatus, OrderSide, OrderType, TimeInForce } from '@trading-exchange/shared';

export async function orderRoutes(fastify: FastifyInstance) {
  const orderService = new OrderService();

  // Place new order
  fastify.post('/', {
    preHandler: [fastify.authenticate],
    schema: {
      body: z.object({
        instrumentSymbol: z.string().min(1, 'Instrument symbol is required'),
        accountId: z.string().uuid('Invalid account ID'),
        side: z.nativeEnum(OrderSide),
        quantity: z.number().positive('Quantity must be positive'),
        price: z.number().positive('Price must be positive'),
        orderType: z.nativeEnum(OrderType).optional(),
        timeInForce: z.nativeEnum(TimeInForce).optional(),
        displayQuantity: z.number().positive().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const orderData = {
      ...request.body,
      userId,
      orderType: request.body.orderType || OrderType.LIMIT,
      timeInForce: request.body.timeInForce || TimeInForce.GTC,
    };
    
    const result = await orderService.placeOrder(orderData);
    
    return reply.status(HttpStatus.CREATED).send({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  });

  // Get user's orders
  fastify.get('/', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: z.object({
        accountId: z.string().uuid().optional(),
        instrumentSymbol: z.string().optional(),
        status: z.string().optional(),
        limit: z.string().transform(Number).optional(),
        offset: z.string().transform(Number).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const query = request.query as any;
    
    const options: any = { userId };
    if (query.accountId) options.accountId = query.accountId;
    if (query.instrumentSymbol) options.instrumentSymbol = query.instrumentSymbol;
    if (query.status) options.status = query.status;
    if (query.limit) options.limit = parseInt(query.limit);
    if (query.offset) options.offset = parseInt(query.offset);
    if (query.startDate) options.startDate = new Date(query.startDate);
    if (query.endDate) options.endDate = new Date(query.endDate);
    
    const orders = await orderService.getUserOrders(options);
    
    return reply.send({
      success: true,
      data: orders,
      timestamp: new Date().toISOString(),
    });
  });

  // Get order by ID
  fastify.get('/:orderId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user!.id;
    const orderId = (request.params as any).orderId;
    
    const order = await orderService.getOrder(userId, orderId);
    
    return reply.send({
      success: true,
      data: order,
      timestamp: new Date().toISOString(),
    });
  });

  // Cancel order
  fastify.delete('/:orderId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user!.id;
    const orderId = (request.params as any).orderId;
    
    const result = await orderService.cancelOrder(userId, orderId);
    
    return reply.send({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  });

  // Modify order
  fastify.put('/:orderId', {
    preHandler: [fastify.authenticate],
    schema: {
      body: z.object({
        quantity: z.number().positive().optional(),
        price: z.number().positive().optional(),
        displayQuantity: z.number().positive().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const orderId = (request.params as any).orderId;
    
    const result = await orderService.modifyOrder(userId, orderId, request.body);
    
    return reply.send({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  });

  // Get order fills/trades
  fastify.get('/:orderId/fills', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user!.id;
    const orderId = (request.params as any).orderId;
    
    const fills = await orderService.getOrderFills(userId, orderId);
    
    return reply.send({
      success: true,
      data: fills,
      timestamp: new Date().toISOString(),
    });
  });

  // Cancel all orders for user
  fastify.delete('/cancel-all', {
    preHandler: [fastify.authenticate],
    schema: {
      body: z.object({
        accountId: z.string().uuid().optional(),
        instrumentSymbol: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const { accountId, instrumentSymbol } = request.body;
    
    const result = await orderService.cancelAllOrders(userId, {
      accountId,
      instrumentSymbol,
    });
    
    return reply.send({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  });

  // Get order book for instrument
  fastify.get('/book/:instrumentSymbol', async (request, reply) => {
    const instrumentSymbol = (request.params as any).instrumentSymbol;
    
    const orderBook = await orderService.getOrderBook(instrumentSymbol);
    
    return reply.send({
      success: true,
      data: orderBook,
      timestamp: new Date().toISOString(),
    });
  });

  // Get order statistics
  fastify.get('/stats/summary', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: z.object({
        accountId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const query = request.query as any;
    
    const options: any = { userId };
    if (query.accountId) options.accountId = query.accountId;
    if (query.startDate) options.startDate = new Date(query.startDate);
    if (query.endDate) options.endDate = new Date(query.endDate);
    
    const stats = await orderService.getOrderStats(options);
    
    return reply.send({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  });
}