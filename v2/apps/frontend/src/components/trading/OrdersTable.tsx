'use client';

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-hot-toast';
import { RootState, AppDispatch } from '@/store';
import { fetchOrders, cancelOrder } from '@/store/slices/tradingSlice';
import { TrashIcon, ClockIcon } from '@heroicons/react/24/outline';

interface OrdersTableProps {
  accountId?: string;
  instrumentSymbol?: string;
  maxRows?: number;
}

export function OrdersTable({ accountId, instrumentSymbol, maxRows }: OrdersTableProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { orders, isLoading } = useSelector((state: RootState) => state.trading);
  const [cancellingOrders, setCancellingOrders] = useState<Set<string>>(new Set());

  useEffect(() => {
    dispatch(fetchOrders());
  }, [dispatch]);

  const handleCancelOrder = async (orderId: string) => {
    setCancellingOrders(prev => new Set(prev).add(orderId));
    
    try {
      const result = await dispatch(cancelOrder(orderId));
      if (cancelOrder.fulfilled.match(result)) {
        toast.success('Order cancelled successfully');
      }
    } catch (error) {
      toast.error('Failed to cancel order');
    } finally {
      setCancellingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  // Filter orders based on props
  let filteredOrders = orders;
  if (accountId) {
    filteredOrders = filteredOrders.filter(order => order.accountId === accountId);
  }
  if (instrumentSymbol) {
    filteredOrders = filteredOrders.filter(order => order.instrumentSymbol === instrumentSymbol);
  }
  if (maxRows) {
    filteredOrders = filteredOrders.slice(0, maxRows);
  }

  const getStatusBadge = (status: string) => {
    const statusClasses = {
      WORKING: 'badge-primary',
      PARTIALLY_FILLED: 'badge-warning',
      FILLED: 'badge-success',
      CANCELLED: 'badge-danger',
      REJECTED: 'badge-danger',
      EXPIRED: 'badge-danger',
    };

    return (
      <span className={`badge ${statusClasses[status as keyof typeof statusClasses] || 'badge-primary'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const getSideBadge = (side: string) => (
    <span className={`badge ${side === 'BUY' ? 'badge-success' : 'badge-danger'}`}>
      {side}
    </span>
  );

  const canCancelOrder = (status: string) => {
    return ['WORKING', 'PARTIALLY_FILLED'].includes(status);
  };

  if (isLoading && orders.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900">Orders</h3>
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
          Orders {filteredOrders.length > 0 && `(${filteredOrders.length})`}
        </h3>
      </div>
      <div className="card-content p-0">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <ClockIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No orders found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead className="table-header">
                <tr className="table-row">
                  <th className="table-head">Instrument</th>
                  <th className="table-head">Side</th>
                  <th className="table-head">Type</th>
                  <th className="table-head">Quantity</th>
                  <th className="table-head">Price</th>
                  <th className="table-head">Filled</th>
                  <th className="table-head">Status</th>
                  <th className="table-head">Time</th>
                  <th className="table-head">Actions</th>
                </tr>
              </thead>
              <tbody className="table-body">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="table-row">
                    <td className="table-cell font-medium">
                      {order.instrumentSymbol}
                    </td>
                    <td className="table-cell">
                      {getSideBadge(order.side)}
                    </td>
                    <td className="table-cell">
                      <span className="text-sm text-gray-600">
                        {order.orderType}
                      </span>
                    </td>
                    <td className="table-cell">
                      {parseFloat(order.quantity.toString()).toFixed(2)}
                    </td>
                    <td className="table-cell">
                      ${parseFloat(order.price.toString()).toFixed(2)}
                    </td>
                    <td className="table-cell">
                      <div className="text-sm">
                        <div>{parseFloat(order.filledQuantity.toString()).toFixed(2)}</div>
                        <div className="text-gray-500">
                          {((parseFloat(order.filledQuantity.toString()) / parseFloat(order.quantity.toString())) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">
                      {getStatusBadge(order.status)}
                    </td>
                    <td className="table-cell">
                      <div className="text-sm">
                        <div>{new Date(order.createdAt).toLocaleDateString()}</div>
                        <div className="text-gray-500">
                          {new Date(order.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">
                      {canCancelOrder(order.status) && (
                        <button
                          onClick={() => handleCancelOrder(order.id)}
                          disabled={cancellingOrders.has(order.id)}
                          className="inline-flex items-center p-1 text-danger-600 hover:text-danger-700 disabled:opacity-50"
                          title="Cancel Order"
                        >
                          {cancellingOrders.has(order.id) ? (
                            <div className="w-4 h-4 border-2 border-danger-200 border-t-danger-600 rounded-full animate-spin"></div>
                          ) : (
                            <TrashIcon className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}