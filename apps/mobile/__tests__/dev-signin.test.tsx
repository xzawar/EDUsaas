import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// Demo builds get the demo password at build time; this file plays a demo build.
process.env.EXPO_PUBLIC_DEMO_PASSWORD = 'Demo-pass-2026';
const { DEMO_LOGINS, DEMO_PASSWORD } = require('@/lib/dev-logins') as typeof import('@/lib/dev-logins');
const { DevSignIn } = require('@/screens/DevSignIn') as typeof import('@/screens/DevSignIn');
import { useSession } from '@/lib/session';

const calls: { portal: string; id: string; pw: string }[] = [];
jest.mock('@/lib/session', () => {
  const signIn = jest.fn(async (portal: string, id: string, pw: string) => {
    calls.push({ portal, id, pw });
    return { ok: true, mustChangePassword: false };
  });
  const store = (sel: (s: { signIn: typeof signIn }) => unknown) => sel({ signIn });
  return { useSession: Object.assign(store, { getState: () => ({ signIn }) }) };
});

beforeEach(() => {
  calls.length = 0;
});

it('offers a one-tap login for every public demo account', async () => {
  await render(<DevSignIn visible onClose={() => {}} />);
  for (const d of DEMO_LOGINS) expect(screen.getByText(d.label)).toBeTruthy();
});

it('signs in through the normal flow with the demo password, then closes', async () => {
  const onClose = jest.fn();
  await render(<DevSignIn visible onClose={onClose} />);
  await fireEvent.press(screen.getByText('Accountant'));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(calls).toEqual([{ portal: 'staff', id: 'accounts@bss.test', pw: DEMO_PASSWORD }]);
  // The session store (not the component) decides whether the password is accepted.
  expect(useSession.getState().signIn).toHaveBeenCalledWith('staff', 'accounts@bss.test', DEMO_PASSWORD);
});

it('a store build (no demo password set) has no quick sign-in at all', () => {
  jest.isolateModules(() => {
    const saved = process.env.EXPO_PUBLIC_DEMO_PASSWORD;
    delete process.env.EXPO_PUBLIC_DEMO_PASSWORD;
    const m = require('@/lib/dev-logins') as typeof import('@/lib/dev-logins');
    expect(m.DEV_LOGIN_ENABLED).toBe(false);
    expect(m.DEMO_PASSWORD).toBeNull();
    process.env.EXPO_PUBLIC_DEMO_PASSWORD = saved;
  });
});
