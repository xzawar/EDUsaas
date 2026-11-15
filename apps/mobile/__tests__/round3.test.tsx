import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { useSession, type Me } from '@/lib/session';

/* A tiny fake EDUsaas server: route table → response. Every request is recorded so tests can check bodies. */
type Handler = (body: unknown) => { status?: number; data?: unknown; error?: { code: string; message: string } };
const mockRoutes: Record<string, Handler> = {};
const mockSent: { method: string; path: string; body: unknown }[] = [];
jest.mock('@/lib/api', () => {
  class NetworkError extends Error {}
  const api = async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const method = init.method ?? (init.body !== undefined ? 'POST' : 'GET');
    mockSent.push({ method, path, body: init.body });
    const h = mockRoutes[`${method} ${path}`] ?? mockRoutes[`${method} ${path.split('?')[0]}`];
    if (!h) return { ok: false, status: 404, error: { code: 'NOT_FOUND', message: `no route ${method} ${path}` } };
    const r = h(init.body);
    return r.error !== undefined
      ? { ok: false, status: r.status ?? 400, error: r.error }
      : { ok: true, status: r.status ?? 200, data: r.data };
  };
  return {
    NetworkError,
    api,
    get: async (p: string) => {
      const r = await api(p);
      if (!r.ok) throw new Error(r.error?.message);
      return r.data;
    },
    fileUrl: (p: string) => `http://test/api/v1${p}`,
    authHeaders: async () => ({}),
  };
});
jest.mock('@/lib/queue', () => ({
  setQueueOwner: () => undefined,
  sendOrQueue: async (item: { path: string; method: string; body: unknown }) => {
    const { api } = jest.requireMock('@/lib/api');
    const r = await api(item.path, { method: item.method, body: item.body });
    return r.ok ? { status: 'sent', data: r.data } : { status: 'rejected', message: r.error.message };
  },
  useQueue: Object.assign(
    () => ({ items: [], flushing: false, reload: async () => undefined, flushNow: async () => undefined }),
    { getState: () => ({ items: [], flushNow: async () => undefined }) },
  ),
}));
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
  Stack: { Screen: () => null },
}));
jest.mock('@/lib/files', () => ({ openPdf: jest.fn() }));

const me = (role: string, permissions: string[]): Me => ({
  user: { id: 'u1', role, displayName: 'Sana Accounts', username: null, email: 'a@b.test', mustChangePassword: false },
  portal: 'STAFF',
  tenant: { id: 't', name: 'Bright Star School', prefix: 'bss' },
  permissions,
});
async function show(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
beforeEach(() => {
  for (const k of Object.keys(mockRoutes)) delete mockRoutes[k];
  mockSent.length = 0;
  mockParams = {};
  mockPush.mockReset();
  useSession.setState({
    status: 'in',
    me: me('ACCOUNTANT', ['fees.collect', 'fees.manage', 'finance.read', 'expenses.manage', 'payroll.manage']),
  });
});

describe('student marks', () => {
  const RESULTS = {
    items: [
      {
        id: 'r2',
        subject: 'Science',
        name: 'Quiz 2',
        heldOn: '2026-11-10',
        chapter: 'Ch 3: Light',
        details: 'Open book',
        score: 18,
        absent: false,
        maxMarks: 20,
        pct: 90,
        grade: 'A',
      },
      {
        id: 'r1',
        subject: 'Mathematics',
        name: 'Quiz 1',
        heldOn: '2026-11-03',
        chapter: null,
        details: null,
        score: null,
        absent: true,
        maxMarks: 25,
        pct: null,
        grade: null,
      },
    ],
    subjects: [{ subject: 'Science', pct: 90, grade: 'A' }],
  };
  beforeEach(() => {
    useSession.setState({ me: { ...me('STUDENT', ['self.records']), portal: 'STUDENT' } });
    mockRoutes['GET /results/me'] = () => ({ data: RESULTS });
  });
  it('shows the latest two up top and only subject, date and marks in the list; absent is A', async () => {
    const Marks = require('../app/(app)/marks/index').default;
    await show(<Marks />);
    expect(await screen.findAllByText('Science')).toHaveLength(2);
    expect(screen.getAllByText('A').length).toBeGreaterThan(0);
    expect(screen.queryByText('Quiz 2')).toBeNull();
    await fireEvent.press(screen.getAllByText('Mathematics')[1]!);
    expect(mockPush).toHaveBeenCalledWith('/(app)/marks/result/r1');
  });
  it('opens a test’s details with the chapter and teacher notes', async () => {
    mockParams = { id: 'r2' };
    const Detail = require('../app/(app)/marks/result/[id]').default;
    await show(<Detail />);
    expect(await screen.findByText('Ch 3: Light')).toBeTruthy();
    expect(screen.getByText('Open book')).toBeTruthy();
    expect(screen.getByText('18/20')).toBeTruthy();
  });
});

describe('I have paid', () => {
  const { ClaimSheet } = require('../src/screens/ClaimSheet');
  const ACCOUNTS = [
    { id: 'b', method: 'BANK', label: 'Meezan Bank', accountTitle: 'BSS', accountNumber: '0101', iban: 'PK36MEZN0001' },
    { id: 'j', method: 'JAZZCASH', label: 'JazzCash', accountTitle: 'BSS', accountNumber: '0300-1234567', iban: null },
  ];
  it('offers only the school’s own accounts, shows the chosen one, and asks for no transaction ID', async () => {
    await show(
      <ClaimSheet
        bills={[{ id: 'i1', number: 'I-1', period: '2026-11', balancePaisa: 450000 }]}
        accounts={ACCOUNTS}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText('Bank')).toBeTruthy();
    expect(screen.getByText('JazzCash')).toBeTruthy();
    expect(screen.queryByText('Easypaisa')).toBeNull();
    expect(screen.queryByText('Cheque')).toBeNull();
    expect(screen.getByText('PK36MEZN0001')).toBeTruthy();
    await fireEvent.press(screen.getByText('JazzCash'));
    expect(screen.getByText('0300-1234567')).toBeTruthy();
    expect(screen.queryByText(/Transaction ID/)).toBeNull();
    // Without a screenshot nothing is sent.
    await fireEvent.press(screen.getByText('Send'));
    expect(mockSent).toHaveLength(0);
  });
});

describe('leave details', () => {
  it('the person deciding adds a note that goes with the answer', async () => {
    useSession.setState({ me: me('TEACHER', ['leave.apply']) });
    mockParams = { id: 'l1', from: 'approve' };
    mockRoutes['GET /leave/approvals'] = () => ({
      data: {
        items: [
          {
            id: 'l1',
            applicant: 'Ahmad Raza',
            applicantRole: 'STUDENT',
            section: '8-A',
            type: 'Sick',
            fromDate: '2026-11-17',
            toDate: '2026-11-18',
            days: 2,
            reason: 'Fever since last night',
            status: 'PENDING',
          },
        ],
      },
    });
    mockRoutes['POST /leave/l1/decision'] = () => ({ data: { ok: true } });
    const Detail = require('../app/(app)/leave/[id]').default;
    await show(<Detail />);
    expect(await screen.findByText('Fever since last night')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('They will see this with your answer'), 'Get well soon');
    await fireEvent.press(screen.getByText('Approve'));
    await waitFor(() =>
      expect(mockSent.find((r) => r.method === 'POST')!.body).toEqual({ decision: 'APPROVED', note: 'Get well soon' }),
    );
  });
  it('the list shows only who, when and status (the reason is one tap away)', async () => {
    useSession.setState({ me: me('STUDENT', ['leave.apply']) });
    mockRoutes['GET /leave'] = () => ({
      data: {
        items: [
          {
            id: 'l2',
            applicant: 'Me',
            applicantRole: 'STUDENT',
            type: 'Sick',
            fromDate: '2026-11-17',
            toDate: '2026-11-17',
            days: 1,
            reason: 'Dentist',
            status: 'APPROVED',
          },
        ],
      },
    });
    const Leave = require('../app/(app)/leave/index').default;
    await show(<Leave />);
    expect(await screen.findByText('Sick')).toBeTruthy();
    expect(screen.queryByText('Dentist')).toBeNull();
    await fireEvent.press(screen.getByText('Sick'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(app)/leave/[id]', params: { id: 'l2', from: 'mine' } });
  });
});

describe('people', () => {
  it('the admin switches to Staff and can fold the accountant and admissions into one Clerk', async () => {
    useSession.setState({ me: me('SCHOOL_ADMIN', ['users.read', 'users.manage', 'students.write']) });
    mockRoutes['GET /students'] = () => ({ data: { items: [], total: 0 } });
    mockRoutes['GET /users'] = () => ({
      data: {
        items: [
          { id: 'u2', displayName: 'Sana Accounts', role: 'ACCOUNTANT', username: null, status: 'ACTIVE' },
          { id: 'u3', displayName: 'Nadia Malik', role: 'ADMISSIONS_OFFICER', username: null, status: 'ACTIVE' },
        ],
      },
    });
    mockRoutes['POST /users/merge-clerk'] = () => ({ data: { id: 'u2' } });
    const People = require('../app/(app)/students/index').default;
    await show(<People />);
    await fireEvent.press(await screen.findByText('Staff'));
    expect(await screen.findByText('Nadia Malik')).toBeTruthy();
    await fireEvent.press(screen.getByText('Make one Clerk'));
    await fireEvent.press(screen.getByText('Merge into one Clerk'));
    await waitFor(() =>
      expect(mockSent.find((r) => r.path === '/users/merge-clerk')!.body).toEqual({ keepId: 'u2', retireId: 'u3' }),
    );
  });
});
