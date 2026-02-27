import nodemailer from 'nodemailer';

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

export type MailSendResult = { ok: true; messageId?: string } | { ok: false; error: string };

export function isMailerConfigured(): boolean {
  return Boolean(
    getEnv('SMTP_HOST') &&
      getEnv('SMTP_PORT') &&
      getEnv('SMTP_USER') &&
      getEnv('SMTP_PASS') &&
      getEnv('MAIL_FROM')
  );
}

export async function sendMail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<MailSendResult> {
  if (!isMailerConfigured()) {
    return { ok: false, error: 'Mailer not configured (missing SMTP_* env vars).' };
  }

  const host = getEnv('SMTP_HOST')!;
  const port = Number(getEnv('SMTP_PORT')!);
  const user = getEnv('SMTP_USER')!;
  const pass = getEnv('SMTP_PASS')!;
  const from = getEnv('MAIL_FROM')!;
  const replyTo = params.replyTo || getEnv('MAIL_REPLY_TO') || undefined;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // common default
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      ...(replyTo ? { replyTo } : {}),
    });

    return { ok: true, messageId: String((info as any)?.messageId || '') };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'SMTP send failed' };
  }
}
