import React from 'react';
import { AMATEUR_FEATURES, PROFESSIONAL_FEATURES } from '../constants';
import { BackIcon, CheckIcon, WandIcon } from './icons';

interface AboutProps {
  onBack: () => void;
}

const FeatureList: React.FC<{ features: string[] }> = ({ features }) => (
  <ul className="space-y-2">
    {features.map(feature => (
      <li key={feature} className="flex items-start gap-3">
        <CheckIcon className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
        <span className="text-slate-200">{feature}</span>
      </li>
    ))}
  </ul>
);


const About: React.FC<AboutProps> = ({ onBack }) => {
  const allProFeatures = ['All Amateur Features', ...PROFESSIONAL_FEATURES];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 md:px-8 animate-fade-in">
        <button onClick={onBack} className="flex items-center gap-2 mb-6 text-slate-300 hover:text-white transition-colors">
            <BackIcon className="w-5 h-5" />
            <span>Back to Main Screen</span>
        </button>

        <div className="text-center mb-10">
            <WandIcon className="w-16 h-16 mx-auto mb-4 text-amber-300" />
            <h1 className="font-cinzel text-4xl md:text-5xl font-bold text-white mb-2">About Our Memberships</h1>
            <p className="text-slate-400 text-lg">Find the perfect plan to elevate your craft.</p>
        </div>

        <div className="max-w-2xl mx-auto mb-10 p-4 rounded-lg bg-purple-900/30 border border-purple-500/50 text-center">
            <h2 className="font-cinzel font-bold text-xl text-amber-300 mb-1">Limited-Time Introductory Pricing</h2>
            <p className="text-slate-300 text-sm">Lock in these special rates now! Prices will increase after the beta period.</p>
        </div>

        {/* Centered 3-up layout (Trial / Amateur / Professional) */}
        <div className="mt-12 flex justify-center">
            <div className="grid w-full max-w-5xl grid-cols-1 gap-6 text-left justify-items-center md:grid-cols-2 lg:grid-cols-3">
                {/* Trial Card */}
                <div className="w-full max-w-sm p-6 bg-slate-800/50 border border-green-500/50 rounded-lg flex flex-col">
                    <h3 className="text-2xl font-bold text-green-300 font-cinzel mb-4">14-Day Free Trial</h3>
                    <div className="min-h-[10rem] flex flex-col">
                        <p className="text-slate-400 mb-4">Start here. Full creative access for 14 days (with smart usage limits).</p>
                        <div className="text-center">
                            <p className="text-3xl font-bold text-green-300">Free</p>
                            <p className="text-sm text-slate-400">for 14 days</p>
                        </div>
                    </div>
                    <hr className="border-slate-700 my-4" />
                    <FeatureList features={['14-day trial access (most tools)', 'Up to 10 saved ideas', '10 minutes of rehearsal coaching', '1 active show in Show Planner', 'Includes Image Generation (2) + Video Rehearsal (1) during trial', 'Demo Mode access']} />
                    <div className="flex-grow" />
                </div>

                {/* Amateur Plan */}
                <div className="w-full max-w-sm p-6 bg-slate-800/50 border border-sky-500/50 rounded-lg flex flex-col">
                    <h3 className="text-2xl font-bold text-sky-300 font-cinzel mb-4 flex items-center justify-between gap-3">
  <span>Amateur</span>
  <span className="inline-flex items-center gap-2 rounded-full border border-slate-600/60 bg-slate-900/40 px-3 py-1 text-xs font-semibold text-amber-200 shadow-sm whitespace-nowrap">
    <span aria-hidden="true">⭐</span> Most Popular
  </span>
</h3>
                    <div className="min-h-[10rem] flex flex-col">
                        <p className="text-slate-400 mb-4">The Creative Tier — built to level up your material and rehearsal.</p>
                        <div className="text-center">
                            <p className="text-3xl font-bold text-sky-300">$15.95<span className="text-base font-normal text-slate-400">/month</span></p>
                            <p className="text-sm text-slate-400">$159.00 one-time annual billing</p>
<p className="text-xs text-slate-300 mt-1"><span className="mt-2 block text-sm text-slate-400">Save $32/year</span></p>
                        </div>
                    </div>
                    <hr className="border-slate-700 my-4" />
                    <FeatureList features={AMATEUR_FEATURES} />
                    <div className="flex-grow" />
                </div>

                {/* Professional Plan */}
                <div className="w-full max-w-sm p-6 bg-slate-800/50 border border-amber-400/50 rounded-lg flex flex-col">
                    <h3 className="text-2xl font-bold text-amber-300 font-cinzel mb-4">Professional</h3>
                    <div className="min-h-[10rem] flex flex-col">
                        <p className="text-slate-400 mb-4">The Business Tier — client, contracts, finance, and analytics.</p>
                        <div className="text-center">
                            <p className="text-3xl font-bold text-amber-300">$29.95<span className="text-base font-normal text-slate-400">/month</span></p>
                            <p className="text-sm text-slate-400">$299.00 one-time annual billing</p>
<p className="text-xs text-slate-300 mt-1"><span className="mt-2 block text-sm text-slate-400">Save $60/year</span></p>
                        </div>
                    </div>
                    <hr className="border-slate-700 my-4" />
                    <FeatureList features={allProFeatures} />
                    <div className="flex-grow" />
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