const mockAuth = { hw: true, enrolled: true, level: 2, success: true };
jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2 },
  hasHardwareAsync: async () => mockAuth.hw,
  isEnrolledAsync: async () => mockAuth.enrolled,
  getEnrolledLevelAsync: async () => mockAuth.level,
  authenticateAsync: async () => ({ success: mockAuth.success }),
}));

import { clearLock, loadLock, setLockEnabled, unlock, useLock } from '@/lib/lock';

beforeEach(async () => {
  Object.assign(mockAuth, { hw: true, enrolled: true, level: 2, success: true });
  await clearLock();
});

it('is off until the person turns it on', async () => {
  await loadLock();
  expect(useLock.getState()).toMatchObject({ enabled: false, locked: false, ready: true });
});

it('turning it on asks for the fingerprint and locks the next launch', async () => {
  expect(await setLockEnabled(true)).toBe(true);
  await loadLock();
  expect(useLock.getState()).toMatchObject({ enabled: true, locked: true });
  expect(await unlock()).toBe(true);
  expect(useLock.getState().locked).toBe(false);
});

it('cannot be turned on without a phone lock, so nobody gets stuck', async () => {
  Object.assign(mockAuth, { hw: false, enrolled: false, level: 0 });
  expect(await setLockEnabled(true)).toBe(false);
  await loadLock();
  expect(useLock.getState().enabled).toBe(false);
});

it('a failed fingerprint keeps the app locked', async () => {
  await setLockEnabled(true);
  await loadLock();
  mockAuth.success = false;
  expect(await unlock()).toBe(false);
  expect(useLock.getState().locked).toBe(true);
});

it('signing out removes the lock', async () => {
  await setLockEnabled(true);
  await clearLock();
  await loadLock();
  expect(useLock.getState().enabled).toBe(false);
});
