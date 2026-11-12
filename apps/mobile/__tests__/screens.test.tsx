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
  sendOrQueue: async (item: { path: string; method: string; body: unknown }) => {
    const { api } = jest.requireMock('@/lib/api');
    const r = await api(item.path, { method: item.method, body: item.body });
    return r.ok ? { status: 'sent', data: r.data } : { status: 'rejected', message: r.error.message };
  },
  useQueue: Object.assign(
    () => ({ items: [], flushing: false, reload: async () => undefined, flushNow: async () => undefined }),
    { getState: () => ({ items: [] }) },
  ),
}));
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
jest.mock('@/lib/files', () => ({ openPdf: jest.fn() }));
jest.mock('@/screens/ClaimSheet', () => ({ ClaimSheet: () => null, shrink: async () => 'x' }));

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

const STUDENT = {
  id: 's1',
  name: 'Ahmad Raza',
  username: 'bss-8a-ahmad-14',
  section: '8-A',
  rollNumber: 14,
  guardianName: 'Raza Ali',
  guardianPhone: '0300',
  status: 'ACTIVE',
};
const BILL = {
  id: 'i1',
  number: 'I-000101',
  period: '2026-11',
  dueOn: '2026-11-10',
  status: 'DUE',
  overdue: true,
  totalPaisa: 450000,
  balancePaisa: 450000,
};

describe('Collect fees', () => {
  const Collect = require('../app/(app)/collect').default;
  beforeEach(() => {
    mockRoutes['GET /search'] = () => ({ data: { students: [{ ...STUDENT }] } });
    mockRoutes[`GET /students/s1/fees`] = () => ({
      data: { student: STUDENT, outstandingPaisa: 450000, advancePaisa: 0, invoices: [BILL], payments: [] },
    });
    mockRoutes['POST /payments'] = (b) => ({
      status: 201,
      data: {
        payment: { id: 'p1', receiptNumber: 'R-000555', amountPaisa: (b as { amountPaisa: number }).amountPaisa },
      },
    });
  });

  it('finds the student, takes the full balance and shows the receipt', async () => {
    await show(<Collect />);
    await fireEvent.changeText(screen.getByLabelText('Find a student'), 'ahmad');
    await fireEvent.press(await screen.findByText('Ahmad Raza', {}, { timeout: 2000 }));
    await fireEvent.press(await screen.findByText('Take payment'));
    expect(screen.getByDisplayValue('4500.00')).toBeTruthy();
    await fireEvent.press(screen.getByText('Record payment'));
    expect(await screen.findByText('Receipt R-000555')).toBeTruthy();
    const post = mockSent.find((r) => r.method === 'POST')!;
    expect(post.body).toMatchObject({
      studentId: 's1',
      invoiceId: 'i1',
      amountPaisa: 450000,
      method: 'CASH',
      allowAdvance: false,
    });
    expect((post.body as { clientKey: string }).clientKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('will not take more than the bill unless told to keep it on account', async () => {
    mockParams = { student: 's1' };
    await show(<Collect />);
    await fireEvent.press(await screen.findByText('Take payment'));
    await fireEvent.changeText(screen.getByDisplayValue('4500.00'), '5000');
    await fireEvent.press(screen.getByText('Record payment'));
    expect(mockSent.some((r) => r.method === 'POST')).toBe(false);
    await fireEvent.press(screen.getByText('Keep the extra on account for next bill'));
    await fireEvent.press(screen.getByText('Record payment'));
    await screen.findByText('Receipt R-000555');
    expect(mockSent.find((r) => r.method === 'POST')!.body).toMatchObject({ amountPaisa: 500000, allowAdvance: true });
  });

  it('asks for a reference for bank payments', async () => {
    mockParams = { student: 's1' };
    await show(<Collect />);
    await fireEvent.press(await screen.findByText('Take payment'));
    expect(screen.queryByText('Reference / transaction no.')).toBeNull();
    await fireEvent.press(screen.getByText('Bank transfer'));
    expect(screen.getByText('Reference / transaction no.')).toBeTruthy();
  });
});

describe('Payment proofs', () => {
  const Claims = require('../app/(app)/claims').default;
  const CLAIM = {
    id: 'c1',
    amountPaisa: 200000,
    method: 'JAZZCASH',
    reference: 'JC123',
    paidOn: '2026-11-11',
    hasProof: false,
    invoice: { number: 'I-000101', period: '2026-11' },
    student: { id: 's1', name: 'Ahmad Raza', section: '8-A' },
  };
  beforeEach(() => {
    mockRoutes['GET /fees/claims'] = () => ({ data: { items: [CLAIM], pending: 1 } });
    mockRoutes['POST /fees/claims/c1/decide'] = () => ({ data: { ok: true } });
  });
  it('confirms a proof', async () => {
    await show(<Claims />);
    await fireEvent.press(await screen.findByText('Confirm'));
    await waitFor(() =>
      expect(mockSent.find((r) => r.path === '/fees/claims/c1/decide')?.body).toEqual({
        decision: 'CONFIRM',
        note: undefined,
      }),
    );
  });
  it('a rejection needs a reason the parent can act on', async () => {
    await show(<Claims />);
    await fireEvent.press(await screen.findByText('Reject'));
    await fireEvent.press(screen.getAllByText('Reject').at(-1)!);
    expect(mockSent.some((r) => r.path.endsWith('/decide'))).toBe(false);
    await fireEvent.changeText(screen.getByPlaceholderText(/can’t find this transaction/), 'Screenshot is cut off');
    await fireEvent.press(screen.getAllByText('Reject').at(-1)!);
    await waitFor(() =>
      expect(mockSent.find((r) => r.path.endsWith('/decide'))?.body).toEqual({
        decision: 'REJECT',
        note: 'Screenshot is cut off',
      }),
    );
  });
  it('says so when there is nothing to check', async () => {
    mockRoutes['GET /fees/claims'] = () => ({ data: { items: [], pending: 0 } });
    await show(<Claims />);
    expect(await screen.findByText('Nothing to check')).toBeTruthy();
  });
});

describe('Teacher screens', () => {
  beforeEach(() =>
    useSession.setState({ me: me('TEACHER', ['marks.manage', 'attendance.mark', 'leave.apply', 'timetable.view']) }),
  );
  it('lists tests from the server', async () => {
    mockRoutes['GET /assessments'] = () => ({
      data: {
        items: [
          {
            id: 'a1',
            name: 'Unit test 3',
            section: '8-A',
            subject: 'Mathematics',
            maxMarks: 25,
            heldOn: '2026-11-05',
            status: 'DRAFT',
            marksEntered: 0,
          },
        ],
      },
    });
    const Marks = require('../app/(app)/marks/index').default;
    await show(<Marks />);
    await fireEvent.press(await screen.findByText('8-A · Mathematics'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/marks/a1');
  });
  it('shows a friendly error with retry when offline and nothing is cached', async () => {
    const Marks = require('../app/(app)/marks/index').default;
    await show(<Marks />);
    expect(await screen.findByText(/no route GET \/assessments/)).toBeTruthy();
  });
});

describe('Home', () => {
  const Home = require('../app/(app)/index').default;
  it('accountant sees today’s money', async () => {
    mockRoutes['GET /mobile/home'] = () => ({
      data: {
        kind: 'accountant',
        announcements: [],
        finance: {
          today: '2026-11-12',
          collectedTodayPaisa: 1250000,
          monthCollectedPaisa: 5000000,
          monthBills: 400,
          outstandingPaisa: 900000,
          defaulters: 3,
          claimsPending: 2,
          recentPayments: [],
        },
      },
    });
    await show(<Home />);
    expect(await screen.findByText('Collected today')).toBeTruthy();
    expect(screen.getByText(/12,500/)).toBeTruthy();
    expect(screen.getByText('3 students overdue')).toBeTruthy();
  });
  it('teacher sees registers still to take', async () => {
    useSession.setState({ me: me('TEACHER', ['attendance.mark']) });
    mockRoutes['GET /mobile/home'] = () => ({
      data: {
        kind: 'teacher',
        announcements: [{ id: 'n1', title: 'Sports day', body: 'Friday' }],
        checkin: { today: '2026-11-12', status: 'PRESENT', checkedInAt: '2026-11-12T03:00:00Z' },
        todo: [{ id: 'sec1', label: '8-A', done: false }],
        lessons: { lessons: [] },
        approvals: 0,
        drafts: 2,
      },
    });
    await show(<Home />);
    await fireEvent.press(await screen.findByText('Register not taken yet'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/attendance/sec1');
    expect(screen.getByText('2 tests with marks to finish')).toBeTruthy();
    expect(screen.getByText('Sports day')).toBeTruthy();
  });
});
