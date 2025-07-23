import Link from 'next/link';
import { ReactNode } from 'react';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-600 to-primary-800 relative">
        <div className="absolute inset-0 bg-black opacity-20"></div>
        <div className="relative flex flex-col justify-center px-12 text-white">
          <div className="max-w-md">
            <Link href="/" className="inline-block mb-8">
              <h1 className="text-3xl font-bold">Trading Exchange</h1>
            </Link>
            <h2 className="text-4xl font-bold mb-6">
              Trade with Confidence
            </h2>
            <p className="text-xl text-primary-100 mb-8">
              Join thousands of traders who trust our secure, fast, and reliable platform 
              for their investment needs.
            </p>
            <div className="space-y-4">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-primary-300 rounded-full mr-3"></div>
                <span>Bank-level security</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-primary-300 rounded-full mr-3"></div>
                <span>Real-time trading</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-primary-300 rounded-full mr-3"></div>
                <span>24/7 support</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <Link href="/" className="inline-block">
              <h1 className="text-2xl font-bold text-primary-600">Trading Exchange</h1>
            </Link>
          </div>

          <div>
            <h2 className="text-3xl font-extrabold text-gray-900">{title}</h2>
            {subtitle && (
              <p className="mt-2 text-sm text-gray-600">{subtitle}</p>
            )}
          </div>

          <div className="mt-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}