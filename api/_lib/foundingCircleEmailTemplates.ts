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
  | 'founder_paid_welcome'
  | 'founder_activation_day1'
  | 'founder_business_day3'
  | 'founder_identity_day5'
  | 'founder_spotlight_day7';

/**
 * Template versioning: bump per template whenever copy/layout changes that you want tracked.
 */
export const FOUNDING_EMAIL_TEMPLATE_VERSION: Record<FoundingEmailKey, number> = {
  founding_welcome: 2,
  founding_early_access: 2,
  founding_pricing_lock: 2,
  founding_next_tools: 2,
  founder_paid_welcome: 1,
  founder_activation_day1: 1,
  founder_business_day3: 1,
  founder_identity_day5: 1,
  // Optional later — enabled only when you’re ready to start spotlighting real Founder results.
  founder_spotlight_day7: 1,
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

  const baseHtml = (inner: string, cta: { href: string; label: string } = { href: ctaUrl, label: 'Open Founding Circle' }) => `
  <div style="background:#070A12;color:#E5E7EB;padding:28px 16px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
    <div style="max-width:640px;margin:0 auto;border:1px solid rgba(168,85,247,0.25);border-radius:18px;background:linear-gradient(180deg, rgba(88,28,135,0.18), rgba(2,6,23,0.35));padding:22px;">
      <div style="font-weight:700;letter-spacing:0.08em;color:#FDE68A;">FOUNDING CIRCLE</div>
      <div style="height:10px"></div>
      ${inner}
      <div style="height:16px"></div>

      <a href="${cta.href}" style="display:inline-block;text-decoration:none;background:rgba(253,230,138,0.12);border:1px solid rgba(253,230,138,0.35);color:#FDE68A;padding:10px 14px;border-radius:12px;font-weight:700;">
        ${cta.label}
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

  if (key === 'founder_activation_day1') {
    const subject = `Don’t waste your Founder advantage`;

    const inner = `
      <h1 style="margin:0;font-size:22px;color:#FFFFFF;">Founders don’t observe.<br/>They build.</h1>
      <p style="margin:10px 0 0;opacity:0.92;line-height:1.55;">
        Here’s the fastest way to use your Founder advantage today:
      </p>
      <ol style="margin:12px 0 0;padding-left:18px;line-height:1.75;opacity:0.95;">
        <li><b>Open</b> the Effect Generator</li>
        <li><b>Enter</b> 2 everyday objects</li>
        <li><b>Save</b> the idea</li>
      </ol>
      <div style="height:10px"></div>
      <p style="margin:0;opacity:0.92;line-height:1.55;">
        Once you save your first idea, you’ve started building your <b>private creative vault</b>.
        That’s when this becomes <i>yours</i> — not just something you tried.
      </p>
    `;

    const base = safeBaseUrl(opts?.baseUrl) || 'https://magicaiwizard.com';
    const target = `${base}/app/founder-success`;
    const ctaHref = makeClickUrl(opts, target, key);
    const html = baseHtml(inner, { href: ctaHref, label: 'Generate Your First Idea' });

    const text = baseText(
      `Founders don’t observe. They build.

Here’s the fastest way to use your Founder advantage today:

1) Open the Effect Generator
2) Enter 2 everyday objects
3) Save the idea

Once you save your first idea, you’ve started building your private creative vault. That’s when this becomes yours — not just something you tried.`,
      'Generate Your First Idea',
      target
    );

    return { subject, html, text, templateVersion };
  }

  if (key === 'founder_business_day3') {
    const subject = `Most magicians will never do this`;

    const inner = `
      <h1 style="margin:0;font-size:22px;color:#FFFFFF;">Most magicians track gigs in notebooks.<br/>Founders don’t.</h1>
      <p style="margin:10px 0 0;opacity:0.92;line-height:1.55;">
        You now have a <b>Business OS</b> inside <b>${BRAND.product}</b>.
        The goal is simple: spend less time on admin… and more time on stage.
      </p>
      <ul style="margin:14px 0 0;padding-left:18px;line-height:1.75;opacity:0.95;">
        <li><b>Contract Generator</b> — generate a clean performance agreement in seconds</li>
        <li><b>CRM</b> — keep every client, note, and follow-up in one place</li>
        <li><b>Show Finance Tracker</b> — track fees, expenses, and profit per gig</li>
      </ul>
      <div style="height:10px"></div>
      <p style="margin:0;opacity:0.92;line-height:1.55;">
        <b>One contract generated inside the app pays for your entire year.</b><br/>
        That’s not “software.” That’s leverage.
      </p>
    `;

    const base = safeBaseUrl(opts?.baseUrl) || 'https://magicaiwizard.com';
    // Send them to the Founder Success page first (guided), then they can jump into the Contract Generator.
    const target = `${base}/app/founder-success`;
    const ctaHref = makeClickUrl(opts, target, key);
    const html = baseHtml(inner, { href: ctaHref, label: 'Generate a Contract in 15 Seconds' });

    const text = baseText(
      `Most magicians track gigs in notebooks. Founders don’t.

You now have a Business OS inside ${BRAND.product}.
The goal is simple: spend less time on admin… and more time on stage.

- Contract Generator — generate a clean performance agreement in seconds
- CRM — keep every client, note, and follow-up in one place
- Show Finance Tracker — track fees, expenses, and profit per gig

One contract generated inside the app pays for your entire year.
That’s not “software.” That’s leverage.`,
      'Generate a Contract in 15 Seconds',
      target
    );

    return { subject, html, text, templateVersion };
  }

  if (key === 'founder_identity_day5') {
    const subject = `You’re building something bigger than software`;

    const inner = `
      <h1 style="margin:0;font-size:22px;color:#FFFFFF;">Magic is ancient.<br/>AI is new.<br/>You’re standing at the intersection.</h1>
      <p style="margin:12px 0 0;opacity:0.92;line-height:1.55;">
        As a Founding Member, you’re not just an early customer — you’re part of the group that shapes what this becomes.
      </p>
      <div style="height:10px"></div>
      <ul style="margin:0;padding-left:18px;opacity:0.92;line-height:1.6;">
        <li><b>Early adopters</b> who get there first</li>
        <li><b>Influencers</b> who set the tone</li>
        <li><b>Shape-the-future members</b> who help decide what ships next</li>
      </ul>
      <div style="height:12px"></div>
      <p style="margin:0;opacity:0.92;line-height:1.55;">
        <b>Reply to this email:</b><br/>
        What feature would make this <i>indispensable</i> for you?
      </p>
      <div style="height:12px"></div>
      <p style="margin:0;opacity:0.85;line-height:1.55;">
        Even one sentence helps. Your reply goes directly into the Founder roadmap.
      </p>
    `;

    const base = safeBaseUrl(opts?.baseUrl) || 'https://magicaiwizard.com';
    const target = `${base}/app/founder-success`;
    const ctaHref = makeClickUrl(opts, target, key);
    const html = baseHtml(inner, { href: ctaHref, label: 'Generate Your First Idea' });
    const text = baseText(
      `Magic is ancient.
AI is new.
You’re standing at the intersection.

As a Founding Member, you’re not just an early customer — you’re part of the group that shapes what this becomes.

- Early adopters who get there first
- Influencers who set the tone
- Shape-the-future members who help decide what ships next

Reply to this email:
What feature would make this indispensable for you?

Even one sentence helps. Your reply goes directly into the Founder roadmap.`,
      'Generate Your First Idea',
      target
    );

    return { subject, html, text, templateVersion };
  }

  if (key === 'founder_spotlight_day7') {
    // This template is intentionally “optional later” — enable it when you have real testimonials.
    // You can pass spotlight fields via opts.vars.
    const subject = `Founder Spotlight (Optional Later)`;
    const spotlight = (opts?.vars as any)?.spotlight || (opts?.vars as any) || {};

    const founderName = String(spotlight.founder_name || spotlight.name || 'A Founding Member');
    const useCase = String(spotlight.use_case || 'Close-up / corporate');
    const headline = String(spotlight.headline || '“This feels like having a director in my pocket.”');
    const quote = String(
      spotlight.quote ||
        'I used Live Rehearsal to tighten my pacing, Director Mode to restructure the arc, and the Business tools to generate a contract in minutes. It instantly paid for itself.'
    );

    const inner = `
      <h1 style="margin:0;font-size:22px;color:#FFFFFF;">Founder Spotlight</h1>
      <p style="margin:10px 0 0;opacity:0.92;line-height:1.55;">
        Real-world results from a Founding Member using the full stack — rehearsal, direction, and business.
      </p>
      <div style="height:12px"></div>
      <div style="border:1px solid rgba(253,230,138,0.25);background:rgba(2,6,23,0.35);border-radius:16px;padding:14px;">
        <p style="margin:0;opacity:0.92;line-height:1.55;"><b>${founderName}</b> <span style="opacity:0.75;">— ${useCase}</span></p>
        <p style="margin:10px 0 0;opacity:0.95;line-height:1.55;"><b>${headline}</b></p>
        <p style="margin:10px 0 0;opacity:0.90;line-height:1.55;">${quote}</p>
      </div>
      <div style="height:12px"></div>
      <p style="margin:0;opacity:0.92;line-height:1.55;">What this Founder used:</p>
      <ul style="margin:10px 0 0;padding-left:18px;opacity:0.92;line-height:1.6;">
        <li><b>Live Rehearsal</b> to tighten timing and delivery</li>
        <li><b>Director Mode</b> to shape the arc and beats</li>
        <li><b>Business OS</b> (Contracts / CRM / Show Finance) to run gigs like a pro</li>
      </ul>
      <div style="height:12px"></div>
      <p style="margin:0;opacity:0.88;line-height:1.55;">
        Social proof matters — and this is just the beginning. Your Founder badge means you’re part of the group shaping what ships next.
      </p>
    `;

    const base = safeBaseUrl(opts?.baseUrl) || 'https://magicaiwizard.com';
    const target = `${base}/app/founder-success`;
    const ctaHref = makeClickUrl(opts, target, key);
    const html = baseHtml(inner, { href: ctaHref, label: 'Generate a Contract in 15 Seconds' });
    const text = baseText(
      `Founder Spotlight\n\n${founderName} — ${useCase}\n\n${headline}\n\n${quote}\n\nWhat this Founder used:\n- Live Rehearsal\n- Director Mode\n- Business OS (Contracts / CRM / Show Finance)\n\nTry the same workflow today: generate a contract in 15 seconds.`,
      'Generate a Contract in 15 Seconds',
      target
    );

    return { subject, html, text, templateVersion };
  }


if (key === 'founding_welcome') {
    const subject = `Welcome to the Founding Circle — confirmation`;
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
        Next: you’ll receive a short confirmation that your <b>pricing lock is recorded</b> (no codes needed).
      </p>
    `;

    const text = baseText(
      `Welcome, ${firstName}.\n\nYou’re officially part of the Founding Circle for ${BRAND.product}.\n\n- In-app badge (Founding Circle Member)\n- Early access to new director-grade tools\n- ADMC pricing lock applied automatically when Stripe goes live\n\nNext email: what “early access” really means, and how it will work in the product.`
    );

    return { subject, html: baseHtml(inner), text, templateVersion };
  }

  if (key === 'founding_early_access') {
    const subject = `Pre‑Stripe early access: how it will work`;
    const inner = `
      <h1 style="margin:0;font-size:22px;color:#FFFFFF;">You’re getting access <i>before</i> Stripe.</h1>
      <p style="margin:10px 0 0;opacity:0.9;line-height:1.55;">
        Right now, <b>${BRAND.product}</b> is in the <b>Pre‑Stripe Launch Optimization</b> phase.
        Founding Circle members get early access to new tools and flows <b>as they ship</b> — and your feedback helps shape what goes public.
      </p>
      <ul style="margin:14px 0 0;padding-left:18px;line-height:1.6;">
        <li><b>Early access tools</b> — first invites when new tools ship</li>
        <li><b>Priority consideration</b> — founder feedback routes to the roadmap</li>
        <li><b>Identity layer</b> — your Founder badge stays attached to your account</li>
      </ul>
      <p style="margin:14px 0 0;opacity:0.9;line-height:1.55;">
        If you ever want to suggest a tool or improvement, reply to this email — it routes to the founder queue.
        (Short replies are perfect: “add a wizard for first use” / “I want a director checklist” / etc.)
      </p>
    `;
    const text = baseText(
      `Early access = influence.\n\nFounding Circle members get first access to new “director-grade” tools — but more importantly: you help shape what ships before public release.\n\n- Priority access to new tools and flows\n- Feedback loop goes directly to the product roadmap\n- Founding badge stays attached to your identity\n\nReply any time with a suggestion — it routes to the founder queue.`
    );
    return { subject, html: baseHtml(inner), text, templateVersion };
  }

  if (key === 'founding_pricing_lock') {
    const subject = `You are officially locked in ✅`;
    const inner = `
      <h1 style="margin:0;font-size:22px;color:#FFFFFF;">Your Founding Circle rate is recorded</h1>
      <p style="margin:10px 0 0;opacity:0.9;line-height:1.55;">
        This is the “you’re officially locked in” confirmation.
        When Stripe goes live, your account will automatically qualify for the Founding Circle rate.
        You don’t need a coupon or code — it’s tied to your identity.
      </p>
      <ul style="margin:14px 0 0;padding-left:18px;line-height:1.6;">
        <li>Lock is stored on your account</li>
        <li>It survives plan changes</li>
        <li>It’s verified server-side</li>
      </ul>
      <p style="margin:14px 0 0;opacity:0.9;line-height:1.55;">
        Next: a quick note on <b>Pre‑Stripe early access</b> and how you’ll get the first invites.
      </p>
    `;
    const text = baseText(
      `Pricing lock: recorded.\n\nWhen Stripe goes live, your account will automatically qualify for the Founding Circle rate. You don’t need a coupon or code — it’s tied to your identity.\n\n- Lock is stored on your account\n- It survives plan changes\n- It’s verified server-side\n\nNext email: what tools are shipping next and how to help test them.`
    );
    return { subject, html: baseHtml(inner), text, templateVersion };
  }

  // founding_next_tools
  {
    const subject = `7‑day check‑in: make sure you feel the value`;
    const inner = `
      <h1 style="margin:0;font-size:22px;color:#FFFFFF;">A quick Founder check‑in.</h1>
      <p style="margin:10px 0 0;opacity:0.9;line-height:1.55;">
        If you’ve used the app even once, you should already feel the core value:
        <b>faster ideas</b>, <b>cleaner scripts</b>, and <b>less friction</b> planning shows.
      </p>
      <div style="height:8px"></div>
      <p style="margin:0;opacity:0.9;line-height:1.55;">
        Here’s the fastest “proof” workflow (3 minutes):
      </p>
      <ol style="margin:12px 0 0;padding-left:18px;line-height:1.75;opacity:0.95;">
        <li>Generate one idea (Effect Generator or Patter Engine)</li>
        <li>Save it (build your private vault)</li>
        <li>Run it through Director Mode for structure</li>
      </ol>
      <div style="height:10px"></div>
      <p style="margin:0;opacity:0.9;line-height:1.55;">
        Want to be a “fast feedback” tester for what ships next? Reply with: <b>TESTER</b>.
      </p>
    `;
    const text = baseText(
      `7-day Founder check-in.\n\nIf you’ve used the app even once, you should already feel the core value: faster ideas, cleaner scripts, and less friction planning shows.\n\nFast “proof” workflow (3 minutes):\n1) Generate one idea (Effect Generator or Patter Engine)\n2) Save it (build your private vault)\n3) Run it through Director Mode for structure\n\nWant to be a “fast feedback” tester for what ships next? Reply with: TESTER.`
    );
    return { subject, html: baseHtml(inner), text, templateVersion };
  }
}
