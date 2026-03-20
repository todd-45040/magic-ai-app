import React from 'react';
import { ShieldIcon } from './icons';

interface DisclaimerModalProps {
    onClose: () => void;
}

type UsageRow = {
    label: string;
    free: string;
    amateur: string;
    professional: string;
    note?: string;
};

const usageRows: UsageRow[] = [
    {
        label: 'General AI requests',
        free: '20 / day',
        amateur: '200 / day',
        professional: '1,000 / day',
        note: 'Covers normal AI text generations across supported tools.',
    },
    {
        label: 'Burst rate protection',
        free: '20 / minute',
        amateur: '60 / minute',
        professional: '120 / minute',
        note: 'Protects platform stability during rapid repeated requests.',
    },
    {
        label: 'Image generations',
        free: '5 / month',
        amateur: '40 / month',
        professional: '200 / month',
        note: 'Used by image-heavy tools such as Visual Brainstorm and related generation workflows.',
    },
    {
        label: 'Identify a Trick',
        free: '10 / month',
        amateur: '50 / month',
        professional: '100 / month',
        note: 'For trick-identification style AI analysis requests.',
    },
    {
        label: 'Live Rehearsal audio',
        free: '10 min/day, 0 monthly access',
        amateur: '45 min/day, 60 min/month',
        professional: '180 min/day, 300 min/month',
        note: 'Live rehearsal is also controlled by plan access and feature availability.',
    },
    {
        label: 'Video Rehearsal uploads',
        free: '0 / day, 0 / month',
        amateur: '1 / day, 10 / month',
        professional: '6 / day, 50 / month',
        note: 'Upload-based rehearsal analysis is capped separately because of higher processing cost.',
    },
];

const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ onClose }) => {
    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="w-full max-w-5xl h-[92vh] max-h-[860px] bg-slate-900/85 border border-slate-700/80 rounded-2xl shadow-2xl shadow-purple-900/35 flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
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
                                    Full-disclosure terms for magicians. Your material stays yours, and your limits are visible.
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800/60 border border-slate-700/70 text-slate-200">
                                        We don&apos;t sell your data
                                    </span>
                                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800/60 border border-slate-700/70 text-slate-200">
                                        Your scripts stay private
                                    </span>
                                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800/60 border border-slate-700/70 text-slate-200">
                                        Usage limits disclosed
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
                            <span className="font-semibold text-white">Last Updated:</span> March 19, 2026
                        </p>
                        <p className="mt-2 text-slate-300 leading-relaxed">
                            At <span className="font-semibold text-white">Magicians&apos; AI Wizard, LLC</span>, we believe customers should understand not only
                            how their data is treated, but also how the platform works, where limits exist, and what the service is designed to do.
                            This panel is meant to make the platform more transparent in practical language.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                        <section className="rounded-2xl bg-slate-800/45 border border-slate-700/70 p-4 xl:col-span-2">
                            <h3 className="font-cinzel text-lg font-bold text-white">Platform Overview</h3>
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-300">
                                <div className="rounded-xl bg-slate-900/30 border border-slate-700/70 p-3">
                                    Magic AI Wizard is an AI-assisted operating system for magicians, built to support creative development,
                                    rehearsal workflows, show planning, and selected business tasks.
                                </div>
                                <div className="rounded-xl bg-slate-900/30 border border-slate-700/70 p-3">
                                    Some tools generate text, some analyze media, and some create images. Availability and quota levels vary by membership plan.
                                </div>
                                <div className="rounded-xl bg-slate-900/30 border border-slate-700/70 p-3">
                                    The app may evolve over time. Features, UI, workflows, and limits may be refined as the platform matures.
                                </div>
                                <div className="rounded-xl bg-slate-900/30 border border-slate-700/70 p-3">
                                    AI output is intended to assist your thinking and workflow. You remain responsible for final decisions, safety, and performance use.
                                </div>
                            </div>
                        </section>

                        <section className="rounded-2xl bg-slate-800/45 border border-slate-700/70 p-4">
                            <h3 className="font-cinzel text-lg font-bold text-white">Privacy Promise</h3>
                            <ul className="mt-2 space-y-2 text-sm text-slate-300">
                                <li><span className="text-amber-300 font-semibold">•</span> We do not sell your data.</li>
                                <li><span className="text-amber-300 font-semibold">•</span> We do not publish your scripts or notes.</li>
                                <li><span className="text-amber-300 font-semibold">•</span> Your content remains yours — we do not claim ownership.</li>
                                <li><span className="text-amber-300 font-semibold">•</span> Billing is handled through Stripe when subscriptions are enabled.</li>
                            </ul>
                        </section>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <section className="rounded-2xl bg-slate-800/35 border border-slate-700/70 p-4 md:p-5">
                            <h3 className="font-cinzel text-lg font-bold text-white">Security</h3>
                            <ul className="mt-2 space-y-2 text-sm text-slate-300">
                                <li><span className="text-amber-300 font-semibold">•</span> Encrypted HTTPS connections protect data in transit.</li>
                                <li><span className="text-amber-300 font-semibold">•</span> API credentials are protected server-side rather than exposed to end users.</li>
                                <li><span className="text-amber-300 font-semibold">•</span> Cloud services, access controls, and platform safeguards are used to reduce unauthorized access risk.</li>
                            </ul>
                        </section>

                        <section className="rounded-2xl bg-slate-800/35 border border-slate-700/70 p-4 md:p-5">
                            <h3 className="font-cinzel text-lg font-bold text-white">How Usage Limits Work</h3>
                            <ul className="mt-2 space-y-2 text-sm text-slate-300">
                                <li><span className="text-amber-300 font-semibold">•</span> Limits help manage AI cost, performance, and fair access across the platform.</li>
                                <li><span className="text-amber-300 font-semibold">•</span> Some limits reset daily, while others reset monthly.</li>
                                <li><span className="text-amber-300 font-semibold">•</span> Higher-cost tools such as image generation, live audio, and video analysis are tracked separately.</li>
                                <li><span className="text-amber-300 font-semibold">•</span> Actual access also depends on your plan. A limit row does not override a locked feature.</li>
                            </ul>
                        </section>
                    </div>

                    <section className="rounded-2xl bg-slate-800/35 border border-slate-700/70 p-4 md:p-5">
                        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                            <div>
                                <h3 className="font-cinzel text-lg font-bold text-white">Current Usage Limits</h3>
                                <p className="mt-1 text-sm text-slate-400">
                                    These values communicate the present platform limits for customer visibility. They may be refined as the app evolves.
                                </p>
                            </div>
                            <div className="text-xs text-slate-400 rounded-full border border-slate-700/70 bg-slate-900/30 px-3 py-1 w-fit">
                                Daily and monthly quotas shown together where applicable
                            </div>
                        </div>

                        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-700/70 bg-slate-950/30">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-800/60 text-slate-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 font-semibold">Usage Type</th>
                                        <th className="text-left px-4 py-3 font-semibold">Free</th>
                                        <th className="text-left px-4 py-3 font-semibold">Amateur</th>
                                        <th className="text-left px-4 py-3 font-semibold">Professional</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {usageRows.map((row) => (
                                        <tr key={row.label} className="border-t border-slate-800/80 align-top">
                                            <td className="px-4 py-3 text-slate-200">
                                                <div className="font-semibold text-white">{row.label}</div>
                                                {row.note ? <div className="mt-1 text-xs text-slate-400 max-w-md">{row.note}</div> : null}
                                            </td>
                                            <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{row.free}</td>
                                            <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{row.amateur}</td>
                                            <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{row.professional}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="rounded-2xl bg-slate-800/35 border border-slate-700/70 p-4 md:p-5">
                        <h3 className="font-cinzel text-lg font-bold text-white">AI Content &amp; Responsibility</h3>
                        <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                            The ideas, scripts, analyses, suggestions, and build guidance produced by Magic AI Wizard are AI-generated and provided
                            for creative assistance. You are responsible for reviewing, testing, editing, and adapting outputs before using them in rehearsal,
                            performance, contracts, client communication, or prop construction.
                        </p>
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="rounded-xl bg-slate-900/30 border border-slate-700/70 p-3">
                                <p className="text-sm text-slate-300"><span className="font-semibold text-white">No guarantees:</span> We do not guarantee audience reaction, bookings, business results, or performance outcomes.</p>
                            </div>
                            <div className="rounded-xl bg-slate-900/30 border border-slate-700/70 p-3">
                                <p className="text-sm text-slate-300"><span className="font-semibold text-white">Safety first:</span> You should independently evaluate staging, materials, construction, transport, and audience safety before use.</p>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-2xl bg-slate-800/35 border border-slate-700/70 p-4 md:p-5">
                        <h3 className="font-cinzel text-lg font-bold text-white">Ethical Use &amp; Non-Exposure</h3>
                        <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                            Magic AI Wizard is intended to support ethical performance and professional development. Using the platform to intentionally expose
                            methods to the public, abuse the system, harass others, or misuse generated content can result in access restriction or account action.
                        </p>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <section className="rounded-2xl bg-slate-800/35 border border-slate-700/70 p-4 md:p-5">
                            <h3 className="font-cinzel text-lg font-bold text-white">Payments, Billing &amp; Access</h3>
                            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                                Subscription billing, when active, is processed through Stripe. We do not store full payment card numbers on our own servers.
                                Plan access, feature availability, and quotas may differ by membership tier and may change if a subscription changes, expires,
                                or is canceled according to the applicable billing state.
                            </p>
                        </section>

                        <section className="rounded-2xl bg-slate-800/35 border border-slate-700/70 p-4 md:p-5">
                            <h3 className="font-cinzel text-lg font-bold text-white">Service Changes &amp; Availability</h3>
                            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                                Because the platform depends on cloud systems and AI providers, occasional maintenance, provider outages, model changes,
                                or evolving feature behavior may affect results. We may adjust workflows, limits, providers, or UI as the service matures.
                            </p>
                        </section>
                    </div>

                    <div className="rounded-2xl bg-gradient-to-r from-slate-900/30 via-slate-800/30 to-purple-900/20 border border-slate-700/70 p-4">
                        <p className="text-sm text-slate-300 leading-relaxed">
                            <span className="font-semibold text-white">Transparency statement:</span> This panel is meant to make the app easier to trust.
                            It explains what the platform is, how your information is treated, where plan limits exist, and what responsibilities remain with the user.
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
