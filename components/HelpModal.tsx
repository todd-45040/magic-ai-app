import React, { useEffect, useMemo, useState } from 'react';
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
    /** Optional: current tool view so Help can open pre-filtered. */
    contextView?: string;
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
    { icon: WandIcon, title: 'Effect Generator', description: 'Create structured magic effect ideas from your theme, props, audience, and performance setting. A strong first stop when you need a new routine or fresh premise.', proTip: 'Include venue, audience, available props, reset needs, and performance tone. Specific constraints produce more practical routines.' },
    { icon: FileTextIcon, title: 'Patter Engine', description: 'Generate and refine scripts, lines, beats, introductions, transitions, and presentation styles for routines you already perform or ideas you are developing.', proTip: 'Ask for two contrasting versions first, such as warm/family-friendly and mysterious/dramatic, then combine the strongest lines.' },
    { icon: ImageIcon, title: 'Visual Brainstorm', description: 'Generate magic-related visual concepts for posters, props, stages, social posts, theatrical moods, and creative inspiration.', proTip: 'Mention the exact magical subject, setting, style, and whether you want practical prop realism or promotional artwork.' },
    { icon: CameraIcon, title: 'Identify a Trick', description: 'Upload an image or describe something you saw to receive likely effect families, research terms, and safe search suggestions without exposing secrets.', proTip: 'Describe what the audience sees and remembers, not what you assume the method is.' },
    { icon: ChecklistIcon, title: 'Prop Generator & Checklist', description: 'Design practical performance props, generate artist renderings, capture material constraints, and turn prop concepts into build-ready checklists.', proTip: 'Provide prop type, materials, budget, transport limits, reset speed, venue, and audience. The rendering and plan will stay better matched.' },
    { icon: BlueprintIcon, title: 'Illusion Blueprint', description: 'Create high-level, English-language illusion concepts with staging, safety, sightline, transport, and visual planning support.', proTip: 'Use it for concept direction and production planning. Keep real fabrication, engineering, and safety review in the hands of qualified builders.' },
    { icon: StageCurtainsIcon, title: 'Director Mode', description: 'Build full show structure with audience-aware pacing, transitions, narrative arcs, openers, middles, closers, and rehearsal priorities.', proTip: 'Give the show length, audience type, venue, style, and must-include routines to get a more coherent show flow.' },
    { icon: LightbulbIcon, title: 'Innovation Engine', description: 'A guided brainstorming workspace to refresh old material, combine ideas, and develop new presentations around practical constraints.', proTip: 'Run one broad creative pass, then a second pass focused only on angles, reset, pocket management, and audience handling.' },
    { icon: UsersCogIcon, title: "Assistant's Studio", description: 'Plan assistant choreography, cues, blocking, entrances, exits, handoffs, and on-stage partnership details.', proTip: 'Write cue words and physical positions clearly so both performer and assistant can rehearse the same map.' },
    { icon: BookIcon, title: 'Gospel Magic Assistant', description: 'Develop respectful gospel magic presentations, lesson connections, and audience-appropriate framing for ministry settings.', proTip: 'State the age group, message theme, venue, and desired tone before generating material.' },
    { icon: TutorIcon, title: 'Mentalism Assistant', description: 'Structure mentalism presentations, scripting, reveals, audience management, and theatrical framing in a safe, performance-focused way.', proTip: 'Focus prompts on presentation, fairness, clarity, and audience experience rather than secret methods.' },
    { icon: MicrophoneIcon, title: 'Live Rehearsal', description: 'Record multiple takes, review transcripts, and receive feedback on pacing, clarity, confidence, and performance structure.', proTip: 'Do several shorter takes instead of one long run. Compare openings, pauses, and final lines across takes.' },
    { icon: VideoIcon, title: 'Video Rehearsal', description: 'Upload or record rehearsal video for analysis of blocking, body language, clarity, audience focus, and performance improvement opportunities.', proTip: 'Record from the audience viewpoint with clear light and sound. Full-body framing helps the feedback become more useful.' },
    { icon: ShieldIcon, title: 'Angle & Risk Analysis', description: 'Review a routine for sightlines, audience management, reset risk, prop handling, blocking, and practical show conditions.', proTip: 'Include stage shape, audience position, lighting, helpers, and whether spectators may stand or surround you.' },
    { icon: UsersCogIcon, title: 'Persona Simulator', description: 'Test material against simulated audience types such as skeptical adults, enthusiastic children, distracted corporate guests, or hecklers.', proTip: 'Run the same script against two or three personas and look for lines that confuse, drag, or invite interruptions.' },
    { icon: BookmarkIcon, title: 'Saved Ideas', description: 'Store generated routines, scripts, prop ideas, show notes, and revisions so your best material stays organized and easy to revisit.', proTip: 'Save promising drafts early. You can refine later, but lost ideas are hard to recreate exactly.' },
    { icon: StageCurtainsIcon, title: 'Show Planner', description: 'Organize shows, setlists, tasks, subtasks, props, rehearsal steps, deadlines, and preparation workflows.', proTip: 'Break each show into prep, rehearsal, packing, travel, setup, performance, and follow-up tasks.' },
    { icon: UsersIcon, title: 'Show Feedback', description: 'Collect and review audience or client feedback so you can see what landed, what confused people, and what needs refinement.', proTip: 'Look for repeated comments across shows. One isolated comment is interesting; repeated comments are actionable.' },
    { icon: AnalyticsIcon, title: 'Performance Analytics', description: 'Review feedback trends, usage patterns, audience reactions, and performance improvement signals over time.', proTip: 'Pick one improvement target per month, such as clearer openings, stronger closers, or better pacing.' },
    { icon: DollarSignIcon, title: 'Client Management', description: 'Track clients, notes, contact details, event context, follow-ups, and gig-related business information.', proTip: 'After every performance, record what worked, what the client cared about, and when to follow up.' },
    { icon: FileTextIcon, title: 'Contract Generator', description: 'Generate performance agreement templates that can be customized for event details, expectations, payment terms, and cancellation language.', proTip: 'Always review generated contracts before use and adapt them to your local requirements and business practices.' },
    { icon: MegaphoneIcon, title: 'Marketing Campaign', description: 'Create promotional copy, email ideas, social posts, flyers, positioning statements, and campaign angles for your magic business.', proTip: 'Specify the exact channel and audience, such as corporate holiday party email or family birthday Facebook post.' },
    { icon: NewspaperIcon, title: 'Magic Wire', description: 'Browse magic-related news and inspiration to stay current and spark creative thinking.', proTip: 'Turn one headline or historical note into a presentation hook for an existing routine.' },
    { icon: BookIcon, title: 'Publications', description: 'Explore recommended books, magazines, and learning resources to deepen your study of magic.', proTip: 'When you find a useful source, save a note about how you might apply it to your own show.' },
    { icon: DatabaseIcon, title: 'Magic Dictionary', description: 'Look up magic terms, concepts, effect categories, and study references while learning or planning.', proTip: 'Search related terms after each lookup to build a stronger understanding of the concept.' },
    { icon: ViewGridIcon, title: 'Global Search', description: 'Search across tools and saved content so you can quickly find ideas, notes, shows, clients, and planning details.', proTip: 'Try searching by prop, venue, audience, show title, or theme.' },
    { icon: UsersIcon, title: 'Community', description: 'Find clubs, conventions, resources, and community-oriented magic links.', proTip: 'Verify dates and official links before planning travel or contacting an organization.' },
    { icon: ShieldIcon, title: 'Member Management', description: 'Review account, plan, trial, and access-related information for your Magic AI Wizard membership.', proTip: 'If access looks wrong after upgrading or confirming email, log out and back in to refresh your account status.' },
    { icon: ClockIcon, title: 'Usage Limits', description: 'See how daily, monthly, and per-minute limits work for AI tools and Live Rehearsal so the app remains stable for everyone.', proTip: 'If you hit a short burst limit, wait a minute and retry. Daily limits reset automatically.' }
];

function inferCategory(title: string): { category: HelpCategory; view?: string } {
    const t = title.toLowerCase();
    const viewMap: Record<string, string> = {
        'effect generator': 'effect-generator', 'patter engine': 'patter-engine', 'visual brainstorm': 'visual-brainstorm', 'identify a trick': 'identify',
        'prop generator & checklist': 'prop-checklists', 'illusion blueprint': 'illusion-blueprint', 'director mode': 'director-mode', 'innovation engine': 'effect-generator',
        "assistant's studio": 'assistant-studio', 'gospel magic assistant': 'gospel-magic-assistant', 'mentalism assistant': 'mentalism-assistant',
        'live rehearsal': 'live-rehearsal', 'video rehearsal': 'video-rehearsal', 'angle & risk analysis': 'angle-risk', 'persona simulator': 'persona-simulator',
        'saved ideas': 'saved-ideas', 'show planner': 'show-planner', 'show feedback': 'show-feedback', 'performance analytics': 'performance-analytics',
        'client management': 'client-management', 'contract generator': 'contract-generator', 'marketing campaign': 'marketing-campaign', 'magic wire': 'magic-wire',
        'publications': 'publications', 'magic dictionary': 'magic-dictionary', 'global search': 'global-search', 'community': 'community', 'member management': 'member-management', 'usage limits': 'member-management'
    };
    const view = viewMap[t] ?? undefined;
    if (t.includes('rehears') || t.includes('angle') || t.includes('persona')) return { category: 'Rehearse', view };
    if (t.includes('patter') || t.includes('effect') || t.includes('innovation') || t.includes('image') || t.includes('visual') || t.includes('identify') || t.includes('prop generator') || t.includes('blueprint') || t.includes('director') || t.includes('assistant') || t.includes('gospel') || t.includes('mentalism')) return { category: 'Create', view };
    if (t.includes('show planner') || t.includes('checklist') || t.includes('saved') || t.includes('feedback')) return { category: 'Plan & Organize', view };
    if (t.includes('client') || t.includes('contract') || t.includes('marketing') || t.includes('analytics')) return { category: 'Business', view };
    if (t.includes('theory') || t.includes('dictionary') || t.includes('publication') || t.includes('wire')) return { category: 'Learn', view };
    if (t.includes('community')) return { category: 'Community', view };
    if (t.includes('search')) return { category: 'Search', view };
    if (t.includes('member') || t.includes('usage')) return { category: 'Account', view };
    return { category: 'Other', view };
}

const workflows = [
    { title: 'First 5 minutes', icon: StarIcon, steps: [
        { label: 'Generate your first effect idea', view: 'effect-generator' }, { label: 'Save one idea you like', view: 'saved-ideas' }, { label: 'Write a short patter draft', view: 'patter-engine' }, { label: 'Create a prop or checklist', view: 'prop-checklists' }, { label: 'Try one Live Rehearsal take', view: 'live-rehearsal' }
    ] },
    { title: 'Build a new routine', icon: WandIcon, steps: [
        { label: 'Generate an effect idea', view: 'effect-generator' }, { label: 'Brainstorm visuals or props', view: 'visual-brainstorm' }, { label: 'Write patter / script', view: 'patter-engine' }, { label: 'Check angles and risks', view: 'angle-risk' }, { label: 'Rehearse and refine', view: 'live-rehearsal' }
    ] },
    { title: 'Prepare for a gig', icon: StageCurtainsIcon, steps: [
        { label: 'Create your show plan', view: 'show-planner' }, { label: 'Generate a contract template', view: 'contract-generator' }, { label: 'Build your packing list', view: 'prop-checklists' }, { label: 'Create marketing copy', view: 'marketing-campaign' }, { label: 'Run a final rehearsal', view: 'video-rehearsal' }
    ] },
    { title: 'Design something visual', icon: BlueprintIcon, steps: [
        { label: 'Create an illusion concept', view: 'illusion-blueprint' }, { label: 'Generate a prop rendering', view: 'prop-checklists' }, { label: 'Brainstorm promotional art', view: 'visual-brainstorm' }, { label: 'Save the strongest version', view: 'saved-ideas' }
    ] },
    { title: 'Learn something new', icon: BookIcon, steps: [
        { label: 'Look up terms as you study', view: 'magic-dictionary' }, { label: 'Read recommended resources', view: 'publications' }, { label: 'Check Magic Wire for ideas', view: 'magic-wire' }, { label: 'Apply one idea immediately', view: 'saved-ideas' }
    ] }
] as const;


const HelpModal: React.FC<HelpModalProps> = ({ onClose, onNavigate, contextView }) => {
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

    // Context-aware Help: if the caller provides a current tool view, pre-filter Help to that tool.
    useEffect(() => {
        if (!contextView) return;
        const match = enriched.find((f) => f.view === contextView);
        if (!match) return;
        setActiveCategory(match.category);
        setQuery(match.title);
    }, [contextView, enriched]);


    return (
        <div
            className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="relative z-[10000] w-full max-w-6xl h-[92vh] bg-slate-800/95 border border-slate-600 rounded-lg shadow-2xl shadow-purple-900/40 flex flex-col"
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

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
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
