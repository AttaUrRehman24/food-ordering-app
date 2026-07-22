'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { formatPkr } from '@/lib/money';

type OrderRow = {
  id: string;
  userId?: string;
  total: string;
  status: string;
  paymentType: string;
  createdAt: string;
  itemCount: number;
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ orders: OrderRow[]; total: number }>('/admin/orders?page=1&limit=50')
      .then((r) => {
        setOrders(r.orders ?? []);
        setTotal(r.total ?? 0);
        setError(null);
      })
      .catch((e) => {
        setOrders([]);
        setError((e as { message?: string }).message ?? 'Failed to load orders');
      });
  }, []);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title mb-0">Orders</h3>
        <div className="card-tools">
          <span className="badge badge-primary">{total} total</span>
        </div>
      </div>
      <div className="card-body table-responsive p-0">
        {error && <p className="p-3 text-danger mb-0">{error}</p>}
        <table className="table table-hover text-nowrap mb-0">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Items</th>
              <th>Total</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && !error ? (
              <tr>
                <td colSpan={8} className="text-muted p-4">
                  No orders yet.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <code>{o.id.slice(0, 8)}…</code>
                  </td>
                  <td>
                    <code>{(o.userId ?? '').slice(0, 8)}…</code>
                  </td>
                  <td>
                    <span className={`badge badge-${statusTone(o.status)}`}>{o.status}</span>
                  </td>
                  <td>{o.paymentType}</td>
                  <td>{o.itemCount}</td>
                  <td>{formatPkr(o.total)}</td>
                  <td>{new Date(o.createdAt).toLocaleString()}</td>
                  <td>
                    <Link className="btn btn-sm btn-outline-primary" href={`/admin/orders/${o.id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusTone(status: string): string {
  switch (status) {
    case 'paid':
      return 'success';
    case 'pending':
      return 'warning';
    case 'failed':
    case 'cancelled':
      return 'danger';
    default:
      return 'secondary';
  }
}
