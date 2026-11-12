import { create } from 'zustand';
import type { PortalSlug } from '@edusaas/shared';
import { api, loadToken, setToken, setUnauthorizedHandler } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearQueue } from './queue';

const ME_KEY = 'edusaas.me';
const saveMe = (me: Me | null) =>
  (me ? AsyncStorage.setItem(ME_KEY, JSON.stringify(me)) : AsyncStorage.removeItem(ME_KEY)).catch(() => undefined);
async function cachedMe(): Promise<Me | null> {
  try {
    const raw = await AsyncStorage.getItem(ME_KEY);
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
}

export type Me = {
  user: {
    id: string;
    role: string;
    displayName: string;
    username: string | null;
    email: string | null;
    mustChangePassword: boolean;
  };
  portal: 'STUDENT' | 'STAFF' | 'PLATFORM';
  tenant: { id: string; name: string; prefix: string } | null;
  permissions: string[];
};

type State = {
  status: 'loading' | 'out' | 'in';
  me: Me | null;
  can: (p: string) => boolean;
  boot: () => Promise<void>;
  signIn: (
    portal: PortalSlug,
    identifier: string,
    password: string,
  ) => Promise<{ ok: true; mustChangePassword: boolean } | { ok: false; message: string }>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const useSession = create<State>((set, get) => ({
  status: 'loading',
  me: null,
  can: (p) => get().me?.permissions.includes(p) ?? false,

  async boot() {
    setUnauthorizedHandler(() => {
      void saveMe(null);
      set({ status: 'out', me: null });
    });
    const t = await loadToken();
    if (!t) return set({ status: 'out', me: null });
    try {
      const r = await api<Me>('/auth/me');
      if (r.ok) {
        void saveMe(r.data);
        return set({ status: 'in', me: r.data });
      }
      if (r.status === 401) return set({ status: 'out', me: null });
    } catch {
      /* offline: fall through to the cached profile */
    }
    // Offline (or server hiccup): open with the last known profile so cached screens and the queue still work.
    const cached = await cachedMe();
    set(cached ? { status: 'in', me: cached } : { status: 'out', me: null });
  },

  async signIn(portal, identifier, password) {
    try {
      const r = await api<{ token: string; mustChangePassword: boolean }>(`/auth/${portal}/login`, {
        body: { identifier, password },
      });
      if (!r.ok) return { ok: false, message: r.error.message };
      await setToken(r.data.token);
      const me = await api<Me>('/auth/me');
      if (!me.ok) return { ok: false, message: me.error.message };
      void saveMe(me.data);
      set({ status: 'in', me: me.data });
      return { ok: true, mustChangePassword: r.data.mustChangePassword };
    } catch {
      return { ok: false, message: 'No connection. Check your internet and try again.' };
    }
  },

  async refresh() {
    const r = await api<Me>('/auth/me').catch(() => null);
    if (r?.ok) {
      void saveMe(r.data);
      set({ me: r.data, status: 'in' });
    }
  },

  async signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await setToken(null);
    await clearQueue().catch(() => undefined);
    await saveMe(null);
    set({ status: 'out', me: null });
  },
}));
