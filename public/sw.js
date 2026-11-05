/* EDUsaas service worker. Caches ONLY the static app shell (never pages or API data, so nothing personal is
   stored for the next user of a shared device) and replays the offline queue via Background Sync. */
const SHELL = 'edusaas-shell-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/offline.html', '/icon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Immutable build assets: cache-first.
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }
  // Pages: always network; if offline, show the offline page (never cached personal pages).
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
  }
});

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('edusaas-offline', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('queue', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function replay() {
  const db = await openDb();
  const items = await new Promise((resolve) => {
    const r = db.transaction('queue').objectStore('queue').getAll();
    r.onsuccess = () => resolve(r.result);
  });
  for (const item of items) {
    const res = await fetch(item.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item.body),
      credentials: 'same-origin',
    });
    if (res.status === 401) return;
    await new Promise((resolve) => {
      const r = db.transaction('queue', 'readwrite').objectStore('queue').delete(item.id);
      r.onsuccess = resolve;
    });
  }
}

self.addEventListener('sync', (e) => {
  if (e.tag === 'edusaas-queue') e.waitUntil(replay());
});
