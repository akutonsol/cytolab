import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Thin SMTP mailer. In dev it points at MailHog (SMTP localhost:1025), so invite
 * and reset emails are captured in the MailHog UI instead of being sent. The
 * transport is created lazily and reused.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transport?: nodemailer.Transporter;

  constructor(private config: ConfigService) {}

  private get from(): string {
    return this.config.get<string>('SMTP_FROM') ?? 'no-reply@cytolab.local';
  }

  private getTransport(): nodemailer.Transporter {
    if (!this.transport) {
      this.transport = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST') ?? 'localhost',
        port: Number(this.config.get<string>('SMTP_PORT') ?? 1025),
        secure: false,
        // MailHog needs no auth; in prod, inject SMTP_USER/SMTP_PASS here.
      });
    }
    return this.transport;
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.getTransport().sendMail({ from: this.from, to, subject, html });
    } catch (err) {
      // Never let a mail failure leak account existence or break the request;
      // log and move on (the caller's response is identical regardless).
      this.logger.error(`Failed to send "${subject}" to ${to}: ${(err as Error).message}`);
    }
  }

  private portalUrl(path: string, token: string): string {
    const base = this.config.get<string>('PORTAL_WEB_URL') ?? 'http://localhost:3001';
    return `${base.replace(/\/$/, '')}${path}?token=${encodeURIComponent(token)}`;
  }

  sendInvite(to: string, firstName: string, labName: string, token: string): Promise<void> {
    const link = this.portalUrl('/accept-invite', token);
    return this.send(
      to,
      `You've been invited to the ${labName} client portal`,
      `<p>Hi ${firstName},</p>
       <p>${labName} has invited you to the client portal. Set your password to get started:</p>
       <p><a href="${link}">Accept your invitation</a></p>
       <p>This link is single-use and expires soon.</p>`,
    );
  }

  sendReset(to: string, firstName: string, labName: string, token: string): Promise<void> {
    const link = this.portalUrl('/reset', token);
    return this.send(
      to,
      `Reset your ${labName} client portal password`,
      `<p>Hi ${firstName},</p>
       <p>We received a request to reset your password. If this was you, continue here:</p>
       <p><a href="${link}">Reset your password</a></p>
       <p>This link is single-use and expires soon. If you didn't request it, ignore this email.</p>`,
    );
  }
}
