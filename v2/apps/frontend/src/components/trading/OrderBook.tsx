'use client';

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { fetchOrderBook } from '@/store/slices/marketDataSlice';
import { useWebSocket } from '@/hooks/useWebSocket';

interface OrderBookProps {
  symbol: string;
  maxLevels?: number;
}

export function OrderBook({ symbol, maxLevels = 10 }: OrderBookProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { orderBooks, isLoading } = useSelector((state: RootState) => state.marketData);
  const { subscribeToOrderBook, unsubscribeFromOrderBook } = useWebSocket();

  const orderBook = orderBooks[symbol];

  useEffect(() => {
    if (symbol) {
      // Fetch initial order book data
      dispatch(fetchOrderBook(symbol));
      
      // Subscribe to real-time updates
      subscribeToOrderBook(symbol);
      
      return () => {
        unsubscribeFromOrderBook(symbol);
      };
    }
  }, [symbol, dispatch, subscribeToOrderBook, unsubscribeFromOrderBook]);

  if (isLoading && !orderBook) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900">Order Book</h3>
        </div>
        <div className="card-content">
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!orderBook) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900">Order Book</h3>
        </div>
        <div className="card-content">
          <div className="text-center py-8 text-gray-500">
            <p>No order book data available</p>
          </div>
        </div>
      </div>
    );
  }

  const asks = orderBook.asks.slice(0, maxLevels).reverse();
  const bids = orderBook.bids.slice(0, maxLevels);

  const maxQuantity = Math.max(
    ...asks.map(level => level.quantity),
    ...bids.map(level => level.quantity)
  );

  const formatPrice = (price: number) => price.toFixed(2);
  const formatQuantity = (quantity: number) => quantity.toFixed(2);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-lg font-medium text-gray-900">
          Order Book - {symbol}
        </h3>
        <p className="text-sm text-gray-500">
          Last updated: {new Date(orderBook.timestamp).toLocaleTimeString()}
        </p>
      </div>
      <div className="card-content p-0">
        <div className="grid grid-cols-3 gap-0 text-xs font-medium text-gray-500 bg-gray-50 px-4 py-2 border-b">
          <div>Price</div>
          <div className="text-right">Quantity</div>
          <div className="text-right">Orders</div>
        </div>

        {/* Asks (Sell Orders) */}
        <div className="divide-y divide-gray-100">
          {asks.map((level, index) => {
            const widthPercentage = (level.quantity / maxQuantity) * 100;
            return (
              <div
                key={`ask-${level.price}-${index}`}
                className="relative px-4 py-1 hover:bg-gray-50 transition-colors"
              >
                <div
                  className="absolute inset-y-0 right-0 bg-danger-50 opacity-50"
                  style={{ width: `${widthPercentage}%` }}
                ></div>
                <div className="relative grid grid-cols-3 gap-0 text-sm">
                  <div className="text-danger-600 font-medium">
                    ${formatPrice(level.price)}
                  </div>
                  <div className="text-right text-gray-900">
                    {formatQuantity(level.quantity)}
                  </div>
                  <div className="text-right text-gray-500">
                    {level.orderCount}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Spread */}
        <div className="bg-gray-100 px-4 py-2 text-center">
          <div className="text-sm font-medium text-gray-700">
            Spread: ${(bids[0]?.price && asks[asks.length - 1]?.price) 
              ? (asks[asks.length - 1].price - bids[0].price).toFixed(2) 
              : '0.00'}
          </div>
        </div>

        {/* Bids (Buy Orders) */}
        <div className="divide-y divide-gray-100">
          {bids.map((level, index) => {
            const widthPercentage = (level.quantity / maxQuantity) * 100;
            return (
              <div
                key={`bid-${level.price}-${index}`}
                className="relative px-4 py-1 hover:bg-gray-50 transition-colors"
              >
                <div
                  className="absolute inset-y-0 right-0 bg-success-50 opacity-50"
                  style={{ width: `${widthPercentage}%` }}
                ></div>
                <div className="relative grid grid-cols-3 gap-0 text-sm">
                  <div className="text-success-600 font-medium">
                    ${formatPrice(level.price)}
                  </div>
                  <div className="text-right text-gray-900">
                    {formatQuantity(level.quantity)}
                  </div>
                  <div className="text-right text-gray-500">
                    {level.orderCount}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}