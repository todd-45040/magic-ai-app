import React from 'react';
import { AMATEUR_FEATURES, SEMI_PRO_FEATURES, PROFESSIONAL_FEATURES } from '../constants';
import { CheckIcon } from './icons';

interface UpgradeModalProps {
    onClose: () => void;
    onUpgrade: (tier: 'amateur' | 'semi-pro' | 'professional') => void;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ onClose, onUpgrade }) => {
    // Build feature lists cumulatively
    const allSemiProFeatures = ['All Amateur Features', ...SEMI_PRO_FEATURES];
    const allProFeatures = ['All Semi-Pro Features', ...PROFESSIONAL_FEATURES];

    return (
        <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
            onClick={onClose}
        >
            <div 
                className="w-full max-w-6xl bg-slate-800 border-2 border-purple-500 rounded-lg shadow-2xl shadow-purple-900/40 transform animate-fade-in flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 text-center border-b border-slate-700">
                    <img src="/logo.svg" alt="Magicians' AI Wizard" className="w-16 h-auto mx-auto mb-2" />
                    <h2 className="font-cinzel text-2xl md:text-3xl font-bold text-white">Elevate Your Magic</h2>
                    <p className="text-slate-300">Unlock powerful tools designed for every stage of your career.</p>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left h-full">
                        {/* Amateur Plan */}
                        <div className="flex-1 p-6 bg-slate-900/50 border border-sky-500/50 rounded-lg flex flex-col">
                            <h3 className="text-2xl font-bold text-sky-300 font-cinzel mb-2">Amateur</h3>
                            <div className="mb-4">
                                <p className="text-2xl font-bold text-white">$9.95<span className="text-sm font-normal text-slate-400">/mo</span></p>
                            </div>
                            <ul className="space-y-2 mb-6 flex-1 text-sm">
                                {AMATEUR_FEATURES.map(feature => (
                                    <li key={feature} className="flex items-start gap-3">
                                        <CheckIcon className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                                        <span className="text-slate-200">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                            <button
                                onClick={() => onUpgrade('amateur')}
                                className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 rounded-md text-white font-bold transition-colors mt-auto"
                            >
                                Go Amateur
                            </button>
                        </div>

                        {/* Semi-Pro Plan */}
                        <div className="flex-1 p-6 bg-slate-900/50 border-2 border-purple-500/50 rounded-lg flex flex-col relative">
                             <div className="absolute top-0 right-0 left-0 -mt-3 text-center">
                                <span className="bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Popular</span>
                            </div>
                            <h3 className="text-2xl font-bold text-purple-300 font-cinzel mb-2 mt-2">Semi-Pro</h3>
                            <div className="mb-4">
                                <p className="text-2xl font-bold text-white">$19.95<span className="text-sm font-normal text-slate-400">/mo</span></p>
                            </div>
                            <ul className="space-y-2 mb-6 flex-1 text-sm">
                                {allSemiProFeatures.map(feature => (
                                    <li key={feature} className="flex items-start gap-3">
                                        <CheckIcon className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                                        <span className="text-slate-200">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                            <button
                                onClick={() => onUpgrade('semi-pro')}
                                className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors mt-auto"
                            >
                                Go Semi-Pro
                            </button>
                        </div>

                        {/* Professional Plan */}
                        <div className="flex-1 p-6 bg-slate-900/50 border border-amber-400/50 rounded-lg flex flex-col">
                            <h3 className="text-2xl font-bold text-amber-300 font-cinzel mb-2">Professional</h3>
                            <div className="mb-4">
                                <p className="text-2xl font-bold text-white">$29.95<span className="text-sm font-normal text-slate-400">/mo</span></p>
                            </div>
                            <ul className="space-y-2 mb-6 flex-1 text-sm">
                                {allProFeatures.map(feature => (
                                    <li key={feature} className="flex items-start gap-3">
                                        <CheckIcon className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                                        <span className="text-slate-200">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                            <button
                                onClick={() => onUpgrade('professional')}
                                className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 rounded-md text-white font-bold transition-colors mt-auto"
                            >
                                Go Professional
                            </button>
                        </div>
                    </div>
                </div>
                
                <div className="p-4 border-t border-slate-700 text-center bg-slate-900/50 rounded-b-lg">
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors text-sm"
                    >
                        No thanks, maybe later
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UpgradeModal;