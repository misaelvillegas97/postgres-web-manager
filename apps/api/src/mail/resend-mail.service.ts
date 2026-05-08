import { Injectable, Logger } from '@nestjs/common';
import { AuthOtpPurpose } from '@postgres-web-manager/contracts';
import { Resend } from 'resend';
import { getEnv } from '../config/env.config';
import {
  renderTransactionalEmail,
  type RenderedEmail,
  type TransactionalEmailTemplateInput,
} from './email-template';

export interface SendOtpEmailInput {
  to: string;
  otp: string;
  purpose: AuthOtpPurpose;
  expiresInSeconds: number;
}

export interface SendTransactionalEmailInput extends TransactionalEmailTemplateInput {
  to: string;
}

@Injectable()
export class ResendMailService {
  private readonly logger = new Logger(ResendMailService.name);
  private client: Resend | null = null;

  async sendTransactionalEmail(
    input: SendTransactionalEmailInput,
  ): Promise<void> {
    const email = renderTransactionalEmail(input);
    await this.sendRenderedEmail(input.to, email);
  }

  async sendOtpEmail(input: SendOtpEmailInput): Promise<void> {
    const minutes = Math.ceil(input.expiresInSeconds / 60);
    await this.sendTransactionalEmail({
      to: input.to,
      subject: this.getSubject(input.purpose),
      preheader: `Your PgStudio code expires in ${minutes} minutes.`,
      eyebrow: this.getEyebrow(input.purpose),
      title: this.getTitle(input.purpose),
      body: this.getBody(input.purpose),
      highlight: {
        label: 'One-time code',
        value: input.otp,
        supportingText: `Expires in ${minutes} minutes. Never share this code with anyone.`,
        monospace: true,
      },
      callout: {
        title: 'Security note',
        body: 'PgStudio will never ask for your password or database credentials by email. If you did not request this code, no action is needed.',
      },
    });
  }

  private async sendRenderedEmail(
    to: string,
    email: RenderedEmail,
  ): Promise<void> {
    const env = getEnv();
    if (env.NODE_ENV === 'test') {
      return;
    }

    if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
      this.logger.warn(
        `Skipping email to ${to}: RESEND_API_KEY or MAIL_FROM is not configured.`,
      );
      return;
    }

    const resend = this.getClient(env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: env.MAIL_FROM,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    if (error) {
      const message =
        typeof error.message === 'string'
          ? error.message
          : JSON.stringify(error);
      throw new Error(`Failed to send email with Resend: ${message}`);
    }
  }

  private getClient(apiKey: string): Resend {
    this.client ??= new Resend(apiKey);
    return this.client;
  }

  private getSubject(purpose: AuthOtpPurpose): string {
    switch (purpose) {
      case AuthOtpPurpose.PASSWORD_RESET:
        return 'Reset your PgStudio password';
      case AuthOtpPurpose.EMAIL_CONFIRMATION:
      default:
        return 'Confirm your PgStudio email';
    }
  }

  private getEyebrow(purpose: AuthOtpPurpose): string {
    switch (purpose) {
      case AuthOtpPurpose.PASSWORD_RESET:
        return 'Password reset';
      case AuthOtpPurpose.EMAIL_CONFIRMATION:
      default:
        return 'Email confirmation';
    }
  }

  private getTitle(purpose: AuthOtpPurpose): string {
    switch (purpose) {
      case AuthOtpPurpose.PASSWORD_RESET:
        return 'Use this code to reset your password';
      case AuthOtpPurpose.EMAIL_CONFIRMATION:
      default:
        return 'Use this code to confirm your email';
    }
  }

  private getBody(purpose: AuthOtpPurpose): string[] {
    switch (purpose) {
      case AuthOtpPurpose.PASSWORD_RESET:
        return [
          'We received a request to reset the password for your PgStudio account.',
          'Enter the code below in the password reset screen to continue.',
        ];
      case AuthOtpPurpose.EMAIL_CONFIRMATION:
      default:
        return [
          'Welcome to PgStudio. Confirm your email to finish securing your workspace access.',
          'Enter the code below in the verification screen to continue.',
        ];
    }
  }
}
