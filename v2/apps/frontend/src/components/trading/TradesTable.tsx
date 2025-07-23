'use client';

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { fetchTrades } from '@/store/slices/tradingSlice';
import { ChartBarIcon } from '@heroicons/react/24/outline';

interface TradesTableProps {
  accountId?: string;
  instrumentSymbol?: string;
  maxRows?: number;
}

export function TradesTable({ accountId, instrumentSymbol, maxRows }: TradesTableProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { trades, isLoading } = useSelector((state: RootState) => state.trading);
  const { user } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    dispatch(fetchTrades());
  }, [dispatch]);

  // Filter trades based on props
  let filteredTrades = trades;
  if (accountId) {
    // Filter by account would require additional data structure
    // For now, we'll filter by user
    filteredTrades = filteredTrades.filter(
      trade => trade.buyerUserId === user?.id || trade.sellerUserId === user?.id
    );
  }
  if (instrumentSymbol) {
    filteredTrades = filteredTrades.filter(trade => trade.instrumentSymbol === instrumentSymbol);
  }
  if (maxRows) {
    filteredTrades = filteredTrades.slice(0, maxRows);
  }

  const getUserSide = (trade: any) => {
    if (!user) return 'UNKNOWN';
    return trade.buyerUserId === user.id ? 'BUY' : 'SELL';
  };

  const getSideBadge = (side: string) => (
    <span className={`badge ${side === 'BUY' ? 'badge-success' : 'badge-danger'}`}>
      {side}
    </span>
  );

  if (isLoading && trades.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900">Recent Trades</h3>
        </div>
        <div className="card-content">
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-lg font-medium text-gray-900">
          Recent Trades {filteredTrades.length > 0 && `(${filteredTrades.length})`}
        </h3>
      </div>
      <div className="card-content p-0">
        {filteredTrades.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <ChartBarIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No trades found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead className="table-header">
                <tr className="table-row">
                  <th className="table-head">Instrument</th>
                  <th className="table-head">Side</th>
                  <th className="table-head">Quantity</th>
                  <th className="table-head">Price</th>
                  <th className="table-head">Value</th>
                  <th className="table-head">Time</th>
                </tr>
              </thead>
              <tbody className="table-body">
                {filteredTrades.map((trade) => {
                  const side = getUserSide(trade);
                  const quantity = parseFloat(trade.quantity.toString());
                  const price = parseFloat(trade.price.toString());
                  const value = quantity * price;

                  return (
                    <tr key={trade.id} className="table-row">
                      <td className="table-cell font-medium">
                        {trade.instrumentSymbol}
                      </td>
                      <td className="table-cell">
                        {getSideBadge(side)}
                      </td>
                      <td className="table-cell">
                        {quantity.toFixed(2)}
                      </td>
                      <td className="table-cell">
                        ${price.toFixed(2)}
                      </td>
                      <td className="table-cell font-medium">
                        ${value.toFixed(2)}
                      </td>
                      <td className="table-cell">
                        <div className="text-sm">
                          <div>{new Date(trade.timestamp).toLocaleDateString()}</div>
                          <div className="text-gray-500">
                            {new Date(trade.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}