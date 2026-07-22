'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import { formatPkr } from '@/lib/money';
import { useCartStore } from '@/store/cart';

export default function CartPage() {
  return (
    <RequireAuth role="customer">
      <CartInner />
    </RequireAuth>
  );
}

function CartInner() {
  const cart = useCartStore();
  const setCart = useCartStore((s) => s.setCart);
  const router = useRouter();

  useEffect(() => {
    void apiFetch<{ items: typeof cart.items; total: string; itemCount: number }>('/cart')
      .then(setCart)
      .catch(() => undefined);
  }, [setCart]);

  const updateQty = async (productId: string, variantId: string, quantity: number) => {
    const next = await apiFetch<{ items: typeof cart.items; total: string; itemCount: number }>(
      '/cart/items',
      {
        method: 'PATCH',
        body: JSON.stringify({ productId, variantId, quantity }),
      },
    );
    setCart(next);
  };

  const remove = async (productId: string, variantId: string) => {
    const next = await apiFetch<{ items: typeof cart.items; total: string; itemCount: number }>(
      '/cart/items',
      {
        method: 'DELETE',
        body: JSON.stringify({ productId, variantId }),
      },
    );
    setCart(next);
  };

  return (
    <div className="panel">
      <h1>Cart</h1>
      {cart.items.length === 0 ? (
        <p className="muted">
          Cart is empty. <Link href="/menu">Browse menu</Link>
        </p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {cart.items.map((i) => (
              <li
                key={`${i.productId}:${i.variantId}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '0.6rem 0',
                  borderBottom: '1px solid var(--erp-border)',
                }}
              >
                <div>
                  <strong>{i.label}</strong>
                  <div className="muted">
                    {formatPkr(i.unitPrice)} × {i.quantity}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="number"
                    min={1}
                    value={i.quantity}
                    style={{ width: 64 }}
                    onChange={(e) =>
                      void updateQty(i.productId, i.variantId, Number(e.target.value) || 1)
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void remove(i.productId, i.variantId)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p style={{ fontWeight: 700 }}>Total: {formatPkr(cart.total)}</p>
          <button type="button" className="btn" onClick={() => router.push('/checkout')}>
            Checkout
          </button>
        </>
      )}
    </div>
  );
}
