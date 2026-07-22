'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export default function OtpPage() {
  const router = useRouter();
  const params = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [identifier, setIdentifier] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ message: string }>('/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ identifier, type: 'email' }),
      });
      setMessage(
        `${res.message}. Check your inbox for the code (SMTP). If SMTP is not configured, ask an operator for the code in notification logs/DB.`,
      );
      setStep('verify');
    } catch (err) {
      setError((err as { message?: string }).message ?? 'OTP request failed');
    }
  };

  const verifyOtp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const code = String(new FormData(e.currentTarget).get('code') ?? '');
    try {
      const data = await apiFetch<{
        accessToken: string;
        user: { id: string; name: string; email: string; phone: string; role: string };
      }>('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ identifier, code }),
      });
      setSession(data.accessToken, data.user);
      const fallback = data.user.role === 'admin' ? '/admin/orders' : '/menu';
      router.push(params.get('redirect') || fallback);
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Invalid code');
    }
  };

  return (
    <div className="panel auth-card">
      <h1>Email OTP login</h1>
      <p className="muted">We send a one-time code to the account email only.</p>
      {step === 'request' ? (
        <form onSubmit={(e) => void requestOtp(e)}>
          <div className="field">
            <label htmlFor="identifier">Email or phone on your account</label>
            <input
              id="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit">
            Send code to email
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => void verifyOtp(e)}>
          {message && <p className="muted">{message}</p>}
          <div className="field">
            <label htmlFor="code">Code from email</label>
            <input id="code" name="code" required autoComplete="one-time-code" />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit">
            Verify &amp; sign in
          </button>
        </form>
      )}
      <p className="muted" style={{ marginTop: 12 }}>
        <Link href="/auth/login">Password login</Link>
      </p>
    </div>
  );
}
