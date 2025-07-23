import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Order, Position, Trade } from '@trading-exchange/shared';
import { RootState } from '../index';

interface TradingState {
  orders: Order[];
  positions: Position[];
  trades: Trade[];
  selectedInstrument: string | null;
  orderForm: {
    side: 'BUY' | 'SELL';
    quantity: string;
    price: string;
    orderType: 'LIMIT' | 'MARKET';
  };
  isLoading: boolean;
  error: string | null;
}

const initialState: TradingState = {
  orders: [],
  positions: [],
  trades: [],
  selectedInstrument: null,
  orderForm: {
    side: 'BUY',
    quantity: '',
    price: '',
    orderType: 'LIMIT',
  },
  isLoading: false,
  error: null,
};

// Helper function to get auth token
const getAuthToken = (state: RootState) => state.auth.token;

// Async thunks
export const fetchOrders = createAsyncThunk(
  'trading/fetchOrders',
  async (_, { getState, rejectWithValue }) => {
    try {
      const token = getAuthToken(getState() as RootState);
      if (!token) {
        return rejectWithValue('No authentication token');
      }

      const response = await fetch('/api/proxy/v1/orders', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error?.message || 'Failed to fetch orders');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      return rejectWithValue('Network error occurred');
    }
  }
);

export const fetchPositions = createAsyncThunk(
  'trading/fetchPositions',
  async (_, { getState, rejectWithValue }) => {
    try {
      const token = getAuthToken(getState() as RootState);
      if (!token) {
        return rejectWithValue('No authentication token');
      }

      const response = await fetch('/api/proxy/v1/positions', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error?.message || 'Failed to fetch positions');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      return rejectWithValue('Network error occurred');
    }
  }
);

export const fetchTrades = createAsyncThunk(
  'trading/fetchTrades',
  async (_, { getState, rejectWithValue }) => {
    try {
      const token = getAuthToken(getState() as RootState);
      if (!token) {
        return rejectWithValue('No authentication token');
      }

      const response = await fetch('/api/proxy/v1/trades', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error?.message || 'Failed to fetch trades');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      return rejectWithValue('Network error occurred');
    }
  }
);

export const placeOrder = createAsyncThunk(
  'trading/placeOrder',
  async (orderData: {
    instrumentSymbol: string;
    accountId: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    orderType?: 'LIMIT' | 'MARKET';
  }, { getState, rejectWithValue }) => {
    try {
      const token = getAuthToken(getState() as RootState);
      if (!token) {
        return rejectWithValue('No authentication token');
      }

      const response = await fetch('/api/proxy/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error?.message || 'Failed to place order');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      return rejectWithValue('Network error occurred');
    }
  }
);

export const cancelOrder = createAsyncThunk(
  'trading/cancelOrder',
  async (orderId: string, { getState, rejectWithValue }) => {
    try {
      const token = getAuthToken(getState() as RootState);
      if (!token) {
        return rejectWithValue('No authentication token');
      }

      const response = await fetch(`/api/proxy/v1/orders/${orderId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error?.message || 'Failed to cancel order');
      }

      const data = await response.json();
      return { orderId, ...data.data };
    } catch (error) {
      return rejectWithValue('Network error occurred');
    }
  }
);

export const tradingSlice = createSlice({
  name: 'trading',
  initialState,
  reducers: {
    setSelectedInstrument: (state, action: PayloadAction<string>) => {
      state.selectedInstrument = action.payload;
    },
    updateOrderForm: (state, action: PayloadAction<Partial<TradingState['orderForm']>>) => {
      state.orderForm = { ...state.orderForm, ...action.payload };
    },
    resetOrderForm: (state) => {
      state.orderForm = initialState.orderForm;
    },
    clearError: (state) => {
      state.error = null;
    },
    // Real-time updates
    updateOrder: (state, action: PayloadAction<Order>) => {
      const index = state.orders.findIndex(order => order.id === action.payload.id);
      if (index !== -1) {
        state.orders[index] = action.payload;
      } else {
        state.orders.unshift(action.payload);
      }
    },
    updatePosition: (state, action: PayloadAction<Position>) => {
      const index = state.positions.findIndex(pos => pos.id === action.payload.id);
      if (index !== -1) {
        state.positions[index] = action.payload;
      } else {
        state.positions.push(action.payload);
      }
    },
    addTrade: (state, action: PayloadAction<Trade>) => {
      state.trades.unshift(action.payload);
      // Keep only the latest 100 trades
      if (state.trades.length > 100) {
        state.trades = state.trades.slice(0, 100);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch orders
      .addCase(fetchOrders.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.isLoading = false;
        state.orders = action.payload;
      })
      .addCase(fetchOrders.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Fetch positions
      .addCase(fetchPositions.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchPositions.fulfilled, (state, action) => {
        state.isLoading = false;
        state.positions = action.payload;
      })
      .addCase(fetchPositions.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Fetch trades
      .addCase(fetchTrades.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchTrades.fulfilled, (state, action) => {
        state.isLoading = false;
        state.trades = action.payload;
      })
      .addCase(fetchTrades.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Place order
      .addCase(placeOrder.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(placeOrder.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload.order) {
          state.orders.unshift(action.payload.order);
        }
        if (action.payload.trades) {
          state.trades.unshift(...action.payload.trades);
        }
        // Reset form on successful order
        state.orderForm = initialState.orderForm;
      })
      .addCase(placeOrder.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Cancel order
      .addCase(cancelOrder.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(cancelOrder.fulfilled, (state, action) => {
        state.isLoading = false;
        const index = state.orders.findIndex(order => order.id === action.payload.orderId);
        if (index !== -1) {
          state.orders[index] = { ...state.orders[index], status: 'CANCELLED' };
        }
      })
      .addCase(cancelOrder.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});