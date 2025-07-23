# Design Document - Trading Exchange Platform v2

## Overview

This document outlines the technical design for a modern TypeScript-based trading exchange platform. The system is designed as a microservices architecture with event-driven communication, supporting multiple authentication providers, real-time trading, and horizontal scalability.

## Architecture

### System Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   API Gateway   │    │   Web Frontend  │
│     (Nginx)     │────│   (Fastify)     │────│   (Next.js)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │  Auth Service   │ │ Trading Engine  │ │ Market Data     │
    │  (Passport.js)  │ │ (Order Match)   │ │ (WebSocket)     │
    └─────────────────┘ └─────────────────┘ └─────────────────┘
                │               │               │
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │   User Service  │ │  Order Service  │ │Position Service │
    │ (Profile/KYC)   │ │ (CRUD/Validate) │ │ (P&L/Risk)      │
    └─────────────────┘ └─────────────────┘ └─────────────────┘
                │               │               │
                └───────────────┼───────────────┘
                                │
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │   PostgreSQL    │ │      Redis      │ │   Message Queue │
    │   (Primary DB)  │ │   (Cache/Pub)   │ │   (Bull/Redis)  │
    └─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Microservices Design

#### 1. Authentication Service
**Responsibilities:**
- Multi-provider authentication (Google, Facebook, Local)
- JWT token generation and validation
- Email verification workflows
- Password reset functionality
- Session management

**Technology Stack:**
- Passport.js for OAuth strategies
- Nodemailer for email verification
- bcrypt for password hashing
- jsonwebtoken for JWT handling

#### 2. Trading Engine Service
**Responsibilities:**
- Order matching algorithm
- Order book management
- Trade execution
- Risk management checks
- Market data generation

**Key Components:**
```typescript
class TradingEngine {
  private orderBooks: Map<string, OrderBook>;
  private matchingQueue: Queue;
  private eventEmitter: EventEmitter;
  
  async processOrder(order: Order): Promise<MatchResult>;
  async cancelOrder(orderId: string): Promise<boolean>;
  getOrderBook(symbol: string): OrderBookSnapshot;
}

class OrderBook {
  private bids: SortedMap<number, PriceLevel>;
  private asks: SortedMap<number, PriceLevel>;
  
  match(order: Order): MatchResult;
  addOrder(order: Order): void;
  removeOrder(orderId: string): boolean;
}
```

#### 3. Market Data Service
**Responsibilities:**
- Real-time data distribution
- WebSocket connection management
- Order book broadcasting
- Trade feed distribution
- Client subscription management

#### 4. User Service
**Responsibilities:**
- User profile management
- Account creation and verification
- KYC/compliance data
- User preferences and settings

#### 5. Order Service
**Responsibilities:**
- Order CRUD operations
- Order validation
- Order history and reporting
- Order status tracking

#### 6. Position Service
**Responsibilities:**
- Position calculation and tracking
- P&L computation
- Risk management
- Balance management

## Components and Interfaces

### Authentication System Design

#### Multi-Provider Authentication Flow

```typescript
interface AuthProvider {
  name: 'google' | 'facebook' | 'local';
  authenticate(credentials: any): Promise<AuthResult>;
  getProfile(token: string): Promise<UserProfile>;
}

class GoogleAuthProvider implements AuthProvider {
  async authenticate(code: string): Promise<AuthResult> {
    // OAuth2 flow with Google
    const tokens = await this.exchangeCodeForTokens(code);
    const profile = await this.getGoogleProfile(tokens.access_token);
    return { success: true, profile, tokens };
  }
}

class LocalAuthProvider implements AuthProvider {
  async authenticate(credentials: LoginCredentials): Promise<AuthResult> {
    const user = await this.validateCredentials(credentials);
    if (!user.emailVerified) {
      throw new Error('Email not verified');
    }
    return { success: true, user };
  }
}
```

#### Email Verification System

```typescript
class EmailVerificationService {
  async sendVerificationEmail(user: User): Promise<void> {
    const token = this.generateVerificationToken(user.id);
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    
    await this.emailService.send({
      to: user.email,
      subject: 'Verify your email address',
      template: 'email-verification',
      data: { verificationUrl, user }
    });
  }
  
  async verifyEmail(token: string): Promise<boolean> {
    const payload = this.validateToken(token);
    await this.userService.markEmailAsVerified(payload.userId);
    return true;
  }
}
```

### Trading Engine Design

#### Order Matching Algorithm

```typescript
class PriceTimePriorityMatcher {
  match(incomingOrder: Order, orderBook: OrderBook): MatchResult {
    const trades: Trade[] = [];
    const oppositeBook = incomingOrder.side === 'BUY' ? orderBook.asks : orderBook.bids;
    
    for (const priceLevel of oppositeBook.levels) {
      if (!this.canMatch(incomingOrder, priceLevel)) break;
      
      for (const restingOrder of priceLevel.orders) {
        const matchQuantity = Math.min(
          incomingOrder.remainingQuantity,
          restingOrder.remainingQuantity
        );
        
        const trade = this.createTrade(incomingOrder, restingOrder, matchQuantity);
        trades.push(trade);
        
        this.updateOrderQuantities(incomingOrder, restingOrder, matchQuantity);
        
        if (incomingOrder.remainingQuantity === 0) break;
      }
      
      if (incomingOrder.remainingQuantity === 0) break;
    }
    
    return { trades, updatedOrders: [incomingOrder] };
  }
}
```

#### Risk Management System

```typescript
class RiskManager {
  async validateOrder(order: Order, account: Account): Promise<ValidationResult> {
    const checks = [
      this.checkInstrumentLimits(order),
      this.checkAccountBalance(order, account),
      this.checkPositionLimits(order, account),
      this.checkDailyLimits(order, account)
    ];
    
    const results = await Promise.all(checks);
    const failures = results.filter(r => !r.passed);
    
    return {
      passed: failures.length === 0,
      errors: failures.map(f => f.error)
    };
  }
}
```

### Real-time Data Distribution

#### WebSocket Event System

```typescript
interface MarketDataEvents {
  'orderbook:snapshot': OrderBookSnapshot;
  'orderbook:update': OrderBookDelta;
  'trade:executed': TradeEvent;
  'order:status': OrderStatusEvent;
  'position:update': PositionEvent;
}

class MarketDataBroadcaster {
  private io: SocketIOServer;
  private subscriptions: Map<string, Set<string>>; // symbol -> socketIds
  
  async broadcastOrderBookUpdate(symbol: string, update: OrderBookDelta) {
    const subscribers = this.subscriptions.get(symbol) || new Set();
    
    for (const socketId of subscribers) {
      this.io.to(socketId).emit('orderbook:update', {
        symbol,
        timestamp: Date.now(),
        ...update
      });
    }
  }
  
  async subscribeToSymbol(socketId: string, symbol: string) {
    if (!this.subscriptions.has(symbol)) {
      this.subscriptions.set(symbol, new Set());
    }
    this.subscriptions.get(symbol)!.add(socketId);
    
    // Send current snapshot
    const snapshot = await this.getOrderBookSnapshot(symbol);
    this.io.to(socketId).emit('orderbook:snapshot', snapshot);
  }
}
```

## Data Models

### Core Entity Relationships

```typescript
// User and Authentication
interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  passwordHash?: string; // Only for local auth
  providers: AuthProvider[];
  profile: UserProfile;
  accounts: Account[];
  createdAt: Date;
  updatedAt: Date;
}

interface AuthProvider {
  id: string;
  userId: string;
  provider: 'google' | 'facebook';
  providerId: string;
  accessToken?: string;
  refreshToken?: string;
  profile: any;
}

// Trading Entities
interface Instrument {
  symbol: string;
  name: string;
  description: string;
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
}

interface Order {
  id: string;
  instrumentSymbol: string;
  accountId: string;
  userId: string;
  side: 'BUY' | 'SELL';
  quantity: Decimal;
  price: Decimal;
  orderType: 'LIMIT' | 'MARKET' | 'STOP' | 'STOP_LIMIT';
  timeInForce: 'GTC' | 'IOC' | 'FOK' | 'DAY';
  status: OrderStatus;
  filledQuantity: Decimal;
  avgFillPrice?: Decimal;
  parentOrderId?: string; // For iceberg orders
  displayQuantity?: Decimal; // For iceberg orders
  createdAt: Date;
  updatedAt: Date;
}

interface Trade {
  id: string;
  instrumentSymbol: string;
  buyOrderId: string;
  sellOrderId: string;
  quantity: Decimal;
  price: Decimal;
  buyerUserId: string;
  sellerUserId: string;
  timestamp: Date;
  fees: TradeFees;
}

interface Position {
  id: string;
  accountId: string;
  instrumentSymbol: string;
  quantity: Decimal; // Positive for long, negative for short
  avgPrice: Decimal;
  unrealizedPnL: Decimal;
  realizedPnL: Decimal;
  lastUpdated: Date;
}
```

### Database Schema Design

```sql
-- Users and Authentication
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  password_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE auth_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  profile JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider, provider_id)
);

-- Trading Tables
CREATE TABLE instruments (
  symbol VARCHAR(20) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL,
  min_price DECIMAL(18,8) NOT NULL,
  max_price DECIMAL(18,8) NOT NULL,
  tick_size DECIMAL(18,8) NOT NULL,
  lot_size DECIMAL(18,8) NOT NULL,
  margin_rate DECIMAL(5,4) DEFAULT 0.1,
  expiration_date TIMESTAMP,
  settlement_price DECIMAL(18,8),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_symbol VARCHAR(20) REFERENCES instruments(symbol),
  account_id UUID NOT NULL,
  user_id UUID REFERENCES users(id),
  side VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity DECIMAL(18,8) NOT NULL,
  price DECIMAL(18,8) NOT NULL,
  order_type VARCHAR(20) NOT NULL,
  time_in_force VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL,
  filled_quantity DECIMAL(18,8) DEFAULT 0,
  avg_fill_price DECIMAL(18,8),
  display_quantity DECIMAL(18,8),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_orders_symbol_status_price ON orders(instrument_symbol, status, price) 
  WHERE status = 'WORKING';
CREATE INDEX idx_orders_user_status ON orders(user_id, status, created_at DESC);
CREATE INDEX idx_trades_symbol_timestamp ON trades(instrument_symbol, created_at DESC);
```

## Error Handling

### Centralized Error Management

```typescript
class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code: string,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ErrorHandler {
  handleError(error: Error, req?: Request, res?: Response): void {
    if (error instanceof AppError && error.isOperational) {
      this.handleOperationalError(error, res);
    } else {
      this.handleProgrammerError(error, req, res);
    }
  }
  
  private handleOperationalError(error: AppError, res?: Response): void {
    res?.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message
      }
    });
  }
}
```

## Testing Strategy

### Test Architecture

```typescript
// Unit Tests
describe('OrderBook', () => {
  let orderBook: OrderBook;
  
  beforeEach(() => {
    orderBook = new OrderBook('TEST');
  });
  
  test('should add buy order to bids', () => {
    const order = createMockOrder({ side: 'BUY', price: 100, quantity: 10 });
    orderBook.addOrder(order);
    
    expect(orderBook.getBestBid()).toBe(100);
    expect(orderBook.getBidQuantity(100)).toBe(10);
  });
});

// Integration Tests
describe('Trading API', () => {
  test('should place and match orders end-to-end', async () => {
    const sellOrder = await placeOrder({
      symbol: 'TEST',
      side: 'SELL',
      quantity: 100,
      price: 50
    });
    
    const buyOrder = await placeOrder({
      symbol: 'TEST',
      side: 'BUY',
      quantity: 50,
      price: 50
    });
    
    const trades = await getTrades('TEST');
    expect(trades).toHaveLength(1);
    expect(trades[0].quantity).toBe(50);
  });
});
```

### Performance Testing

```typescript
// Load Testing with Artillery
describe('Performance Tests', () => {
  test('should handle 1000 concurrent order placements', async () => {
    const promises = Array.from({ length: 1000 }, (_, i) => 
      placeOrder({
        symbol: 'TEST',
        side: i % 2 === 0 ? 'BUY' : 'SELL',
        quantity: 10,
        price: 50 + (i % 10)
      })
    );
    
    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    
    expect(successful).toBeGreaterThan(950); // 95% success rate
  });
});
```

This design provides a comprehensive foundation for building a secure, scalable, and performant trading exchange platform with modern authentication capabilities and real-time trading functionality.