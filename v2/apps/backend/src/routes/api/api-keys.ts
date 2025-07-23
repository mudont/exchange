import { FastifyInstance } from 'fastify';
import { ApiKeyService } from '../../services/api-key-service';
import { z } from 'zod';
import { HttpStatus } from '@trading-exchange/shared';

export async function apiKeyRoutes(fastify: FastifyInstance) {
  const apiKeyService = new ApiKeyService();

  // Create API key
  fastify.post('/', {
    preHandler: [fastify.authenticate],
    schema: {
      body: z.object({
        name: z.string().min(1, 'Name is required'),
        permissions: z.array(z.string()).min(1, 'At least one permission is required'),
        expiresAt: z.string().optional().transform(val => val ? new Date(val) : undefined),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const result = await apiKeyService.createApiKey(userId, request.body);
    
    return reply.status(HttpStatus.CREATED).send({
      success: true,
      data: {
        apiKey: result.apiKey,
        secret: result.secret, // Only returned once
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Get user's API keys
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user!.id;
    const apiKeys = await apiKeyService.getUserApiKeys(userId);
    
    return reply.send({
      success: true,
      data: apiKeys,
      timestamp: new Date().toISOString(),
    });
  });

  // Update API key
  fastify.put('/:keyId', {
    preHandler: [fastify.authenticate],
    schema: {
      body: z.object({
        name: z.string().optional(),
        permissions: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
        expiresAt: z.string().optional().transform(val => val ? new Date(val) : undefined),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const keyId = (request.params as any).keyId;
    
    const updatedApiKey = await apiKeyService.updateApiKey(userId, keyId, request.body);
    
    return reply.send({
      success: true,
      data: updatedApiKey,
      timestamp: new Date().toISOString(),
    });
  });

  // Delete API key
  fastify.delete('/:keyId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user!.id;
    const keyId = (request.params as any).keyId;
    
    await apiKeyService.deleteApiKey(userId, keyId);
    
    return reply.status(HttpStatus.NO_CONTENT).send();
  });

  // Get available permissions
  fastify.get('/permissions', async (request, reply) => {
    const permissions = [
      {
        name: 'read:account',
        description: 'Read account information and balances',
      },
      {
        name: 'write:account',
        description: 'Modify account settings and perform deposits/withdrawals',
      },
      {
        name: 'read:orders',
        description: 'Read order information and history',
      },
      {
        name: 'write:orders',
        description: 'Place, modify, and cancel orders',
      },
      {
        name: 'read:positions',
        description: 'Read position information and P&L',
      },
      {
        name: 'read:trades',
        description: 'Read trade history and execution details',
      },
      {
        name: 'read:market_data',
        description: 'Access market data and order book information',
      },
      {
        name: 'write:instruments',
        description: 'Create and manage trading instruments (admin only)',
      },
      {
        name: '*',
        description: 'Full access to all endpoints',
      },
    ];
    
    return reply.send({
      success: true,
      data: permissions,
      timestamp: new Date().toISOString(),
    });
  });
}