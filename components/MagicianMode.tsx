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
import MagicPublications from './MagicPublications';


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
      desc: 'Build printable checklists so props and setup details don’t get missed.',
      tip: 'Create a prep checklist for a routine or full show.',
    },
    'Magic Dictionary': {
      desc: 'Look up essential terms, concepts, and vocabulary used in magic.',
      tip: 'Learn what a term means and why it matters in performance.',
    },
    'Magic Theory Tutor': {
      desc: 'Study deeper ideas like structure, deception, framing, and audience management.',
      tip: 'Explore the why behind stronger magic.',
    },
    'Magic Archives': {
      desc: 'Explore classic creators, historical references, and foundational material.',
      tip: 'Research classic performers, texts, and legacy material.',
    },

    'Marketing Campaign Generator': {
      desc: 'Create promotional campaigns, launch copy, and audience-facing messaging.',
      tip: 'Generate campaign copy for a show, offer, or launch.',
    },
    'Client Proposals': {
      desc: 'Draft polished proposals for prospects, venues, and event planners.',
      tip: 'Create a client-ready proposal for a booking opportunity.',
    },
    'Booking Pitches': {
      desc: 'Write concise outreach copy to help you land more performances.',
      tip: 'Generate an email or pitch for a target venue or client.',
    },
    'Performance Contract Generator': {
      desc: 'Build event contracts with professional language and client-ready structure.',
      tip: 'Draft a clean performance contract from your event details.',
    },
    'Client Management': {
      desc: 'Track clients, events, notes, and follow-up actions in one place.',
      tip: 'Manage client details and next steps for your business.',
    },
    'Dashboard': {
      desc: 'View your overall activity, ideas, shows, and business performance at a glance.',
      tip: 'See the big picture of your creative and business workflow.',
    },
    'Search': {
      desc: 'Find ideas, shows, tasks, feedback, and saved materials across the app.',
      tip: 'Search across Magic AI Wizard content and tools.',
    },
    'Performance Analytics': {
      desc: 'Review show data, feedback patterns, and improvement trends over time.',
      tip: 'Measure what is improving and where attention is needed.',
    },

    'Magic Wire': {
      desc: 'Stay current with community conversations, releases, and industry updates.',
      tip: 'Browse curated magic news and community activity.',
    },
    'Magic Publications': {
      desc: 'Browse magazines, journals, archives, and research sources for magicians.',
      tip: 'Explore trusted publications and reference material.',
    },
    'Magic Community': {
      desc: 'Discover conventions, organizations, and online communities for magicians.',
      tip: 'Find groups, events, and places to connect.',
    },
  };

  const sections = [
    {
      title: 'Create',
      icon: LightbulbIcon,
      items: prompts.filter((p) => [
        'Effect Generator',
        'Patter Engine',
        'Innovation Engine',
        'Visual Brainstorm Studio',
        'Illusion Blueprint Generator',
      ].includes(p.title)),
    },
    {
      title: 'Rehearse',
      icon: VideoIcon,
      items: prompts.filter((p) => [
        'Live Patter Rehearsal',
        'Video Rehearsal Studio',
        'Persona Simulator',
        'Angle/Risk Analysis',
        'Rehearsal Coaching',
      ].includes(p.title)),
    },
    {
      title: 'Manage',
      icon: ChecklistIcon,
      items: prompts.filter((p) => [
        'Director Mode',
        'Show Planner',
        'Prop Checklist Generator',
        'Magic Dictionary',
        'Magic Theory Tutor',
        'Magic Archives',
      ].includes(p.title)),
    },
    {
      title: 'Business',
      icon: UsersCogIcon,
      items: prompts.filter((p) => [
        'Marketing Campaign Generator',
        'Client Proposals',
        'Booking Pitches',
        'Performance Contract Generator',
        'Client Management',
        'Dashboard',
        'Search',
        'Performance Analytics',
      ].includes(p.title)),
    },
    {
      title: 'Social',
      icon: UsersIcon,
      items: prompts.filter((p) => [
        'Magic Wire',
        'Magic Publications',
        'Magic Community',
      ].includes(p.title)),
    },
  ].filter(section => section.items.length > 0);

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const SectionIcon = section.icon;
        return (
          <section key={section.title} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800/70 border border-slate-700">
                <SectionIcon className="w-4 h-4 text-slate-300" />
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">{section.title}</h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {section.items.map((prompt) => {
                const copy = CARD_COPY[prompt.title] ?? {
                  desc: prompt.description,
                  tip: prompt.tooltip ?? prompt.description,
                };

                const locked = isViewLocked(prompt.requiredTier, user, hasAmateurAccess, hasSemiProAccess, hasProfessionalAccess, usageQuota);
                const isPrimary = PRIMARY_TITLES.has(prompt.title);
                const Icon = prompt.icon;

                return (
                  <button
                    key={prompt.title}
                    onClick={() => onPromptClick(prompt)}
                    disabled={!!locked}
                    title={copy.tip}
                    className={`group text-left rounded-2xl border p-4 transition-all duration-200 shadow-[0_6px_18px_rgba(0,0,0,0.18)] ${
                      locked
                        ? 'border-slate-700/80 bg-slate-900/55 opacity-75 cursor-not-allowed'
                        : isPrimary
                        ? 'border-purple-500/35 bg-gradient-to-br from-slate-800/95 via-slate-900/90 to-purple-950/35 hover:border-purple-400 hover:-translate-y-[1px]'
                        : 'border-slate-700 bg-slate-800/65 hover:border-slate-500 hover:-translate-y-[1px]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border ${
                        locked
                          ? 'border-slate-700 bg-slate-800/60'
                          : isPrimary
                          ? 'border-purple-400/30 bg-purple-500/10'
                          : 'border-slate-700 bg-slate-900/45'
                      }`}>
                        <Icon className={`w-5 h-5 ${locked ? 'text-slate-500' : isPrimary ? 'text-purple-200' : 'text-slate-300'}`} />
                      </div>
                      {locked ? (
                        <div className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-yellow-500/25 bg-yellow-500/10 text-yellow-100/80">
                          <LockIcon className="w-3 h-3" />
                          {locked.tierLabel}
                        </div>
                      ) : isPrimary ? (
                        <div className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-purple-500/25 bg-purple-500/10 text-purple-100/85">
                          Recommended
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3">
                      <div className={`font-semibold ${locked ? 'text-slate-300' : 'text-slate-100'}`}>{prompt.title}</div>
                      <p className={`mt-1 text-sm leading-relaxed ${locked ? 'text-slate-500' : 'text-slate-400'}`}>{copy.desc}</p>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-700/70">
                      <div className={`text-xs ${locked ? 'text-slate-500' : 'text-slate-500 group-hover:text-slate-400'} transition-colors`}>
                        {copy.tip}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};

// NOTE: File continues in canvas. PublicationsTab has been updated in this version with the new Phase 1 two-panel studio layout.
