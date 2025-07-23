import { FastifyInstance } from 'fastify';
import { prisma } from '../../database';
import { z } from 'zod';
import { AppError } from '../../middleware/error';
import { ErrorCode, HttpStatus } from '@trading-exchange/shared';

export async function userRoutes(fastify: FastifyInstance) {
  // Get current user profile
  fastify.get('/profile', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user!.id;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        firstName: true,
        lastName: true,
        phone: true,
        dateOfBirth: true,
        country: true,
        timezone: true,
        language: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        authProviders: {
          select: {
            provider: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError(
        ErrorCode.USER_NOT_FOUND,
        'User not found',
        HttpStatus.NOT_FOUND
      );
    }
    
    return reply.send({
      success: true,
      data: user,
      timestamp: new Date().toISOString(),
    });
  });

  // Update user profile
  fastify.put('/profile', {
    preHandler: [fastify.authenticate],
    schema: {
      body: z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional(),
        dateOfBirth: z.string().optional().transform(val => val ? new Date(val) : undefined),
        country: z.string().optional(),
        timezone: z.string().optional(),
        language: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const updateData = request.body;
    
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        firstName: true,
        lastName: true,
        phone: true,
        dateOfBirth: true,
        country: true,
        timezone: true,
        language: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    return reply.send({
      success: true,
      data: updatedUser,
      timestamp: new Date().toISOString(),
    });
  });

  // Change password
  fastify.post('/change-password', {
    preHandler: [fastify.authenticate],
    schema: {
      body: z.object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: z.string().min(8, 'New password must be at least 8 characters'),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const { currentPassword, newPassword } = request.body;
    
    // Get user with password hash
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user || !user.passwordHash) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Cannot change password for OAuth-only accounts',
        HttpStatus.BAD_REQUEST
      );
    }

    // Verify current password
    const bcrypt = require('bcrypt');
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    
    if (!isValidPassword) {
      throw new AppError(
        ErrorCode.INVALID_CREDENTIALS,
        'Current password is incorrect',
        HttpStatus.BAD_REQUEST
      );
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'PASSWORD_CHANGED',
        resource: `user:${userId}`,
        details: {},
      },
    });
    
    return reply.send({
      success: true,
      data: { message: 'Password changed successfully' },
      timestamp: new Date().toISOString(),
    });
  });

  // Get user preferences
  fastify.get('/preferences', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user!.id;
    
    const preferences = await prisma.userPreference.findMany({
      where: { userId },
    });

    const preferencesMap = preferences.reduce((acc, pref) => {
      acc[pref.key] = pref.value;
      return acc;
    }, {} as Record<string, any>);
    
    return reply.send({
      success: true,
      data: preferencesMap,
      timestamp: new Date().toISOString(),
    });
  });

  // Update user preferences
  fastify.put('/preferences', {
    preHandler: [fastify.authenticate],
    schema: {
      body: z.record(z.any()),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const preferences = request.body;
    
    // Update preferences in transaction
    await prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(preferences)) {
        await tx.userPreference.upsert({
          where: {
            userId_key: { userId, key },
          },
          update: {
            value,
            updatedAt: new Date(),
          },
          create: {
            userId,
            key,
            value,
          },
        });
      }
    });
    
    return reply.send({
      success: true,
      data: { message: 'Preferences updated successfully' },
      timestamp: new Date().toISOString(),
    });
  });

  // Get user activity log
  fastify.get('/activity', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: z.object({
        limit: z.string().transform(Number).optional(),
        offset: z.string().transform(Number).optional(),
        action: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const query = request.query as any;
    
    const where: any = { userId };
    if (query.action) where.action = query.action;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }
    
    const activities = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit || 50,
      skip: query.offset || 0,
      select: {
        id: true,
        action: true,
        resource: true,
        details: true,
        createdAt: true,
      },
    });
    
    return reply.send({
      success: true,
      data: activities,
      timestamp: new Date().toISOString(),
    });
  });

  // Delete user account
  fastify.delete('/account', {
    preHandler: [fastify.authenticate],
    schema: {
      body: z.object({
        password: z.string().optional(),
        confirmation: z.literal('DELETE_MY_ACCOUNT'),
      }),
    },
  }, async (request, reply) => {
    const userId = request.user!.id;
    const { password, confirmation } = request.body;
    
    if (confirmation !== 'DELETE_MY_ACCOUNT') {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Account deletion confirmation required',
        HttpStatus.BAD_REQUEST
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      throw new AppError(
        ErrorCode.USER_NOT_FOUND,
        'User not found',
        HttpStatus.NOT_FOUND
      );
    }

    // Verify password if user has one
    if (user.passwordHash && password) {
      const bcrypt = require('bcrypt');
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      
      if (!isValidPassword) {
        throw new AppError(
          ErrorCode.INVALID_CREDENTIALS,
          'Password is incorrect',
          HttpStatus.BAD_REQUEST
        );
      }
    }

    // Check for open positions or orders
    const openPositions = await prisma.position.count({
      where: {
        account: { userId },
        quantity: { not: 0 },
      },
    });

    const openOrders = await prisma.order.count({
      where: {
        userId,
        status: { in: ['WORKING', 'PARTIALLY_FILLED'] },
      },
    });

    if (openPositions > 0 || openOrders > 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Cannot delete account with open positions or orders',
        HttpStatus.BAD_REQUEST
      );
    }

    // Soft delete user account
    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        email: `deleted_${userId}@deleted.com`,
        passwordHash: null,
        updatedAt: new Date(),
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'ACCOUNT_DELETED',
        resource: `user:${userId}`,
        details: {},
      },
    });
    
    return reply.send({
      success: true,
      data: { message: 'Account deleted successfully' },
      timestamp: new Date().toISOString(),
    });
  });

  // Get user statistics
  fastify.get('/stats', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user!.id;
    
    // Get various statistics
    const [accountCount, orderCount, tradeCount, positionCount] = await Promise.all([
      prisma.account.count({ where: { userId } }),
      prisma.order.count({ where: { userId } }),
      prisma.trade.count({ where: { OR: [{ buyerUserId: userId }, { sellerUserId: userId }] } }),
      prisma.position.count({ where: { account: { userId } } }),
    ]);

    const stats = {
      accountCount,
      orderCount,
      tradeCount,
      positionCount,
      memberSince: (await prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      }))?.createdAt,
    };
    
    return reply.send({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  });
}