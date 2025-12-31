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
  content: string; // Text content, base64 image data URL, or JSON string for rehearsals
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

export type Membership = 'trial' | 'amateur' | 'semi-pro' | 'professional' | 'expired';

export interface User {
  email: string;
  membership: Membership;
  isAdmin?: boolean;
  trialEndDate?: number; // Timestamp
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
  dueDate?: number; // timestamp
  createdAt: number; // timestamp
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


// --- New type for Feedback ---
export interface Feedback {
  id: string;
  rating: number; // 1-5
  tags: string[];
  comment: string;
  name?: string;
  timestamp: number;
  showTitle?: string;
  magicianName?: string;
  location?: string;
  performanceDate?: number; // timestamp
}

// --- New type for Live Rehearsal ---
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


// --- New type for Ask the Magician ---
export interface Question {
  id: string;
  question: string;
  name?: string;
  timestamp: number;
  answer?: string;
}

// --- New types for Magic Wire News Feed ---
export type NewsCategory = 'New Release' | 'Interview' | 'Review' | 'Community News' | 'Opinion' | 'Historical Piece';

export interface NewsArticle {
  id: string;
  category: NewsCategory;
  headline: string;
  source: string; 
  summary: string;
  body: string; 
  timestamp: number;
}

// --- New types for Director Mode ---
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

// --- New type for Persona Simulator ---
export interface Persona {
    name: string;
    description: string;
    icon: React.FC<{ className?: string }>;
}

// --- New type for Client Management (CRM) ---
export interface Client {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  notes?: string;
  createdAt: number;
}

// --- New types for Dashboard ---
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

// --- New type for AI Sparks ---
export interface AiSparkAction {
  type: 'refine-idea' | 'draft-email';
  payload: any; // Can be idea content, client object, etc.
}

// --- New types for Performance Analytics ---
export type ReactionType = 'amazed' | 'laughing' | 'confused';

export interface AudienceReaction {
  type: ReactionType;
  timestamp: number; // Timestamp of when the reaction occurred
}

export interface Performance {
  id: string;
  showId: string;
  startTime: number;
  endTime?: number;
  reactions: AudienceReaction[];
}

// --- New types for Illusion Blueprint Generator ---
export interface IllusionPrinciple {
  name: string;
  description: string;
}

export interface IllusionBlueprintResponse {
  potential_principles: IllusionPrinciple[];
  blueprint_description: string;
}

// --- New types for Magic Theory Tutor ---
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

// --- New type for Magic Dictionary ---
export interface MagicTerm {
    term: string;
    definition: string;
    references: {
        title: string;
        url: string;
    }[];
}

// --- New type for App Suggestions/Feedback ---
export interface AppSuggestion {
    id: string;
    userId?: string; // Optional, can be anonymous
    userEmail?: string; // Optional
    type: 'bug' | 'feature' | 'general';
    content: string;
    timestamp: number;
    status: 'new'; // For admin triage
}


export type MagicianTab = 'chat' | 'show-planner' | 'effect-generator' | 'identify' | 'publications' | 'community' | 'magic-wire' | 'search' | 'magic-dictionary';
export type MagicianView = MagicianTab | 'live-rehearsal' | 'visual-brainstorm' | 'saved-ideas' | 'prop-checklists' | 'magic-archives' | 'gospel-magic-assistant' | 'member-management' | 'show-feedback' | 'patter-engine' | 'mentalism-assistant' | 'marketing-campaign' | 'contract-generator' | 'assistant-studio' | 'director-mode' | 'persona-simulator' | 'video-rehearsal' | 'client-management' | 'dashboard' | 'global-search' | 'performance-analytics' | 'illusion-blueprint' | 'magic-theory-tutor';