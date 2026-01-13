'use client';

import Link from 'next/link';
import Button from '@/components/ui/Button';
import { Shield, Zap, Users, Lock } from 'lucide-react';

export default function Home() {
  const features = [
    { icon: Shield, title: 'Secure Access', description: 'Your credentials are encrypted with AES-256 and never exposed to users.' },
    { icon: Zap, title: 'Instant Access', description: 'Get immediate access to premium tools through our browser extension.' },
    { icon: Users, title: 'Group Buying', description: 'Share costs with others and access premium tools at a fraction of the price.' },
    { icon: Lock, title: 'Privacy First', description: 'Credentials auto-fill without ever being visible to you.' },
  ];

  return (
    <div>
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Premium Tools at <span className="text-blue-200">Affordable Prices</span>
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 mb-8 max-w-3xl mx-auto">
              Access Semrush, Ahrefs, Canva Pro, and more through our secure group buying platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/products">
                <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50">Browse Products</Button>
              </Link>
              <Link href="/register">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-blue-700">Get Started Free</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Why Choose GroupBuy?</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">We provide secure, affordable access to premium tools without compromising on security or quality.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-white p-6 rounded-lg shadow-md text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { num: '1', title: 'Choose a Product', desc: 'Browse our catalog of premium tools and select the one you need.' },
              { num: '2', title: 'Complete Purchase', desc: 'Pay securely and receive your unique access code instantly.' },
              { num: '3', title: 'Access via Extension', desc: 'Install our browser extension and enjoy automatic login to your tools.' },
            ].map((step) => (
              <div key={step.num} className="text-center">
                <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">{step.num}</div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-xl text-blue-100 mb-8">Join thousands of users saving money on premium tools.</p>
          <Link href="/register">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50">Create Free Account</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
