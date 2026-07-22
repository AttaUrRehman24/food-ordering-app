'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { formatPkr } from '@/lib/money';
import { useAuthStore } from '@/store/auth';
import { useCartStore } from '@/store/cart';

type Product = {
  id: string;
  name: string;
  description: string;
  imageUrl?: string | null;
  variants: Array<{ id: string; label: string; price: string; isActive: boolean }>;
};

export default function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const user = useAuthStore((s) => s.user);
  const optimisticAdd = useCartStore((s) => s.optimisticAdd);
  const setCart = useCartStore((s) => s.setCart);
  const router = useRouter();

  useEffect(() => {
    if (user?.role === 'admin') {
      router.replace('/admin/orders');
    }
  }, [user, router]);

  useEffect(() => {
    void apiFetch<Product>(`/catalog/products/${productId}`).then(setProduct).catch(() => setProduct(null));
  }, [productId]);

  if (!product) {
    return <p className="muted">Loading product…</p>;
  }

  const img =
    product.imageUrl ||
    `https://picsum.photos/seed/foodapp-detail-${product.id.slice(0, 8)}/960/640`;

  return (
    <div className="panel" style={{ overflow: 'hidden', padding: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 0 }}>
        <div style={{ minHeight: 320, background: '#ddd' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
        <div style={{ padding: '1.4rem 1.5rem' }}>
          <Link href="/menu" className="muted">
            ← Back to menu
          </Link>
          <h1 style={{ marginTop: 8 }}>{product.name}</h1>
          <p className="muted">{product.description}</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {product.variants
              .filter((v) => v.isActive)
              .map((v) => (
                <li
                  key={v.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 10,
                    paddingBottom: 10,
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <span>
                    {v.label} — <strong>{formatPkr(v.price)}</strong>
                  </span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      if (!user) {
                        router.push('/auth/login');
                        return;
                      }
                      if (user.role === 'admin') {
                        return;
                      }
                      optimisticAdd({
                        productId: product.id,
                        variantId: v.id,
                        label: `${product.name} (${v.label})`,
                        unitPrice: v.price,
                        quantity: 1,
                      });
                      void apiFetch('/cart/items', {
                        method: 'POST',
                        body: JSON.stringify({
                          productId: product.id,
                          variantId: v.id,
                          quantity: 1,
                        }),
                      }).then((cart) => setCart(cart as never));
                    }}
                  >
                    Add to cart
                  </button>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
