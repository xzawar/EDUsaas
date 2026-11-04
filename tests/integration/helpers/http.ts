type Handler = (req: Request, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>;

export type CallOptions = {
  method?: string;
  path?: string;
  body?: unknown;
  cookie?: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
};

/** Invokes a route handler exactly as Next.js would, without a running server. */
export async function call(handler: Handler, opts: CallOptions = {}) {
  const headers: Record<string, string> = { 'user-agent': 'vitest', ...opts.headers };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const req = new Request(`http://localhost:3000${opts.path ?? '/api/v1/test'}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, json: json as Record<string, any>, headers: res.headers }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function setCookieValue(headers: Headers, name: string): string | undefined {
  for (const c of headers.getSetCookie()) {
    const [pair] = c.split(';');
    const [k, v] = pair!.split('=');
    if (k === name) return v;
  }
  return undefined;
}
