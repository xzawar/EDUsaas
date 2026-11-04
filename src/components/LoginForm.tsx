'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/client/api';
import { Alert, Button, Field, Input } from '@/components/ui';
import type { PortalKey } from '@/components/portal-theme';

const COPY: Record<PortalKey, { label: string; placeholder: string; autoComplete: string }> = {
  student: { label: 'Username', placeholder: 'e.g. bss-9a-ahmad-14', autoComplete: 'username' },
  staff: {
    label: 'Username or email',
    placeholder: 'Teachers: username · Office staff: email',
    autoComplete: 'username',
  },
  platform: { label: 'Email', placeholder: 'you@company.com', autoComplete: 'email' },
};

export function LoginForm({ portal }: { portal: PortalKey }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = COPY[portal];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api<{ redirectTo: string }>(`/auth/${portal}/login`, { body: { identifier, password } });
    if (res.ok) {
      window.location.assign(res.data.redirectTo);
      return;
    }
    setError(res.error.message);
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <Alert>{error}</Alert>}
      <Field label={copy.label} htmlFor="identifier">
        <Input
          id="identifier"
          name="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={copy.placeholder}
          autoComplete={copy.autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>
      <Button type="submit" className="w-full" disabled={busy || !identifier || !password}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
