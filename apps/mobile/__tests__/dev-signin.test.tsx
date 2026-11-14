import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DEMO_LOGINS, DEMO_PASSWORD } from '@/lib/dev-logins';
import { DevSignIn } from '@/screens/DevSignIn';
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
