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

let current: Mailer = new ConsoleMailer();
export const mailer = (): Mailer => current;
/** Test hook. */
export function setMailer(m: Mailer) {
  current = m;
}
