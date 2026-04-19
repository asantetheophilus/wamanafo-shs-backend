// ============================================================
// Wamanafo SHS — Email Service
// Supports SMTP via Nodemailer. Falls back to console log in dev.
// Accepts both SMTP_* and MAIL_* environment variable names.
// ============================================================

import nodemailer from "nodemailer";

function readEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return undefined;
}

function getMailConfig() {
  const host = readEnv("SMTP_HOST", "MAIL_HOST");
  const portRaw = readEnv("SMTP_PORT", "MAIL_PORT") ?? "587";
  const port = Number.parseInt(portRaw, 10);
  const user = readEnv("SMTP_USER", "MAIL_USER", "SMTP_USERNAME", "MAIL_USERNAME");
  const pass = readEnv("SMTP_PASS", "MAIL_PASS", "SMTP_PASSWORD", "MAIL_PASSWORD");
  const fromName = readEnv("SMTP_FROM_NAME", "MAIL_FROM_NAME") ?? "Wamanafo SHS";
  const fromEmail = readEnv("SMTP_FROM", "MAIL_FROM") ?? user ?? "noreply@wamanafo-shs.edu.gh";

  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    user,
    pass,
    fromName,
    fromEmail,
  };
}

function getTransporter() {
  const config = getMailConfig();

  if (!config.host || !config.user || !config.pass) {
    if (process.env.NODE_ENV === "production") {
      const missing = [
        !config.host ? "SMTP_HOST/MAIL_HOST" : null,
        !config.user ? "SMTP_USER/MAIL_USER" : null,
        !config.pass ? "SMTP_PASS/MAIL_PASS" : null,
      ].filter(Boolean).join(", ");

      throw Object.assign(
        new Error(`SMTP is not configured for this server. Missing: ${missing}`),
        { code: "EMAIL_NOT_CONFIGURED", status: 500 }
      );
    }
    return null;
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
    tls: { rejectUnauthorized: process.env.NODE_ENV === "production" },
  });
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(opts: SendMailOptions): Promise<void> {
  const transporter = getTransporter();
  const config = getMailConfig();

  if (!transporter) {
    console.info("\n[EMAIL STUB] ─────────────────────────────────");
    console.info(`  To:      ${opts.to}`);
    console.info(`  Subject: ${opts.subject}`);
    console.info(`  Body:    ${opts.text ?? opts.html.replace(/<[^>]+>/g, " ")}`);
    console.info("────────────────────────────────────────────────\n");
    return;
  }

  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

// ── Email Templates ───────────────────────────────────────────

export function buildPasswordResetEmail(opts: {
  firstName: string;
  resetUrl: string;
  expiresIn: string;
}): { subject: string; html: string; text: string } {
  const subject = "Reset Your Wamanafo SHS Password";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { margin:0; padding:0; background:#f1f5f9; font-family:'Segoe UI',Arial,sans-serif; }
    .wrapper { max-width:560px; margin:40px auto; background:#fff; border-radius:16px;
               overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
    .header  { background:linear-gradient(135deg,#0D5E6E 0%,#0a4a56 100%);
               padding:36px 40px; text-align:center; }
    .header h1  { color:#fff; margin:0; font-size:22px; font-weight:700; letter-spacing:-0.3px; }
    .header p   { color:rgba(255,255,255,0.7); margin:4px 0 0; font-size:13px; }
    .body    { padding:36px 40px; }
    .body h2 { margin:0 0 12px; color:#1e293b; font-size:18px; }
    .body p  { color:#475569; font-size:15px; line-height:1.6; margin:0 0 20px; }
    .btn     { display:inline-block; background:linear-gradient(135deg,#B8860B,#d4a017);
               color:#fff; text-decoration:none; padding:14px 32px; border-radius:10px;
               font-size:15px; font-weight:700; letter-spacing:0.2px; }
    .notice  { background:#fef9ec; border:1px solid #f3d26e; border-radius:8px;
               padding:12px 16px; font-size:13px; color:#92610a; margin-top:24px; }
    .footer  { background:#f8fafc; border-top:1px solid #e2e8f0;
               padding:20px 40px; text-align:center; font-size:12px; color:#94a3b8; }
    .url-box { background:#f1f5f9; border:1px solid #e2e8f0; border-radius:6px;
               padding:10px 14px; font-size:12px; color:#64748b; word-break:break-all;
               margin-top:16px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Wamanafo SHS</h1>
      <p>Senior High Technical School — Academic Management System</p>
    </div>
    <div class="body">
      <h2>Hello, ${opts.firstName} 👋</h2>
      <p>We received a request to reset the password for your Wamanafo SHS account.
         Click the button below to choose a new password.</p>
      <div style="text-align:center; margin:28px 0;">
        <a href="${opts.resetUrl}" class="btn">Reset My Password</a>
      </div>
      <p style="font-size:13px;color:#64748b;">If the button above doesn't work, paste this link into your browser:</p>
      <div class="url-box">${opts.resetUrl}</div>
      <div class="notice">
        ⚠️ This link expires in <strong>${opts.expiresIn}</strong>. If you did not request a password reset,
        you can safely ignore this email — your password will not change.
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Wamanafo Senior High Technical School &bull;
      PO Box 423, Sunyan &bull; This is an automated message, please do not reply.
    </div>
  </div>
</body>
</html>`;

  const text = `Hello ${opts.firstName},

Reset your Wamanafo SHS password here:
${opts.resetUrl}

This link expires in ${opts.expiresIn}.

If you did not request this, ignore this email.`;

  return { subject, html, text };
}
