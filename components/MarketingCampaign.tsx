
import React, { useEffect, useMemo, useState } from 'react';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { createClientProposal } from '../services/proposalsService';
import { createBookingPitch } from '../services/pitchesService';
import { createShow, addTasksToShow } from '../services/showsService';
import { MARKETING_ASSISTANT_SYSTEM_INSTRUCTION } from '../constants';
import { MegaphoneIcon, WandIcon, SaveIcon, CheckIcon, ShareIcon, UsersIcon, StageCurtainsIcon, CalendarIcon, FileTextIcon, MailIcon, BlueprintIcon, ChevronDownIcon, SendIcon, TagIcon, TimerIcon, ViewGridIcon, ViewListIcon, CopyIcon, CustomizeIcon } from './icons';
import ShareButton from './ShareButton';
import { CohesionActions } from './CohesionActions';
import { trackClientEvent } from '../services/telemetryClient';
import type { User } from '../types';

interface MarketingCampaignProps {
    user: User;
    onIdeaSaved: () => void;
    onNavigateToShowPlanner?: (showId: string) => void;
    onNavigateToDirectorMode?: () => void;
    onNavigate?: (view: 'client-proposals' | 'booking-pitches', id: string) => void;
}


type CampaignResult = {
    campaignName: string;
    campaignSummary: string;
    targetAudience: string;
    primaryHook: string;
    taglines: string[];
    pressRelease: string;
    socialPosts: string[];
    emailCampaign: string[];
    posterCopy: string;
    bookingPitch: string;
    ctaStrategy: string;
    rolloutPlan: string[];
    notes: string[];
};

const RESULT_SECTIONS = [
    'Campaign Overview',
    'Audience & Offer',
    'Headlines / Taglines',
    'Press Release',
    'Social Posts',
    'Email Campaign',
    'Poster / Flyer Copy',
    'Booking Pitch',
    'CTA Strategy',
    'Rollout Plan',
    'Notes',
] as const;

const DEFAULT_RESULT_CARDS_STATE: Record<(typeof RESULT_SECTIONS)[number], boolean> = {
    'Campaign Overview': true,
    'Audience & Offer': false,
    'Headlines / Taglines': false,
    'Press Release': false,
    'Social Posts': false,
    'Email Campaign': false,
    'Poster / Flyer Copy': false,
    'Booking Pitch': false,
    'CTA Strategy': false,
    'Rollout Plan': false,
    'Notes': false,
};

const emptyCampaignResult = (): CampaignResult => ({
    campaignName: '',
    campaignSummary: '',
    targetAudience: '',
    primaryHook: '',
    taglines: [],
    pressRelease: '',
    socialPosts: [],
    emailCampaign: [],
    posterCopy: '',
    bookingPitch: '',
    ctaStrategy: '',
    rolloutPlan: [],
    notes: [],
});

const coerceStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return value.map(item => String(item).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(/\n|•|- /)
            .map(item => item.trim())
            .filter(Boolean);
    }
    return [];
};

const extractJsonObject = (raw: string): string => {
    const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) return fencedMatch[1].trim();

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) return raw.slice(start, end + 1);
    return raw;
};

const normalizeCampaignResult = (
    raw: unknown,
    fallback: { campaignName: string; targetAudience: string; primaryHook: string }
): CampaignResult => {
    const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const result = emptyCampaignResult();

    result.campaignName = String(source.campaignName ?? fallback.campaignName ?? '').trim();
    result.campaignSummary = String(source.campaignSummary ?? '').trim();
    result.targetAudience = String(source.targetAudience ?? fallback.targetAudience ?? '').trim();
    result.primaryHook = String(source.primaryHook ?? fallback.primaryHook ?? '').trim();
    result.taglines = coerceStringArray(source.taglines);
    result.pressRelease = String(source.pressRelease ?? '').trim();
    result.socialPosts = coerceStringArray(source.socialPosts);
    result.emailCampaign = coerceStringArray(source.emailCampaign);
    result.posterCopy = String(source.posterCopy ?? '').trim();
    result.bookingPitch = String(source.bookingPitch ?? '').trim();
    result.ctaStrategy = String(source.ctaStrategy ?? '').trim();
    result.rolloutPlan = coerceStringArray(source.rolloutPlan);
    result.notes = coerceStringArray(source.notes);

    if (!result.campaignSummary && result.pressRelease) {
        result.campaignSummary = result.pressRelease.split('\n').map(line => line.trim()).find(Boolean) ?? '';
    }
    if (!result.campaignName) {
        result.campaignName = fallback.campaignName || 'Marketing Campaign';
    }
    if (!result.targetAudience) {
        result.targetAudience = fallback.targetAudience || 'Not specified';
    }
    if (!result.primaryHook) {
        result.primaryHook = fallback.primaryHook || 'Memorable participation';
    }

    return result;
};

const stringifyCampaignResult = (data: CampaignResult | null): string => {
    if (!data) return '';

    const sections: string[] = [
        `# ${data.campaignName || 'Marketing Campaign'}`,
        data.campaignSummary ? `## Campaign Summary\n${data.campaignSummary}` : '',
        `## Audience & Offer\n- Target Audience: ${data.targetAudience || 'Not specified'}\n- Primary Hook: ${data.primaryHook || 'Not specified'}`,
        data.taglines.length ? `## Taglines\n${data.taglines.map(item => `- ${item}`).join('\n')}` : '',
        data.pressRelease ? `## Press Release\n${data.pressRelease}` : '',
        data.socialPosts.length ? `## Social Posts\n${data.socialPosts.map(item => `- ${item}`).join('\n')}` : '',
        data.emailCampaign.length ? `## Email Campaign\n${data.emailCampaign.map(item => `- ${item}`).join('\n')}` : '',
        data.posterCopy ? `## Poster / Flyer Copy\n${data.posterCopy}` : '',
        data.bookingPitch ? `## Booking Pitch\n${data.bookingPitch}` : '',
        data.ctaStrategy ? `## CTA Strategy\n${data.ctaStrategy}` : '',
        data.rolloutPlan.length ? `## Rollout Plan\n${data.rolloutPlan.map(item => `- ${item}`).join('\n')}` : '',
        data.notes.length ? `## Notes\n${data.notes.map(item => `- ${item}`).join('\n')}` : '',
    ].filter(Boolean);

    return sections.join('\n\n');
};

const LoadingIndicator: React.FC<{ stepText: string }> = ({ stepText }) => (
    <div className="flex flex-col items-center justify-center text-center p-8">
        <div className="relative">
            <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin" />
            </div>
        </div>

        {/* Shimmer / progress feel */}
        <div className="w-full max-w-sm mt-6">
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                <div className="h-full w-1/3 bg-slate-600 animate-pulse" />
            </div>
        </div>

        <p className="text-slate-300 mt-4 text-lg">Generating campaign…</p>
        <p className="text-slate-400 text-sm mt-1">{stepText}</p>
        <p className="text-slate-500 text-xs mt-3">This can take a few seconds depending on provider load.</p>
    </div>
);

const AUDIENCE_CATEGORIES = ['Corporate', 'Family Show', 'Private Party', 'Theater / Stage', 'Festival / Fair', 'Strolling / Close-up'];
const STYLE_CHOICES = ['Comedic', 'Mysterious', 'Dramatic', 'Elegant', 'Storytelling', 'Interactive'];

const CAMPAIGN_STYLES = [
    'Premium Corporate',
    'High-Energy Festival',
    'Elegant Theater',
    'Viral Social Push',
] as const;

const SHOW_TITLE_SUGGESTIONS = [
    'The Mind Illusion Experience',
    'Secrets of the Impossible',
    'The Astonishment Project',
];

const THEME_SUGGESTIONS = [
    'Psychological illusion',
    'Story-driven magic',
    'Audience prediction',
];

const PERSONA_VERSIONS = [
    { key: 'Base', label: 'Default' },
    { key: 'Corporate Buyers', label: 'Corporate buyers' },
    { key: 'Parents', label: 'Parents' },
    { key: 'Event Planners', label: 'Event planners' },
    { key: 'Festival Coordinators', label: 'Festival coordinators' },
] as const;

const INPUT_SECTIONS = [
    'Show Basics',
    'Audience & Booking Market',
    'Brand / Performance Style',
    'Campaign Strategy',
    'Keywords / Themes',
] as const;

const DEFAULT_SECTION_STATE = {
    'Show Basics': true,
    'Audience & Booking Market': true,
    'Brand / Performance Style': false,
    'Campaign Strategy': false,
    'Keywords / Themes': false,
} as const;

const LOADING_STEPS = [
    'Analyzing performance profile…',
    'Building marketing voice…',
    'Drafting campaign assets…',
];

    // Gold heading accents (brand hierarchy)
    const goldHeading = "text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-200 drop-shadow-[0_1px_0_rgba(0,0,0,0.35)] transition duration-150 hover:drop-shadow-[0_0_10px_rgba(245,208,110,0.35)]";
    const goldHeadingSmall = "text-amber-200/90 drop-shadow-[0_1px_0_rgba(0,0,0,0.35)] transition duration-150 hover:text-amber-200 hover:drop-shadow-[0_0_10px_rgba(245,208,110,0.35)]";


const MarketingCampaign: React.FC<MarketingCampaignProps> = ({ user, onIdeaSaved, onNavigateToShowPlanner, onNavigateToDirectorMode, onNavigate }) => {
    const [showTitle, setShowTitle] = useState('');
    const [selectedAudiences, setSelectedAudiences] = useState<string[]>([]);
    const [customAudience, setCustomAudience] = useState('');
    const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
    const [keyThemes, setKeyThemes] = useState('');
    const [campaignStyle, setCampaignStyle] = useState<'Premium Corporate' | 'High-Energy Festival' | 'Elegant Theater' | 'Viral Social Push' | ''>('');

    const [showTitleTouched, setShowTitleTouched] = useState(false);
    const [audienceTouched, setAudienceTouched] = useState(false);
    const [loadingStepIndex, setLoadingStepIndex] = useState(0);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<CampaignResult | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

    type ActionNotice = { message: string; actionLabel?: string; action?: () => void };
    const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
    const [isSendingToPlanner, setIsSendingToPlanner] = useState(false);
    const [isSavingBlueprint, setIsSavingBlueprint] = useState(false);
    const [isGeneratingAlternate, setIsGeneratingAlternate] = useState(false);
    const [isSendingToDirector, setIsSendingToDirector] = useState(false);
    const [isSendingToCRM, setIsSendingToCRM] = useState(false);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
    const [blueprintMenuOpen, setBlueprintMenuOpen] = useState(false);
    const [personaView, setPersonaView] = useState<(typeof PERSONA_VERSIONS)[number]['key']>('Base');
    const [personaResults, setPersonaResults] = useState<Record<string, CampaignResult>>({});
    const [isGeneratingPersona, setIsGeneratingPersona] = useState(false);
    const [showSparkle, setShowSparkle] = useState(false);
    const [inputSectionsOpen, setInputSectionsOpen] = useState<Record<(typeof INPUT_SECTIONS)[number], boolean>>({ ...DEFAULT_SECTION_STATE });
    const [resultCardsOpen, setResultCardsOpen] = useState<Record<(typeof RESULT_SECTIONS)[number], boolean>>({ ...DEFAULT_RESULT_CARDS_STATE });


    useEffect(() => {
        if (!isLoading) return;
        setLoadingStepIndex(0);
        const t = window.setInterval(() => {
            setLoadingStepIndex(prev => (prev + 1) % LOADING_STEPS.length);
        }, 1400);
        return () => window.clearInterval(t);
    }, [isLoading]);
    
    const handleAudienceToggle = (audience: string) => {
        setSelectedAudiences(prev => 
            prev.includes(audience) ? prev.filter(a => a !== audience) : [...prev, audience]
        );
    };

    const handleStyleToggle = (style: string) => {
        setSelectedStyles(prev => 
            prev.includes(style) ? prev.filter(s => s !== style) : [...prev, style]
        );
    };

    const toggleInputSection = (section: (typeof INPUT_SECTIONS)[number]) => {
        setInputSectionsOpen(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const expandAllSections = () => {
        setInputSectionsOpen({
            'Show Basics': true,
            'Audience & Booking Market': true,
            'Brand / Performance Style': true,
            'Campaign Strategy': true,
            'Keywords / Themes': true,
        });
    };

    const compactAllSections = () => {
        setInputSectionsOpen({
            'Show Basics': true,
            'Audience & Booking Market': false,
            'Brand / Performance Style': false,
            'Campaign Strategy': false,
            'Keywords / Themes': false,
        });
    };

    const toggleResultCard = (section: (typeof RESULT_SECTIONS)[number]) => {
        setResultCardsOpen(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const expandAllResultCards = () => {
        setResultCardsOpen({
            'Campaign Overview': true,
            'Audience & Offer': true,
            'Headlines / Taglines': true,
            'Press Release': true,
            'Social Posts': true,
            'Email Campaign': true,
            'Poster / Flyer Copy': true,
            'Booking Pitch': true,
            'CTA Strategy': true,
            'Rollout Plan': true,
            'Notes': true,
        });
    };

    const compactAllResultCards = () => {
        setResultCardsOpen({ ...DEFAULT_RESULT_CARDS_STATE });
    };

    const resetPage = () => {
        setShowTitle('');
        setSelectedAudiences([]);
        setCustomAudience('');
        setSelectedStyles([]);
        setKeyThemes('');
        setCampaignStyle('');
        setShowTitleTouched(false);
        setAudienceTouched(false);
        setLoadingStepIndex(0);
        setIsLoading(false);
        setError(null);
        setResult(null);
        setSaveStatus('idle');
        setActionNotice(null);
        setIsSendingToPlanner(false);
        setIsSavingBlueprint(false);
        setIsGeneratingAlternate(false);
        setIsSendingToDirector(false);
        setIsSendingToCRM(false);
        setBlueprintMenuOpen(false);
        setCopyStatus('idle');
        setPersonaView('Base');
        setPersonaResults({});
        setIsGeneratingPersona(false);
        setShowSparkle(false);
        setInputSectionsOpen({ ...DEFAULT_SECTION_STATE });
        setResultCardsOpen({ ...DEFAULT_RESULT_CARDS_STATE });
        void trackClientEvent({
            tool: 'marketing_campaign',
            action: 'marketing_campaign_reset',
            metadata: telemetryMetadata,
            outcome: 'ALLOWED',
        });
    };

    const loadDemoCampaign = () => {
        setShowTitle('Summer Library Show Promo Campaign');
        setSelectedAudiences(['Family Show', 'Festival / Fair']);
        setCustomAudience('Library youth services coordinators');
        setSelectedStyles(['Interactive', 'Storytelling', 'Comedic']);
        setCampaignStyle('High-Energy Festival');
        setKeyThemes('Summer reading kickoff, family-friendly amazement, interactive comedy magic, colorful visuals, library community event, memorable photo moments.');
        setShowTitleTouched(true);
        setAudienceTouched(true);
        setError(null);
        setActionNotice({ message: 'Demo campaign loaded: Summer Library Show Promo Campaign.' });
        expandAllSections();
        setResultCardsOpen({ ...DEFAULT_RESULT_CARDS_STATE });
        void trackClientEvent({
            tool: 'marketing_campaign',
            action: 'marketing_campaign_demo_loaded',
            metadata: { ...telemetryMetadata, show_title: 'Summer Library Show Promo Campaign' },
            outcome: 'ALLOWED',
        });
        window.setTimeout(() => setActionNotice(null), 2200);
    };

    const isFormValid = useMemo(() => {
        return showTitle.trim() !== '' && (selectedAudiences.length > 0 || customAudience.trim() !== '');
    }, [showTitle, selectedAudiences, customAudience]);

    useEffect(() => {
        if (!isLoading) {
            setLoadingStepIndex(0);
            return;
        }

        const t = setInterval(() => {
            setLoadingStepIndex(prev => (prev + 1) % LOADING_STEPS.length);
        }, 1100);

        return () => clearInterval(t);
    }, [isLoading]);


    
const readinessScore = useMemo(() => {
    // Simple, gamified completeness score (0-100)
    let score = 0;

    const titleOk = showTitle.trim().length > 0;
    const audienceOk = selectedAudiences.length > 0 || customAudience.trim().length > 0;
    const styleOk = selectedStyles.length > 0;
    const templateOk = campaignStyle !== '';
    const themesOk = keyThemes.trim().length > 0;

    if (titleOk) score += 30;
    if (audienceOk) score += 25;
    if (styleOk) score += 15;
    if (templateOk) score += 15;
    if (themesOk) score += 15;

    return Math.min(100, score);
}, [campaignStyle, customAudience, keyThemes, selectedAudiences.length, selectedStyles.length, showTitle]);

const conversionStrength = useMemo(() => {
    if (readinessScore >= 85) return 'High';
    if (readinessScore >= 65) return 'Medium';
    return 'Low';
}, [readinessScore]);

const liveAudiencesLabel = useMemo(() => {
    const all = [...selectedAudiences];
    if (customAudience.trim()) all.push(customAudience.trim());
    return all.length ? all.join(', ') : 'Not selected';
}, [customAudience, selectedAudiences]);

const campaignTone = useMemo(() => {
    const styles = selectedStyles.length ? selectedStyles : [];
    const tone = styles.length ? styles.join(' + ') : (campaignStyle ? campaignStyle : 'Not selected');
    return tone;
}, [campaignStyle, selectedStyles]);

const primaryAngle = useMemo(() => {
    // Lightweight heuristic mapping for a helpful "strategy preview" feel
    const a = liveAudiencesLabel.toLowerCase();
    if (campaignStyle === 'Premium Corporate' || a.includes('corporate')) return 'Professional credibility + ROI';
    if (campaignStyle === 'High-Energy Festival' || a.includes('festival') || a.includes('fair')) return 'High-energy crowd engagement';
    if (campaignStyle === 'Elegant Theater' || a.includes('theater') || a.includes('stage')) return 'Story + wonder + prestige';
    if (campaignStyle === 'Viral Social Push') return 'Shareable moments + curiosity hooks';
    if (a.includes('private')) return 'Personalized amazement + intimacy';
    if (a.includes('family')) return 'Family-safe wonder + laughs';
    if (a.includes('strolling') || a.includes('close-up')) return 'Up-close impossibility + interaction';
    return 'Audience immersion';
}, [campaignStyle, liveAudiencesLabel]);

const targetHook = useMemo(() => {
    const a = liveAudiencesLabel.toLowerCase();
    if (campaignStyle === 'Premium Corporate' || a.includes('corporate')) return 'Corporate engagement';
    if (campaignStyle === 'High-Energy Festival' || a.includes('festival') || a.includes('fair')) return 'Crowd momentum + repeat stops';
    if (campaignStyle === 'Elegant Theater' || a.includes('theater') || a.includes('stage')) return 'Prestige + emotional payoff';
    if (campaignStyle === 'Viral Social Push') return 'Curiosity + shareability';
    if (a.includes('private')) return 'Personal connection';
    if (a.includes('family')) return 'Family-friendly delight';
    if (a.includes('strolling') || a.includes('close-up')) return 'Interactive moments';
    return 'Memorable participation';
}, [campaignStyle, liveAudiencesLabel]);

const showTitleSuggestionsVisible = useMemo(() => showTitle.trim().length < 3, [showTitle]);
const themeSuggestionsVisible = useMemo(() => keyThemes.trim().length < 8, [keyThemes]);

const advisorNotes = useMemo(() => {
    const notes: string[] = [];
    const a = liveAudiencesLabel.toLowerCase();

    if (campaignStyle === 'Premium Corporate' || a.includes('corporate')) {
        notes.push('Your tone positions you as a premium performer — lean on credibility, outcomes, and professionalism.');
        notes.push('Your hook appeals strongly to corporate buyers — emphasize engagement, impact, and reliability.');
        notes.push('Consider adding credibility proof (logos, testimonials, short video clip) to increase conversions.');
    } else if (campaignStyle === 'High-Energy Festival' || a.includes('festival') || a.includes('fair')) {
        notes.push('Festival audiences respond best to high-energy hooks and simple, repeatable messaging.');
        notes.push('Lead with “stop-and-watch” moments — bold claims + fast payoff increases crowd build.');
        notes.push('Add a clear call-to-action: time windows, location, and “next show” rhythm.');
    } else if (campaignStyle === 'Elegant Theater' || a.includes('theater') || a.includes('stage')) {
        notes.push('Your positioning is premium — build prestige with story, reviews, and atmosphere cues.');
        notes.push('Theater buyers love clarity: run time, age guidance, and what makes this show “different.”');
        notes.push('Add a short “director’s statement” paragraph to elevate perceived value.');
    } else if (campaignStyle === 'Viral Social Push') {
        notes.push('Your best advantage is shareability — design your hook around curiosity + quick payoff.');
        notes.push('Create 3–5 “moment clips” to anchor posts (reactions, reveals, participatory beats).');
        notes.push('Use a tight CTA: “DM for dates” or “Book now” with one link destination.');
    } else {
        // fallback
        notes.push('Your tone is strong — make sure your hook is repeated consistently across every channel.');
        notes.push('Add one credibility line (years, awards, notable venues) to boost trust and booking confidence.');
        notes.push('Consider a clear CTA path: “inquire” → “availability” → “deposit” to reduce drop-off.');
    }

    return notes.slice(0, 3);
}, [campaignStyle, liveAudiencesLabel]);

const conversionPredictor = useMemo(() => {
    const a = liveAudiencesLabel.toLowerCase();

    let bestChannel = 'Email Outreach';
    if (campaignStyle === 'Viral Social Push') bestChannel = 'Social + Short Video';
    else if (a.includes('family')) bestChannel = 'Facebook/Instagram';
    else if (a.includes('festival') || a.includes('fair')) bestChannel = 'Social + Posters';
    else if (a.includes('theater') || a.includes('stage')) bestChannel = 'Email + Press + Listings';
    else if (a.includes('private')) bestChannel = 'Referrals + Direct Outreach';
    else if (a.includes('strolling') || a.includes('close-up')) bestChannel = 'Event Planners + Instagram';

    const bestHook = targetHook;

    // readiness drives range; keep believable and consistent
    let low = 10;
    let high = 16;
    if (readinessScore >= 85) { low = 18; high = 24; }
    else if (readinessScore >= 65) { low = 14; high = 20; }

    return {
        range: `${low}–${high}%`,
        bestChannel,
        bestHook,
    };
}, [campaignStyle, liveAudiencesLabel, readinessScore, targetHook]);

const competitivePositioning = useMemo(() => {
    // Lightweight, on-brand heuristics (no hard claims). Keeps the feature useful even without external benchmarking.
    const styles = selectedStyles.map(s => s.toLowerCase());
    const a = liveAudiencesLabel.toLowerCase();
    const template = campaignStyle.toLowerCase();

    const engagementSignals = (styles.some(s => ['interactive', 'comedic', 'storytelling'].includes(s)) ? 2 : 0)
        + (template.includes('high-energy') || template.includes('viral') ? 2 : 0)
        + (a.includes('family') || a.includes('festival') || a.includes('fair') ? 1 : 0);

    const prestigeSignals = (styles.some(s => ['elegant', 'mysterious', 'dramatic'].includes(s)) ? 2 : 0)
        + (template.includes('elegant') || a.includes('theater') || a.includes('stage') ? 2 : 0)
        + (a.includes('corporate') ? 1 : 0);

    // Defaults requested by Tier 4: strongest engagement tone / weakest prestige positioning.
    // If the inputs clearly skew prestige, invert so it still feels intelligent.
    let strongest = 'Engagement tone';
    let weakest = 'Prestige positioning';

    if (prestigeSignals - engagementSignals >= 2) {
        strongest = 'Prestige positioning';
        weakest = 'Engagement tone';
    } else if (Math.abs(prestigeSignals - engagementSignals) <= 1) {
        strongest = 'Clarity of offer';
        weakest = 'Differentiated proof';
    }

    return { strongest, weakest };
}, [campaignStyle, liveAudiencesLabel, selectedStyles]);

const roiProjection = useMemo(() => {
    // Estimated bookings per 1,000 views (heuristic). Range scales with readiness and audience fit.
    const a = liveAudiencesLabel.toLowerCase();
    let low = 2;
    let high = 6;

    if (readinessScore >= 85) { low = 5; high = 11; }
    else if (readinessScore >= 65) { low = 4; high = 9; }
    else { low = 2; high = 6; }

    // Slight adjustments based on channel fit
    if (a.includes('corporate')) { low += 0; high += 1; }
    if (a.includes('festival') || a.includes('fair')) { low += 1; high += 0; }
    if (campaignStyle === 'Viral Social Push') { low += 1; high += 2; }

    return `${low}–${high} bookings / 1,000 views`;
}, [campaignStyle, liveAudiencesLabel, readinessScore]);

const activeResult = useMemo(() => {
    if (!result) return null;
    if (personaView === 'Base') return result;
    return personaResults[personaView] || result;
}, [personaResults, personaView, result]);

const activeResultText = useMemo(() => stringifyCampaignResult(activeResult), [activeResult]);

const telemetryMetadata = useMemo(() => ({
    show_title: showTitle || 'untitled',
    campaign_style: campaignStyle || 'Not specified',
    target_audience: liveAudiencesLabel,
    performance_style: selectedStyles.join(', ') || 'Not specified',
    readiness_score: readinessScore,
    has_result: Boolean(activeResult),
    persona_view: personaView,
}), [activeResult, campaignStyle, liveAudiencesLabel, personaView, readinessScore, selectedStyles, showTitle]);

useEffect(() => {
    void trackClientEvent({
        tool: 'marketing_campaign',
        action: 'marketing_campaign_opened',
        metadata: telemetryMetadata,
        outcome: 'ALLOWED',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

const generateButtonLabel = useMemo(() => {
        if (isLoading) return 'Generating Campaign…';
        if (error) return 'Try Again';
        if (result) return 'Regenerate Campaign';
        if (isFormValid) return 'Ready to Generate ✓';
        return 'Generate Campaign';
    }, [error, isFormValid, isLoading, result]);

    const generateCampaign = async (mode: 'primary' | 'alternate' = 'primary') => {
        setShowTitleTouched(true);
        setAudienceTouched(true);

        const missingTitle = showTitle.trim() === '';
        const missingAudience = selectedAudiences.length === 0 && customAudience.trim() === '';

        if (missingTitle || missingAudience) {
            setError(missingAudience && !missingTitle ? 'Target audience helps the AI tailor your messaging.' : null);
            return;
        }

        if (mode === 'alternate') {
            setIsGeneratingAlternate(true);
        } else {
            setIsLoading(true);
        }

        setError(null);
        if (mode === 'primary') {
            setResult(null);
            setPersonaResults({});
            setPersonaView('Base');
            setSaveStatus('idle');
            setResultCardsOpen({ ...DEFAULT_RESULT_CARDS_STATE });
        }

        const allAudiences = [...selectedAudiences];
        if (customAudience.trim()) {
            allAudiences.push(customAudience.trim());
        }

        const prompt = `
            Generate a marketing campaign toolkit for the following magic show.
            Return the response ONLY as valid JSON using this schema:
            {
              "campaignName": "",
              "campaignSummary": "",
              "targetAudience": "",
              "primaryHook": "",
              "taglines": [],
              "pressRelease": "",
              "socialPosts": [],
              "emailCampaign": [],
              "posterCopy": "",
              "bookingPitch": "",
              "ctaStrategy": "",
              "rolloutPlan": [],
              "notes": []
            }

            Show Details:
            - Show Title: ${showTitle}
            - Target Audience: ${allAudiences.join(', ')}
            - Performance Style: ${selectedStyles.join(', ') || 'Not specified'}
            - Campaign Style: ${campaignStyle || 'Not specified'}
            - Key Themes: ${keyThemes || 'Not specified'}
            ${mode === 'alternate' ? '- Direction: Create a distinctly different alternate campaign angle with fresh hooks, different wording, and a new rollout emphasis while staying aligned to the same show.' : ''}
        `;

        try {
          const response = await generateResponse(prompt, MARKETING_ASSISTANT_SYSTEM_INSTRUCTION, user);
          const parsed = JSON.parse(extractJsonObject(response));
          const normalized = normalizeCampaignResult(parsed, {
            campaignName: showTitle,
            targetAudience: allAudiences.join(', ') || liveAudiencesLabel,
            primaryHook: targetHook,
          });
          setResult(normalized);
          setShowSparkle(true);
          void trackClientEvent({
            tool: 'marketing_campaign',
            action: mode === 'alternate' ? 'marketing_campaign_alternate_generated' : 'marketing_campaign_generated',
            metadata: { ...telemetryMetadata, result_campaign_name: normalized.campaignName },
            outcome: 'SUCCESS_NOT_CHARGED',
          });
          if (mode === 'alternate') {
            setActionNotice({ message: 'Alternate campaign generated with a fresh angle.' });
            window.setTimeout(() => setActionNotice(null), 2200);
          }
          window.setTimeout(() => setShowSparkle(false), 350);
        } catch (err) {
          setError(err instanceof Error ? err.message : "An unknown error occurred.");
        } finally {
          setIsLoading(false);
          setIsGeneratingAlternate(false);
        }
    };

    const handleGenerate = async () => {
        await generateCampaign('primary');
    };

    const handleGenerateAlternateCampaign = async () => {
        if (!result) return;
        await generateCampaign('alternate');
    };

    const localPersonaTransform = (base: CampaignResult, personaKey: (typeof PERSONA_VERSIONS)[number]['key']): CampaignResult => {
        const profiles: Record<string, { tone: string; angle: string; hook: string; addOns: string[]; taglineSeeds: string[]; }> = {
            'Corporate Buyers': {
                tone: 'premium, confident, business-forward',
                angle: 'employee engagement + client wow-factor',
                hook: 'a polished, interactive experience that feels high value and easy to book',
                addOns: [
                    'Emphasize reliability, professionalism, and clear run-of-show.',
                    'Mention options for branded moments, awards, or client appreciation.',
                    'Highlight minimal setup, flexible time blocks, and works in any room.',
                ],
                taglineSeeds: [
                    'Turn your event into a standout experience.',
                    'Premium magic. Real engagement.',
                    'Make the room talk about your brand.',
                ],
            },
            'Parents': {
                tone: 'warm, reassuring, family-friendly',
                angle: 'age-appropriate wonder + laughter',
                hook: 'a safe, inclusive show that keeps kids engaged and parents impressed',
                addOns: [
                    'Stress family-friendly, age-appropriate humor, and positive participation.',
                    'Mention birthday parties, school events, and family gatherings.',
                    'Highlight clear boundaries: no scary moments and no embarrassing volunteers.',
                ],
                taglineSeeds: [
                    'Big laughs. Bigger wonder.',
                    'Family-friendly magic they will remember.',
                    'Where kids sparkle and parents relax.',
                ],
            },
            'Event Planners': {
                tone: 'practical, organized, planner-friendly',
                angle: 'stress-free booking + smooth logistics',
                hook: 'a plug-and-play entertainment solution with clear requirements and fast communication',
                addOns: [
                    'Call out fast setup, simple tech needs, and flexible staging.',
                    'Emphasize communication, professionalism, and timeline coordination.',
                    'Include a short requirements note for space, sound, and timing.',
                ],
                taglineSeeds: [
                    'Easy to book. Easy to love.',
                    'Entertainment that runs on time.',
                    'A planner’s favorite surprise.',
                ],
            },
            'Festival Coordinators': {
                tone: 'high-energy, crowd-friendly, adaptable',
                angle: 'big reactions + fast reset + repeatable sets',
                hook: 'a flexible show that can scale to crowds and keep energy high all day',
                addOns: [
                    'Highlight quick reset, repeatable sets, and strong crowd draw.',
                    'Mention roving options and instant attention openers.',
                    'Emphasize readiness for variable event conditions.',
                ],
                taglineSeeds: [
                    'Stop the crowd. Start the applause.',
                    'Big energy. Big reactions.',
                    'The show people follow.',
                ],
            },
        };

        const profile = profiles[personaKey] || {
            tone: 'tailored, audience-aligned',
            angle: 'strong audience fit',
            hook: 'a message tuned to this buyer',
            addOns: [],
            taglineSeeds: [],
        };

        const next = {
            ...base,
            campaignSummary: `${base.campaignSummary}${base.campaignSummary ? '\n\n' : ''}Persona Focus — ${personaKey}: ${profile.tone}. Primary Angle: ${profile.angle}.`,
            primaryHook: profile.hook,
            taglines: [...base.taglines, ...profile.taglineSeeds].filter((value, index, arr) => value && arr.indexOf(value) === index),
            notes: [...profile.addOns, ...base.notes].filter((value, index, arr) => value && arr.indexOf(value) === index),
        } satisfies CampaignResult;

        if (personaKey === 'Event Planners') {
            next.rolloutPlan = [
                'Include a quick setup note in outreach materials.',
                'List timing options: 10 / 20 / 30 / 45 minute sets.',
                ...next.rolloutPlan,
            ].filter((value, index, arr) => value && arr.indexOf(value) === index);
        }

        if (personaKey === 'Corporate Buyers') {
            next.ctaStrategy = `${next.ctaStrategy}${next.ctaStrategy ? '\n\n' : ''}Add a short credibility proof line with notable clients, event types, or testimonials.`;
        }

        return next;
    };

    const handleGeneratePersona = (personaKey: (typeof PERSONA_VERSIONS)[number]['key']) => {
        if (!result) return;
        if (personaKey === 'Base') {
            setPersonaView('Base');
            return;
        }

        // Instant local generation — no AI call, but keep a tiny “working” state for UI continuity.
        setIsGeneratingPersona(true);
        setError(null);
        setActionNotice(null);

        try {
            const transformed = localPersonaTransform(result, personaKey);
            setPersonaResults(prev => ({ ...prev, [personaKey]: transformed }));
            setPersonaView(personaKey);
            setActionNotice({ message: `Persona version generated locally for “${personaKey}”.` });
            window.setTimeout(() => setActionNotice(null), 4500);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            window.setTimeout(() => setIsGeneratingPersona(false), 250);
        }
    };

const handleSave = () => {
        if (activeResult) {
            const personaSuffix = personaView !== 'Base' ? ` (Persona: ${personaView})` : '';
            const fullContent = `## Marketing Campaign for: ${showTitle}${personaSuffix}\n\n${activeResult}`;
            saveIdea('text', fullContent, `Marketing for ${showTitle}`);
            onIdeaSaved();
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        }
    };

    const buildBlueprintContent = (label: string) => {
        const meta = [
            `Campaign Style: ${campaignStyle || 'Not specified'}`,
            `Target Audience: ${liveAudiencesLabel}`,
            `Performance Style: ${selectedStyles.join(', ') || 'Not specified'}`,
            `Readiness: ${readinessScore}%`,
        ].join('\n');

        const body = result ? stringifyCampaignResult(result) : '(No generated output yet.)';

        return `## Marketing Campaign Blueprint — ${label}\n\n**Show:** ${showTitle || '(untitled)'}\n\n**Meta**\n${meta}\n\n---\n\n${body}`;
    };

    const handleBlueprintSave = (label: 'Save as Template' | 'Save to Campaign Library' | 'Reuse Later' | 'Duplicate Campaign') => {
        if (!showTitle.trim()) {
            setShowTitleTouched(true);
            setActionNotice({ message: 'Add a show title before saving a blueprint.' });
            window.setTimeout(() => setActionNotice(null), 2200);
            return;
        }
        setIsSavingBlueprint(true);
        setBlueprintMenuOpen(false);
        try {
            const content = buildBlueprintContent(label);
            const title = `Marketing Blueprint — ${label} — ${showTitle}`;
            saveIdea('text', content, title);
            onIdeaSaved();
            setActionNotice({ message: 'Blueprint saved to Saved Ideas.' });
        } finally {
            setIsSavingBlueprint(false);
            window.setTimeout(() => setActionNotice(null), 2200);
        }
    };

    const handleSendToShowPlanner = async () => {
        if (!activeResult) return;
        if (!showTitle.trim()) {
            setShowTitleTouched(true);
            setActionNotice({ message: 'Add a show title so we can create a show plan.' });
            window.setTimeout(() => setActionNotice(null), 2200);
            return;
        }

        setIsSendingToPlanner(true);
        setActionNotice(null);

        try {
            const description = [
                'Auto-generated from Marketing Campaign Generator.',
                `Campaign Style: ${campaignStyle || 'Not specified'}`,
                `Target Audience: ${liveAudiencesLabel}`,
                `Performance Style: ${selectedStyles.join(', ') || 'Not specified'}`,
            ].join('\n');

            const created = await createShow(showTitle.trim(), description);

            const tasks = [
                { title: 'Marketing: Press Release', notes: activeResultText, priority: 'Medium', status: 'To-Do' },
                { title: 'Marketing: Social Posts', notes: activeResultText, priority: 'Medium', status: 'To-Do' },
                { title: 'Marketing: Email Campaign', notes: activeResultText, priority: 'Medium', status: 'To-Do' },
                { title: 'Marketing: Poster / Flyer Copy', notes: activeResultText, priority: 'Medium', status: 'To-Do' },
                { title: 'Marketing: Booking Pitch', notes: activeResultText, priority: 'High', status: 'To-Do' },
            ];

            await addTasksToShow(created.id, tasks as any);

            setActionNotice({ message: `Saved to Show Planner: “${showTitle.trim()}”`, actionLabel: 'Open Show Planner', action: () => onNavigateToShowPlanner?.(created.id) });
            // Stay on this page; user can open Show Planner via the notice button.
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unable to send to Show Planner.';
            setActionNotice(msg);
        } finally {
            setIsSendingToPlanner(false);
            window.setTimeout(() => setActionNotice(null), 2600);
        }
    };

    const handleQuickExportIdea = (kind: 'Client Proposal' | 'Social Scheduler' | 'Booking Pitch Builder') => {
        if (!activeResult) return;
        const label = kind === 'Client Proposal'
            ? 'Client Proposal Draft'
            : kind === 'Social Scheduler'
            ? 'Social Pack'
            : 'Booking Pitch Draft';

        const content = buildBlueprintContent(label);
        saveIdea('text', content, `${label} — ${showTitle || 'Untitled'}`);
        onIdeaSaved();
        void trackClientEvent({
            tool: 'marketing_campaign',
            action: 'marketing_campaign_exported',
            metadata: { ...telemetryMetadata, export_kind: kind },
            outcome: 'ALLOWED',
        });
        setActionNotice({ message: `${label} saved to Saved Ideas.` });
        window.setTimeout(() => setActionNotice(null), 2200);
    };


    const handleSendToDirectorMode = async () => {
        if (!activeResult) return;
        setIsSendingToDirector(true);
        setActionNotice(null);
        try {
            const content = `## Director Mode Brief — ${showTitle || 'Untitled'}

${activeResultText}

---

Director Notes:
- Primary Hook: ${activeResult.primaryHook || targetHook}
- Best Use Case: ${primaryAngle}
- Target Audience: ${activeResult.targetAudience || liveAudiencesLabel}`;
            saveIdea('text', content, `Director Mode Brief — ${showTitle || 'Untitled'}`);
            onIdeaSaved();
            void trackClientEvent({
                tool: 'marketing_campaign',
                action: 'marketing_campaign_sent_to_director',
                metadata: telemetryMetadata,
                outcome: 'ALLOWED',
            });
            setActionNotice({
                message: 'Director Mode brief saved to Idea Vault.',
                actionLabel: onNavigateToDirectorMode ? 'Open Director Mode' : undefined,
                action: onNavigateToDirectorMode,
            });
        } finally {
            setIsSendingToDirector(false);
            window.setTimeout(() => setActionNotice(null), 2600);
        }
    };

    const handleSendToCRMNotes = async () => {
        if (!activeResult) return;
        setIsSendingToCRM(true);
        setActionNotice(null);
        try {
            const content = `## CRM Campaign Notes — ${showTitle || 'Untitled'}

${activeResultText}

---

Follow-up Notes:
- Audience: ${liveAudiencesLabel}
- Campaign Style: ${campaignStyle || 'Not specified'}
- Recommended Hook: ${activeResult.primaryHook || targetHook}`;
            saveIdea('text', content, `CRM Campaign Notes — ${showTitle || 'Untitled'}`);
            onIdeaSaved();
            void trackClientEvent({
                tool: 'marketing_campaign',
                action: 'marketing_campaign_sent_to_crm',
                metadata: telemetryMetadata,
                outcome: 'ALLOWED',
            });
            setActionNotice({ message: 'CRM campaign notes saved to Idea Vault for client follow-up.' });
        } finally {
            setIsSendingToCRM(false);
            window.setTimeout(() => setActionNotice(null), 2600);
        }
    };

    const handleCopyCampaign = async () => {
        if (!activeResultText) return;
        try {
            await navigator.clipboard.writeText(activeResultText);
            setCopyStatus('copied');
            void trackClientEvent({
                tool: 'marketing_campaign',
                action: 'marketing_campaign_exported',
                metadata: { ...telemetryMetadata, export_kind: 'copy_campaign' },
                outcome: 'ALLOWED',
            });
            window.setTimeout(() => setCopyStatus('idle'), 1800);
        } catch (err) {
            setActionNotice({ message: 'Unable to copy campaign to clipboard.' });
            window.setTimeout(() => setActionNotice(null), 2200);
        }
    };

const handleCreateClientProposal = async () => {
    if (!activeResult) return;
    setIsSendingToPlanner(false);
    setActionNotice(null);
    try {
        const title = `${showTitle || 'Marketing Campaign'} — Client Proposal`;
        const { proposal, savedToIdeasFallback } = await createClientProposal({
            title,
            content: activeResultText,
            source: {
                showTitle,
                targetAudience: liveAudiencesLabel,
                performanceStyle: selectedStyles.join(', ') || 'Not specified',
                campaignStyle,
            }
        });

        if (savedToIdeasFallback) {
            setActionNotice({
                message: 'Client Proposal created (saved to Saved Ideas because proposals table is not configured yet).',
                            });
        } else {
            setActionNotice({
                message: 'Client Proposal created ✓',
                actionLabel: 'Open Proposal',
                action: () => onNavigate?.('client-proposals', proposal.id),
            });
        }
        window.setTimeout(() => setActionNotice(null), 2600);
    } catch (err: any) {
        const msg = String(err?.message ?? 'Failed to create proposal');
        setActionNotice({ message: `Client Proposal: ${msg}` });
    }
};

const handleCreateBookingPitch = async () => {
    if (!activeResult) return;
    setIsSendingToPlanner(false);
    setActionNotice(null);
    try {
        const title = `${showTitle || 'Marketing Campaign'} — Booking Pitch`;
        const { pitch, savedToIdeasFallback } = await createBookingPitch({
            title,
            content: activeResultText,
            source: {
                showTitle,
                targetAudience: liveAudiencesLabel,
                performanceStyle: selectedStyles.join(', ') || 'Not specified',
                campaignStyle,
            }
        });

        if (savedToIdeasFallback) {
            setActionNotice({ message: 'Booking Pitch created (saved to Saved Ideas because pitches table is not configured yet).' });
        } else {
            setActionNotice({
                message: 'Booking Pitch created ✓',
                actionLabel: 'Open Pitch',
                action: () => onNavigate?.('booking-pitches', pitch.id),
            });
        }
        window.setTimeout(() => setActionNotice(null), 2600);
    } catch (err: any) {
        const msg = String(err?.message ?? 'Failed to create pitch');
        setActionNotice({ message: `Booking Pitch: ${msg}` });
    }
};

    return (
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 animate-fade-in">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 md:p-5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className={`text-xl font-bold ${goldHeading}`}>Marketing Campaign Generator</h2>
                        <p className="text-slate-400 mt-2 max-w-3xl">Build a polished campaign package for your show with a stronger studio workflow, smarter live preview, and a cleaner generated workspace.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={loadDemoCampaign} className="inline-flex items-center gap-2 rounded-md border border-purple-500/40 bg-purple-600/15 px-3 py-2 text-sm font-medium text-purple-100 hover:bg-purple-600/25 transition-colors">
                            <WandIcon className="w-4 h-4" />
                            <span>Load Demo Campaign</span>
                        </button>
                        <button type="button" onClick={resetPage} className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-colors">
                            <CustomizeIcon className="w-4 h-4" />
                            <span>Reset Page</span>
                        </button>
                        <button type="button" onClick={expandAllSections} className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-colors">
                            <ViewGridIcon className="w-4 h-4" />
                            <span>Expand All</span>
                        </button>
                        <button type="button" onClick={compactAllSections} className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-colors">
                            <ViewListIcon className="w-4 h-4" />
                            <span>Compact All</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="flex flex-col bg-slate-900/50 rounded-lg border border-slate-800 min-h-[300px]">
                    <div className="border-b border-slate-800 px-4 py-4 md:px-5">
                        <h3 className={`text-lg font-semibold ${goldHeading}`}>Campaign Inputs</h3>
                        <p className="text-sm text-slate-400 mt-1">Organize your show details, audience fit, and campaign direction before generating marketing assets.</p>
                    </div>
                    <div className="p-4 md:p-5 space-y-4">
                        <div className="rounded-xl border border-purple-500/20 bg-gradient-to-r from-purple-600/10 via-slate-900/40 to-slate-900/10 p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className={`text-sm font-semibold ${goldHeadingSmall}`}>Live Campaign Preview</p>
                                    <p className="text-xs text-slate-400 mt-1">This updates as you shape the campaign. Load the demo preset for an ADMC-ready example.</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-slate-500">Readiness</p>
                                    <p className={`text-lg font-semibold ${goldHeading}`}>{readinessScore}%</p>
                                </div>
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                                <div className="h-full bg-purple-600 transition-all duration-500" style={{ width: `${readinessScore}%` }} />
                            </div>
                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                <div className="flex items-start justify-between gap-2 rounded-md bg-slate-950/40 border border-slate-800 p-2">
                                    <span className="text-slate-400">Campaign Tone</span>
                                    <span className="text-slate-200 text-right">{campaignTone}</span>
                                </div>
                                <div className="flex items-start justify-between gap-2 rounded-md bg-slate-950/40 border border-slate-800 p-2">
                                    <span className="text-slate-400">Primary Hook</span>
                                    <span className="text-slate-200 text-right">{targetHook}</span>
                                </div>
                                <div className="flex items-start justify-between gap-2 rounded-md bg-slate-950/40 border border-slate-800 p-2">
                                    <span className="text-slate-400">Buyer Type</span>
                                    <span className="text-slate-200 text-right">{liveAudiencesLabel}</span>
                                </div>
                                <div className="flex items-start justify-between gap-2 rounded-md bg-slate-950/40 border border-slate-800 p-2">
                                    <span className="text-slate-400">Best Use Case</span>
                                    <span className="text-slate-200 text-right">{primaryAngle}</span>
                                </div>
                                <div className="flex items-start justify-between gap-2 rounded-md bg-slate-950/40 border border-slate-800 p-2 sm:col-span-2">
                                    <span className="text-slate-400">Estimated Conversion Strength</span>
                                    <span className="text-slate-200 text-right">{conversionStrength}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-950/30">
                                <button type="button" onClick={() => toggleInputSection('Show Basics')} className="w-full flex items-center justify-between px-4 py-3 text-left bg-slate-900/50 hover:bg-slate-900/70 transition-colors">
                                    <div className="flex items-center gap-2">
                                        <MegaphoneIcon className="w-4 h-4 text-purple-300" />
                                        <span className={`font-semibold ${goldHeadingSmall}`}>Show Basics</span>
                                    </div>
                                    <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${inputSectionsOpen['Show Basics'] ? 'rotate-180' : ''}`} />
                                </button>
                                {inputSectionsOpen['Show Basics'] && (
                                    <div className="p-4 space-y-4 border-t border-slate-800">
                                        <div>
                                            <label htmlFor="show-title" className={`block text-sm font-medium mb-1 ${goldHeadingSmall}`}>Show Title*</label>
                                            <p className="text-xs text-slate-500 mb-2">The headline name of your performance.</p>
                                            <input id="show-title" type="text" value={showTitle} onChange={(e) => setShowTitle(e.target.value)} placeholder="e.g., Echoes of the Enchanted" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" />
                                            {showTitleTouched && showTitle.trim() === '' && (
                                                <p className="text-xs text-slate-400 mt-2">Show title helps the AI brand your campaign.</p>
                                            )}
                                            {showTitleSuggestionsVisible && (
                                                <div className="mt-3">
                                                    <p className="text-xs text-slate-500 mb-2">Suggested show titles:</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {SHOW_TITLE_SUGGESTIONS.map(s => (
                                                            <button key={s} type="button" onClick={() => { setShowTitle(s); setShowTitleTouched(true); }} className="px-2.5 py-1 rounded-full text-xs bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors">
                                                                {s}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-950/30">
                                <button type="button" onClick={() => toggleInputSection('Audience & Booking Market')} className="w-full flex items-center justify-between px-4 py-3 text-left bg-slate-900/50 hover:bg-slate-900/70 transition-colors">
                                    <div className="flex items-center gap-2">
                                        <UsersIcon className="w-4 h-4 text-purple-300" />
                                        <span className={`font-semibold ${goldHeadingSmall}`}>Audience &amp; Booking Market</span>
                                    </div>
                                    <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${inputSectionsOpen['Audience & Booking Market'] ? 'rotate-180' : ''}`} />
                                </button>
                                {inputSectionsOpen['Audience & Booking Market'] && (
                                    <div className="p-4 space-y-4 border-t border-slate-800">
                                        <div>
                                            <label className={`block text-sm font-medium mb-2 flex items-center gap-2 ${goldHeadingSmall}`}>
                                                <UsersIcon className="w-5 h-5 text-slate-400" />
                                                Target Audience*
                                            </label>
                                            <p className="text-xs text-slate-500 mb-2">Choose who this campaign is for.</p>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                {AUDIENCE_CATEGORIES.map(cat => (
                                                    <button key={cat} type="button" onClick={() => handleAudienceToggle(cat)} className={`py-2 px-3 rounded-md transition-colors text-sm font-semibold ${ selectedAudiences.includes(cat) ? 'bg-purple-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300' }`}>
                                                        {cat}
                                                    </button>
                                                ))}
                                            </div>
                                            <input type="text" value={customAudience} onChange={e => setCustomAudience(e.target.value)} placeholder="Other buyer type or venue (please specify)…" className="w-full mt-2 px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white text-sm" />
                                            {audienceTouched && selectedAudiences.length === 0 && customAudience.trim() === '' && (
                                                <p className="text-xs text-slate-400 mt-2">Pick at least one audience so the AI can tailor tone + channels.</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-950/30">
                                <button type="button" onClick={() => toggleInputSection('Brand / Performance Style')} className="w-full flex items-center justify-between px-4 py-3 text-left bg-slate-900/50 hover:bg-slate-900/70 transition-colors">
                                    <div className="flex items-center gap-2">
                                        <StageCurtainsIcon className="w-4 h-4 text-purple-300" />
                                        <span className={`font-semibold ${goldHeadingSmall}`}>Brand / Performance Style</span>
                                    </div>
                                    <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${inputSectionsOpen['Brand / Performance Style'] ? 'rotate-180' : ''}`} />
                                </button>
                                {inputSectionsOpen['Brand / Performance Style'] && (
                                    <div className="p-4 space-y-4 border-t border-slate-800">
                                        <div>
                                            <label className={`block text-sm font-medium mb-2 flex items-center gap-2 ${goldHeadingSmall}`}>
                                                <StageCurtainsIcon className="w-5 h-5 text-slate-400" />
                                                Performance Style
                                            </label>
                                            <p className="text-xs text-slate-500 mb-2">Select tone + persona branding.</p>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                {STYLE_CHOICES.map(style => (
                                                    <button key={style} type="button" onClick={() => handleStyleToggle(style)} className={`py-2 px-3 rounded-md transition-colors text-sm font-semibold ${ selectedStyles.includes(style) ? 'bg-purple-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300' }`}>
                                                        {style}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-950/30">
                                <button type="button" onClick={() => toggleInputSection('Campaign Strategy')} className="w-full flex items-center justify-between px-4 py-3 text-left bg-slate-900/50 hover:bg-slate-900/70 transition-colors">
                                    <div className="flex items-center gap-2">
                                        <TagIcon className="w-4 h-4 text-purple-300" />
                                        <span className={`font-semibold ${goldHeadingSmall}`}>Campaign Strategy</span>
                                    </div>
                                    <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${inputSectionsOpen['Campaign Strategy'] ? 'rotate-180' : ''}`} />
                                </button>
                                {inputSectionsOpen['Campaign Strategy'] && (
                                    <div className="p-4 space-y-4 border-t border-slate-800">
                                        <div>
                                            <label htmlFor="campaign-style" className={`block text-sm font-medium mb-1 ${goldHeadingSmall}`}>Campaign Style</label>
                                            <p className="text-xs text-slate-500 mb-2">Pick a template to shape tone, channels, and structure.</p>
                                            <select id="campaign-style" value={campaignStyle} onChange={(e) => setCampaignStyle(e.target.value as any)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white text-sm">
                                                <option value="">Select a campaign style…</option>
                                                {CAMPAIGN_STYLES.map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                                            <div className="flex items-center gap-2 mb-2">
                                                <TimerIcon className="w-4 h-4 text-slate-400" />
                                                <p className={`text-sm font-semibold ${goldHeadingSmall}`}>Strategy Snapshot</p>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                                <div className="rounded-md bg-slate-900/40 border border-slate-800 p-2">
                                                    <span className="text-slate-400 block">Campaign Tone</span>
                                                    <span className="text-slate-200">{campaignTone}</span>
                                                </div>
                                                <div className="rounded-md bg-slate-900/40 border border-slate-800 p-2">
                                                    <span className="text-slate-400 block">Best Use Case</span>
                                                    <span className="text-slate-200">{primaryAngle}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-950/30">
                                <button type="button" onClick={() => toggleInputSection('Keywords / Themes')} className="w-full flex items-center justify-between px-4 py-3 text-left bg-slate-900/50 hover:bg-slate-900/70 transition-colors">
                                    <div className="flex items-center gap-2">
                                        <CopyIcon className="w-4 h-4 text-purple-300" />
                                        <span className={`font-semibold ${goldHeadingSmall}`}>Keywords / Themes</span>
                                    </div>
                                    <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${inputSectionsOpen['Keywords / Themes'] ? 'rotate-180' : ''}`} />
                                </button>
                                {inputSectionsOpen['Keywords / Themes'] && (
                                    <div className="p-4 space-y-4 border-t border-slate-800">
                                        <div>
                                            <label htmlFor="key-themes" className={`block text-sm font-medium mb-1 ${goldHeadingSmall}`}>Key Effects or Themes (Optional)</label>
                                            <textarea id="key-themes" rows={3} value={keyThemes} onChange={(e) => setKeyThemes(e.target.value)} placeholder="e.g., Classic sleight of hand, modern mind reading, story of a magical artifact" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" />
                                            {themeSuggestionsVisible && (
                                                <div className="mt-3">
                                                    <p className="text-xs text-slate-500 mb-2">Suggested themes:</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {THEME_SUGGESTIONS.map(s => (
                                                            <button key={s} type="button" onClick={() => {
                                                                setKeyThemes(prev => {
                                                                    const p = prev.trim();
                                                                    if (!p) return s;
                                                                    if (p.toLowerCase().includes(s.toLowerCase())) return prev;
                                                                    return `${p}${p.endsWith('.') ? '' : '.'} ${s}`;
                                                                });
                                                            }} className="px-2.5 py-1 rounded-full text-xs bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors">
                                                                {s}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <button onClick={handleGenerate} disabled={isLoading} className="w-full py-3 mt-2 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
                            <WandIcon className="w-5 h-5" />
                            <span>{generateButtonLabel}</span>
                        </button>
                        {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
                    </div>
                </div>

            {/* Result Display Area */}
            <div className="flex flex-col bg-slate-900/50 rounded-lg border border-slate-800 min-h-[300px]">
                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <LoadingIndicator stepText={LOADING_STEPS[loadingStepIndex]} />
                    </div>
                ) : result ? (
                     <div className={`relative group flex-1 flex flex-col ${showSparkle ? "ring-1 ring-amber-400/30 shadow-[0_0_18px_rgba(245,208,110,0.12)]" : ""}`}>
                    {showSparkle && (
                        <div className="pointer-events-none absolute top-3 right-3 z-40">
                            <div className="relative">
                                <span className="absolute inline-flex h-6 w-6 rounded-full bg-amber-400/30 animate-ping" />
                                <span className="relative inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-950/60 border border-amber-400/40 text-amber-200 text-sm">✨</span>
                            </div>
                        </div>
                    )}

                        <div className="p-4 overflow-y-auto space-y-4 pb-32">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
									<p className={`text-sm font-semibold ${goldHeadingSmall}`}>Advisor Notes</p>
                                    <ul className="mt-2 space-y-1 text-sm text-slate-300">
                                        {advisorNotes.map((n, idx) => (
                                            <li key={idx}>• {n}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
									<p className={`text-sm font-semibold ${goldHeadingSmall}`}>Conversion Outlook</p>
                                    <div className="mt-2 grid grid-cols-1 gap-1 text-sm">
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="text-slate-400">Predicted Response Rate</span>
                                            <span className="text-slate-200">{conversionPredictor.range}</span>
                                        </div>
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="text-slate-400">Best Channel</span>
                                            <span className="text-slate-200 text-right">{conversionPredictor.bestChannel}</span>
                                        </div>
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="text-slate-400">Best Hook</span>
                                            <span className="text-slate-200 text-right">{conversionPredictor.bestHook}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
									<p className={`text-sm font-semibold ${goldHeadingSmall}`}>Competitive Position</p>
                                    <p className="mt-2 text-sm text-slate-300">Compared to similar performers:</p>
                                    <ul className="mt-2 space-y-1 text-sm text-slate-300">
                                        <li>• You rank strongest in <span className="text-slate-100 font-semibold">{competitivePositioning.strongest}</span></li>
                                        <li>• You rank weakest in <span className="text-slate-100 font-semibold">{competitivePositioning.weakest}</span></li>
                                    </ul>
                                    <p className="mt-3 text-xs text-slate-400">Tip: strengthen “{competitivePositioning.weakest}” by adding proof (logos, testimonials, awards, or a short credibility line).</p>
                                </div>

                                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
									<p className={`text-sm font-semibold ${goldHeadingSmall}`}>Persona Variations</p>
                                    <p className="mt-2 text-xs text-slate-400">Generate tailored variations for different buyers. Switch personas to view versions.</p>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {PERSONA_VERSIONS.map(p => (
                                            <button
                                                key={p.key}
                                                type="button"
                                                onClick={() => {
                                                    setPersonaView(p.key);
                                                    if (p.key !== 'Base' && !personaResults[p.key]) {
                                                        // Generate on first click for non-base personas
                                                        handleGeneratePersona(p.key);
                                                    }
                                                }}
                                                disabled={isGeneratingPersona && personaView === p.key}
                                                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                                                    personaView === p.key
                                                        ? 'bg-purple-600 border-purple-500 text-white'
                                                        : 'bg-slate-900/30 border-slate-700 text-slate-200 hover:bg-slate-800'
                                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>

                                    {personaView !== 'Base' && !personaResults[personaView] && (
                                        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-300">
                                            <span>Generating “{personaView}” version…</span>
                                            <span className="text-slate-400">{isGeneratingPersona ? 'Working…' : ''}</span>
                                        </div>
                                    )}

                                    {personaView !== 'Base' && personaResults[personaView] && (
                                        <p className="mt-3 text-xs text-slate-400">Viewing: <span className="text-slate-200 font-semibold">{personaView}</span></p>
                                    )}
                                </div>

                                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
									<p className={`text-sm font-semibold ${goldHeadingSmall}`}>ROI Projection</p>
                                    <p className="mt-2 text-sm text-slate-300">Estimated bookings from campaign:</p>
                                    <p className="mt-2 text-xl font-bold text-slate-100">{roiProjection}</p>
                                    <p className="mt-2 text-xs text-slate-400">Heuristic estimate based on campaign completeness + channel fit. Improve readiness to push the range upward.</p>
                                </div>
                            </div>

                            <div className="h-px my-4 bg-gradient-to-r from-transparent via-slate-400/20 to-transparent opacity-60" />
                            <div className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
                                <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-4 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <h3 className={`text-lg font-semibold ${goldHeading}`}>Generated Campaign Workspace</h3>
                                        <p className="text-sm text-slate-400 mt-1">Structured campaign assets rendered as expandable cards for easier review and reuse.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" onClick={expandAllResultCards} className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-colors">
                                            <ViewGridIcon className="w-4 h-4" />
                                            <span>Expand Results</span>
                                        </button>
                                        <button type="button" onClick={compactAllResultCards} className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-colors">
                                            <ViewListIcon className="w-4 h-4" />
                                            <span>Compact Results</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="p-4 space-y-3">
                                    {([
                                        {
                                            key: 'Campaign Overview' as const,
                                            content: (
                                                <div className="space-y-3 text-sm text-slate-200">
                                                    <div>
                                                        <p className="text-xs uppercase tracking-wide text-slate-500">Campaign Name</p>
                                                        <p className="mt-1 text-base font-semibold text-slate-100">{activeResult?.campaignName || showTitle || 'Marketing Campaign'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs uppercase tracking-wide text-slate-500">Campaign Summary</p>
                                                        <p className="mt-1 whitespace-pre-wrap">{activeResult?.campaignSummary || 'No summary generated yet.'}</p>
                                                    </div>
                                                </div>
                                            ),
                                        },
                                        {
                                            key: 'Audience & Offer' as const,
                                            content: (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-200">
                                                    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
                                                        <p className="text-xs uppercase tracking-wide text-slate-500">Target Audience</p>
                                                        <p className="mt-1">{activeResult?.targetAudience || liveAudiencesLabel}</p>
                                                    </div>
                                                    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
                                                        <p className="text-xs uppercase tracking-wide text-slate-500">Primary Hook</p>
                                                        <p className="mt-1">{activeResult?.primaryHook || targetHook}</p>
                                                    </div>
                                                </div>
                                            ),
                                        },
                                        {
                                            key: 'Headlines / Taglines' as const,
                                            content: activeResult?.taglines?.length ? (
                                                <ul className="space-y-2 text-sm text-slate-200">
                                                    {activeResult.taglines.map((item, index) => (
                                                        <li key={`${item}-${index}`} className="rounded-md border border-slate-800 bg-slate-900/40 p-3">• {item}</li>
                                                    ))}
                                                </ul>
                                            ) : <p className="text-sm text-slate-400">No taglines generated.</p>,
                                        },
                                        {
                                            key: 'Press Release' as const,
                                            content: <p className="whitespace-pre-wrap text-sm text-slate-200">{activeResult?.pressRelease || 'No press release generated.'}</p>,
                                        },
                                        {
                                            key: 'Social Posts' as const,
                                            content: activeResult?.socialPosts?.length ? (
                                                <div className="space-y-2 text-sm text-slate-200">
                                                    {activeResult.socialPosts.map((item, index) => (
                                                        <div key={`${item}-${index}`} className="rounded-md border border-slate-800 bg-slate-900/40 p-3">{item}</div>
                                                    ))}
                                                </div>
                                            ) : <p className="text-sm text-slate-400">No social posts generated.</p>,
                                        },
                                        {
                                            key: 'Email Campaign' as const,
                                            content: activeResult?.emailCampaign?.length ? (
                                                <div className="space-y-2 text-sm text-slate-200">
                                                    {activeResult.emailCampaign.map((item, index) => (
                                                        <div key={`${item}-${index}`} className="rounded-md border border-slate-800 bg-slate-900/40 p-3">{item}</div>
                                                    ))}
                                                </div>
                                            ) : <p className="text-sm text-slate-400">No email campaign ideas generated.</p>,
                                        },
                                        {
                                            key: 'Poster / Flyer Copy' as const,
                                            content: <p className="whitespace-pre-wrap text-sm text-slate-200">{activeResult?.posterCopy || 'No poster copy generated.'}</p>,
                                        },
                                        {
                                            key: 'Booking Pitch' as const,
                                            content: <p className="whitespace-pre-wrap text-sm text-slate-200">{activeResult?.bookingPitch || 'No booking pitch generated.'}</p>,
                                        },
                                        {
                                            key: 'CTA Strategy' as const,
                                            content: <p className="whitespace-pre-wrap text-sm text-slate-200">{activeResult?.ctaStrategy || 'No CTA strategy generated.'}</p>,
                                        },
                                        {
                                            key: 'Rollout Plan' as const,
                                            content: activeResult?.rolloutPlan?.length ? (
                                                <ol className="space-y-2 text-sm text-slate-200 list-decimal list-inside">
                                                    {activeResult.rolloutPlan.map((item, index) => (
                                                        <li key={`${item}-${index}`} className="rounded-md border border-slate-800 bg-slate-900/40 p-3">{item}</li>
                                                    ))}
                                                </ol>
                                            ) : <p className="text-sm text-slate-400">No rollout plan generated.</p>,
                                        },
                                        {
                                            key: 'Notes' as const,
                                            content: activeResult?.notes?.length ? (
                                                <ul className="space-y-2 text-sm text-slate-200">
                                                    {activeResult.notes.map((item, index) => (
                                                        <li key={`${item}-${index}`} className="rounded-md border border-slate-800 bg-slate-900/40 p-3">• {item}</li>
                                                    ))}
                                                </ul>
                                            ) : <p className="text-sm text-slate-400">No notes generated.</p>,
                                        },
                                    ] as const).map(section => (
                                        <div key={section.key} className={`rounded-lg border transition-colors ${resultCardsOpen[section.key] ? 'border-purple-500/40 bg-purple-500/5' : 'border-slate-800 bg-slate-950/30'}`}>
                                            <button type="button" onClick={() => toggleResultCard(section.key)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-900/40 transition-colors">
                                                <span className={`font-semibold ${goldHeadingSmall}`}>{section.key}</span>
                                                <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${resultCardsOpen[section.key] ? 'rotate-180' : ''}`} />
                                            </button>
                                            {resultCardsOpen[section.key] && (
                                                <div className="border-t border-slate-800 p-4">{section.content}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="sticky bottom-0 z-30 p-2.5 bg-slate-950/90 backdrop-blur-md flex flex-col gap-2 border-t border-slate-800 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
                            {actionNotice && (
                                <div className="w-full sm:max-w-md text-xs text-slate-200 bg-slate-900/40 border border-slate-800 rounded-md px-3 py-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="pr-2">{actionNotice.message}</div>
                                        {actionNotice.actionLabel && actionNotice.action && (
                                            <button
                                                type="button"
                                                className="shrink-0 px-2 py-1 rounded-md bg-purple-600/30 hover:bg-purple-600/40 border border-purple-500/40 text-purple-100"
                                                onClick={actionNotice.action}
                                            >
                                                {actionNotice.actionLabel}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-slate-400 mr-1">Workflow Actions:</span>
                                <button
                                    type="button"
                                    onClick={handleSendToShowPlanner}
                                    disabled={!activeResult || isSendingToPlanner}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <CalendarIcon className="w-4 h-4" />
                                    <span>{isSendingToPlanner ? 'Sending…' : 'Show Planner'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSendToDirectorMode}
                                    disabled={!activeResult || isSendingToDirector}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <WandIcon className="w-4 h-4" />
                                    <span>{isSendingToDirector ? 'Sending…' : 'Director Mode'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSendToCRMNotes}
                                    disabled={!activeResult || isSendingToCRM}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <UsersIcon className="w-4 h-4" />
                                    <span>{isSendingToCRM ? 'Sending…' : 'CRM Notes'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCreateClientProposal}
                                    disabled={!activeResult}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <FileTextIcon className="w-4 h-4" />
                                    <span>Client Proposal</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCreateBookingPitch}
                                    disabled={!activeResult}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <MailIcon className="w-4 h-4" />
                                    <span>Booking Pitch</span>
                                </button>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={handleGenerateAlternateCampaign}
                                disabled={!activeResult || isGeneratingAlternate}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-600/20 hover:bg-purple-600/30 rounded-md border border-purple-500/40 text-purple-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <CustomizeIcon className="w-4 h-4" />
                                <span>{isGeneratingAlternate ? 'Generating…' : 'Alternate Campaign'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleCopyCampaign}
                                disabled={!activeResultText}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <CopyIcon className="w-4 h-4" />
                                <span>{copyStatus === 'copied' ? 'Copied!' : 'Copy Campaign'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleQuickExportIdea('Social Scheduler')}
                                disabled={!activeResult}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <SendIcon className="w-4 h-4" />
                                <span>Export Pack</span>
                            </button>
                            <CohesionActions
                                content={activeResultText || ''}
                                defaultTitle={`Marketing Campaign — ${showTitle || 'Untitled'}`}
                                defaultTags={["marketing", "campaign"]}
                                compact
                            />
                            <ShareButton
                                title={`Marketing Campaign for: ${showTitle}`}
                                text={activeResultText || ''}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
                            >
                                <ShareIcon className="w-4 h-4" />
                                <span>Share</span>
                            </ShareButton>
                             <button
                                onClick={handleSave}
                                disabled={saveStatus === 'saved'}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 disabled:cursor-default transition-colors"
                            >
                                {saveStatus === 'saved' ? (
                                    <>
                                        <CheckIcon className="w-4 h-4 text-green-400" />
                                        <span>Saved!</span>
                                    </>
                                ) : (
                                    <>
                                        <SaveIcon className="w-4 h-4" />
                                        <span>Save to Idea Vault</span>
                                    </>
                                )}
                            </button>

                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setBlueprintMenuOpen(v => !v)}
                                    disabled={isSavingBlueprint}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <BlueprintIcon className="w-4 h-4" />
                                    <span>Blueprint</span>
                                    <ChevronDownIcon className="w-4 h-4 opacity-80" />
                                </button>

                                {blueprintMenuOpen && (
                                    <div className="absolute right-0 bottom-full mb-2 w-56 rounded-lg border border-slate-800 bg-slate-950 shadow-lg overflow-hidden z-40">
                                        <button type="button" onClick={() => handleBlueprintSave('Save as Template')} className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-900">Save as Template</button>
                                        <button type="button" onClick={() => handleBlueprintSave('Save to Campaign Library')} className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-900">Save to Campaign Library</button>
                                        <button type="button" onClick={() => handleBlueprintSave('Reuse Later')} className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-900">Reuse Later</button>
                                        <button type="button" onClick={() => handleBlueprintSave('Duplicate Campaign')} className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-900">Duplicate Campaign</button>
                                    </div>
                                )}
                            </div>
                            </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-center text-slate-500 p-6">
                        <div className="max-w-md">
                            <MegaphoneIcon className="w-20 h-20 mx-auto mb-4" />
                            <h3 className={`font-semibold text-lg ${goldHeading}`}>Marketing Intelligence Ready</h3>
                            <p className="text-slate-400 text-sm mt-2">Fill in your show details and generate a complete campaign package including:</p>
                            <ul className="text-slate-400 text-sm mt-4 space-y-1">
                                <li>• Press Release</li>
                                <li>• Social Posts</li>
                                <li>• Email Campaign</li>
                                <li>• Taglines</li>
                                <li>• Poster Copy</li>
                                <li>• Booking Pitch</li>
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        </div>
        </main>
    );
};

export default MarketingCampaign;
