import 'server-only';

/**
 * Pluggable notification channel (spec §14: email/SMS deferred). Development logs the message to the
 * server console; a real provider is plugged in before production. Never returns content to the client.
 */
export type MailMessage = { to: string; subject: string; text: string };

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

class ConsoleMailer implements Mailer {
  async send(message: MailMessage) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(`[mailer] No email provider configured; message to ${message.to} not sent.`);
      return;
    }
    console.info(`[mailer:dev] to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}

/**
 * Resend (https://resend.com), over its HTTP API: no SDK. On when RESEND_API_KEY and MAIL_FROM are set (MAIL_FROM is
 * a sender on a domain verified in Resend, e.g. "EDUsaas <no-reply@yourdomain.com>"). A failed send is logged, never
 * thrown, so a mail outage can't break sign-in flows; the message body is never logged.
 */
class ResendMailer implements Mailer {
  constructor(
    private key: string,
    private from: string,
  ) {}
  async send(message: MailMessage) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${this.key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) console.error(`[mailer] Resend refused the message (${res.status}).`);
    } catch (e) {
      console.error(`[mailer] Resend unreachable: ${(e as Error).name}`);
    }
  }
}

function defaultMailer(): Mailer {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  return key && from ? new ResendMailer(key, from) : new ConsoleMailer();
}

let current: Mailer = defaultMailer();
export const mailer = (): Mailer => current;
/** Test hook. */
export function setMailer(m: Mailer) {
  current = m;
}
