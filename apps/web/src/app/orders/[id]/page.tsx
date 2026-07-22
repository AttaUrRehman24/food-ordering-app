'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import { formatPkr } from '@/lib/money';
import { useOrderWebSocket } from '@/lib/use-order-ws';
import { useAuthStore } from '@/store/auth';

type Order = {
  id: string;
  total: string;
  paymentType: string;
  status: string;
  createdAt: string;
  items: Array<{
    productNameSnapshot: string;
    variantLabelSnapshot: string;
    unitPriceSnapshot: string;
    quantity: number;
  }>;
  statusHistory: Array<{ status: string; at: string }>;
};

export default function OrderDetailPage() {
  return (
    <RequireAuth role="customer">
      <OrderDetailInner />
    </RequireAuth>
  );
}

function OrderDetailInner() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const wsConnected = useAuthStore((s) => s.wsConnected);

  const load = useCallback(async () => {
    const data = await apiFetch<Order>(`/orders/${id}`);
    setOrder(data);
  }, [id]);

  useEffect(() => {
    void load().catch(() => setOrder(null));
  }, [load]);

  useOrderWebSocket((payload) => {
    if (String(payload.orderId) === id) {
      void load();
    }
  });

  // Article VII.5 — poll every 5s when WS disconnected
  useEffect(() => {
    if (wsConnected) {
      return;
    }
    const t = setInterval(() => {
      void load().catch(() => undefined);
    }, 5000);
    return () => clearInterval(t);
  }, [wsConnected, load]);

  if (!order) {
    return <p className="muted">Loading order…</p>;
  }

  return (
    <div className="panel">
      <Link href="/orders">← My Orders</Link>
      <h1>
        ORDER #{order.id}{' '}
        <span className={`badge badge-${order.status}`}>{order.status}</span>
      </h1>
      <p className="muted">Placed: {new Date(order.createdAt).toLocaleString()}</p>
      {!wsConnected && <p className="badge badge-pending">Live updates offline — polling</p>}

      <h2>Items</h2>
      <ul>
        {order.items.map((i, idx) => (
          <li key={idx}>
            {i.productNameSnapshot} ({i.variantLabelSnapshot}) × {i.quantity} —{' '}
            {formatPkr(Number(i.unitPriceSnapshot) * i.quantity)}
          </li>
        ))}
      </ul>

      <h2>Payment</h2>
      <p>
        Method: {order.paymentType === 'COD' ? 'Cash on Delivery' : order.paymentType}
        <br />
        Total: <strong>{formatPkr(order.total)}</strong>
      </p>

      <h2>Status History</h2>
      <ul>
        {order.statusHistory.map((h, idx) => (
          <li key={idx}>
            {new Date(h.at).toLocaleTimeString()} — {h.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
