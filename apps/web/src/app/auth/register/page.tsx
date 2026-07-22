'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { z } from 'zod';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const schema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(5),
    password: z.string().min(8),
    confirm: z.string().min(8),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords must match', path: ['confirm'] });

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      name: fd.get('name'),
      email: fd.get('email'),
      phone: fd.get('phone'),
      password: fd.get('password'),
      confirm: fd.get('confirm'),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid form');
      return;
    }
    const body = {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      password: parsed.data.password,
    };
    try {
      const data = await apiFetch<{
        accessToken: string;
        user: { id: string; name: string; email: string; phone: string; role: string };
      }>('/auth/register', { method: 'POST', body: JSON.stringify(body) });
      setSession(data.accessToken, data.user);
      router.push('/menu');
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Registration failed');
    }
  };

  return (
    <div className="panel" style={{ maxWidth: 420, margin: '0 auto' }}>
      <h1>Register</h1>
      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" required />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" minLength={8} required />
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirm password</label>
          <input id="confirm" name="confirm" type="password" minLength={8} required />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit">
          Create account
        </button>
      </form>
      <p className="muted" style={{ marginTop: 12 }}>
        <Link href="/auth/login">Already have an account?</Link>
      </p>
    </div>
  );
}
