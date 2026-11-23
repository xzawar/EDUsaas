import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('mailer', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('sends through Resend when a key and sender are set', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('MAIL_FROM', 'EDUsaas <no-reply@example.com>');
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { mailer } = await import('@/server/mail/mailer');
    await mailer().send({ to: 'a@b.test', subject: 'Reset', text: 'Link' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(JSON.parse(String(init.body))).toMatchObject({ to: ['a@b.test'], subject: 'Reset' });
  });

  it('never throws when the provider fails', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('MAIL_FROM', 'x@example.com');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down');
      }),
    );
    const { mailer } = await import('@/server/mail/mailer');
    await expect(mailer().send({ to: 'a@b.test', subject: 's', text: 't' })).resolves.toBeUndefined();
  });

  it('without a key it does not call out', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { mailer } = await import('@/server/mail/mailer');
    await mailer().send({ to: 'a@b.test', subject: 's', text: 't' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
