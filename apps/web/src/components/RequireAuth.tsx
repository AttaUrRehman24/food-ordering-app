'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { silentRefresh } from '@/lib/api';

export function RequireAuth({
  children,
  role,
}: {
  children: ReactNode;
  role?: 'customer' | 'admin';
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!accessToken) {
        const ok = await silentRefresh();
        if (!ok && !cancelled) {
          router.replace(`/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
      }
      if (!cancelled) {
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, router]);

  useEffect(() => {
    if (!ready || !user || !role) {
      return;
    }
    if (role === 'admin' && user.role !== 'admin') {
      router.replace('/menu');
    }
    if (role === 'customer' && user.role !== 'customer') {
      router.replace(user.role === 'admin' ? '/admin/orders' : '/auth/login');
    }
  }, [ready, user, role, router]);

  if (!ready || !user) {
    return <p className="muted" style={{ padding: '2rem' }}>Loading session…</p>;
  }
  if (role === 'admin' && user.role !== 'admin') {
    return <p style={{ padding: '2rem' }}>403 — Admin only</p>;
  }
  if (role === 'customer' && user.role !== 'customer') {
    return <p style={{ padding: '2rem' }}>403 — Customers only</p>;
  }
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    void silentRefresh();
  }, []);
  return <>{children}</>;
}
