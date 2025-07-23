import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { ErrorCode, HttpStatus } from '@trading-exchange/shared';

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  logger.error('Request error:', {
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method,
    userId: request.user?.id,
  });

  // Handle validation errors (Zod)
  if (error instanceof ZodError) {
    return reply.status(HttpStatus.BAD_REQUEST).send({
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          value: err.input,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Handle Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return handlePrismaError(error, reply);
  }

  // Handle custom app errors
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Handle JWT errors
  if (error.code === 'FST_JWT_BAD_REQUEST' || error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
    return reply.status(HttpStatus.UNAUTHORIZED).send({
      success: false,
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: 'Invalid or missing authentication token',
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Handle rate limit errors
  if (error.statusCode === 429) {
    return reply.status(HttpStatus.TOO_MANY_REQUESTS).send({
      success: false,
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many requests, please try again later',
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Default error response
  const statusCode = error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
  const message = statusCode === HttpStatus.INTERNAL_SERVER_ERROR 
    ? 'Internal server error' 
    : error.message;

  return reply.status(statusCode).send({
    success: false,
    error: {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message,
    },
    timestamp: new Date().toISOString(),
  });
}

function handlePrismaError(error: Prisma.PrismaClientKnownRequestError, reply: FastifyReply) {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      return reply.status(HttpStatus.CONFLICT).send({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'A record with this value already exists',
          details: { field: error.meta?.target },
        },
        timestamp: new Date().toISOString(),
      });

    case 'P2025':
      // Record not found
      return reply.status(HttpStatus.NOT_FOUND).send({
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Record not found',
        },
        timestamp: new Date().toISOString(),
      });

    default:
      return reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        success: false,
        error: {
          code: ErrorCode.DATABASE_ERROR,
          message: 'Database operation failed',
        },
        timestamp: new Date().toISOString(),
      });
  }
}