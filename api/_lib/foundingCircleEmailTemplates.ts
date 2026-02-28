const BRAND = {
  product: 'Magic AI Wizard',
  company: "Magicians' AI Wizard, LLC",
  supportEmail: 'support@magicaiwizard.com',
};

export type FoundingEmailKey =
  | 'founding_welcome'
  | 'founding_early_access'
  | 'founding_pricing_lock'
  | 'founding_next_tools'
  | 'founder_paid_welcome';

/**
 * Template versioning: bump per template whenever copy/layout changes that you want tracked.
 */
export const FOUNDING_EMAIL_TEMPLATE_VERSION: Record<FoundingEmailKey, number> = {
  founding_welcome: 1,
  founding_early_access: 1,
  founding_pricing_lock: 1,
  founding_next_tools: 1,
  founder_paid_welcome: 1,
};

type TrackingOpts = {
  /** Optional template variables */
  vars?: Record<string, any> | null;
  /** Queue-level tracking id (uuid) */
  trackingId?: string | null;
  /** Base URL like https://magicaiwizard.com */
  baseUrl?: string | null;
  /** Template version (defaults from map) */
  templateVersion?: number | null;
};

function safeBaseUrl(baseUrl?: string | null): string {
  const v = String(baseUrl || '').trim();
  if (!v) return '';
  return v.replace(/\/$/, '');
}

function makeClickUrl(opts: TrackingOpts | undefined, targetUrl: string, key?: FoundingEmailKey): string {
  const base = safeBaseUrl(opts?.baseUrl);
  const tid = String(opts?.trackingId || '').trim();
  if (!base || !tid) return targetUrl;
  const k = key ? `&k=${encodeURIComponent(String(key))}` : '';
  const v = key ? `&v=${encodeURIComponent(String(Number(opts?.templateVersion || FOUNDING_EMAIL_TEMPLATE_VERSION[key] || 1)))}` : '';
  return `${base}/api/emailClick?tid=${encodeURIComponent(tid)}&u=${encodeURIComponent(targetUrl)}${k}${v}`;
}

function makeOpenPixel(opts: TrackingOpts | undefined, key: FoundingEmailKey): string {
  const base = safeBaseUrl(opts?.baseUrl);
  const tid = String(opts?.trackingId || '').trim();
  const v = Number(opts?.templateVersion || FOUNDING_EMAIL_TEMPLATE_VERSION[key] || 1);
  if (!base || !tid) return '';
  const src = `${base}/api/emailOpen?tid=${encodeURIComponent(tid)}&k=${encodeURIComponent(key)}&v=${encodeURIComponent(String(v))}`;
  // 1x1 pixel, hidden but standards-friendly
  return `<img src="${src}" width="1" height="1" alt="" style="display:block;opacity:0;width:1px;height:1px;" />`;
}

export function renderFoundingEmail(
  key: FoundingEmailKey,
  payload: { name?: string | null; email: string },
  opts?: TrackingOpts
): {
  subject: string;
  html: string;
  text: string;
  templateVersion: number;
} {
  const firstName = (payload?.name || '').trim().split(' ')[0] || 'there';
  const templateVersion = Number(opts?.templateVersion || FOUNDING_EMAIL_TEMPLATE_VERSION[key] || 1);

  const appUrl = (safeBaseUrl(opts?.baseUrl) || 'https://magicaiwizard.com') + '/founding-circle';
  const ctaUrl = makeClickUrl(opts, appUrl, key);

  const baseHtml = (inner: string, cta: { href: string; label: string } = { href: ctaUrl, label: '${cta.label}' }) => `
  <div style="background:#070A12;color:#E5E7EB;padding:28px 16px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
    <div style="max-width:640px;margin:0 auto;border:1px solid rgba(168,85,247,0.25);border-radius:18px;background:linear-gradient(180deg, rgba(88,28,135,0.18), rgba(2,6,23,0.35));padding:22px;">
      <div style="font-weight:700;letter-spacing:0.08em;color:#FDE68A;">FOUNDING CIRCLE</div>
      <div style="height:10px"></div>
      ${inner}
      <div style="height:16px"></div>

      <a href="${cta.href}" style="display:inline-block;text-decoration:none;background:rgba(253,230,138,0.12);border:1px solid rgba(253,230,138,0.35);color:#FDE68A;padding:10px 14px;border-radius:12px;font-weight:700;">
        Open Founding Circle
      </a>

      <div style="height:18px"></div>
      <div style="font-size:12px;opacity:0.75;line-height:1.45">
        <span style="color:#FDE68A;font-weight:700;">★ Founding Circle Member</span>
        <span style="opacity:0.85;"> • ★ Founding Circle Member • ${BRAND.company} • Privacy-first • Replies: ${BRAND.supportEmail}</span>
      </div>
      ${makeOpenPixel(opts, key)}
    </div>
  </div>`;

  const baseText = (inner: string, ctaLabel = 'Open Founding Circle', ctaHref = appUrl) =>
    `FOUNDING CIRCLE\n\n${inner}\n\n${ctaLabel}: ${ctaHref}\n\n★ Founding Circle Member • ${BRAND.company} • Privacy-first • Replies: ${BRAND.supportEmail}`;

  
  if (key === 'founder_paid_welcome') {
    const claimed = Number((opts?.vars as any)?.founder_claimed ?? (opts?.vars as any)?.total_claimed);
    const limit = Number((opts?.vars as any)?.founder_limit ?? 100);
    const hasCounts = Number.isFinite(claimed) && Number.isFinite(limit) && limit > 0;

    const subject = `You’re Officially a Founding Member 🎩`;

    const inner = `
      <h1 style="margin:0;font-size:22px;color:#FFFFFF;">🎩 Welcome, ${firstName}.</h1>
      <p style="margin:10px 0 0;opacity:0.92;line-height:1.55;">
        Todd, you’re in.<br/>
        You are now one of the first <b>${limit}</b> Founding Members of <b>${BRAND.product}</b>.
      </p>
      ${hasCounts ? `<p style="margin:12px 0 0;opacity:0.9;line-height:1.55;">
        As of right now, only <b>${claimed}</b> of the <b>${limit}</b> Founder spots have been claimed.
      </p>` : ``}
      <div style="height:10px"></div>
      <p style="margin:0;opacity:0.92;line-height:1.55;">
        <b>Your Pro rate is now permanently locked.</b><br/>
        No future price increases will ever affect you.
      </p>
      <div style="height:10px"></div>
      <p style="margin:0;opacity:0.92;line-height:1.55;">
        You didn’t just subscribe.<br/>
        <b>You helped launch a category.</b>
      </p>
    `;

    const base = safeBaseUrl(opts?.baseUrl) || 'https://magicaiwizard.com';
    const target = `${base}/app/founder-success`;
    const ctaHref = makeClickUrl(opts, target, key);
    const html = baseHtml(inner, { href: ctaHref, label: 'Build Your First Routine' });
    const text = baseText(
      `🎩 Welcome, ${firstName}.

Todd, you’re in.
You are now one of the first ${limit} Founding Members of ${BRAND.product}.

${
        hasCounts ? `As of right now, only ${claimed} of the ${limit} Founder spots have been claimed.

` : ''
      }Your Pro rate is now permanently locked.
No future price increases will ever affect you.

You didn’t just subscribe.
You helped launch a category.
`,
      'Build Your First Routine',
      target
    );

    return { subject, html, text, templateVersion };
  }

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
      `Welcome, ${firstName}.\n\nYou’re officially part of the Founding Circle for ${BRAND.product}.\n\n- In-app badge (Founding Circle Member)\n- Early access to new director-grade tools\n- ADMC pricing lock applied automatically when Stripe goes live\n\nNext email: what “early access” really means, and how it will work in the product.`
    );

    return { subject, html: baseHtml(inner), text, templateVersion };
  }

  if (key === 'founding_early_access') {
    const subject = `What “early access” really means`;
    const inner = `
      <h1 style="margin:0;font-size:22px;color:#FFFFFF;">Early access = influence.</h1>
      <p style="margin:10px 0 0;opacity:0.9;line-height:1.55;">
        Founding Circle members get first access to new “director-grade” tools — but more importantly:
        you help shape what ships before public release.
      </p>
      <ul style="margin:14px 0 0;padding-left:18px;line-height:1.6;">
        <li>Priority access to new tools and flows</li>
        <li>Feedback loop goes directly to the product roadmap</li>
        <li>Founding badge stays attached to your identity</li>
      </ul>
      <p style="margin:14px 0 0;opacity:0.9;line-height:1.55;">
        If you ever want to suggest a tool or improvement, reply to this email — it routes to the founder queue.
      </p>
    `;
    const text = baseText(
      `Early access = influence.\n\nFounding Circle members get first access to new “director-grade” tools — but more importantly: you help shape what ships before public release.\n\n- Priority access to new tools and flows\n- Feedback loop goes directly to the product roadmap\n- Founding badge stays attached to your identity\n\nReply any time with a suggestion — it routes to the founder queue.`
    );
    return { subject, html: baseHtml(inner), text, templateVersion };
  }

  if (key === 'founding_pricing_lock') {
    const subject = `Your Founding Circle pricing lock is recorded`;
    const inner = `
      <h1 style="margin:0;font-size:22px;color:#FFFFFF;">Pricing lock: ✅ recorded</h1>
      <p style="margin:10px 0 0;opacity:0.9;line-height:1.55;">
        When Stripe goes live, your account will automatically qualify for the Founding Circle rate.
        You don’t need a coupon or code — it’s tied to your identity.
      </p>
      <ul style="margin:14px 0 0;padding-left:18px;line-height:1.6;">
        <li>Lock is stored on your account</li>
        <li>It survives plan changes</li>
        <li>It’s verified server-side</li>
      </ul>
      <p style="margin:14px 0 0;opacity:0.9;line-height:1.55;">
        Next email: what tools are shipping next and how to help test them.
      </p>
    `;
    const text = baseText(
      `Pricing lock: recorded.\n\nWhen Stripe goes live, your account will automatically qualify for the Founding Circle rate. You don’t need a coupon or code — it’s tied to your identity.\n\n- Lock is stored on your account\n- It survives plan changes\n- It’s verified server-side\n\nNext email: what tools are shipping next and how to help test them.`
    );
    return { subject, html: baseHtml(inner), text, templateVersion };
  }

  // founding_next_tools
  {
    const subject = `What’s shipping next (Founding Circle preview)`;
    const inner = `
      <h1 style="margin:0;font-size:22px;color:#FFFFFF;">Next up: polish + power.</h1>
      <p style="margin:10px 0 0;opacity:0.9;line-height:1.55;">
        Founding Circle members get first access to the next set of upgrades:
      </p>
      <ul style="margin:14px 0 0;padding-left:18px;line-height:1.6;">
        <li>Better onboarding + activation flow</li>
        <li>More director-mode structure</li>
        <li>Faster rehearsal iteration loops</li>
      </ul>
      <p style="margin:14px 0 0;opacity:0.9;line-height:1.55;">
        Want to be a “fast feedback” tester? Reply with: <b>TESTER</b>.
      </p>
    `;
    const text = baseText(
      `Next up: polish + power.\n\nFounding Circle members get first access to the next set of upgrades:\n- Better onboarding + activation flow\n- More director-mode structure\n- Faster rehearsal iteration loops\n\nWant to be a “fast feedback” tester? Reply with: TESTER.`
    );
    return { subject, html: baseHtml(inner), text, templateVersion };
  }
}
