import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Account, Balance } from '@trading-exchange/shared';
import { RootState } from '../index';

interface PortfolioState {
  accounts: Account[];
  selectedAccountId: string | null;
  balances: Balance[];
  totalValue: number;
  totalPnL: number;
  isLoading: boolean;
  error: string | null;
}

const initialState: PortfolioState = {
  accounts: [],
  selectedAccountId: null,
  balances: [],
  totalValue: 0,
  totalPnL: 0,
  isLoading: false,
  error: null,
};

// Helper function to get auth token
const getAuthToken = (state: RootState) => state.auth.token;

// Async thunks
export const fetchAccounts = createAsyncThunk(
  'portfolio/fetchAccounts',
  async (_, { getState, rejectWithValue }) => {
    try {
      const token = getAuthToken(getState() as RootState);
      if (!token) {
        return rejectWithValue('No authentication token');
      }

      const response = await fetch('/api/proxy/v1/accounts', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error?.message || 'Failed to fetch accounts');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      return rejectWithValue('Network error occurred');
    }
  }
);

export const fetchAccountBalances = createAsyncThunk(
  'portfolio/fetchAccountBalances',
  async (accountId: string, { getState, rejectWithValue }) => {
    try {
      const token = getAuthToken(getState() as RootState);
      if (!token) {
        return rejectWithValue('No authentication token');
      }

      const response = await fetch(`/api/proxy/v1/accounts/${accountId}/balances`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error?.message || 'Failed to fetch balances');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      return rejectWithValue('Network error occurred');
    }
  }
);

export const createAccount = createAsyncThunk(
  'portfolio/createAccount',
  async (accountData: {
    name: string;
    type?: string;
    initialBalance?: number;
    currency?: string;
  }, { getState, rejectWithValue }) => {
    try {
      const token = getAuthToken(getState() as RootState);
      if (!token) {
        return rejectWithValue('No authentication token');
      }

      const response = await fetch('/api/proxy/v1/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(accountData),
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error?.message || 'Failed to create account');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      return rejectWithValue('Network error occurred');
    }
  }
);

export const depositFunds = createAsyncThunk(
  'portfolio/depositFunds',
  async (depositData: {
    accountId: string;
    amount: number;
    currency?: string;
  }, { getState, rejectWithValue }) => {
    try {
      const token = getAuthToken(getState() as RootState);
      if (!token) {
        return rejectWithValue('No authentication token');
      }

      const response = await fetch(`/api/proxy/v1/accounts/${depositData.accountId}/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: depositData.amount,
          currency: depositData.currency || 'USD',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error?.message || 'Failed to deposit funds');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      return rejectWithValue('Network error occurred');
    }
  }
);

export const withdrawFunds = createAsyncThunk(
  'portfolio/withdrawFunds',
  async (withdrawData: {
    accountId: string;
    amount: number;
    currency?: string;
  }, { getState, rejectWithValue }) => {
    try {
      const token = getAuthToken(getState() as RootState);
      if (!token) {
        return rejectWithValue('No authentication token');
      }

      const response = await fetch(`/api/proxy/v1/accounts/${withdrawData.accountId}/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: withdrawData.amount,
          currency: withdrawData.currency || 'USD',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error?.message || 'Failed to withdraw funds');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      return rejectWithValue('Network error occurred');
    }
  }
);

export const portfolioSlice = createSlice({
  name: 'portfolio',
  initialState,
  reducers: {
    setSelectedAccount: (state, action: PayloadAction<string>) => {
      state.selectedAccountId = action.payload;
    },
    updateBalance: (state, action: PayloadAction<Balance>) => {
      const index = state.balances.findIndex(
        balance => balance.id === action.payload.id
      );
      if (index !== -1) {
        state.balances[index] = action.payload;
      } else {
        state.balances.push(action.payload);
      }
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch accounts
      .addCase(fetchAccounts.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchAccounts.fulfilled, (state, action) => {
        state.isLoading = false;
        state.accounts = action.payload;
        // Set first account as selected if none selected
        if (!state.selectedAccountId && action.payload.length > 0) {
          state.selectedAccountId = action.payload[0].id;
        }
      })
      .addCase(fetchAccounts.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Fetch account balances
      .addCase(fetchAccountBalances.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchAccountBalances.fulfilled, (state, action) => {
        state.isLoading = false;
        state.balances = action.payload;
        // Calculate total value
        state.totalValue = action.payload.reduce(
          (total: number, balance: Balance) => total + parseFloat(balance.balance.toString()),
          0
        );
      })
      .addCase(fetchAccountBalances.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Create account
      .addCase(createAccount.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createAccount.fulfilled, (state, action) => {
        state.isLoading = false;
        state.accounts.push(action.payload);
        // Set as selected if it's the first account
        if (state.accounts.length === 1) {
          state.selectedAccountId = action.payload.id;
        }
      })
      .addCase(createAccount.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Deposit funds
      .addCase(depositFunds.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(depositFunds.fulfilled, (state, action) => {
        state.isLoading = false;
        // Update balance in state
        const index = state.balances.findIndex(
          balance => balance.id === action.payload.balance.id
        );
        if (index !== -1) {
          state.balances[index] = action.payload.balance;
        }
      })
      .addCase(depositFunds.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Withdraw funds
      .addCase(withdrawFunds.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(withdrawFunds.fulfilled, (state, action) => {
        state.isLoading = false;
        // Update balance in state
        const index = state.balances.findIndex(
          balance => balance.id === action.payload.balance.id
        );
        if (index !== -1) {
          state.balances[index] = action.payload.balance;
        }
      })
      .addCase(withdrawFunds.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});