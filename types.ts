
import React from 'react';

export type Mode = 'selection' | 'audience' | 'magician' | 'auth' | 'about' | 'live-feedback';

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

export interface SavedIdea {
  id: string;
  type: IdeaType;
  title?: string;
  content: string; 
  timestamp: number;
  tags?: string[];
}

export interface TrickIdentificationResult {
  trickName: string;
  videoExamples: {
    title: string;
    url: string;
  }[];
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
  | 'semi-pro';

export interface User {
  id?: string;
  email: string;
  membership: Membership;
  isAdmin?: boolean;
  trialEndDate?: number; 
  generationCount: number;
  lastResetDate: string; // ISO String
  emailVerified?: boolean;
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
}

export interface Feedback {
  id: string;
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

export interface DirectorModeResponse {
    show_title: string;
    show_description: string;
    segments: ShowSegment[];
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

export type WidgetId = 'quick-actions' | 'upcoming-tasks' | 'latest-feedback' | 'recent-idea' | 'featured-tools';

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
  type: 'refine-idea' | 'draft-email';
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

export type MagicianTab = 'chat' | 'show-planner' | 'effect-generator' | 'identify' | 'publications' | 'community' | 'magic-wire' | 'search' | 'magic-dictionary';
export type MagicianView = MagicianTab | 'live-rehearsal' | 'visual-brainstorm' | 'saved-ideas' | 'prop-checklists' | 'magic-archives' | 'gospel-magic-assistant' | 'member-management' | 'show-feedback' | 'patter-engine' | 'mentalism-assistant' | 'marketing-campaign' | 'contract-generator' | 'assistant-studio' | 'director-mode' | 'persona-simulator' | 'video-rehearsal' | 'client-management' | 'dashboard' | 'global-search' | 'performance-analytics' | 'illusion-blueprint' | 'magic-theory-tutor';
