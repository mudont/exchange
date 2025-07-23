import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { prisma } from '../../database';
import { logger } from '../../utils/logger';
import { PubSub } from 'graphql-subscriptions';

export const pubsub = new PubSub();

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: any;
}

export class WebSocketServer {
  private io: SocketIOServer;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> socketIds
  private socketUsers: Map<string, string> = new Map(); // socketId -> userId
  private subscriptions: Map<string, Set<string>> = new Map(); // symbol -> socketIds

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.frontendUrl,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket: any, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, config.jwtSecret) as any;
        
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
          return next(new Error('Invalid or inactive user'));
        }

        socket.userId = user.id;
        socket.user = user;
        next();
      } catch (error) {
        logger.error('WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      const userId = socket.userId!;
      
      logger.info('WebSocket client connected', { 
        socketId: socket.id, 
        userId,
        userEmail: socket.user?.email 
      });

      // Track user connections
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(socket.id);
      this.socketUsers.set(socket.id, userId);

      // Join user-specific room
      socket.join(`user:${userId}`);

      // Handle symbol subscriptions
      socket.on('subscribe:symbol', (symbol: string) => {
        this.subscribeToSymbol(socket, symbol);
      });

      socket.on('unsubscribe:symbol', (symbol: string) => {
        this.unsubscribeFromSymbol(socket, symbol);
      });

      socket.on('subscribe:orderbook', (symbol: string) => {
        this.subscribeToOrderBook(socket, symbol);
      });

      socket.on('unsubscribe:orderbook', (symbol: string) => {
        this.unsubscribeFromOrderBook(socket, symbol);
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info('WebSocket client disconnected', { 
          socketId: socket.id, 
          userId, 
          reason 
        });

        this.handleDisconnection(socket);
      });

      // Send initial connection confirmation
      socket.emit('connected', {
        message: 'Connected to trading platform',
        userId,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private subscribeToSymbol(socket: AuthenticatedSocket, symbol: string) {
    socket.join(`symbol:${symbol}`);
    
    if (!this.subscriptions.has(symbol)) {
      this.subscriptions.set(symbol, new Set());
    }
    this.subscriptions.get(symbol)!.add(socket.id);

    logger.debug('Client subscribed to symbol', { 
      socketId: socket.id, 
      userId: socket.userId, 
      symbol 
    });

    // Send current ticker data
    this.sendCurrentTicker(socket, symbol);
  }

  private unsubscribeFromSymbol(socket: AuthenticatedSocket, symbol: string) {
    socket.leave(`symbol:${symbol}`);
    
    const subscribers = this.subscriptions.get(symbol);
    if (subscribers) {
      subscribers.delete(socket.id);
      if (subscribers.size === 0) {
        this.subscriptions.delete(symbol);
      }
    }

    logger.debug('Client unsubscribed from symbol', { 
      socketId: socket.id, 
      userId: socket.userId, 
      symbol 
    });
  }

  private subscribeToOrderBook(socket: AuthenticatedSocket, symbol: string) {
    socket.join(`orderbook:${symbol}`);
    
    logger.debug('Client subscribed to order book', { 
      socketId: socket.id, 
      userId: socket.userId, 
      symbol 
    });

    // Send current order book snapshot
    this.sendOrderBookSnapshot(socket, symbol);
  }

  private unsubscribeFromOrderBook(socket: AuthenticatedSocket, symbol: string) {
    socket.leave(`orderbook:${symbol}`);
    
    logger.debug('Client unsubscribed from order book', { 
      socketId: socket.id, 
      userId: socket.userId, 
      symbol 
    });
  }

  private handleDisconnection(socket: AuthenticatedSocket) {
    const userId = socket.userId!;
    
    // Remove from user tracking
    const userSocketSet = this.userSockets.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socket.id);
      if (userSocketSet.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.socketUsers.delete(socket.id);

    // Remove from all subscriptions
    for (const [symbol, subscribers] of this.subscriptions.entries()) {
      subscribers.delete(socket.id);
      if (subscribers.size === 0) {
        this.subscriptions.delete(symbol);
      }
    }
  }

  // Public methods for broadcasting updates
  public broadcastTickerUpdate(symbol: string, ticker: any) {
    this.io.to(`symbol:${symbol}`).emit('ticker:update', ticker);
    
    // Also publish to GraphQL subscriptions
    pubsub.publish('MARKET_DATA_UPDATE', {
      marketDataUpdates: ticker,
    });
  }

  public broadcastOrderBookUpdate(symbol: string, orderBook: any) {
    this.io.to(`orderbook:${symbol}`).emit('orderbook:update', orderBook);
    
    // Also publish to GraphQL subscriptions
    pubsub.publish('ORDER_BOOK_UPDATE', {
      orderBookUpdates: orderBook,
    });
  }

  public broadcastTradeExecution(trade: any) {
    // Broadcast to symbol subscribers
    this.io.to(`symbol:${trade.instrumentSymbol}`).emit('trade:executed', trade);
    
    // Notify specific users involved in the trade
    this.notifyUser(trade.buyerUserId, 'trade:executed', trade);
    this.notifyUser(trade.sellerUserId, 'trade:executed', trade);
    
    // Also publish to GraphQL subscriptions
    pubsub.publish('TRADE_EXECUTED', {
      tradeUpdates: trade,
    });
  }

  public notifyOrderStatusChange(userId: string, order: any) {
    this.notifyUser(userId, 'order:status', order);
    
    // Also publish to GraphQL subscriptions
    pubsub.publish('ORDER_STATUS_UPDATE', {
      orderStatusUpdates: order,
      userId,
    });
  }

  public notifyPositionUpdate(userId: string, position: any) {
    this.notifyUser(userId, 'position:update', position);
    
    // Also publish to GraphQL subscriptions
    pubsub.publish('POSITION_UPDATE', {
      positionUpdates: position,
      userId,
    });
  }

  public notifyBalanceUpdate(userId: string, balance: any) {
    this.notifyUser(userId, 'balance:update', balance);
    
    // Also publish to GraphQL subscriptions
    pubsub.publish('BALANCE_UPDATE', {
      balanceUpdates: balance,
      userId,
    });
  }

  private notifyUser(userId: string, event: string, data: any) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  private async sendCurrentTicker(socket: AuthenticatedSocket, symbol: string) {
    try {
      // This would typically fetch from your market data service
      // For now, we'll send a placeholder
      const ticker = {
        symbol,
        lastPrice: 100.00,
        priceChange24h: 2.50,
        priceChangePercent24h: 2.56,
        volume24h: 1000000,
        high24h: 105.00,
        low24h: 95.00,
        bestBid: 99.50,
        bestAsk: 100.50,
        timestamp: new Date().toISOString(),
      };
      
      socket.emit('ticker:snapshot', ticker);
    } catch (error) {
      logger.error('Error sending ticker snapshot', { error, symbol });
    }
  }

  private async sendOrderBookSnapshot(socket: AuthenticatedSocket, symbol: string) {
    try {
      // This would typically fetch from your order book service
      // For now, we'll send a placeholder
      const orderBook = {
        symbol,
        timestamp: new Date().toISOString(),
        bids: [
          { price: 99.50, quantity: 100, orderCount: 5 },
          { price: 99.00, quantity: 200, orderCount: 3 },
        ],
        asks: [
          { price: 100.50, quantity: 150, orderCount: 4 },
          { price: 101.00, quantity: 300, orderCount: 6 },
        ],
      };
      
      socket.emit('orderbook:snapshot', orderBook);
    } catch (error) {
      logger.error('Error sending order book snapshot', { error, symbol });
    }
  }

  // Utility methods
  public getConnectedUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }

  public getUserConnectionCount(userId: string): number {
    return this.userSockets.get(userId)?.size || 0;
  }

  public getSubscriberCount(symbol: string): number {
    return this.subscriptions.get(symbol)?.size || 0;
  }

  public getTotalConnections(): number {
    return this.io.sockets.sockets.size;
  }
}

// Singleton instance
let webSocketServer: WebSocketServer | null = null;

export function initializeWebSocketServer(httpServer: HttpServer): WebSocketServer {
  if (!webSocketServer) {
    webSocketServer = new WebSocketServer(httpServer);
    logger.info('WebSocket server initialized');
  }
  return webSocketServer;
}

export function getWebSocketServer(): WebSocketServer | null {
  return webSocketServer;
}