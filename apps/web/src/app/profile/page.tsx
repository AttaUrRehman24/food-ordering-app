'use client';

import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { apiFetch } from '@/lib/api';

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileInner />
    </RequireAuth>
  );
}

function ProfileInner() {
  const [profile, setProfile] = useState<{
    name: string;
    email: string;
    phone: string;
    role: string;
    createdAt?: string;
  } | null>(null);

  useEffect(() => {
    void apiFetch<typeof profile>('/users/me').then(setProfile);
  }, []);

  if (!profile) {
    return <p className="muted">Loading…</p>;
  }

  return (
    <div className="panel">
      <h1>Profile</h1>
      <p>
        <strong>{profile.name}</strong>
      </p>
      <p className="muted">
        {profile.email} · {profile.phone} · {profile.role}
      </p>
      {profile.createdAt && (
        <p className="muted">Member since {new Date(profile.createdAt).toLocaleDateString()}</p>
      )}
    </div>
  );
}
