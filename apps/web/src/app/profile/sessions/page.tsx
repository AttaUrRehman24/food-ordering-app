'use client';

import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';

type Session = {
  id: string;
  device: string;
  ip: string;
  lastActive: string;
  current: boolean;
};

export default function SessionsPage() {
  return (
    <RequireAuth>
      <SessionsInner />
    </RequireAuth>
  );
}

function SessionsInner() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const load = () =>
    apiFetch<Session[]>('/users/me/sessions').then(setSessions).catch(() => setSessions([]));

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="panel">
      <h1>My Sessions</h1>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {sessions.map((s) => (
          <li
            key={s.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid var(--erp-border)',
              padding: '0.65rem 0',
            }}
          >
            <div>
              {s.current ? '●' : '○'} {s.device}
              <div className="muted">
                {s.ip} · {s.lastActive}
              </div>
            </div>
            {!s.current && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  void apiFetch(`/users/me/sessions/${s.id}`, { method: 'DELETE' }).then(() => {
                    setToast('Session revoked successfully');
                    return load();
                  })
                }
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
