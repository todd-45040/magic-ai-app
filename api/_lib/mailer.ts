function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

export type MailSendResult = { ok: true; messageId?: string } | { ok: false; error: string };

export function isMailerConfigured(): boolean {
  // Production-friendly default: Resend API (no extra deps, works well on Vercel)
  // Set:
  //   RESEND_API_KEY
  //   MAIL_FROM
  return Boolean(getEnv('RESEND_API_KEY') && getEnv('MAIL_FROM'));
}

export async function sendMail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<MailSendResult> {
  if (!isMailerConfigured()) {
    return { ok: false, error: 'Mailer not configured (missing RESEND_API_KEY and/or MAIL_FROM).' };
  }

  const apiKey = getEnv('RESEND_API_KEY')!;
  const from = getEnv('MAIL_FROM')!;
  const replyTo = params.replyTo || getEnv('MAIL_REPLY_TO') || undefined;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        ...(params.text ? { text: params.text } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { ok: false, error: `Resend send failed (${res.status}): ${t || res.statusText}` };
    }

    const data: any = await res.json().catch(() => ({}));
    return { ok: true, messageId: String(data?.id || '') };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Email send failed' };
  }
}
