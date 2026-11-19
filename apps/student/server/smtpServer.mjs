import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to load .env variables manually without external dotenv dependency
function loadEnv() {
  const envPaths = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'apps/student/.env')
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (err) {
        console.warn('Could not read env from', envPath, err.message);
      }
    }
  }
}

loadEnv();

const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: (process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465'),
  user: process.env.SMTP_USER || 'thebodhin@gmail.com',
  pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '',
  from: process.env.SMTP_FROM || 'Bodhin Platform <thebodhin@gmail.com>',
  adminCopy: process.env.SMTP_ADMIN_COPY || 'thebodhin@gmail.com'
};

const sentEmailsHistory = [];

const isRealPassword = Boolean(
  SMTP_CONFIG.pass &&
  SMTP_CONFIG.pass !== 'your-16-character-gmail-app-password' &&
  SMTP_CONFIG.pass.length >= 8
);

function createTransporter() {
  if (isRealPassword) {
    return nodemailer.createTransport({
      host: SMTP_CONFIG.host,
      port: SMTP_CONFIG.port,
      secure: SMTP_CONFIG.secure,
      auth: {
        user: SMTP_CONFIG.user,
        pass: SMTP_CONFIG.pass
      }
    });
  }
  return null;
}

export function buildApprovalEmailHtml({ educatorName, workspaceName, slug, trialDays, trialPlan }) {
  const portalUrl = `https://${slug}.thebodhin.com`;
  const localDevUrl = `http://localhost:8081/educator`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Educator Workspace is Approved!</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FBF7F0; margin: 0; padding: 24px; color: #1E293B; }
    .card { max-width: 580px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 4px 12px rgba(11, 59, 115, 0.06); }
    .header { background: linear-gradient(135deg, #0B3B73 0%, #071F44 100%); padding: 32px 24px; text-align: center; color: #FFFFFF; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
    .header p { margin: 8px 0 0; color: #D99A1E; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
    .content { padding: 32px 28px; line-height: 1.6; font-size: 15px; }
    .workspace-box { background: #F1F5F9; border-left: 4px solid #D99A1E; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
    .workspace-box p { margin: 4px 0; font-size: 14px; }
    .btn { display: inline-block; background-color: #0B3B73; color: #FFFFFF !important; text-decoration: none; font-weight: 600; font-size: 15px; padding: 14px 28px; border-radius: 10px; margin: 24px 0 12px; text-align: center; }
    .steps { margin: 20px 0; padding-left: 20px; }
    .steps li { margin-bottom: 8px; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #64748B; border-top: 1px solid #E2E8F0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <p>Bodhin Platform</p>
      <h1>🎉 Welcome to Bodhin!</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${educatorName}</strong>,</p>
      
      <p>Congratulations! Your educator application for <strong>${workspaceName}</strong> has been reviewed and <strong style="color: #10B981;">APPROVED</strong> by the Bodhin team.</p>
      
      <div class="workspace-box">
        <p><strong>Workspace:</strong> ${workspaceName}</p>
        <p><strong>Web Address:</strong> <a href="${portalUrl}" style="color: #0B3B73; font-weight: 600;">${portalUrl}</a></p>
        <p><strong>Free Trial:</strong> ${trialDays} Days (${trialPlan || 'Growth'} Plan)</p>
        <p><strong>Status:</strong> Active & Ready for Courses</p>
      </div>

      <p><strong>What you can do now:</strong></p>
      <ol class="steps">
        <li>Log into your educator dashboard with your registered email/phone.</li>
        <li>Create and publish your first courses, live interactive classes, and quizzes.</li>
        <li>Offer 1:1 mentorship sessions to students across the Bodhin network.</li>
        <li>Connect your payout gateway to receive direct student fees.</li>
      </ol>

      <div style="text-align: center;">
        <a href="${localDevUrl}" class="btn">Open Educator Dashboard &rarr;</a>
        <br/>
        <small style="color: #64748B;">(Local dev portal: <a href="${localDevUrl}" style="color: #0B3B73;">${localDevUrl}</a>)</small>
      </div>

      <p style="margin-top: 24px;">If you have any questions or need onboarding assistance, reply directly to this email at <a href="mailto:thebodhin@gmail.com" style="color: #0B3B73;">thebodhin@gmail.com</a>.</p>
      
      <p>Warm regards,<br>
      <strong>The Bodhin Team</strong><br>
      <a href="mailto:thebodhin@gmail.com" style="color: #64748B;">thebodhin@gmail.com</a></p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Bodhin Platform. All rights reserved. &bull; Sent to ${educatorName}
    </div>
  </div>
</body>
</html>
  `;
}

export function buildApprovalEmailText({ educatorName, workspaceName, slug, trialDays, trialPlan }) {
  return `
Dear ${educatorName},

Congratulations! Your educator application for ${workspaceName} has been APPROVED by the Bodhin team.

Workspace Details:
- Workspace: ${workspaceName}
- Web Address: https://${slug}.thebodhin.com
- Free Trial: ${trialDays} Days (${trialPlan || 'Growth'} Plan)
- Status: Active & Ready

What you can do now:
1. Log into your educator dashboard.
2. Create and publish your courses, live classes, and quizzes.
3. Offer 1:1 mentorship sessions.
4. Set up payments for direct student payouts.

Open your Educator Dashboard:
http://localhost:8081/educator (or https://${slug}.thebodhin.com)

If you need any support, contact us at thebodhin@gmail.com.

Warm regards,
The Bodhin Team
thebodhin@gmail.com
  `.trim();
}

export function buildResetPasswordEmailHtml({ userName, userEmail, otpCode, resetLink }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reset Your Bodhin Password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FBF7F0; margin: 0; padding: 24px; color: #1E293B; }
    .card { max-width: 540px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 4px 12px rgba(11, 59, 115, 0.06); }
    .header { background: linear-gradient(135deg, #0B3B73 0%, #071F44 100%); padding: 32px 24px; text-align: center; color: #FFFFFF; }
    .header h1 { margin: 8px 0 0; font-size: 22px; font-weight: 700; }
    .header p { margin: 0; color: #D99A1E; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
    .content { padding: 32px 28px; line-height: 1.6; font-size: 15px; }
    .otp-box { background: #F8FAFC; border: 2px dashed #0B3B73; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .otp-code { font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #0B3B73; font-family: 'Courier New', Courier, monospace; margin: 8px 0; }
    .btn { display: inline-block; background-color: #0B3B73; color: #FFFFFF !important; text-decoration: none; font-weight: 600; font-size: 15px; padding: 14px 28px; border-radius: 10px; margin: 12px 0 20px; text-align: center; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #64748B; border-top: 1px solid #E2E8F0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <p>Bodhin Platform Security</p>
      <h1>Password Reset Code</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${userName}</strong>,</p>
      <p>We received a request to reset the password for your Bodhin account (<strong>${userEmail}</strong>). Please use the 6-digit verification code below:</p>
      
      <div class="otp-box">
        <div style="font-size: 12px; color: #64748B; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">One-Time Verification Code</div>
        <div class="otp-code">${otpCode}</div>
        <div style="font-size: 12px; color: #D99A1E; font-weight: 600;">⏱️ Valid for 10 minutes</div>
      </div>

      <div style="text-align: center;">
        <p style="margin-bottom: 8px; font-size: 14px; color: #475569;">You can also tap the button below to reset directly:</p>
        <a href="${resetLink}" class="btn">Reset Password in App &rarr;</a>
      </div>

      <p style="margin-top: 24px; font-size: 13px; color: #64748B;">If you did not request a password reset, please ignore this email. Your current password will remain safe and unchanged.</p>
      <p style="font-size: 13px; color: #64748B;">Need help? Contact us at <a href="mailto:thebodhin@gmail.com" style="color: #0B3B73;">thebodhin@gmail.com</a>.</p>
      
      <p style="margin-top: 20px;">Warm regards,<br><strong>Bodhin Security Team</strong></p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Bodhin Platform &bull; Sent from thebodhin@gmail.com to ${userEmail}
    </div>
  </div>
</body>
</html>
  `;
}

export function buildResetPasswordEmailText({ userName, userEmail, otpCode, resetLink }) {
  return `
Hello ${userName},

We received a request to reset your password for your Bodhin account (${userEmail}).

Your 6-digit verification code is:
${otpCode} (Valid for 10 minutes)

Or reset your password directly by visiting:
${resetLink}

If you did not request this, you can safely ignore this email.

Warm regards,
Bodhin Security Team
thebodhin@gmail.com
  `.trim();
}

async function sendEmail({ to, subject, html, text, cc, bcc }) {
  const transporter = createTransporter();
  const mailRecord = {
    id: 'mail_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    to,
    cc: cc || undefined,
    bcc: bcc || undefined,
    from: SMTP_CONFIG.from,
    subject,
    at: new Date().toISOString()
  };

  if (!transporter) {
    mailRecord.status = 'simulated_no_credentials';
    mailRecord.note = 'SMTP_PASS not provided in .env. Email generated and previewed in test logs.';
    sentEmailsHistory.unshift(mailRecord);
    if (sentEmailsHistory.length > 50) sentEmailsHistory.pop();
    
    console.log('\n[SMTP Mailer Simulated Dispatch]');
    console.log(`From:    ${mailRecord.from}`);
    console.log(`To:      ${to}`);
    console.log(`BCC:     ${bcc || 'none'}`);
    console.log(`Subject: ${subject}`);
    console.log(`Note:    Provide Gmail 16-character App Password in .env to deliver real email via smtp.gmail.com.\n`);

    return {
      ok: true,
      simulated: true,
      messageId: mailRecord.id,
      note: 'Simulated delivery logged. Configure SMTP_PASS in .env for live dispatch.'
    };
  }

  try {
    const info = await transporter.sendMail({
      from: SMTP_CONFIG.from,
      to,
      cc,
      bcc,
      subject,
      text,
      html
    });

    mailRecord.status = 'sent';
    mailRecord.messageId = info.messageId;
    mailRecord.response = info.response;
    sentEmailsHistory.unshift(mailRecord);
    if (sentEmailsHistory.length > 50) sentEmailsHistory.pop();

    console.log(`[SMTP Mailer] Live email delivered successfully to ${to} (MessageId: ${info.messageId})`);
    return { ok: true, simulated: false, messageId: info.messageId, response: info.response };
  } catch (error) {
    mailRecord.status = 'failed';
    mailRecord.error = error.message;
    sentEmailsHistory.unshift(mailRecord);
    console.error(`[SMTP Mailer Error] Failed to send email to ${to}:`, error.message);
    throw error;
  }
}

function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  if (handleCors(req, res)) return;

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/smtp/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      smtpUser: SMTP_CONFIG.user,
      smtpHost: SMTP_CONFIG.host,
      smtpPort: SMTP_CONFIG.port,
      hasPassword: Boolean(SMTP_CONFIG.pass && SMTP_CONFIG.pass !== 'your-16-character-gmail-app-password'),
      adminCopy: SMTP_CONFIG.adminCopy,
      recentSentCount: sentEmailsHistory.length,
      history: sentEmailsHistory.slice(0, 10)
    }));
    return;
  }

  if (pathname === '/api/send-approval-mail' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const educatorEmail = payload.educatorEmail || payload.email;
        const educatorName = payload.educatorName || payload.name || 'Educator';
        const workspaceName = payload.workspaceName || `${educatorName} Academy`;
        const slug = payload.slug || 'academy';
        const trialDays = payload.trialDays || 14;
        const trialPlan = payload.trialPlan || 'Growth';

        if (!educatorEmail) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'educatorEmail is required' }));
          return;
        }

        const subject = `🎉 Congratulations! Your Educator Account has been Approved - Bodhin`;
        const html = buildApprovalEmailHtml({ educatorName, workspaceName, slug, trialDays, trialPlan });
        const text = buildApprovalEmailText({ educatorName, workspaceName, slug, trialDays, trialPlan });

        const result = await sendEmail({
          to: educatorEmail,
          bcc: SMTP_CONFIG.adminCopy, // Also send copy to thebodhin@gmail.com
          subject,
          html,
          text
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          result,
          sentTo: educatorEmail,
          adminBcc: SMTP_CONFIG.adminCopy,
          subject
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/send-reset-otp' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const email = payload.email || payload.to;
        const name = payload.name || 'Student';
        const otp = payload.otp || '123456';
        const resetLink = payload.resetLink || `http://localhost:8081/forgot-password?identifier=${encodeURIComponent(email)}&code=${otp}`;

        if (!email) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'email is required' }));
          return;
        }

        const subject = `🔐 ${otp} is your Bodhin password reset code`;
        const html = buildResetPasswordEmailHtml({ userName: name, userEmail: email, otpCode: otp, resetLink });
        const text = buildResetPasswordEmailText({ userName: name, userEmail: email, otpCode: otp, resetLink });

        const result = await sendEmail({
          to: email,
          bcc: SMTP_CONFIG.adminCopy,
          subject,
          html,
          text
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result, sentTo: email, otp }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/send-mail' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { to, subject, html, text, cc, bcc } = payload;
        if (!to || !subject) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'to and subject are required' }));
          return;
        }

        const result = await sendEmail({ to, subject, html, text, cc, bcc });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

const PORT = parseInt(process.env.SMTP_SERVER_PORT || '3001', 10);

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Bodhin SMTP Email Service running on port ${PORT}`);
  console.log(`📧 Sender / User: ${SMTP_CONFIG.user}`);
  console.log(`⚙️  SMTP Host:    ${SMTP_CONFIG.host}:${SMTP_CONFIG.port} (secure: ${SMTP_CONFIG.secure})`);
  console.log(`📋 Admin Copy:   ${SMTP_CONFIG.adminCopy}`);
  console.log(`🔑 Live Auth:    ${isRealPassword ? 'Configured ✅' : 'Missing (Simulated mode active) ⚠️'}`);
  console.log(`======================================================\n`);
});
