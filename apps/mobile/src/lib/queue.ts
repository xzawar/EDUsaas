import * as SQLite from 'expo-sqlite';
import { create } from 'zustand';
import { api, NetworkError } from './api';

/**
 * Offline write queue (spec §3.5). Every queued action carries the same `clientKey` idempotency UUID the web app
 * uses, so a resend never duplicates a register, mark sheet or payment. Items flush in order when the network is
 * back; a 4xx answer is kept as "needs attention" with the server's message, never silently dropped.
 */
export type QueueItem = {
  id: string;
  path: string;
  method: 'POST' | 'PUT';
  body: unknown;
  label: string;
  createdAt: string;
  userId: string;
  error?: string | null;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
function db() {
  dbPromise ??= SQLite.openDatabaseAsync('edusaas.db').then(async (d) => {
    await d.execAsync(`CREATE TABLE IF NOT EXISTS queue (
      id TEXT PRIMARY KEY, path TEXT NOT NULL, method TEXT NOT NULL, body TEXT NOT NULL,
      label TEXT NOT NULL, created_at TEXT NOT NULL, user_id TEXT NOT NULL, error TEXT
    )`);
    return d;
  });
  return dbPromise;
}

type Row = {
  id: string;
  path: string;
  method: 'POST' | 'PUT';
  body: string;
  label: string;
  created_at: string;
  user_id: string;
  error: string | null;
};
const toItem = (r: Row): QueueItem => ({
  id: r.id,
  path: r.path,
  method: r.method,
  body: JSON.parse(r.body),
  label: r.label,
  createdAt: r.created_at,
  userId: r.user_id,
  error: r.error,
});

export async function pending(userId?: string): Promise<QueueItem[]> {
  const d = await db();
  const rows = userId
    ? await d.getAllAsync<Row>('SELECT * FROM queue WHERE user_id = ? ORDER BY created_at', userId)
    : await d.getAllAsync<Row>('SELECT * FROM queue ORDER BY created_at');
  return rows.map(toItem);
}

export async function enqueue(item: Omit<QueueItem, 'createdAt' | 'error'>) {
  const d = await db();
  await d.runAsync(
    'INSERT OR REPLACE INTO queue (id, path, method, body, label, created_at, user_id, error) VALUES (?,?,?,?,?,?,?,NULL)',
    item.id,
    item.path,
    item.method,
    JSON.stringify(item.body),
    item.label,
    new Date().toISOString(),
    item.userId,
  );
  await useQueue.getState().reload();
}

export async function discard(id: string) {
  const d = await db();
  await d.runAsync('DELETE FROM queue WHERE id = ?', id);
  await useQueue.getState().reload();
}

/**
 * Whose work may be sent. Set by the session on sign-in; null when signed out or the session expired. Items always
 * go out under the account that saved them, never under whoever happens to be signed in next on a shared phone.
 */
let owner: string | null = null;
export function setQueueOwner(userId: string | null) {
  owner = userId;
  void useQueue.getState().reload();
}

export async function clearQueue() {
  const d = await db();
  await d.runAsync('DELETE FROM queue');
  await useQueue.getState().reload();
}

/**
 * Sends everything in order. Stops at the first network failure (we are offline). A 4xx keeps the item with the
 * message so the person can see what the server refused and why; anything else is retried next time.
 */
export async function flush(): Promise<{ sent: number; failed: number }> {
  if (!owner) return { sent: 0, failed: 0 };
  const items = await pending(owner);
  let sent = 0;
  let failed = 0;
  const d = await db();
  for (const item of items) {
    if (item.error) continue; // refused before: waits for the person to fix or remove it
    try {
      const r = await api(item.path, { method: item.method, body: item.body });
      if (r.ok) {
        await d.runAsync('DELETE FROM queue WHERE id = ?', item.id);
        sent++;
      } else if (r.status === 401) {
        break; // session expired: keep everything as it is and send after the person signs back in
      } else if (r.status >= 400 && r.status < 500 && r.status !== 429) {
        await d.runAsync('UPDATE queue SET error = ? WHERE id = ?', r.error.message, item.id);
        failed++;
      } else {
        break; // server trouble; try again later
      }
    } catch (e) {
      if (e instanceof NetworkError) break;
      failed++;
    }
  }
  await useQueue.getState().reload();
  return { sent, failed };
}

/** Live view of the queue for badges and the "waiting to send" sheet. */
export const useQueue = create<{
  items: QueueItem[];
  flushing: boolean;
  reload: () => Promise<void>;
  flushNow: () => Promise<void>;
}>((set) => ({
  items: [],
  flushing: false,
  async reload() {
    set({ items: owner ? await pending(owner) : [] });
  },
  async flushNow() {
    if (useQueue.getState().flushing) return; // reconnect + foreground can fire together
    set({ flushing: true });
    try {
      await flush();
    } finally {
      set({ flushing: false });
    }
  },
}));

/** Try the network first; if offline, queue it. Returns what happened so the screen can say so. */
export async function sendOrQueue<T>(
  item: Omit<QueueItem, 'createdAt' | 'error'>,
): Promise<{ status: 'sent'; data: T } | { status: 'queued' } | { status: 'rejected'; message: string }> {
  try {
    const r = await api<T>(item.path, { method: item.method, body: item.body });
    if (r.ok) return { status: 'sent', data: r.data };
    return { status: 'rejected', message: r.error.message };
  } catch (e) {
    if (e instanceof NetworkError) {
      await enqueue(item);
      return { status: 'queued' };
    }
    throw e;
  }
}
