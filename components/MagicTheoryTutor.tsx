import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Type } from '@google/genai';
import { MAGIC_THEORY_CURRICULUM, MAGIC_THEORY_TUTOR_SYSTEM_INSTRUCTION } from '../constants';
import type {
  ChatMessage,
  MagicTheoryModule,
  MagicTheoryLesson,
  SavedIdea,
  Show,
  Task,
  User,
} from '../types';
import { generateResponse, generateStructuredResponse } from '../services/geminiService';
import { getSavedIdeas } from '../services/ideasService';
import { getShows } from '../services/showsService';
import { TutorIcon, WandIcon, SendIcon, CheckIcon, BookIcon } from './icons';
import { useToast } from './ToastProvider';
import FormattedText from './FormattedText';

const TUTOR_PROGRESS_KEY = 'magic_theory_tutor_progress';

const createChatMessage = (role: 'user' | 'model', text: string): ChatMessage => ({
  id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
  role,
  text,
});

const LoadingIndicator: React.FC = () => (
  <div className="flex items-center space-x-1">
    <div className="w-2 h-2 bg-purple-300 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
    <div className="w-2 h-2 bg-purple-300 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
    <div className="w-2 h-2 bg-purple-300 rounded-full animate-bounce"></div>
  </div>
);

interface Progress {
  module: number;
  lesson: number;
  concept: number;
}

type LessonRef = { moduleIndex: number; lessonIndex: number };

type Intensity = 'Casual' | 'Advanced' | 'Academic';
type SessionMode = 'none' | 'guided' | 'quick' | 'apply';
type TutorPhase = 'idle' | 'socratic' | 'challenge' | 'feedback' | 'complete';

const estimateMinutes = (lesson: MagicTheoryLesson) => {
  // Predictable estimate that reads well in UI.
  const mins = 6 + (lesson.concepts?.length ?? 1) * 3;
  return Math.max(8, Math.min(12, mins));
};

const getLessonSummary = (lesson: MagicTheoryLesson) => {
  const first = lesson.concepts?.[0]?.description?.trim();
  if (!first) return 'A focused lesson to strengthen your performance craft through practical magic theory.';
  return first.length > 180 ? `${first.slice(0, 177)}...` : first;
};

const getWhyThisMatters = (lessonName: string) => {
  const name = lessonName.toLowerCase();
  if (name.includes('clarity')) {
    return 'Clarity of effect determines how strongly the audience remembers your magic — and how impossible it feels.';
  }
  if (name.includes('surprise')) {
    return 'Surprise is the emotional spike that turns a good trick into a moment people talk about afterward.';
  }
  if (name.includes('pacing') || name.includes('timing')) {
    return 'Timing is misdirection. The right pause makes the method invisible and the revelation unforgettable.';
  }
  if (name.includes('theatrical') || name.includes('arc')) {
    return 'Structure creates meaning. A strong arc gives your magic momentum and a satisfying finish.';
  }
  return 'Theory turns “moves” into “moments.” It helps you shape reactions, not just methods.';
};

const getDirectorsInsight = (lessonName: string) => {
  const name = lessonName.toLowerCase();
  if (name.includes('clarity')) return 'Most magicians explain too much. Give the audience one simple sentence they can repeat.';
  if (name.includes('surprise')) return 'Telegraph the obvious ending… then break it. The contrast creates the gasp.';
  if (name.includes('pacing') || name.includes('timing')) return 'Most magicians rush the surprise moment. The pause creates the miracle.';
  if (name.includes('theatrical') || name.includes('arc')) return 'If your opener wins attention, your closer must earn meaning.';
  return 'When in doubt: simplify the effect, slow the reveal, and let the audience feel smart before you fool them.';
};

function safeTitle(v: any) {
  const s = String(v ?? '').trim();
  return s || 'Untitled';
}

function taskLabel(task: Partial<Task>) {
  const title = safeTitle((task as any)?.title ?? (task as any)?.taskTitle);
  const status = String((task as any)?.status ?? '').trim();
  const pr = String((task as any)?.priority ?? '').trim();
  const bits = [title];
  if (status) bits.push(`(${status})`);
  if (pr) bits.push(`• ${pr}`);
  return bits.join(' ');
}

function buildIntensityPreamble(intensity: Intensity) {
  if (intensity === 'Casual') {
    return 'Teaching level: CASUAL. Keep answers simple, friendly, and practical. Avoid jargon. Keep each message under 120 words.';
  }
  if (intensity === 'Advanced') {
    return 'Teaching level: ADVANCED. Assume performer experience. Use practical directing language. Keep each message under 160 words.';
  }
  return 'Teaching level: ACADEMIC. Use theory vocabulary and precise framing. Still stay useful. Keep each message under 180 words.';
}

function formatApplyReport(report: any, lessonName: string) {
  const lines: string[] = [];
  lines.push(`**Apply: ${lessonName}**`);
  if (report?.headline) lines.push(`\n${report.headline}`);
  if (report?.audienceBelief) lines.push(`\n**What the audience should believe**\n- ${report.audienceBelief}`);
  if (Array.isArray(report?.confusionRisks) && report.confusionRisks.length) {
    lines.push(`\n**Where confusion may occur**`);
    for (const r of report.confusionRisks.slice(0, 5)) lines.push(`- ${String(r)}`);
  }
  if (Array.isArray(report?.framingTweaks) && report.framingTweaks.length) {
    lines.push(`\n**Suggested framing tweaks**`);
    for (const t of report.framingTweaks.slice(0, 5)) lines.push(`- ${String(t)}`);
  }
  if (report?.oneSentenceEffect) lines.push(`\n**One-sentence effect**\n> ${report.oneSentenceEffect}`);
  if (report?.directorNote) lines.push(`\n> 🎩 **Director Insight:** ${report.directorNote}`);
  return lines.join('\n');
}

interface MagicTheoryTutorProps {
  user: User;
}

type RoutinePick =
  | { kind: 'idea'; idea: SavedIdea }
  | { kind: 'task'; show: Show; task: Task };

const RoutinePickerModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onPick: (pick: RoutinePick) => void;
}> = ({ open, onClose, onPick }) => {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'ideas' | 'tasks'>('ideas');
  const [loading, setLoading] = useState(false);
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const [shows, setShows] = useState<Show[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [i, s] = await Promise.all([getSavedIdeas(), getShows()]);
        if (cancelled) return;
        setIdeas(i ?? []);
        setShows(s ?? []);
      } catch (e: any) {
        console.error(e);
        showToast(e?.message || 'Failed to load your routines.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, showToast]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div>
            <div className="text-sm text-slate-400">Apply to My Routine</div>
            <div className="text-lg font-semibold text-white">Pick a saved idea or a show task</div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
            <button
              onClick={() => setTab('ideas')}
              className={`px-3 py-2 text-sm ${tab === 'ideas' ? 'bg-purple-700 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
            >
              Saved Ideas
            </button>
            <button
              onClick={() => setTab('tasks')}
              className={`px-3 py-2 text-sm ${tab === 'tasks' ? 'bg-purple-700 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
            >
              Show Planner Tasks
            </button>
          </div>
        </div>

        <div className="p-4 max-h-[65vh] overflow-y-auto">
          {loading ? (
            <div className="text-slate-300 flex items-center gap-2">
              <LoadingIndicator /> <span>Loading…</span>
            </div>
          ) : tab === 'ideas' ? (
            <div className="space-y-2">
              {ideas.length === 0 ? (
                <div className="text-slate-400">No saved ideas found yet.</div>
              ) : (
                ideas.slice(0, 40).map((idea) => (
                  <button
                    key={idea.id}
                    onClick={() => onPick({ kind: 'idea', idea })}
                    className="w-full text-left rounded-xl border border-slate-700 bg-slate-950/40 hover:bg-slate-800/40 transition px-4 py-3"
                  >
                    <div className="text-white font-semibold">{idea.title ? idea.title : safeTitle(idea.type)}</div>
                    <div className="text-slate-400 text-sm line-clamp-2 mt-1">{idea.content}</div>
                    {Array.isArray(idea.tags) && idea.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {idea.tags.slice(0, 6).map((t) => (
                          <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {shows.length === 0 ? (
                <div className="text-slate-400">No shows found yet.</div>
              ) : (
                shows.slice(0, 15).map((show) => (
                  <div key={show.id} className="rounded-xl border border-slate-700 bg-slate-950/40">
                    <div className="px-4 py-3 border-b border-slate-700">
                      <div className="text-white font-semibold">{safeTitle(show.title)}</div>
                      {show.description ? <div className="text-slate-400 text-sm">{show.description}</div> : null}
                    </div>
                    <div className="p-3 space-y-2">
                      {(show.tasks ?? []).length === 0 ? (
                        <div className="text-slate-500 text-sm">No tasks in this show.</div>
                      ) : (
                        (show.tasks ?? []).slice(0, 10).map((task: any) => (
                          <button
                            key={task.id}
                            onClick={() => onPick({ kind: 'task', show, task })}
                            className="w-full text-left rounded-lg border border-slate-800 bg-slate-900/30 hover:bg-slate-800/40 transition px-3 py-2"
                          >
                            <div className="text-slate-100">{taskLabel(task)}</div>
                            {(task as any)?.notes ? (
                              <div className="text-slate-400 text-xs line-clamp-2 mt-1">{String((task as any).notes)}</div>
                            ) : null}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MagicTheoryTutor: React.FC<MagicTheoryTutorProps> = ({ user }) => {
  const { showToast } = useToast();

  const [progress, setProgress] = useState<Progress | null>(null);
  const [activeLesson, setActiveLesson] = useState<{ module: MagicTheoryModule; lesson: MagicTheoryLesson } | null>(null);
  const [selectedLessonRef, setSelectedLessonRef] = useState<LessonRef | null>(null);
  const [resumeProgress, setResumeProgress] = useState<Progress | null>(null);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [phase, setPhase] = useState<TutorPhase>('idle');
  const [mode, setMode] = useState<SessionMode>('none');
  const [intensity, setIntensity] = useState<Intensity>('Advanced');
  const [turns, setTurns] = useState(0);
  const [challengePrompt, setChallengePrompt] = useState<string | null>(null);
  const [routineModalOpen, setRoutineModalOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const getCompletedLessons = (p: Progress | null): Set<string> => {
    if (!p) return new Set();
    const completed = new Set<string>();
    for (let m = 0; m <= p.module; m++) {
      const module = MAGIC_THEORY_CURRICULUM[m];
      const lessonLimit = m < p.module ? module.lessons.length : p.lesson;
      for (let l = 0; l < lessonLimit; l++) completed.add(`${m}-${l}`);
    }
    return completed;
  };

  useEffect(() => {
    try {
      const savedProgress = localStorage.getItem(TUTOR_PROGRESS_KEY);
      if (savedProgress) {
        const parsed = JSON.parse(savedProgress) as Progress;
        setResumeProgress(parsed);
        setCompletedLessons(getCompletedLessons(parsed));
      }
    } catch (error) {
      console.error('Failed to load tutor progress:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isLoading]);

  const selectedLesson = useMemo(() => {
    if (!selectedLessonRef) return null;
    const module = MAGIC_THEORY_CURRICULUM[selectedLessonRef.moduleIndex];
    const lesson = module?.lessons?.[selectedLessonRef.lessonIndex];
    if (!module || !lesson) return null;
    return { module, lesson };
  }, [selectedLessonRef]);

  const moduleProgress = useMemo(() => {
    return MAGIC_THEORY_CURRICULUM.map((module, mIndex) => {
      const total = module.lessons.length;
      const done = module.lessons.reduce((acc, _lesson, lIndex) => acc + (completedLessons.has(`${mIndex}-${lIndex}`) ? 1 : 0), 0);
      return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
    });
  }, [completedLessons]);

  const findNextLesson = (currentModule: number, currentLesson: number): Progress | null => {
    const module = MAGIC_THEORY_CURRICULUM[currentModule];
    if (currentLesson + 1 < module.lessons.length) return { module: currentModule, lesson: currentLesson + 1, concept: 0 };
    if (currentModule + 1 < MAGIC_THEORY_CURRICULUM.length) return { module: currentModule + 1, lesson: 0, concept: 0 };
    return null;
  };

  const startConcept = async (moduleIndex: number, lessonIndex: number, conceptIndex: number, startMode: SessionMode) => {
    const module = MAGIC_THEORY_CURRICULUM[moduleIndex];
    const lesson = module.lessons[lessonIndex];
    const concept = lesson.concepts[conceptIndex];
    if (!module || !lesson || !concept) return;

    setActiveLesson({ module, lesson });
    setProgress({ module: moduleIndex, lesson: lessonIndex, concept: conceptIndex });
    setMode(startMode);
    setPhase(startMode === 'guided' ? 'socratic' : startMode === 'quick' ? 'feedback' : 'idle');
    setTurns(0);
    setChallengePrompt(null);
    setIsLoading(true);
    setChatMessages([]);

    const baseSystem = MAGIC_THEORY_TUTOR_SYSTEM_INSTRUCTION(concept.name, concept.description);
    const systemInstruction = `${baseSystem}\n\n${buildIntensityPreamble(intensity)}\n\nYou must never reveal methods or exposure. Focus on theory, staging, scripting, and audience experience.`;

    try {
      if (startMode === 'quick') {
        const response = await generateResponse(
          `Give me a quick, structured insight on this concept. Include: (1) 3 key points, (2) 1 micro-example, (3) 1 thing to avoid.`,
          systemInstruction,
          user
        );
        setChatMessages([createChatMessage('model', response)]);
        setPhase('feedback');
      } else {
        // Guided Socratic start: ask a single question and wait.
        const schema = {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ['ask', 'challenge', 'complete'] },
            assistantText: { type: Type.STRING },
            question: { type: Type.STRING },
            challengePrompt: { type: Type.STRING },
          },
          required: ['status', 'assistantText'],
        };

        const prompt =
          `Start a Socratic lesson. Ask ONE short question.\n` +
          `Return JSON with status='ask', assistantText, and question.\n` +
          `assistantText should be 1–2 short sentences of setup. question should be the actual question.`;

        const res = await generateStructuredResponse(prompt, systemInstruction, schema, user);
        const first = `${res?.assistantText || ''}${res?.question ? `\n\n**Question:** ${res.question}` : ''}`.trim();
        setChatMessages([createChatMessage('model', first || "Let's begin. What do you think this concept changes for an audience?")]);
        setPhase('socratic');
      }
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || 'Failed to start lesson.', 'error');
      setChatMessages([createChatMessage('model', `Error: ${e?.message || 'Failed to start lesson.'}`)]);
      setPhase('feedback');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLessonSelect = (mIndex: number, lIndex: number) => {
    setSelectedLessonRef({ moduleIndex: mIndex, lessonIndex: lIndex });
  };

  const handleResume = () => {
    if (!resumeProgress) {
      showToast('No previous lesson to resume yet.', 'info');
      return;
    }
    setSelectedLessonRef({ moduleIndex: resumeProgress.module, lessonIndex: resumeProgress.lesson });
    startConcept(resumeProgress.module, resumeProgress.lesson, resumeProgress.concept ?? 0, 'guided');
  };

  const handleSend = async () => {
    if (!userInput.trim() || !progress || !activeLesson) return;
    if (isLoading) return;

    const userMessage = createChatMessage('user', userInput.trim());
    setChatMessages((prev) => [...prev, userMessage]);
    setUserInput('');
    setIsLoading(true);

    const { module, lesson, concept } = progress;
    const currentConcept = activeLesson.lesson.concepts[concept];
    const baseSystem = MAGIC_THEORY_TUTOR_SYSTEM_INSTRUCTION(currentConcept.name, currentConcept.description);
    const systemInstruction = `${baseSystem}\n\n${buildIntensityPreamble(intensity)}\n\nYou must never reveal methods or exposure. Focus on theory, staging, scripting, and audience experience.`;

    try {
      if (mode === 'guided' && phase === 'socratic') {
        const schema = {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ['ask', 'challenge', 'complete'] },
            assistantText: { type: Type.STRING },
            question: { type: Type.STRING },
            challengePrompt: { type: Type.STRING },
          },
          required: ['status', 'assistantText'],
        };

        const nextTurn = turns + 1;
        const mustAdvance = nextTurn >= 2;
        const prompt =
          `Continue the Socratic coaching based on the user's answer.\n` +
          `- Give short feedback in assistantText (1–4 sentences).\n` +
          `- If you need more info, ask ONE follow-up question (status='ask', include question).\n` +
          `- If ready for a drill, set status='challenge' and include challengePrompt (one sentence).\n` +
          `- If the drill was already done and the user answered it well, set status='complete'.\n` +
          (mustAdvance
            ? `\nYou have already asked enough. Do NOT ask another question. Return status='challenge' with a drill.`
            : `\nTry to ask at most ONE follow-up question total.`);

        // Use full chat history for better adaptivity.
        const history = chatMessages;
        const res = await generateStructuredResponse(prompt, systemInstruction, schema, user);
        setTurns(nextTurn);

        if (res?.status === 'challenge') {
          setChallengePrompt(String(res?.challengePrompt || 'Rewrite your effect in one sentence.'));
          setPhase('challenge');
          const msg = `${String(res?.assistantText || '').trim()}\n\n**Quick Drill:** ${String(res?.challengePrompt || 'Rewrite your effect in one sentence.').trim()}`.trim();
          setChatMessages((prev) => [...prev, createChatMessage('model', msg)]);
        } else if (res?.status === 'complete') {
          setPhase('feedback');
          setChatMessages((prev) => [...prev, createChatMessage('model', String(res?.assistantText || 'Nice work.'))]);
        } else {
          const msg = `${String(res?.assistantText || '').trim()}${res?.question ? `\n\n**Question:** ${String(res.question).trim()}` : ''}`.trim();
          setChatMessages((prev) => [...prev, createChatMessage('model', msg || 'Tell me more. What would the audience say happened?')]);
        }
      } else if (mode === 'guided' && phase === 'challenge') {
        // Evaluate drill response.
        const schema = {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ['complete'] },
            assistantText: { type: Type.STRING },
            improvement: { type: Type.ARRAY, items: { type: Type.STRING } },
            polishedOneLiner: { type: Type.STRING },
          },
          required: ['status', 'assistantText'],
        };

        const prompt =
          `The user answered the Quick Drill: "${challengePrompt ?? ''}"\n` +
          `Evaluate their answer. Return JSON with status='complete', assistantText, polishedOneLiner, and up to 3 improvement bullets.`;

        const res = await generateStructuredResponse(prompt, systemInstruction, schema, user);
        const lines: string[] = [];
        lines.push(String(res?.assistantText || 'Great.'));
        if (res?.polishedOneLiner) lines.push(`\n**Polished one-liner:**\n> ${String(res.polishedOneLiner)}`);
        if (Array.isArray(res?.improvement) && res.improvement.length) {
          lines.push(`\n**Tighten it further:**`);
          for (const b of res.improvement.slice(0, 3)) lines.push(`- ${String(b)}`);
        }
        setChatMessages((prev) => [...prev, createChatMessage('model', lines.join('\n'))]);
        setPhase('feedback');
      } else {
        // Fallback (should be rare)
        const history = chatMessages;
        const response = await generateResponse(userMessage.text, systemInstruction, user, history);
        setChatMessages((prev) => [...prev, createChatMessage('model', response)]);
        setPhase('feedback');
      }
    } catch (e: any) {
      console.error(e);
      setChatMessages((prev) => [...prev, createChatMessage('model', `Error: ${e?.message || 'Failed to reach the AI tutor.'}`)]);
      setPhase('feedback');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextConcept = async () => {
    if (!progress || !activeLesson) return;
    const { module, lesson, concept } = progress;

    if (concept + 1 < activeLesson.lesson.concepts.length) {
      await startConcept(module, lesson, concept + 1, 'guided');
      return;
    }

    // Lesson complete
    const newCompleted = new Set(completedLessons);
    newCompleted.add(`${module}-${lesson}`);
    setCompletedLessons(newCompleted);
    setPhase('complete');

    const nextProgress = findNextLesson(module, lesson);
    if (nextProgress) {
      try {
        localStorage.setItem(TUTOR_PROGRESS_KEY, JSON.stringify(nextProgress));
        setResumeProgress(nextProgress);
      } catch (error) {
        console.error('Failed to save tutor progress:', error);
      }
    }
  };

  const handleStartNextLesson = () => {
    if (!progress) return;
    const next = findNextLesson(progress.module, progress.lesson);
    if (!next) return;
    setSelectedLessonRef({ moduleIndex: next.module, lessonIndex: next.lesson });
    startConcept(next.module, next.lesson, next.concept, 'guided');
  };

  const handleBeginGuided = () => {
    if (!selectedLesson) return;
    const mIndex = selectedLessonRef!.moduleIndex;
    const lIndex = selectedLessonRef!.lessonIndex;
    startConcept(mIndex, lIndex, 0, 'guided');
  };

  const handleQuickInsight = () => {
    if (!selectedLesson) return;
    const mIndex = selectedLessonRef!.moduleIndex;
    const lIndex = selectedLessonRef!.lessonIndex;
    startConcept(mIndex, lIndex, 0, 'quick');
  };

  const handleApplyToRoutine = () => {
    if (!selectedLesson && !activeLesson) {
      showToast('Select a lesson first.', 'info');
      return;
    }
    setRoutineModalOpen(true);
  };

  const applyPickedRoutine = async (pick: RoutinePick) => {
    setRoutineModalOpen(false);
    const lessonName = (activeLesson?.lesson?.name ?? selectedLesson?.lesson?.name ?? 'Lesson');
    const conceptName = progress && activeLesson ? activeLesson.lesson.concepts[progress.concept]?.name : undefined;

    const routineText =
      pick.kind === 'idea'
        ? `Saved Idea\nTitle: ${pick.idea.title ?? 'Untitled'}\nTags: ${(pick.idea.tags ?? []).join(', ')}\nContent:\n${pick.idea.content}`
        : `Show Planner Task\nShow: ${pick.show.title}\nTask: ${taskLabel(pick.task)}\nNotes:\n${String((pick.task as any)?.notes ?? '')}`;

    const conceptDesc = progress && activeLesson ? activeLesson.lesson.concepts[progress.concept]?.description : '';
    const baseSystem = MAGIC_THEORY_TUTOR_SYSTEM_INSTRUCTION(conceptName ?? lessonName, conceptDesc || '');
    const systemInstruction = `${baseSystem}\n\n${buildIntensityPreamble(intensity)}\n\nYou must never reveal methods or exposure. Focus on theory, staging, scripting, and audience experience.`;

    setIsLoading(true);
    try {
      const schema = {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING },
          audienceBelief: { type: Type.STRING },
          confusionRisks: { type: Type.ARRAY, items: { type: Type.STRING } },
          framingTweaks: { type: Type.ARRAY, items: { type: Type.STRING } },
          oneSentenceEffect: { type: Type.STRING },
          directorNote: { type: Type.STRING },
        },
        required: ['audienceBelief', 'confusionRisks', 'framingTweaks', 'oneSentenceEffect'],
      };

      const prompt =
        `Apply the lesson "${lessonName}" to this routine.\n\n` +
        `Routine:\n${routineText}\n\n` +
        `Return JSON with: headline, audienceBelief, confusionRisks[], framingTweaks[], oneSentenceEffect, directorNote.\n` +
        `Keep it practical. No method exposure.`;

      const report = await generateStructuredResponse(prompt, systemInstruction, schema, user);
      const formatted = formatApplyReport(report, lessonName);

      setChatMessages((prev) => {
        const intro = createChatMessage('model', formatted);
        return prev.length ? [...prev, intro] : [intro];
      });
      setMode('apply');
      setPhase('feedback');
    } catch (e: any) {
      console.error(e);
      setChatMessages((prev) => [...prev, createChatMessage('model', `Error: ${e?.message || 'Failed to apply lesson to routine.'}`)]);
      setPhase('feedback');
    } finally {
      setIsLoading(false);
    }
  };

  const rightPanel = () => {
    if (!activeLesson) {
      if (!selectedLesson) {
        return (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <TutorIcon className="w-24 h-24 text-slate-600 mb-4" />
            <h2 className="text-2xl font-bold text-slate-300 font-cinzel">Magic Theory Tutor</h2>
            <p className="text-slate-400 max-w-md mt-2">Select a lesson from the curriculum to begin your structured journey into the art and science of magic.</p>
          </div>
        );
      }

      const mins = estimateMinutes(selectedLesson.lesson);
      const summary = getLessonSummary(selectedLesson.lesson);
      const why = getWhyThisMatters(selectedLesson.lesson.name);
      const insight = getDirectorsInsight(selectedLesson.lesson.name);

      return (
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
                <BookIcon className="w-6 h-6 text-purple-300" />
              </div>
              <div className="flex-1">
                <div className="text-xs uppercase text-slate-400">{selectedLesson.module.name}</div>
                <h2 className="text-2xl font-bold text-white mt-1">{selectedLesson.lesson.name}</h2>
                <div className="text-slate-400 mt-2">Estimated time: <span className="text-slate-200 font-semibold">{mins} min</span></div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
              <button onClick={handleBeginGuided} className="px-4 py-3 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-semibold flex items-center justify-center gap-2">
                <WandIcon className="w-5 h-5" /> Begin Guided Session
              </button>
              <button onClick={handleQuickInsight} className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold">Quick Insight Mode</button>
              <button onClick={handleApplyToRoutine} className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold">Apply to My Routine</button>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-900/40 p-5">
              <div className="text-sm font-semibold text-slate-200">Lesson summary</div>
              <div className="text-slate-300 mt-2">{summary}</div>
            </div>

            <div className="mt-4 rounded-2xl border border-yellow-600/40 bg-yellow-900/20 p-5">
              <div className="text-sm font-semibold text-yellow-200">Why this matters</div>
              <div className="text-yellow-100/90 mt-2">{why}</div>
            </div>

            <div className="mt-4 rounded-2xl border border-purple-700/40 bg-purple-900/20 p-5">
              <div className="text-sm font-semibold text-purple-200">🎩 Director Insight</div>
              <div className="text-purple-100/90 mt-2">{insight}</div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/30 p-5">
              <div className="text-sm font-semibold text-slate-200">Lesson intensity</div>
              <div className="text-slate-400 text-sm mt-1">Choose how deep the tutor goes.</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['Casual', 'Advanced', 'Academic'] as Intensity[]).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setIntensity(lvl)}
                    className={`px-3 py-2 rounded-lg text-sm border ${intensity === lvl ? 'bg-purple-800 border-purple-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'}`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Active lesson (chat)
    const lessonName = activeLesson.lesson.name;
    const directorInsight = getDirectorsInsight(lessonName);

    return (
      <>
        <header className="p-4 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xs uppercase text-slate-400">{activeLesson.module.name}</h3>
              <h2 className="text-lg font-bold text-white">{activeLesson.lesson.name}</h2>
              {progress && <p className="text-sm text-purple-300">{activeLesson.lesson.concepts[progress.concept].name}</p>}
            </div>
            <div className="hidden md:block text-right max-w-sm">
              <div className="text-xs text-slate-500">🎩 Director Insight</div>
              <div className="text-xs text-slate-300">{directorInsight}</div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Intensity</span>
              <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
                {(['Casual', 'Advanced', 'Academic'] as Intensity[]).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setIntensity(lvl)}
                    className={`px-3 py-1.5 text-xs ${intensity === lvl ? 'bg-purple-800 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleApplyToRoutine}
              className="px-3 py-2 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
              title="Apply this concept to a Saved Idea or Show Planner Task"
            >
              Apply to My Routine
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {chatMessages.map((msg) => (
            <div key={msg.id} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'model' ? (
                <>
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                    <TutorIcon className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="max-w-2xl px-4 py-3 rounded-2xl bg-slate-700 text-slate-200">
                    <FormattedText text={msg.text} />
                  </div>
                </>
              ) : (
                <div className="max-w-2xl px-4 py-3 rounded-2xl bg-purple-800 text-white">
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                <TutorIcon className="w-5 h-5 text-purple-400" />
              </div>
              <div className="max-w-lg px-4 py-2 rounded-xl bg-slate-700 text-slate-200"><LoadingIndicator /></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <footer className="p-4 border-t border-slate-800">
          {phase === 'socratic' || phase === 'challenge' || phase === 'feedback' ? (
            <div className="flex items-center bg-slate-800 rounded-xl border border-slate-700">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend()}
                placeholder={
                  phase === 'challenge'
                    ? 'Type your drill answer…'
                    : 'Type your answer…'
                }
                className="flex-1 w-full bg-transparent px-4 py-3 text-white placeholder-slate-400 focus:outline-none"
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !userInput.trim()}
                className="p-3 text-purple-400 hover:text-purple-300 disabled:text-slate-600"
                title="Send"
              >
                <SendIcon className="w-6 h-6" />
              </button>
            </div>
          ) : phase === 'complete' ? (
            <div className="text-center p-4 bg-green-900/30 rounded-xl border border-green-700/50">
              <h3 className="font-bold text-green-300">Lesson Complete!</h3>
              {progress && findNextLesson(progress.module, progress.lesson) ? (
                <button
                  onClick={handleStartNextLesson}
                  className="mt-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded-md text-white font-semibold"
                >
                  Start Next Lesson
                </button>
              ) : (
                <p className="text-slate-300">Congratulations, you have completed the course!</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  setActiveLesson(null);
                  setProgress(null);
                  setChatMessages([]);
                  setPhase('idle');
                  setMode('none');
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
              >
                Back to Lesson Overview
              </button>
            </div>
          )}

          {/* Continue button appears after feedback for guided & quick */}
          {(phase === 'feedback' && mode !== 'apply') && (
            <button
              onClick={handleNextConcept}
              className="mt-3 w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold"
            >
              Continue
            </button>
          )}
        </footer>
      </>
    );
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">
      <RoutinePickerModal
        open={routineModalOpen}
        onClose={() => setRoutineModalOpen(false)}
        onPick={applyPickedRoutine}
      />

      {/* Curriculum Menu */}
      <nav className="w-full md:w-1/3 lg:w-1/4 p-4 border-b md:border-b-0 md:border-r border-slate-700 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-200 font-cinzel">Curriculum</h2>
          <button
            onClick={handleResume}
            className="text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
            title="Resume last saved lesson"
          >
            Resume Last Lesson
          </button>
        </div>

        <div className="space-y-4">
          {MAGIC_THEORY_CURRICULUM.map((module, mIndex) => (
            <div key={module.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-purple-400">{module.name}</h3>
                <div className="text-xs text-slate-400">
                  {moduleProgress[mIndex]?.done ?? 0}/{moduleProgress[mIndex]?.total ?? module.lessons.length} lessons
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 border border-slate-700 overflow-hidden">
                <div
                  className="h-full bg-purple-600"
                  style={{ width: `${moduleProgress[mIndex]?.pct ?? 0}%` }}
                />
              </div>
              <div className="flex items-center justify-end text-xs text-slate-500">{moduleProgress[mIndex]?.pct ?? 0}%</div>

              <ul className="space-y-1">
                {module.lessons.map((lesson, lIndex) => {
                  const isCompleted = completedLessons.has(`${mIndex}-${lIndex}`);
                  const isSelected = selectedLessonRef?.moduleIndex === mIndex && selectedLessonRef?.lessonIndex === lIndex;
                  const isActive = progress?.module === mIndex && progress?.lesson === lIndex;
                  return (
                    <li key={lesson.name}>
                      <button
                        onClick={() => {
                          handleLessonSelect(mIndex, lIndex);
                          // If currently in a lesson, don’t auto-start. Just highlight selection.
                          if (!activeLesson) return;
                        }}
                        className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition-colors ${
                          isActive
                            ? 'bg-purple-800 text-white'
                            : isSelected
                              ? 'bg-slate-800 text-white'
                              : 'hover:bg-slate-700 text-slate-200'
                        }`}
                      >
                        {isCompleted ? <CheckIcon className="w-5 h-5 text-green-400 flex-shrink-0" /> : <div className="w-5 h-5 flex-shrink-0" />}
                        <span>{lesson.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">{rightPanel()}</main>
    </div>
  );
};

export default MagicTheoryTutor;
