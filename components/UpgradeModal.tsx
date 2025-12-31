import React from 'react';
import { AMATEUR_FEATURES, PROFESSIONAL_FEATURES } from '../constants';
import { CheckIcon, WandIcon } from './icons';

interface UpgradeModalProps {
    onClose: () => void;
    onUpgrade: (tier: 'amateur' | 'professional') => void;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ onClose, onUpgrade }) => {
    const allProFeatures = [...AMATEUR_FEATURES, ...PROFESSIONAL_FEATURES];

    return (
        <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
            onClick={onClose}
        >
            <div 
                className="w-full max-w-2xl bg-slate-800 border-2 border-purple-500 rounded-lg shadow-2xl shadow-purple-900/40 transform animate-fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-8 text-center">
                    <WandIcon className="w-16 h-16 mx-auto mb-4 text-amber-300" />
                    <h2 className="font-cinzel text-3xl font-bold text-white mb-2">Elevate Your Magic</h2>
                    <p className="text-slate-300 mb-8">Choose a plan to unlock our powerful tools for magicians.</p>
                    
                    <div className="flex flex-col md:flex-row gap-6 text-left">
                        {/* Amateur Plan */}
                        <div className="flex-1 p-6 bg-slate-900/50 border border-slate-700 rounded-lg flex flex-col">
                            <h3 className="text-2xl font-bold text-sky-300 font-cinzel">Amateur</h3>
                            <p className="text-slate-400 mb-2 h-10">Perfect for honing your craft and creative process.</p>
                            <div className="mb-4">
                                <p className="text-2xl font-bold text-white">$9.95<span className="text-sm font-normal text-slate-400">/mo</span></p>
                            </div>
                            <ul className="space-y-2 mb-6 flex-1">
                                {AMATEUR_FEATURES.map(feature => (
                                    <li key={feature} className="flex items-start gap-3">
                                        <CheckIcon className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                                        <span className="text-slate-200">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                            <button
                                onClick={() => onUpgrade('amateur')}
                                className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 rounded-md text-white font-bold transition-colors"
                            >
                                Go Amateur
                            </button>
                        </div>

                        {/* Professional Plan */}
                        <div className="flex-1 p-6 bg-slate-900/50 border-2 border-amber-400 rounded-lg flex flex-col">
                            <h3 className="text-2xl font-bold text-amber-300 font-cinzel">Professional</h3>
                            <p className="text-slate-400 mb-2 h-10">The ultimate toolkit for the performing artist.</p>
                            <div className="mb-4">
                                <p className="text-2xl font-bold text-white">$29.95<span className="text-sm font-normal text-slate-400">/mo</span></p>
                            </div>
                            <ul className="space-y-2 mb-6 flex-1">
                                {allProFeatures.map(feature => (
                                    <li key={feature} className="flex items-start gap-3">
                                        <CheckIcon className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                                        <span className="text-slate-200">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                            <button
                                onClick={() => onUpgrade('professional')}
                                className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors"
                            >
                                Go Professional
                            </button>
                        </div>
                    </div>

                     <p className="text-xs text-slate-500 mt-6">
                        (This is a demo. Clicking an upgrade will enable the features for this session.)
                    </p>

                    <button
                        onClick={onClose}
                        className="w-full mt-4 py-2 px-4 text-slate-400 hover:text-white transition-colors"
                    >
                        Maybe Later
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UpgradeModal;