'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { toast } from 'react-hot-toast';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { AppDispatch } from '@/store';
import { authSlice } from '@/store/slices/authSlice';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useDispatch<AppDispatch>();
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const processCallback = async () => {
      const token = searchParams.get('token');
      const error = searchParams.get('error');

      if (error) {
        let errorMessage = 'Authentication failed';
        
        switch (error) {
          case 'oauth_error':
            errorMessage = 'OAuth authentication failed. Please try again.';
            break;
          case 'oauth_cancelled':
            errorMessage = 'OAuth authentication was cancelled.';
            break;
          case 'account_exists':
            errorMessage = 'An account with this email already exists. Please sign in instead.';
            break;
          default:
            errorMessage = 'Authentication failed. Please try again.';
        }
        
        toast.error(errorMessage);
        router.push('/auth/login');
        return;
      }

      if (!token) {
        toast.error('No authentication token received');
        router.push('/auth/login');
        return;
      }

      try {
        // Store the token and set authentication state
        localStorage.setItem('auth_token', token);
        dispatch(authSlice.actions.setToken(token));
        
        // Fetch user data
        const response = await fetch('/api/proxy/v1/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user data');
        }

        const userData = await response.json();
        
        // Update auth state with user data
        dispatch(authSlice.actions.setToken(token));
        
        toast.success('Successfully signed in!');
        
        // Redirect to dashboard or intended page
        const redirect = searchParams.get('redirect') || '/dashboard';
        router.push(redirect);
        
      } catch (error) {
        console.error('Callback processing error:', error);
        toast.error('Failed to complete authentication');
        localStorage.removeItem('auth_token');
        router.push('/auth/login');
      } finally {
        setIsProcessing(false);
      }
    };

    processCallback();
  }, [searchParams, router, dispatch]);

  return (
    <AuthLayout
      title="Completing sign in"
      subtitle="Please wait while we complete your authentication."
    >
      <div className="text-center space-y-6">
        <div className="mx-auto flex items-center justify-center h-12 w-12">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
        </div>
        
        <div>
          <p className="text-sm text-gray-600">
            {isProcessing ? 'Processing your authentication...' : 'Redirecting...'}
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}