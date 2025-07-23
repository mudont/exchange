import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

interface MarketTicker {
  symbol: string;
  lastPrice: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  bestBid: number;
  bestAsk: number;
  timestamp: string;
}

interface OrderBookLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

interface OrderBook {
  symbol: string;
  timestamp: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

interface MarketDataState {
  tickers: Record<string, MarketTicker>;
  orderBooks: Record<string, OrderBook>;
  selectedSymbol: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: MarketDataState = {
  tickers: {},
  orderBooks: {},
  selectedSymbol: null,
  isLoading: false,
  error: null,
};

// Async thunks
export const fetchMarketSummary = createAsyncThunk(
  'marketData/fetchMarketSummary',
  async (_, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/proxy/v1/market-data/summary');

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error?.message || 'Failed to fetch market summary');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      return rejectWithValue('Network error occurred');
    }
  }
);

export const fetchTicker = createAsyncThunk(
  'marketData/fetchTicker',
  async (symbol: string, { rejectWithValue }) => {
    try {
      const response = await fetch(`/api/proxy/v1/market-data/ticker/${symbol}`);

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error?.message || 'Failed to fetch ticker');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      return rejectWithValue('Network error occurred');
    }
  }
);

export const fetchOrderBook = createAsyncThunk(
  'marketData/fetchOrderBook',
  async (symbol: string, { rejectWithValue }) => {
    try {
      const response = await fetch(`/api/proxy/v1/market-data/depth/${symbol}`);

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error?.message || 'Failed to fetch order book');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      return rejectWithValue('Network error occurred');
    }
  }
);

export const marketDataSlice = createSlice({
  name: 'marketData',
  initialState,
  reducers: {
    setSelectedSymbol: (state, action: PayloadAction<string>) => {
      state.selectedSymbol = action.payload;
    },
    updateTicker: (state, action: PayloadAction<MarketTicker>) => {
      state.tickers[action.payload.symbol] = action.payload;
    },
    updateOrderBook: (state, action: PayloadAction<OrderBook>) => {
      state.orderBooks[action.payload.symbol] = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch market summary
      .addCase(fetchMarketSummary.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchMarketSummary.fulfilled, (state, action) => {
        state.isLoading = false;
        // Convert array to object keyed by symbol
        const tickers = action.payload.reduce((acc: Record<string, MarketTicker>, ticker: MarketTicker) => {
          acc[ticker.symbol] = ticker;
          return acc;
        }, {});
        state.tickers = { ...state.tickers, ...tickers };
      })
      .addCase(fetchMarketSummary.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Fetch ticker
      .addCase(fetchTicker.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchTicker.fulfilled, (state, action) => {
        state.isLoading = false;
        state.tickers[action.payload.symbol] = action.payload;
      })
      .addCase(fetchTicker.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Fetch order book
      .addCase(fetchOrderBook.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchOrderBook.fulfilled, (state, action) => {
        state.isLoading = false;
        state.orderBooks[action.payload.symbol] = action.payload;
      })
      .addCase(fetchOrderBook.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});