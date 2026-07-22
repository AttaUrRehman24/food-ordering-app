import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { ChannelProvider, NotificationJob } from '../../domain/types';
import { createStructuredLog, logJson } from '@food-ordering/observability';

function buildMailer(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return null;
  }
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
}

/** Provider abstraction (§3.2) — Gmail/SMTP when configured; otherwise structured log fallback */
export class EmailProvider implements ChannelProvider {
  readonly channel = 'email' as const;
  private transporter: Transporter | null | undefined;

  private mailer(): Transporter | null {
    if (this.transporter === undefined) {
      this.transporter = buildMailer();
    }
    return this.transporter;
  }

  async send(job: NotificationJob): Promise<void> {
    const to = String(job.payload.email ?? job.payload.to ?? '').trim();
    const from =
      process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'FoodApp <noreply@localhost>';

    const mailer = this.mailer();
    if (mailer && to) {
      await mailer.sendMail({
        from,
        to,
        subject: job.title,
        text: job.body,
        html: `<p>${job.body.replace(/\n/g, '<br/>')}</p>`,
      });
      logJson(
        createStructuredLog('notification', 'info', 'email sent', null, {
          userId: job.userId,
          type: job.type,
          title: job.title,
          to,
          via: 'smtp',
        }),
      );
      return;
    }

    logJson(
      createStructuredLog('notification', 'info', 'email sent', null, {
        userId: job.userId,
        type: job.type,
        title: job.title,
        to: to || null,
        via: 'log-only',
        hint: mailer ? 'missing recipient email' : 'SMTP_* not configured — set SMTP_HOST/USER/PASS',
      }),
    );
  }
}

export class SmsProvider implements ChannelProvider {
  readonly channel = 'sms' as const;
  async send(job: NotificationJob): Promise<void> {
    logJson(
      createStructuredLog('notification', 'info', 'sms sent', null, {
        userId: job.userId,
        type: job.type,
        hasOtp: Boolean(job.payload.otpCode),
      }),
    );
  }
}

export class PushProvider implements ChannelProvider {
  readonly channel = 'push' as const;
  async send(job: NotificationJob): Promise<void> {
    logJson(
      createStructuredLog('notification', 'info', 'push sent', null, {
        userId: job.userId,
        type: job.type,
        title: job.title,
      }),
    );
  }
}

export class InAppProvider implements ChannelProvider {
  readonly channel = 'in_app' as const;
  async send(job: NotificationJob): Promise<void> {
    logJson(
      createStructuredLog('notification', 'info', 'in-app stored', null, {
        userId: job.userId,
        type: job.type,
        title: job.title,
      }),
    );
  }
}
