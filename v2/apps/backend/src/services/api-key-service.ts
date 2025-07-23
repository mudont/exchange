import { randomBytes, createHash } from 'crypto';
import { prisma } from '../database';
import { AppError } from '../middleware/error';
import { ErrorCode, HttpStatus } from '@trading-exchange/shared';
import { logger } from '../utils/logger';
import { redisService } from './cache/redis-service';

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  permissions: string[];
  isActive: boolean;
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApiKeyRequest {
  name: string;
  permissions: string[];
  expiresAt?: Date;
}

export interface ApiKeyWithSecret {
  apiKey: ApiKey;
  secret: string;
}

export class ApiKeyService {
  private readonly KEY_PREFIX = 'ak_';
  private readonly SECRET_LENGTH = 32;

  async createApiKey(userId: string, request: CreateApiKeyRequest): Promise<ApiKeyWithSecret> {
    // Generate API key and secret
    const keyId = this.generateKeyId();
    const secret = this.generateSecret();
    const keyHash = this.hashSecret(secret);
    const fullKey = `${this.KEY_PREFIX}${keyId}`;

    // Validate permissions
    this.validatePermissions(request.permissions);

    // Create API key in database
    const apiKey = await prisma.apiKey.create({
      data: {
        id: keyId,
        userId,
        name: request.name,
        keyHash,
        permissions: request.permissions,
        expiresAt: request.expiresAt,
        isActive: true,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'API_KEY_CREATED',
        resource: `api_key:${keyId}`,
        details: {
          name: request.name,
          permissions: request.permissions,
        },
      },
    });

    logger.info('API key created', {
      userId,
      keyId,
      name: request.name,
      permissions: request.permissions,
    });

    return {
      apiKey,
      secret: fullKey + secret,
    };
  }

  async validateApiKey(apiKeyString: string): Promise<ApiKey | null> {
    if (!apiKeyString.startsWith(this.KEY_PREFIX)) {
      return null;
    }

    // Extract key ID and secret
    const keyWithoutPrefix = apiKeyString.substring(this.KEY_PREFIX.length);
    if (keyWithoutPrefix.length < 8 + this.SECRET_LENGTH) {
      return null;
    }

    const keyId = keyWithoutPrefix.substring(0, 8);
    const secret = keyWithoutPrefix.substring(8);

    // Check cache first
    const cacheKey = `api_key:${keyId}`;
    let apiKey = await redisService.getJSON<ApiKey>(cacheKey);

    if (!apiKey) {
      // Get from database
      apiKey = await prisma.apiKey.findUnique({
        where: { id: keyId },
      });

      if (apiKey) {
        // Cache for 5 minutes
        await redisService.setJSON(cacheKey, apiKey, 300);
      }
    }

    if (!apiKey || !apiKey.isActive) {
      return null;
    }

    // Check expiration
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return null;
    }

    // Verify secret
    const expectedHash = this.hashSecret(secret);
    if (apiKey.keyHash !== expectedHash) {
      return null;
    }

    // Update last used timestamp (async, don't wait)
    this.updateLastUsed(keyId).catch(error => {
      logger.error('Failed to update API key last used timestamp', {
        keyId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    return apiKey;
  }

  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    return await prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        name: true,
        keyHash: false, // Don't return the hash
        permissions: true,
        isActive: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }) as ApiKey[];
  }

  async updateApiKey(
    userId: string,
    keyId: string,
    updates: {
      name?: string;
      permissions?: string[];
      isActive?: boolean;
      expiresAt?: Date;
    }
  ): Promise<ApiKey> {
    // Validate permissions if provided
    if (updates.permissions) {
      this.validatePermissions(updates.permissions);
    }

    const apiKey = await prisma.apiKey.findFirst({
      where: { id: keyId, userId },
    });

    if (!apiKey) {
      throw new AppError(
        ErrorCode.API_KEY_NOT_FOUND,
        'API key not found',
        HttpStatus.NOT_FOUND
      );
    }

    const updatedApiKey = await prisma.apiKey.update({
      where: { id: keyId },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
    });

    // Clear cache
    await redisService.delete(`api_key:${keyId}`);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'API_KEY_UPDATED',
        resource: `api_key:${keyId}`,
        details: updates,
      },
    });

    logger.info('API key updated', {
      userId,
      keyId,
      updates,
    });

    return updatedApiKey;
  }

  async deleteApiKey(userId: string, keyId: string): Promise<void> {
    const apiKey = await prisma.apiKey.findFirst({
      where: { id: keyId, userId },
    });

    if (!apiKey) {
      throw new AppError(
        ErrorCode.API_KEY_NOT_FOUND,
        'API key not found',
        HttpStatus.NOT_FOUND
      );
    }

    await prisma.apiKey.delete({
      where: { id: keyId },
    });

    // Clear cache
    await redisService.delete(`api_key:${keyId}`);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'API_KEY_DELETED',
        resource: `api_key:${keyId}`,
        details: {
          name: apiKey.name,
        },
      },
    });

    logger.info('API key deleted', {
      userId,
      keyId,
      name: apiKey.name,
    });
  }

  async hasPermission(apiKey: ApiKey, permission: string): Promise<boolean> {
    return apiKey.permissions.includes(permission) || apiKey.permissions.includes('*');
  }

  private generateKeyId(): string {
    return randomBytes(4).toString('hex');
  }

  private generateSecret(): string {
    return randomBytes(this.SECRET_LENGTH).toString('hex');
  }

  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private validatePermissions(permissions: string[]): void {
    const validPermissions = [
      'read:account',
      'write:account',
      'read:orders',
      'write:orders',
      'read:positions',
      'read:trades',
      'read:market_data',
      'write:instruments', // Admin only
      '*', // Full access
    ];

    for (const permission of permissions) {
      if (!validPermissions.includes(permission)) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid permission: ${permission}`,
          HttpStatus.BAD_REQUEST
        );
      }
    }
  }

  private async updateLastUsed(keyId: string): Promise<void> {
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { lastUsedAt: new Date() },
    });

    // Clear cache to ensure fresh data on next request
    await redisService.delete(`api_key:${keyId}`);
  }

  // Cleanup expired API keys (scheduled job)
  async cleanupExpiredKeys(): Promise<number> {
    const result = await prisma.apiKey.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    logger.info('Cleaned up expired API keys', {
      deletedCount: result.count,
    });

    return result.count;
  }
}