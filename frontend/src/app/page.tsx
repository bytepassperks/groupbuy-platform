'use client';

import Link from 'next/link';
import Image from 'next/image';
import Button from '@/components/ui/Button';
import { Shield, Zap, Users, Lock, Monitor, Apple, Smartphone, Download, Chrome } from 'lucide-react';

export default function Home() {
  const features = [
    { icon: Shield, title: 'Secure Access', description: 'Your credentials are encrypted with AES-256 and never exposed to users.' },
    { icon: Zap, title: 'Instant Access', description: 'Get immediate access to premium tools through our secure desktop and mobile apps.' },
    { icon: Users, title: 'Group Buying', description: 'Share costs with others and access premium tools at a fraction of the price.' },
    { icon: Lock, title: 'Privacy First', description: 'Credentials are completely hidden - no way to view or steal them.' },
  ];

  const downloadBaseUrl = 'https://github.com/bytepassperks/groupbuy-platform/releases/download/v2.0.0';

  return (
    <div>
      <section className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <Image src="/logo.png" alt="EliteAccess" width={100} height={100} className="rounded-2xl shadow-lg" />
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Premium Tools at <span className="text-amber-400">Affordable Prices</span>
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 mb-8 max-w-3xl mx-auto">
              Access Semrush, Ahrefs, Canva Pro, and more through our secure premium access platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/products">
                <Button size="lg" className="bg-amber-500 text-gray-900 hover:bg-amber-400 font-semibold">Browse Products</Button>
              </Link>
              <Link href="/register">
                <Button size="lg" className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-blue-900">Get Started Free</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Why Choose EliteAccess?</h2>
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
              { num: '3', title: 'Download & Access', desc: 'Download our secure app for your platform and enter your access code to start using your tools.' },
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

      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Download Our Apps</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">Access your subscriptions securely on any device with our dedicated applications.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <a 
              href={`${downloadBaseUrl}/EliteAccess-Setup-Windows.exe`}
              className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow text-center group"
            >
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-200 transition-colors">
                <Chrome className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">EliteAccess</h3>
              <p className="text-sm text-gray-600 mb-4">Windows - Recommended</p>
              <span className="inline-flex items-center text-blue-600 font-medium">
                <Download className="w-4 h-4 mr-2" />
                Download
              </span>
            </a>
            <a 
              href={`${downloadBaseUrl}/EliteAccess-Setup-macOS.dmg`}
              className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow text-center group"
            >
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-gray-200 transition-colors">
                <Apple className="w-8 h-8 text-gray-800" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">EliteAccess</h3>
              <p className="text-sm text-gray-600 mb-4">macOS</p>
              <span className="inline-flex items-center text-blue-600 font-medium">
                <Download className="w-4 h-4 mr-2" />
                Download
              </span>
            </a>
            <a 
              href={`${downloadBaseUrl}/EliteAccess-Linux.AppImage`}
              className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow text-center group"
            >
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-purple-200 transition-colors">
                <Monitor className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">EliteAccess</h3>
              <p className="text-sm text-gray-600 mb-4">Linux / Chromebook</p>
              <span className="inline-flex items-center text-blue-600 font-medium">
                <Download className="w-4 h-4 mr-2" />
                Download
              </span>
            </a>
            <a 
              href={`${downloadBaseUrl}/EliteAccess.apk`}
              className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow text-center group"
            >
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-green-200 transition-colors">
                <Smartphone className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">EliteAccess</h3>
              <p className="text-sm text-gray-600 mb-4">Android</p>
              <span className="inline-flex items-center text-blue-600 font-medium">
                <Download className="w-4 h-4 mr-2" />
                Download
              </span>
            </a>
          </div>
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">All apps feature maximum security: credentials are completely hidden, DevTools disabled, and auto-logout on close.</p>
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
