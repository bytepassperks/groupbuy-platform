'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { adminApi } from '@/lib/api';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import { Users, Package, DollarSign, Activity, ArrowRight } from 'lucide-react';

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== 'admin')) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, user, router]);

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => adminApi.getDashboard(),
    enabled: isAuthenticated && user?.role === 'admin',
  });

  const stats = dashboardData?.data || {
    totalUsers: 0,
    totalProducts: 0,
    totalRevenue: 0,
    activePurchases: 0,
    recentPurchases: [],
    recentUsers: [],
  };

  if (authLoading || !isAuthenticated || user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const statCards = [
    { title: 'Total Users', value: stats.totalUsers, icon: Users, color: 'blue' },
    { title: 'Total Products', value: stats.totalProducts, icon: Package, color: 'green' },
    { title: 'Total Revenue', value: `$${parseFloat(stats.totalRevenue || 0).toFixed(2)}`, icon: DollarSign, color: 'purple' },
    { title: 'Active Purchases', value: stats.activePurchases, icon: Activity, color: 'orange' },
  ];

  const colorClasses: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
    green: { bg: 'bg-green-100', text: 'text-green-600' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
    orange: { bg: 'bg-orange-100', text: 'text-orange-600' },
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">Manage your platform, products, and users.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className={`w-12 h-12 ${colorClasses[stat.color].bg} rounded-lg flex items-center justify-center`}>
                  <stat.icon className={`w-6 h-6 ${colorClasses[stat.color].text}`} />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900">{isLoading ? '-' : stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/admin/products" className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center">
                  <Package className="w-5 h-5 text-blue-600 mr-3" />
                  <span className="font-medium">Manage Products</span>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
              </Link>
              <Link href="/admin/users" className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center">
                  <Users className="w-5 h-5 text-green-600 mr-3" />
                  <span className="font-medium">Manage Users</span>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
              </Link>
              <Link href="/admin/products/add" className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center">
                  <Package className="w-5 h-5 text-purple-600 mr-3" />
                  <span className="font-medium">Add New Product</span>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Recent Purchases</h2>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex items-center p-3 border rounded-lg">
                    <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                    <div className="ml-3 flex-1">
                      <div className="h-4 bg-gray-200 rounded w-1/2 mb-1"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : stats.recentPurchases?.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No recent purchases</p>
            ) : (
              <div className="space-y-3">
                {stats.recentPurchases?.slice(0, 5).map((purchase: any) => (
                  <div key={purchase.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{purchase.product_name}</p>
                      <p className="text-sm text-gray-500">{purchase.user_email}</p>
                    </div>
                    <span className="text-sm font-medium text-green-600">${parseFloat(purchase.price_paid).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
