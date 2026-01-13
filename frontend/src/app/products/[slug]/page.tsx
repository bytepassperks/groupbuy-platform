'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { productsApi, paymentsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import { ShoppingCart, Shield, Users, Clock, ExternalLink, ArrowLeft } from 'lucide-react';

interface Product {
  id: number;
  name: string;
  slug: string;
  category: string;
  icon_url?: string;
  description?: string;
  price: string;
  renewal_period: string;
  max_concurrent_users: number;
  login_url?: string;
  status: string;
  has_purchased?: boolean;
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState('');

  const slug = params.slug as string;

  const { data: productData, isLoading } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => productsApi.getBySlug(slug),
    enabled: !!slug,
  });

  const product: Product | undefined = productData?.data?.product;

  const handlePurchase = async () => {
    if (!user) {
      router.push(`/login?redirect=/products/${slug}`);
      return;
    }

    setPurchasing(true);
    setError('');

    try {
      const response = await paymentsApi.createCheckoutSession({
        productId: product!.id,
        successUrl: `${window.location.origin}/dashboard?payment=success`,
        cancelUrl: `${window.location.origin}/products/${slug}?payment=cancelled`,
      });

      if (response.data.url) {
        window.location.href = response.data.url;
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initiate purchase');
      setPurchasing(false);
    }
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      seo: 'SEO Tools',
      design: 'Design Tools',
      writing: 'Writing Tools',
      marketing: 'Marketing',
      development: 'Development',
    };
    return labels[category] || category;
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Card>
          <CardContent className="p-12 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Product Not Found</h2>
            <p className="text-gray-500 mb-6">The product you're looking for doesn't exist or has been removed.</p>
            <Button onClick={() => router.push('/products')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Browse Products
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <button
        onClick={() => router.push('/products')}
        className="flex items-center text-gray-600 hover:text-gray-900 mb-8"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Products
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-8">
              <div className="flex items-start gap-6 mb-6">
                {product.icon_url ? (
                  <img
                    src={product.icon_url}
                    alt={product.name}
                    className="w-20 h-20 rounded-xl object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <span className="text-3xl font-bold text-white">
                      {product.name.charAt(0)}
                    </span>
                  </div>
                )}
                <div className="flex-1">
                  <span className="inline-block px-3 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full mb-2">
                    {getCategoryLabel(product.category)}
                  </span>
                  <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>
                </div>
              </div>

              <div className="prose max-w-none">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Description</h3>
                <p className="text-gray-600 leading-relaxed">
                  {product.description || `Access ${product.name} premium features at a fraction of the cost through our secure group buying platform. Share access with other members while maintaining security and privacy.`}
                </p>
              </div>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                  <Shield className="w-8 h-8 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Secure Access</p>
                    <p className="text-xs text-gray-500">AES-256 Encrypted</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                  <Users className="w-8 h-8 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Shared Access</p>
                    <p className="text-xs text-gray-500">Up to {product.max_concurrent_users} users</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                  <Clock className="w-8 h-8 text-purple-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Renewal</p>
                    <p className="text-xs text-gray-500">{product.renewal_period}</p>
                  </div>
                </div>
              </div>

              {product.login_url && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-800">
                    <ExternalLink className="w-4 h-4" />
                    <span className="text-sm font-medium">Service URL:</span>
                    <a
                      href={product.login_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {product.login_url}
                    </a>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-8">
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <p className="text-sm text-gray-500 mb-1">Price</p>
                <p className="text-4xl font-bold text-gray-900">
                  ${parseFloat(product.price).toFixed(2)}
                </p>
                <p className="text-sm text-gray-500">per {product.renewal_period}</p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              {product.has_purchased ? (
                <div className="space-y-3">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm text-center">
                    You already have access to this product
                  </div>
                  <Button
                    onClick={() => router.push('/dashboard')}
                    className="w-full"
                  >
                    Go to Dashboard
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handlePurchase}
                  disabled={purchasing}
                  className="w-full"
                  size="lg"
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  {purchasing ? 'Processing...' : user ? 'Purchase Now' : 'Login to Purchase'}
                </Button>
              )}

              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">What's Included:</h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Full premium access
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Browser extension auto-login
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Secure encrypted credentials
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    24/7 access availability
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
