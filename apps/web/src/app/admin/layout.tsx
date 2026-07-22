'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useCartStore } from '@/store/cart';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth role="admin">
      <AdminShell>{children}</AdminShell>
    </RequireAuth>
  );
}

function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const clearCart = useCartStore((s) => s.clear);

  useEffect(() => {
    // AdminLTE expects body classes
    document.body.classList.add('hold-transition', 'sidebar-mini', 'layout-fixed');
    return () => {
      document.body.classList.remove('hold-transition', 'sidebar-mini', 'layout-fixed');
    };
  }, []);

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

  const nav = [
    { href: '/admin/orders', label: 'Orders', icon: 'fas fa-receipt' },
    { href: '/admin/products', label: 'Products', icon: 'fas fa-utensils' },
    { href: '/admin/products/new', label: 'New product', icon: 'fas fa-plus' },
  ];

  return (
    <>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css"
      />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.4/css/all.min.css"
      />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/admin-lte@3.2/dist/css/adminlte.min.css"
      />
      <div className="wrapper" style={{ minHeight: '100vh' }}>
        <nav className="main-header navbar navbar-expand navbar-white navbar-light">
          <ul className="navbar-nav">
            <li className="nav-item">
              <span className="nav-link font-weight-bold">Food Order App Admin</span>
            </li>
          </ul>
          <ul className="navbar-nav ml-auto">
            <li className="nav-item d-none d-sm-inline-block">
              <span className="nav-link">{user?.email}</span>
            </li>
            <li className="nav-item">
              <button type="button" className="btn btn-sm btn-outline-secondary mr-2" onClick={() => void logout()}>
                Logout
              </button>
            </li>
          </ul>
        </nav>

        <aside className="main-sidebar sidebar-dark-primary elevation-4">
          <Link href="/admin/orders" className="brand-link">
            <span className="brand-text font-weight-light">Food Order App</span>
          </Link>
          <div className="sidebar">
            <nav className="mt-2">
              <ul className="nav nav-pills nav-sidebar flex-column" data-widget="treeview" role="menu">
                {nav.map((item) => (
                  <li className="nav-item" key={item.href}>
                    <Link
                      href={item.href}
                      className={`nav-link ${pathname === item.href || pathname?.startsWith(item.href + '/') ? 'active' : ''}`}
                    >
                      <i className={`nav-icon ${item.icon}`} />
                      <p>{item.label}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>

        <div className="content-wrapper" style={{ minHeight: '100vh' }}>
          <section className="content pt-3">
            <div className="container-fluid">{children}</div>
          </section>
        </div>
      </div>
    </>
  );
}
