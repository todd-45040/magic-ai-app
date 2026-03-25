import React from 'react';
import { AMATEUR_FEATURES, PROFESSIONAL_FEATURES } from '../constants';
import { BackIcon, CheckIcon, WandIcon } from './icons';

interface AboutProps {
  onBack: () => void;
}

const FeatureGroup: React.FC<{ title: string; features: string[]; accentClass?: string }> = ({
  title,
  features,
  accentClass = 'text-slate-300',
}) => (
  <div>
    <h4 className={`mb-3 text-xs font-semibold uppercase tracking-[0.18em] ${accentClass}`}>
      {title}
    </h4>
    <ul className="space-y-2.5">
      {features.map((feature) => (
        <li key={`${title}-${feature}`} className="flex items-start gap-3">
          <CheckIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-400" />
          <span className="text-slate-200">{feature}</span>
        </li>
      ))}
    </ul>
  </div>
);

const ValuePill: React.FC<{ children: React.ReactNode; tone?: 'neutral' | 'sky' | 'amber' | 'green' }> = ({
  children,
  tone = 'neutral',
}) => {
  const toneClass = {
    neutral: 'border-slate-600/60 bg-slate-900/40 text-slate-200',
    sky: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
    amber: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
    green: 'border-green-500/40 bg-green-500/10 text-green-200',
  }[tone];

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${toneClass}`}>
      {children}
    </span>
  );
};

const About: React.FC<AboutProps> = ({ onBack }) => {
  const trialGroups = [
    {
      title: 'Get Started Fast',
      accentClass: 'text-green-200',
      features: [
        '14-day trial access (most tools)',
        'Save up to 10 ideas during trial',
        'Demo Mode access',
      ],
    },
    {
      title: 'Included During Trial',
      accentClass: 'text-green-200',
      features: [
        'Rehearsal coaching: 10 minutes per day',
        '1 active show in Show Planner',
        'Image Generation: 2 during trial',
        'Video Rehearsal: 1 upload during trial',
      ],
    },
  ];

  const amateurGroups = [
    {
      title: 'Core Creative Tools',
      accentClass: 'text-sky-200',
      features: ['Effect Generator', 'Patter Engine', 'Innovation Engine'],
    },
    {
      title: 'Show & Organization',
      accentClass: 'text-sky-200',
      features: ['Show Planner', 'My Saved Ideas'],
    },
    {
      title: 'Learning & Resources',
      accentClass: 'text-sky-200',
      features: ['Magic Archives', 'Global Search'],
    },
    {
      title: 'Community',
      accentClass: 'text-sky-200',
      features: ['Magic Wire', 'Publications', 'Community'],
    },
    {
      title: 'Advanced AI Tools (Limited Access)',
      accentClass: 'text-sky-200',
      features: [
        'Visual Brainstorm Studio (limited access)',
        'Video Rehearsal Studio (limited access)',
        'Professional tools preview with smart limits',
      ],
    },
  ];

  const professionalGroups = [
    {
      title: 'Everything in Amateur',
      accentClass: 'text-amber-200',
      features: ['All Amateur Features'],
    },
    {
      title: 'Full Performance & AI Studio',
      accentClass: 'text-amber-200',
      features: [
        'Live Patter Rehearsal',
        'Video Rehearsal Studio',
        'Angle/Risk Analysis',
        'Rehearsal Coaching',
        'Visual Brainstorm Studio',
        'Illusion Blueprint Generator',
        'Director Mode',
        'Persona Simulator',
        "Assistant's Studio",
        'Prop Checklist Generator',
      ],
    },
    {
      title: 'Knowledge & Specialty Tools',
      accentClass: 'text-amber-200',
      features: [
        'Magic Dictionary',
        'Magic Theory Tutor',
        'Mentalism Assistant',
        'Gospel Magic Assistant',
      ],
    },
    {
      title: 'Business & Growth',
      accentClass: 'text-amber-200',
      features: ['Client Management', 'Contract Generator', 'Marketing Campaign', 'Show Feedback'],
    },
  ];

  const hiddenAmateurFeatures = AMATEUR_FEATURES.filter(
    (feature) =>
      !amateurGroups.some((group) => group.features.includes(feature)) &&
      !feature.includes('(limited)'),
  );

  const hiddenProfessionalFeatures = PROFESSIONAL_FEATURES.filter(
    (feature) => !professionalGroups.some((group) => group.features.includes(feature)),
  );

  if (hiddenAmateurFeatures.length || hiddenProfessionalFeatures.length) {
    console.warn('Membership page grouping is missing features', {
      hiddenAmateurFeatures,
      hiddenProfessionalFeatures,
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl animate-fade-in px-4 sm:px-6 md:px-8">
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-slate-300 transition-colors hover:text-white"
      >
        <BackIcon className="h-5 w-5" />
        <span>Back to Main Screen</span>
      </button>

      <div className="mb-10 text-center">
        <WandIcon className="mx-auto mb-4 h-16 w-16 text-amber-300" />
        <h1 className="mb-2 font-cinzel text-4xl font-bold text-white md:text-5xl">
          Choose the Membership That Fits Your Magic
        </h1>
        <p className="mx-auto max-w-3xl text-lg text-slate-300">
          Start free, build momentum fast, and upgrade only when you want more power, deeper rehearsal,
          and full business tools.
        </p>
      </div>

      <div className="mx-auto mb-8 grid max-w-4xl gap-3 rounded-2xl border border-purple-500/30 bg-purple-900/20 p-4 text-center md:grid-cols-3">
        <div className="rounded-xl border border-white/5 bg-slate-900/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Best way to start</p>
          <p className="mt-2 text-sm text-slate-200">Try the app free for 14 days with real creative tools.</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-slate-900/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Best value</p>
          <p className="mt-2 text-sm text-slate-200">Amateur includes core tools plus limited access to advanced AI features.</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-slate-900/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Full unlock</p>
          <p className="mt-2 text-sm text-slate-200">Professional gives full creative, rehearsal, and business power.</p>
        </div>
      </div>

      <div className="mx-auto mb-10 max-w-2xl rounded-lg border border-purple-500/50 bg-purple-900/30 p-4 text-center">
        <h2 className="mb-1 font-cinzel text-xl font-bold text-amber-300">Limited-Time Introductory Pricing</h2>
        <p className="text-sm text-slate-300">
          Lock in these special rates now. Early members get the strongest value before post-beta pricing increases.
        </p>
      </div>

      <div className="mt-12 flex justify-center">
        <div className="grid w-full max-w-6xl grid-cols-1 gap-6 text-left justify-items-center md:grid-cols-2 xl:grid-cols-3">
          <div className="flex w-full max-w-sm flex-col rounded-2xl border border-green-500/50 bg-slate-800/50 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.25)] transition-all duration-200 ease-out hover:-translate-y-[2px] hover:shadow-[0_0_25px_rgba(34,197,94,0.25)]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="font-cinzel text-2xl font-bold text-green-300">14-Day Free Trial</h3>
              <ValuePill tone="green">Start free</ValuePill>
            </div>
            <div className="min-h-[11rem] flex flex-col">
              <p className="mb-4 text-slate-300">
                Start here. Explore the platform and experience AI-powered magic creation before spending anything. Perfect for testing your first ideas,
                scripts, and rehearsal workflows.
              </p>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-300">Free</p>
                <p className="text-sm text-slate-400">for 14 days</p>
              </div>
            </div>
            <div className="mb-5 mt-4 text-center text-sm text-slate-400">Upgrade anytime if you want more room to create.</div>
            <hr className="my-4 border-slate-700" />
            <div className="space-y-6">
              {trialGroups.map((group) => (
                <FeatureGroup
                  key={group.title}
                  title={group.title}
                  features={group.features}
                  accentClass={group.accentClass}
                />
              ))}
            </div>
            <div className="flex-grow" />
          </div>

          <div className="relative flex w-full max-w-sm flex-col rounded-2xl border border-sky-400/70 bg-slate-800/60 p-6 shadow-[0_16px_48px_rgba(14,165,233,0.18)] ring-1 ring-sky-300/30 transition-all duration-200 ease-out hover:-translate-y-[2px] hover:shadow-[0_0_30px_rgba(59,130,246,0.35)]">
            <div className="absolute -top-3 right-5">
              <ValuePill tone="sky">Most Popular</ValuePill>
            </div>
            <div className="mb-4 flex items-start justify-between gap-3 pt-2">
              <h3 className="font-cinzel text-2xl font-bold text-sky-300">Amateur</h3>
              <ValuePill tone="neutral">Best value</ValuePill>
            </div>
            <div className="min-h-[11rem] flex flex-col">
              <p className="mb-4 text-slate-300">
                The creative tier for magicians who want a real working toolkit. Includes your core idea system,
                show planning, and limited access to advanced AI rehearsal and visual tools.
              </p>
              <div className="text-center">
                <p className="text-3xl font-bold text-sky-300">
                  $15.95<span className="text-base font-normal text-slate-400">/month</span>
                </p>
                <p className="text-sm text-slate-400">$159.00 one-time annual billing</p>
                <p className="mt-2 text-sm text-sky-200">Save $32.40/year</p>
              </div>
            </div>
            <div className="mb-5 mt-4 grid gap-2 text-center text-sm text-slate-300">
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2">
                Built for hobbyists, learners, and active developing performers.
              </div>
              <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 px-3 py-2 text-slate-400">
                Upgrade anytime to unlock full AI rehearsal, director tools, and business suite.
              </div>
            </div>
            <hr className="my-4 border-slate-700" />
            <div className="space-y-6">
              {amateurGroups.map((group) => (
                <FeatureGroup
                  key={group.title}
                  title={group.title}
                  features={group.features}
                  accentClass={group.accentClass}
                />
              ))}
            </div>
            <div className="flex-grow" />
          </div>

          <div className="flex w-full max-w-sm flex-col rounded-2xl border border-amber-400/50 bg-slate-800/50 p-6 shadow-[0_14px_40px_rgba(251,191,36,0.12)] transition-all duration-200 ease-out hover:-translate-y-[2px] hover:shadow-[0_0_28px_rgba(234,179,8,0.30)]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="font-cinzel text-2xl font-bold text-amber-300">Professional</h3>
              <ValuePill tone="amber">Full Access</ValuePill>
            </div>
            <div className="min-h-[11rem] flex flex-col">
              <p className="mb-4 text-slate-300">
                The full business and performance suite for working magicians. Unlock full access across AI studio,
                rehearsal, specialty tools, and client-facing operations.
              </p>
              <div className="text-center">
                <p className="text-3xl font-bold text-amber-300">
                  $29.95<span className="text-base font-normal text-slate-400">/month</span>
                </p>
                <p className="text-sm text-slate-400">$299.50 one-time annual billing</p>
                <p className="mt-2 text-sm text-amber-200">Save $59.90/year</p>
              </div>
            </div>
            <div className="mb-5 mt-4 grid gap-2 text-center text-sm text-slate-300">
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2">
                Best for pros who need full rehearsal power and business organization.
              </div>
              <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 px-3 py-2 text-slate-400">
                Unlimited access to all AI tools and features.
              </div>
            </div>
            <hr className="my-4 border-slate-700" />
            <div className="space-y-6">
              {professionalGroups.map((group) => (
                <FeatureGroup
                  key={group.title}
                  title={group.title}
                  features={group.features}
                  accentClass={group.accentClass}
                />
              ))}
            </div>
            <div className="flex-grow" />
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-5xl rounded-2xl border border-slate-700/80 bg-slate-900/40 p-5">
        <div className="grid gap-4 text-center md:grid-cols-3 md:text-left">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Simple path</p>
            <p className="mt-2 text-sm text-slate-200">Start with the trial, move to Amateur when you want a daily toolkit, then unlock Professional when you need full power.</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">No guesswork</p>
            <p className="mt-2 text-sm text-slate-200">Amateur now clearly includes limited advanced tools, so users can feel the value before upgrading.</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Built for trust</p>
            <p className="mt-2 text-sm text-slate-200">Your data stays safe, your pricing is transparent, and your upgrade path is easy to understand.</p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 opacity-70"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 11V8a4 4 0 0 0-8 0v3" />
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M12 16h.01" />
        </svg>
        <span>Your data is safe.</span>
      </div>
    </div>
  );
};

export default About;
