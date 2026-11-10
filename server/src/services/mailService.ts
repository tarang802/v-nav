import nodemailer from 'nodemailer';
import type { Config } from '../config/env.js';
import type { Logger } from '../observability/logger.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Integration point for mail delivery. Swap the transport without touching services. */
export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

/** SMTP transport. Locally this points at Mailpit; in production at any SMTP provider. */
export class SmtpMailTransport implements MailTransport {
  private readonly transporter;

  constructor(
    private readonly config: Config['smtp'],
    private readonly logger: Logger,
  ) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user ? { auth: { user: config.user, pass: config.pass ?? '' } } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.config.from, ...message });
    // Recipient is not logged (personal data); the subject is enough to trace delivery.
    this.logger.info({ subject: message.subject }, 'mail sent');
  }
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Builds the transactional emails. Content only; delivery is the transport's job. */
export class MailService {
  constructor(
    private readonly transport: MailTransport,
    private readonly appPublicUrl: string,
  ) {}

  sendVerificationCode(to: string, name: string, code: string, ttlMinutes: number) {
    return this.transport.send({
      to,
      subject: `${code} is your V-Nav verification code`,
      text: `Hi ${name},\n\nYour V-Nav verification code is ${code}. It expires in ${ttlMinutes} minutes.\n\nIf you did not sign up for V-Nav, ignore this email.`,
      html: `<p>Hi ${escapeHtml(name)},</p><p>Your V-Nav verification code is</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in ${ttlMinutes} minutes.</p><p>If you did not sign up for V-Nav, ignore this email.</p>`,
    });
  }

  /** The token travels in the URL fragment, which browsers never send to servers or put in Referer headers. */
  sendPasswordReset(to: string, name: string, token: string, ttlMinutes: number) {
    const link = `${this.appPublicUrl}/reset-password#token=${encodeURIComponent(token)}`;
    return this.transport.send({
      to,
      subject: 'Reset your V-Nav password',
      text: `Hi ${name},\n\nReset your password with this link (valid for ${ttlMinutes} minutes, single use):\n${link}\n\nIf you did not ask for this, ignore this email. Your password has not changed.`,
      html: `<p>Hi ${escapeHtml(name)},</p><p><a href="${escapeHtml(link)}">Reset your V-Nav password</a> (valid for ${ttlMinutes} minutes, single use).</p><p>If you did not ask for this, ignore this email. Your password has not changed.</p>`,
    });
  }
}
