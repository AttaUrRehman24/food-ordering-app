'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

type Session = {
  id: string;
  device: string;
  ip: string;
  createdAt: string;
  lastActive: string;
  current: boolean;
};

type Profile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  createdAt?: string;
};

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardInner />
    </RequireAuth>
  );
}

function DashboardInner() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    const [me, sess] = await Promise.all([
      apiFetch<Profile>('/users/me'),
      apiFetch<Session[]>('/users/me/sessions'),
    ]);
    setProfile(me);
    setSessions(sess);
  };

  useEffect(() => {
    void load().catch(() => undefined);
  }, []);

  const revoke = async (sessionId: string) => {
    await apiFetch(`/users/me/sessions/${sessionId}`, { method: 'DELETE' });
    setToast('Session revoked successfully');
    await load();
  };

  const logoutAll = async () => {
    await apiFetch('/auth/logout-all', { method: 'POST' });
    clear();
    window.location.href = '/auth/login';
  };

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginTop: 0 }}>Hello, {profile?.name ?? user?.name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {profile?.email} | {profile?.phone}
          </p>
          {profile?.createdAt && (
            <p className="muted">Member since {new Date(profile.createdAt).toLocaleDateString()}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => void apiFetch('/auth/logout', { method: 'POST' }).then(() => { clear(); window.location.href = '/auth/login'; })}>
            Logout
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void logoutAll()}>
            Logout All
          </button>
        </div>
      </div>

      <h2>Active Sessions</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {sessions.map((s) => (
          <li
            key={s.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid var(--erp-border)',
              padding: '0.65rem 0',
              gap: 8,
            }}
          >
            <div>
              <strong>
                {s.current ? '●' : '○'} {s.device}
              </strong>
              {s.current && ' — Current session'}
              <div className="muted">
                {s.ip} · {s.lastActive}
              </div>
            </div>
            {!s.current && (
              <button type="button" className="btn btn-ghost" onClick={() => void revoke(s.id)}>
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <Link className="btn" href="/menu">
          Browse Menu
        </Link>
        <Link className="btn btn-ghost" href="/orders">
          My Orders
        </Link>
        <Link className="btn btn-ghost" href="/profile">
          Account Settings
        </Link>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
