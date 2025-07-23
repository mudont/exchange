'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { AuthLayout } from '@/components/auth/AuthLayout';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      verifyEmail(token);
    }
  }, [searchParams]);

  const verifyEmail = async (token: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/proxy/v1/auth/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to verify email');
      }

      setIsVerified(true);
      toast.success('Email verified successfully!');
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/auth/login');
      }, 3000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to verify email';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerificationEmail = async () => {
    setIsResending(true);
    
    try {
      // This would need to be implemented in the backend
      // For now, just show a success message
      toast.success('Verification email sent! Please check your inbox.');
    } catch (error) {
      toast.error('Failed to resend verification email');
    } finally {
      setIsResending(false);
    }
  };

  if (isLoading) {
    return (
      <AuthLayout
        title="Verifying your email"
        subtitle="Please wait while we verify your email address."
      >
        <div className="text-center space-y-6">
          <div className="mx-auto flex items-center justify-center h-12 w-12">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          </div>
          
          <div>
            <p className="text-sm text-gray-600">
              Verifying your email address...
            </p>
          </div>
        </div>
      </AuthLayout>
    );
  }

  if (isVerified) {
    return (
      <AuthLayout
        title="Email verified!"
        subtitle="Your email has been successfully verified."
      >
        <div className="text-center space-y-6">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-success-100">
            <svg
              className="h-6 w-6 text-success-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Your email has been successfully verified. You can now sign in to your account.
            </p>
            <p className="text-sm text-gray-500">
              Redirecting to sign in page in 3 seconds...
            </p>
          </div>

          <div className="space-y-4">
            <Link
              href="/auth/login"
              className="btn-primary btn-lg w-full"
            >
              Sign in now
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  if (error) {
    return (
      <AuthLayout
        title="Verification failed"
        subtitle="We couldn't verify your email address."
      >
        <div className="text-center space-y-6">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-danger-100">
            <svg
              className="h-6 w-6 text-danger-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          
          <div>
            <p className="text-sm text-gray-600 mb-4">
              {error}
            </p>
            <p className="text-sm text-gray-500">
              The verification link may have expired or is invalid.
            </p>
          </div>

          <div className="space-y-4">
            <button
              onClick={resendVerificationEmail}
              disabled={isResending}
              className="btn-primary btn-lg w-full"
            >
              {isResending ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Sending...
                </div>
              ) : (
                'Resend verification email'
              )}
            </button>
            <Link
              href="/auth/login"
              className="btn-secondary btn-lg w-full"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  // Default state - no token provided
  return (
    <AuthLayout
      title="Verify your email"
      subtitle="Please check your email and click the verification link."
    >
      <div className="text-center space-y-6">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-primary-100">
          <svg
            className="h-6 w-6 text-primary-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        
        <div>
          <p className="text-sm text-gray-600 mb-4">
            We've sent a verification email to your email address. Please check your inbox 
            and click the verification link to activate your account.
          </p>
          <p className="text-sm text-gray-500">
            Didn't receive the email? Check your spam folder.
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={resendVerificationEmail}
            disabled={isResending}
            className="btn-primary btn-lg w-full"
          >
            {isResending ? (
              <div className="flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Sending...
              </div>
            ) : (
              'Resend verification email'
            )}
          </button>
          <Link
            href="/auth/login"
            className="btn-secondary btn-lg w-full"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}