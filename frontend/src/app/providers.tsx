'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth';

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const previousUserIdRef = useRef<number | null>(null);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Clear cache when user changes (login/logout)
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (previousUserIdRef.current !== null && previousUserIdRef.current !== currentUserId) {
      // User changed, clear all queries
      queryClient.clear();
    }
    previousUserIdRef.current = currentUserId;
  }, [user?.id, queryClient]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: 1,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>{children}</AuthInitializer>
    </QueryClientProvider>
  );
}
