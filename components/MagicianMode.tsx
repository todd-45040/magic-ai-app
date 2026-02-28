
import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, PredefinedPrompt, TrickIdentificationResult, User, Transcription, MagicianView, MagicianTab, Client, Show, Feedback, SavedIdea, TaskPriority, AiSparkAction } from '../types';
import { generateResponse } from '../services/geminiService';
import { identifyTrickFromImageServer } from '../services/identifyService';
import { supabase } from '../supabase';
import { saveIdea } from '../services/ideasService';
import { exportData } from '../services/dataService';
import { findShowByTitle, addTaskToShow, addTasksToShow } from '../services/showsService';
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
import EffectGenerator from './EffectGenerator';
import DemoTourBar from './DemoTourBar';
import { getCurrentDemoView, isViewLocked } from '../services/demoTourService';
import MagicArchives from './MagicArchives';
import GospelMagicAssistant from './GospelMagicAssistant';
import MentalismAssistant from './MentalismAssistant';
import ShareButton from './ShareButton';
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
      <h2 className="text-2xl font-bold text-slate-300 mb-2 font-cinzel">AI Assistant</h2>
      <p className="text-slate-400 max-w-2xl mb-8">
        Choose a tool to start, or ask me anything. Recommended tools are highlighted.
      </p>

      <div className="w-full max-w-5xl space-y-10">
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
    <div className={`flex-1 p-4 md:p-6 ${props.messages.length > 0 ? 'overflow-y-auto' : 'flex flex-col'}`}>
      {content}
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
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleIdentifyClick: () => void;
    onRequestUpgrade: () => void;
}> = ({ imagePreview, identificationResult, isIdentifying, identificationError, identificationBlocked, fileInputRef, handleImageUpload, handleIdentifyClick, onRequestUpgrade }) => (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
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
                <div className="flex items-center justify-center p-6 bg-slate-800/50 rounded-lg">
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
                <div className="animate-fade-in bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
                    <div>
                        <h3 className="font-cinzel text-lg text-slate-300">Identified Effect</h3>
                        <p className="text-2xl font-bold text-white">{identificationResult.trickName}</p>
                    </div>
                   {identificationResult.videoExamples?.length > 0 && (
                     <div>
                        <h3 className="font-cinzel text-lg text-slate-300 mb-2">Example Performances</h3>
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
                    <div className="pt-2 flex justify-end">
                        <ShareButton
                            title={`Magic Trick: ${identificationResult.trickName}`}
                            text={`I identified a magic trick using the Magicians' AI Wizard! It's called "${identificationResult.trickName}". Check out a performance: ${identificationResult.videoExamples?.[0]?.url || '(No video link available)'}`}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
                        >
                            <ShareIcon className="w-4 h-4" />
                            <span>Share Result</span>
                        </ShareButton>
                    </div>
                </div>
            )}
        </div>
    </div>
);

const PublicationsTab: React.FC = () => (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="animate-fade-in space-y-4">
        <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Magic Publications</h2>
        <p className="text-slate-400">Essential reading for the modern magician. Stay informed on new effects, theory, and community news.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {publications.map(pub => (
                <div key={pub.name} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 transition-all duration-200 hover:border-purple-500 hover:bg-slate-800">
                    <h3 className="font-bold text-lg bg-gradient-to-r from-yellow-200 via-amber-300 to-yellow-200 bg-clip-text text-transparent">{pub.name}</h3>
                    <p className="text-slate-400 text-sm mt-1 line-clamp-3">{pub.description}</p>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-yellow-500/25 bg-yellow-500/10 text-yellow-100/80">
                        {(pub as any).type ?? 'Publication'}
                      </div>

                      {(pub as any).url ? (
                        <a
                          href={(pub as any).url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-yellow-500/25 bg-slate-900/40 hover:bg-slate-900/70 text-yellow-200 hover:text-yellow-100 transition"
                          title="Open in a new tab"
                        >
                          Visit site <span aria-hidden="true">↗</span>
                        </a>
                      ) : null}
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
);

const CommunityTab: React.FC = () => {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();

  const filteredClubs = q
    ? clubs.filter(c => (c.name + ' ' + c.description).toLowerCase().includes(q))
    : clubs;

  const filteredConventions = q
    ? conventions.filter(c => (c.name + ' ' + c.description + ' ' + (c.date ?? '')).toLowerCase().includes(q))
    : conventions;

  const onlineCommunities = [
    {
      name: 'The Magic Café',
      description: 'The classic online forum with deep threads on sleights, theory, reviews, and pros-only topics.',
      url: 'https://www.themagiccafe.com/'
    },
    {
      name: 'r/Magic (Reddit)',
      description: 'Active community for discussions, recommendations, and sharing resources.',
      url: 'https://www.reddit.com/r/Magic/'
    },
    {
      name: 'Genii Forum',
      description: 'Discussion board connected to Genii Magazine, with thoughtful threads and industry news.',
      url: 'https://forums.geniimagazine.com/'
    }
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="animate-fade-in space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-slate-200 font-cinzel">Magic Community</h2>
          <p className="text-slate-400 mt-2">
            Connect with peers, explore organizations, and discover major conventions.
          </p>
        </div>

        {/* Online communities */}
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <h3 className="text-2xl font-bold text-slate-200 font-cinzel">Online Communities</h3>
            <div className="text-xs text-slate-500">Links open in a new tab</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {onlineCommunities.map(item => (
              <a
                key={item.name}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="group bg-slate-900/35 border border-slate-700/60 rounded-xl p-4 shadow-sm hover:shadow-lg transition-all duration-200 hover:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                title={`Open ${item.name}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-bold text-lg bg-gradient-to-r from-yellow-200 via-amber-300 to-yellow-200 bg-clip-text text-transparent">
                    {item.name}
                  </h4>
                  <span className="text-slate-500 group-hover:text-slate-300 transition" aria-hidden="true">↗</span>
                </div>

                <p className="text-slate-400 text-sm mt-1 line-clamp-3">{item.description}</p>

                <div className="mt-3 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-slate-700/60 bg-slate-950/30 group-hover:bg-slate-950/60 text-purple-400 group-hover:text-white transition">
                  Visit <span aria-hidden="true">↗</span>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Clubs */}
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <h3 className="text-2xl font-bold text-slate-200 font-cinzel">Major Magic Clubs & Organizations</h3>
            <div className="text-xs text-slate-500">{filteredClubs.length} shown</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredClubs.map(club => (
              <a
                key={club.name}
                href={(club as any).url}
                target="_blank"
                rel="noreferrer"
                className="group bg-slate-900/35 border border-slate-700/60 rounded-xl p-4 shadow-sm hover:shadow-lg transition-all duration-200 hover:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                title={`Open ${club.name} website`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-bold text-lg bg-gradient-to-r from-yellow-200 via-amber-300 to-yellow-200 bg-clip-text text-transparent">
                    {club.name}
                  </h4>
                  <span className="text-slate-500 group-hover:text-slate-300 transition" aria-hidden="true">↗</span>
                </div>

                <p className="text-slate-400 text-sm mt-1 line-clamp-3">{club.description}</p>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-[11px] px-2.5 py-1 rounded-full border border-slate-700/60 bg-slate-950/25 text-purple-400">
                    Club / Org
                  </div>
                  <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-slate-700/60 bg-slate-950/30 group-hover:bg-slate-950/60 text-purple-400 group-hover:text-white transition">
                    Visit <span aria-hidden="true">↗</span>
                  </div>
                </div>
              </a>
            ))}
          </div>

          {q && filteredClubs.length === 0 && (
            <div className="text-center text-slate-500 text-sm py-6">
              No clubs match “{query}”.
            </div>
          )}
        </section>

        {/* Conventions */}
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <h3 className="text-2xl font-bold text-slate-200 font-cinzel">Popular Magic Conventions</h3>
            <div className="text-xs text-slate-500">{filteredConventions.length} shown</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredConventions.map(convention => (
              <a
                key={convention.name}
                href={(convention as any).url}
                target="_blank"
                rel="noreferrer"
                className="group bg-slate-900/35 border border-slate-700/60 rounded-xl p-4 shadow-sm hover:shadow-lg transition-all duration-200 hover:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                title={`Open ${convention.name} website`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-bold text-lg bg-gradient-to-r from-yellow-200 via-amber-300 to-yellow-200 bg-clip-text text-transparent">
                      {convention.name}
                    </h4>
                    {convention.date && (
                      <div className="text-xs font-semibold text-slate-400 mt-0.5">
                        {convention.date}
                      </div>
                    )}
                  </div>
                  <span className="text-slate-500 group-hover:text-slate-300 transition" aria-hidden="true">↗</span>
                </div>

                <p className="text-slate-400 text-sm mt-2 line-clamp-3">{convention.description}</p>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-[11px] px-2.5 py-1 rounded-full border border-slate-700/60 bg-slate-950/25 text-purple-400">
                    Convention
                  </div>
                  <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-slate-700/60 bg-slate-950/30 group-hover:bg-slate-950/60 text-purple-400 group-hover:text-white transition">
                    Visit <span aria-hidden="true">↗</span>
                  </div>
                </div>
              </a>
            ))}
          </div>

          {q && filteredConventions.length === 0 && (
            <div className="text-center text-slate-500 text-sm py-6">
              No conventions match “{query}”.
            </div>
          )}
        </section>

        {/* Search (moved to bottom) */}
        <section className="pt-2">
          <div className="max-w-2xl mx-auto">
            <div className="bg-slate-900/30 border border-slate-700/60 rounded-2xl p-4 md:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-200">Search clubs and conventions</div>
                  <div className="text-xs text-slate-500 mt-0.5">Tip: try “IBM”, “SAM”, “Blackpool”, or “FISM”.</div>
                </div>
                <div className="text-[11px] text-slate-500 hidden md:block">Filters results above</div>
              </div>

              <div className="mt-3 relative">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type to filter…"
                  className="w-full rounded-xl bg-slate-950/40 border border-slate-700/60 px-4 py-3 pl-10 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/50"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  <span aria-hidden="true">🔎</span>
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
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};


interface MagicianModeProps {
  onBack: () => void;
  user: User;
  onUpgrade: (tier: 'amateur' | 'professional') => void;
  onLogout: () => void;
}

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
  const { shows, clients, feedback, ideas } = useAppState();
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
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
    // New user: guide into first "win"
    if (isNewUser) {
      return {
        label: "Today’s Focus",
        title: "Generate Your First Effect",
        subtitle: "Start with the Effect Generator and save your first idea — it only takes a minute.",
        ctaLabel: "Open Effect Generator",
        route: "effect-generator" as const,
        icon: "hat" as const,
      };
    }

    // Pro (or trial): emphasize next show planning
    if (hasProfessionalAccess && latestShow?.title) {
      return {
        label: "Today’s Focus",
        title: "Prepare for Your Upcoming Show",
        subtitle: `Open Show Planner for “${latestShow.title}”.`,
        ctaLabel: "Open Show Planner",
        route: "show-planner" as const,
        icon: "planner" as const,
      };
    }

    // Returning user: continue latest saved work
    if (latestIdea?.title || latestIdea?.name) {
      const t = (latestIdea.title || latestIdea.name || "your latest idea") as string;
      return {
        label: "Today’s Focus",
        title: "Continue Last Project",
        subtitle: `Continue working on “${t}”.`,
        ctaLabel: "View Saved Ideas",
        route: "saved-ideas" as const,
        icon: "idea" as const,
      };
    }

    // Fallback
    return {
      label: "Today’s Focus",
      title: "Pick Up Where You Left Off",
      subtitle: "Jump into your tools and keep building your act.",
      ctaLabel: "Open AI Assistant",
      route: "assistant" as const,
      icon: "assistant" as const,
    };
  })();

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
    }
  };

  const handleIdentifyClick = async () => {
    if (!imagePreview || !imageFile) return;

    const base64Data = imagePreview.split(',')[1];
    const mimeType = imageFile.type;

    setIsIdentifying(true);
    setIdentificationError(null);
    setIdentificationResult(null);
    setIdentificationBlocked(null);

    try {
        const result = await identifyTrickFromImageServer(base64Data, mimeType, user);
        setIdentificationResult(result);
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

    // Phase 7: Founder-only preview access (scarcity + identity).
    // Certain tools can be temporarily restricted to Founding Circle members before Stripe goes live.
    const founderPreviewViews = new Set<MagicianView>([
      'video-rehearsal',
    ]);

    if (founderPreviewViews.has(view) && !user?.isAdmin && !user?.foundingCircleMember) {
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
          // Phase 2 (Activation Optimization): First Win Under 90 Seconds
          // If the user has no ideas and no shows yet, guide them into a single-click flow.
          const showFirstWinGate = !user?.isAdmin && (ideas?.length ?? 0) === 0 && (shows?.length ?? 0) === 0;
          if (showFirstWinGate) {
            return <FirstWinGate user={user} onNavigate={handleNavigate} />;
          }

          return (
            <>
            <div className="px-4 md:px-6 pt-6">
              <p className="text-sm uppercase tracking-wider text-yellow-300/80">
                Magic AI Wizard Dashboard
              </p>
              <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-white leading-tight">
                Your AI Assistant for Creating, Rehearsing, and Running <span className="text-yellow-200">Better Magic Shows</span>
              </h1>
              <p className="mt-2 text-sm text-white/60">
                Welcome back, {user.name || (user.email ? user.email.split('@')[0] : 'magician')}.
              </p>
            </div>

            {/* Primary Action */}
            <div className="px-4 md:px-6 mb-6">
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-purple-500/10 via-transparent to-yellow-500/10" />
                <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/20 bg-purple-500/15 text-purple-200">
                      <MagicHatIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-purple-200/90">{todaysFocus.label}</p>
                      <h2 className="mt-1 text-lg font-semibold text-white md:text-xl">{todaysFocus.title}</h2>
                      <p className="mt-1 text-sm text-white/65">{todaysFocus.subtitle}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleNavigate(todaysFocus.route)}
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
              onRequestUpgrade={() => setIsUpgradeModalOpen(true)}
            />
          );
        case 'video-rehearsal': return <VideoRehearsal onIdeaSaved={() => handleIdeaSaved('Video analysis saved!')} user={user} />;
        case 'angle-risk': return <AngleRiskAnalysis user={user} onIdeaSaved={() => handleIdeaSaved('Angle/Risk analysis saved!')} />;
        case 'visual-brainstorm': return <VisualBrainstorm onIdeaSaved={() => handleIdeaSaved('Image idea saved!')} user={user} />;
        case 'saved-ideas': return <SavedIdeas onAiSpark={handleAiSpark} initialIdeaId={initialIdeaId || undefined} />;
        case 'prop-checklists': return <PropChecklists user={user} onIdeaSaved={() => handleIdeaSaved('Checklist saved!')} onNavigateShowPlanner={() => setActiveView('show-planner')} />;
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
            />
          );
        case 'client-management': return <ClientManagement onClientsUpdate={handleClientsUpdate} onAiSpark={handleAiSpark} onOpenShowPlanner={handleOpenShowPlannerFromClient} />;
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
              fileInputRef={fileInputRef}
              handleImageUpload={handleImageUpload}
              handleIdentifyClick={handleIdentifyClick}
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
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden text-[11px]">{label}</span>
      {isLocked && <LockIcon className="absolute top-1 right-1 w-3 h-3 text-amber-400/80" />}
    </button>
  );

  const activeTab = VIEW_TO_TAB_MAP[activeView];
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


      <nav className="flex items-center gap-1 border-b border-slate-800 px-2 md:px-4 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {/*
          "AI Assistant" is the *home* of the assistant area (the grid of feature cards).
          Users expect this to act like a Home button.
          If we route to 'chat' here, and a tool view is persisted, the app can feel "stuck".
        */}
        <TabButton
          label="AI Assistant"
          icon={WandIcon}
          isActive={activeView === 'dashboard' || activeTab === 'chat'}
          onClick={() => {
            // Clear any persisted tool view so we always land on the grid.
            try { localStorage.removeItem('magician_active_view'); } catch {}
            resetInlineForms();
            setActiveView('dashboard');
          }}
        />
        <TabButton label="Show Planner" icon={ChecklistIcon} isActive={activeTab === 'show-planner'} onClick={() => handleTabClick('show-planner')} isLocked={!hasAmateurAccess} />
        <TabButton label="Effect Generator" icon={LightbulbIcon} isActive={activeTab === 'effect-generator'} onClick={() => handleTabClick('effect-generator')} />
        <TabButton label="Identify Trick" icon={CameraIcon} isActive={activeTab === 'identify'} onClick={() => handleTabClick('identify')} />
        <TabButton label="Magic Wire" icon={NewspaperIcon} isActive={activeTab === 'magic-wire'} onClick={() => handleTabClick('magic-wire')} />
        <TabButton label="Publications" icon={NewspaperIcon} isActive={activeTab === 'publications'} onClick={() => handleTabClick('publications')} />
        <TabButton label="Community" icon={UsersIcon} isActive={activeTab === 'community'} onClick={() => handleTabClick('community')} />
        {user?.isAdmin ? (
          <TabButton
            label="Admin"
            icon={UsersCogIcon}
            isActive={activeTab === 'admin'}
            onClick={() => handleTabClick('admin')}
          />
        ) : null}

        {/* Rightmost utility: keep feedback visible without cluttering primary tools */}
        <TabButton
          label="Feedback"
          icon={ChatBubbleIcon}
          isActive={isFeedbackModalOpen}
          onClick={() => setIsFeedbackModalOpen(true)}
        />
      </nav>

      <main className="flex-1 flex flex-col overflow-y-auto">
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