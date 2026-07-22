'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';

export default function NewProductPage() {
  return (
    <RequireAuth role="admin">
      <NewProductInner />
    </RequireAuth>
  );
}

function NewProductInner() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get('name')),
      description: String(fd.get('description')),
      isActive: true,
      variants: [
        {
          label: String(fd.get('v1label')),
          price: String(fd.get('v1price')),
          isActive: true,
        },
        {
          label: String(fd.get('v2label')),
          price: String(fd.get('v2price')),
          isActive: true,
        },
      ].filter((v) => v.label && v.price),
    };
    try {
      const product = await apiFetch<{ id: string }>('/admin/products', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      router.push(`/admin/products/${product.id}`);
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Create failed');
    }
  };

  return (
    <div className="panel" style={{ maxWidth: 520 }}>
      <h1>New product</h1>
      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" required />
        </div>
        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" required />
        </div>
        <h3>Variants</h3>
        <div className="field">
          <label>Variant 1 label / price</label>
          <input name="v1label" placeholder="8pc" required />
          <input name="v1price" placeholder="12.99" required style={{ marginTop: 6 }} />
        </div>
        <div className="field">
          <label>Variant 2 label / price (optional)</label>
          <input name="v2label" placeholder="16pc" />
          <input name="v2price" placeholder="22.99" style={{ marginTop: 6 }} />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit">
          Create
        </button>
      </form>
    </div>
  );
}
