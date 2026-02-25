import React from 'react';
import { ShieldIcon } from './icons';

interface DisclaimerModalProps {
    onClose: () => void;
}

const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ onClose }) => {
    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="w-full max-w-3xl h-[90vh] max-h-[720px] bg-slate-900/80 border border-slate-700/80 rounded-2xl shadow-2xl shadow-purple-900/35 flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <header className="relative flex-shrink-0 border-b border-slate-700/70">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-900/35 via-slate-900/30 to-amber-900/20" />
                    <div className="relative p-5 flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-xl bg-slate-800/60 border border-slate-700/70 p-2 shadow-sm">
                                <ShieldIcon className="w-7 h-7 text-purple-300" />
                            </div>
                            <div>
                                <h2 className="font-cinzel text-2xl md:text-3xl font-bold text-white tracking-wide">
                                    Privacy &amp; Legal
                                </h2>
                                <p className="mt-1 text-sm text-slate-300/90">
                                    Trust-first terms for magicians. Your material stays yours.
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800/60 border border-slate-700/70 text-slate-200">
                                        We don&apos;t sell your data
                                    </span>
                                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800/60 border border-slate-700/70 text-slate-200">
                                        Your scripts stay private
                                    </span>
                                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800/60 border border-slate-700/70 text-slate-200">
                                        Secure payments (Stripe)
                                    </span>
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/70 text-slate-200 hover:text-white hover:bg-slate-800 transition"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4 text-slate-200">
                    <div className="rounded-2xl bg-gradient-to-b from-slate-800/60 to-slate-900/30 border border-slate-700/70 p-4 md:p-5">
                        <p className="text-slate-200">
                            <span className="font-semibold text-white">Last Updated:</span> February 25, 2026
                        </p>
                        <p className="mt-2 text-slate-300 leading-relaxed">
                            At <span className="font-semibold text-white">Magicians&apos; AI Wizard, LLC</span>, we understand your scripts, show notes, and client details can be deeply personal and
                            professionally valuable. This platform is built on integrity and respect for the art.
                        </p>
                    </div>

                    {/* Trust Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <section className="rounded-2xl bg-slate-800/45 border border-slate-700/70 p-4">
                            <h3 className="font-cinzel text-lg font-bold text-white">Privacy Promise</h3>
                            <ul className="mt-2 space-y-2 text-sm text-slate-300">
                                <li><span className="text-amber-300 font-semibold">•</span> We do not sell your data.</li>
                                <li><span className="text-amber-300 font-semibold">•</span> We do not publish your scripts or notes.</li>
                                <li><span className="text-amber-300 font-semibold">•</span> Your content remains yours — we do not claim ownership.</li>
                            </ul>
                        </section>
                        <section className="rounded-2xl bg-slate-800/45 border border-slate-700/70 p-4">
                            <h3 className="font-cinzel text-lg font-bold text-white">Security</h3>
                            <ul className="mt-2 space-y-2 text-sm text-slate-300">
                                <li><span className="text-amber-300 font-semibold">•</span> Encrypted HTTPS connections (in transit).</li>
                                <li><span className="text-amber-300 font-semibold">•</span> Server-side API protection &amp; restricted keys.</li>
                                <li><span className="text-amber-300 font-semibold">•</span> Secure cloud infrastructure &amp; access controls.</li>
                            </ul>
                        </section>
                    </div>

                    {/* Terms */}
                    <section className="rounded-2xl bg-slate-800/35 border border-slate-700/70 p-4 md:p-5">
                        <h3 className="font-cinzel text-lg font-bold text-white">AI Content &amp; Responsibility</h3>
                        <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                            The ideas, scripts, and guidance produced by Magic AI Wizard are AI-generated and provided for creative assistance.
                            You are responsible for reviewing and adapting outputs before performance, and for practicing safely.
                        </p>
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="rounded-xl bg-slate-900/30 border border-slate-700/70 p-3">
                                <p className="text-sm text-slate-300"><span className="font-semibold text-white">No guarantees:</span> We don&apos;t promise outcomes, bookings, or audience reactions.</p>
                            </div>
                            <div className="rounded-xl bg-slate-900/30 border border-slate-700/70 p-3">
                                <p className="text-sm text-slate-300"><span className="font-semibold text-white">Limitation of liability:</span> To the extent permitted by law, we are not liable for indirect or consequential damages.</p>
                            </div>
                        </div>
                    </section>

                    {/* Ethics */}
                    <section className="rounded-2xl bg-slate-800/35 border border-slate-700/70 p-4 md:p-5">
                        <h3 className="font-cinzel text-lg font-bold text-white">Ethical Use &amp; Non‑Exposure</h3>
                        <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                            Magic AI Wizard is designed to support ethical performance. Using the service to intentionally expose methods to the public violates the spirit of the platform.
                            We reserve the right to restrict access in cases of abuse.
                        </p>
                    </section>

                    {/* Payments */}
                    <section className="rounded-2xl bg-slate-800/35 border border-slate-700/70 p-4 md:p-5">
                        <h3 className="font-cinzel text-lg font-bold text-white">Payments &amp; Billing</h3>
                        <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                            Subscriptions (when enabled) are processed securely through Stripe. We do not store full credit card numbers on our servers.
                        </p>
                    </section>

                    <div className="rounded-2xl bg-gradient-to-r from-slate-900/30 via-slate-800/30 to-purple-900/20 border border-slate-700/70 p-4">
                        <p className="text-sm text-slate-300 leading-relaxed">
                            <span className="font-semibold text-white">Integrity statement:</span> Magic is built on trust. This platform is built the same way.
                            Your data is respected. Your creativity is protected. Your trust matters.
                        </p>
                    </div>
                </main>
                <footer className="p-4 border-t border-slate-700 flex-shrink-0 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-700 text-white font-bold shadow-lg shadow-purple-900/30 border border-purple-400/20 transition"
                    >
                        I Understand
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default DisclaimerModal;