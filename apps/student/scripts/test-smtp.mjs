import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      } catch (err) {}
    }
  }
}

loadEnv();

const host = process.env.SMTP_HOST || 'smtp.gmail.com';
const port = parseInt(process.env.SMTP_PORT || '465', 10);
const user = process.env.SMTP_USER || 'thebodhin@gmail.com';
const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '';
const toEmail = process.argv[2] || 'thebodhin@gmail.com';

console.log('------------------------------------------------------');
console.log('🔍 Testing Bodhin SMTP Email Configuration');
console.log('------------------------------------------------------');
console.log(`• Host:      ${host}`);
console.log(`• Port:      ${port}`);
console.log(`• User:      ${user}`);
console.log(`• Recipient: ${toEmail}`);
console.log(`• Password:  ${pass ? '******** (Provided)' : 'NOT PROVIDED'}`);
console.log('------------------------------------------------------\n');

if (!pass || pass === 'your-16-character-gmail-app-password') {
  console.log('⚠️  NO REAL SMTP PASSWORD CONFIGURED.');
  console.log('To send live emails through Gmail:');
  console.log('1. Go to your Google Account (for thebodhin@gmail.com):');
  console.log('   https://myaccount.google.com/security');
  console.log('2. Ensure "2-Step Verification" is ON.');
  console.log('3. Search for "App passwords" (or visit https://myaccount.google.com/apppasswords).');
  console.log('4. Create an app password named "Bodhin App".');
  console.log('5. Copy the 16-character password (e.g. "abcd efgh ijkl mnop").');
  console.log('6. Add it to apps/student/.env:');
  console.log('   SMTP_PASS="abcdefghijklmnop"\n');
  process.exit(0);
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass }
});

async function main() {
  try {
    console.log('🔄 Verifying SMTP credentials with Google Mail Server...');
    await transporter.verify();
    console.log('✅ SMTP Server Connection Verified Successfully!\n');

    console.log(`📤 Sending test Educator Approval email to ${toEmail}...`);
    const info = await transporter.sendMail({
      from: `"Bodhin Platform" <${user}>`,
      to: toEmail,
      subject: '🎉 Test: Educator Account Approved - Bodhin Platform',
      text: `Hello!\n\nThis is a test notification confirming that Bodhin SMTP mail delivery is working properly via ${user}.\n\nWhen an admin approves an educator, the approval details and login links will be automatically sent from this address.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #0B3B73; border-radius: 10px;">
          <h2 style="color: #0B3B73;">🎉 Bodhin SMTP Verification Success</h2>
          <p>This is a confirmation that your SMTP service for <strong>${user}</strong> is connected and sending emails successfully.</p>
          <div style="background: #F1F5F9; padding: 12px; border-radius: 6px;">
            <strong>Sender:</strong> ${user}<br>
            <strong>Status:</strong> Active & Connected
          </div>
        </div>
      `
    });

    console.log(`✅ Email sent successfully!`);
    console.log(`Message ID: ${info.messageId}`);
    console.log(`Response:   ${info.response}`);
  } catch (err) {
    console.error('❌ Failed to send email via SMTP:');
    console.error(err.message);
  }
}

main();
