/**
 * Client mailer bridge for Bodhin platform.
 * Dispatches approval emails to educators via SMTP service (thebodhin@gmail.com)
 * with automatic fallback to local outbox log.
 */
import { db } from './mockDb';

export interface EducatorApprovalEmailInput {
  educatorEmail: string;
  educatorName: string;
  workspaceName: string;
  slug: string;
  trialDays: number;
  trialPlan: string;
  adminEmail?: string;
}

export interface MailerResult {
  ok: boolean;
  method: 'smtp_live' | 'smtp_simulated' | 'outbox_fallback';
  message: string;
  sentTo: string;
  adminBcc: string;
  subject: string;
}

const MAILER_BASE_URL = process.env.EXPO_PUBLIC_MAILER_URL || 'http://localhost:3001';

export async function sendEducatorApprovalEmail(input: EducatorApprovalEmailInput): Promise<MailerResult> {
  const subject = `🎉 Congratulations! Your Educator Account has been Approved - Bodhin`;
  const adminBcc = input.adminEmail || 'thebodhin@gmail.com';

  const summaryBody = `Dear ${input.educatorName}, your educator application for ${input.workspaceName} is approved! Your workspace is live at https://${input.slug}.thebodhin.com with a ${input.trialDays}-day ${input.trialPlan} trial.`;

  // Always record in growth outbox for full platform visibility & audit
  try {
    if (db.growth && Array.isArray(db.growth.outbox)) {
      db.growth.outbox.unshift({
        id: `ob_app_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        tenantId: `t_${input.slug}`,
        to: { name: input.educatorName },
        channel: 'email',
        subject,
        body: summaryBody,
        source: { kind: 'automation', id: 'educator_approved' },
        status: 'queued',
        at: new Date().toISOString()
      });
      if (db.growth.outbox.length > 2000) db.growth.outbox.pop();
    }
  } catch (err) {
    // Non-fatal
  }

  // Attempt live HTTP call to the Bodhin SMTP Service
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;

    const response = await fetch(`${MAILER_BASE_URL}/api/send-approval-mail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      ...(controller ? { signal: controller.signal } : {})
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const isSimulated = data?.result?.simulated;
      return {
        ok: true,
        method: isSimulated ? 'smtp_simulated' : 'smtp_live',
        message: isSimulated
          ? `Approval email prepared for ${input.educatorEmail} (SMTP simulated mode)`
          : `Approval email sent successfully via SMTP to ${input.educatorEmail} (copy to ${adminBcc})`,
        sentTo: input.educatorEmail,
        adminBcc,
        subject
      };
    }
  } catch (netErr: any) {
    // Mailer service may be offline or unreachable from web sandbox
    console.info('[Mailer Client] SMTP service offline or unreached, recorded in outbox:', netErr?.message);
  }

  // Fallback if local SMTP server is not running
  return {
    ok: true,
    method: 'outbox_fallback',
    message: `Approval notice recorded in system outbox for ${input.educatorEmail} (from thebodhin@gmail.com)`,
    sentTo: input.educatorEmail,
    adminBcc,
    subject
  };
}

export interface PasswordResetEmailInput {
  email: string;
  name: string;
  otp: string;
  resetLink?: string;
}

export async function sendPasswordResetOtpEmail(input: PasswordResetEmailInput): Promise<MailerResult> {
  const subject = `🔐 ${input.otp} is your Bodhin password reset code`;
  const adminBcc = 'thebodhin@gmail.com';
  const resetLink = input.resetLink || `http://localhost:8081/forgot-password?identifier=${encodeURIComponent(input.email)}&code=${input.otp}`;

  // Record in growth outbox for full platform audit
  try {
    if (db.growth && Array.isArray(db.growth.outbox)) {
      db.growth.outbox.unshift({
        id: `ob_reset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        tenantId: 't_bodhin',
        to: { name: input.name },
        channel: 'email',
        subject,
        body: `Password reset OTP code for ${input.email} is ${input.otp}. Reset link: ${resetLink}`,
        source: { kind: 'automation', id: 'password_reset' },
        status: 'queued',
        at: new Date().toISOString()
      });
      if (db.growth.outbox.length > 2000) db.growth.outbox.pop();
    }
  } catch {}

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;

    const response = await fetch(`${MAILER_BASE_URL}/api/send-reset-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        name: input.name,
        otp: input.otp,
        resetLink,
      }),
      ...(controller ? { signal: controller.signal } : {})
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return {
        ok: true,
        method: data?.result?.simulated ? 'smtp_simulated' : 'smtp_live',
        message: `Password reset code sent via SMTP to ${input.email} from thebodhin@gmail.com`,
        sentTo: input.email,
        adminBcc,
        subject
      };
    }
  } catch (netErr: any) {
    console.info('[Mailer Client] SMTP service offline or unreached for OTP:', netErr?.message);
  }

  return {
    ok: true,
    method: 'outbox_fallback',
    message: `Password reset OTP generated for ${input.email}`,
    sentTo: input.email,
    adminBcc,
    subject
  };
}
