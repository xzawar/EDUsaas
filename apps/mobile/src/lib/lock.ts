import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

/**
 * Optional fingerprint / face / PIN lock (spec §3.6). Off by default; the person turns it on in More.
 * The app locks when it opens and when it comes back after more than a minute in the background.
 */
const KEY = 'edusaas.lock';
export const RELOCK_AFTER_MS = 60_000;

type LockState = { enabled: boolean; locked: boolean; ready: boolean };
export const useLock = create<LockState>(() => ({ enabled: false, locked: false, ready: false }));

export async function loadLock() {
  const enabled = (await SecureStore.getItemAsync(KEY).catch(() => null)) === 'on';
  useLock.setState({ enabled, locked: enabled, ready: true });
}

/** True when the phone has a fingerprint, face or screen lock the app can use. */
export async function canLock() {
  const [hw, enrolled, level] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
  ]);
  return (hw && enrolled) || level !== LocalAuthentication.SecurityLevel.NONE;
}

export async function unlock(): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock EDUsaas', cancelLabel: 'Cancel' });
  if (r.success) useLock.setState({ locked: false });
  return r.success;
}

/** Turning the lock on asks for the fingerprint first, so nobody locks themselves out by accident. */
export async function setLockEnabled(on: boolean): Promise<boolean> {
  if (on && !(await canLock())) return false;
  if (
    on &&
    !(await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm to turn on the app lock' })).success
  )
    return false;
  await SecureStore.setItemAsync(KEY, on ? 'on' : 'off');
  useLock.setState({ enabled: on, locked: false });
  return true;
}

export async function clearLock() {
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
  useLock.setState({ enabled: false, locked: false });
}

/** Re-locks after the app has been in the background for a while. */
export function useRelockOnResume() {
  const leftAt = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') leftAt.current = Date.now();
      if (
        s === 'active' &&
        leftAt.current &&
        Date.now() - leftAt.current > RELOCK_AFTER_MS &&
        useLock.getState().enabled
      )
        useLock.setState({ locked: true });
      if (s === 'active') leftAt.current = null;
    });
    return () => sub.remove();
  }, []);
}
