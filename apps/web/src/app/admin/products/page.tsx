'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { formatPkr } from '@/lib/money';

type Product = {
  id: string;
  name: string;
  isActive: boolean;
  imageUrl?: string | null;
  variants: Array<{ label: string; price: string }>;
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    void apiFetch<{ products: Product[] }>('/catalog/products?page=1&limit=50')
      .then((r) => setProducts(r.products ?? []))
      .catch(() => setProducts([]));
  }, []);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title mb-0">Products</h3>
        <div className="card-tools">
          <Link className="btn btn-primary btn-sm" href="/admin/products/new">
            New product
          </Link>
        </div>
      </div>
      <div className="card-body table-responsive p-0">
        <table className="table table-striped mb-0">
          <thead>
            <tr>
              <th style={{ width: 72 }}>Image</th>
              <th>Name</th>
              <th>Variants</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      p.imageUrl ||
                      `https://picsum.photos/seed/foodapp-admin-${p.id.slice(0, 8)}/80/80`
                    }
                    alt=""
                    width={48}
                    height={48}
                    style={{ objectFit: 'cover', borderRadius: 6 }}
                  />
                </td>
                <td>
                  <strong>{p.name}</strong>
                </td>
                <td className="text-muted">
                  {p.variants.map((v) => `${v.label} ${formatPkr(v.price)}`).join(' · ')}
                </td>
                <td>
                  <span className={`badge badge-${p.isActive ? 'success' : 'secondary'}`}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <Link className="btn btn-sm btn-outline-secondary" href={`/admin/products/${p.id}`}>
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
