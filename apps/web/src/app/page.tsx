'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import MenuPage from './menu/page';

/** Customer home: brand hero + menu. Admins are redirected by middleware to /admin. */
export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  if (isAdmin) {
    return null;
  }

  return (
    <div>
      <section className="hero">
        <div className="hero__content">
          <p className="muted" style={{ color: 'rgba(255,255,255,0.75)', margin: '0 0 4px', fontWeight: 700, fontSize: '0.8rem' }}>
            Neighborhood kitchen · delivered hot
          </p>
          <h1 className="hero__brand">Food Order App</h1>
          <p className="hero__lead">
            Order tonight&apos;s favorites in minutes — fresh plates, clear prices, live order tracking.
          </p>
          <div className="hero__actions">
            <Link className="btn" href="/menu">
              Browse menu
            </Link>
            {!user && (
              <Link className="btn btn-ghost" href="/auth/register" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.45)' }}>
                Create account
              </Link>
            )}
          </div>
        </div>
      </section>
      <div className="section-head">
        <div>
          <p className="muted" style={{ margin: 0, fontWeight: 700 }}>
            Popular tonight
          </p>
          <h2>From the kitchen</h2>
        </div>
      </div>
      <MenuPage embedded />
    </div>
  );
}
