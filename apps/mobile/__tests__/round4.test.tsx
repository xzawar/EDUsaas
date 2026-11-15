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

describe('notices', () => {
  it('a teacher posts to their own class (no school-wide option)', async () => {
    useSession.setState({ me: me('TEACHER', ['announcements.class']) });
    mockRoutes['GET /announcements'] = () => ({ data: { items: [] } });
    mockRoutes['GET /mobile/home'] = () => ({ data: { overview: { sections: [{ id: 'sec1', label: '8-A' }] } } });
    mockRoutes['POST /announcements'] = () => ({ status: 201, data: { id: 'n1' } });
    const Notices = require('../app/(app)/announcements').default;
    await show(<Notices />);
    await fireEvent.press(await screen.findByText('New'));
    expect(screen.queryByText('Everyone')).toBeNull();
    expect(await screen.findByText('8-A')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Sports day on Friday'), 'Bring your atlas');
    await fireEvent.changeText(screen.getAllByDisplayValue('')[0]!, 'Geography test tomorrow');
    await fireEvent.press(screen.getByText('Post notice'));
    await waitFor(() =>
      expect(mockSent.find((r) => r.method === 'POST')!.body).toMatchObject({
        title: 'Bring your atlas',
        body: 'Geography test tomorrow',
        audience: 'SECTION',
        sectionId: 'sec1',
      }),
    );
  });
});

describe('people → staff', () => {
  it('loads staff only, offers Add for any role, and shows the Clerk merge', async () => {
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
    mockRoutes['POST /staff'] = () => ({
      status: 201,
      data: { id: 'u9', email: 'p@bss.test', temporaryPassword: 'Temp-1234' },
    });
    const People = require('../app/(app)/students/index').default;
    await show(<People />);
    await fireEvent.press(await screen.findByText('Staff'));
    expect(await screen.findByText('Make one Clerk')).toBeTruthy();
    expect(mockSent.some((r) => r.path.startsWith('/users?staff=true'))).toBe(true);
    await fireEvent.press(screen.getByText('Add'));
    await fireEvent.press(screen.getByText('Principal'));
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'New Principal');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'p@bss.test');
    await fireEvent.press(screen.getByText('Add principal'));
    expect(await screen.findByText('Temp-1234')).toBeTruthy();
    expect(mockSent.find((r) => r.path === '/staff')!.body).toEqual({
      role: 'PRINCIPAL',
      displayName: 'New Principal',
      email: 'p@bss.test',
    });
  });
});

describe('student timetable', () => {
  it('shows the full time and the teacher for each lesson', async () => {
    useSession.setState({ me: { ...me('STUDENT', ['timetable.view']), portal: 'STUDENT' } });
    const today = new Date().getDay() || 7;
    mockRoutes['GET /timetable/me'] = () => ({
      data: {
        days: [{ day: today, name: 'Today' }],
        periods: [{ periodNo: 1, startsAt: '08:00', endsAt: '08:40', isBreak: false }],
        cells: {
          [`${today}:1`]: {
            slotId: 's1',
            isBreak: false,
            entry: { subject: 'Computer Science', teacher: 'Ali Khan', room: null },
          },
        },
      },
    });
    const Timetable = require('../app/(app)/more/timetable').default;
    await show(<Timetable />);
    expect(await screen.findByText('08:00-08:40')).toBeTruthy();
    expect(screen.getByText('Computer Science')).toBeTruthy();
    expect(screen.getByText('Ali Khan')).toBeTruthy();
    expect(screen.queryByText('Edit')).toBeNull();
  });
});

describe('teacher card', () => {
  it('offers call and WhatsApp when the school recorded a phone', async () => {
    const { TeacherCard } = require('../src/screens/TeacherCard');
    await show(
      <TeacherCard
        teacher={{ id: 't1', name: 'Ali Khan', phone: '0300-1234567' }}
        subjects={['Mathematics']}
        classTeacher
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText('Your class teacher · Mathematics')).toBeTruthy();
    expect(screen.getByText('Call')).toBeTruthy();
    expect(screen.getByText('WhatsApp')).toBeTruthy();
  });
});

describe('set fees', () => {
  it('saves what a class pays for each fee', async () => {
    mockRoutes['GET /academic-years'] = () => ({ data: { items: [{ id: 'y1', name: '2026-27', status: 'CURRENT' }] } });
    mockRoutes['GET /fees/structures'] = () => ({
      data: {
        year: { id: 'y1', name: '2026-27' },
        classes: [{ id: 'c8', name: '8' }],
        heads: [{ id: 'h1', name: 'Tuition', kind: 'MONTHLY' }],
        amounts: { c8: { h1: 450000 } },
      },
    });
    mockRoutes['PUT /fees/structures'] = () => ({ data: { saved: 1 } });
    const Setup = require('../app/(app)/more/fee-setup').default;
    await show(<Setup />);
    const box = await screen.findByLabelText('Tuition amount');
    await fireEvent.changeText(box, '5000');
    await fireEvent.press(screen.getByText('Save fees'));
    await waitFor(() =>
      expect(mockSent.find((r) => r.method === 'PUT')!.body).toEqual({
        rows: [{ classId: 'c8', feeHeadId: 'h1', amountPaisa: 500000 }],
      }),
    );
  });
});
