'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { z } from 'zod';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const schema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      identifier: fd.get('identifier'),
      password: fd.get('password'),
    });
    if (!parsed.success) {
      setError('All fields required');
      return;
    }
    try {
      const data = await apiFetch<{
        accessToken: string;
        user: { id: string; name: string; email: string; phone: string; role: string };
      }>('/auth/login', { method: 'POST', body: JSON.stringify(parsed.data) });
      setSession(data.accessToken, data.user);
      const fallback = data.user.role === 'admin' ? '/admin/orders' : '/menu';
      router.push(params.get('redirect') || fallback);
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Incorrect credentials');
    }
  };

  return (
    <div className="panel" style={{ maxWidth: 420, margin: '0 auto' }}>
      <h1>Login</h1>
      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="field">
          <label htmlFor="identifier">Email or phone</label>
          <input id="identifier" name="identifier" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit">
          Sign in
        </button>
      </form>
      <p className="muted" style={{ marginTop: 12 }}>
        <Link href="/auth/otp">Login with OTP</Link> · <Link href="/auth/register">Register</Link>
      </p>
    </div>
  );
}
