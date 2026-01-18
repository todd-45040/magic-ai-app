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
    <div className="w-full max-w-5xl animate-fade-in">
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
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 text-left justify-items-center md:grid-cols-2 lg:grid-cols-3">
            {/* Trial Card */}
            <div className="w-full max-w-sm p-6 bg-slate-800/50 border border-green-500/50 rounded-lg flex flex-col">
                <h3 className="text-2xl font-bold text-green-300 font-cinzel mb-4">14-Day Trial</h3>
                 <div className="min-h-[10rem] flex flex-col">
                    <p className="text-slate-400 mb-4">New users automatically start here. Get full access to all Professional features for two weeks.</p>
                    <div className="text-center">
                        <p className="text-3xl font-bold text-green-300">Free</p>
                    </div>
                </div>
                <hr className="border-slate-700 my-4" />
                <FeatureList features={['Full Professional Access']} />
                <div className="flex-grow" />
            </div>

            {/* Amateur Plan */}
            <div className="w-full max-w-sm p-6 bg-slate-800/50 border border-sky-500/50 rounded-lg flex flex-col">
                <h3 className="text-2xl font-bold text-sky-300 font-cinzel mb-4">Amateur</h3>
                <div className="min-h-[10rem] flex flex-col">
                    <p className="text-slate-400 mb-4">Perfect for honing your craft and creative process.</p>
                    <div className="text-center">
                        <p className="text-3xl font-bold text-sky-300">$9.95<span className="text-base font-normal text-slate-400">/month</span></p>
                        <p className="text-sm text-slate-400">or $99.00/year</p>
                    </div>
                </div>
                <hr className="border-slate-700 my-4" />
                <FeatureList features={['Includes Trial Tools', ...AMATEUR_FEATURES]} />
                <div className="flex-grow" />
            </div>

            {/* Professional Plan */}
            <div className="w-full max-w-sm p-6 bg-slate-800/50 border border-amber-400/50 rounded-lg flex flex-col">
                <h3 className="text-2xl font-bold text-amber-300 font-cinzel mb-4">Professional</h3>
                <div className="min-h-[10rem] flex flex-col">
                    <p className="text-slate-400 mb-4">The ultimate toolkit for the performing artist.</p>
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