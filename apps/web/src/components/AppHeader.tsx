'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useCartStore } from '@/store/cart';
import { apiFetch } from '@/lib/api';
import { useOrderWebSocket } from '@/lib/use-order-ws';

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const wsConnected = useAuthStore((s) => s.wsConnected);
  const clear = useAuthStore((s) => s.clear);
  const itemCount = useCartStore((s) => s.itemCount);
  const clearCart = useCartStore((s) => s.clear);

  useOrderWebSocket();

  // AdminLTE owns chrome under /admin
  if (pathname?.startsWith('/admin')) {
    return null;
  }

  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    clear();
    clearCart();
    router.push('/auth/login');
  };

  const isAdmin = user?.role === 'admin';

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href={isAdmin ? '/admin/orders' : '/'} className="brand">
          Food Order App
        </Link>
        <nav className="nav-links">
          {!isAdmin && (
            <Link href="/menu" className={pathname?.startsWith('/menu') || pathname === '/' ? 'active' : ''}>
              Menu
            </Link>
          )}
          {user && !isAdmin && <Link href="/orders">My Orders</Link>}
          {user && !isAdmin && <Link href="/dashboard">Account</Link>}
          {isAdmin && <Link href="/admin/orders">Admin</Link>}
        </nav>
        {!user ? (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link className="btn btn-ghost" href="/auth/login">
              Login
            </Link>
            <Link className="btn" href="/auth/register">
              Register
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span title={wsConnected ? 'Live updates on' : 'Live updates offline'}>
              <span className={`dot ${wsConnected ? 'on' : ''}`} />
            </span>
            <span style={{ fontWeight: 700 }}>{user.name.split(' ')[0]}</span>
            {!isAdmin && (
              <Link href="/cart" className="btn btn-ghost" style={{ fontWeight: 700 }}>
                Cart · {itemCount}
              </Link>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
