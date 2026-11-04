'use client';

export type ApiError = { code: string; message: string; details?: unknown };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError; status: number };

/** Typed fetch wrapper for /api/v1. Never throws; network failures become an error result. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/v1${path}`, {
      method: init?.method ?? (init?.body ? 'POST' : 'GET'),
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 403 && data?.error?.code === 'PASSWORD_CHANGE_REQUIRED')
        window.location.assign('/change-password');
      return { ok: false, status: res.status, error: data?.error ?? { code: 'INTERNAL', message: 'Request failed' } };
    }
    return { ok: true, data: data as T };
  } catch {
    return {
      ok: false,
      status: 0,
      error: { code: 'NETWORK', message: 'Network error. Check your connection and try again.' },
    };
  }
}
