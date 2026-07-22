'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import { formatPkr } from '@/lib/money';
import { useCartStore } from '@/store/cart';

export default function CheckoutPage() {
  return (
    <RequireAuth role="customer">
      <CheckoutInner />
    </RequireAuth>
  );
}

function CheckoutInner() {
  const cart = useCartStore();
  const clear = useCartStore((s) => s.clear);
  const router = useRouter();
  const [paymentType, setPaymentType] = useState<'COD' | 'Card'>('COD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const place = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ orderId: string; status: string; total: string }>('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ paymentType }),
      });
      clear();
      router.push(`/orders/${res.orderId}`);
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Order failed');
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <h1>Checkout</h1>
      <p>
        Items: {cart.itemCount} · Total: <strong>{formatPkr(cart.total)}</strong>
      </p>
      <div className="field">
        <label htmlFor="payment">Payment type</label>
        <select
          id="payment"
          value={paymentType}
          onChange={(e) => setPaymentType(e.target.value as 'COD' | 'Card')}
        >
          <option value="COD">Cash on Delivery</option>
          <option value="Card">Card</option>
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      <button type="button" className="btn" disabled={loading || cart.itemCount === 0} onClick={() => void place()}>
        {loading ? 'Placing…' : 'Place Order'}
      </button>
    </div>
  );
}
