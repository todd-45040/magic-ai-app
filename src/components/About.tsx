import React from 'react';
import { AMATEUR_FEATURES, SEMI_PRO_FEATURES, PROFESSIONAL_FEATURES } from '../constants';
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
  const allSemiProFeatures = ['All Amateur Features', ...SEMI_PRO_FEATURES];
  const allProFeatures = ['All Semi-Pro Features', ...PROFESSIONAL_FEATURES];

  return (
    <div className="w-full max-w-7xl animate-fade-in">
        <button onClick={onBack} className="flex items-center gap-2 mb-6 text-slate-300 hover:text-white transition-colors">
            <BackIcon className="w-5 h-5" />
            <span>Back to Main Screen</span>
        </button>

        <div className="text-center mb-10">
            <img src="/logo.svg" alt="Magicians' AI Wizard" className="w-32 h-auto mx-auto mb-4" />
            <h1 className="font-cinzel text-4xl md:text-5xl font-bold text-white mb-2">Membership Plans</h1>
            <p className="text-slate-400 text-lg">Four paths to mastery. Choose your experience.</p>
        </div>

        <div className="max-w-2xl mx-auto mb-10 p-4 rounded-lg bg-purple-900/30 border border-purple-500/50 text-center">
            <h2 className="font-cinzel font-bold text-xl text-amber-300 mb-1">Introductory Beta Pricing</h2>
            <p className="text-slate-300 text-sm">Lock in these special rates today as we expand our magical features.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            {/* 1. Trial Card */}
            <div className="p-6 bg-slate-800/50 border border-green-500/50 rounded-lg flex flex-col hover:bg-slate-800 transition-colors">
                <h3 className="text-2xl font-bold text-green-300 font-cinzel mb-4">14-Day Trial</h3>
                 <div className="min-h-[8rem] flex flex-col">
                    <p className="text-slate-400 mb-4 text-sm">New users automatically start here. Get full access to all Professional features for two weeks.</p>
                    <div className="text-center">
                        <p className="text-3xl font-bold text-green-300">Free</p>
                        <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Full Professional Access</p>
                    </div>
                </div>
                <hr className="border-slate-700 my-4" />
                <FeatureList features={['Save Text & Image Ideas', 'Advanced AI Assistant', 'All Pro Features Included']} />
                <div className="flex-grow" />
            </div>

            {/* 2. Amateur Plan */}
            <div className="p-6 bg-slate-800/50 border border-sky-500/50 rounded-lg flex flex-col hover:bg-slate-800 transition-colors">
                <h3 className="text-2xl font-bold text-sky-300 font-cinzel mb-4">Amateur</h3>
                <div className="min-h-[8rem] flex flex-col">
                    <p className="text-slate-400 mb-4 text-sm">Perfect for honing your craft and creative process.</p>
                    <div className="text-center">
                        <p className="text-3xl font-bold text-sky-300">$9.95<span className="text-base font-normal text-slate-400">/month</span></p>
                        <p className="text-sm text-slate-400">or $99.00/year</p>
                    </div>
                </div>
                <hr className="border-slate-700 my-4" />
                <FeatureList features={AMATEUR_FEATURES} />
                <div className="flex-grow" />
            </div>

            {/* 3. Semi-Pro Plan */}
            <div className="p-6 bg-slate-800/50 border-2 border-purple-500/50 rounded-lg flex flex-col hover:bg-slate-800 transition-colors relative">
                <div className="absolute top-0 right-0 left-0 -mt-3 text-center">
                    <span className="bg-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">Most Popular</span>
                </div>
                <h3 className="text-2xl font-bold text-purple-300 font-cinzel mb-4 mt-2">Semi-Pro</h3>
                <div className="min-h-[8rem] flex flex-col">
                    <p className="text-slate-400 mb-4 text-sm">Essential business and promotion tools for the working performer.</p>
                    <div className="text-center">
                        <p className="text-3xl font-bold text-purple-300">$19.95<span className="text-base font-normal text-slate-400">/month</span></p>
                        <p className="text-sm text-slate-400">or $199.00/year</p>
                    </div>
                </div>
                <hr className="border-slate-700 my-4" />
                <FeatureList features={allSemiProFeatures} />
                <div className="flex-grow" />
            </div>

            {/* 4. Professional Plan */}
            <div className="p-6 bg-slate-800/50 border border-amber-400/50 rounded-lg flex flex-col hover:bg-slate-800 transition-colors">
                <h3 className="text-2xl font-bold text-amber-300 font-cinzel mb-4">Professional</h3>
                <div className="min-h-[8rem] flex flex-col">
                    <p className="text-slate-400 mb-4 text-sm">The ultimate toolkit for the performing artist and show director.</p>
                     <div className="text-center">
                        <p className="text-3xl font-bold text-amber-300">$29.95<span className="text-base font-normal text-slate-400">/month</span></p>
                        <p className="text-sm text-slate-400">or $299.00/year</p>
                    </div>
                </div>
                <hr className="border-slate-700 my-4" />
                <FeatureList features={allProFeatures} />
                <div className="flex-grow" />
            </div>
        </div>
    </div>
  );
};

export default About;