'use client';

import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';

export default function EditProductPage() {
  return (
    <RequireAuth role="admin">
      <EditProductInner />
    </RequireAuth>
  );
}

function EditProductInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<{
    name: string;
    description: string;
    isActive: boolean;
    imageUrl: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<typeof product>(`/catalog/products/${id}`).then(setProduct);
  }, [id]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!product) {
      return;
    }
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch(`/admin/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: String(fd.get('name')),
          description: String(fd.get('description')),
          isActive: fd.get('isActive') === 'on',
          imageUrl: product.imageUrl ?? '',
        }),
      });
      router.push('/admin/products');
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Update failed');
    }
  };

  if (!product) {
    return <p className="muted">Loading…</p>;
  }

  return (
    <div className="panel" style={{ maxWidth: 520 }}>
      <h1>Edit product</h1>
      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" defaultValue={product.name} required />
        </div>
        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" defaultValue={product.description} required />
        </div>
        <div className="field">
          <label>
            <input name="isActive" type="checkbox" defaultChecked={product.isActive} /> Active
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit">
          Save
        </button>
      </form>
    </div>
  );
}
