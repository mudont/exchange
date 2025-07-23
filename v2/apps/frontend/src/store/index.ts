import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from './slices/authSlice';
import { tradingSlice } from './slices/tradingSlice';
import { marketDataSlice } from './slices/marketDataSlice';
import { portfolioSlice } from './slices/portfolioSlice';

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    trading: tradingSlice.reducer,
    marketData: marketDataSlice.reducer,
    portfolio: portfolioSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
  devTools: process.env.NODE_ENV !== 'production',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;