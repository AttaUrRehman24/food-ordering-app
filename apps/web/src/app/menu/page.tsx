'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { formatPkr } from '@/lib/money';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store/auth';

type Variant = { id: string; label: string; price: string; isActive: boolean };
type Product = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  variants: Variant[];
};

export default function MenuPage({ embedded = false }: { embedded?: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const optimisticAdd = useCartStore((s) => s.optimisticAdd);
  const setCart = useCartStore((s) => s.setCart);
  const rollback = useCartStore((s) => s.rollback);
  const router = useRouter();

  useEffect(() => {
    if (user?.role === 'admin') {
      router.replace('/admin/orders');
    }
  }, [user, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ products: Product[] }>('/catalog/products?page=1&limit=24');
        if (!cancelled) {
          setProducts(data.products ?? []);
          setStale(false);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as { message?: string }).message ?? 'Catalog unavailable');
          setStale(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addToCart = async (product: Product, variant: Variant) => {
    if (!user) {
      router.push('/auth/login?redirect=/menu');
      return;
    }
    if (user.role === 'admin') {
      return;
    }
    const before = {
      items: [...useCartStore.getState().items],
      total: useCartStore.getState().total,
      itemCount: useCartStore.getState().itemCount,
    };
    optimisticAdd({
      productId: product.id,
      variantId: variant.id,
      label: `${product.name} (${variant.label})`,
      unitPrice: variant.price,
      quantity: 1,
    });
    try {
      const cart = await apiFetch<{
        items: typeof before.items;
        total: string;
        itemCount: number;
      }>('/cart/items', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          variantId: variant.id,
          quantity: 1,
        }),
      });
      setCart(cart);
    } catch {
      rollback(before);
    }
  };

  return (
    <div>
      {!embedded && (
        <div className="section-head">
          <div>
            <p className="muted" style={{ margin: 0, fontWeight: 700 }}>
              Full menu
            </p>
            <h1 style={{ margin: 0 }}>Order something delicious</h1>
          </div>
          {stale && <span className="badge badge-pending">Offline catalog</span>}
        </div>
      )}
      {error && <p className="muted">{error}</p>}
      <div className="grid-menu">
        {products.map((p, idx) => {
          const variants = (p.variants ?? []).filter((v) => v.isActive);
          const primary = variants[0];
          const img =
            p.imageUrl ||
            `https://picsum.photos/seed/foodapp-fallback-${p.id.slice(0, 8)}/640/480`;
          return (
            <article
              key={p.id}
              className="product-tile"
              style={{ animationDelay: `${Math.min(idx, 12) * 40}ms` }}
            >
              <Link href={`/menu/${p.id}`} className="product-tile__media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={p.name} loading="lazy" />
              </Link>
              <div className="product-tile__body">
                <h3>
                  <Link href={`/menu/${p.id}`}>{p.name}</Link>
                </h3>
                <p className="muted" style={{ margin: 0, minHeight: 40, fontSize: '0.92rem' }}>
                  {p.description}
                </p>
                {primary && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                    <strong style={{ fontSize: '1.05rem' }}>from {formatPkr(primary.price)}</strong>
                    <button type="button" className="btn" onClick={() => void addToCart(p, primary)}>
                      Add
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
