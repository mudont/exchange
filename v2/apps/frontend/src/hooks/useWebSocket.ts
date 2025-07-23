import { useEffect, useRef, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { io, Socket } from 'socket.io-client';
import { RootState } from '@/store';
import { tradingSlice } from '@/store/slices/tradingSlice';
import { marketDataSlice } from '@/store/slices/marketDataSlice';
import { portfolioSlice } from '@/store/slices/portfolioSlice';
import { notificationService } from '@/services/notificationService';

interface UseWebSocketOptions {
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { 
    autoConnect = true, 
    reconnectAttempts = 5, 
    reconnectDelay = 1000 
  } = options;
  
  const dispatch = useDispatch();
  const { token, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const subscriptionsRef = useRef<Set<string>>(new Set());
  const orderBookSubscriptionsRef = useRef<Set<string>>(new Set());

  const connect = useCallback(() => {
    if (!isAuthenticated || !token) {
      return;
    }

    // Create socket connection
    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000', {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true,
    });

    socketRef.current = socket;

    // Connection event handlers
    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      setReconnectCount(0);
      console.log('WebSocket connected');
      
      // Resubscribe to previous subscriptions
      subscriptionsRef.current.forEach(symbol => {
        socket.emit('subscribe:symbol', symbol);
      });
      orderBookSubscriptionsRef.current.forEach(symbol => {
        socket.emit('subscribe:orderbook', symbol);
      });
    });

    socket.on('connected', (data) => {
      console.log('WebSocket connection confirmed:', data);
      toast.success('Connected to real-time data feed');
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      console.log('WebSocket disconnected:', reason);
      
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect
        setTimeout(() => {
          if (reconnectCount < reconnectAttempts) {
            setReconnectCount(prev => prev + 1);
            connect();
          }
        }, reconnectDelay * Math.pow(2, reconnectCount)); // Exponential backoff
      }
    });

    socket.on('connect_error', (err) => {
      setError(err.message);
      setIsConnected(false);
      console.error('WebSocket connection error:', err);
      
      if (reconnectCount < reconnectAttempts) {
        setTimeout(() => {
          setReconnectCount(prev => prev + 1);
          connect();
        }, reconnectDelay * Math.pow(2, reconnectCount));
      } else {
        toast.error('Failed to connect to real-time data feed');
      }
    });

    // Trading event handlers
    socket.on('order:status', (order) => {
      dispatch(tradingSlice.actions.updateOrder(order));
      toast.success(`Order ${order.status.toLowerCase()}`);
    });

    socket.on('position:update', (position) => {
      dispatch(tradingSlice.actions.updatePosition(position));
    });

    socket.on('trade:executed', (trade) => {
      dispatch(tradingSlice.actions.addTrade(trade));
      toast.success(`Trade executed: ${trade.quantity} @ $${trade.price}`);
    });

    // Market data event handlers
    socket.on('ticker:update', (ticker) => {
      dispatch(marketDataSlice.actions.updateTicker(ticker));
    });

    socket.on('ticker:snapshot', (ticker) => {
      dispatch(marketDataSlice.actions.updateTicker(ticker));
    });

    socket.on('orderbook:update', (orderBook) => {
      dispatch(marketDataSlice.actions.updateOrderBook(orderBook));
    });

    socket.on('orderbook:snapshot', (orderBook) => {
      dispatch(marketDataSlice.actions.updateOrderBook(orderBook));
    });

    // Portfolio event handlers
    socket.on('balance:update', (balance) => {
      dispatch(portfolioSlice.actions.updateBalance(balance));
      toast.success('Balance updated');
    });

    // Error handlers
    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      toast.error(`WebSocket error: ${error.message}`);
    });

  }, [isAuthenticated, token, reconnectCount, reconnectAttempts, reconnectDelay, dispatch]);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      subscriptionsRef.current.clear();
      orderBookSubscriptionsRef.current.clear();
    };
  }, [autoConnect, connect]);

  const subscribeToSymbol = useCallback((symbol: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('subscribe:symbol', symbol);
      subscriptionsRef.current.add(symbol);
      console.log(`Subscribed to symbol: ${symbol}`);
    }
  }, [isConnected]);

  const unsubscribeFromSymbol = useCallback((symbol: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('unsubscribe:symbol', symbol);
      subscriptionsRef.current.delete(symbol);
      console.log(`Unsubscribed from symbol: ${symbol}`);
    }
  }, [isConnected]);

  const subscribeToOrderBook = useCallback((symbol: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('subscribe:orderbook', symbol);
      orderBookSubscriptionsRef.current.add(symbol);
      console.log(`Subscribed to order book: ${symbol}`);
    }
  }, [isConnected]);

  const unsubscribeFromOrderBook = useCallback((symbol: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('unsubscribe:orderbook', symbol);
      orderBookSubscriptionsRef.current.delete(symbol);
      console.log(`Unsubscribed from order book: ${symbol}`);
    }
  }, [isConnected]);

  const reconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setReconnectCount(0);
    connect();
  }, [connect]);

  return {
    socket: socketRef.current,
    isConnected,
    error,
    reconnectCount,
    subscribeToSymbol,
    unsubscribeFromSymbol,
    subscribeToOrderBook,
    unsubscribeFromOrderBook,
    reconnect,
  };
}