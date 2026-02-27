const BRAND = {
  product: 'Magic AI Wizard',
  company: "Magicians' AI Wizard, LLC",
  supportEmail: 'support@magicaiwizard.com',
};

export type FoundingEmailKey =
  | 'founding_welcome'
  | 'founding_early_access'
  | 'founding_pricing_lock'
  | 'founding_next_tools';

export function renderFoundingEmail(key: FoundingEmailKey, payload: { name?: string | null; email: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = (payload?.name || '').trim().split(' ')[0] || 'there';

  const baseHtml = (inner: string) => `
  <div style="background:#070A12;color:#E5E7EB;padding:28px 16px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
    <div style="max-width:640px;margin:0 auto;border:1px solid rgba(168,85,247,0.25);border-radius:18px;background:linear-gradient(180deg, rgba(88,28,135,0.18), rgba(2,6,23,0.35));padding:22px;">
      <div style="font-weight:700;letter-spacing:0.08em;color:#FDE68A;">FOUNDING CIRCLE</div>
      <div style="height:10px"></div>
      ${inner}
      <div style="height:18px"></div>
      <div style="font-size:12px;opacity:0.75;line-height:1.45">
        ${BRAND.company} • Privacy-first • Replies: ${BRAND.supportEmail}
      </div>
    </div>
  </div>`;

  const baseText = (inner: string) => `FOUNDING CIRCLE\n\n${inner}\n\n${BRAND.company} • Privacy-first • Replies: ${BRAND.supportEmail}`;

  if (key === 'founding_welcome') {
    const subject = `Welcome to the Founding Circle — you’re in`;
    const inner = `
      <h1 style="margin:0;font-size:22px;color:#FFFFFF;">Welcome, ${firstName}.</h1>
      <p style="margin:10px 0 0;opacity:0.9;line-height:1.55;">
        You’re officially part of the Founding Circle for <b>${BRAND.product}</b>.
        This isn’t a public email list — it’s an identity layer inside the app.
      </p>
      <ul style="margin:14px 0 0;padding-left:18px;line-height:1.6;">
        <li><b>In-app badge</b> (Founding Circle Member)</li>
        <li><b>Early access</b> to new director-grade tools</li>
        <li><b>ADMC pricing lock</b> applied automatically when Stripe goes live</li>
      </ul>
      <p style="margin:14px 0 0;opacity:0.9;line-height:1.55;">
        Next email: what “early access” really means, and how it will work in the product.
      </p>
    `;

    const text = baseText(
      `Welcome, ${firstName}.\n\nYou’re officially part of the Founding Circle for ${BRAND.product}.\n\n- In-app badge (Founding Circle Member)\n- Early access to new director-grade tools\n- ADMC pricing lock applied automatically when Stripe goes live\n\nNext email: how early access will work.`
    );

    return { subject, html: baseHtml(inner), text };
  }

  if (key === 'founding_early_access') {
    const subject = `How Founding Circle early access works`;
    const inner = `
      <h1 style="margin:0;font-size:20px;color:#FFFFFF;">Early access, done properly.</h1>
      <p style="margin:10px 0 0;opacity:0.9;line-height:1.55;">
        Founding Circle members get access to new tools in a calm, structured rollout.
        That means:
      </p>
      <ul style="margin:12px 0 0;padding-left:18px;line-height:1.6;">
        <li>Tools appear <b>first</b> for founders</li>
        <li>Founders shape the defaults, wording, and UX</li>
        <li>We prioritize <b>stability</b> over hype</li>
      </ul>
      <p style="margin:14px 0 0;opacity:0.9;line-height:1.55;">
        The goal is simple: build the operating system for modern magicians — with input from the originals.
      </p>
    `;

    const text = baseText(
      `Early access, done properly.\n\nFounders get new tools first, help shape defaults/UX, and we prioritize stability over hype.\n\nGoal: build the operating system for modern magicians — with input from the originals.`
    );

    return { subject, html: baseHtml(inner), text };
  }

  if (key === 'founding_pricing_lock') {
    const subject = `Your ADMC pricing lock (no public coupon codes)`;
    const inner = `
      <h1 style="margin:0;font-size:20px;color:#FFFFFF;">Your pricing lock is internal.</h1>
      <p style="margin:10px 0 0;opacity:0.9;line-height:1.55;">
        When Stripe goes live, Founding Circle members will have an <b>automatic</b> pricing lock applied.
        No coupon codes. No public links.
      </p>
      <div style="margin:14px 0 0;padding:12px 14px;border-radius:14px;border:1px solid rgba(245,158,11,0.28);background:rgba(245,158,11,0.10);">
        <div style="font-weight:700;color:#FDE68A;">Lock ID</div>
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#FFF;margin-top:6px;">founding_pro_admc_2026</div>
      </div>
      <p style="margin:14px 0 0;opacity:0.9;line-height:1.55;">
        You don’t need to do anything later — it will be recognized on your account automatically.
      </p>
    `;

    const text = baseText(
      `Your pricing lock is internal.\n\nWhen Stripe goes live, Founding Circle members get an automatic pricing lock (no coupon codes).\n\nLock ID: founding_pro_admc_2026\n\nNothing to do later — it’s applied to your account automatically.`
    );

    return { subject, html: baseHtml(inner), text };
  }

  // founding_next_tools
  const subject = `What’s coming next inside Magic AI Wizard`;
  const inner = `
    <h1 style="margin:0;font-size:20px;color:#FFFFFF;">Next tools are about confidence.</h1>
    <p style="margin:10px 0 0;opacity:0.9;line-height:1.55;">
      The next wave of features is focused on:
    </p>
    <ul style="margin:12px 0 0;padding-left:18px;line-height:1.6;">
      <li>Stronger rehearsal feedback loops</li>
      <li>Cleaner show structure &amp; director mode workflows</li>
      <li>Activation-focused guidance (first win faster)</li>
    </ul>
    <p style="margin:14px 0 0;opacity:0.9;line-height:1.55;">
      If you reply with one sentence — what you wish your “magic OS” did better — it directly shapes priority.
    </p>
  `;

  const text = baseText(
    `Next tools are about confidence.\n\n- Stronger rehearsal feedback loops\n- Cleaner show structure & director workflows\n- Activation-focused guidance (first win faster)\n\nReply with one sentence: what you wish your magic OS did better.`
  );

  return { subject, html: baseHtml(inner), text };
}
