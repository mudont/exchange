'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { fetchMarketSummary, marketDataSlice } from '@/store/slices/marketDataSlice';
import { useWebSocket } from '@/hooks/useWebSocket';
import { TradingLayout } from '@/components/trading/TradingLayout';
import { OrderForm } from '@/components/trading/OrderForm';
import { OrderBook } from '@/components/trading/OrderBook';
import { OrdersTable } from '@/components/trading/OrdersTable';
import { TradesTable } from '@/components/trading/TradesTable';

export default function TradingPage() {
  const { requireAuth } = useAuth();
  const dispatch = useDispatch<AppDispatch>();
  const { tickers, selectedSymbol } = useSelector((state: RootState) => state.marketData);
  const [currentSymbol, setCurrentSymbol] = useState<string>('');

  // Initialize WebSocket connection
  useWebSocket();

  useEffect(() => {
    if (!requireAuth()) return;
    
    // Fetch market data
    dispatch(fetchMarketSummary());
  }, [dispatch, requireAuth]);

  // Set default symbol when tickers are loaded
  useEffect(() => {
    if (!currentSymbol && Object.keys(tickers).length > 0) {
      const firstSymbol = Object.keys(tickers)[0];
      setCurrentSymbol(firstSymbol);
      dispatch(marketDataSlice.actions.setSelectedSymbol(firstSymbol));
    }
  }, [tickers, currentSymbol, dispatch]);

  const handleSymbolChange = (symbol: string) => {
    setCurrentSymbol(symbol);
    dispatch(marketDataSlice.actions.setSelectedSymbol(symbol));
  };

  const currentTicker = currentSymbol ? tickers[currentSymbol] : null;

  return (
    <TradingLayout>
      <div className="space-y-6">
        {/* Header with Symbol Selection */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Trading</h1>
            <p className="text-gray-600">Place orders and monitor your positions</p>
          </div>
          
          <div className="mt-4 sm:mt-0">
            <select
              value={currentSymbol}
              onChange={(e) => handleSymbolChange(e.target.value)}
              className="input w-full sm:w-auto"
            >
              <option value="">Select instrument</option>
              {Object.entries(tickers).map(([symbol, ticker]) => (
                <option key={symbol} value={symbol}>
                  {symbol} - ${ticker.lastPrice} ({ticker.priceChangePercent24h >= 0 ? '+' : ''}{ticker.priceChangePercent24h.toFixed(2)}%)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Current Price Display */}
        {currentTicker && (
          <div className="card">
            <div className="card-content">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {currentSymbol}
                  </h2>
                  <p className="text-3xl font-bold text-gray-900">
                    ${currentTicker.lastPrice}
                  </p>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-medium ${
                    currentTicker.priceChange24h >= 0 ? 'text-success-600' : 'text-danger-600'
                  }`}>
                    {currentTicker.priceChange24h >= 0 ? '+' : ''}${currentTicker.priceChange24h.toFixed(2)}
                  </div>
                  <div className={`text-sm ${
                    currentTicker.priceChangePercent24h >= 0 ? 'text-success-600' : 'text-danger-600'
                  }`}>
                    {currentTicker.priceChangePercent24h >= 0 ? '+' : ''}{currentTicker.priceChangePercent24h.toFixed(2)}%
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
                <div>
                  <p className="text-sm text-gray-500">24h High</p>
                  <p className="font-medium">${currentTicker.high24h}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">24h Low</p>
                  <p className="font-medium">${currentTicker.low24h}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">24h Volume</p>
                  <p className="font-medium">{currentTicker.volume24h.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Spread</p>
                  <p className="font-medium">
                    ${(currentTicker.bestAsk - currentTicker.bestBid).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Trading Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Order Form */}
          <div className="lg:col-span-1">
            <OrderForm selectedInstrument={currentSymbol} />
          </div>

          {/* Right Column - Order Book */}
          <div className="lg:col-span-2">
            {currentSymbol ? (
              <OrderBook symbol={currentSymbol} />
            ) : (
              <div className="card">
                <div className="card-content">
                  <div className="text-center py-8 text-gray-500">
                    <p>Select an instrument to view the order book</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Orders and Trades Tables */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <OrdersTable instrumentSymbol={currentSymbol} maxRows={10} />
          <TradesTable instrumentSymbol={currentSymbol} maxRows={10} />
        </div>
      </div>
    </TradingLayout>
  );
}