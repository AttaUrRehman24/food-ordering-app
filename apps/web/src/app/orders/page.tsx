'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import { formatPkr } from '@/lib/money';

type OrderSummary = {
  id: string;
  total: string;
  status: string;
  paymentType: string;
  createdAt: string;
  itemCount: number;
};

export default function OrdersPage() {
  return (
    <RequireAuth role="customer">
      <OrdersInner />
    </RequireAuth>
  );
}

function OrdersInner() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);

  useEffect(() => {
    void apiFetch<{ orders: OrderSummary[] }>('/orders?page=1&limit=20')
      .then((r) => setOrders(r.orders ?? []))
      .catch(() => setOrders([]));
  }, []);

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1 style={{ marginTop: 0 }}>My Orders</h1>
        <Link href="/dashboard">← Back</Link>
      </div>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {orders.map((o) => (
          <li
            key={o.id}
            style={{
              borderTop: '1px solid var(--erp-border)',
              padding: '0.85rem 0',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <strong>{o.id}</strong>{' '}
              <span className={`badge badge-${o.status}`}>{o.status}</span>
              <div className="muted">
                {new Date(o.createdAt).toLocaleString()} · {o.itemCount} items · {formatPkr(o.total)} ·{' '}
                {o.paymentType}
              </div>
            </div>
            <Link className="btn btn-ghost" href={`/orders/${o.id}`}>
              View Detail
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
