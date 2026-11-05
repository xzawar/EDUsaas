import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportError, resetMonitoringForTests, scrubText } from '@/server/monitoring';

describe('scrubText (spec §9.7: no personal data leaves in error reports)', () => {
  it('removes emails, phone numbers and tokens', () => {
    const out = scrubText('user ali@school.pk phone +92 300 1234567 token abcdefghijklmnopqrstuvwxyz123456');
    expect(out).toBe('user [email] phone [number] token [token]');
  });
});

describe('reportError', () => {
  const dsnBefore = process.env.SENTRY_DSN;
  afterEach(() => {
    vi.unstubAllGlobals();
    if (dsnBefore === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = dsnBefore;
    resetMonitoringForTests();
  });

  it('does nothing without SENTRY_DSN', async () => {
    delete process.env.SENTRY_DSN;
    resetMonitoringForTests();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await reportError(new Error('boom'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts a scrubbed envelope when SENTRY_DSN is set, and never throws', async () => {
    process.env.SENTRY_DSN = 'https://publickey@o1.ingest.example.io/42';
    resetMonitoringForTests();
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(reportError(new Error('failed for a@b.co'), { route: '/api/x' })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://o1.ingest.example.io/api/42/envelope/');
    expect(init.headers['X-Sentry-Auth']).toContain('sentry_key=publickey');
    expect(init.body).toContain('failed for [email]');
    expect(init.body).not.toContain('a@b.co');
    expect(init.body).toContain('"route":"/api/x"');
  });
});
