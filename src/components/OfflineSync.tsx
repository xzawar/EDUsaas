'use client';

import { CloudOff, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { flush, pending, subscribe } from '@/client/offline';
import { useToast } from '@/components/overlay';

/** Registers the service worker, flushes the offline queue when online, and shows a small status pill. */
export function OfflineSync() {
  const toast = useToast();
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(true);

  const refresh = useCallback(async () => setCount((await pending()).length), []);
  const sync = useCallback(async () => {
    const r = await flush();
    if (r.sent) {
      toast('success', `${r.sent} saved item${r.sent === 1 ? '' : 's'} synced`);
      router.refresh();
    }
    for (const x of r.rejected) toast('error', `${x.label}: ${x.message}`);
    await refresh();
  }, [refresh, router, toast]);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    setOnline(navigator.onLine);
    void refresh().then(sync);
    const on = () => (setOnline(true), void sync());
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const unsub = subscribe(() => void refresh());
    const t = setInterval(() => void sync(), 30000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      unsub();
      clearInterval(t);
    };
  }, [refresh, sync]);

  if (online && count === 0) return null;
  return (
    <div className="fixed top-3 right-3 z-30 flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900 shadow ring-1 ring-amber-200 lg:top-4">
      {online ? <RefreshCw className="size-3.5 animate-spin" aria-hidden /> : <CloudOff className="size-3.5" aria-hidden />}
      {online ? `Syncing ${count}…` : count ? `Offline · ${count} waiting to sync` : 'Offline'}
    </div>
  );
}
