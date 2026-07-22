'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { formatPkr } from '@/lib/money';

type OrderDetail = {
  id: string;
  userId: string;
  total: string;
  paymentType: string;
  status: string;
  createdAt: string;
  items: Array<{
    id: string;
    productNameSnapshot: string;
    variantLabelSnapshot: string;
    unitPriceSnapshot: string;
    quantity: number;
  }>;
  statusHistory: Array<{ id: string; status: string; at: string }>;
};

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) {
      return;
    }
    void apiFetch<OrderDetail>(`/admin/orders/${params.id}`)
      .then(setOrder)
      .catch((e) => setError((e as { message?: string }).message ?? 'Not found'));
  }, [params?.id]);

  if (error) {
    return <div className="alert alert-danger">{error}</div>;
  }
  if (!order) {
    return <p className="text-muted">Loading…</p>;
  }

  return (
    <div>
      <p>
        <Link href="/admin/orders">← Back to orders</Link>
      </p>
      <div className="card card-primary card-outline">
        <div className="card-header">
          <h3 className="card-title">Order {order.id}</h3>
        </div>
        <div className="card-body">
          <dl className="row mb-0">
            <dt className="col-sm-3">Customer</dt>
            <dd className="col-sm-9">
              <code>{order.userId}</code>
            </dd>
            <dt className="col-sm-3">Status</dt>
            <dd className="col-sm-9">{order.status}</dd>
            <dt className="col-sm-3">Payment</dt>
            <dd className="col-sm-9">{order.paymentType}</dd>
            <dt className="col-sm-3">Total</dt>
            <dd className="col-sm-9">{formatPkr(order.total)}</dd>
            <dt className="col-sm-3">Created</dt>
            <dd className="col-sm-9">{new Date(order.createdAt).toLocaleString()}</dd>
          </dl>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Items</h3>
        </div>
        <div className="card-body table-responsive p-0">
          <table className="table mb-0">
            <thead>
              <tr>
                <th>Product</th>
                <th>Variant</th>
                <th>Qty</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.productNameSnapshot}</td>
                  <td>{i.variantLabelSnapshot}</td>
                  <td>{i.quantity}</td>
                  <td>{formatPkr(i.unitPriceSnapshot)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Status history</h3>
        </div>
        <div className="card-body">
          <ul className="mb-0">
            {order.statusHistory.map((h) => (
              <li key={h.id}>
                <strong>{h.status}</strong> · {new Date(h.at).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
