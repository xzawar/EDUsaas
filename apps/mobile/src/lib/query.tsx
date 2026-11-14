import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Network from 'expo-network';
import { useEffect, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueue } from './queue';

/**
 * Read cache (spec §3.5): every query is persisted, so screens render the last data instantly, offline or not,
 * then refresh when the app is focused or the network returns. The write queue flushes on the same triggers.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: (count, err) => count < 2 && !(err as { status?: number }).status,
      refetchOnReconnect: true,
    },
  },
});

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'edusaas.query', throttleTime: 1000 });

export function QueryProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      focusManager.setFocused(s === 'active');
      if (s === 'active') void useQueue.getState().flushNow();
    });
    const net = Network.addNetworkStateListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      onlineManager.setOnline(online);
      if (online) void useQueue.getState().flushNow();
    });
    void useQueue.getState().reload();
    return () => {
      sub.remove();
      net.remove();
    };
  }, []);
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 7 * 24 * 60 * 60 * 1000, buster: 'v1' }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

/** Wipes everything cached for the previous user. */
export async function clearQueryCache() {
  queryClient.clear();
  await AsyncStorage.removeItem('edusaas.query');
}
