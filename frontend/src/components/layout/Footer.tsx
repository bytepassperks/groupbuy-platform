'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="text-2xl font-bold text-white">
              GroupBuy
            </Link>
            <p className="mt-4 text-sm">
              Access premium tools and services at a fraction of the cost through our secure group buying platform.
            </p>
          </div>
          
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Quick Links</h3>
            <ul className="mt-4 space-y-2">
              <li>
                <Link href="/products" className="text-sm hover:text-white">Products</Link>
              </li>
              <li>
                <Link href="/pricing" className="text-sm hover:text-white">Pricing</Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-sm hover:text-white">Dashboard</Link>
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Legal</h3>
            <ul className="mt-4 space-y-2">
              <li>
                <Link href="/privacy" className="text-sm hover:text-white">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm hover:text-white">Terms of Service</Link>
              </li>
              <li>
                <Link href="/contact" className="text-sm hover:text-white">Contact Us</Link>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t border-gray-800 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} GroupBuy. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
