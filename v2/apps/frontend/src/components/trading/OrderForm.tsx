'use client';

import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-hot-toast';
import { RootState, AppDispatch } from '@/store';
import { placeOrder, tradingSlice } from '@/store/slices/tradingSlice';
import { fetchAccounts } from '@/store/slices/portfolioSlice';

const orderSchema = z.object({
  instrumentSymbol: z.string().min(1, 'Please select an instrument'),
  accountId: z.string().min(1, 'Please select an account'),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().positive('Quantity must be positive'),
  price: z.number().positive('Price must be positive'),
  orderType: z.enum(['LIMIT', 'MARKET']),
});

type OrderFormData = z.infer<typeof orderSchema>;

interface OrderFormProps {
  selectedInstrument?: string;
}

export function OrderForm({ selectedInstrument }: OrderFormProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { orderForm, isLoading } = useSelector((state: RootState) => state.trading);
  const { accounts, selectedAccountId } = useSelector((state: RootState) => state.portfolio);
  const { tickers } = useSelector((state: RootState) => state.marketData);
  
  const [estimatedTotal, setEstimatedTotal] = useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      side: orderForm.side,
      orderType: 'LIMIT',
      instrumentSymbol: selectedInstrument || '',
      accountId: selectedAccountId || '',
    },
  });

  const watchedValues = watch();

  // Update estimated total when values change
  useEffect(() => {
    const { quantity, price, orderType } = watchedValues;
    if (quantity && (price || orderType === 'MARKET')) {
      const currentPrice = orderType === 'MARKET' && selectedInstrument 
        ? tickers[selectedInstrument]?.lastPrice || 0
        : price || 0;
      setEstimatedTotal(quantity * currentPrice);
    } else {
      setEstimatedTotal(0);
    }
  }, [watchedValues, selectedInstrument, tickers]);

  // Load accounts on mount
  useEffect(() => {
    if (accounts.length === 0) {
      dispatch(fetchAccounts());
    }
  }, [dispatch, accounts.length]);

  // Set default account when accounts are loaded
  useEffect(() => {
    if (accounts.length > 0 && !watchedValues.accountId) {
      setValue('accountId', selectedAccountId || accounts[0].id);
    }
  }, [accounts, selectedAccountId, setValue, watchedValues.accountId]);

  // Update form when selected instrument changes
  useEffect(() => {
    if (selectedInstrument) {
      setValue('instrumentSymbol', selectedInstrument);
      // Set market price as default for limit orders
      const ticker = tickers[selectedInstrument];
      if (ticker && watchedValues.orderType === 'LIMIT') {
        setValue('price', ticker.lastPrice);
      }
    }
  }, [selectedInstrument, setValue, tickers, watchedValues.orderType]);

  const onSubmit = async (data: OrderFormData) => {
    try {
      const result = await dispatch(placeOrder(data));
      if (placeOrder.fulfilled.match(result)) {
        toast.success('Order placed successfully!');
        reset();
      }
    } catch (error) {
      // Error is handled by the slice
    }
  };

  const handleSideChange = (side: 'BUY' | 'SELL') => {
    setValue('side', side);
    dispatch(tradingSlice.actions.updateOrderForm({ side }));
  };

  const handleOrderTypeChange = (orderType: 'LIMIT' | 'MARKET') => {
    setValue('orderType', orderType);
    if (orderType === 'MARKET' && selectedInstrument) {
      const ticker = tickers[selectedInstrument];
      if (ticker) {
        setValue('price', ticker.lastPrice);
      }
    }
  };

  const currentTicker = selectedInstrument ? tickers[selectedInstrument] : null;

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-lg font-medium text-gray-900">Place Order</h3>
      </div>
      <div className="card-content">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Instrument Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Instrument
            </label>
            <select
              {...register('instrumentSymbol')}
              className="input"
            >
              <option value="">Select instrument</option>
              {Object.keys(tickers).map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol} - ${tickers[symbol].lastPrice}
                </option>
              ))}
            </select>
            {errors.instrumentSymbol && (
              <p className="mt-1 text-sm text-danger-600">{errors.instrumentSymbol.message}</p>
            )}
          </div>

          {/* Account Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account
            </label>
            <select
              {...register('accountId')}
              className="input"
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            {errors.accountId && (
              <p className="mt-1 text-sm text-danger-600">{errors.accountId.message}</p>
            )}
          </div>

          {/* Side Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Side
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSideChange('BUY')}
                className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  watchedValues.side === 'BUY'
                    ? 'bg-success-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => handleSideChange('SELL')}
                className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  watchedValues.side === 'SELL'
                    ? 'bg-danger-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                SELL
              </button>
            </div>
          </div>

          {/* Order Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Order Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleOrderTypeChange('LIMIT')}
                className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  watchedValues.orderType === 'LIMIT'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                LIMIT
              </button>
              <button
                type="button"
                onClick={() => handleOrderTypeChange('MARKET')}
                className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  watchedValues.orderType === 'MARKET'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                MARKET
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity
            </label>
            <input
              {...register('quantity', { valueAsNumber: true })}
              type="number"
              step="0.01"
              min="0"
              className="input"
              placeholder="0.00"
            />
            {errors.quantity && (
              <p className="mt-1 text-sm text-danger-600">{errors.quantity.message}</p>
            )}
          </div>

          {/* Price (only for limit orders) */}
          {watchedValues.orderType === 'LIMIT' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price
              </label>
              <div className="relative">
                <input
                  {...register('price', { valueAsNumber: true })}
                  type="number"
                  step="0.01"
                  min="0"
                  className="input pr-16"
                  placeholder="0.00"
                />
                {currentTicker && (
                  <button
                    type="button"
                    onClick={() => setValue('price', currentTicker.lastPrice)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm text-primary-600 hover:text-primary-500"
                  >
                    Market
                  </button>
                )}
              </div>
              {errors.price && (
                <p className="mt-1 text-sm text-danger-600">{errors.price.message}</p>
              )}
            </div>
          )}

          {/* Order Summary */}
          {estimatedTotal > 0 && (
            <div className="bg-gray-50 rounded-md p-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Estimated Total:</span>
                <span className="font-medium">${estimatedTotal.toFixed(2)}</span>
              </div>
              {currentTicker && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-600">Current Price:</span>
                  <span>${currentTicker.lastPrice}</span>
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !watchedValues.instrumentSymbol || !watchedValues.accountId}
            className={`w-full py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              watchedValues.side === 'BUY'
                ? 'btn-success'
                : 'btn-danger'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Placing Order...
              </div>
            ) : (
              `${watchedValues.side} ${watchedValues.instrumentSymbol || 'Instrument'}`
            )}
          </button>
        </form>
      </div>
    </div>
  );
}