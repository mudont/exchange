import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { RootState, AppDispatch } from '@/store';
import { getCurrentUser, logoutUser } from '@/store/slices/authSlice';

export function useAuth() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { user, token, isAuthenticated, isLoading, error } = useSelector(
    (state: RootState) => state.auth
  );

  useEffect(() => {
    // Check for existing token on mount
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken && !user) {
      dispatch(getCurrentUser());
    }
  }, [dispatch, user]);

  const logout = async () => {
    await dispatch(logoutUser());
    router.push('/auth/login');
  };

  const requireAuth = () => {
    if (!isAuthenticated && !isLoading) {
      router.push('/auth/login');
      return false;
    }
    return true;
  };

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    error,
    logout,
    requireAuth,
  };
}