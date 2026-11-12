import * as SecureStore from 'expo-secure-store';
import { API_URL, CLIENT_HEADER } from './config';

/**
 * Thin fetch wrapper for the EDUsaas API. The session token lives in the device keystore (never AsyncStorage) and
 * goes out as `Authorization: Bearer`. A 401 clears the session and the auth gate sends the user back to sign-in.
 */
export type ApiError = { code: string; message: string; details?: unknown };
export type ApiResult<T> = { ok: true; data: T; status: number } | { ok: false; error: ApiError; status: number };

const TOKEN_KEY = 'edusaas.session';
let token: string | null | undefined;
let onUnauthorized: (() => void) | null = null;

export async function loadToken(): Promise<string | null> {
  if (token !== undefined) return token;
  token = (await SecureStore.getItemAsync(TOKEN_KEY)) ?? null;
  return token;
}
export async function setToken(t: string | null) {
  token = t;
  if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export class NetworkError extends Error {
  constructor() {
    super('No connection');
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number; raw?: boolean } = {},
): Promise<ApiResult<T>> {
  const t = await loadToken();
  const headers: Record<string, string> = { accept: 'application/json', 'x-edusaas-client': CLIENT_HEADER };
  if (t) headers.authorization = `Bearer ${t}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
    });
  } catch {
    throw new NetworkError();
  }
  if (res.status === 401 && t) {
    await setToken(null);
    onUnauthorized?.();
  }
  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: { code: 'BAD_RESPONSE', message: 'Unexpected reply from the server' } };
  }
  if (!res.ok) {
    const err = (json as { error?: ApiError })?.error ?? {
      code: 'HTTP_' + res.status,
      message: `Request failed (${res.status})`,
    };
    return { ok: false, error: err, status: res.status };
  }
  return { ok: true, data: json as T, status: res.status };
}

/** For queries: throws on failure so TanStack Query can retry and show errors. */
export async function get<T>(path: string): Promise<T> {
  const r = await api<T>(path);
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code, status: r.status });
  return r.data;
}

/** Absolute URL for binary endpoints (PDF, images) opened in the system viewer; the token goes in the header. */
export function fileUrl(path: string) {
  return `${API_URL}/api/v1${path}`;
}
export async function authHeaders(): Promise<Record<string, string>> {
  const t = await loadToken();
  return t
    ? { authorization: `Bearer ${t}`, 'x-edusaas-client': CLIENT_HEADER }
    : { 'x-edusaas-client': CLIENT_HEADER };
}
