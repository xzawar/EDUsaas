/* In-memory stand-in for expo-sqlite that understands the few statements the queue uses. */
type Row = Record<string, unknown>;
const mockRows: Row[] = [];
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => ({
    execAsync: async () => undefined,
    getAllAsync: async (sql: string, userId?: string) =>
      mockRows
        .filter((r) => !sql.includes('user_id = ?') || r.user_id === userId)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .map((r) => ({ ...r })),
    runAsync: async (sql: string, ...a: unknown[]) => {
      if (sql.startsWith('INSERT')) {
        const [id, path, method, body, label, created_at, user_id] = a;
        const i = mockRows.findIndex((r) => r.id === id);
        const row = { id, path, method, body, label, created_at, user_id, error: null };
        if (i >= 0) mockRows[i] = row;
        else mockRows.push(row);
      } else if (sql.startsWith('DELETE FROM queue WHERE'))
        mockRows.splice(
          mockRows.findIndex((r) => r.id === a[0]),
          1,
        );
      else if (sql.startsWith('DELETE')) mockRows.length = 0;
      else if (sql.startsWith('UPDATE')) mockRows.find((r) => r.id === a[1])!.error = a[0];
    },
  }),
}));

const mockCalls: { path: string; body: unknown }[] = [];
let mockMode: 'offline' | 'ok' | 'reject' | 'server-error' | 'expired' = 'ok';
jest.mock('@/lib/api', () => {
  class NetworkError extends Error {}
  return {
    NetworkError,
    api: jest.fn(async (path: string, init: { body?: unknown }) => {
      if (mockMode === 'offline') throw new NetworkError('No connection');
      mockCalls.push({ path, body: init.body });
      if (mockMode === 'reject')
        return { ok: false, status: 409, error: { code: 'CONFLICT', message: 'Register already taken by Ms Saima' } };
      if (mockMode === 'expired')
        return { ok: false, status: 401, error: { code: 'UNAUTHENTICATED', message: 'Please sign in' } };
      if (mockMode === 'server-error') return { ok: false, status: 503, error: { code: 'HTTP_503', message: 'Down' } };
      return { ok: true, status: 200, data: { saved: true } };
    }),
  };
});

import { clearQueue, discard, flush, pending, sendOrQueue, setQueueOwner, useQueue } from '@/lib/queue';

const item = (n: number) => ({
  id: `id-${n}`,
  path: '/attendance/batches',
  method: 'POST' as const,
  body: { clientUuid: `c-${n}` },
  label: `Register ${n}`,
  userId: 'u1',
});

beforeEach(async () => {
  setQueueOwner('u1');
  await clearQueue();
  mockCalls.length = 0;
  mockMode = 'ok';
});

it('sends straight away when online', async () => {
  const r = await sendOrQueue(item(1));
  expect(r).toEqual({ status: 'sent', data: { saved: true } });
  expect(await pending()).toHaveLength(0);
});

it('keeps the work on the phone when offline, with the same idempotency key', async () => {
  mockMode = 'offline';
  expect(await sendOrQueue(item(1))).toEqual({ status: 'queued' });
  const q = await pending();
  expect(q).toHaveLength(1);
  expect(q[0]!.body).toEqual({ clientUuid: 'c-1' });
  expect(useQueue.getState().items).toHaveLength(1);
});

it('a server refusal is shown, not queued', async () => {
  mockMode = 'reject';
  expect(await sendOrQueue(item(1))).toEqual({ status: 'rejected', message: 'Register already taken by Ms Saima' });
  expect(await pending()).toHaveLength(0);
});

it('flushes in order once back online', async () => {
  mockMode = 'offline';
  await sendOrQueue(item(1));
  await new Promise((r) => setTimeout(r, 2));
  await sendOrQueue(item(2));
  mockMode = 'ok';
  expect(await flush()).toEqual({ sent: 2, failed: 0 });
  expect(mockCalls.map((c) => (c.body as { clientUuid: string }).clientUuid)).toEqual(['c-1', 'c-2']);
  expect(await pending()).toHaveLength(0);
});

it('stops at the first network failure and keeps everything', async () => {
  mockMode = 'offline';
  await sendOrQueue(item(1));
  await sendOrQueue(item(2));
  expect(await flush()).toEqual({ sent: 0, failed: 0 });
  expect(await pending()).toHaveLength(2);
});

it('keeps a refused item with the reason and does not resend it', async () => {
  mockMode = 'offline';
  await sendOrQueue(item(1));
  mockMode = 'reject';
  expect(await flush()).toEqual({ sent: 0, failed: 1 });
  const [q] = await pending();
  expect(q!.error).toBe('Register already taken by Ms Saima');
  mockCalls.length = 0;
  mockMode = 'ok';
  await flush();
  expect(mockCalls).toHaveLength(0); // waits for the person
  await discard(q!.id);
  expect(await pending()).toHaveLength(0);
});

it('a server outage leaves items for later', async () => {
  mockMode = 'offline';
  await sendOrQueue(item(1));
  mockMode = 'server-error';
  await flush();
  const [q] = await pending();
  expect(q!.error).toBeNull();
});

it('two flushes at once send each item once', async () => {
  mockMode = 'offline';
  await sendOrQueue(item(1));
  mockMode = 'ok';
  await Promise.all([useQueue.getState().flushNow(), useQueue.getState().flushNow()]);
  expect(mockCalls).toHaveLength(1);
});

it('an expired session leaves everything waiting, untouched, for after sign-in', async () => {
  mockMode = 'offline';
  await sendOrQueue(item(1));
  await sendOrQueue(item(2));
  mockMode = 'expired';
  expect(await flush()).toEqual({ sent: 0, failed: 0 });
  expect((await pending()).map((q) => q.error)).toEqual([null, null]);
  mockMode = 'ok';
  expect(await flush()).toEqual({ sent: 2, failed: 0 });
});

it('on a shared phone, one person’s saved work is never sent under another’s account', async () => {
  mockMode = 'offline';
  await sendOrQueue(item(1)); // saved by u1
  mockMode = 'ok';
  setQueueOwner(null); // u1’s session expired
  expect(await flush()).toEqual({ sent: 0, failed: 0 });
  setQueueOwner('u2'); // someone else signs in
  expect(await flush()).toEqual({ sent: 0, failed: 0 });
  expect(mockCalls).toHaveLength(0);
  await useQueue.getState().reload();
  expect(useQueue.getState().items).toHaveLength(0); // u2 does not see u1’s items
  setQueueOwner('u1');
  expect(await flush()).toEqual({ sent: 1, failed: 0 });
});
