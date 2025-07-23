import { z } from 'zod';
import { OrderSide, OrderType, TimeInForce, InstrumentType } from './common';

// Validation schemas using Zod
export const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
});

export const PlaceOrderSchema = z.object({
  instrumentSymbol: z.string().min(1, 'Instrument symbol is required'),
  accountId: z.string().uuid('Invalid account ID'),
  side: z.nativeEnum(OrderSide),
  quantity: z.number().positive('Quantity must be positive'),
  price: z.number().positive('Price must be positive'),
  orderType: z.nativeEnum(OrderType),
  timeInForce: z.nativeEnum(TimeInForce).optional(),
  displayQuantity: z.number().positive().optional(),
});

export const ModifyOrderSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  quantity: z.number().positive('Quantity must be positive').optional(),
  price: z.number().positive('Price must be positive').optional(),
});

export const CancelOrderSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
});

export const CreateInstrumentSchema = z.object({
  symbol: z
    .string()
    .min(1, 'Symbol is required')
    .max(20, 'Symbol must be 20 characters or less')
    .regex(/^[A-Z0-9_-]+$/, 'Symbol must contain only uppercase letters, numbers, underscores, and hyphens'),
  name: z.string().min(1, 'Name is required').max(255, 'Name must be 255 characters or less'),
  description: z.string().max(1000, 'Description must be 1000 characters or less').optional(),
  type: z.nativeEnum(InstrumentType),
  minPrice: z.number().positive('Minimum price must be positive'),
  maxPrice: z.number().positive('Maximum price must be positive'),
  tickSize: z.number().positive('Tick size must be positive'),
  lotSize: z.number().positive('Lot size must be positive'),
  marginRate: z.number().min(0).max(1, 'Margin rate must be between 0 and 1').optional(),
  expirationDate: z.date().optional(),
});

export const PaginationSchema = z.object({
  page: z.number().int().min(1, 'Page must be at least 1').optional(),
  limit: z.number().int().min(1).max(100, 'Limit must be between 1 and 100').optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const VerifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
});

// Type inference from schemas
export type LoginRequest = z.infer<typeof LoginSchema>;
export type RegisterRequest = z.infer<typeof RegisterSchema>;
export type PlaceOrderRequest = z.infer<typeof PlaceOrderSchema>;
export type ModifyOrderRequest = z.infer<typeof ModifyOrderSchema>;
export type CancelOrderRequest = z.infer<typeof CancelOrderSchema>;
export type CreateInstrumentRequest = z.infer<typeof CreateInstrumentSchema>;
export type PaginationParams = z.infer<typeof PaginationSchema>;
export type VerifyEmailRequest = z.infer<typeof VerifyEmailSchema>;
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordSchema>;

// API Error codes
export enum ErrorCode {
  // Authentication errors
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Trading errors
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INVALID_ORDER = 'INVALID_ORDER',
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  INSTRUMENT_NOT_FOUND = 'INSTRUMENT_NOT_FOUND',
  INSTRUMENT_INACTIVE = 'INSTRUMENT_INACTIVE',
  MARKET_CLOSED = 'MARKET_CLOSED',
  POSITION_LIMIT_EXCEEDED = 'POSITION_LIMIT_EXCEEDED',
  RISK_LIMIT_EXCEEDED = 'RISK_LIMIT_EXCEEDED',

  // System errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
}

// HTTP Status codes
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}