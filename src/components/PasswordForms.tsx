'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api } from '@/client/api';
import { Alert, Button, Field, Input } from '@/components/ui';

const RULES = 'At least 8 characters, with letters and numbers.';

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) return setError('The new passwords do not match.');
    setBusy(true);
    setError(null);
    const res = await api<{ redirectTo: string }>('/auth/change-password', {
      body: { currentPassword: current, newPassword: next },
    });
    if (res.ok) return window.location.assign(res.data.redirectTo);
    setError(res.error.message);
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {forced && <Alert tone="info">For your security, choose a new password before continuing.</Alert>}
      {error && <Alert>{error}</Alert>}
      <Field label={forced ? 'Temporary password' : 'Current password'} htmlFor="current">
        <Input
          id="current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </Field>
      <Field label="New password" htmlFor="new" hint={RULES}>
        <Input
          id="new"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </Field>
      <Button type="submit" className="w-full" disabled={busy || !current || !next || !confirm}>
        {busy ? 'Saving…' : 'Save new password'}
      </Button>
      <p className="text-xs text-slate-500">Changing your password signs you out on all other devices.</p>
    </form>
  );
}

export function ForgotPasswordForm({ portal }: { portal: 'staff' | 'platform' }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api<{ message: string }>('/auth/forgot-password', { body: { email, portal } });
    setBusy(false);
    if (res.ok) setMessage(res.data.message);
    else setError(res.error.message);
  }

  if (message) return <Alert tone="success">{message}</Alert>;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </Field>
      <Button type="submit" className="w-full" disabled={busy || !email}>
        {busy ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) return setError('The new passwords do not match.');
    setBusy(true);
    setError(null);
    const res = await api('/auth/reset-password', { body: { token, newPassword: next } });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error.message);
  }

  if (done)
    return (
      <Alert tone="success">
        Your password has been reset.{' '}
        <Link href="/staff/login" className="font-medium underline">
          Sign in
        </Link>
      </Alert>
    );
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <Field label="New password" htmlFor="new" hint={RULES}>
        <Input
          id="new"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          autoFocus
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </Field>
      <Button type="submit" className="w-full" disabled={busy || !next || !confirm}>
        {busy ? 'Saving…' : 'Set new password'}
      </Button>
    </form>
  );
}
