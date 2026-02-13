
import React, { useEffect, useMemo, useState } from 'react';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { createClientProposal } from '../services/proposalsService';
import { createBookingPitch } from '../services/pitchesService';
import { createShow, addTasksToShow } from '../services/showsService';
import { MARKETING_ASSISTANT_SYSTEM_INSTRUCTION } from '../constants';
import { MegaphoneIcon, WandIcon, SaveIcon, CheckIcon, ShareIcon, UsersIcon, StageCurtainsIcon, CalendarIcon, FileTextIcon, MailIcon, BlueprintIcon, ChevronDownIcon, SendIcon } from './icons';
import ShareButton from './ShareButton';
import type { User } from '../types';

interface MarketingCampaignProps {
    user: User;
    onIdeaSaved: () => void;
    onNavigateToShowPlanner?: (showId: string) => void;
    onNavigate?: (view: 'client-proposals' | 'booking-pitches', id: string) => void;
}

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
    { key: 'Corporate buyers', label: 'Corporate buyers' },
    { key: 'Parents', label: 'Parents' },
    { key: 'Event planners', label: 'Event planners' },
    { key: 'Festival coordinators', label: 'Festival coordinators' },
] as const;

const LOADING_STEPS = [
    'Analyzing performance profile…',
    'Building marketing voice…',
    'Drafting campaign assets…',
];


const MarketingCampaign: React.FC<MarketingCampaignProps> = ({ user, onIdeaSaved, onNavigateToShowPlanner, onNavigate }) => {
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
    const [result, setResult] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

    type ActionNotice = { message: string; actionLabel?: string; action?: () => void };
    const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
    const [isSendingToPlanner, setIsSendingToPlanner] = useState(false);
    const [isSavingBlueprint, setIsSavingBlueprint] = useState(false);
    const [blueprintMenuOpen, setBlueprintMenuOpen] = useState(false);
    const [personaView, setPersonaView] = useState<(typeof PERSONA_VERSIONS)[number]['key']>('Base');
    const [personaResults, setPersonaResults] = useState<Record<string, string>>({});
    const [isGeneratingPersona, setIsGeneratingPersona] = useState(false);


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


const generateButtonLabel = useMemo(() => {
        if (isLoading) return 'Generating Campaign…';
        if (error) return 'Try Again';
        if (result) return 'Regenerate Campaign';
        if (isFormValid) return 'Ready to Generate ✓';
        return 'Generate Campaign';
    }, [error, isFormValid, isLoading, result]);

    const handleGenerate = async () => {
        setShowTitleTouched(true);
        setAudienceTouched(true);

        const missingTitle = showTitle.trim() === '';
        const missingAudience = selectedAudiences.length === 0 && customAudience.trim() === '';

        if (missingTitle || missingAudience) {
            // Keep this subtle: inline helper text for show title, light global error for audience.
            setError(missingAudience && !missingTitle ? 'Target audience helps the AI tailor your messaging.' : null);
            return;
        }
        
        setIsLoading(true);
        setError(null);
        setResult(null);
        setPersonaResults({});
        setPersonaView('Base');
        setSaveStatus('idle');

        const allAudiences = [...selectedAudiences];
        if (customAudience.trim()) {
            allAudiences.push(customAudience.trim());
        }

        const prompt = `
            Generate a marketing campaign toolkit for the following magic show:
            - **Show Title:** ${showTitle}
            - **Target Audience:** ${allAudiences.join(', ')}
            - **Performance Style/Persona:** ${selectedStyles.join(', ') || 'Not specified'}
            - **Campaign Style Template:** ${campaignStyle || 'Not specified'}
            - **Key Effects or Themes:** ${keyThemes || 'Not specified'}
        `;
        
        try {
          // FIX: Pass the user object to generateResponse as the 3rd argument.
          const response = await generateResponse(prompt, MARKETING_ASSISTANT_SYSTEM_INSTRUCTION, user);
          setResult(response);
        } catch (err) {
          setError(err instanceof Error ? err.message : "An unknown error occurred.");
        } finally {
          setIsLoading(false);
        }
    };
  
    
    
    const localPersonaTransform = (base: string, personaKey: (typeof PERSONA_VERSIONS)[number]['key']) => {
        // Lightweight, deterministic “delta edits” (no extra AI calls).
        // Goal: keep the structure identical, but tweak tone/benefits/hooks for the selected persona.

        const profiles: Record<string, { tone: string; angle: string; hook: string; addOns: string[]; taglineSeeds: string[]; }> = {
            'Corporate Buyers': {
                tone: 'premium, confident, business-forward',
                angle: 'employee engagement + client wow-factor',
                hook: 'a polished, interactive experience that feels “high value” and easy to book',
                addOns: [
                    'Emphasize reliability, professionalism, and clear run-of-show.',
                    'Mention options for branded moments, awards, or client appreciation.',
                    'Highlight minimal setup, flexible time blocks, and “works in any room”.',
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
                    'Stress “family-friendly”, age-appropriate humor, and positive participation.',
                    'Mention birthday parties, school events, and family gatherings.',
                    'Highlight clear boundaries: no scary moments, no embarrassing volunteers.',
                ],
                taglineSeeds: [
                    'Big laughs. Bigger wonder.',
                    'Family-friendly magic they’ll remember.',
                    'Where kids sparkle and parents relax.',
                ],
            },
            'Event Planners': {
                tone: 'practical, organized, planner-friendly',
                angle: 'stress-free booking + smooth logistics',
                hook: 'a plug-and-play entertainment solution with clear requirements and fast comms',
                addOns: [
                    'Call out fast setup, simple tech needs, and flexible staging.',
                    'Emphasize communication, professionalism, and timeline coordination.',
                    'Include a short “what we need” bullet: space, sound, and timing.',
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
                    'Mention walkaround/roving options and “instant attention” openers.',
                    'Emphasize outdoor/variable conditions readiness (within reason).',
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

        // Helper: insert persona notes near the top without breaking the user-facing sections.
        const header = `### Persona Focus — ${personaKey}
` +
            `**Tone:** ${profile.tone}
` +
            `**Primary Angle:** ${profile.angle}
` +
            `**Target Hook:** ${profile.hook}
` +
            (profile.addOns.length ? `**Emphasis:**
- ${profile.addOns.join('\n- ')}
` : '') +
            `
---

`;

        let out = base;

        // Light replacements to nudge language.
        const replacements: Array<[RegExp, string]> = [
            [/booking/gi, 'booking'],
            [/venue/gi, 'venue'],
        ];

        // Persona-specific replacements
        if (personaKey === 'Corporate Buyers') {
            replacements.push([/(birthday|kids?|children)/gi, 'guests']);
            replacements.push([/(family[- ]friendly)/gi, 'premium']);
        } else if (personaKey === 'Parents') {
            replacements.push([/(corporate|executive|client)/gi, 'family']);
            replacements.push([/(ROI|brand)/gi, 'memories']);
        } else if (personaKey === 'Event Planners') {
            replacements.push([/(amazing|incredible)/gi, 'reliable']);
            replacements.push([/(viral)/gi, 'high-response']);
        } else if (personaKey === 'Festival Coordinators') {
            replacements.push([/(elegant)/gi, 'high-energy']);
            replacements.push([/(intimate)/gi, 'crowd-ready']);
        }

        for (const [rx, rep] of replacements) {
            out = out.replace(rx, rep);
        }

        // Add persona-tailored taglines (append near Taglines section if present).
        if (profile.taglineSeeds.length) {
            const taglineBlock = `\n\n**Persona Taglines (${personaKey})**\n- ${profile.taglineSeeds.join('\n- ')}\n`;
            if (/\bTaglines\b/i.test(out)) {
                out = out.replace(/(\bTaglines\b[\s\S]*?)(\n\n|$)/i, (match) => match + taglineBlock + '\n');
            } else {
                out += taglineBlock;
            }
        }

        // Add a small “Planner Notes” block for Event Planners if not already present.
        if (personaKey === 'Event Planners' && !/Planner Notes/i.test(out)) {
            out += `\n\n**Planner Notes**\n- Typical setup: 5–10 minutes\n- Audio: can plug into house sound or provide compact speaker\n- Space: works on a small stage or floor area\n- Timing: flexible sets (10 / 20 / 30 / 45 minutes)\n`;
        }

        // Add a small “Corporate Proof” nudge.
        if (personaKey === 'Corporate Buyers' && !/credibility|testimonials|past clients/i.test(out)) {
            out += `\n\n**Credibility Proof (Add if available)**\n- Mention 1–2 recognizable past clients, testimonials, or event types (e.g., conferences, awards dinners).\n`;
        }

        // Prepend header (keeps original sections intact below).
        return header + out;
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

        const body = result ? result : '(No generated output yet.)';

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
                { title: 'Marketing: Press Release', notes: result, priority: 'Medium', status: 'To-Do' },
                { title: 'Marketing: Social Posts', notes: result, priority: 'Medium', status: 'To-Do' },
                { title: 'Marketing: Email Campaign', notes: result, priority: 'Medium', status: 'To-Do' },
                { title: 'Marketing: Poster / Flyer Copy', notes: result, priority: 'Medium', status: 'To-Do' },
                { title: 'Marketing: Booking Pitch', notes: result, priority: 'High', status: 'To-Do' },
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
        setActionNotice({ message: `${label} saved to Saved Ideas.` });
        window.setTimeout(() => setActionNotice(null), 2200);
    };


const handleCreateClientProposal = async () => {
    if (!activeResult) return;
    setIsSendingToPlanner(false);
    setActionNotice(null);
    try {
        const title = `${showTitle || 'Marketing Campaign'} — Client Proposal`;
        const { proposal, savedToIdeasFallback } = await createClientProposal({
            title,
            content: activeResult,
            source: {
                showTitle,
                targetAudience: targetAudience === 'Other' ? otherAudience : targetAudience,
                performanceStyle,
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
            content: activeResult,
            source: {
                showTitle,
                targetAudience: targetAudience === 'Other' ? otherAudience : targetAudience,
                performanceStyle,
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
        <main className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            {/* Control Panel */}
            <div className="flex flex-col">
                <h2 className="text-xl font-bold text-slate-300 mb-2">Marketing Campaign Generator</h2>
                <p className="text-slate-400 mb-4">Fill in your show details to generate a complete promotional toolkit, including press releases, social media posts, and more.</p>
                
                <div className="space-y-6">
                    <div>
                        <label htmlFor="show-title" className="block text-sm font-medium text-slate-300 mb-1">Show Title*</label>
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
                <button
                    key={s}
                    type="button"
                    onClick={() => { setShowTitle(s); setShowTitleTouched(true); }}
                    className="px-2.5 py-1 rounded-full text-xs bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors"
                >
                    {s}
                </button>
            ))}
        </div>
    </div>
)}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                            <UsersIcon className="w-5 h-5 text-slate-400" />
                            Target Audience*
                        </label>
                        <p className="text-xs text-slate-500 mb-2">Choose who this campaign is for.</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {AUDIENCE_CATEGORIES.map(cat => (
                                <button key={cat} onClick={() => handleAudienceToggle(cat)} className={`py-2 px-3 rounded-md transition-colors text-sm font-semibold ${ selectedAudiences.includes(cat) ? 'bg-purple-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300' }`}>
                                    {cat}
                                </button>
                            ))}
                        </div>
                        <input type="text" value={customAudience} onChange={e => setCustomAudience(e.target.value)} placeholder="Other (please specify)..." className="w-full mt-2 px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white text-sm" />
                        {audienceTouched && selectedAudiences.length === 0 && customAudience.trim() === '' && (
                            <p className="text-xs text-slate-400 mt-2">Pick at least one audience so the AI can tailor tone + channels.</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                            <StageCurtainsIcon className="w-5 h-5 text-slate-400" />
                            Performance Style
                        </label>
                        <p className="text-xs text-slate-500 mb-2">Select tone + persona branding.</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {STYLE_CHOICES.map(style => (
                                 <button key={style} onClick={() => handleStyleToggle(style)} className={`py-2 px-3 rounded-md transition-colors text-sm font-semibold ${ selectedStyles.includes(style) ? 'bg-purple-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300' }`}>
                                    {style}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        
<div>
    <label htmlFor="campaign-style" className="block text-sm font-medium text-slate-300 mb-1">Campaign Style</label>
    <p className="text-xs text-slate-500 mb-2">Pick a template to shape tone, channels, and structure.</p>
    <select
        id="campaign-style"
        value={campaignStyle}
        onChange={(e) => setCampaignStyle(e.target.value as any)}
        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white text-sm"
    >
        <option value="">Select a campaign style…</option>
        {CAMPAIGN_STYLES.map(s => (
            <option key={s} value={s}>{s}</option>
        ))}
    </select>
</div>

<div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 space-y-3">
    <div className="flex items-center justify-between gap-3">
        <div>
            <p className="text-sm font-semibold text-slate-200">Campaign Strategy Preview</p>
            <p className="text-xs text-slate-500 mt-0.5">Updates live as you select options.</p>
        </div>

        <div className="text-right">
            <p className="text-xs text-slate-500">Campaign Readiness</p>
            <p className="text-sm font-semibold text-slate-200">{readinessScore}%</p>
        </div>
    </div>

    <div className="h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
        <div
            className="h-full bg-purple-600 transition-all duration-500"
            style={{ width: `${readinessScore}%` }}
        />
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <div className="flex items-start justify-between gap-2 rounded-md bg-slate-900/40 border border-slate-800 p-2">
            <span className="text-slate-400">Campaign Tone</span>
            <span className="text-slate-200 text-right">{campaignTone}</span>
        </div>
        <div className="flex items-start justify-between gap-2 rounded-md bg-slate-900/40 border border-slate-800 p-2">
            <span className="text-slate-400">Primary Angle</span>
            <span className="text-slate-200 text-right">{primaryAngle}</span>
        </div>
        <div className="flex items-start justify-between gap-2 rounded-md bg-slate-900/40 border border-slate-800 p-2">
            <span className="text-slate-400">Target Hook</span>
            <span className="text-slate-200 text-right">{targetHook}</span>
        </div>
        <div className="flex items-start justify-between gap-2 rounded-md bg-slate-900/40 border border-slate-800 p-2">
            <span className="text-slate-400">Estimated Conversion</span>
            <span className="text-slate-200 text-right">{conversionStrength}</span>
        </div>
    </div>
</div>

<label htmlFor="key-themes" className="block text-sm font-medium text-slate-300 mb-1">Key Effects or Themes (Optional)</label>
                        <textarea id="key-themes" rows={3} value={keyThemes} onChange={(e) => setKeyThemes(e.target.value)} placeholder="e.g., Classic sleight of hand, modern mind reading, story of a magical artifact" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" />

{themeSuggestionsVisible && (
    <div className="mt-3">
        <p className="text-xs text-slate-500 mb-2">Suggested themes:</p>
        <div className="flex flex-wrap gap-2">
            {THEME_SUGGESTIONS.map(s => (
                <button
                    key={s}
                    type="button"
                    onClick={() => {
                        setKeyThemes(prev => {
                            const p = prev.trim();
                            if (!p) return s;
                            if (p.toLowerCase().includes(s.toLowerCase())) return prev;
                            return `${p}${p.endsWith('.') ? '' : '.'} ${s}`;
                        });
                    }}
                    className="px-2.5 py-1 rounded-full text-xs bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors"
                >
                    {s}
                </button>
            ))}
        </div>
    </div>
)}

                    </div>
                    
                    <button
                        onClick={handleGenerate}
                        disabled={isLoading}
                        className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                    >
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
                     <div className="relative group flex-1 flex flex-col">
                        <div className="p-4 overflow-y-auto space-y-4 pb-32">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                                    <p className="text-sm font-semibold text-slate-200">AI Strategy Notes</p>
                                    <ul className="mt-2 space-y-1 text-sm text-slate-300">
                                        {advisorNotes.map((n, idx) => (
                                            <li key={idx}>• {n}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                                    <p className="text-sm font-semibold text-slate-200">Audience Conversion Predictor</p>
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
                                    <p className="text-sm font-semibold text-slate-200">Competitive Positioning Analyzer</p>
                                    <p className="mt-2 text-sm text-slate-300">Compared to similar performers:</p>
                                    <ul className="mt-2 space-y-1 text-sm text-slate-300">
                                        <li>• You rank strongest in <span className="text-slate-100 font-semibold">{competitivePositioning.strongest}</span></li>
                                        <li>• You rank weakest in <span className="text-slate-100 font-semibold">{competitivePositioning.weakest}</span></li>
                                    </ul>
                                    <p className="mt-3 text-xs text-slate-400">Tip: strengthen “{competitivePositioning.weakest}” by adding proof (logos, testimonials, awards, or a short credibility line).</p>
                                </div>

                                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                                    <p className="text-sm font-semibold text-slate-200">Persona-Based Marketing Versions</p>
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
                                    <p className="text-sm font-semibold text-slate-200">ROI Projection</p>
                                    <p className="mt-2 text-sm text-slate-300">Estimated bookings from campaign:</p>
                                    <p className="mt-2 text-xl font-bold text-slate-100">{roiProjection}</p>
                                    <p className="mt-2 text-xs text-slate-400">Heuristic estimate based on campaign completeness + channel fit. Improve readiness to push the range upward.</p>
                                </div>
                            </div>

                            <pre className="whitespace-pre-wrap break-words text-slate-200 font-sans text-sm">{activeResult}</pre>
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
                                <span className="text-xs text-slate-400 mr-1">Send Campaign to:</span>
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
                                    onClick={handleCreateClientProposal}
                                    disabled={!activeResult}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <FileTextIcon className="w-4 h-4" />
                                    <span>Client Proposal</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleQuickExportIdea('Social Scheduler')}
                                    disabled={!activeResult}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <SendIcon className="w-4 h-4" />
                                    <span>Social Scheduler</span>
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
                            <ShareButton
                                title={`Marketing Campaign for: ${showTitle}`}
                                text={activeResult || ''}
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
                                        <span>Save Idea</span>
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
                            <h3 className="text-slate-200 font-semibold text-lg">Marketing Intelligence Ready</h3>
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
        </main>
    );
};

export default MarketingCampaign;
