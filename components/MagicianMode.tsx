
import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, PredefinedPrompt, TrickIdentificationResult, User, Transcription, MagicianView, MagicianTab, Client, Show, Feedback, SavedIdea, TaskPriority, AiSparkAction } from '../types';
import { generateResponse } from '../services/geminiService';
import { identifyTrickFromImageServer, refineIdentifyResult } from '../services/identifyService';
import { trackClientEvent } from '../services/telemetryClient';
import { supabase } from '../supabase';
import { saveIdea, updateIdea } from '../services/ideasService';
import { exportData } from '../services/dataService';
import { findShowByTitle, createShow, addTaskToShow, addTasksToShow } from '../services/showsService';
import { clearDemoData, seedDemoData } from '../services/demoSeedService';
import { MAGICIAN_SYSTEM_INSTRUCTION, MAGICIAN_PROMPTS, publications, clubs, conventions, AMATEUR_FEATURES, SEMI_PRO_FEATURES, PROFESSIONAL_FEATURES, MAGICIAN_CHAT_TOOLS } from '../constants';
// FIX: Added missing ShareIcon to the icon imports list.
import { BackIcon, SendIcon, MagicHatIcon, RabbitIcon, WandIcon, SaveIcon, ClockIcon, AIMagicianIcon, BookIcon, MicrophoneIcon, LightbulbIcon, ShieldIcon, ImageIcon, SearchIcon, CheckIcon, BookmarkIcon, NewspaperIcon, UsersIcon, CameraIcon, VideoIcon, ChecklistIcon, LockIcon, UsersCogIcon, ThumbUpIcon, ThumbDownIcon, StarIcon, ChatBubbleIcon, QuestionMarkIcon, StageCurtainsIcon, TutorIcon, ShareIcon, DownloadIcon } from './icons';
import { useAppState, useAppDispatch, refreshShows, refreshIdeas, refreshClients, refreshFeedback } from '../store';
import { useToast } from './ToastProvider';
import LiveRehearsal from './LiveRehearsal';
import VisualBrainstorm from './VisualBrainstorm';
import SavedIdeas from './SavedIdeas';
import PropChecklists from './PropChecklists';
import PropGenerator from './PropGenerator';
import EffectGenerator from './EffectGenerator';
import DemoTourBar from './DemoTourBar';
import { getCurrentDemoView, isViewLocked } from '../services/demoTourService';
import MagicArchives from './MagicArchives';
import GospelMagicAssistant from './GospelMagicAssistant';
import MentalismAssistant from './MentalismAssistant';
import ShareButton from './ShareButton';
import SaveActionBar from './shared/SaveActionBar';
import FormattedText from './FormattedText';
import AccountMenu from './AccountMenu';
import UsageMeter from './UsageMeter';
import UsageLimitsCard from './UsageLimitsCard';
import BlockedPanel from './BlockedPanel';
import { normalizeBlockedUx, type BlockedUx } from '../services/blockedUx';
import { normalizeTier, getMembershipDaysRemaining, formatTierLabel } from '../services/membershipService';
import UpgradeModal from './UpgradeModal';
import MemberManagement from './MemberManagement';
import ShowPlanner from './ShowPlanner';
import ShowFeedback from './ShowFeedback';
import HelpModal from './HelpModal';
import PatterEngine from './PatterEngine';
import MagicWire from './MagicWire';
import MarketingCampaign from './MarketingCampaign';
import ClientProposals from './ClientProposals';
import BookingPitches from './BookingPitches';
import ContractGenerator from './ContractGenerator';
import AssistantStudio from './AssistantStudio';
import DirectorMode from './DirectorMode';
import PersonaSimulator from './PersonaSimulator';
import VideoRehearsal from './VideoRehearsal';
import AngleRiskAnalysis from './AngleRiskAnalysis';
import ClientManagement from './ClientManagement';
import Dashboard from './Dashboard';
import GlobalSearch from './GlobalSearch';
import PerformanceAnalytics from './PerformanceAnalytics';
import IllusionBlueprint from './IllusionBlueprint';
import MagicTheoryTutor from './MagicTheoryTutor';
import MagicDictionary from './MagicDictionary';
import AdminPanel from './AdminPanel';
import AppSuggestionModal from './AppSuggestionModal';
import FirstWinGate from './FirstWinGate';

const HOME_INTRO_DISMISSED_KEY = 'maw_home_intro_dismissed_v1';

interface AngleRiskFormProps {
    trickName: string;
    setTrickName: (value: string) => void;
    audienceType: 'Close-up' | 'Stage' | 'Surrounded' | null;
    setAudienceType: (value: 'Close-up' | 'Stage' | 'Surrounded' | null) => void;
    onCancel: () => void;
    onSubmit: () => void;
}

const AngleRiskForm: React.FC<AngleRiskFormProps> = ({
    trickName, setTrickName, audienceType, setAudienceType, onCancel, onSubmit
}) => (
    <div className="flex-1 flex flex-col justify-center items-center text-center animate-fade-in">
        <MagicHatIcon className="w-16 h-16 text-slate-500 mb-4"/>
        <h2 className="text-xl font-bold text-slate-300 mb-2">Angle & Risk Analysis</h2>
        <p className="text-slate-400 max-w-md mb-6">Let's break down the effect for a specific performance environment.</p>
        <div className="w-full max-w-md space-y-4">
            <div>
                <label htmlFor="trickName" className="block text-sm font-medium text-slate-300 text-left mb-1">Name of the Effect</label>
                <input
                    id="trickName" type="text" value={trickName}
                    onChange={(e) => setTrickName(e.target.value)}
                    placeholder="e.g., Ambitious Card"
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500 transition-colors"
                    autoFocus
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-300 text-left mb-2">Audience Type</label>
                <div className="grid grid-cols-3 gap-2">
                    {(['Close-up', 'Stage', 'Surrounded'] as const).map(type => (
                        <button key={type} onClick={() => setAudienceType(type)}
                            className={`py-2 px-3 rounded-md transition-colors text-sm font-semibold ${ audienceType === type ? 'bg-purple-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300' }`}
                        >{type}</button>
                    ))}
                </div>
            </div>
            <div className="flex gap-3 pt-2">
                <button onClick={onCancel}
                    className="w-full py-2 px-4 bg-slate-600/50 hover:bg-slate-700 rounded-md text-slate-300 font-bold transition-colors"
                >Cancel</button>
                <button onClick={onSubmit} disabled={!trickName.trim() || !audienceType}
                    className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                >Get Analysis</button>
            </div>
        </div>
    </div>
);
  
interface RehearsalCoachingFormProps {
    routineDescription: string;
    setRoutineDescription: (value: string) => void;
    targetDuration: string;
    setTargetDuration: (value: string) => void;
    onCancel: () => void;
    onSubmit: () => void;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const RehearsalCoachingForm: React.FC<RehearsalCoachingFormProps> = ({
    routineDescription, setRoutineDescription, targetDuration, setTargetDuration, onCancel, onSubmit, onFileChange
}) => {
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    return (
        <div className="flex-1 flex flex-col justify-center items-center text-center animate-fade-in">
            <ClockIcon className="w-16 h-16 text-slate-500 mb-4"/>
            <h2 className="text-xl font-bold text-slate-300 mb-2">Rehearsal Coaching</h2>
            <p className="text-slate-400 max-w-md mb-6">Let's refine the timing and pacing of your routine.</p>
            <div className="w-full max-w-md space-y-4">
                <div>
                    <div className="flex justify-between items-baseline mb-1">
                        <label htmlFor="routineDescription" className="block text-sm font-medium text-slate-300 text-left">Routine Script/Description</label>
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm text-purple-400 hover:text-purple-300 font-semibold transition-colors">
                            Upload Script...
                        </button>
                        <input type="file" ref={fileInputRef} onChange={onFileChange} className="hidden" accept=".txt,.md" />
                    </div>
                    <textarea id="routineDescription" rows={4} value={routineDescription} onChange={(e) => setRoutineDescription(e.target.value)} placeholder="Describe your routine, paste your script, or upload a file..."
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500 transition-colors" autoFocus />
                </div>
                <div>
                    <label htmlFor="targetDuration" className="block text-sm font-medium text-slate-300 text-left mb-1">Target Duration (minutes)</label>
                    <input id="targetDuration" type="number" value={targetDuration} onChange={(e) => setTargetDuration(e.target.value)} placeholder="e.g., 3"
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500 transition-colors" />
                </div>
                <div className="flex gap-3 pt-2">
                    <button onClick={onCancel}
                        className="w-full py-2 px-4 bg-slate-600/50 hover:bg-slate-700 rounded-md text-slate-300 font-bold transition-colors">Cancel</button>
                    <button onClick={onSubmit} disabled={!routineDescription.trim() || !targetDuration.trim()}
                        className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">Get Feedback</button>
                </div>
            </div>
        </div>
    );
};
  
interface InnovationEngineFormProps {
    effectToInnovate: string;
    setEffectToInnovate: (value: string) => void;
    onCancel: () => void;
    onSubmit: () => void;
}

const InnovationEngineForm: React.FC<InnovationEngineFormProps> = ({
    effectToInnovate, setEffectToInnovate, onCancel, onSubmit
}) => (
    <div className="flex-1 flex flex-col justify-center items-center text-center animate-fade-in">
        <LightbulbIcon className="w-16 h-16 text-slate-500 mb-4"/>
        <h2 className="text-xl font-bold text-slate-300 mb-2">Innovation Engine</h2>
        <p className="text-slate-400 max-w-md mb-6">Describe an effect to brainstorm new, creative presentations.</p>
        <div className="w-full max-w-md space-y-4">
            <div>
                <label htmlFor="effectToInnovate" className="block text-sm font-medium text-slate-300 text-left mb-1">Effect Description</label>
                <textarea id="effectToInnovate" rows={4} value={effectToInnovate} onChange={(e) => setEffectToInnovate(e.target.value)} placeholder="e.g., A signed card is found inside a lemon."
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500 transition-colors" autoFocus />
            </div>
            <div className="flex gap-3 pt-2">
                <button onClick={onCancel}
                    className="w-full py-2 px-4 bg-slate-600/50 hover:bg-slate-700 rounded-md text-slate-300 font-bold transition-colors">Cancel</button>
                <button onClick={onSubmit} disabled={!effectToInnovate.trim()}
                    className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">Generate Ideas</button>
            </div>
        </div>
    </div>
);

const PromptGrid: React.FC<{
  prompts: PredefinedPrompt[];
  user: User;
  hasAmateurAccess: boolean;
  hasSemiProAccess: boolean;
  hasProfessionalAccess: boolean;
  usageQuota?: any;
  onPromptClick: (prompt: PredefinedPrompt) => void;
}> = ({ prompts, user, hasAmateurAccess, hasSemiProAccess, hasProfessionalAccess, usageQuota, onPromptClick }) => {
  // --- Organization: Sections (no features added, just layout/UX) ---
  const PRIMARY_TITLES = new Set<string>([
    'Effect Generator',
    'Patter Engine',
  ]);


  // Card copy shown in the AI Assistant grid (keeps tool prompts intact for functionality).
  // Tone standard: short title + single-sentence description + one-line tooltip.
  const CARD_COPY: Record<string, { desc: string; tip: string }> = {
    'Effect Generator': {
      desc: 'Generate original magic effects using everyday objects and creative constraints.',
      tip: 'Generate effect ideas from the objects you name.',
    },
    'Patter Engine': {
      desc: 'Write performance-ready scripts in comedic, mysterious, or dramatic styles.',
      tip: 'Write a script for an effect in your chosen tone.',
    },
    'Innovation Engine': {
      desc: 'Refresh classic effects with modern presentations and creative twists.',
      tip: 'Reframe a classic effect with new themes and premises.',
    },
    'Visual Brainstorm Studio': {
      desc: 'Create visual concepts for props, stage design, and promotional ideas.',
      tip: 'Generate concept art for props, sets, or posters.',
    },
    'Illusion Blueprint Generator': {
      desc: 'Outline large-scale illusion concepts with staging and theatrical considerations.',
      tip: 'Draft a stage-ready illusion concept and staging notes.',
    },

    'Live Patter Rehearsal': {
      desc: 'Practice your spoken patter and receive real-time feedback on delivery and pacing.',
      tip: 'Start a live session for real-time vocal coaching.',
    },
    'Video Rehearsal Studio': {
      desc: 'Upload rehearsal footage to analyze movement, timing, and stage presence.',
      tip: 'Upload a rehearsal video for feedback on staging and presence.',
    },
    'Persona Simulator': {
      desc: 'Test your material against simulated audience personalities and reactions.',
      tip: 'Rehearse against a heckler, child, or corporate guest persona.',
    },
    'Angle/Risk Analysis': {
      desc: 'Identify sightline issues, reset risks, and performance vulnerabilities.',
      tip: 'Spot angle, reset, and handling risks before you perform.',
    },
    'Rehearsal Coaching': {
      desc: 'Refine pacing and structure with coaching based on your script and target duration.',
      tip: 'Get pacing and timing coaching from your script and goal length.',
    },

    'Director Mode': {
      desc: 'Structure a full show with segments, pacing, and a strong narrative arc.',
      tip: 'Build a complete show outline from your theme and audience.',
    },
    'Show Planner': {
      desc: 'Organize routines, props, and preparation tasks for each performance.',
      tip: 'Plan a show with tasks, notes, and run-of-show details.',
    },
    'Prop Checklist Generator': {
      desc: 'Generate a clear prop checklist for rehearsals, travel, and show day.',
      tip: 'Create a packing checklist for a specific routine or show.',
    },
    'Client Management': {
      desc: 'Store client details and link them to shows and bookings.',
      tip: 'Keep client notes and reuse details across tools.',
    },
    'Contract Generator': {
      desc: 'Create professional performance contracts tailored to your engagements.',
      tip: 'Generate a performance agreement you can copy or download.',
    },
    'Marketing Campaign': {
      desc: 'Generate promotional copy for shows, events, and social media.',
      tip: 'Create a quick marketing kit for a show or gig.',
    },

    'Magic Archives': {
      desc: 'Research magic history, creators, and classic effects.',
      tip: 'Look up creators, effects, and historical references.',
    },
    'Magic Theory Tutor': {
      desc: 'Learn foundational magic principles through guided explanations.',
      tip: 'Study theory topics like misdirection, timing, and structure.',
    },
    'Magic Dictionary': {
      desc: 'Look up core terms and concepts used in magic and performance.',
      tip: 'Quickly define a term mentioned in lessons or feedback.',
    },
    'Mentalism Assistant': {
      desc: 'Develop mind-reading routines and structured mentalism effects.',
      tip: 'Draft a mentalism routine outline or premise.',
    },
    'Gospel Magic Assistant': {
      desc: 'Connect magic effects with meaningful biblical messages.',
      tip: 'Pair effects with themes, verses, and message beats.',
    },
    "Assistant's Studio": {
      desc: 'Plan assistant choreography and strengthen your on-stage partnership.',
      tip: 'Improve assistant blocking, cues, and collaboration.',
    },

    'My Saved Ideas': {
      desc: 'Browse and refine your saved scripts, plans, and notes.',
      tip: 'Open your saved work and keep building.',
    },
    'Global Search': {
      desc: 'Search across your saved ideas, shows, and notes.',
      tip: 'Find anything fast across your library.',
    },

    'Show Feedback': {
      desc: 'Review audience feedback and ratings from live performances.',
      tip: 'See what audiences loved (and where they got confused).',
    },
    'Member Management': {
      desc: 'Manage user access and membership settings (admin only).',
      tip: 'Admin-only membership controls.',
    },
  };

  const SECTION_DEFS: Array<{
    key: string;
    icon: string;
    title: string;
    description: string;
    titles: string[];
  }> = [
    {
      key: 'create',
      icon: '🎨',
      title: 'Create',
      description: 'Generate effects, write scripts, and develop visual concepts.',
      titles: [
        'Effect Generator',
        'Patter Engine',
        'Innovation Engine',
        'Visual Brainstorm Studio',
        'Illusion Blueprint Generator',
      ],
    },
    {
      key: 'rehearse',
      icon: '🎙️',
      title: 'Rehearse',
      description: 'Practice delivery, timing, and audience management before you step on stage.',
      titles: [
        'Rehearsal Coaching',
        'Live Patter Rehearsal',
        'Video Rehearsal Studio',
        'Angle/Risk Analysis',
        'Persona Simulator',
        'Director Mode',
      ],
    },
    {
      key: 'perform_manage',
      icon: '🎭',
      title: 'Perform & Manage',
      description: 'Plan shows, stay organized, and handle the business side of performing.',
      titles: [
        'Show Planner',
        'Show Feedback',
        'Client Management',
        'Contract Generator',
        'Prop Checklist Generator',
        'Marketing Campaign',
      ],
    },

    {
      key: 'specialty',
      icon: '✨',
      title: 'Specialty Assistants',
      description: 'Get focused guidance for specialized performance styles.',
      titles: [
        "Assistant's Studio",
        'Mentalism Assistant',
        'Gospel Magic Assistant',
      ],
    },

    // --- Everything below stays accessible, but is “secondary” to the main flow above. ---
    {
      key: 'library',
      icon: '🗂️',
      title: 'Your Library',
      description: 'Search and revisit your saved work.',
      titles: [
        'Global Search',
        'My Saved Ideas',
      ],
    },
    {
      key: 'learning',
      icon: '📚',
      title: 'Learn & Reference',
      description: 'Study fundamentals and look up terms, history, and theory.',
      titles: [
        'Magic Theory Tutor',
        'Magic Dictionary',
        'Magic Archives',
      ],
    },
  ];

  const promptMap = new Map<string, PredefinedPrompt>(
    prompts.map((p) => [p.title, p])
  );

  const isLockedFor = (title: string) => {
    const isAmateurFeature = AMATEUR_FEATURES.includes(title);
    const isSemiProFeature = SEMI_PRO_FEATURES.includes(title);
    const isProfessionalFeature = PROFESSIONAL_FEATURES.includes(title);

    return (
      (isAmateurFeature && !hasAmateurAccess) ||
      (isSemiProFeature && !hasSemiProAccess) ||
      (isProfessionalFeature && !hasProfessionalAccess)
    );
  };

  // Standardized action labels (aligns with "Generate / Start / Open / View" language).
  const getActionLabel = (title: string) => {
    // Generate
    if (
      [
        'Effect Generator',
        'Patter Engine',
        'Innovation Engine',
        'Visual Brainstorm Studio',
        'Illusion Blueprint Generator',
        'Prop Checklist Generator',
        'Contract Generator',
        'Marketing Campaign',
        'Director Mode',
        'Assistant\'s Studio',
        'Mentalism Assistant',
        'Gospel Magic Assistant',
      ].includes(title)
    ) {
      return 'Generate';
    }

    // Start
    if (
      [
        'Live Patter Rehearsal',
        'Video Rehearsal Studio',
        'Persona Simulator',
        'Rehearsal Coaching',
        'Angle/Risk Analysis',
      ].includes(title)
    ) {
      return 'Start';
    }

    // Open
    if (
      ['Show Planner', 'Client Management', 'Magic Archives', 'Magic Theory Tutor', 'Magic Dictionary', 'Global Search', 'My Saved Ideas'].includes(title)
    ) {
      return 'Open';
    }

    // View
    if (['Show Feedback'].includes(title)) {
      return 'View';
    }

    // Fallback
    return 'Open';
  };

  const renderCard = (p: PredefinedPrompt) => {
    const isLocked = isLockedFor(p.title);
    const isPrimary = PRIMARY_TITLES.has(p.title);
    const copy = CARD_COPY[p.title];
    const desc = copy?.desc ?? p.prompt;
    const tip = copy?.tip ?? desc;
    const action = getActionLabel(p.title);

    const remainingForTitle = (() => {
      if (!usageQuota) return null as null | number;
      if (p.title === 'Live Patter Rehearsal') return usageQuota?.live_audio_minutes?.remaining ?? null;
      if (p.title === 'Visual Brainstorm Studio') return usageQuota?.image_gen?.remaining ?? null;
      if (p.title === 'Identify a Trick') return usageQuota?.identify?.remaining ?? null;
      if (p.title === 'Video Rehearsal Studio') return usageQuota?.video_uploads?.remaining ?? null;
      return null;
    })();

    return (
      <button
        key={p.title}
        onClick={() => onPromptClick(p)}
        className={[
          'relative p-4 rounded-lg text-left transition-colors h-full flex flex-col disabled:opacity-60 disabled:hover:bg-slate-800/50 disabled:cursor-not-allowed group',
          // Base card styling
          'bg-slate-800/50 hover:bg-purple-900/50 border border-slate-700',
          // Primary highlight (subtle)
          isPrimary ? 'border-amber-300/60 shadow-[0_0_14px_rgba(212,175,55,0.22)]' : '',
          // Locked state (still clickable to open upgrade)
          isLocked ? 'hover:bg-slate-800/50' : '',
        ].join(' ')}
      >
        {isPrimary && (
          <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-amber-300/15 text-amber-200 border border-amber-300/20">
            ★ Recommended
          </span>
        )}

        {p.icon && (
          <p.icon
            className={[
              'w-7 h-7 mb-3 transition-colors',
              isPrimary ? 'text-amber-300 group-hover:text-amber-200' : 'text-purple-400 group-hover:text-purple-300',
            ].join(' ')}
          />
        )}

        <p className="font-bold text-slate-200">{p.title}</p>
        <p className="text-sm text-slate-400 mt-1 line-clamp-2 flex-grow">{desc}</p>

        {/* Hover microcopy (1-line tooltip). No new features—just UX copy. */}
        <span
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 rounded-md text-[11px] whitespace-nowrap bg-slate-950/95 text-slate-200 border border-slate-700 shadow-lg opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100"
        >
          {isLocked ? 'Unlock with Professional to use this tool' : tip}
        </span>

        {/* Action label (aligns with button language: Generate / Start / Open / View) */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            {isLocked ? '🔒 Pro Only' : 'Available'}
            {typeof remainingForTitle === 'number' ? (
              <span className="ml-2 text-slate-400">Remaining: {remainingForTitle}</span>
            ) : null}
          </span>
          <span
            className={[
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold border transition-colors',
              isLocked
                ? 'bg-slate-900/40 text-amber-200 border-amber-300/30'
                : 'bg-purple-900/20 text-purple-200 border-purple-500/30 group-hover:bg-purple-900/35',
            ].join(' ')}
          >
            {isLocked ? (
              <>
                <LockIcon className="w-3 h-3 text-amber-300/80" />
                <span>{action} (Pro)</span>
              </>
            ) : (
              <span>{action}</span>
            )}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="flex-1 flex flex-col items-center text-center animate-fade-in p-4">
      <RabbitIcon className="w-16 h-16 text-slate-500 mb-4" />
      <h2 className="text-2xl font-bold text-slate-300 mb-2 font-cinzel">Home</h2>
      <p className="text-slate-400 max-w-2xl mb-8">
        Choose a tool to start, or ask me anything. Recommended tools are highlighted.
      </p>

      <div id="maw-tool-grid" className="w-full max-w-5xl space-y-10">
        {SECTION_DEFS.map((section) => {
          const sectionPrompts = section.titles
            .map((t) => promptMap.get(t))
            .filter(Boolean) as PredefinedPrompt[];

          // Hide empty sections gracefully (in case titles change)
          if (sectionPrompts.length === 0) return null;

          return (
            <section key={section.key} className="text-left">
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg" aria-hidden="true">{section.icon}</span>
                  <h3 className="text-xl font-bold text-slate-200">{section.title}</h3>
                </div>
                <p className="text-sm text-slate-400 mt-1 max-w-3xl">{section.description}</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {sectionPrompts
                  .filter((p) => user.isAdmin || p.title !== 'Member Management')
                  .map(renderCard)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
const LoadingIndicator: React.FC = () => (
    <div className="flex items-center space-x-1">
        <div className="w-2 h-2 bg-purple-300 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-2 h-2 bg-purple-300 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 bg-purple-300 rounded-full animate-bounce"></div>
    </div>
);

const ChatMessages: React.FC<{
  messages: ChatMessage[];
  isLoading: boolean;
  recentlySaved: Set<number>;
  handleSaveIdea: (text: string, index: number) => void;
  handleFeedback: (messageId: string, feedback: 'good' | 'bad') => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}> = ({ messages, isLoading, recentlySaved, handleSaveIdea, handleFeedback, messagesEndRef }) => (
  <div className="space-y-4">
    {messages.map((msg, index) => (
      <div key={msg.id} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        {msg.role === 'model' && (
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
            <AIMagicianIcon className="w-5 h-5 text-purple-400" />
          </div>
        )}
        {msg.role === 'user' ? (
          <div className="max-w-2xl px-4 py-2 rounded-xl bg-purple-800 text-white">
            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
          </div>
        ) : (
          <div className="max-w-2xl">
            <div className="px-4 py-2 rounded-xl bg-slate-700 text-slate-200">
              <FormattedText text={msg.text} />
            </div>
            <div className="mt-1.5 flex justify-end items-center gap-2">
              <ShareButton
                title="Shared from Magicians' AI Wizard"
                text={msg.text}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-800/70 hover:bg-slate-600 rounded-full text-slate-300 transition-colors"
                aria-label="Share this response"
              >
                <ShareIcon className="w-3 h-3" />
                <span>Share</span>
              </ShareButton>
              <button onClick={() => handleSaveIdea(msg.text, index)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-800/70 hover:bg-slate-600 rounded-full text-slate-300 transition-colors"
                aria-label={recentlySaved.has(index) ? 'Saved' : 'Save this idea'} title={recentlySaved.has(index) ? 'Saved' : 'Save this idea'}>
                {recentlySaved.has(index) ? (
                  <>
                    <CheckIcon className="w-3 h-3 text-green-400" />
                    <span>Saved</span>
                  </>
                ) : (
                  <>
                    <SaveIcon className="w-3 h-3" />
                    <span>Save</span>
                  </>
                )}
              </button>
              <div className="flex gap-1 border-l border-slate-600 pl-2">
                <button
                  onClick={() => handleFeedback(msg.id, 'good')}
                  className={`p-1 rounded-full transition-colors ${msg.feedback === 'good' ? 'bg-green-500/20 text-green-400' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-600'}`}
                  aria-label="Good response"
                  title="Good response"
                >
                  <ThumbUpIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleFeedback(msg.id, 'bad')}
                  className={`p-1 rounded-full transition-colors ${msg.feedback === 'bad' ? 'bg-red-500/20 text-red-400' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-600'}`}
                  aria-label="Bad response"
                  title="Bad response"
                >
                  <ThumbDownIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    ))}
    {isLoading && (
      <div className="flex items-start gap-3 justify-start">
        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
          <AIMagicianIcon className="w-5 h-5 text-purple-400" />
        </div>
        <div className="max-w-lg px-4 py-2 rounded-xl bg-slate-700 text-slate-200">
          <LoadingIndicator />
        </div>
      </div>
    )}
    <div ref={messagesEndRef} />
  </div>
);

const ChatView: React.FC<{
  messages: ChatMessage[];
  isLoading: boolean;
  recentlySaved: Set<number>;
  handleSaveIdea: (text: string, index: number) => void;
  handleFeedback: (messageId: string, feedback: 'good' | 'bad') => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  showAngleRiskForm: boolean;
  trickName: string;
  setTrickName: (val: string) => void;
  audienceType: 'Close-up' | 'Stage' | 'Surrounded' | null;
  setAudienceType: (val: 'Close-up' | 'Stage' | 'Surrounded' | null) => void;
  handleAngleRiskSubmit: () => void;
  onCancelAngleRisk: () => void;
  showRehearsalForm: boolean;
  routineDescription: string;
  setRoutineDescription: (val: string) => void;
  targetDuration: string;
  setTargetDuration: (val: string) => void;
  handleRehearsalSubmit: () => void;
  onCancelRehearsal: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showInnovationEngineForm: boolean;
  effectToInnovate: string;
  setEffectToInnovate: (val: string) => void;
  handleInnovationEngineSubmit: () => void;
  onCancelInnovationEngine: () => void;
  prompts: PredefinedPrompt[];
  user: User;
  hasAmateurAccess: boolean;
  hasSemiProAccess: boolean;
  hasProfessionalAccess: boolean;
  usageQuota?: any;
  onPromptClick: (prompt: PredefinedPrompt) => void;
}> = (props) => {
  let content;
  if (props.messages.length > 0) {
    content = <ChatMessages {...props} />;
  } else if (props.showAngleRiskForm) {
    content = <AngleRiskForm
      trickName={props.trickName} setTrickName={props.setTrickName}
      audienceType={props.audienceType} setAudienceType={props.setAudienceType}
      onCancel={props.onCancelAngleRisk} onSubmit={props.handleAngleRiskSubmit}
    />;
  } else if (props.showRehearsalForm) {
    content = <RehearsalCoachingForm
      routineDescription={props.routineDescription} setRoutineDescription={props.setRoutineDescription}
      targetDuration={props.targetDuration} setTargetDuration={props.setTargetDuration}
      onCancel={props.onCancelRehearsal} onSubmit={props.handleRehearsalSubmit}
      onFileChange={props.onFileChange}
    />;
  } else if (props.showInnovationEngineForm) {
    content = <InnovationEngineForm
      effectToInnovate={props.effectToInnovate} setEffectToInnovate={props.setEffectToInnovate}
      onCancel={props.onCancelInnovationEngine} onSubmit={props.handleInnovationEngineSubmit}
    />;
  } else {
    content = <PromptGrid 
      prompts={props.prompts}
      user={props.user}
      hasAmateurAccess={props.hasAmateurAccess}
      hasSemiProAccess={props.hasSemiProAccess}
      hasProfessionalAccess={props.hasProfessionalAccess}
      usageQuota={props.usageQuota}
      onPromptClick={props.onPromptClick}
    />;
  }
  return (
    <div className={`flex-1 p-4 md:p-5 ${props.messages.length > 0 ? 'overflow-y-auto' : 'flex flex-col'}`}>
      {content}
    </div>
  );
};

const ExpandableText: React.FC<{ text: string; limit?: number; className?: string }> = ({
  text,
  limit = 280,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(false);
  const t = (text || '').trim();
  if (!t) return null;
  const isLong = t.length > limit;
  const visible = !isLong || expanded ? t : t.slice(0, limit).trimEnd() + '…';

  return (
    <div className={className}>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{visible}</div>
      {isLong ? (
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-purple-300 hover:text-purple-200 transition"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
};

const IdentifyTab: React.FC<{
    imageFile: File | null;
    imagePreview: string | null;
    identificationResult: TrickIdentificationResult | null;
    isIdentifying: boolean;
    identificationError: string | null;
    identificationBlocked: BlockedUx | null;
    identifySaved: boolean;
    identifySaving: boolean;
    identifyIsStrong: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleIdentifyClick: () => void;
    onSave: () => void;
    onAddToShow: () => void;
    onConvertToTask: () => void;
    onCopy: () => void;
    onShare: () => void;
    onToggleStrong: () => void;
    onRefine: (intent: 'clarify' | 'visual' | 'comedy' | 'mentalism' | 'practical' | 'safer_angles') => void;
    refining: boolean;
    lastRefine: string | null;
    onRequestUpgrade: () => void;
}> = ({ imagePreview, identificationResult, isIdentifying, identificationError, identificationBlocked, identifySaved, identifySaving, identifyIsStrong, fileInputRef, handleImageUpload, handleIdentifyClick, onSave, onAddToShow, onConvertToTask, onCopy, onShare, onToggleStrong, onRefine, refining, lastRefine, onRequestUpgrade }) => (
    <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="animate-fade-in space-y-4 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Identify a Trick</h2>
            <p className="text-slate-400">Research an effect you've seen. Upload a picture, and the AI will try to identify it and find performance examples.</p>
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
            {!imagePreview ? (
                 <button onClick={() => fileInputRef.current?.click()} className="w-full flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-600 rounded-lg hover:bg-slate-800/50 hover:border-purple-500 transition-colors">
                    <ImageIcon className="w-12 h-12 text-slate-500 mb-2"/>
                    <span className="font-semibold text-slate-300">Click to upload an image</span>
                    <span className="text-sm text-slate-400">PNG, JPG, or WEBP</span>
                </button>
            ) : (
                <div className="space-y-4">
                    <div className="w-full h-64 bg-slate-800 rounded-lg flex items-center justify-center overflow-hidden">
                        <img src={imagePreview} alt="Magic trick preview" className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="flex gap-4">
                        <button onClick={() => fileInputRef.current?.click()} className="flex-1 w-full py-2 px-4 bg-slate-600/50 hover:bg-slate-700 rounded-md text-slate-300 font-bold transition-colors">
                            Change Image
                        </button>
                        <button onClick={handleIdentifyClick} disabled={isIdentifying} className="flex-1 w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
                            {isIdentifying ? 'Analyzing...' : 'Identify Trick'}
                        </button>
                    </div>
                </div>
            )}
            {isIdentifying && (
                <div className="flex items-center justify-center p-5 bg-slate-800/50 rounded-lg">
                   <div className="flex items-center space-x-2 text-slate-300">
                        <WandIcon className="w-5 h-5 animate-pulse text-purple-400" />
                        <span>Consulting magical archives...</span>
                    </div>
                </div>
            )}
            {identificationBlocked && (
                <BlockedPanel
                    blocked={identificationBlocked}
                    onUpgrade={identificationBlocked.showUpgrade ? onRequestUpgrade : undefined}
                    onRetry={identificationBlocked.retryable ? handleIdentifyClick : undefined}
                />
            )}
            {identificationError && <p className="text-red-400 text-center bg-red-900/20 p-3 rounded-lg">{identificationError}</p>}
            {identificationResult && (
                <div className="animate-fade-in bg-slate-800/50 border border-slate-700 rounded-2xl p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-wider text-slate-400">Most likely trick</div>
                        <div className="mt-1 text-2xl font-bold text-white">{identificationResult.trickName}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full border ${
                            (identificationResult.confidence || 'Medium') === 'High'
                              ? 'bg-green-500/10 text-green-200 border-green-500/30'
                              : (identificationResult.confidence || 'Medium') === 'Low'
                              ? 'bg-amber-500/10 text-amber-200 border-amber-500/30'
                              : 'bg-sky-500/10 text-sky-200 border-sky-500/30'
                          }`}
                        >
                          Confidence: {identificationResult.confidence || 'Medium'}
                        </span>
                      </div>
                    </div>

                    {identificationResult.summary ? (
                      <div className="text-slate-200">
                        <div className="text-xs uppercase tracking-wider text-slate-400">Quick summary</div>
                        <ExpandableText text={identificationResult.summary} limit={260} className="mt-1" />
                      </div>
                    ) : null}

                    {identificationResult.observations?.length ? (
                      <div>
                        <div className="text-xs uppercase tracking-wider text-slate-400">What I'm seeing</div>
                        <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-slate-200">
                          {identificationResult.observations.slice(0, 8).map((o, idx) => (
                            <li key={idx} className="text-slate-200">{o}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {/* Phase 2 — Expandable sections (accordion style) */}
                    {(identificationResult.likelyEffectPlot ||
                      identificationResult.performanceStructure?.length ||
                      identificationResult.presentationIdeas?.length ||
                      identificationResult.angleRiskNotes?.length ||
                      identificationResult.variations?.length) && (
                      <div className="space-y-2">
                        {identificationResult.likelyEffectPlot && (
                          <details className="rounded-lg border border-slate-700/60 bg-slate-900/20 p-3">
                            <summary className="cursor-pointer select-none text-xs font-semibold tracking-wide text-slate-200">
                              Likely Effect / Plot
                              <span className="ml-2 text-[11px] font-normal text-slate-400">tap to expand</span>
                            </summary>
                            <div className="mt-2">
                              <ExpandableText text={identificationResult.likelyEffectPlot} limit={420} />
                            </div>
                          </details>
                        )}

                        {!!identificationResult.performanceStructure?.length && (
                          <details className="rounded-lg border border-slate-700/60 bg-slate-900/20 p-3">
                            <summary className="cursor-pointer select-none text-xs font-semibold tracking-wide text-slate-200">
                              Performance Structure
                              <span className="ml-2 text-[11px] font-normal text-slate-400">tap to expand</span>
                            </summary>
                            <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-slate-200">
                              {identificationResult.performanceStructure.slice(0, 10).map((x, i) => (
                                <li key={i}>{x}</li>
                              ))}
                            </ul>
                          </details>
                        )}

                        {!!identificationResult.presentationIdeas?.length && (
                          <details className="rounded-lg border border-slate-700/60 bg-slate-900/20 p-3">
                            <summary className="cursor-pointer select-none text-xs font-semibold tracking-wide text-slate-200">
                              Presentation Ideas
                              <span className="ml-2 text-[11px] font-normal text-slate-400">tap to expand</span>
                            </summary>
                            <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-slate-200">
                              {identificationResult.presentationIdeas.slice(0, 12).map((x, i) => (
                                <li key={i}>{x}</li>
                              ))}
                            </ul>
                          </details>
                        )}

                        {!!identificationResult.angleRiskNotes?.length && (
                          <details className="rounded-lg border border-slate-700/60 bg-slate-900/20 p-3">
                            <summary className="cursor-pointer select-none text-xs font-semibold tracking-wide text-slate-200">
                              Angle / Risk Notes
                              <span className="ml-2 text-[11px] font-normal text-slate-400">non-exposure</span>
                            </summary>
                            <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-slate-200">
                              {identificationResult.angleRiskNotes.slice(0, 12).map((x, i) => (
                                <li key={i}>{x}</li>
                              ))}
                            </ul>
                          </details>
                        )}

                        {!!identificationResult.variations?.length && (
                          <details className="rounded-lg border border-slate-700/60 bg-slate-900/20 p-3">
                            <summary className="cursor-pointer select-none text-xs font-semibold tracking-wide text-slate-200">
                              Variations / Alternatives
                              <span className="ml-2 text-[11px] font-normal text-slate-400">tap to expand</span>
                            </summary>
                            <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-slate-200">
                              {identificationResult.variations.slice(0, 12).map((x, i) => (
                                <li key={i}>{x}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    )}

                   {identificationResult.videoExamples?.length > 0 && (
                     <div>
                        <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">Example performances</div>
                        <div className="space-y-2">
                            {identificationResult.videoExamples.map((video, index) => (
                                <a key={index} href={video.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 bg-slate-700/50 hover:bg-purple-900/50 rounded-md transition-colors">
                                    <VideoIcon className="w-6 h-6 text-purple-400 flex-shrink-0"/>
                                    <span className="text-slate-200 text-sm truncate">{video.title}</span>
                                </a>
                            ))}
                        </div>
                     </div>
                   )}

                   <SaveActionBar
                      title="Next step:"
                      subtitle="Save this research, then move it into a Show or Task."
                      onSave={onSave}
                      saving={identifySaving}
                      saved={identifySaved}
                      onAddToShow={onAddToShow}
                      onConvertToTask={onConvertToTask}
                      onCopy={onCopy}
                      onShare={onShare}
                      isStrong={identifyIsStrong}
                      onToggleStrong={onToggleStrong}
                      refineNode={
                        <div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => onRefine('clarify')}
                              disabled={!identificationResult || isIdentifying || refining}
                              className="h-9 px-3 text-xs border border-slate-600 rounded-md bg-slate-900/40 text-slate-200 hover:bg-slate-800/50 disabled:opacity-50"
                            >
                              ✨ Clarify
                            </button>
                            <button
                              type="button"
                              onClick={() => onRefine('visual')}
                              disabled={!identificationResult || isIdentifying || refining}
                              className="h-9 px-3 text-xs border border-slate-600 rounded-md bg-slate-900/40 text-slate-200 hover:bg-slate-800/50 disabled:opacity-50"
                            >
                              🎬 More Visual
                            </button>
                            <button
                              type="button"
                              onClick={() => onRefine('comedy')}
                              disabled={!identificationResult || isIdentifying || refining}
                              className="h-9 px-3 text-xs border border-slate-600 rounded-md bg-slate-900/40 text-slate-200 hover:bg-slate-800/50 disabled:opacity-50"
                            >
                              🎭 Comedy
                            </button>
                            <button
                              type="button"
                              onClick={() => onRefine('mentalism')}
                              disabled={!identificationResult || isIdentifying || refining}
                              className="h-9 px-3 text-xs border border-slate-600 rounded-md bg-slate-900/40 text-slate-200 hover:bg-slate-800/50 disabled:opacity-50"
                            >
                              🧠 Mentalism
                            </button>
                            <button
                              type="button"
                              onClick={() => onRefine('practical')}
                              disabled={!identificationResult || isIdentifying || refining}
                              className="h-9 px-3 text-xs border border-slate-600 rounded-md bg-slate-900/40 text-slate-200 hover:bg-slate-800/50 disabled:opacity-50"
                            >
                              🧰 Practical
                            </button>
                            <button
                              type="button"
                              onClick={() => onRefine('safer_angles')}
                              disabled={!identificationResult || isIdentifying || refining}
                              className="h-9 px-3 text-xs border border-slate-600 rounded-md bg-slate-900/40 text-slate-200 hover:bg-slate-800/50 disabled:opacity-50"
                            >
                              🛡️ Safer Angles
                            </button>
                          </div>

                          {refining ? (
                            <div className="mt-2 text-xs text-slate-400 flex items-center gap-2">
                              <span className="inline-block h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
                              Refining{lastRefine ? `: ${lastRefine}` : ''}…
                            </div>
                          ) : null}
                        </div>
                      }
                    />
                </div>
            )}
        </div>
    </div>
);




const PublicationsTab: React.FC = () => {
  const STORAGE_KEY = 'magic-publications-saved-research';

  const [filter, setFilter] = useState<'all' | 'print' | 'digital' | 'video' | 'research' | 'archive'>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'alphabetical' | 'newest' | 'popular'>('alphabetical');
  const [savedPublications, setSavedPublications] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  });

  const featuredPublication = publications.find(pub => pub.name === 'Genii Magazine') ?? publications[0];

  const publicationFilters = [
    { id: 'all', label: 'All' },
    { id: 'print', label: 'Print' },
    { id: 'digital', label: 'Digital' },
    { id: 'video', label: 'Video' },
    { id: 'research', label: 'Research' },
    { id: 'archive', label: 'Archive' },
  ] as const;

  const editorPickNames = ['Genii Magazine', 'Magicseen', 'VANISH Magazine'] as const;
  const mostPopularOrder = [
    'Genii Magazine',
    'The Linking Ring',
    'Magicseen',
    'VANISH Magazine',
    'Reel Magic Magazine',
    'M-U-M Magazine',
    'Gibecière',
    'MAGIC Magazine',
  ];
  const newestOrder = [
    'VANISH Magazine',
    'Reel Magic Magazine',
    'Magicseen',
    'Genii Magazine',
    'The Linking Ring',
    'M-U-M Magazine',
    'Gibecière',
    'MAGIC Magazine',
  ];

  const wireMentions: Record<string, { count: number; trending: boolean }> = {
    'Genii Magazine': { count: 3, trending: true },
    'Magicseen': { count: 2, trending: true },
    'VANISH Magazine': { count: 2, trending: false },
    'The Linking Ring': { count: 1, trending: false },
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPublications));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [savedPublications]);

  const getPublicationTypeTokens = (type?: string) =>
    (type ?? 'Publication')
      .split('/')
      .map(token => token.trim())
      .filter(Boolean);

  const getPublicationPublisher = (pub: typeof publications[number]) => {
    const description = pub.description.toLowerCase();

    if (pub.name === 'Genii Magazine') return 'Genii Corporation';
    if (description.includes('international brotherhood of magicians')) return 'International Brotherhood of Magicians';
    if (description.includes('society of american magicians')) return 'Society of American Magicians';
    if (description.includes('conjuring arts research center')) return 'Conjuring Arts Research Center';
    if (pub.name === 'Reel Magic Magazine') return 'Reel Magic';
    if (pub.name === 'VANISH Magazine') return 'VANISH Magazine';
    if (pub.name === 'Magicseen') return 'Magicseen';
    if (pub.name === 'MAGIC Magazine') return 'Stan Allen / MAGIC Magazine';
    return 'Magic Publication';
  };

  const getSortRank = (name: string, order: string[]) => {
    const index = order.indexOf(name);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  const toggleSavePublication = (name: string) => {
    setSavedPublications(prev =>
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    );
  };

  const discussWithAI = (publicationName: string) => {
    const prompt = `Tell me about the history and influence of ${publicationName} in the magic community.`;
    alert(`AI Assistant Prompt:\n\n${prompt}`);
  };

  const q = search.trim().toLowerCase();

  const filteredPublications = [...publications]
    .filter(pub => {
      const matchesFilter =
        filter === 'all' || getPublicationTypeTokens(pub.type).some(token => token.toLowerCase() === filter);

      if (!matchesFilter) return false;
      if (!q) return true;

      const haystack = [pub.name, pub.description, getPublicationPublisher(pub)].join(' ').toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return getSortRank(a.name, newestOrder) - getSortRank(b.name, newestOrder) || a.name.localeCompare(b.name);
      }

      if (sortBy === 'popular') {
        return getSortRank(a.name, mostPopularOrder) - getSortRank(b.name, mostPopularOrder) || a.name.localeCompare(b.name);
      }

      return a.name.localeCompare(b.name);
    });

  const editorPicks = editorPickNames
    .map(name => publications.find(pub => pub.name === name))
    .filter((pub): pub is typeof publications[number] => Boolean(pub));

  const savedResearchShelf = savedPublications
    .map(name => publications.find(pub => pub.name === name))
    .filter((pub): pub is typeof publications[number] => Boolean(pub));

  const getPublicationBadgeClass = (label: string) => {
    switch (label.toLowerCase()) {
      case 'video':
        return 'border-purple-500/30 bg-purple-500/10 text-purple-200';
      case 'research':
        return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200';
      case 'archive':
        return 'border-slate-500/40 bg-slate-500/10 text-slate-200';
      default:
        return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200';
    }
  };

  const getPublicationThumbnail = (type?: string) => {
    const lowerType = (type ?? '').toLowerCase();

    if (lowerType.includes('video')) {
      return {
        icon: '▶',
        label: 'Video magazine',
        accent: 'from-purple-500/25 via-fuchsia-500/10 to-slate-900/40',
      };
    }

    if (lowerType.includes('research')) {
      return {
        icon: '✦',
        label: 'Research journal',
        accent: 'from-cyan-500/25 via-sky-500/10 to-slate-900/40',
      };
    }

    if (lowerType.includes('archive')) {
      return {
        icon: '⌘',
        label: 'Archive collection',
        accent: 'from-slate-500/25 via-slate-400/10 to-slate-900/40',
      };
    }

    return {
      icon: '🎩',
      label: 'Magic publication',
      accent: 'from-yellow-500/20 via-amber-500/10 to-slate-900/40',
    };
  };

  const featuredTypeTokens = getPublicationTypeTokens(featuredPublication?.type);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-5">
      <div className="animate-fade-in space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Magic Publications</h2>
          <p className="text-slate-400 max-w-3xl">
            Essential reading for the modern magician. Stay informed on new effects, theory, and community news.
          </p>
        </div>

        {featuredPublication ? (
          <div className="relative overflow-hidden rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-slate-950/95 p-5 md:p-6 shadow-[0_0_30px_rgba(15,23,42,0.35)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(234,179,8,0.18),transparent_35%)] pointer-events-none" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="h-20 w-16 shrink-0 rounded-xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/20 via-amber-500/10 to-slate-900/60 flex items-center justify-center text-3xl shadow-inner shadow-yellow-500/10">
                  🎩
                </div>
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/25 bg-yellow-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-yellow-200/90">
                    Featured Publication
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold bg-gradient-to-r from-yellow-100 via-amber-300 to-yellow-100 bg-clip-text text-transparent">
                      {featuredPublication.name}
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm md:text-base text-slate-300">
                      {featuredPublication.name === 'Genii Magazine'
                        ? 'The longest running magazine in magic and a cornerstone resource for performers, historians, and creators.'
                        : featuredPublication.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {featuredTypeTokens.map(label => (
                      <span
                        key={label}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border ${getPublicationBadgeClass(label)}`}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                <a
                  href={featuredPublication.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800/80"
                >
                  Read More
                </a>
                {featuredPublication.url ? (
                  <a
                    href={featuredPublication.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm font-medium text-yellow-100 transition hover:border-yellow-400/50 hover:bg-yellow-500/15"
                    title="Open in a new tab"
                  >
                    Visit Site <span aria-hidden="true">↗</span>
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/35 p-4 md:p-5 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <SearchIcon className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search publications..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 py-2.5 pl-10 pr-3 text-sm text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20"
              />
            </div>

            <div className="flex items-center gap-2 self-start lg:self-auto">
              <label htmlFor="publication-sort" className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                Sort By
              </label>
              <select
                id="publication-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'alphabetical' | 'newest' | 'popular')}
                className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20"
              >
                <option value="alphabetical">Alphabetical</option>
                <option value="newest">Newest</option>
                <option value="popular">Most Popular</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {publicationFilters.map(option => {
              const isActive = filter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilter(option.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    isActive
                      ? 'border-yellow-400/40 bg-yellow-500/15 text-yellow-100 shadow-[0_0_16px_rgba(234,179,8,0.14)]'
                      : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-500 hover:bg-slate-800/80'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {savedResearchShelf.length > 0 ? (
          <div className="rounded-2xl border border-yellow-500/15 bg-gradient-to-br from-yellow-500/5 via-slate-900/50 to-slate-950/50 p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-yellow-100">Saved for Research</h3>
                <p className="mt-1 text-sm text-slate-400">Your bookmarked publications are ready for deeper study and AI discussion.</p>
              </div>
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                {savedResearchShelf.length} saved
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {savedResearchShelf.map(pub => {
                const mention = wireMentions[pub.name];
                return (
                  <div
                    key={`saved-${pub.name}`}
                    className="min-w-[220px] rounded-xl border border-slate-700/80 bg-slate-900/50 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-yellow-100">{pub.name}</div>
                        <div className="mt-1 text-xs text-slate-400">{getPublicationPublisher(pub)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleSavePublication(pub.name)}
                        className="text-xs text-slate-400 transition hover:text-yellow-200"
                        title="Remove from research"
                      >
                        Remove
                      </button>
                    </div>

                    {mention ? (
                      <div className="mt-3 text-[11px] text-purple-200">
                        {mention.trending ? 'Trending in Magic Wire' : `Mentioned in ${mention.count} recent Magic Wire stor${mention.count === 1 ? 'y' : 'ies'}`}
                      </div>
                    ) : (
                      <div className="mt-3 text-[11px] text-slate-500">Saved for future research workflows</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/50 via-slate-900/30 to-slate-950/50 p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">Editor&apos;s Picks</h3>
              <p className="mt-1 text-sm text-slate-400">A curated starting shelf for modern magic reading and viewing.</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            {editorPicks.map(pub => {
              const badgeTokens = getPublicationTypeTokens(pub.type);
              const thumbnail = getPublicationThumbnail(pub.type);
              return (
                <div
                  key={`editor-pick-${pub.name}`}
                  className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-3 transition hover:border-purple-400/60 hover:bg-purple-500/5"
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-slate-600/80 bg-gradient-to-br ${thumbnail.accent} text-slate-100 shadow-inner shadow-slate-950/40`}>
                      <span className="text-lg leading-none">{thumbnail.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-yellow-100 truncate">{pub.name}</div>
                      <div className="mt-1 text-xs text-slate-400 line-clamp-2">{pub.description}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {badgeTokens.slice(0, 2).map(label => (
                      <span
                        key={`${pub.name}-pick-${label}`}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${getPublicationBadgeClass(label)}`}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
              {filteredPublications.length} publication{filteredPublications.length === 1 ? '' : 's'} shown
            </div>
            {q ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-xs text-slate-400 transition hover:text-slate-200"
              >
                Clear search
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPublications.map(pub => {
              const badgeTokens = getPublicationTypeTokens(pub.type);
              const thumbnail = getPublicationThumbnail(pub.type);
              const isSaved = savedPublications.includes(pub.name);
              const mention = wireMentions[pub.name];

              return (
                <div
                  key={pub.name}
                  className="group overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-400 hover:bg-purple-500/5 hover:shadow-[0_12px_40px_rgba(76,29,149,0.18)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-4">
                      <div className={`flex h-20 w-16 shrink-0 flex-col items-center justify-center rounded-xl border border-slate-600/80 bg-gradient-to-br ${thumbnail.accent} text-slate-100 shadow-inner shadow-slate-950/40`}>
                        <span className="text-2xl leading-none">{thumbnail.icon}</span>
                        <span className="mt-2 px-2 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-300/90">
                          {thumbnail.label}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-lg bg-gradient-to-r from-yellow-200 via-amber-300 to-yellow-200 bg-clip-text text-transparent">
                          {pub.name}
                        </h3>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          {getPublicationPublisher(pub)}
                        </p>
                        <p className="mt-2 text-sm text-slate-400 line-clamp-3">{pub.description}</p>
                      </div>
                    </div>

                    {mention?.trending ? (
                      <div className="shrink-0 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-purple-200">
                        Trending in Magic Wire
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {badgeTokens.map(label => (
                      <span
                        key={`${pub.name}-${label}`}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border ${getPublicationBadgeClass(label)}`}
                      >
                        {label}
                      </span>
                    ))}
                  </div>

                  {mention ? (
                    <div className="mt-3 text-xs text-slate-400">
                      {mention.trending
                        ? `Mentioned in ${mention.count} recent Magic Wire stories`
                        : `Mentioned in ${mention.count} recent Magic Wire stor${mention.count === 1 ? 'y' : 'ies'}`}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-slate-500">
                      No recent Magic Wire mentions yet
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggleSavePublication(pub.name)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs transition ${
                        isSaved
                          ? 'border-yellow-500/35 bg-yellow-500/10 text-yellow-200'
                          : 'border-slate-600 bg-slate-900/35 text-slate-300 hover:border-yellow-500/30 hover:text-yellow-200'
                      }`}
                      title="Save for research"
                    >
                      <span aria-hidden="true">{isSaved ? '★' : '☆'}</span>
                      Save for Research
                    </button>

                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => discussWithAI(pub.name)}
                        className="inline-flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs text-purple-200 transition hover:border-purple-400/40 hover:bg-purple-500/20"
                      >
                        Discuss with AI
                      </button>

                      {pub.url ? (
                        <a
                          href={pub.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-yellow-500/25 bg-slate-900/40 px-3 py-1.5 text-xs text-yellow-200 transition hover:border-yellow-400/40 hover:bg-slate-900/70 hover:text-yellow-100"
                          title="Open in a new tab"
                        >
                          Visit site <span aria-hidden="true">↗</span>
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredPublications.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/35 p-6 text-center">
              <div className="text-sm font-medium text-slate-300">No publications matched your search.</div>
              <div className="mt-1 text-sm text-slate-500">Try a different keyword, category, or sort option.</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};




const CommunityTab: React.FC = () => {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'All' | 'Forums' | 'Clubs' | 'Conventions' | 'Organizations'>('All');
  const COMMUNITY_FOLLOW_STORAGE_KEY = 'magic-community-following';
  const COMMUNITY_CONVENTION_INTEREST_STORAGE_KEY = 'magic-community-convention-interest';
  const COMMUNITY_NOTES_STORAGE_KEY = 'magic-community-networking-notes';
  const [followedCommunities, setFollowedCommunities] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(COMMUNITY_FOLLOW_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [interestedConventions, setInterestedConventions] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(COMMUNITY_CONVENTION_INTEREST_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [communityNotes, setCommunityNotes] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(COMMUNITY_NOTES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [performerType, setPerformerType] = useState<'beginner' | 'hobbyist' | 'working pro' | 'mentalist' | 'kids performer' | 'close-up performer'>('beginner');
  type CommunitySectionKey = 'directory' | 'curated' | 'utility' | 'online' | 'clubs' | 'conventions';
  type CuratedSectionKey = 'featured' | 'editors' | 'beginner' | 'pro' | 'spotlight';
  const [sectionOpen, setSectionOpen] = useState<Record<CommunitySectionKey, boolean>>({
    directory: true,
    curated: true,
    utility: false,
    online: false,
    clubs: false,
    conventions: true,
  });
  const [curatedOpen, setCuratedOpen] = useState<Record<CuratedSectionKey, boolean>>({
    featured: true,
    editors: false,
    beginner: false,
    pro: false,
    spotlight: false,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(COMMUNITY_FOLLOW_STORAGE_KEY, JSON.stringify(followedCommunities));
    } catch {
      // no-op
    }
  }, [followedCommunities]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(COMMUNITY_CONVENTION_INTEREST_STORAGE_KEY, JSON.stringify(interestedConventions));
    } catch {
      // no-op
    }
  }, [interestedConventions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(COMMUNITY_NOTES_STORAGE_KEY, JSON.stringify(communityNotes));
    } catch {
      // no-op
    }
  }, [communityNotes]);

  const onlineCommunities = [
    {
      name: 'The Magic Café',
      description: 'The classic online forum with deep threads on sleights, theory, reviews, and pros-only topics.',
      url: 'https://www.themagiccafe.com/',
      category: 'Forums' as const,
      typeLabel: 'Forum',
      region: 'Global',
      audience: 'All magicians',
      badge: 'Community forum',
      isOfficial: false,
      Icon: ChatBubbleIcon,
    },
    {
      name: 'r/Magic (Reddit)',
      description: 'Active community for discussions, recommendations, and sharing resources.',
      url: 'https://www.reddit.com/r/Magic/',
      category: 'Forums' as const,
      typeLabel: 'Forum',
      region: 'Global',
      audience: 'Beginners to pros',
      badge: 'Open community',
      isOfficial: false,
      Icon: UsersIcon,
    },
    {
      name: 'Genii Forum',
      description: 'Discussion board connected to Genii Magazine, with thoughtful threads and industry news.',
      url: 'https://forums.geniimagazine.com/',
      category: 'Forums' as const,
      typeLabel: 'Forum',
      region: 'Global',
      audience: 'Serious students',
      badge: 'Publisher community',
      isOfficial: true,
      Icon: BookIcon,
    }
  ];

  const clubDirectory = clubs.map(club => {
    const isOrganization =
      club.name.includes('Society') ||
      club.name.includes('Brotherhood') ||
      club.description.toLowerCase().includes('organization');
    const isPrivateClub = club.name.includes('Magic Castle') || club.description.toLowerCase().includes('private club');
    const region =
      club.name.includes('London')
        ? 'United Kingdom'
        : club.description.includes('New York City')
          ? 'North America'
          : club.description.includes('Hollywood, California')
            ? 'United States'
            : club.description.toLowerCase().includes('across the globe') || club.description.toLowerCase().includes('worldwide')
              ? 'Global'
              : 'International';

    return {
      ...club,
      category: isOrganization ? ('Organizations' as const) : ('Clubs' as const),
      typeLabel: isOrganization ? 'Organization' : 'Club',
      region,
      audience: isPrivateClub ? 'Working magicians' : isOrganization ? 'Members & chapters' : 'Members & guests',
      badge: isPrivateClub ? 'Private club' : isOrganization ? 'Official organization' : 'Member network',
      isOfficial: isOrganization,
      Icon: isOrganization ? UsersCogIcon : UsersIcon,
    };
  });

  const conventionDirectory = conventions.map(convention => {
    const lower = `${convention.name} ${convention.description}`.toLowerCase();
    const region =
      lower.includes('ohio')
        ? 'Midwest U.S.'
        : lower.includes('england') || lower.includes('blackpool')
          ? 'United Kingdom'
          : lower.includes('las vegas')
            ? 'West U.S.'
            : lower.includes('michigan')
              ? 'Midwest U.S.'
              : lower.includes('north american')
                ? 'North America'
                : 'International';

    return {
      ...convention,
      category: 'Conventions' as const,
      typeLabel: 'Convention',
      region,
      audience: lower.includes('friendly atmosphere') || lower.includes('fun, fellowship') ? 'Beginners to pros' : 'Performers & enthusiasts',
      badge: lower.includes('largest') || lower.includes('star-studded') ? 'Premier event' : 'Annual gathering',
      isOfficial: true,
      Icon: StageCurtainsIcon,
    };
  });

  const normalizedQuery = query.trim().toLowerCase();

  const matchesQuery = (value: string) =>
    normalizedQuery.length === 0 || value.toLowerCase().includes(normalizedQuery);

  const matchesFilter = (category: 'Forums' | 'Clubs' | 'Conventions' | 'Organizations') =>
    activeFilter === 'All' || activeFilter === category;

  const filteredOnlineCommunities = onlineCommunities.filter(item =>
    matchesFilter(item.category) &&
    matchesQuery(`${item.name} ${item.description} ${item.category} ${item.typeLabel} ${item.region} ${item.audience} ${item.badge}`)
  );

  const filteredClubs = clubDirectory.filter(club =>
    matchesFilter(club.category) &&
    matchesQuery(`${club.name} ${club.description} ${club.category} ${club.typeLabel} ${club.region} ${club.audience} ${club.badge}`)
  );

  const filteredConventions = conventionDirectory.filter(convention =>
    matchesFilter(convention.category) &&
    matchesQuery(`${convention.name} ${convention.description} ${convention.date ?? ''} ${convention.category} ${convention.typeLabel} ${convention.region} ${convention.audience} ${convention.badge}`)
  );

  const totalMatches = filteredOnlineCommunities.length + filteredClubs.length + filteredConventions.length;
  const filterChips: Array<'All' | 'Forums' | 'Clubs' | 'Conventions' | 'Organizations'> = ['All', 'Forums', 'Clubs', 'Conventions', 'Organizations'];

  type CommunityDirectoryItem =
    | (typeof onlineCommunities)[number]
    | (typeof clubDirectory)[number]
    | (typeof conventionDirectory)[number];

  const toggleFollowCommunity = (name: string) => {
    setFollowedCommunities(prev =>
      prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name]
    );
  };

  const toggleConventionInterest = (name: string) => {
    setInterestedConventions(prev =>
      prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name]
    );
  };

  const updateNetworkingNote = (name: string, value: string) => {
    setCommunityNotes(prev => ({ ...prev, [name]: value }));
  };

  const discussCommunityWithAI = (item: CommunityDirectoryItem) => {
    const prompt = `Help me evaluate ${item.name} for my magic networking strategy. Explain who it is best for, what kind of value it offers, whether it connects more strongly to Magic Wire news, Publications research, or ongoing networking, and give me one practical next step.`;
    alert(`AI Assistant Prompt:

${prompt}`);
  };

  const getCommunitySignal = (item: CommunityDirectoryItem) => {
    if (item.name === 'Blackpool Magic Convention' || item.name === 'FISM') {
      return 'Community Spotlight';
    }
    if (item.name === 'The Magic Café' || item.name === 'Genii Forum') {
      return 'Trending in Magic Wire';
    }
    if (item.isOfficial) {
      return 'Trusted Network';
    }
    return 'Good Place to Start';
  };

  const getCommunityWhyItMattersSummary = (item: CommunityDirectoryItem) => {
    if (item.category === 'Conventions') {
      return 'Useful for tracking event momentum, networking opportunities, and where the broader magic conversation is gathering in person.';
    }
    if (item.category === 'Organizations') {
      return 'Useful for building long-term credibility, structure, and a stronger professional network inside the magic ecosystem.';
    }
    if (item.category === 'Clubs') {
      return 'Useful for staying connected to peers, local meetups, and real-world performer relationships beyond the app.';
    }
    return 'Useful for questions, discovery, peer feedback, and seeing which ideas and topics the community is paying attention to.';
  };

  const getCommunityWorkflowLinks = (item: CommunityDirectoryItem) => {
    if (item.category === 'Conventions') return ['Magic Wire', 'Research', 'Networking'];
    if (item.category === 'Organizations') return ['Publications', 'Research', 'Networking'];
    if (item.category === 'Clubs') return ['Research', 'Networking'];
    return ['Magic Wire', 'Publications', 'Research'];
  };

  const visibleCommunityItems: CommunityDirectoryItem[] = [
    ...filteredOnlineCommunities,
    ...filteredClubs,
    ...filteredConventions,
  ];

  const getVisibleItemByName = (name: string) => visibleCommunityItems.find(item => item.name === name);
  const allCommunityItems: CommunityDirectoryItem[] = [...onlineCommunities, ...clubDirectory, ...conventionDirectory];
  const getAnyCommunityItemByName = (name: string) => allCommunityItems.find(item => item.name === name);

  const savedCommunityItems = followedCommunities
    .map(getAnyCommunityItemByName)
    .filter((item): item is CommunityDirectoryItem => Boolean(item));

  const interestedConventionItems = interestedConventions
    .map(name => conventionDirectory.find(item => item.name === name))
    .filter((item): item is (typeof conventionDirectory)[number] => Boolean(item));

  const performerTypeRecommendations: Record<'beginner' | 'hobbyist' | 'working pro' | 'mentalist' | 'kids performer' | 'close-up performer', string[]> = {
    'beginner': ['r/Magic (Reddit)', 'Society of American Magicians (SAM)', "Abbott's Magic Get-Together"],
    'hobbyist': ['The Magic Café', 'Genii Forum', 'International Brotherhood of Magicians (IBM)'],
    'working pro': ['The Magic Castle', 'International Brotherhood of Magicians (IBM)', 'FISM'],
    'mentalist': ['Genii Forum', 'The Magic Café', 'FISM'],
    'kids performer': ["Abbott's Magic Get-Together", 'Society of American Magicians (SAM)', 'The Magic Café'],
    'close-up performer': ['The Magic Castle', 'The Magic Café', 'Blackpool Magic Convention'],
  };

  const recommendedCommunities = performerTypeRecommendations[performerType]
    .map(getAnyCommunityItemByName)
    .filter((item): item is CommunityDirectoryItem => Boolean(item));

  const featuredCommunity = getVisibleItemByName('The Magic Café') ?? visibleCommunityItems[0] ?? null;
  const conventionSpotlight =
    getVisibleItemByName('Blackpool Magic Convention') ??
    getVisibleItemByName('FISM') ??
    filteredConventions[0] ??
    null;

  const editorsPickNames = ['The Magic Café', 'Genii Forum', 'The Magic Castle', 'Blackpool Magic Convention'];
  const beginnerPickNames = ['r/Magic (Reddit)', 'Society of American Magicians (SAM)', "Abbott's Magic Get-Together"];
  const proNetworkPickNames = ['The Magic Castle', 'International Brotherhood of Magicians (IBM)', 'FISM'];

  const editorPicks = editorsPickNames
    .map(getVisibleItemByName)
    .filter((item): item is CommunityDirectoryItem => Boolean(item));

  const beginnerFriendlyPicks = beginnerPickNames
    .map(getVisibleItemByName)
    .filter((item): item is CommunityDirectoryItem => Boolean(item));

  const professionalNetworkPicks = proNetworkPickNames
    .map(getVisibleItemByName)
    .filter((item): item is CommunityDirectoryItem => Boolean(item));

  const getCommunityWhyItMatters = (item: CommunityDirectoryItem) => {
    switch (item.name) {
      case 'The Magic Café':
        return 'Worth joining for the depth of archived discussion and the sheer number of working magicians who still reference it.';
      case 'Genii Forum':
        return 'Worth joining for thoughtful conversations that often connect magazine-level insight with real performer experience.';
      case 'r/Magic (Reddit)':
        return 'Worth joining for easy discovery, quick questions, and a lower-friction entry point for newer magicians.';
      case 'The Magic Castle':
        return 'Worth tracking because it represents one of the strongest professional identity and networking signals in magic.';
      case 'International Brotherhood of Magicians (IBM)':
        return 'Worth joining for chapter-based networking, education, and broad access to established performers.';
      case 'Society of American Magicians (SAM)':
        return 'Worth joining for legacy, structure, and connections to a wide national network of magicians.';
      case 'Blackpool Magic Convention':
        return 'Worth tracking because it is one of the largest and most visible destination events in the magic world.';
      case 'FISM':
        return 'Worth tracking because it represents elite international visibility, innovation, and serious peer benchmarking.';
      default:
        return item.category === 'Conventions'
          ? 'Worth tracking for in-person inspiration, networking, and exposure to the broader magic ecosystem.'
          : item.category === 'Organizations'
            ? 'Worth joining for structure, reputation, and longer-term community connections.'
            : 'Worth exploring for community access, idea flow, and stronger connection to the wider magic scene.';
    }
  };

  const renderMetaPill = (label: string, value: string) => (
    <div className="rounded-lg border border-slate-700/60 bg-slate-950/35 px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-xs text-slate-200">{value}</div>
    </div>
  );

  const toggleSection = (key: CommunitySectionKey) => {
    setSectionOpen(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleCuratedSection = (key: CuratedSectionKey) => {
    setCuratedOpen(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAllCommunityPanels = () => {
    setSectionOpen({
      directory: true,
      curated: true,
      utility: true,
      online: true,
      clubs: true,
      conventions: true,
    });
    setCuratedOpen({ featured: true, editors: true, beginner: true, pro: true, spotlight: true });
  };

  const collapseAllCommunityPanels = () => {
    setSectionOpen({
      directory: true,
      curated: true,
      utility: false,
      online: false,
      clubs: false,
      conventions: false,
    });
    setCuratedOpen({ featured: true, editors: false, beginner: false, pro: false, spotlight: false });
  };

  const renderPanelToggle = (isOpen: boolean) => (
    <span className="ml-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700/70 bg-slate-950/40 text-sm text-slate-300">
      {isOpen ? '−' : '+'}
    </span>
  );

  const renderSectionHeader = (
    eyebrow: string,
    title: string,
    description: string,
    isOpen: boolean,
    onClick: () => void,
    meta?: string,
    accent: 'purple' | 'amber' = 'purple'
  ) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-4 text-left transition hover:border-slate-500/70 hover:bg-slate-900/45 ${accent === 'amber' ? 'border-amber-500/20 bg-gradient-to-br from-amber-500/8 via-slate-900/85 to-slate-950' : 'border-slate-700/60 bg-slate-900/35'}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className={`text-xs font-semibold uppercase tracking-[0.2em] ${accent === 'amber' ? 'text-amber-200/80' : 'text-purple-300/80'}`}>{eyebrow}</div>
          <div className="mt-1 text-lg font-semibold text-slate-100 md:text-xl">{title}</div>
          <div className="mt-1 text-sm text-slate-500">{description}</div>
        </div>
        <div className="flex items-center justify-between gap-3 md:justify-end">
          {meta ? <div className="text-xs text-slate-500">{meta}</div> : <span />}
          {renderPanelToggle(isOpen)}
        </div>
      </div>
    </button>
  );

  const renderCommunityCard = (
    item: CommunityDirectoryItem,
    options: { tone?: 'featured' | 'standard'; visitLabel?: string; showDateBadge?: boolean } = {}
  ) => {
    const { tone = 'standard', visitLabel, showDateBadge = false } = options;
    const Icon = item.Icon;
    const isFeatured = tone === 'featured';
    const signal = getCommunitySignal(item);
    const workflowLinks = getCommunityWorkflowLinks(item);
    const isFollowing = followedCommunities.includes(item.name);
    const resolvedVisitLabel = visitLabel ?? (item.category === 'Conventions' ? 'Visit event' : item.category === 'Forums' ? 'Visit community' : 'Visit organization');

    return (
      <div
        key={`${tone}-${item.name}`}
        className={`group rounded-2xl border p-4 transition-all duration-200 ${
          isFeatured
            ? 'border-purple-500/30 bg-gradient-to-br from-purple-500/18 via-slate-900/92 to-slate-950/95 shadow-[0_18px_60px_rgba(88,28,135,0.22)] hover:-translate-y-1 hover:border-purple-400/50'
            : 'border-slate-700/60 bg-slate-900/40 shadow-sm hover:-translate-y-1 hover:border-purple-500/35 hover:bg-slate-900/55 hover:shadow-[0_18px_50px_rgba(15,23,42,0.35)]'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-purple-200 shadow-inner ${
            isFeatured
              ? 'border-purple-400/30 bg-gradient-to-br from-purple-400/25 via-slate-900/90 to-slate-950'
              : 'border-purple-500/20 bg-gradient-to-br from-purple-500/20 via-slate-900/90 to-slate-950'
          }`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-200">{signal}</span>
              <span className="inline-flex items-center rounded-full border border-slate-700/60 bg-slate-950/25 px-2.5 py-1 text-[11px] text-purple-200">{item.badge}</span>
              <span className="inline-flex items-center rounded-full border border-slate-700/60 bg-slate-950/25 px-2.5 py-1 text-[11px] text-slate-300">{item.category}</span>
              {item.isOfficial && (
                <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">Official</span>
              )}
              {showDateBadge && 'date' in item && item.date && (
                <span className="inline-flex items-center rounded-full border border-slate-700/60 bg-slate-950/25 px-2.5 py-1 text-[11px] text-slate-300">{item.date}</span>
              )}
            </div>
            <h4 className={`mt-3 font-bold text-slate-100 transition-colors group-hover:text-white ${isFeatured ? 'text-2xl font-cinzel' : 'text-base md:text-lg'}`}>
              {item.name}
            </h4>
            <p className={`mt-2 text-sm leading-6 ${isFeatured ? 'text-slate-300' : 'text-slate-400 line-clamp-3'}`}>
              {item.description}
            </p>
          </div>
        </div>

        <div className={`mt-4 grid gap-2 ${isFeatured ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-3'}`}>
          {renderMetaPill('Type', item.typeLabel)}
          {renderMetaPill('Region', item.region)}
          {renderMetaPill('Audience', item.audience)}
        </div>

        <div className={`mt-4 rounded-xl border px-3.5 py-3 ${
          isFeatured ? 'border-purple-500/25 bg-slate-950/35' : 'border-slate-700/60 bg-slate-950/25'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-purple-300/80">Why it matters</div>
            <div className="flex flex-wrap gap-1.5">
              {workflowLinks.map(link => (
                <span key={`${item.name}-${link}`} className="inline-flex items-center rounded-full border border-slate-700/60 bg-slate-900/65 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                  {link}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-300">{getCommunityWhyItMatters(item)}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">{getCommunityWhyItMattersSummary(item)}</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => discussCommunityWithAI(item)}
            className="inline-flex items-center gap-1 rounded-xl border border-purple-500/30 bg-purple-500/12 px-3.5 py-2 text-xs font-semibold text-purple-100 transition hover:border-purple-400/50 hover:bg-purple-500/18"
          >
            Discuss with AI
          </button>
          <button
            type="button"
            onClick={() => toggleFollowCommunity(item.name)}
            className={`inline-flex items-center gap-1 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
              isFollowing
                ? 'border-yellow-500/35 bg-yellow-500/10 text-yellow-200'
                : 'border-slate-600 bg-slate-900/35 text-slate-300 hover:border-yellow-500/30 hover:text-yellow-200'
            }`}
          >
            <span aria-hidden="true">{isFollowing ? '★' : '☆'}</span>
            {isFollowing ? 'Following' : 'Follow'}
          </button>
          {item.category === 'Conventions' && (
            <button
              type="button"
              onClick={() => toggleConventionInterest(item.name)}
              className={`inline-flex items-center gap-1 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                interestedConventions.includes(item.name)
                  ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-200'
                  : 'border-slate-600 bg-slate-900/35 text-slate-300 hover:border-cyan-500/30 hover:text-cyan-200'
              }`}
            >
              <span aria-hidden="true">{interestedConventions.includes(item.name) ? '✓' : '+'}</span>
              {interestedConventions.includes(item.name) ? 'Interested' : 'Track event'}
            </button>
          )}
          <a
            href={(item as any).url}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
              isFeatured
                ? 'border-purple-400/45 bg-purple-500/18 text-purple-100 hover:border-purple-300/60 hover:bg-purple-500/24'
                : 'border-purple-500/30 bg-purple-500/12 text-purple-100 hover:border-purple-400/50 hover:bg-purple-500/18'
            }`}
          >
            {resolvedVisitLabel} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    );
  };


  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-5">
      <div className="animate-fade-in space-y-8 md:space-y-10">
        <div className="flex flex-col gap-4 pt-1 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-slate-200 font-cinzel md:text-4xl">Magic Community</h2>
            <p className="max-w-3xl text-slate-400">
              Connect with peers, explore organizations, and discover major conventions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <button
              type="button"
              onClick={expandAllCommunityPanels}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-900/35 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-purple-400/40 hover:text-white"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAllCommunityPanels}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-900/35 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500/70 hover:text-white"
            >
              Collapse All
            </button>
          </div>
        </div>

        <section className="space-y-3">
          {renderSectionHeader(
            'Events and Destination Gatherings',
            'Popular Magic Conventions',
            'Open the event layer when you want destination gatherings, convention research, and travel-worthy opportunities.',
            sectionOpen.conventions,
            () => toggleSection('conventions'),
            `${filteredConventions.length} shown`
          )}

          {sectionOpen.conventions && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredConventions.map(convention => renderCommunityCard(convention, { visitLabel: 'Visit event', showDateBadge: true }))}
              </div>

              {(query || activeFilter !== 'All') && filteredConventions.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/35 p-5 text-center text-sm text-slate-500">
                  No conventions match the current search or filter.
                </div>
              )}
            </>
          )}
        </section>


        <section className="max-w-5xl mx-auto space-y-3">
          {renderSectionHeader(
            'Community Directory',
            'Search the full magic community in one place',
            'Browse forums, clubs, organizations, and conventions without leaving the page.',
            sectionOpen.directory,
            () => toggleSection('directory'),
            `${totalMatches} result${totalMatches === 1 ? '' : 's'} shown${followedCommunities.length > 0 ? ` • ${followedCommunities.length} following` : ''}`
          )}

          {sectionOpen.directory && (
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/35 p-4 md:p-5 shadow-sm">
              <div className="flex flex-col gap-4">
                <div className="relative">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search communities, clubs, organizations, or conventions…"
                  className="w-full rounded-xl bg-slate-950/40 border border-slate-700/60 px-4 py-3 pl-11 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/50"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  <SearchIcon className="w-4 h-4" />
                </div>
                {query.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                    title="Clear"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {filterChips.map(chip => {
                  const isActive = activeFilter === chip;
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setActiveFilter(chip)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        isActive
                          ? 'border-purple-400/50 bg-purple-500/20 text-purple-100 shadow-[0_0_0_1px_rgba(168,85,247,0.15)]'
                          : 'border-slate-700/70 bg-slate-950/30 text-slate-300 hover:border-slate-500/70 hover:text-white'
                      }`}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
            </div>
            </div>
          )}
        </section>

        {(featuredCommunity || conventionSpotlight || editorPicks.length > 0 || beginnerFriendlyPicks.length > 0 || professionalNetworkPicks.length > 0) && (
          <section className="max-w-6xl mx-auto space-y-3">
            {renderSectionHeader(
              'Curated Community Layer',
              'Guided places to start, connect, and show up',
              'Community now surfaces a more editorial view of the magic world so users can discover high-value groups and events faster, not just scroll a static directory.',
              sectionOpen.curated,
              () => toggleSection('curated')
            )}

            {sectionOpen.curated && (
              <>
            {featuredCommunity && (
              <div className="space-y-3">
                {renderSectionHeader(
                  'Featured Community',
                  'A strong first stop for conversation and discovery',
                  'Lead with one standout place to connect before exploring the wider directory.',
                  curatedOpen.featured,
                  () => toggleCuratedSection('featured'),
                  'Editorial pick'
                )}
                {curatedOpen.featured && renderCommunityCard(featuredCommunity, { tone: 'featured', visitLabel: 'Visit community' })}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-6">
              <div className="space-y-6">
                {editorPicks.length > 0 && (
                  <div className="space-y-3">
                    {renderSectionHeader(
                      'Editor’s Picks',
                      'Recommended places to join or watch closely',
                      'A tighter short list of communities and events worth your immediate attention.',
                      curatedOpen.editors,
                      () => toggleCuratedSection('editors')
                    )}
                    {curatedOpen.editors && (
                      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/35 p-4 md:p-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {editorPicks.map(item => renderCommunityCard(item, { visitLabel: item.category === 'Conventions' ? 'Visit event' : item.category === 'Forums' ? 'Visit community' : 'Visit organization', showDateBadge: item.category === 'Conventions' }))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {professionalNetworkPicks.length > 0 && (
                  <div className="space-y-3">
                    {renderSectionHeader(
                      'Professional Network Picks',
                      'High-value communities for serious networking',
                      'Keep a focused list of stronger relationship and visibility opportunities.',
                      curatedOpen.pro,
                      () => toggleCuratedSection('pro')
                    )}
                    {curatedOpen.pro && (
                      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/35 p-4 md:p-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {professionalNetworkPicks.map(item => renderCommunityCard(item, { visitLabel: item.category === 'Conventions' ? 'Visit event' : item.category === 'Forums' ? 'Visit community' : 'Visit organization', showDateBadge: item.category === 'Conventions' }))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                {beginnerFriendlyPicks.length > 0 && (
                  <div className="space-y-3">
                    {renderSectionHeader(
                      'Beginner-Friendly Picks',
                      'Easy entry points into the community',
                      'Good first stops when someone needs lower-friction places to ask, read, and learn.',
                      curatedOpen.beginner,
                      () => toggleCuratedSection('beginner')
                    )}
                    {curatedOpen.beginner && (
                      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/35 p-4 md:p-5">
                        <div className="space-y-4">
                          {beginnerFriendlyPicks.map(item => renderCommunityCard(item, { visitLabel: item.category === 'Conventions' ? 'Visit event' : item.category === 'Forums' ? 'Visit community' : 'Visit organization', showDateBadge: item.category === 'Conventions' }))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {conventionSpotlight && (
                  <div className="space-y-3">
                    {renderSectionHeader(
                      'Convention Spotlight',
                      'One event worth paying attention to',
                      'Call out a standout gathering without forcing the full card open by default.',
                      curatedOpen.spotlight,
                      () => toggleCuratedSection('spotlight'),
                      'Spotlight',
                      'amber'
                    )}
                    {curatedOpen.spotlight && (
                      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-slate-900/85 to-slate-950 p-4 md:p-5 shadow-[0_18px_50px_rgba(120,53,15,0.18)]">
                        {renderCommunityCard(conventionSpotlight, { visitLabel: 'Visit event', showDateBadge: true })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
              </>
            )}
          </section>
        )}

        <section className="max-w-6xl mx-auto space-y-3">
          {renderSectionHeader(
            'Community Utility Layer',
            'Turn discovery into a working community plan',
            'Save high-value communities, track conventions you may want to attend, keep lightweight networking notes, and get recommendations shaped to your performer profile.',
            sectionOpen.utility,
            () => toggleSection('utility')
          )}

          {sectionOpen.utility && (
            <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-700/60 bg-slate-900/35 p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Saved Communities Shelf</div>
                    <h4 className="mt-1 text-xl font-bold text-slate-100">Your followed communities and organizations</h4>
                  </div>
                  <div className="text-xs text-slate-500">{savedCommunityItems.length} saved</div>
                </div>
                {savedCommunityItems.length > 0 ? (
                  <div className="space-y-4">
                    {savedCommunityItems.map(item => (
                      <div key={`saved-${item.name}`} className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-base font-semibold text-slate-100">{item.name}</div>
                              <span className="inline-flex items-center rounded-full border border-slate-700/60 bg-slate-900/65 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300">{item.category}</span>
                              <span className="inline-flex items-center rounded-full border border-slate-700/60 bg-slate-900/65 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300">{item.region}</span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
                          </div>
                          <a
                            href={(item as any).url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/12 px-3.5 py-2 text-xs font-semibold text-purple-100 transition hover:border-purple-400/50 hover:bg-purple-500/18"
                          >
                            Visit <span aria-hidden="true">↗</span>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-950/25 p-4 text-sm text-slate-400">
                    Follow a few communities above and they will appear here as your quick-access shelf.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-700/60 bg-slate-900/35 p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Networking Notes</div>
                    <h4 className="mt-1 text-xl font-bold text-slate-100">Keep quick notes on who to revisit, join, or research</h4>
                  </div>
                  <div className="text-xs text-slate-500">Persistent in this browser</div>
                </div>
                {savedCommunityItems.length > 0 ? (
                  <div className="space-y-4">
                    {savedCommunityItems.map(item => (
                      <div key={`note-${item.name}`} className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-100">{item.name}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{item.category} • {item.audience}</div>
                          </div>
                        </div>
                        <textarea
                          value={communityNotes[item.name] ?? ''}
                          onChange={(e) => updateNetworkingNote(item.name, e.target.value)}
                          placeholder="Add a quick note: who to contact, why it matters, which publication or Magic Wire thread to revisit..."
                          className="mt-3 min-h-[88px] w-full rounded-xl border border-slate-700/60 bg-slate-950/40 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/50"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-950/25 p-4 text-sm text-slate-400">
                    Save a few communities first, then use this area as a lightweight networking notebook.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-700/60 bg-slate-900/35 p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Convention Interest List</div>
                    <h4 className="mt-1 text-xl font-bold text-slate-100">Events you may want to watch or attend</h4>
                  </div>
                  <div className="text-xs text-slate-500">{interestedConventionItems.length} tracked</div>
                </div>
                {interestedConventionItems.length > 0 ? (
                  <div className="space-y-3">
                    {interestedConventionItems.map(item => (
                      <div key={`interest-${item.name}`} className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-100">{item.name}</div>
                            {'date' in item && item.date && <div className="mt-1 text-xs uppercase tracking-[0.16em] text-cyan-200">{item.date}</div>}
                            <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleConventionInterest(item.name)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900/35 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-500/30 hover:text-cyan-200"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-950/25 p-4 text-sm text-slate-400">
                    Use the Track event button on convention cards to build your interest list.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-700/60 bg-slate-900/35 p-4 md:p-5">
                <div className="mb-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recommendations by Performer Type</div>
                  <h4 className="mt-1 text-xl font-bold text-slate-100">Suggested places to engage next</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['beginner', 'hobbyist', 'working pro', 'mentalist', 'kids performer', 'close-up performer'] as const).map(type => {
                    const isActive = performerType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setPerformerType(type)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${
                          isActive
                            ? 'border-purple-400/50 bg-purple-500/20 text-purple-100 shadow-[0_0_0_1px_rgba(168,85,247,0.15)]'
                            : 'border-slate-700/70 bg-slate-950/30 text-slate-300 hover:border-slate-500/70 hover:text-white'
                        }`}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 space-y-3">
                  {recommendedCommunities.map(item => (
                    <div key={`recommend-${performerType}-${item.name}`} className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-slate-100">{item.name}</div>
                            <span className="inline-flex items-center rounded-full border border-slate-700/60 bg-slate-900/65 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300">{item.category}</span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-400">{getCommunityWhyItMatters(item)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleFollowCommunity(item.name)}
                          className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                            followedCommunities.includes(item.name)
                              ? 'border-yellow-500/35 bg-yellow-500/10 text-yellow-200'
                              : 'border-slate-600 bg-slate-900/35 text-slate-300 hover:border-yellow-500/30 hover:text-yellow-200'
                          }`}
                        >
                          <span aria-hidden="true">{followedCommunities.includes(item.name) ? '★' : '☆'}</span>
                          {followedCommunities.includes(item.name) ? 'Saved' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          )}
        </section>

        <section className="space-y-3">
          {renderSectionHeader(
            'Forums & Discussion Spaces',
            'Online Communities',
            'Open the strongest community forums and discussion spaces when you want live conversation, archives, and peer input.',
            sectionOpen.online,
            () => toggleSection('online'),
            `${filteredOnlineCommunities.length} shown • Links open in a new tab`
          )}

          {sectionOpen.online && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {filteredOnlineCommunities.map(item => renderCommunityCard(item, { visitLabel: 'Visit community' }))}
              </div>

              {(query || activeFilter !== 'All') && filteredOnlineCommunities.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/35 p-5 text-center text-sm text-slate-500">
                  No online communities match the current search or filter.
                </div>
              )}
            </>
          )}
        </section>

        <section className="space-y-3">
          {renderSectionHeader(
            'Membership, Networking, and Official Groups',
            'Major Magic Clubs & Organizations',
            'Open this section when you want official groups, chapters, and stronger long-term community infrastructure.',
            sectionOpen.clubs,
            () => toggleSection('clubs'),
            `${filteredClubs.length} shown`
          )}

          {sectionOpen.clubs && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredClubs.map(club => renderCommunityCard(club, { visitLabel: club.category === 'Organizations' ? 'Visit organization' : 'Visit club' }))}
              </div>

              {(query || activeFilter !== 'All') && filteredClubs.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/35 p-5 text-center text-sm text-slate-500">
                  No clubs or organizations match the current search or filter.
                </div>
              )}
            </>
          )}
        </section>

        {totalMatches === 0 && (
          <section>
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 p-8 text-center">
              <div className="text-sm font-medium text-slate-300">No community results matched your current filters.</div>
              <div className="mt-1 text-sm text-slate-500">Try a broader search term or switch back to All.</div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

const VIEW_TO_TAB_MAP: Record<MagicianView, MagicianTab> = {
    'dashboard': 'chat',
    'chat': 'chat',
    'live-rehearsal': 'chat',
    'video-rehearsal': 'chat',
    'angle-risk': 'chat',
    'visual-brainstorm': 'chat',
    'saved-ideas': 'chat',
    'prop-checklists': 'chat',
    'magic-archives': 'chat',
    'gospel-magic-assistant': 'chat',
    'mentalism-assistant': 'chat',
    'member-management': 'chat',
    'show-feedback': 'chat',
    'patter-engine': 'chat',
    'marketing-campaign': 'chat',
    'contract-generator': 'chat',
    'assistant-studio': 'chat',
    'director-mode': 'chat',
    'persona-simulator': 'chat',
    'client-management': 'chat',
    'illusion-blueprint': 'chat',
    'magic-theory-tutor': 'chat',
    'performance-analytics': 'show-planner',
    'show-planner': 'show-planner',
    'effect-generator': 'effect-generator',
    'identify': 'identify',
    'publications': 'publications',
    'community': 'community',
    'magic-wire': 'magic-wire',
    'global-search': 'search',
    'search': 'search',
    'magic-dictionary': 'magic-dictionary',
    'admin': 'admin',
};

const MAGICIAN_STORAGE_key = 'magician_chat_history';
const MAGICIAN_VIEW_STORAGE_KEY = 'magician_active_view';

const createChatMessage = (role: 'user' | 'model', text: string): ChatMessage => ({
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    role,
    text,
});


const MagicianMode: React.FC<MagicianModeProps> = ({ onBack, user, onUpgrade, onLogout }) => {
  const { shows, clients, feedback, ideas, isLoaded } = useAppState();
  const [isHomeIntroDismissed, setIsHomeIntroDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(HOME_INTRO_DISMISSED_KEY) === 'true';
  });

  const dismissHomeIntro = () => {
    setIsHomeIntroDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(HOME_INTRO_DISMISSED_KEY, 'true');
    }
  };

  const dispatch = useAppDispatch();
  const { showToast } = useToast();

  const isDemoMode = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('demo') === '1' || localStorage.getItem('maw_demo_mode') === 'true';
    } catch {
      return false;
    }
  })();

  const handleExitDemo = () => {
    try { localStorage.removeItem('maw_demo_mode'); } catch {}
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('demo');
      window.history.replaceState({}, '', url.toString());
    } catch {}
    onBack();
    // Ensure the App useEffect runs without demo flags.
    window.location.reload();
  };

  const handleResetDemoData = async () => {
    try {
      clearDemoData();
      seedDemoData();
      await refreshShows(dispatch);
      await refreshClients(dispatch);
      await refreshIdeas(dispatch);
      await refreshFeedback(dispatch);
      showToast('Demo data has been reset.');
    } catch {
      showToast('Unable to reset demo data.');
    }
  };


// --- Data backup reminders (local-first safety) ---
const BACKUP_STALE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const BACKUP_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const [showBackupReminder, setShowBackupReminder] = useState(false);
const [backupReminderMessage, setBackupReminderMessage] = useState('Reminder: Export a backup file to protect your data.');

const handleExportBackup = async () => {
  try {
    await exportData();
    setShowBackupReminder(false);
    showToast('Backup exported.');
  } catch {
    showToast('Unable to export backup.');
  }
};

const handleDismissBackupReminder = () => {
  try { localStorage.setItem('maw_backup_snooze_until', String(Date.now() + BACKUP_SNOOZE_MS)); } catch {}
  setShowBackupReminder(false);
};

useEffect(() => {
  if (isDemoMode) return;

  const hasAnyData =
    (shows?.length || 0) +
    (ideas?.length || 0) +
    (clients?.length || 0) +
    (feedback?.length || 0) > 0;

  if (!hasAnyData) {
    setShowBackupReminder(false);
    return;
  }

  const now = Date.now();
  let lastBackup = 0;
  let snoozeUntil = 0;

  try { lastBackup = parseInt(localStorage.getItem('maw_last_backup_at') || '0', 10) || 0; } catch {}
  try { snoozeUntil = parseInt(localStorage.getItem('maw_backup_snooze_until') || '0', 10) || 0; } catch {}

  if (now < snoozeUntil) {
    setShowBackupReminder(false);
    return;
  }

  const isStale = !lastBackup || (now - lastBackup) > BACKUP_STALE_MS;

  if (isStale) {
    setBackupReminderMessage(
      !lastBackup
        ? 'Reminder: Export a backup file to protect your data.'
        : 'Reminder: Your last backup is older than 14 days. Export a fresh backup.'
    );
    setShowBackupReminder(true);
  } else {
    setShowBackupReminder(false);
  }
}, [isDemoMode, shows?.length, ideas?.length, clients?.length, feedback?.length]);

  const [activeView, setActiveView] = useState<MagicianView>(() => {
    // Landing view for the AI Assistant section should always be the dashboard/grid.
    // We still *allow* deep-linking into tools, but we don't want the generic
    // "chat" view to become a sticky landing state.
    try {
      const savedView = localStorage.getItem(MAGICIAN_VIEW_STORAGE_KEY) as MagicianView | null;

      const validViews: MagicianView[] = [
        'dashboard',
        'chat',
        'show-planner',
        'effect-generator',
        'magic-dictionary',
        'identify',
        'magic-wire',
        'publications',
        'community',
        'patter-engine',
        'live-rehearsal',
        'video-rehearsal',
        'visual-brainstorm',
        'assistant-studio',
        'refine-idea',
        'saved-ideas',
        'prop-checklists',
        'magic-archives',
        'gospel-magic-assistant',
        'mentalism-assistant',
        'magic-theory-tutor',
        'global-search',
        'client-management',
        'contract-generator',
        'marketing-campaign',
        'draft-email',
        'persona-simulator',
        'director-mode',
        'performance-analytics',
        'show-feedback',
        'member-management',
      ];

      if (savedView && validViews.includes(savedView)) {
        // Treat "chat" as a tool view. If it was saved previously, we land on the
        // dashboard instead, so the AI Assistant menu item always shows the grid.
        if (savedView === 'chat') return 'dashboard';
        return savedView;
      }

      return 'dashboard';
    } catch {
      return 'dashboard';
    }
  });

  // Demo Mode v2 (Phase 3): enforce guided tour locking for specific views.
  useEffect(() => {
    try {
      const current = getCurrentDemoView();
      if (current && isViewLocked(activeView as any)) {
        // Snap back to the current tour step if the user navigated ahead.
        setActiveView(current as any);
      }
    } catch {
      // ignore
    }
  }, [activeView]);



// Global navigation escape hatch:
// The top-level App header dispatches 'maw:go-dashboard' so we can reliably
// exit any tool view (even if localStorage has a "sticky" view saved).
useEffect(() => {
  const handler = () => {
    try { localStorage.removeItem(MAGICIAN_VIEW_STORAGE_KEY); } catch {}
    setActiveView('dashboard');
  };
  window.addEventListener('maw:go-dashboard', handler as any);
  return () => window.removeEventListener('maw:go-dashboard', handler as any);
}, []);


  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [recentlySaved, setRecentlySaved] = useState<Set<number>>(new Set());
  
  const [showAngleRiskForm, setShowAngleRiskForm] = useState(false);
  const [trickName, setTrickName] = useState('');
  const [audienceType, setAudienceType] = useState<'Close-up' | 'Stage' | 'Surrounded' | null>(null);

  const [showRehearsalForm, setShowRehearsalForm] = useState(false);
  const [routineDescription, setRoutineDescription] = useState('');
  const [targetDuration, setTargetDuration] = useState('');

  const [showInnovationEngineForm, setShowInnovationEngineForm] = useState(false);
  const [effectToInnovate, setEffectToInnovate] = useState('');

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [identificationResult, setIdentificationResult] = useState<TrickIdentificationResult | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [identificationError, setIdentificationError] = useState<string | null>(null);
  const [identificationBlocked, setIdentificationBlocked] = useState<BlockedUx | null>(null);
  const [identifySavedIdeaId, setIdentifySavedIdeaId] = useState<string | null>(null);
  const [identifySaving, setIdentifySaving] = useState(false);
  const [identifyRefining, setIdentifyRefining] = useState(false);
  const [identifyLastRefine, setIdentifyLastRefine] = useState<string | null>(null);
  const [identifyIsStrong, setIdentifyIsStrong] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [navElevated, setNavElevated] = useState(false);

  const [viewingPerformanceId, setViewingPerformanceId] = useState<string | null>(null);

  const [initialShowId, setInitialShowId] = useState<string | null>(null);
  const [initialTaskId, setInitialTaskId] = useState<string | null>(null);
  const [initialProposalId, setInitialProposalId] = useState<string | null>(null);
  const [initialPitchId, setInitialPitchId] = useState<string | null>(null);

  const handleOpenShowPlannerFromClient = (showId: string | null, taskId?: string | null) => {
    setInitialShowId(showId ?? null);
    setInitialTaskId(taskId ?? null);
    setActiveView('show-planner');
  };

  const [initialIdeaId, setInitialIdeaId] = useState<string | null>(null);

  const tier = normalizeTier(user.membership as any);
  const isTrialActive = tier === 'trial' && user.trialEndDate ? user.trialEndDate > Date.now() : false;
  const isTrialExpired = tier === 'trial' && user.trialEndDate ? user.trialEndDate <= Date.now() : false;
  const isExpired = tier === 'expired' || isTrialExpired;
  const daysRemaining = getMembershipDaysRemaining(user);
  const tierLabel = formatTierLabel(tier);

  // Access mapping
  const hasAmateurAccess = (['trial', 'amateur', 'professional', 'admin'].includes(tier) && !isExpired) as boolean;
  const hasSemiProAccess = ((tier === 'professional' || tier === 'admin') && !isExpired) as boolean; // business tier (CRM/marketing/contracts/finance)
  const hasProfessionalAccess = ((tier === 'professional' || tier === 'admin' || user.isAdmin) && !isExpired) as boolean;

  // Option 1: surface monthly tool quotas in the UI
  const [usageSnapshot, setUsageSnapshot] = useState<any>(null);
  const [usageSnapshotError, setUsageSnapshotError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchUsage = async () => {
      try {
        setUsageSnapshotError(null);
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        const headers: Record<string, string> = {};
        // If the session hasn't hydrated yet, do NOT force a "guest" token.
        // We'll re-fetch immediately when auth state changes.
        if (token) headers.Authorization = `Bearer ${token}`;

        const r = await fetch('/api/ai/usage', { method: 'GET', headers });
        const txt = await r.text();
        const parsed = txt ? JSON.parse(txt) : null;

        if (!cancelled) {
          if (!r.ok || !parsed?.ok) {
            setUsageSnapshot(null);
            setUsageSnapshotError(parsed?.message || `Usage unavailable (${r.status})`);
          } else {
            setUsageSnapshot(parsed);
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setUsageSnapshot(null);
          setUsageSnapshotError(e?.message || 'Usage unavailable');
        }
      }
    };

    void fetchUsage();
    // IMPORTANT: Supabase session hydration can lag behind the first render.
    // Re-fetch usage immediately when we receive a real session.
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void fetchUsage();
      }
    });
    const t = window.setInterval(fetchUsage, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      authListener?.subscription?.unsubscribe();
    };
  }, [user?.email]);


  // Dashboard: Primary Action ("Today's Focus")
  const parseDateToMs = (v: any): number => {
    if (!v) return 0;
    const d = new Date(v);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : 0;
  };

  const latestIdea = (() => {
    if (!ideas || ideas.length === 0) return null as any;
    const sorted = [...ideas].sort((a: any, b: any) => {
      const aMs = Math.max(parseDateToMs(a.updated_at), parseDateToMs(a.created_at), parseDateToMs(a.timestamp));
      const bMs = Math.max(parseDateToMs(b.updated_at), parseDateToMs(b.created_at), parseDateToMs(b.timestamp));
      return bMs - aMs;
    });
    return sorted[0] ?? null;
  })();

  const latestShow = (() => {
    if (!shows || shows.length === 0) return null as any;
    const sorted = [...shows].sort((a: any, b: any) => {
      const aMs = Math.max(parseDateToMs(a.updated_at), parseDateToMs(a.created_at), parseDateToMs(a.date), parseDateToMs(a.show_date));
      const bMs = Math.max(parseDateToMs(b.updated_at), parseDateToMs(b.created_at), parseDateToMs(b.date), parseDateToMs(b.show_date));
      return bMs - aMs;
    });
    return sorted[0] ?? null;
  })();

  const isNewUser = (!shows || shows.length === 0) && (!ideas || ideas.length === 0) && (!feedback || feedback.length === 0);

  const todaysFocus = (() => {
    // Phase 3A (Home Tightening): One dominant primary action.
    // Spec:
    // - If user has shows: "Continue Building [Last Show]"
    // - Else: "Create Your First Show"
    const hasShows = !!(shows && shows.length > 0);

    if (hasShows && latestShow?.id && (latestShow?.title || latestShow?.name)) {
      const t = String(latestShow.title || latestShow.name || 'Your Latest Show');
      return {
        label: "Continue Building",
        title: t,
        subtitle: `Open Show Planner for “${t}” and keep building your set.`,
        ctaLabel: "Open Show",
        route: "show-planner" as const,
        showId: String(latestShow.id),
      };
    }

    return {
      label: "Get Started",
      title: "Create Your First Show",
      subtitle: "Start your first show plan — then we’ll help you generate effects, patter, and rehearsal notes.",
      ctaLabel: "Create Show",
      route: "show-planner" as const,
      showId: null as string | null,
    };
  })() as any;

  // Dashboard: Insight Tiles ("Make the dashboard talk back")
  // Accent adds a subtle gold/purple balance across the page.
  type DashboardInsight = {
    key: string;
    icon: React.FC<{ className?: string }>;
    title: string;
    message: string;
    accent?: 'purple' | 'gold';
  };

  const insights: DashboardInsight[] = (() => {
    const result: DashboardInsight[] = [];

    const safeText = (v: any) => (typeof v === 'string' ? v : '');
    const clamp = (s: string, max = 120) => (s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s);

	    // Activation Tightening (Phase 6): First action guidance
	    const hasShows = Array.isArray(shows) && shows.length > 0;
	    const hasIdeas = Array.isArray(ideas) && ideas.length > 0;
	    const hasRehearsalLog = (
	      (Array.isArray(ideas) && ideas.some((i: any) => i?.type === 'rehearsal')) ||
	      (Array.isArray(shows) && shows.some((s: any) => Array.isArray(s?.rehearsals) && s.rehearsals.length > 0))
	    );

	    if (!hasShows) {
	      result.push({
	        key: 'activation-no-shows',
	        icon: StageCurtainsIcon,
	        title: 'Create your first show plan',
	        message: 'Start with one show. Once it exists, you can save ideas and rehearsal notes directly into it.',
	        accent: 'purple',
	      });
	    }

	    if (!hasIdeas) {
	      result.push({
	        key: 'activation-no-ideas',
	        icon: WandIcon,
	        title: 'Generate your first saved idea',
	        message: 'Open Effect Generator and save one idea today — your library starts to compound immediately.',
	        accent: 'gold',
	      });
	    }

	    if (!hasRehearsalLog) {
	      result.push({
	        key: 'activation-no-rehearsal',
	        icon: MicrophoneIcon,
	        title: 'Run a quick Live Rehearsal',
	        message: 'Do a 2–3 minute run-through and save the notes. Your next practice becomes dramatically faster.',
	        accent: 'purple',
	      });
	    }

	    // Flatten tasks (best-effort; schema varies across builds)
    const allTasks: any[] = (shows || []).flatMap((s: any) => (Array.isArray(s.tasks) ? s.tasks : Array.isArray(s.show_tasks) ? s.show_tasks : []));
    const openTasks = allTasks.filter((t: any) => !t?.completed && !t?.isCompleted && t?.status !== 'done' && t?.status !== 'completed');

    const dueSoonMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const dueSoonCount = openTasks.filter((t: any) => {
      const ms = Math.max(parseDateToMs(t?.due_at), parseDateToMs(t?.dueDate), parseDateToMs(t?.due_date));
      return ms > 0 && ms <= dueSoonMs;
    }).length;

    if (latestShow?.title && openTasks.length > 0) {
      const title = dueSoonCount > 0 ? 'Upcoming tasks due soon' : 'Open tasks for your next show';
      const message = dueSoonCount > 0
        ? `You have ${dueSoonCount} task${dueSoonCount === 1 ? '' : 's'} due within a week for “${latestShow.title}”. Knock out one small task today to stay ahead.`
        : `You have ${openTasks.length} open task${openTasks.length === 1 ? '' : 's'} connected to your shows. Pick one quick win and keep momentum.`;

      result.push({
        key: 'tasks',
        icon: ChecklistIcon,
        title,
        message,
        accent: 'purple',
      });
    }

    // Audience feedback insight (keyword/ratings heuristic)
    const fb = Array.isArray(feedback) ? feedback : [];
    const fbText = fb
      .map((f: any) => safeText(f?.comment) || safeText(f?.text) || safeText(f?.message) || safeText(f?.feedback))
      .filter(Boolean)
      .join(' | ')
      .toLowerCase();

    const interactiveHit = /(interactive|volunteer|participation|audience|kids|laughter|laughed|funny|engage|engaging)/i.test(fbText);
    const numericRatings = fb.map((f: any) => Number(f?.rating ?? f?.score ?? f?.stars)).filter((n: number) => Number.isFinite(n));
    const avgRating = numericRatings.length ? numericRatings.reduce((a: number, b: number) => a + b, 0) / numericRatings.length : null;

    if (fb.length > 0) {
      if (interactiveHit) {
        result.push({
          key: 'feedback-interactive',
          icon: StarIcon,
          title: 'Audience engagement insight',
          message: 'Audience reactions trend strongest during interactive moments. Consider adding one extra volunteer beat or callback tonight.',
          accent: 'gold',
        });
      } else if (avgRating !== null) {
        result.push({
          key: 'feedback-rating',
          icon: StarIcon,
          title: 'Audience feedback snapshot',
          message: `Your recent audience feedback averages ${avgRating.toFixed(1)} / 5. Review one note and make a single targeted tweak.`,
          accent: 'gold',
        });
      } else {
        result.push({
          key: 'feedback-generic',
          icon: StarIcon,
          title: 'Audience feedback',
          message: 'You’ve collected audience feedback recently. Review it before your next rehearsal and reinforce what landed best.',
          accent: 'gold',
        });
      }
    }

    // Rehearsal/pacing coaching (simple heuristic)
    const hasRehearsalTasks = openTasks.some((t: any) => /(rehears|patter|script|timing|run[- ]?through)/i.test(safeText(t?.title) || safeText(t?.name) || ''));
    if (hasRehearsalTasks || (ideas && ideas.length > 0)) {
      result.push({
        key: 'pacing',
        icon: ClockIcon,
        title: 'Performance pacing tip',
        message: 'Try a deliberate pause right before your final reveal line. One beat of silence can make the climax feel twice as strong.',
        accent: 'gold',
      });
    }

    // Ensure we always fill 3 slots (avoids empty space on wide screens)
    if (result.length < 3) {
      const hasIdeas = Array.isArray(ideas) && ideas.length > 0;
      result.push(
        hasIdeas
          ? {
              key: 'creative-spark',
              icon: LightbulbIcon,
              title: 'Creative spark',
              message:
                'Pick one saved idea and add a stronger opener line, a callback, or a cleaner ending beat. Small upgrades compound fast.',
              accent: 'gold',
            }
          : {
              key: 'first-create',
              icon: WandIcon,
              title: 'Start a new effect',
              message:
                'Generate one fresh idea in Effect Generator using 2–3 everyday objects. Save the best version and build from there.',
              accent: 'gold',
            }
      );
    }

    if (result.length < 3) {
      result.push({
        key: 'rehearsal-quick-win',
        icon: ClockIcon,
        title: 'Rehearsal quick win',
        message:
          'Do a 3‑minute run of your opener at “performance volume.” Aim for slower, cleaner beats—then repeat once with a deliberate pause.',
        accent: 'purple',
      });
    }


    // Keep it tight: 3 tiles max
    return result.slice(0, 3).map((i) => ({ ...i, message: clamp(i.message, 140) }));
  })();


  useEffect(() => {
    if (isExpired) {
      setIsUpgradeModalOpen(true);
    }
  }, [isExpired]);
  // Chat history is intentionally NOT persisted across reloads to avoid stale sessions / auto-resume issues.
  // (no persistence)
  
  useEffect(() => {
    try {
        localStorage.setItem(MAGICIAN_VIEW_STORAGE_KEY, activeView);
    } catch (error) {
        console.error("Failed to save active view to localStorage", error);
    }
  }, [activeView]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (VIEW_TO_TAB_MAP[activeView] === 'chat') {
        scrollToBottom();
    }
  }, [messages, activeView]);

  const friendlyAiError = "The AI didn’t respond this time. Try again or start a new session.";

  const normalizeAiReply = (replyText: string) => {
    const t = (replyText || '').trim();
    // Common failure strings we've seen surface into the UI
    if (/^error\s*:/i.test(t)) return friendlyAiError;
    if (/request failed\s*\(\s*5\d\d\s*\)/i.test(t)) return friendlyAiError;
    if (/function_invocation_failed/i.test(t)) return friendlyAiError;
    return replyText;
  };

  const clearChatSession = () => {
    setMessages([]);
    setInput('');
    setIsLoading(false);
    setRecentlySaved(new Set());
    resetInlineForms();
    try {
      localStorage.removeItem(MAGICIAN_STORAGE_key);
    } catch {
      // ignore
    }
  };

  // Auto-clear chat when switching between AI Assistant tools (prevents old errors/prompts persisting).
  const lastChatToolRef = useRef<MagicianView | null>(null);
  const skipNextChatClearRef = useRef(false);
  useEffect(() => {
    const isChatTool = VIEW_TO_TAB_MAP[activeView] === 'chat' && activeView !== 'dashboard';
    if (!isChatTool) return;

    const prev = lastChatToolRef.current;
    if (prev && prev !== activeView) {
      if (skipNextChatClearRef.current) {
        skipNextChatClearRef.current = false;
      } else {
        clearChatSession();
      }
    }
    lastChatToolRef.current = activeView;
  }, [activeView]);

  const resetInlineForms = () => {
    setShowAngleRiskForm(false);
    setShowRehearsalForm(false);
    setShowInnovationEngineForm(false);
    setTrickName('');
    setAudienceType(null);
    setRoutineDescription('');
    setTargetDuration('');
    setEffectToInnovate('');
  };

  const handleSendWithHistory = async (messageText: string, baseHistory: ChatMessage[]) => {
    if (isExpired) {
      setIsUpgradeModalOpen(true);
      return;
    }
    const userMessageText = messageText;
    if (!userMessageText.trim()) return;

    setInput('');
    setIsLoading(true);

    const userMessage = createChatMessage('user', userMessageText);
    const historyForUI = [...baseHistory, userMessage];
    setMessages(historyForUI);

    try {
      const replyText = await generateResponse(
        userMessageText,
        MAGICIAN_SYSTEM_INSTRUCTION,
        user,
        historyForUI
      );
      setMessages(prev => [...prev, createChatMessage('model', normalizeAiReply(replyText))]);
    } catch (err) {
        const anyErr: any = err as any;
        void trackClientEvent({
          tool: 'IdentifyTrick',
          action: 'identify_request_error',
          outcome: 'ERROR_UPSTREAM',
          http_status: Number(anyErr?.status || 0) || undefined,
          error_code: String(anyErr?.code || anyErr?.error_code || ''),
          retryable: Boolean(anyErr?.retryable),
        });

      console.error('Error in handleSendWithHistory:', err);
      setMessages(prev => [...prev, createChatMessage('model', friendlyAiError)]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReturnToStudioHome = () => {
    setActiveView('dashboard');
    resetInlineForms();
  };

  /**
   * Demo Mode guard shim.
   *
   * Phase 3 introduced a guided demo tour that can *optionally* restrict navigation.
   * In normal mode this should behave exactly like setActiveView.
   *
   * IMPORTANT: Keep this function defined (even if the tour logic changes)
   * so callers don't crash at runtime.
   */
  const demoGuardSetActiveView = (tab: string) => {
    setActiveView(tab);
  };

  const handleSend = async (prompt?: string) => {
    if (isExpired) {
      setIsUpgradeModalOpen(true);
      return;
    }
    const userMessageText = prompt || input;
    if (!userMessageText.trim()) return;

    setInput('');
    setIsLoading(true);

    const userMessage = createChatMessage('user', userMessageText);
    const newHistoryForUI = [...messages, userMessage];
    setMessages(newHistoryForUI);

    try {
        // Production-safe: route through /api/generate via services/geminiService.
        // This avoids initializing Gemini in the browser and prevents blank-screen crashes.
        const replyText = await generateResponse(
          userMessageText,
          MAGICIAN_SYSTEM_INSTRUCTION,
          user,
          newHistoryForUI
        );
        setMessages(prev => [...prev, createChatMessage('model', normalizeAiReply(replyText))]);
    } catch (err) {
        console.error("Error in handleSend:", err);
        setMessages(prev => [...prev, createChatMessage('model', "The AI didn’t respond this time. Try again or start a new session.")]);
    } finally {
        setIsLoading(false);
    }
  };


  const handleFeedback = (messageId: string, feedback: 'good' | 'bad') => {
    setMessages(prevMessages => {
        const newMessages = prevMessages.map(msg =>
            msg.id === messageId
                ? { ...msg, feedback: msg.feedback === feedback ? undefined : feedback }
                : msg
        );
        return newMessages;
    });
  };
  
  const handleRoutineScriptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            setRoutineDescription(text);
        };
        reader.readAsText(file);
    }
    e.target.value = ''; 
  };

  const handlePromptClick = (prompt: PredefinedPrompt) => {
    // Always start a clean session when entering a new AI Assistant tool.
    if (["Angle/Risk Analysis","Rehearsal Coaching","Innovation Engine","Assistant's Studio","Director Mode","Illusion Blueprint Generator","Magic Theory Tutor","Persona Simulator","Gospel Magic Assistant","Mentalism Assistant"].includes(prompt.title)) {
      clearChatSession();
    }
    if (isExpired) {
      setIsUpgradeModalOpen(true);
      return;
    }
    resetInlineForms();
    
    const isAmateurFeature = AMATEUR_FEATURES.includes(prompt.title);
    const isSemiProFeature = SEMI_PRO_FEATURES.includes(prompt.title);
    const isProfessionalFeature = PROFESSIONAL_FEATURES.includes(prompt.title);

    if ((isAmateurFeature && !hasAmateurAccess) || 
        (isSemiProFeature && !hasSemiProAccess) ||
        (isProfessionalFeature && !hasProfessionalAccess)) {
        setIsUpgradeModalOpen(true);
        return;
    }

    switch (prompt.title) {
        case 'Live Patter Rehearsal': demoGuardSetActiveView('live-rehearsal'); return;
        case 'Video Rehearsal Studio': demoGuardSetActiveView('video-rehearsal'); return;
        case 'Visual Brainstorm Studio': demoGuardSetActiveView('visual-brainstorm'); return;
        case 'My Saved Ideas': demoGuardSetActiveView('saved-ideas'); return;
        case 'Prop Checklist Generator': demoGuardSetActiveView('prop-checklists'); return;
        case 'Show Feedback': demoGuardSetActiveView('show-feedback'); return;
        case 'Magic Archives': demoGuardSetActiveView('magic-archives'); return;
        case 'Patter Engine': demoGuardSetActiveView('patter-engine'); return;
        case 'Marketing Campaign': demoGuardSetActiveView('marketing-campaign'); return;
        case 'Contract Generator': demoGuardSetActiveView('contract-generator'); return;
        case 'Assistant\'s Studio': demoGuardSetActiveView('assistant-studio'); return;
        case 'Director Mode': demoGuardSetActiveView('director-mode'); return;
        case 'Illusion Blueprint Generator': demoGuardSetActiveView('illusion-blueprint'); return;
        case 'Magic Theory Tutor': demoGuardSetActiveView('magic-theory-tutor'); return;
        case 'Magic Dictionary': demoGuardSetActiveView('magic-dictionary'); return;
        case 'Persona Simulator': demoGuardSetActiveView('persona-simulator'); return;
        case 'Gospel Magic Assistant': demoGuardSetActiveView('gospel-magic-assistant'); return;
        case 'Mentalism Assistant': demoGuardSetActiveView('mentalism-assistant'); return;
        case 'Client Management': demoGuardSetActiveView('client-management'); return;
        case 'Global Search': demoGuardSetActiveView('global-search'); return;
        case 'Member Management': if (user.isAdmin) { setActiveView('member-management'); } return;
        case 'Angle/Risk Analysis':
            demoGuardSetActiveView('angle-risk');
            return;
        case 'Rehearsal Coaching':
            demoGuardSetActiveView('director-mode');
            setShowRehearsalForm(true);
            break;
        case 'Innovation Engine':
            demoGuardSetActiveView('chat');
            setShowInnovationEngineForm(true);
            break;
        default: clearChatSession(); handleSend(prompt.prompt);
    }
  };

  const handleAngleRiskSubmit = () => {
    if (!trickName || !audienceType) return;
    const fullPrompt = `What are the main angle and risk considerations for performing the "${trickName}" routine for a ${audienceType.toLowerCase()} audience? Provide a detailed breakdown of potential pitfalls and practical solutions.`;
    handleSend(fullPrompt);
    setShowAngleRiskForm(false);
    setTrickName('');
    setAudienceType(null);
  };

  const handleRehearsalSubmit = () => {
    if (!routineDescription || !targetDuration) return;
    const fullPrompt = `I'm rehearsing a routine called "${routineDescription}". My target duration is ${targetDuration} minutes. Please provide coaching feedback on pacing and flow.`;
    handleSend(fullPrompt);
    setShowRehearsalForm(false);
    setRoutineDescription('');
    setTargetDuration('');
  };

  const handleInnovationEngineSubmit = () => {
    if (!effectToInnovate) return;
    const fullPrompt = `Brainstorm unique and modern presentations for the following magic effect: "${effectToInnovate}".`;
    handleSend(fullPrompt);
    setShowInnovationEngineForm(false);
    setEffectToInnovate('');
  };
  
  const handleReturnFromRehearsal = (transcriptToDiscuss?: Transcription[]) => {
    // "Back to Studio" should always leave Live Rehearsal.
    // - If the user chose "Discuss with AI", route them straight to Chat with the transcript loaded.
    // - Otherwise, return them to the Assistant Studio tool hub.
    if (transcriptToDiscuss && transcriptToDiscuss.length > 0) {
      const transcriptMessages: ChatMessage[] = transcriptToDiscuss.map((t) =>
        createChatMessage(
          t.source,
          `**${t.source === 'user' ? 'You' : 'AI Coach'}:** ${t.text}`
        )
      );

      const contextMessage: ChatMessage = createChatMessage(
        'model',
        "Here's the transcript from your live rehearsal session. Please analyze it and provide actionable feedback."
      );

      const baseHistory: ChatMessage[] = [contextMessage, ...transcriptMessages];

      // Prevent the chat auto-clear effect from wiping the transcript when switching tools.
      skipNextChatClearRef.current = true;

      // Switch to Chat and send the analysis prompt using an explicit history array
      // (avoids React state timing issues).
      demoGuardSetActiveView('chat');
      handleSendWithHistory(
        'Please analyze the rehearsal transcript above. Give actionable feedback on pacing, clarity, audience engagement, and suggested rewrites for stronger impact. Provide a short prioritized checklist at the end.',
        baseHistory
      );
      return;
    }

    setActiveView('assistant-studio');
  };

  const handleIdeaSaved = (message: string) => {
    showToast(message, {
      label: 'View Ideas',
      onClick: () => setActiveView('saved-ideas')
    });
    refreshIdeas(dispatch);
  };

  const handleSaveIdea = async (text: string, index: number) => {
    await saveIdea('text', text);
    handleIdeaSaved('Idea saved!');
    setRecentlySaved(prev => new Set(prev).add(index));
    setTimeout(() => {
        setRecentlySaved(prev => {
            const newSet = new Set(prev);
            newSet.delete(index);
            return newSet;
        });
    }, 2000);
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        setImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => { setImagePreview(reader.result as string); };
        reader.readAsDataURL(file);
        setIdentificationResult(null);
        setIdentificationError(null);
        setIdentificationBlocked(null);
        setIdentifySavedIdeaId(null);
        setIdentifyIsStrong(false);
        void trackClientEvent({ tool: 'IdentifyTrick', action: 'identify_upload_selected', units: 1, metadata: { name: file.name, type: file.type, size: file.size } });
    }
  };

  const formatIdentifySnapshot = (result: TrickIdentificationResult, file?: File | null) => {
    const trickName = result?.trickName || 'Unknown Trick';
    const confidence = result?.confidence || 'Medium';
    const summary = (result?.summary || '').trim();
    const observations = Array.isArray(result?.observations) ? result.observations : [];
    const likelyEffectPlot = String(result?.likelyEffectPlot || '').trim();
    const performanceStructure = Array.isArray(result?.performanceStructure) ? result.performanceStructure : [];
    const presentationIdeas = Array.isArray(result?.presentationIdeas) ? result.presentationIdeas : [];
    const angleRiskNotes = Array.isArray(result?.angleRiskNotes) ? result.angleRiskNotes : [];
    const variations = Array.isArray(result?.variations) ? result.variations : [];

    const inputSummary = file
      ? `${file.name} (${Math.round(file.size / 1024)} KB, ${file.type || 'image'})`
      : 'Image upload';

    const header = `# Identify a Trick\n\n**Most likely trick:** ${trickName}\n**Confidence:** ${confidence}`;
    const sumBlock = summary ? `\n\n**Quick summary:** ${summary}` : '';
    const obsBlock = observations.length
      ? `\n\n**What I'm seeing:**\n${observations
          .slice(0, 8)
          .map((o) => `- ${o}`)
          .join('\n')}`
      : '';

    const plotBlock = likelyEffectPlot ? `\n\n**Likely Effect / Plot:**\n${likelyEffectPlot}` : '';

    const structureBlock = performanceStructure.length
      ? `\n\n**Performance Structure:**\n${performanceStructure
          .slice(0, 10)
          .map((x) => `- ${x}`)
          .join('\n')}`
      : '';

    const ideasBlock = presentationIdeas.length
      ? `\n\n**Presentation Ideas:**\n${presentationIdeas
          .slice(0, 12)
          .map((x) => `- ${x}`)
          .join('\n')}`
      : '';

    const anglesBlock = angleRiskNotes.length
      ? `\n\n**Angle / Risk Notes (non-exposure):**\n${angleRiskNotes
          .slice(0, 12)
          .map((x) => `- ${x}`)
          .join('\n')}`
      : '';

    const varsBlock = variations.length
      ? `\n\n**Variations / Alternatives:**\n${variations
          .slice(0, 12)
          .map((x) => `- ${x}`)
          .join('\n')}`
      : '';

    const videos = Array.isArray(result?.videoExamples) ? result.videoExamples : [];
    const vidsBlock = videos.length
      ? `\n\n**Example performances:**\n${videos
          .slice(0, 5)
          .map((v) => `- ${v.title}${v.url ? ` — ${v.url}` : ''}`)
          .join('\n')}`
      : '';

    const title = `Identify Trick: ${trickName}`;

    // Human-friendly snapshot (for Copy/Share + UI display)
    const displayMarkdown = `${header}${sumBlock}${obsBlock}${plotBlock}${structureBlock}${ideasBlock}${anglesBlock}${varsBlock}${vidsBlock}`.trim();

    // Structured payload stored inside idea.content (DB stays unchanged)
    const payload = {
      format: 'maw.idea.v2',
      tool: 'IdentifyTrick',
      timestamp: Date.now(),
      title,
      display: displayMarkdown,
      structured: {
        mostLikelyTrick: trickName,
        confidence,
        observations,
        presentationIdeas,
        angleNotes: angleRiskNotes,
        // Optional enrichments (kept for power users)
        likelyEffectPlot,
        performanceStructure,
        variations,
        videoExamples: videos,
      },
      meta: {
        sourceImagesCount: file ? 1 : 0,
        inputSummary,
        // Optional user context/notes (if the UI provides it in a later phase)
        userNotes: '',
      },
      // Raw model output for audit/debug
      raw: result?.raw ?? result,
    } as const;

    const content = JSON.stringify(payload);

    return { title, content, copyText: displayMarkdown };
  };

  const stripMarkdown = (s: string) =>
    String(s || '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/^>\s?/gm, '')
      .trim();

  const handleIdentifySave = async () => {
    if (!identificationResult) return;
    void trackClientEvent({ tool: 'IdentifyTrick', action: 'identify_save_click' });
    try {
      setIdentifySaving(true);
      const { title, content } = formatIdentifySnapshot(identificationResult, imageFile);
      const saved = await saveIdea({
        type: 'text',
        title,
        content,
        tags: ['identify-trick'],
      });
      setIdentifySavedIdeaId(saved.id);
      setIdentifyIsStrong(saved.tags?.includes('strong') ?? false);
      void trackClientEvent({ tool: 'IdentifyTrick', action: 'identify_save_success', outcome: 'SUCCESS_NOT_CHARGED' });
      handleIdeaSaved('Idea saved!');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save idea.';
      showToast(msg);
    } finally {
      setIdentifySaving(false);
    }
  };

  const handleIdentifyToggleStrong = async () => {
    if (!identifySavedIdeaId) return;
    try {
      const next = !identifyIsStrong;
      setIdentifyIsStrong(next);
      // Persist via tags
      const baseTags = ['identify-trick'];
      const tags = next ? [...baseTags, 'strong'] : baseTags;
      await updateIdea(identifySavedIdeaId, { tags });
      await refreshIdeas(dispatch);
    } catch {
      // revert if persistence fails
      setIdentifyIsStrong((prev) => !prev);
    }
  };

  const handleIdentifyCopy = async () => {
    if (!identificationResult) return;
    const { copyText } = formatIdentifySnapshot(identificationResult, imageFile);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
      } else {
        const ta = document.createElement('textarea');
        ta.value = copyText;
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('Copied.');
    } catch {
      showToast('Copy failed.');
    }
  };

  const handleIdentifyShare = async () => {
    if (!identificationResult) return;
    const { title, copyText } = formatIdentifySnapshot(identificationResult, imageFile);
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ title, text: copyText });
      } else {
        await handleIdentifyCopy();
      }
    } catch {
      // ignore cancellations
    }
  };

  const handleIdentifyAddToShow = async () => {
    if (!identificationResult || !identifySavedIdeaId) return;
    try {
      const { title, content } = formatIdentifySnapshot(identificationResult, imageFile);
      const showTitle = (identificationResult.trickName ? `Trick Research: ${identificationResult.trickName}` : 'Trick Research').slice(0, 80);
      const show = await createShow(showTitle, 'Auto-created from Identify a Trick');
      await addTasksToShow(show.id, [
        {
          title: title.slice(0, 120),
          notes: stripMarkdown(content),
          status: 'To-Do',
          priority: 'Medium',
          tags: ['identify-trick'],
        } as any,
      ]);
      await refreshShows(dispatch);
      setInitialShowId(show.id);
      setActiveView('show-planner');
      showToast('Added to Show Planner.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add to Show Planner.';
      showToast(msg);
    }
  };

  const handleIdentifyConvertToTask = async () => {
    if (!identificationResult || !identifySavedIdeaId) return;
    try {
      const { title, content } = formatIdentifySnapshot(identificationResult, imageFile);
      const inboxTitle = 'Quick Tasks';
      const show = (await findShowByTitle(inboxTitle)) ?? (await createShow(inboxTitle, 'Auto-created task inbox'));
      await addTaskToShow(show.id, {
        title: title.slice(0, 120),
        notes: stripMarkdown(content),
        status: 'To-Do',
        priority: 'Medium',
        tags: ['identify-trick'],
      } as any);
      await refreshShows(dispatch);
      setInitialShowId(show.id);
      setActiveView('show-planner');
      showToast('Task created.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to convert to task.';
      showToast(msg);
    }
  };

  const handleIdentifyClick = async () => {
    if (!imagePreview || !imageFile) return;

    if (identificationBlocked?.retryable) {
      void trackClientEvent({ tool: 'IdentifyTrick', action: 'identify_retry_click' });
    }

    const base64Data = imagePreview.split(',')[1];
    const mimeType = imageFile.type;

    setIsIdentifying(true);
    setIdentificationError(null);
    setIdentificationResult(null);
    setIdentificationBlocked(null);

    void trackClientEvent({ tool: 'IdentifyTrick', action: 'identify_request_start', units: 1, metadata: { mimeType } });

    try {
        const result = await identifyTrickFromImageServer(base64Data, mimeType, user);
        setIdentificationResult(result);
        void trackClientEvent({ tool: 'IdentifyTrick', action: 'identify_request_success', outcome: 'SUCCESS_NOT_CHARGED' });
        setIdentifySavedIdeaId(null);
        setIdentifyIsStrong(false);
    } catch (err) {
        const blocked = normalizeBlockedUx(err, { toolName: 'Identify a Trick' });
        if (blocked.showUpgrade || blocked.retryable) {
          setIdentificationBlocked(blocked);
        } else {
          const msg = err instanceof Error ? err.message : 'An unknown error occurred.';
          setIdentificationError(msg);
        }
    } finally {
        setIsIdentifying(false);
    }
  };

  const handleIdentifyRefine = async (intent: 'clarify' | 'visual' | 'comedy' | 'mentalism' | 'practical' | 'safer_angles') => {
    if (!identificationResult) return;
    if (identifyRefining) return;

    const labelMap: Record<string, string> = {
      clarify: 'Clarify the Effect',
      visual: 'More Visual',
      comedy: 'More Comedy',
      mentalism: 'More Mentalism',
      practical: 'More Practical',
      safer_angles: 'Safer for Angles',
    };

    void trackClientEvent({ tool: 'IdentifyTrick', action: 'identify_refine_click', metadata: { intent } });

    setIdentifyRefining(true);
    setIdentifyLastRefine(labelMap[intent] ?? intent);
    setIdentificationError(null);
    setIdentificationBlocked(null);

    try {
      const refined = await refineIdentifyResult(identificationResult, intent);
      setIdentificationResult(refined);

      // Content changed — require an explicit re-save so the Idea Vault snapshot matches.
      setIdentifySavedIdeaId(null);
      setIdentifyIsStrong(false);

      showToast('Refined.');
    } catch (err) {
      const blocked = normalizeBlockedUx(err, { toolName: 'Identify a Trick' });
      if (blocked.showUpgrade || blocked.retryable) {
        setIdentificationBlocked(blocked);
      } else {
        const msg = err instanceof Error ? err.message : 'Refine failed.';
        setIdentificationError(msg);
      }
    } finally {
      setIdentifyRefining(false);
      setIdentifyLastRefine(null);
    }
  };

  const handleTabClick = (tab: MagicianTab) => {
    if (tab === 'show-planner' && !hasAmateurAccess) {
        setIsUpgradeModalOpen(true);
        return;
    }
     if (tab === 'magic-dictionary' && !hasProfessionalAccess) {
        setIsUpgradeModalOpen(true);
        return;
    }
    if (tab === 'search') {
        demoGuardSetActiveView('global-search');
        return;
    }
    if (tab === 'admin') {
        if (!user?.isAdmin) return;
        resetInlineForms();
        demoGuardSetActiveView('admin');
        return;
    }
    resetInlineForms();
    demoGuardSetActiveView(tab);
  };
  
  const handleNavigate = (view: MagicianView) => {
    if (isExpired) {
      setIsUpgradeModalOpen(true);
      return;
    }
    // Centralized permission gating (Free vs Pro) for navigation shortcuts.
    // Note: detailed tier gating for tool *cards* happens in handlePromptClick.
    const amateurViews = new Set<MagicianView>([
      'show-planner',
      'effect-generator',
      'saved-ideas',
      'magic-archives',
      'global-search',
      'show-feedback',
    ]);

    const professionalViews = new Set<MagicianView>([
      'live-rehearsal',
      'video-rehearsal',
      'visual-brainstorm',
      'director-mode',
      'persona-simulator',
      'assistant-studio',
      'client-management',
      'illusion-blueprint',
      'magic-theory-tutor',
      'mentalism-assistant',
      'gospel-magic-assistant',
      'magic-dictionary',
      'performance-analytics',
    ]);

    if (amateurViews.has(view) && !hasAmateurAccess) {
      setIsUpgradeModalOpen(true);
      return;
    }

    if (professionalViews.has(view) && !hasProfessionalAccess) {
      setIsUpgradeModalOpen(true);
      return;
    }

    // Demo-only founder preview guard.
    // In the real app, Professional members should be able to access Video Rehearsal.
    // We keep the founder-preview scarcity behavior only for guided demo sessions.
    const founderPreviewViews = new Set<MagicianView>([
      'video-rehearsal',
    ]);

    if (
      isDemoMode &&
      founderPreviewViews.has(view) &&
      !user?.isAdmin &&
      !user?.foundingCircleMember
    ) {
      showToast('Founder Preview: this tool is currently available to Founding Circle members.', {
        label: 'Join Founding Circle',
        onClick: () => {
          try { window.location.href = '/founding-circle'; } catch {}
        },
      });
      return;
    }

    setActiveView(view);
  };

  const handleDeepLink = (view: MagicianView, primaryId: string, secondaryId?: string) => {
    setInitialShowId(null);
    setInitialTaskId(null);
    setInitialIdeaId(null);

    if (view === 'show-planner') {
        setInitialShowId(primaryId);
        if (secondaryId) {
            setInitialTaskId(secondaryId);
        }
    } else if (view === 'saved-ideas') {
        setInitialIdeaId(primaryId);
    }
    setActiveView(view);
  };

  const handleAiSpark = (action: AiSparkAction) => {
    let prompt = '';

    switch (action.type) {
        case 'custom-prompt':
            prompt = String(action.payload?.prompt || '').trim();
            break;
        case 'refine-idea':
            prompt = `As an expert scriptwriter, please review and refine the following piece of content:

---

${action.payload.content}`;
            break;
        case 'draft-email':
            const client: Client = action.payload.client;
            prompt = `As a professional magician's assistant, draft a polite follow-up email to my client, ${client.name}${client.company ? ` from ${client.company}` : ''}.`;
            break;
        default: return;
    }
    // Tier 3: When other tools (Dictionary, Search, etc.) trigger an AI action,
    // jump the user into the AI Assistant chat so it feels connected.
    demoGuardSetActiveView('chat');
    handleSend(prompt);
  };

  // Tier 3: Allow other views to request navigation without threading props everywhere.
  // Usage: window.dispatchEvent(new CustomEvent('maw:navigate', { detail: { view: 'magic-dictionary', hash: 'framing' } }))
  useEffect(() => {
    const onNav = (e: Event) => {
      const ce = e as CustomEvent;
      const view = (ce?.detail?.view || '') as MagicianView;
      const hash = (ce?.detail?.hash || '') as string;
      if (!view) return;

      // Reset any deep-link selections when swapping tools
      setInitialShowId(null);
      setInitialTaskId(null);
      setInitialIdeaId(null);

      setActiveView(view);

      // Support deep-link navigation payloads (used by Effect Engine -> Show Planner imports)
      try {
        const primaryId = String(ce?.detail?.primaryId ?? ce?.detail?.showId ?? '');
        const secondaryId = String(ce?.detail?.secondaryId ?? ce?.detail?.taskId ?? '');
        if (view === 'show-planner') {
          if (primaryId) setInitialShowId(primaryId);
          if (secondaryId) setInitialTaskId(secondaryId);
        }
      } catch {}

      if (hash && typeof window !== 'undefined') {
        // Let the target view mount first
        window.setTimeout(() => {
          try {
            window.location.hash = encodeURIComponent(hash);
          } catch {
            window.location.hash = hash;
          }
        }, 0);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('maw:navigate', onNav as any);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('maw:navigate', onNav as any);
      }
    };
  }, []);

  const handleNavigateToAnalytics = (performanceId: string) => {
    setViewingPerformanceId(performanceId);
    setActiveView('performance-analytics');
  };

  const handleUpgrade = (tier: 'amateur' | 'professional') => {
    onUpgrade(tier as any);
    setIsUpgradeModalOpen(false);
  }
  
  const handleClientsUpdate = (updatedClients: Client[]) => {
    refreshClients(dispatch);
  };

  const handleShowsUpdate = () => {
    refreshShows(dispatch);
  };

  const renderContent = () => {
    switch(activeView) {
        case 'dashboard': {
          // Home intro / first-win overlay
          // Keep it visible until the user dismisses it so it does not flash away during hydration.
          const showFirstWinGate = isLoaded && !user?.isAdmin && !isHomeIntroDismissed;
          if (showFirstWinGate) {
            return <FirstWinGate user={user} onNavigate={handleNavigate} onDismiss={dismissHomeIntro} />;
          }

          return (
            <>
            <div className="px-4 md:px-6 pt-6">
              <p className="text-sm uppercase tracking-[0.08em] font-semibold text-yellow-300/80">
                Home
              </p>
              <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-white leading-tight">
                Your Home Base for Creating, Rehearsing, and Running <span className="text-yellow-200">Better Magic Shows</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                Everything you need to create effects, rehearse performances, and manage your shows.
              </p>
              <p className="mt-2 text-sm text-white/55">
                Welcome back, {user.name || (user.email ? user.email.split('@')[0] : 'magician')}.
              </p>
            </div>

            {/* Primary Action */}
            <div className="px-4 md:px-6 mb-6">
              <div className="relative overflow-hidden rounded-2xl border border-purple-500/40 bg-gradient-to-b from-purple-500/10 via-white/[0.03] to-transparent p-5 shadow-[0_0_24px_rgba(168,85,247,0.12)] md:p-5">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-purple-500/12 via-transparent to-yellow-500/10" />
                <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/30 bg-purple-500/20 text-purple-100 shadow-[0_0_16px_rgba(168,85,247,0.12)]">
                      <MagicHatIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-purple-200/90">Active Project</p>
                      <p className="mt-1 text-sm font-medium text-purple-100/90">{todaysFocus.label}</p>
                      <h2 className="mt-1 text-lg font-semibold text-white md:text-xl">{todaysFocus.title}</h2>
                      <p className="mt-1 text-sm text-white/65">{todaysFocus.subtitle}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                    if (todaysFocus?.route === 'show-planner') {
                      if (todaysFocus?.showId) {
                        setInitialShowId(String(todaysFocus.showId));
                        setInitialTaskId(null);
                      } else {
                        setInitialShowId(null);
                        setInitialTaskId(null);
                      }
                      setActiveView('show-planner');
                      return;
                    }
                    handleNavigate(todaysFocus.route);
                  }}
                    className="inline-flex items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/15 px-4 py-2 text-sm font-medium text-purple-100 transition hover:bg-purple-500/25 hover:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                  >
                    {todaysFocus.ctaLabel}
                  </button>
                </div>
              </div>
            </div>


            {/* Insight Tiles */}
            {insights.length > 0 && (
              <div className="px-4 md:px-6 mb-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {insights.map((insight) => {
                    const isGold = insight.accent === 'gold';
                    const iconClasses = isGold
                      ? 'border-yellow-400/25 bg-yellow-500/10 text-yellow-200'
                      : 'border-purple-400/20 bg-purple-500/15 text-purple-200';
                    const glowClasses = isGold
                      ? 'bg-gradient-to-br from-yellow-500/12 via-transparent to-transparent'
                      : 'bg-gradient-to-br from-purple-500/10 via-transparent to-transparent';

                    return (
                      <div
                        key={insight.key}
                        className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                      >
                        <div className={`pointer-events-none absolute inset-0 ${glowClasses}`} />
                        <div className="relative flex items-start gap-3">
                          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border ${iconClasses}`}>
                            <insight.icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className={isGold ? 'text-sm font-semibold text-yellow-100' : 'text-sm font-semibold text-white'}>{insight.title}</p>
                            <p className="mt-1 text-sm text-white/65">{insight.message}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <Dashboard
              variant="home"
              user={user}
              shows={shows}
              feedback={feedback}
              ideas={ideas}
              onNavigate={handleNavigate}
              onShowsUpdate={handleShowsUpdate}
              onPromptClick={handlePromptClick}
            />
            </>
          );
        }
        case 'live-rehearsal':
          return (
            <LiveRehearsal
              user={user}
              onReturnToStudio={handleReturnFromRehearsal}
              onIdeaSaved={() => handleIdeaSaved('Rehearsal saved!')}
              onOpenAngleRisk={() => setActiveView('angle-risk')}
              onOpenPatterEngine={() => setActiveView('patter-engine')}
              onOpenDirectorMode={() => setActiveView('director-mode')}
              onRequestUpgrade={() => setIsUpgradeModalOpen(true)}
            />
          );
        case 'video-rehearsal': return <VideoRehearsal onIdeaSaved={() => handleIdeaSaved('Video analysis saved!')} user={user} />;
        case 'angle-risk': return <AngleRiskAnalysis user={user} onIdeaSaved={() => handleIdeaSaved('Angle/Risk analysis saved!')} />;
        case 'visual-brainstorm': return <VisualBrainstorm onIdeaSaved={() => handleIdeaSaved('Image idea saved!')} user={user} />;
        case 'saved-ideas': return <SavedIdeas onAiSpark={handleAiSpark} initialIdeaId={initialIdeaId || undefined} />;
        case 'prop-checklists': return <PropGenerator user={user} onIdeaSaved={() => handleIdeaSaved('Prop concept saved!')} onNavigateShowPlanner={() => setActiveView('show-planner')} onNavigateDirectorMode={() => setActiveView('director-mode')} />;
        case 'show-planner': return <ShowPlanner user={user} clients={clients} onNavigateToAnalytics={handleNavigateToAnalytics} initialShowId={initialShowId} initialTaskId={initialTaskId} />;
        case 'performance-analytics': return <PerformanceAnalytics performanceId={viewingPerformanceId!} onBack={() => { setViewingPerformanceId(null); setActiveView('show-planner'); }} />;
        case 'show-feedback': return <ShowFeedback />;
        case 'magic-archives': return <MagicArchives onIdeaSaved={() => handleIdeaSaved('Research saved!')} />;
        case 'patter-engine': return <PatterEngine onIdeaSaved={() => handleIdeaSaved('Patter ideas saved!')} user={user} />;
        case 'marketing-campaign':
          return (
            <MarketingCampaign
              user={user}
              onIdeaSaved={() => handleIdeaSaved('Marketing campaign ideas saved!')}
              onNavigateToShowPlanner={(showId) => {
                setInitialShowId(showId);
                setActiveView('show-planner');
              }}
              onNavigate={(view, id) => {
                if (view === 'client-proposals') {
                  setInitialProposalId(id);
                  setActiveView('client-proposals');
                  return;
                }
                if (view === 'booking-pitches') {
                  setInitialPitchId(id);
                  setActiveView('booking-pitches');
                  return;
                }
              }}
            />
          );
        case 'client-proposals':
          return (
            <ClientProposals
              initialId={initialProposalId}
              onBack={() => setActiveView('marketing-campaign')}
            />
          );
        case 'booking-pitches':
          return (
            <BookingPitches
              initialId={initialPitchId}
              onBack={() => setActiveView('marketing-campaign')}
            />
          );
        case 'contract-generator':
          return (
            <ContractGenerator
              user={user}
              clients={clients}
              shows={shows}
              onShowsUpdate={handleShowsUpdate}
              onNavigateToShowPlanner={(showId) => {
                setInitialShowId(showId);
                setActiveView('show-planner');
              }}
              onIdeaSaved={() => handleIdeaSaved('Contract saved!')}
            />
          );
        case 'assistant-studio': return <AssistantStudio onIdeaSaved={() => handleIdeaSaved('Assistant idea saved!')} user={user} />;
        case 'director-mode': return <DirectorMode onIdeaSaved={() => handleIdeaSaved('Show Plan saved!')} />;
        case 'illusion-blueprint': return <IllusionBlueprint onIdeaSaved={() => handleIdeaSaved('Illusion Blueprint saved!')} user={user} />;
        case 'magic-theory-tutor': return <MagicTheoryTutor user={user} />;
        case 'magic-dictionary':
          return (
            <MagicDictionary
              onAiSpark={handleAiSpark}
              membership={user?.membership}
              onRequestUpgrade={() => setIsUpgradeModalOpen(true)}
            />
          );
        case 'persona-simulator': return <PersonaSimulator onIdeaSaved={() => handleIdeaSaved('Persona simulation saved!')} user={user} />;
        case 'gospel-magic-assistant':
          return (
            <GospelMagicAssistant
              onIdeaSaved={() => handleIdeaSaved('Gospel routine idea saved!')}
              onOpenShowPlanner={(showId, taskId) => handleOpenShowPlannerFromClient(showId ?? null, taskId ?? null)}
              onOpenLiveRehearsal={() => setActiveView('live-rehearsal')}
            />
          );
        case 'mentalism-assistant':
          return (
            <MentalismAssistant
              onIdeaSaved={() => handleIdeaSaved('Mentalism idea saved!')}
              onOpenShowPlanner={(showId, taskId) => handleOpenShowPlannerFromClient(showId ?? null, taskId ?? null)}
              onOpenLiveRehearsal={() => setActiveView('live-rehearsal')}
              onOpenDirectorMode={() => setActiveView('director-mode')}
            />
          );
        case 'client-management': return <ClientManagement onClientsUpdate={handleClientsUpdate} onAiSpark={handleAiSpark} onOpenShowPlanner={handleOpenShowPlannerFromClient} onNavigateToContracts={() => setActiveView('contract-generator')} onNavigateToMarketing={() => setActiveView('marketing-campaign')} onNavigateToFeedback={() => setActiveView('audience-feedback')} />;
        case 'member-management': return <MemberManagement />;
        case 'effect-generator': return <EffectGenerator onIdeaSaved={() => handleIdeaSaved('Effect ideas saved!')} />;
        case 'magic-wire': return <MagicWire currentUser={user} onIdeaSaved={() => handleIdeaSaved('News article saved!')} />;
        case 'global-search': return <GlobalSearch shows={shows} ideas={ideas} onNavigate={handleDeepLink} />;
        case 'admin':
          return user?.isAdmin ? <AdminPanel user={user} /> : <Dashboard user={user} onNavigate={handleNavigate} />;
        case 'identify':
          return (
            <IdentifyTab
              imageFile={imageFile}
              imagePreview={imagePreview}
              identificationResult={identificationResult}
              isIdentifying={isIdentifying}
              identificationError={identificationError}
              identificationBlocked={identificationBlocked}
              identifySaved={!!identifySavedIdeaId}
              identifySaving={identifySaving}
              identifyIsStrong={identifyIsStrong}
              fileInputRef={fileInputRef}
              handleImageUpload={handleImageUpload}
              handleIdentifyClick={handleIdentifyClick}
              onSave={handleIdentifySave}
              onAddToShow={handleIdentifyAddToShow}
              onConvertToTask={handleIdentifyConvertToTask}
              onCopy={handleIdentifyCopy}
              onShare={handleIdentifyShare}
              onToggleStrong={handleIdentifyToggleStrong}
              onRefine={handleIdentifyRefine}
              refining={identifyRefining}
              lastRefine={identifyLastRefine}
              onRequestUpgrade={() => setIsUpgradeModalOpen(true)}
            />
          );
        case 'publications': return <PublicationsTab />;
        case 'community': return <CommunityTab />;
        case 'chat': default: return <ChatView messages={messages} isLoading={isLoading} recentlySaved={recentlySaved} handleSaveIdea={handleSaveIdea} handleFeedback={handleFeedback} messagesEndRef={messagesEndRef} showAngleRiskForm={showAngleRiskForm} trickName={trickName} setTrickName={setTrickName} audienceType={audienceType} setAudienceType={setAudienceType} handleAngleRiskSubmit={handleAngleRiskSubmit} onCancelAngleRisk={() => { setShowAngleRiskForm(false); setTrickName(''); setAudienceType(null); }} showRehearsalForm={showRehearsalForm} routineDescription={routineDescription} setRoutineDescription={setRoutineDescription} targetDuration={targetDuration} setTargetDuration={setTargetDuration} handleRehearsalSubmit={handleRehearsalSubmit} onCancelRehearsal={() => { setShowRehearsalForm(false); setRoutineDescription(''); setTargetDuration(''); }} onFileChange={handleRoutineScriptUpload} showInnovationEngineForm={showInnovationEngineForm} effectToInnovate={effectToInnovate} setEffectToInnovate={setEffectToInnovate} handleInnovationEngineSubmit={handleInnovationEngineSubmit} onCancelInnovationEngine={() => { setShowInnovationEngineForm(false); setEffectToInnovate(''); }} prompts={MAGICIAN_PROMPTS} user={user} hasAmateurAccess={hasAmateurAccess} hasSemiProAccess={hasSemiProAccess} hasProfessionalAccess={hasProfessionalAccess} usageQuota={usageSnapshot?.quota} onPromptClick={handlePromptClick} />;
    }
  }

  const TabButton: React.FC<{ label: string; icon: React.FC<{ className?: string }>; isActive: boolean; onClick: () => void; isLocked?: boolean; }> = ({ label, icon: Icon, isActive, onClick, isLocked }) => (
    <button
      onClick={onClick}
      title={isLocked ? 'Upgrade to access this feature' : ''}
      className={`relative flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'border-b-2 border-purple-400 text-purple-300' : 'border-b-2 border-transparent text-slate-400 hover:text-white'} ${isLocked ? 'text-slate-600 hover:text-slate-600' : ''}`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label === "Assistant's Studio" ? (<><span>Assistant's Studio</span><span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-indigo-500 text-white uppercase">Beta</span></>) : label}</span>
      <span className="sm:hidden text-[11px]">{label === "Assistant's Studio" ? (<><span>Assistant's Studio</span><span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-indigo-500 text-white uppercase">Beta</span></>) : label}</span>
      {isLocked && <LockIcon className="absolute top-1 right-1 w-3 h-3 text-amber-400/80" />}
    </button>
  );

  const activeTab = VIEW_TO_TAB_MAP[activeView];
  const activeIntent = (() => {
    if (activeTab === 'admin') return 'admin' as const;

    // Create
    const createViews = new Set<MagicianView>([
      'effect-generator',
      'identify',
      'visual-brainstorm',
      'director-mode',
      'patter-engine',
      'illusion-blueprint',
      'assistant-studio',
      'magic-dictionary',
    ]);

    // Rehearse
    const rehearseViews = new Set<MagicianView>([
      'live-rehearsal',
      'video-rehearsal',
      'persona-simulator',
      'angle-risk',
    ]);

    // Manage
    const manageTabs = new Set<MagicianTab>([
      'show-planner',
      'search',
    ]);

    // Social
    const socialTabs = new Set<MagicianTab>([
      'magic-wire',
      'publications',
      'community',
    ]);
    const manageViews = new Set<MagicianView>([
      'saved-ideas',
      'client-management',
      'contract-generator',
      'marketing-campaign',
      'show-feedback',
      'global-search',
      'performance-analytics',
      'prop-checklists',
      'magic-archives',
      'member-management',
    ]);

    if (createViews.has(activeView)) return 'create' as const;
    if (rehearseViews.has(activeView)) return 'rehearse' as const;
    if (manageViews.has(activeView) || manageTabs.has(activeTab)) return 'manage' as const;
    if (socialTabs.has(activeTab)) return 'social' as const;

    return 'home' as const;
  })();

  const handlePrimaryIntentClick = (intent: typeof activeIntent) => {
    if (intent === 'home') {
      try { localStorage.removeItem('magician_active_view'); } catch {}
      resetInlineForms();
      setActiveView('dashboard');
      return;
    }
    if (intent === 'create') {
      handleNavigate('effect-generator');
      return;
    }
    if (intent === 'rehearse') {
      // Default: angle/risk is safe to access for all tiers; pro users can jump into Live Rehearsal.
      handleNavigate(hasProfessionalAccess ? 'live-rehearsal' : 'angle-risk');
      return;
    }
    if (intent === 'manage') {
      handleNavigate('show-planner');
      return;
    }
    if (intent === 'social') {
      handleNavigate('magic-wire');
      return;
    }
    if (intent === 'admin') {
      if (!user?.isAdmin) return;
      resetInlineForms();
      setActiveView('admin');
      return;
    }
  };

  
  const handleMainScroll = () => {
    const el = mainScrollRef.current;
    if (!el) return;
    setNavElevated(el.scrollTop > 4);
  };

  const jumpToAllTools = () => {
    handlePrimaryIntentClick('home');
    window.setTimeout(() => {
      const target = document.getElementById('maw-tool-grid');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

const renderIntentSubnav = () => {
    if (activeIntent === 'home' || activeIntent === 'admin') return null;

    const subBtn = (label: string, onClick: () => void, isActive?: boolean, locked?: boolean) => (
      <button
        key={label === "Assistant's Studio" ? (<><span>Assistant's Studio</span><span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-indigo-500 text-white uppercase">Beta</span></>) : label}
        onClick={onClick}
        className={[
          'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors',
          locked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-800/60',
          isActive ? 'bg-indigo-600/30 text-white border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.6)]' : 'bg-transparent text-slate-300 border-slate-800',
        ].join(' ')}
        disabled={!!locked}
      >
        {label === "Assistant's Studio" ? (<><span>Assistant's Studio</span><span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-indigo-500 text-white uppercase">Beta</span></>) : label}
      </button>
    );

    if (activeIntent === 'create') {
      return (
        <div className="flex flex-wrap items-center gap-2 px-2 md:px-4 py-2 border-b border-slate-800/70">
          {subBtn('Effect Generator', () => handleNavigate('effect-generator'), activeTab === 'effect-generator')}
          {subBtn('Identify Trick', () => handleNavigate('identify'), activeTab === 'identify')}
          {subBtn('Visual Brainstorm', () => handleNavigate('visual-brainstorm'), activeView === 'visual-brainstorm', !hasProfessionalAccess)}
          {subBtn('Director Mode', () => handleNavigate('director-mode'), activeView === 'director-mode', !hasProfessionalAccess)}
          {subBtn('Patter Engine', () => handleNavigate('patter-engine'), activeView === 'patter-engine')}
          {subBtn('Illusion Blueprint', () => handleNavigate('illusion-blueprint'), activeView === 'illusion-blueprint', !hasProfessionalAccess)}
          {subBtn('Gospel Magic', () => handleNavigate('gospel-magic-assistant'), activeView === 'gospel-magic-assistant', !hasProfessionalAccess)}
          {subBtn('Mentalism', () => handleNavigate('mentalism-assistant'), activeView === 'mentalism-assistant', !hasProfessionalAccess)}
          {subBtn("Assistant's Studio", () => handleNavigate('assistant-studio'), activeView === 'assistant-studio', !hasProfessionalAccess)}
        </div>
      );
    }

    if (activeIntent === 'rehearse') {
      return (
        <div className="flex flex-wrap items-center gap-2 px-2 md:px-4 py-2 border-b border-slate-800/70">
          {subBtn('Angle & Risk', () => handleNavigate('angle-risk'), activeView === 'angle-risk')}
          {subBtn('Live Rehearsal', () => handleNavigate('live-rehearsal'), activeView === 'live-rehearsal', !hasProfessionalAccess)}
          {subBtn('Video Rehearsal', () => handleNavigate('video-rehearsal'), activeView === 'video-rehearsal', !hasProfessionalAccess)}
          {subBtn('Persona Simulator', () => handleNavigate('persona-simulator'), activeView === 'persona-simulator', !hasProfessionalAccess)}
        </div>
      );
    }

    if (activeIntent === 'social') {
      return (
        <div className="flex flex-wrap items-center gap-2 px-2 md:px-4 py-2 border-b border-slate-800/70">
          {subBtn('Magic Wire', () => handleNavigate('magic-wire'), activeTab === 'magic-wire')}
          {subBtn('Publications', () => handleNavigate('publications'), activeTab === 'publications')}
          {subBtn('Community', () => handleNavigate('community'), activeTab === 'community')}
        </div>
      );
    }

    // manage
    return (
      <div className="flex flex-wrap items-center gap-2 px-2 md:px-4 py-2 border-b border-slate-800/70">
        {subBtn('Show Planner', () => handleNavigate('show-planner'), activeTab === 'show-planner', !hasAmateurAccess)}
        {subBtn('Saved Ideas', () => handleNavigate('saved-ideas'), activeView === 'saved-ideas', !hasAmateurAccess)}
        {subBtn('Show Feedback', () => handleNavigate('show-feedback'), activeView === 'show-feedback', !hasProfessionalAccess)}
        {subBtn('Clients', () => handleNavigate('client-management'), activeView === 'client-management', !hasProfessionalAccess)}
        {subBtn('Contracts', () => handleNavigate('contract-generator'), activeView === 'contract-generator', !hasProfessionalAccess)}
        {subBtn('Prop Checklist', () => handleNavigate('prop-checklists'), activeView === 'prop-checklists', !hasProfessionalAccess)}
        {subBtn('Marketing', () => handleNavigate('marketing-campaign'), activeView === 'marketing-campaign', !hasProfessionalAccess)}
        {subBtn('Search', () => handleNavigate('global-search'), activeView === 'global-search', !hasAmateurAccess)}
      </div>
    );
  };

  const showFooter = activeView === 'chat';

  return (
    <div className="relative flex flex-col h-full rounded-lg border border-slate-800 shadow-2xl shadow-purple-900/20 overflow-hidden">
        {isUpgradeModalOpen && (
          <UpgradeModal
            onClose={() => setIsUpgradeModalOpen(false)}
            onUpgrade={handleUpgrade}
            variant={isExpired ? 'trial-expired' : 'locked-tool'}
            user={user as any}
          />
        )}
        {isHelpModalOpen && <HelpModal
            onClose={() => setIsHelpModalOpen(false)}
            onNavigate={(view) => {
              setActiveView(view);

      // Support deep-link navigation payloads (used by Effect Engine -> Show Planner imports)
      try {
        const primaryId = String(ce?.detail?.primaryId ?? ce?.detail?.showId ?? '');
        const secondaryId = String(ce?.detail?.secondaryId ?? ce?.detail?.taskId ?? '');
        if (view === 'show-planner') {
          if (primaryId) setInitialShowId(primaryId);
          if (secondaryId) setInitialTaskId(secondaryId);
        }
      } catch {}
              setIsHelpModalOpen(false);
            }}
            contextView={activeView}
          />}
        {isFeedbackModalOpen && (
          <AppSuggestionModal onClose={() => setIsFeedbackModalOpen(false)} />
        )}
      <header className="flex items-center px-3 sm:px-4 py-2 border-b border-slate-800 brand-motif">
        <button onClick={handleReturnToStudioHome} className="p-1.5 mr-2 rounded-full hover:bg-slate-700 transition-colors" aria-label="Back">
          <BackIcon className="w-5 h-5 text-slate-300" />
        </button>
        <picture className="mr-2 flex-shrink-0">
          <source media="(prefers-contrast: more)" srcSet="/images/nav-wand.png" />
          <source media="(forced-colors: active)" srcSet="/images/nav-wand.png" />
          <img src="/images/nav-wand.png" alt="Magic wand" className="h-8 w-auto wizard-nav-icon" />
        </picture>
        <div className="ml-auto flex items-center gap-2">
            {Boolean((user as any)?.foundingCircleMember) && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-400/25 bg-amber-500/10">
                <StarIcon className="w-3.5 h-3.5 text-[#E6C77A]" aria-hidden="true" />
                <span className="text-xs font-semibold tracking-wide text-amber-200">Founding Circle</span>
              </div>
            )}
            {(daysRemaining != null || tier !== 'trial') && (
              <div
                className={[
                  'hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors',
                  tier === 'trial'
                    ? 'bg-yellow-500/10 border-yellow-500/25'
                    : (tier === 'amateur' || tier === 'professional' || tier === 'admin')
                      ? 'bg-purple-500/10 border-purple-500/25'
                      : 'bg-slate-900/60 border-slate-700',
                ].join(' ')}
              >
                <StarIcon
                  className={[
                    'w-3.5 h-3.5',
                    tier === 'trial'
                      ? 'text-[#E6C77A]'
                      : (tier === 'amateur' || tier === 'professional' || tier === 'admin')
                        ? 'text-purple-300'
                        : 'text-slate-300',
                  ].join(' ')}
                  aria-hidden="true"
                />
                <span
                  className={[
                    'text-xs font-semibold tracking-wide',
                    tier === 'trial'
                      ? 'text-[#E6C77A] hover:text-[#F2D98D]'
                      : (tier === 'amateur' || tier === 'professional' || tier === 'admin')
                        ? 'text-purple-200 hover:text-purple-100'
                        : 'text-slate-200',
                  ].join(' ')}
                >
                  {daysRemaining != null
                    ? `${tierLabel}: ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`
                    : (tier === 'admin' ? `${tierLabel}` : `${tierLabel} Member`)}
                </span>
              </div>
            )}
            <UsageMeter user={user} />
            <button onClick={() => setIsHelpModalOpen(true)} className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Help" aria-label="Open help center">
                <QuestionMarkIcon className="w-6 h-6" />
            </button>
            <AccountMenu user={user} onLogout={onLogout} />
        </div>
      </header>

      {/* Demo banner is handled globally by <DemoBanner /> to avoid stacked indicators in recordings. */}

{!isDemoMode && showBackupReminder && (
  <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-sky-400/20 bg-sky-500/10">
    <div className="text-sm text-sky-200 flex items-center gap-2">
      <DownloadIcon className="w-4 h-4 text-sky-300" />
      <span>{backupReminderMessage}</span>
    </div>
    <div className="flex items-center gap-2">
      <button
        onClick={handleExportBackup}
        className="text-sm px-3 py-1 rounded-md border border-sky-400/30 text-sky-200 hover:text-white hover:border-sky-400/60 hover:bg-sky-500/10 transition-colors"
        title="Download a backup file of your shows, ideas, clients, and history">
        Export Backup
      </button>
      <button
        onClick={handleDismissBackupReminder}
        className="text-sm px-3 py-1 rounded-md border border-sky-400/20 text-sky-200/80 hover:text-white hover:border-sky-400/50 hover:bg-sky-500/10 transition-colors"
        title="Hide this reminder for 7 days">
        Dismiss
      </button>
    </div>
  </div>
)}

      {!isDemoMode && (
        <div className="px-3 sm:px-4 pt-3 pb-3 border-b border-slate-800/60">
          <UsageLimitsCard
            usageSnapshot={usageSnapshot}
            error={usageSnapshotError}
            onRequestUpgrade={() => setIsUpgradeModalOpen(true)}
          />
        </div>
      )}


      <nav className={`sticky top-0 z-40 flex items-center gap-1 border-b border-slate-800/80 bg-slate-950/75 backdrop-blur px-2 md:px-4 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${navElevated ? 'shadow-lg shadow-black/20' : ''}`}>
        {/* Phase 2 (Navigation Tightening): Intent-based primary navigation */}
        <TabButton
          label="Home"
          icon={WandIcon}
          isActive={activeIntent === 'home'}
          onClick={() => handlePrimaryIntentClick('home')}
        />
        <TabButton
          label="Create"
          icon={LightbulbIcon}
          isActive={activeIntent === 'create'}
          onClick={() => handlePrimaryIntentClick('create')}
        />
        <TabButton
          label="Rehearse"
          icon={MicrophoneIcon}
          isActive={activeIntent === 'rehearse'}
          onClick={() => handlePrimaryIntentClick('rehearse')}
        />
        <TabButton
          label="Manage"
          icon={ChecklistIcon}
          isActive={activeIntent === 'manage'}
          onClick={() => handlePrimaryIntentClick('manage')}
          isLocked={!hasAmateurAccess}
        />
        <TabButton
          label="Social"
          icon={UsersIcon}
          isActive={activeIntent === 'social'}
          onClick={() => handlePrimaryIntentClick('social')}
        />
        {user?.isAdmin ? (
          <TabButton
            label="Admin"
            icon={UsersCogIcon}
            isActive={activeIntent === 'admin'}
            onClick={() => handlePrimaryIntentClick('admin')}
          />
        ) : null}

        <div className="flex-1" />

        {/* Premium polish: always-visible jump to the full tool grid */}
        <button
          onClick={jumpToAllTools}
          className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium border border-slate-700/80 bg-slate-900/40 text-slate-300 hover:bg-slate-800/50 hover:text-white transition-colors"
          title="Jump to the full tool list"
        >
          All Tools
        </button>

        {/* Rightmost utility: keep feedback visible without cluttering primary tools */}
        <TabButton
          label="Feedback"
          icon={ChatBubbleIcon}
          isActive={isFeedbackModalOpen}
          onClick={() => setIsFeedbackModalOpen(true)}
        />
      </nav>

      {renderIntentSubnav()}

      <main ref={mainScrollRef} onScroll={handleMainScroll} className="flex-1 flex flex-col overflow-y-auto">
        <div className="flex-1 flex flex-col animate-fade-in">
          {/* Demo Mode v2 (Phase 3): Guided Showcase tour bar */}
          <DemoTourBar activeView={activeView} onNavigate={demoGuardSetActiveView} />

          {renderContent()}
        </div>
      </main>
      
      
      {showFooter && (
        <footer className="p-4 border-t border-slate-800">
          <div className="flex items-center bg-slate-800 rounded-lg">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend()}
              placeholder="Describe the effect you're working on..."
              className="flex-1 w-full bg-transparent px-4 py-3 text-white placeholder-slate-400 focus:outline-none"
              disabled={isLoading}
            />
            <button onClick={() => handleSend()} disabled={isLoading || !input.trim()} className="p-3 text-purple-400 hover:text-purple-300 disabled:text-slate-600 transition-colors">
              <SendIcon className="w-6 h-6" />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};

export default MagicianMode;