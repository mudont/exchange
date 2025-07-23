import { Decimal } from 'decimal.js';

// Common utility types
export type UUID = string;
export type Timestamp = Date;
export type DecimalValue = Decimal;

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Error types
export interface AppError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ValidationError extends AppError {
  field: string;
  value: any;
}

// Response wrapper
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: AppError;
  timestamp: string;
}

// Event types for real-time updates
export interface BaseEvent {
  type: string;
  timestamp: string;
  data: any;
}

export interface OrderBookEvent extends BaseEvent {
  type: 'orderbook:update' | 'orderbook:snapshot';
  data: {
    symbol: string;
    bids: PriceLevel[];
    asks: PriceLevel[];
  };
}

export interface TradeEvent extends BaseEvent {
  type: 'trade:executed';
  data: {
    symbol: string;
    price: number;
    quantity: number;
    side: 'BUY' | 'SELL';
    timestamp: string;
  };
}

export interface OrderStatusEvent extends BaseEvent {
  type: 'order:status';
  data: {
    orderId: string;
    status: OrderStatus;
    filledQuantity?: number;
    avgFillPrice?: number;
  };
}

export interface PositionEvent extends BaseEvent {
  type: 'position:update';
  data: {
    accountId: string;
    positions: Position[];
  };
}

// Price level for order book
export interface PriceLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

// Enums
export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
  STOP = 'STOP',
  STOP_LIMIT = 'STOP_LIMIT',
}

export enum TimeInForce {
  GTC = 'GTC', // Good Till Cancelled
  IOC = 'IOC', // Immediate Or Cancel
  FOK = 'FOK', // Fill Or Kill
  DAY = 'DAY', // Day Order
}

export enum OrderStatus {
  PENDING = 'PENDING',
  WORKING = 'WORKING',
  FILLED = 'FILLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export enum InstrumentType {
  STOCK = 'STOCK',
  CRYPTO = 'CRYPTO',
  FOREX = 'FOREX',
  COMMODITY = 'COMMODITY',
  BETTING = 'BETTING',
}

export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
}