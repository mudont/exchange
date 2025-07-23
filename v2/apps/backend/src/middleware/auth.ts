import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../database';
import { logger } from '../utils/logger';
import { ApiKeyService } from '../services/api-key-service';

const apiKeyService = new ApiKeyService();

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Check for API key first
    const apiKey = request.headers['x-api-key'] as string;
    if (apiKey) {
      return await authenticateWithApiKey(request, reply, apiKey);
    }

    // Fall back to JWT authentication
    return await authenticateWithJWT(request, reply);
    
  } catch (error) {
    logger.error('Authentication error:', error);
    
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication failed',
      },
    });
  }
}

async function authenticateWithJWT(request: FastifyRequest, reply: FastifyReply) {
  const token = extractToken(request);
  
  if (!token) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token required',
      },
    });
  }

  // Verify JWT token
  const decoded = request.server.jwt.verify(token) as { userId: string };
  
  // Get user from database
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      firstName: true,
      lastName: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or inactive user',
      },
    });
  }

  if (!user.emailVerified) {
    return reply.status(403).send({
      success: false,
      error: {
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email not verified',
      },
    });
  }

  // Add user to request context
  request.user = user;
  (request as any).authType = 'jwt';
}

async function authenticateWithApiKey(request: FastifyRequest, reply: FastifyReply, apiKeyString: string) {
  const apiKey = await apiKeyService.validateApiKey(apiKeyString);
  
  if (!apiKey) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key',
      },
    });
  }

  // Get user from database
  const user = await prisma.user.findUnique({
    where: { id: apiKey.userId },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      firstName: true,
      lastName: true,
      isActive: true,
    },
  });
  
  if (!user || !user.isActive) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'API key user is inactive',
      },
    });
  }
  
  // Add user and API key to request context
  request.user = user;
  (request as any).apiKey = apiKey;
  (request as any).authType = 'api_key';
}

// Permission checking middleware
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = (request as any).apiKey;
    
    // JWT users have all permissions
    if (!apiKey) {
      return;
    }
    
    // Check API key permissions
    const hasPermission = await apiKeyService.hasPermission(apiKey, permission);
    
    if (!hasPermission) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Insufficient permissions. Required: ${permission}`,
        },
      });
    }
  };
}

function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return null;
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      emailVerified: boolean;
      profile?: {
        firstName?: string;
        lastName?: string;
        avatar?: string;
      };
    };
  }
  
  interface FastifyInstance {
    authenticate: typeof authMiddleware;
  }
}