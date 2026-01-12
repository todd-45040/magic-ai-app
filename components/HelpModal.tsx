import React, { useMemo, useState } from 'react';
import {
    WandIcon, LightbulbIcon, MicrophoneIcon, ImageIcon, BookmarkIcon, ChecklistIcon,
    StarIcon, SearchIcon, CrossIcon, CameraIcon, QuestionMarkIcon, UsersCogIcon, UsersIcon,
    BookIcon, ShieldIcon, ClockIcon, MegaphoneIcon, FileTextIcon, StageCurtainsIcon, VideoIcon,
    DollarSignIcon, AnalyticsIcon, BlueprintIcon, TutorIcon, NewspaperIcon, ViewGridIcon, DatabaseIcon
} from './icons';

type HelpCategory =
    | 'Getting Started'
    | 'Create'
    | 'Rehearse'
    | 'Plan & Organize'
    | 'Business'
    | 'Learn'
    | 'Community'
    | 'Search'
    | 'Account'
    | 'Other';

interface HelpModalProps {
    onClose: () => void;
    /** Optional: lets Help open a tool directly (MagicianMode can pass setActiveView wrapper). */
    onNavigate?: (view: string) => void;
}

type HelpFeature = {
    icon: React.ElementType;
    title: string;
    description: string;
    proTip: string;
};

type EnrichedFeature = HelpFeature & {
    category: HelpCategory;
    view?: string;
};

const features: HelpFeature[] = [
    {
        icon: WandIcon,
        title: 'Effect Generator',
        description: 'Generate new magic trick ideas. Provide details about your show (title, audience, style), and the AI will generate a complete, structured show concept.',
        proTip: 'Be specific about the venue and audience. The more details you give, the more tailored and usable the output becomes.'
    },
    {
        icon: LightbulbIcon,
        title: 'Innovation Engine',
        description: 'A guided brainstorming workspace to develop fresh concepts with structured prompts and iteration.',
        proTip: 'Start broad, then run a second pass focusing on constraints (props, angles, venue) to tighten the idea.'
    },
    {
        icon: MicrophoneIcon,
        title: 'Live Rehearsal',
        description: 'Practice your patter and get real-time feedback on clarity, pacing, and audience engagement.',
        proTip: 'Do one run “slow and clear” first. Then do a second run at performance speed and compare notes.'
    },
    {
        icon: VideoIcon,
        title: 'Video Rehearsal',
        description: 'Upload or record rehearsal video for analysis and actionable improvement suggestions.',
        proTip: 'Use a tripod and record a full-body angle. Good lighting and clear audio dramatically improves feedback.'
    },
    {
        icon: ImageIcon,
        title: 'Image Generator',
        description: 'Create themed images for posters, social posts, show flyers, and promotional artwork.',
        proTip: 'Include the style (“vintage circus poster”, “clean modern flyer”), aspect ratio, and 2–3 key colors.'
    },
    {
        icon: BookmarkIcon,
        title: 'Saved Ideas',
        description: 'Your personal library for generated content. Save, revisit, and refine ideas over time.',
        proTip: 'Use consistent naming (date + show + effect) so you can find items quickly later.'
    },
    {
        icon: ChecklistIcon,
        title: 'Prop Checklists',
        description: 'Create reusable show checklists so you never forget a prop, costume piece, or backup item.',
        proTip: 'Add a “Plan B” row for each critical item (extra deck, spare batteries, backup gimmick).'
    },
    {
        icon: StageCurtainsIcon,
        title: 'Show Planner',
        description: 'Build a show plan with tasks and subtasks so rehearsal and production stays organized.',
        proTip: 'Break tasks into “Prep”, “Rehearsal”, and “Day-of” sections so nothing gets missed.'
    },
    {
        icon: FileTextIcon,
        title: 'Patter Engine',
        description: 'Generate and refine script/patter for your effects. Save versions as you iterate.',
        proTip: 'Ask for two styles: “family-friendly” and “edgy/late-night” then blend what you like.'
    },
    {
        icon: CameraIcon,
        title: 'Identify a Trick',
        description: 'Describe what you saw (or upload an image) and get likely matches, method families, and search suggestions.',
        proTip: 'Include what the audience believes happened, not what you think the method is.'
    },
    {
        icon: UsersIcon,
        title: 'Community',
        description: 'Explore clubs, conventions, and resources to connect with other magicians.',
        proTip: 'Prefer official links. If a listing looks outdated, verify the club’s current home page.'
    },
    {
        icon: NewspaperIcon,
        title: 'Magic Wire',
        description: 'A curated feed of magic-related news and ideas to spark creativity and keep you current.',
        proTip: 'Use it for weekly inspiration: pick one headline and turn it into an effect premise.'
    },
    {
        icon: BookIcon,
        title: 'Publications',
        description: 'Browse recommended books, magazines, and resources to level up your knowledge.',
        proTip: 'When you find a book you like, take notes in Saved Ideas to capture what you want to try.'
    },
    {
        icon: ViewGridIcon,
        title: 'Global Search',
        description: 'Search across tools and saved content quickly so you can find what you need mid-planning.',
        proTip: 'Search by prop names (“ring”, “rope”) or venues (“school”, “corporate”) for faster recall.'
    },
    {
        icon: DatabaseIcon,
        title: 'Magic Dictionary',
        description: 'Look up terms, effects, and concepts. Helpful when learning new branches of magic.',
        proTip: 'Click related terms to expand your understanding and build a study trail.'
    },
    {
        icon: DollarSignIcon,
        title: 'Client Management',
        description: 'Track clients, notes, follow-ups, and gigs so you always know who to contact next.',
        proTip: 'After every gig, log 2–3 notes: what worked, what didn’t, and the next follow-up date.'
    },
    {
        icon: FileTextIcon,
        title: 'Contract Generator',
        description: 'Generate a simple performance agreement template you can tailor for each event.',
        proTip: 'Always include: payment terms, arrival time, performance duration, and cancellation policy.'
    },
    {
        icon: MegaphoneIcon,
        title: 'Marketing Campaign',
        description: 'Generate promotional copy and campaign ideas for social, email, and local outreach.',
        proTip: 'Specify the channel (“Facebook event”, “email blast”, “poster copy”) for best results.'
    },
    {
        icon: AnalyticsIcon,
        title: 'Performance Analytics',
        description: 'Analyze your show feedback trends and track improvement over time.',
        proTip: 'Pick one metric (clarity, pacing, audience reactions) and focus on it for a month.'
    },
    {
        icon: UsersCogIcon,
        title: 'Persona Simulator',
        description: 'Test your show against different audience types to anticipate reactions and refine scripting.',
        proTip: 'Run the same effect for 2–3 personas (kids, corporate, seniors) and compare notes.'
    },
    {
        icon: BlueprintIcon,
        title: 'Illusion Blueprint',
        description: 'High-level planning and safety-minded thinking for staging illusions and large props.',
        proTip: 'Keep it conceptual—focus on staging, safety, angles, and logistics rather than secret construction.'
    },
    {
        icon: TutorIcon,
        title: 'Magic Theory Tutor',
        description: 'Learn foundational theory: misdirection, structure, scripting, and audience management.',
        proTip: 'Treat theory like reps: read a concept, then apply it to one trick you already do.'
    },
    {
        icon: ShieldIcon,
        title: 'Member Management',
        description: 'Manage account-level settings and access.',
        proTip: 'If something looks locked unexpectedly, log out/in and confirm your current tier.'
    },
    {
        icon: ClockIcon,
        title: 'Usage Limits',
        description: 'Some AI tools include daily and per-minute limits to keep costs predictable and the app stable.',
        proTip: 'If you hit a per-minute limit, wait a moment and retry. Daily limits reset each day.'
    }
];

function inferCategory(title: string): { category: HelpCategory; view?: string } {
    const t = title.toLowerCase();
    // direct view mapping (matches types.ts MagicianTab/MagicianView)
    const viewMap: Record<string, string> = {
        'effect generator': 'effect-generator',
        'show planner': 'show-planner',
        'identify a trick': 'identify',
        'patter engine': 'patter-engine',
        'live rehearsal': 'live-rehearsal',
        'video rehearsal': 'video-rehearsal',
        'saved ideas': 'saved-ideas',
        'prop checklists': 'prop-checklists',
        'magic wire': 'magic-wire',
        'publications': 'publications',
        'community': 'community',
        'global search': 'global-search',
        'magic dictionary': 'magic-dictionary',
        'marketing campaign': 'marketing-campaign',
        'contract generator': 'contract-generator',
        'client management': 'client-management',
        'performance analytics': 'performance-analytics',
        'persona simulator': 'persona-simulator',
        'illusion blueprint': 'illusion-blueprint',
        'magic theory tutor': 'magic-theory-tutor',
        'member management': 'member-management'
    };

    const view = viewMap[t] ?? undefined;

    if (t.includes('rehears')) return { category: 'Rehearse', view };
    if (t.includes('patter') || t.includes('effect') || t.includes('innovation') || t.includes('image')) return { category: 'Create', view };
    if (t.includes('show planner') || t.includes('checklist') || t.includes('saved')) return { category: 'Plan & Organize', view };
    if (t.includes('client') || t.includes('contract') || t.includes('marketing') || t.includes('analytics')) return { category: 'Business', view };
    if (t.includes('theory') || t.includes('dictionary') || t.includes('publication')) return { category: 'Learn', view };
    if (t.includes('community')) return { category: 'Community', view };
    if (t.includes('search')) return { category: 'Search', view };
    if (t.includes('member') || t.includes('usage')) return { category: 'Account', view };

    return { category: 'Other', view };
}

const workflows = [
    {
        title: 'Build a new routine',
        icon: WandIcon,
        steps: [
            { label: 'Generate an effect idea', view: 'effect-generator' },
            { label: 'Write patter / script', view: 'patter-engine' },
            { label: 'Save versions you like', view: 'saved-ideas' },
            { label: 'Create a prop checklist', view: 'prop-checklists' },
            { label: 'Rehearse and refine', view: 'live-rehearsal' }
        ]
    },
    {
        title: 'Prepare for a gig',
        icon: StageCurtainsIcon,
        steps: [
            { label: 'Create your show plan', view: 'show-planner' },
            { label: 'Generate a contract template', view: 'contract-generator' },
            { label: 'Build your packing list', view: 'prop-checklists' },
            { label: 'Run a final rehearsal', view: 'video-rehearsal' }
        ]
    },
    {
        title: 'Learn something new',
        icon: BookIcon,
        steps: [
            { label: 'Look up terms as you study', view: 'magic-dictionary' },
            { label: 'Read recommended resources', view: 'publications' },
            { label: 'Apply one idea immediately', view: 'saved-ideas' }
        ]
    }
] as const;

const HelpModal: React.FC<HelpModalProps> = ({ onClose, onNavigate }) => {
    const [query, setQuery] = useState('');
    const enriched = useMemo<EnrichedFeature[]>(() => {
        return features.map((f) => ({ ...f, ...inferCategory(f.title) }));
    }, []);

    const categories = useMemo(() => {
        const set = new Set<HelpCategory>(['Getting Started']);
        enriched.forEach((f) => set.add(f.category));
        return Array.from(set);
    }, [enriched]);

    const [activeCategory, setActiveCategory] = useState<HelpCategory>('Getting Started');

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        let list = enriched;

        if (activeCategory !== 'Getting Started') {
            list = list.filter((f) => f.category === activeCategory);
        }

        if (q.length > 0) {
            list = list.filter((f) =>
                f.title.toLowerCase().includes(q) ||
                f.description.toLowerCase().includes(q) ||
                f.proTip.toLowerCase().includes(q) ||
                f.category.toLowerCase().includes(q)
            );
        }

        // stable-ish alpha sort
        return [...list].sort((a, b) => a.title.localeCompare(b.title));
    }, [enriched, query, activeCategory]);

    const canNavigate = typeof onNavigate === 'function';

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="w-full max-w-5xl h-[92vh] bg-slate-800/90 border border-slate-600 rounded-lg shadow-2xl shadow-purple-900/40 flex flex-col"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Help Center"
            >
                <header className="p-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <QuestionMarkIcon className="w-8 h-8 text-purple-400" />
                        <div>
                            <h2 className="font-cinzel text-2xl font-bold text-yellow-400">Help Center</h2>
                            <p className="text-xs text-slate-400">Find tools, workflows, and troubleshooting tips.</p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
                    >
                        Close
                    </button>
                </header>

                <main className="flex-1 overflow-y-auto p-5">
                    {/* Getting Started / Workflows */}
                    <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-4 mb-5">
                        <div className="flex items-center gap-2 mb-3">
                            <StarIcon className="w-5 h-5 text-purple-400" />
                            <h3 className="text-lg font-bold text-yellow-300">Getting Started</h3>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {workflows.map((wf) => {
                                const Icon = wf.icon;
                                return (
                                    <div key={wf.title} className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Icon className="w-5 h-5 text-purple-400" />
                                            <h4 className="font-semibold text-yellow-300">{wf.title}</h4>
                                        </div>

                                        <ol className="space-y-2 text-sm text-slate-300">
                                            {wf.steps.map((s, idx) => (
                                                <li key={s.label} className="flex items-start justify-between gap-3">
                                                    <span className="flex-1">
                                                        <span className="text-slate-500 mr-2">{idx + 1}.</span>
                                                        {s.label}
                                                    </span>
                                                    {canNavigate && (
                                                        <button
                                                            onClick={() => {
                                                                onNavigate?.(s.view);
                                                                onClose();
                                                            }}
                                                            className="text-xs px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 text-purple-200 transition-colors"
                                                        >
                                                            Open
                                                        </button>
                                                    )}
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-4 text-sm text-slate-400">
                            Tip: Use <span className="text-slate-200 font-semibold">specific inputs</span> (venue, audience, style, props). You’ll get outputs that are more performance-ready.
                        </div>
                    </div>

                    {/* Search + category filters */}
                    <div className="flex flex-col gap-3 mb-4">
                        <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-700 rounded-lg px-3 py-2">
                            <SearchIcon className="w-5 h-5 text-slate-400" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search help… (e.g., patter, checklist, contract)"
                                className="w-full bg-transparent outline-none text-slate-200 placeholder:text-slate-500"
                            />
                            {query.trim().length > 0 && (
                                <button
                                    onClick={() => setQuery('')}
                                    className="p-1 rounded hover:bg-slate-800 transition-colors"
                                    aria-label="Clear search"
                                >
                                    <CrossIcon className="w-4 h-4 text-slate-400" />
                                </button>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setActiveCategory('Getting Started')}
                                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                                    activeCategory === 'Getting Started'
                                        ? 'bg-purple-600/20 border-purple-400 text-purple-100'
                                        : 'bg-slate-900/30 border-slate-600 text-slate-300 hover:bg-slate-900/60'
                                }`}
                            >
                                All
                            </button>

                            {categories
                                .filter((c) => c !== 'Getting Started')
                                .map((cat) => (
                                    <button
                                        key={cat}
                                        onClick={() => setActiveCategory(cat)}
                                        className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                                            activeCategory === cat
                                                ? 'bg-purple-600/20 border-purple-400 text-purple-100'
                                                : 'bg-slate-900/30 border-slate-600 text-slate-300 hover:bg-slate-900/60'
                                        }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                        </div>

                        <div className="text-xs text-slate-500">
                            Showing <span className="text-slate-300 font-semibold">{filtered.length}</span> help item{filtered.length === 1 ? '' : 's'}
                            {activeCategory !== 'Getting Started' ? <span> in <span className="text-slate-300">{activeCategory}</span></span> : null}.
                        </div>
                    </div>

                    {/* Feature cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filtered.map(({ icon: Icon, title, description, proTip, category, view }) => (
                            <div key={title} className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 mb-2">
                                        <Icon className="w-6 h-6 text-purple-400" />
                                        <div>
                                            <h3 className="text-lg font-bold text-yellow-300">{title}</h3>
                                            <div className="text-[11px] text-slate-500 mt-0.5">{category}</div>
                                        </div>
                                    </div>

                                    {canNavigate && view && (
                                        <button
                                            onClick={() => {
                                                onNavigate?.(view);
                                                onClose();
                                            }}
                                            className="text-xs px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 text-purple-200 transition-colors whitespace-nowrap"
                                        >
                                            Open tool
                                        </button>
                                    )}
                                </div>

                                <p className="text-sm text-slate-400 mb-3">{description}</p>
                                <p className="text-xs text-purple-200/90">
                                    <strong className="font-semibold">Pro Tip:</strong> {proTip}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Troubleshooting */}
                    <div className="mt-6 bg-slate-900/40 border border-slate-700 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <ShieldIcon className="w-5 h-5 text-purple-400" />
                            <h3 className="text-lg font-bold text-yellow-300">Troubleshooting</h3>
                        </div>

                        <div className="space-y-3">
                            <details className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                                <summary className="cursor-pointer text-slate-200 font-semibold">Microphone or camera not working</summary>
                                <div className="mt-2 text-sm text-slate-400 space-y-2">
                                    <p>• Check browser permissions (look for a lock icon in the address bar).</p>
                                    <p>• Ensure no other tab/app is using the mic/camera.</p>
                                    <p>• Try refreshing the page after granting permission.</p>
                                </div>
                            </details>

                            <details className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                                <summary className="cursor-pointer text-slate-200 font-semibold">“Could not find column/table in schema cache” (Supabase)</summary>
                                <div className="mt-2 text-sm text-slate-400 space-y-2">
                                    <p>• This usually means the database schema doesn’t match the app’s expectations.</p>
                                    <p>• Verify your Supabase migrations / SQL were applied and then redeploy.</p>
                                    <p>• If you recently added a column, refresh the Supabase schema cache (or restart local dev).</p>
                                </div>
                            </details>

                            <details className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                                <summary className="cursor-pointer text-slate-200 font-semibold">AI requests are blocked or limited</summary>
                                <div className="mt-2 text-sm text-slate-400 space-y-2">
                                    <p>• Some tools enforce daily caps and per-minute burst limits.</p>
                                    <p>• If you hit a burst limit, wait a moment and retry.</p>
                                    <p>• If you hit a daily cap, it resets the next day.</p>
                                </div>
                            </details>

                            <details className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                                <summary className="cursor-pointer text-slate-200 font-semibold">Tips for better outputs</summary>
                                <div className="mt-2 text-sm text-slate-400 space-y-2">
                                    <p>• Add constraints: venue, audience age, angles, props, time limits.</p>
                                    <p>• Ask for multiple variations and combine the best pieces.</p>
                                    <p>• Save iterations—small tweaks add up to performance-ready material.</p>
                                </div>
                            </details>
                        </div>
                    </div>

                    <div className="mt-5 text-xs text-slate-500">
                        Looking for something specific? Use the search box above, or jump into a tool and click <span className="text-slate-300 font-semibold">Help</span> again for quick reference.
                    </div>
                </main>
            </div>
        </div>
    );
};

export default HelpModal;
