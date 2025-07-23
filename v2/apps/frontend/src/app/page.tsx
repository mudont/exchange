import { Metadata } from 'next';
import Link from 'next/link';
import { 
  ChartBarIcon, 
  CurrencyDollarIcon, 
  ShieldCheckIcon,
  BoltIcon,
  GlobeAltIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';

export const metadata: Metadata = {
  title: 'Trading Exchange - Modern Trading Platform',
  description: 'Experience the future of trading with our secure, fast, and reliable exchange platform.',
};

const features = [
  {
    name: 'Real-time Trading',
    description: 'Execute trades instantly with our high-performance matching engine.',
    icon: BoltIcon,
  },
  {
    name: 'Advanced Analytics',
    description: 'Make informed decisions with comprehensive market data and charts.',
    icon: ChartBarIcon,
  },
  {
    name: 'Secure & Compliant',
    description: 'Bank-level security with full regulatory compliance.',
    icon: ShieldCheckIcon,
  },
  {
    name: 'Multiple Assets',
    description: 'Trade stocks, options, futures, forex, and cryptocurrencies.',
    icon: CurrencyDollarIcon,
  },
  {
    name: 'Global Access',
    description: 'Access markets worldwide with 24/7 trading capabilities.',
    icon: GlobeAltIcon,
  },
  {
    name: 'Community',
    description: 'Join thousands of traders in our vibrant community.',
    icon: UserGroupIcon,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <h1 className="text-2xl font-bold text-primary-600">
                  Trading Exchange
                </h1>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/auth/login"
                className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium"
              >
                Sign In
              </Link>
              <Link
                href="/auth/register"
                className="btn-primary btn-sm"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative bg-gradient-to-r from-primary-600 to-primary-800">
        <div className="absolute inset-0 bg-black opacity-20"></div>
        <div className="relative max-w-7xl mx-auto py-24 px-4 sm:py-32 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Trade with Confidence
          </h1>
          <p className="mt-6 text-xl text-primary-100 max-w-3xl">
            Experience the next generation of trading with our secure, fast, and intuitive platform. 
            Join thousands of traders who trust us with their investments.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <Link
              href="/auth/register"
              className="btn-lg bg-white text-primary-600 hover:bg-gray-50 focus:ring-white"
            >
              Start Trading Now
            </Link>
            <Link
              href="/demo"
              className="btn-lg border-2 border-white text-white hover:bg-white hover:text-primary-600 focus:ring-white"
            >
              Try Demo
            </Link>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-primary-600 font-semibold tracking-wide uppercase">
              Features
            </h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Everything you need to trade successfully
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
              Our platform combines cutting-edge technology with user-friendly design to deliver 
              the ultimate trading experience.
            </p>
          </div>

          <div className="mt-20">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.name} className="relative">
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary-500 text-white">
                    <feature.icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div className="ml-16">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      {feature.name}
                    </h3>
                    <p className="mt-2 text-base text-gray-500">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-primary-50">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:py-16 lg:px-8 lg:flex lg:items-center lg:justify-between">
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            <span className="block">Ready to start trading?</span>
            <span className="block text-primary-600">Create your account today.</span>
          </h2>
          <div className="mt-8 flex lg:mt-0 lg:flex-shrink-0">
            <div className="inline-flex rounded-md shadow">
              <Link
                href="/auth/register"
                className="btn-primary btn-lg"
              >
                Get Started
              </Link>
            </div>
            <div className="ml-3 inline-flex rounded-md shadow">
              <Link
                href="/auth/login"
                className="btn-secondary btn-lg"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-800">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <h3 className="text-2xl font-bold text-white mb-4">
                Trading Exchange
              </h3>
              <p className="text-gray-300 max-w-md">
                The most trusted and secure trading platform for modern investors. 
                Trade with confidence, backed by institutional-grade technology.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Platform</h4>
              <ul className="space-y-2">
                <li><Link href="/trading" className="text-gray-300 hover:text-white">Trading</Link></li>
                <li><Link href="/markets" className="text-gray-300 hover:text-white">Markets</Link></li>
                <li><Link href="/portfolio" className="text-gray-300 hover:text-white">Portfolio</Link></li>
                <li><Link href="/api" className="text-gray-300 hover:text-white">API</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-2">
                <li><Link href="/help" className="text-gray-300 hover:text-white">Help Center</Link></li>
                <li><Link href="/contact" className="text-gray-300 hover:text-white">Contact Us</Link></li>
                <li><Link href="/status" className="text-gray-300 hover:text-white">System Status</Link></li>
                <li><Link href="/security" className="text-gray-300 hover:text-white">Security</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-700">
            <p className="text-gray-400 text-center">
              © 2024 Trading Exchange. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}