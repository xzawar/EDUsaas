'use client';

/**
 * Offline queue for teacher actions (spec §6.2): attendance registers and check-ins are stored in IndexedDB
 * with a client UUID (idempotency key) and sent when the connection returns. The server re-validates everything.
 * The queue is per device and is wiped on sign-out.
 */
export type QueueItem = { id: string; url: string; body: unknown; label: string; createdAt: string; userId: string };

const DB = 'edusaas-offline';
const STORE = 'queue';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function enqueue(item: QueueItem) {
  await tx('readwrite', (s) => s.put(item));
  emit();
  try {
    const reg = await navigator.serviceWorker?.ready;
    // Background Sync (Chromium): lets the browser send the queue even after the tab is closed.
    await (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } })?.sync?.register(
      'edusaas-queue',
    );
  } catch {
    /* not supported: the in-page flush below covers it */
  }
}

export async function pending(userId?: string): Promise<QueueItem[]> {
  if (typeof indexedDB === 'undefined') return [];
  const all = await tx<QueueItem[]>('readonly', (s) => s.getAll() as IDBRequest<QueueItem[]>);
  return userId ? all.filter((i) => i.userId === userId) : all;
}

export async function remove(id: string) {
  await tx('readwrite', (s) => s.delete(id));
  emit();
}

export async function clearQueue() {
  if (typeof indexedDB === 'undefined') return;
  await tx('readwrite', (s) => s.clear());
  emit();
}

let flushing = false;
/** Sends queued items. Network failures keep the item; server answers (success or rejection) remove it. */
export async function flush(): Promise<{ sent: number; rejected: { label: string; message: string }[] }> {
  if (flushing || typeof navigator === 'undefined' || !navigator.onLine) return { sent: 0, rejected: [] };
  flushing = true;
  const rejected: { label: string; message: string }[] = [];
  let sent = 0;
  try {
    for (const item of await pending()) {
      let res: Response;
      try {
        res = await fetch(item.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.body),
          credentials: 'same-origin',
        });
      } catch {
        break; // still offline
      }
      if (res.status === 401) break; // signed out: keep until they sign back in
      if (res.ok) sent++;
      else {
        const data = await res.json().catch(() => ({}));
        rejected.push({ label: item.label, message: data?.error?.message ?? 'Rejected by the server' });
      }
      await remove(item.id);
    }
  } finally {
    flushing = false;
  }
  return { sent, rejected };
}

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
