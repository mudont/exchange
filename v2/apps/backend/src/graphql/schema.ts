import { gql } from 'apollo-server-fastify';

export const typeDefs = gql`
  scalar DateTime
  scalar Decimal

  type User {
    id: ID!
    email: String!
    emailVerified: Boolean!
    firstName: String
    lastName: String
    phone: String
    dateOfBirth: DateTime
    country: String
    timezone: String
    language: String
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
    accounts: [Account!]!
    authProviders: [AuthProvider!]!
  }

  type AuthProvider {
    provider: String!
    createdAt: DateTime!
  }

  type Account {
    id: ID!
    name: String!
    type: String!
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
    balances: [Balance!]!
    positions: [Position!]!
    orders: [Order!]!
  }

  type Balance {
    id: ID!
    currency: String!
    balance: Decimal!
    availableBalance: Decimal!
    reservedBalance: Decimal!
    updatedAt: DateTime!
  }

  type Instrument {
    symbol: String!
    name: String!
    description: String
    type: InstrumentType!
    minPrice: Decimal!
    maxPrice: Decimal!
    tickSize: Decimal!
    lotSize: Decimal!
    marginRate: Decimal
    expirationDate: DateTime
    settlementPrice: Decimal
    isActive: Boolean!
    createdAt: DateTime!
    marketData: MarketData
    orderBook: OrderBook
  }

  enum InstrumentType {
    STOCK
    OPTION
    FUTURE
    FOREX
    CRYPTO
    COMMODITY
    INDEX
    BOND
  }

  type MarketData {
    symbol: String!
    lastPrice: Decimal
    bestBid: Decimal
    bestAsk: Decimal
    volume24h: Decimal!
    priceChange24h: Decimal!
    priceChangePercent24h: Decimal!
    high24h: Decimal
    low24h: Decimal
    timestamp: DateTime!
  }

  type OrderBook {
    symbol: String!
    timestamp: DateTime!
    bids: [PriceLevel!]!
    asks: [PriceLevel!]!
  }

  type PriceLevel {
    price: Decimal!
    quantity: Decimal!
    orderCount: Int!
  }

  type Order {
    id: ID!
    instrumentSymbol: String!
    accountId: ID!
    userId: ID!
    side: OrderSide!
    quantity: Decimal!
    price: Decimal!
    orderType: OrderType!
    timeInForce: TimeInForce!
    status: OrderStatus!
    filledQuantity: Decimal!
    avgFillPrice: Decimal
    displayQuantity: Decimal
    createdAt: DateTime!
    updatedAt: DateTime!
    fills: [Trade!]!
  }

  enum OrderSide {
    BUY
    SELL
  }

  enum OrderType {
    LIMIT
    MARKET
    STOP
    STOP_LIMIT
  }

  enum TimeInForce {
    GTC
    IOC
    FOK
    DAY
  }

  enum OrderStatus {
    PENDING
    WORKING
    PARTIALLY_FILLED
    FILLED
    CANCELLED
    REJECTED
    EXPIRED
  }

  type Trade {
    id: ID!
    instrumentSymbol: String!
    buyOrderId: ID!
    sellOrderId: ID!
    quantity: Decimal!
    price: Decimal!
    buyerUserId: ID!
    sellerUserId: ID!
    timestamp: DateTime!
    fees: TradeFees!
  }

  type TradeFees {
    buyerFee: Decimal!
    sellerFee: Decimal!
    currency: String!
  }

  type Position {
    id: ID!
    accountId: ID!
    instrumentSymbol: String!
    quantity: Decimal!
    avgPrice: Decimal!
    unrealizedPnL: Decimal!
    realizedPnL: Decimal!
    lastUpdated: DateTime!
    instrument: Instrument!
  }

  type PositionSummary {
    totalPositions: Int!
    totalUnrealizedPnL: Decimal!
    totalRealizedPnL: Decimal!
    totalValue: Decimal!
    positions: [Position!]!
  }

  # Input types
  input RegisterInput {
    email: String!
    password: String!
    firstName: String
    lastName: String
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input PlaceOrderInput {
    instrumentSymbol: String!
    accountId: ID!
    side: OrderSide!
    quantity: Decimal!
    price: Decimal!
    orderType: OrderType = LIMIT
    timeInForce: TimeInForce = GTC
    displayQuantity: Decimal
  }

  input ModifyOrderInput {
    quantity: Decimal
    price: Decimal
    displayQuantity: Decimal
  }

  input CreateAccountInput {
    name: String!
    type: String = "TRADING"
    initialBalance: Decimal = 0
    currency: String = "USD"
  }

  input UpdateProfileInput {
    firstName: String
    lastName: String
    phone: String
    dateOfBirth: DateTime
    country: String
    timezone: String
    language: String
  }

  # Response types
  type AuthResponse {
    success: Boolean!
    token: String
    user: User
    message: String
  }

  type OrderResponse {
    success: Boolean!
    order: Order
    trades: [Trade!]
    message: String
  }

  type CancelOrderResponse {
    success: Boolean!
    order: Order
    message: String
  }

  # Queries
  type Query {
    # User queries
    me: User
    
    # Account queries
    accounts: [Account!]!
    account(id: ID!): Account
    
    # Instrument queries
    instruments(type: InstrumentType, isActive: Boolean): [Instrument!]!
    instrument(symbol: String!): Instrument
    
    # Order queries
    orders(
      accountId: ID
      instrumentSymbol: String
      status: OrderStatus
      limit: Int = 50
      offset: Int = 0
    ): [Order!]!
    order(id: ID!): Order
    orderBook(symbol: String!): OrderBook
    
    # Position queries
    positions(
      accountId: ID
      instrumentSymbol: String
      includeZero: Boolean = false
    ): [Position!]!
    position(id: ID!): Position
    positionSummary(accountId: ID): PositionSummary!
    
    # Market data queries
    marketData(symbol: String!): MarketData
    marketSummary: [MarketData!]!
    recentTrades(symbol: String!, limit: Int = 50): [Trade!]!
    
    # Trading history
    trades(
      accountId: ID
      instrumentSymbol: String
      limit: Int = 50
      offset: Int = 0
    ): [Trade!]!
  }

  # Mutations
  type Mutation {
    # Authentication
    register(input: RegisterInput!): AuthResponse!
    login(input: LoginInput!): AuthResponse!
    
    # Account management
    createAccount(input: CreateAccountInput!): Account!
    updateProfile(input: UpdateProfileInput!): User!
    
    # Trading
    placeOrder(input: PlaceOrderInput!): OrderResponse!
    cancelOrder(id: ID!): CancelOrderResponse!
    modifyOrder(id: ID!, input: ModifyOrderInput!): OrderResponse!
    cancelAllOrders(accountId: ID, instrumentSymbol: String): Int!
    
    # Account operations
    depositFunds(accountId: ID!, amount: Decimal!, currency: String = "USD"): Balance!
    withdrawFunds(accountId: ID!, amount: Decimal!, currency: String = "USD"): Balance!
  }

  # Subscriptions
  type Subscription {
    # Order book updates
    orderBookUpdates(symbol: String!): OrderBook!
    
    # Trade updates
    tradeUpdates(symbol: String): Trade!
    
    # User-specific updates
    orderStatusUpdates: Order!
    positionUpdates: Position!
    balanceUpdates: Balance!
    
    # Market data updates
    marketDataUpdates(symbol: String): MarketData!
  }
`;