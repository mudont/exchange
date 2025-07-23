import { Decimal } from 'decimal.js';
import {
  UUID,
  OrderSide,
  OrderType,
  TimeInForce,
  OrderStatus,
  InstrumentType,
  PriceLevel,
} from './common';

// Instrument types
export interface Instrument {
  symbol: string;
  name: string;
  description?: string;
  type: InstrumentType;
  minPrice: Decimal;
  maxPrice: Decimal;
  tickSize: Decimal;
  lotSize: Decimal;
  marginRate: Decimal;
  expirationDate?: Date;
  settlementPrice?: Decimal;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInstrumentRequest {
  symbol: string;
  name: string;
  description?: string;
  type: InstrumentType;
  minPrice: number;
  maxPrice: number;
  tickSize: number;
  lotSize: number;
  marginRate?: number;
  expirationDate?: Date;
}

// Account types
export interface Account {
  id: UUID;
  userId: UUID;
  name: string;
  type: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  balances: Balance[];
  positions: Position[];
}

export interface Balance {
  id: UUID;
  accountId: UUID;
  currency: string;
  balance: Decimal;
  availableBalance: Decimal;
  reservedBalance: Decimal;
  updatedAt: Date;
}

// Order types
export interface Order {
  id: UUID;
  instrumentSymbol: string;
  accountId: UUID;
  userId: UUID;
  side: OrderSide;
  quantity: Decimal;
  price: Decimal;
  orderType: OrderType;
  timeInForce: TimeInForce;
  status: OrderStatus;
  filledQuantity: Decimal;
  avgFillPrice?: Decimal;
  parentOrderId?: UUID;
  displayQuantity?: Decimal;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaceOrderRequest {
  instrumentSymbol: string;
  accountId: UUID;
  side: OrderSide;
  quantity: number;
  price: number;
  orderType: OrderType;
  timeInForce?: TimeInForce;
  displayQuantity?: number;
}

export interface ModifyOrderRequest {
  orderId: UUID;
  quantity?: number;
  price?: number;
}

export interface CancelOrderRequest {
  orderId: UUID;
}

// Trade types
export interface Trade {
  id: UUID;
  instrumentSymbol: string;
  buyOrderId: UUID;
  sellOrderId: UUID;
  quantity: Decimal;
  price: Decimal;
  buyerUserId: UUID;
  sellerUserId: UUID;
  timestamp: Date;
  fees?: TradeFees;
}

export interface TradeFees {
  buyerFee: Decimal;
  sellerFee: Decimal;
  currency: string;
}

// Position types
export interface Position {
  id: UUID;
  accountId: UUID;
  instrumentSymbol: string;
  quantity: Decimal;
  avgPrice: Decimal;
  unrealizedPnL: Decimal;
  realizedPnL: Decimal;
  lastUpdated: Date;
}

// Order book types
export interface OrderBook {
  symbol: string;
  bids: PriceLevel[];
  asks: PriceLevel[];
  lastUpdated: Date;
}

export interface OrderBookSnapshot extends OrderBook {
  sequence: number;
}

export interface OrderBookDelta {
  symbol: string;
  sequence: number;
  changes: OrderBookChange[];
  timestamp: Date;
}

export interface OrderBookChange {
  side: OrderSide;
  price: number;
  quantity: number; // 0 means remove level
}

// Market data types
export interface MarketData {
  symbol: string;
  lastPrice?: number;
  bestBid?: number;
  bestAsk?: number;
  volume24h: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  high24h?: number;
  low24h?: number;
  timestamp: Date;
}

export interface Ticker {
  symbol: string;
  price: number;
  timestamp: Date;
}

// Risk management types
export interface RiskLimits {
  maxOrderSize: Decimal;
  maxPositionSize: Decimal;
  maxDailyLoss: Decimal;
  marginRequirement: Decimal;
}

export interface RiskCheck {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

// Trading statistics
export interface TradingStats {
  totalTrades: number;
  totalVolume: Decimal;
  totalPnL: Decimal;
  winRate: number;
  avgWin: Decimal;
  avgLoss: Decimal;
  maxDrawdown: Decimal;
  sharpeRatio: number;
}