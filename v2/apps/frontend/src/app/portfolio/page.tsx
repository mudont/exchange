'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { fetchAccounts, fetchAccountBalances } from '@/store/slices/portfolioSlice';
import { fetchPositions } from '@/store/slices/tradingSlice';
import { TradingLayout } from '@/components/trading/TradingLayout';
import { 
  CurrencyDollarIcon, 
  TrendingUpIcon, 
  TrendingDownIcon,
  ChartBarIcon 
} from '@heroicons/react/24/outline';

export default function PortfolioPage() {
  const { requireAuth } = useAuth();
  const dispatch = useDispatch<AppDispatch>();
  const { accounts, selectedAccountId, balances, totalValue } = useSelector(
    (state: RootState) => state.portfolio
  );
  const { positions } = useSelector((state: RootState) => state.trading);

  useEffect(() => {
    if (!requireAuth()) return;
    
    dispatch(fetchAccounts());
    dispatch(fetchPositions());
  }, [dispatch, requireAuth]);

  useEffect(() => {
    if (selectedAccountId) {
      dispatch(fetchAccountBalances(selectedAccountId));
    }
  }, [dispatch, selectedAccountId]);

  // Calculate total P&L
  const totalUnrealizedPnL = positions.reduce(
    (sum, position) => sum + parseFloat(position.unrealizedPnL.toString()),
    0
  );
  const totalRealizedPnL = positions.reduce(
    (sum, position) => sum + parseFloat(position.realizedPnL.toString()),
    0
  );
  const totalPnL = totalUnrealizedPnL + totalRealizedPnL;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getPnLColor = (amount: number) => {
    if (amount > 0) return 'text-success-600';
    if (amount < 0) return 'text-danger-600';
    return 'text-gray-600';
  };

  const getPnLIcon = (amount: number) => {
    if (amount > 0) return TrendingUpIcon;
    if (amount < 0) return TrendingDownIcon;
    return ChartBarIcon;
  };

  return (
    <TradingLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Portfolio</h1>
          <p className="text-gray-600">Monitor your positions and performance</p>
        </div>

        {/* Portfolio Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="card">
            <div className="card-content">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                    <CurrencyDollarIcon className="w-5 h-5 text-primary-600" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Value</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatCurrency(totalValue)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-content">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    totalPnL >= 0 ? 'bg-success-100' : 'bg-danger-100'
                  }`}>
                    {(() => {
                      const IconComponent = getPnLIcon(totalPnL);
                      return <IconComponent className={`w-5 h-5 ${getPnLColor(totalPnL)}`} />;
                    })()}
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total P&L</p>
                  <p className={`text-2xl font-semibold ${getPnLColor(totalPnL)}`}>
                    {formatCurrency(totalPnL)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-content">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    totalUnrealizedPnL >= 0 ? 'bg-success-100' : 'bg-danger-100'
                  }`}>
                    <ChartBarIcon className={`w-5 h-5 ${getPnLColor(totalUnrealizedPnL)}`} />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Unrealized P&L</p>
                  <p className={`text-2xl font-semibold ${getPnLColor(totalUnrealizedPnL)}`}>
                    {formatCurrency(totalUnrealizedPnL)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-content">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                    <ChartBarIcon className="w-5 h-5 text-primary-600" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Open Positions</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {positions.filter(p => parseFloat(p.quantity.toString()) !== 0).length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Account Balances */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">Account Balances</h3>
          </div>
          <div className="card-content">
            {balances.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CurrencyDollarIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No balance information available</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {balances.map((balance) => (
                  <div key={balance.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          {balance.currency}
                        </p>
                        <p className="text-xl font-semibold text-gray-900">
                          {formatCurrency(parseFloat(balance.balance.toString()))}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Available</p>
                        <p className="text-sm font-medium text-gray-900">
                          {formatCurrency(parseFloat(balance.availableBalance.toString()))}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Positions Table */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">
              Positions {positions.length > 0 && `(${positions.length})`}
            </h3>
          </div>
          <div className="card-content p-0">
            {positions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <ChartBarIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No positions found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead className="table-header">
                    <tr className="table-row">
                      <th className="table-head">Instrument</th>
                      <th className="table-head">Quantity</th>
                      <th className="table-head">Avg Price</th>
                      <th className="table-head">Current Value</th>
                      <th className="table-head">Unrealized P&L</th>
                      <th className="table-head">Realized P&L</th>
                      <th className="table-head">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody className="table-body">
                    {positions.map((position) => {
                      const quantity = parseFloat(position.quantity.toString());
                      const avgPrice = parseFloat(position.avgPrice.toString());
                      const unrealizedPnL = parseFloat(position.unrealizedPnL.toString());
                      const realizedPnL = parseFloat(position.realizedPnL.toString());
                      const currentValue = quantity * avgPrice; // Simplified - would use current market price

                      return (
                        <tr key={position.id} className="table-row">
                          <td className="table-cell font-medium">
                            {position.instrumentSymbol}
                          </td>
                          <td className="table-cell">
                            <span className={quantity >= 0 ? 'text-success-600' : 'text-danger-600'}>
                              {quantity.toFixed(2)}
                            </span>
                          </td>
                          <td className="table-cell">
                            {formatCurrency(avgPrice)}
                          </td>
                          <td className="table-cell font-medium">
                            {formatCurrency(Math.abs(currentValue))}
                          </td>
                          <td className={`table-cell font-medium ${getPnLColor(unrealizedPnL)}`}>
                            {formatCurrency(unrealizedPnL)}
                          </td>
                          <td className={`table-cell font-medium ${getPnLColor(realizedPnL)}`}>
                            {formatCurrency(realizedPnL)}
                          </td>
                          <td className="table-cell">
                            <div className="text-sm">
                              <div>{new Date(position.lastUpdated).toLocaleDateString()}</div>
                              <div className="text-gray-500">
                                {new Date(position.lastUpdated).toLocaleTimeString()}
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
      </div>
    </TradingLayout>
  );
}