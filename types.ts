
import React from 'react';

export type Mode =
  | 'selection'
  | 'audience'
  | 'magician'
  | 'auth'
  | 'about'
  | 'live-feedback'
  | 'audience-feedback'
  | 'founding-circle'
  | 'founder-success';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  feedback?: 'good' | 'bad';
}

export interface PredefinedPrompt {
  title: string;
  prompt: string;
  icon?: React.FC<{ className?: string }>;
}

export type IdeaType = 'text' | 'image' | 'rehearsal';
export type IdeaCategory = 'effect' | 'script' | 'image' | 'blueprint' | 'research' | 'rehearsal';

export interface SavedIdea {
  id: string;
  type: IdeaType;
  title?: string;
  content: string; 
  timestamp: number;
  tags?: string[];
  category?: IdeaCategory;
}

export interface ClientProposal {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  source?: {
    showTitle?: string;
    targetAudience?: string;
    performanceStyle?: string;
    campaignStyle?: string;
  };
}

export interface BookingPitch {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  source?: {
    showTitle?: string;
    targetAudience?: string;
    performanceStyle?: string;
    campaignStyle?: string;
  };
}


export interface TrickIdentificationResult {
  trickName: string;
  confidence?: 'High' | 'Medium' | 'Low';
  summary?: string;
  observations?: string[];
  likelyEffectPlot?: string;
  performanceStructure?: string[];
  presentationIdeas?: string[];
  angleRiskNotes?: string[];
  variations?: string[];
  /** Best-effort raw JSON returned by the model (for saving/audit/debug). */
  raw?: any;
  videoExamples: {
    title: string;
    url: string;
  }[];
}


export interface PropBuildInstructions {
  toolsRequired: string[];
  constructionSteps: string[];
  estimatedBuildTime: string;
  difficultyRating: string;
}

export interface PropConcept {
  propName: string;
  conceptSummary: string;
  performanceUse: string;
  constructionIdea: string;
  materials: string[];
  estimatedCost: string;
  transportNotes: string;
  resetSpeed: string;
  safetyNotes: string[];
  angleNotes: string[];
  buildInstructions?: PropBuildInstructions | null;
}

// Membership levels
// - The only "free" access is the 14-day trial (no permanent free tier).
// - `free`, `amateur`, and `semi-pro` are retained for backward compatibility / anonymous caps.
export type Membership =
  | 'free'
  | 'trial'
  | 'performer'
  | 'professional'
  | 'expired'
  | 'amateur'
  | 'semi-pro'
  | 'admin';

export interface User {
  id?: string;
  email: string;
  membership: Membership;
  isAdmin?: boolean;
  trialEndDate?: number; 
  generationCount: number;
  lastResetDate: string; // ISO String
  emailVerified?: boolean;

  // Founding Circle identity layer
  foundingCircleMember?: boolean;
  foundingJoinedAt?: string | null;
  foundingSource?: string | null;
  pricingLock?: string | null;
  foundingBucket?: 'admc_2026' | 'reserve_2026' | null;
}

export type AudienceTab = 'chat' | 'identify' | 'publications' | 'community' | 'feedback' | 'ask' | 'story';

// --- Types for Show Planner ---
export type TaskPriority = 'High' | 'Medium' | 'Low';
export type TaskStatus = 'To-Do' | 'Completed';

export interface Subtask {
  id: string;
  text: string;
  completed: boolean;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
}

export interface Finances {
  performanceFee: number;
  expenses: Expense[];
}

export interface ShowRehearsalSession {
  id: string;
  showId: string;
  startedAt: number;
  endedAt: number;
  durationMinutes: number;
  notes?: string;
  improvementItems?: string[];
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: number; 
  createdAt: number; 
  subtasks?: Subtask[];
  musicCue?: string;
  tags?: string[];
  // Runtime Intelligence (optional)
  durationMinutes?: number;
  resetMinutes?: number;
  energyLevel?: 'Low' | 'Medium' | 'High';
  participationLevel?: 'Low' | 'Medium' | 'High';
}

export interface Show {
    id: string;
    title: string;
    description?: string;
    tasks: Task[];
    createdAt: number;
    updatedAt: number;
    clientId?: string;
    finances?: Finances;
    tags?: string[];
    // Show Header Intelligence (optional)
    venue?: string;
    performanceDate?: number;
    status?: 'Draft' | 'Confirmed' | 'Completed';
    rehearsals?: ShowRehearsalSession[];
}


export interface Feedback {
  id: string;
  // Optional show context when feedback is collected via a show-specific QR code.
  showId?: string;
  // Optional audience reaction emoji for quick “moment” feedback.
  reaction?: '🎉' | '😲' | '😂' | '🤔' | '❤️' | '👏' | '😴' | string;
  rating: number; 
  tags: string[];
  comment: string;
  name?: string;
  timestamp: number;
  showTitle?: string;
  magicianName?: string;
  location?: string;
  performanceDate?: number; 
}

export interface Transcription {
    source: 'user' | 'model';
    text: string;
    isFinal: boolean;
}

export interface TimerState {
    startTime: number | null;
    duration: string | null;
    isRunning: boolean;
}

export interface Question {
  id: string;
  question: string;
  name?: string;
  timestamp: number;
  answer?: string;
}

export type NewsCategory = 'New Release' | 'Interview' | 'Review' | 'Community News' | 'Opinion' | 'Historical Piece';

export interface NewsArticle {
  id: string;
  category: NewsCategory;
  headline: string;
  source: string;
  sourceUrl?: string;
  summary: string;
  body: string; 
  timestamp: number;
}

export interface SuggestedEffect {
    type: string;
    rationale: string;
}

export interface ShowSegment {
    title: string;
    description: string;
    suggested_effects: SuggestedEffect[];
}

export type DirectorSegmentPurpose = 'opener' | 'middle' | 'closer';
export type DirectorInteractionLevel = 'low' | 'medium' | 'high';

export interface DirectorModeConstraints {
  props_owned: string[];
  reset_time: string; // e.g. "instant", "30s", "2 min"
  skill_level: string; // e.g. "beginner", "intermediate", "advanced"
  notes: string;
}

export interface DirectorModeSegment {
  title: string;
  purpose: DirectorSegmentPurpose;
  duration_estimate_minutes: number;
  audience_interaction_level: DirectorInteractionLevel;
  props_required: string[];
  transition_notes: string;
  // FULL mode richness (optional in types; required by FULL schema only)
  beats?: string[]; // 2–4 short bullet beats
  patter_hook?: string; // 1–2 sentences
  blocking_notes?: string; // 1–2 sentences
  volunteer_management?: string; // optional
  music_lighting?: string; // optional
}

export interface DirectorModeBlueprint {
  show_title: string;
  show_length_minutes: number;
  audience_type: string;
  venue_type: string;
  tone: string;
  performer_persona: string;
  constraints: DirectorModeConstraints;
  segments: DirectorModeSegment[];
  created_at?: string;
}

export interface Persona {
    name: string;
    description: string;
    icon: React.FC<{ className?: string }>;
}

export interface Client {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  notes?: string;
  createdAt: number;
}

export type WidgetId =
  | 'quick-actions'
  | 'upcoming-tasks'
  | 'recent-idea'
  | 'featured-tools'
  | 'business-metrics'
  | 'contract-pipeline';

export interface DashboardWidget {
  id: WidgetId;
  title: string;
  icon: React.FC<{ className?: string }>;
}

export interface DashboardLayout {
    visible: WidgetId[];
    hidden: WidgetId[];
}

export interface AiSparkAction {
  type: 'refine-idea' | 'draft-email' | 'custom-prompt';
  payload: any;
}

export type ReactionType = 'amazed' | 'laughing' | 'confused';

export interface AudienceReaction {
  type: ReactionType;
  timestamp: number; 
}

export interface Performance {
  id: string;
  showId: string;
  startTime: number;
  endTime?: number;
  reactions: AudienceReaction[];
}

export interface IllusionPrinciple {
  name: string;
  description: string;
}

export interface IllusionBlueprintResponse {
  potential_principles: IllusionPrinciple[];
  blueprint_description: string;
}

export interface MagicTheoryConcept {
  name: string;
  description: string;
}

export interface MagicTheoryLesson {
  name: string;
  concepts: MagicTheoryConcept[];
}

export interface MagicTheoryModule {
  name: string;
  lessons: MagicTheoryLesson[];
}

export interface MagicTerm {
    term: string;
    definition: string;
    references: {
        title: string;
        url: string;
    }[];
}

export interface AppSuggestion {
    id: string;
    userId?: string; 
    userEmail?: string; 
    type: 'bug' | 'feature' | 'general';
    content: string;
    timestamp: number;
    status: 'new'; 
}

export type MagicianTab =
  | 'chat'
  | 'show-planner'
  | 'effect-generator'
  | 'identify'
  | 'publications'
  | 'community'
  | 'magic-wire'
  | 'search'
  | 'magic-dictionary'
  | 'admin';
// NOTE: 'assistant-home' is a dedicated landing view for the AI Assistant tab.
// It always shows the feature grid (prompt cards) and never restores the last chat/tool session.
export type MagicianView =
  | MagicianTab
  | 'assistant-home'
  | 'live-rehearsal'
  | 'visual-brainstorm'
  | 'saved-ideas'
  | 'prop-checklists'
  | 'magic-archives'
  | 'gospel-magic-assistant'
  | 'member-management'
  | 'show-feedback'
  | 'patter-engine'
  | 'mentalism-assistant'
  | 'marketing-campaign'
  | 'client-proposals'
  | 'booking-pitches'
  | 'contract-generator'
  | 'assistant-studio'
  | 'director-mode'
  | 'persona-simulator'
  | 'video-rehearsal'
  | 'angle-risk'
  | 'client-management'
  | 'dashboard'
  | 'global-search'
  | 'performance-analytics'
  | 'illusion-blueprint'
  | 'magic-theory-tutor'
  | 'magic-dictionary';
