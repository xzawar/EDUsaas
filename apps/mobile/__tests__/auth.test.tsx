import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useSession } from '@/lib/session';

/* Real session store and API client; only fetch is faked, so headers and token storage are exercised too. */
const mockReplace = jest.fn();
let mockParams: Record<string, string> = { portal: 'student' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/lib/queue', () => ({
  clearQueue: async () => undefined,
  setQueueOwner: () => undefined,
  useQueue: { getState: () => ({ flushNow: async () => undefined }) },
}));

type Seen = { url: string; method: string; headers: Record<string, string>; body: unknown };
const seen: Seen[] = [];
let replies: Record<string, (body: Record<string, string>) => { status: number; json: unknown }> = {};
const ME = (mustChangePassword: boolean) => ({
  user: {
    id: 'u1',
    role: 'STUDENT',
    displayName: 'Ahmad Raza',
    username: 'bss-8a-ahmad-14',
    email: null,
    mustChangePassword,
  },
  portal: 'STUDENT',
  tenant: { id: 't', name: 'Bright Star School', prefix: 'bss' },
  permissions: ['self.records'],
});
beforeEach(() => {
  seen.length = 0;
  replies = {};
  useSession.setState({ status: 'out', me: null });
  global.fetch = jest.fn(
    async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
      const path = url.replace(/^.*\/api\/v1/, '');
      const body = init.body ? JSON.parse(init.body) : undefined;
      seen.push({ url: path, method: init.method, headers: init.headers, body });
      const h = replies[`${init.method} ${path}`];
      const r = h ? h(body) : { status: 404, json: { error: { code: 'NOT_FOUND', message: 'no route' } } };
      return { ok: r.status < 400, status: r.status, text: async () => JSON.stringify(r.json) } as unknown as Response;
    },
  ) as unknown as typeof fetch;
});

describe('sign in', () => {
  const Login = require('../app/(auth)/login').default;

  it.each([
    ['student', 'Username', 'bss-8a-ahmad-14'],
    ['staff', 'Username or email', 'accounts@bss.test'],
    ['platform', 'Email', 'owner@edusaas.test'],
  ])('%s portal signs in with a bearer token', async (portal, label, id) => {
    mockParams = { portal };
    replies[`POST /auth/${portal}/login`] = () => ({
      status: 200,
      json: { token: 'tok-1', mustChangePassword: false },
    });
    replies['GET /auth/me'] = () => ({ status: 200, json: ME(false) });
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText(label), ` ${id} `);
    await fireEvent.changeText(screen.getByLabelText('Password'), 'Demo-pass-2026');
    await fireEvent.press(screen.getByText('Sign in'));
    await waitFor(() => expect(useSession.getState().status).toBe('in'));
    const post = seen.find((s) => s.method === 'POST')!;
    expect(post.body).toEqual({ identifier: id, password: 'Demo-pass-2026' });
    expect(post.headers['x-edusaas-client']).toMatch(/^android\//);
    expect(seen.find((s) => s.url === '/auth/me')!.headers.authorization).toBe('Bearer tok-1');
  });

  it('shows the server’s message on a wrong password and stays signed out', async () => {
    mockParams = { portal: 'student' };
    replies['POST /auth/student/login'] = () => ({
      status: 401,
      json: { error: { code: 'INVALID_CREDENTIALS', message: 'Wrong username or password' } },
    });
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('Username'), 'someone');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'nope');
    await fireEvent.press(screen.getByText('Sign in'));
    expect(await screen.findByText('Wrong username or password')).toBeTruthy();
    expect(useSession.getState().status).toBe('out');
  });

  it('asks for details instead of sending an empty form', async () => {
    await render(<Login />);
    await fireEvent.press(screen.getByText('Sign in'));
    expect(screen.getByText('Enter your sign-in details.')).toBeTruthy();
    expect(seen).toHaveLength(0);
  });
});

describe('first sign-in password change', () => {
  const Change = require('../app/change-password').default;

  it('keeps the phone signed in with the new session', async () => {
    useSession.setState({ status: 'in', me: ME(true) as never });
    replies['POST /auth/change-password'] = () => ({ status: 200, json: { redirectTo: '/student', token: 'tok-new' } });
    replies['GET /auth/me'] = () => ({ status: 200, json: ME(false) });
    await render(<Change />);
    expect(screen.getByText(/first sign-in/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Temporary password'), 'Temp-pass-1');
    await fireEvent.changeText(screen.getByLabelText('New password'), 'My-own-pass-22');
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'My-own-pass-22');
    await fireEvent.press(screen.getByText('Save password'));
    await waitFor(() => expect(useSession.getState().me?.user.mustChangePassword).toBe(false));
    expect(seen.find((s) => s.url === '/auth/me')!.headers.authorization).toBe('Bearer tok-new');
    expect(useSession.getState().status).toBe('in');
  });

  it('catches a typo in the confirmation before calling the server', async () => {
    useSession.setState({ status: 'in', me: ME(true) as never });
    await render(<Change />);
    await fireEvent.changeText(screen.getByLabelText('Temporary password'), 'Temp-pass-1');
    await fireEvent.changeText(screen.getByLabelText('New password'), 'My-own-pass-22');
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'My-own-pass-23');
    await fireEvent.press(screen.getByText('Save password'));
    expect(screen.getByText('The two new passwords don’t match.')).toBeTruthy();
    expect(seen).toHaveLength(0);
  });
});
