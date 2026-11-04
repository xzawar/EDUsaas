'use client';

import { useState } from 'react';
import { api } from '@/client/api';

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await api<{ redirectTo: string }>('/auth/logout', { method: 'POST' });
        window.location.assign(res.ok ? res.data.redirectTo : '/');
      }}
      className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60"
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
