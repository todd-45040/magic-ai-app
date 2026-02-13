
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { MAGIC_THEORY_CURRICULUM, MAGIC_THEORY_TUTOR_SYSTEM_INSTRUCTION } from '../constants';
import type { ChatMessage, MagicTheoryModule, MagicTheoryLesson, User } from '../types';
import { generateResponse } from '../services/geminiService';
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

type TrackId = 'foundation' | 'performance' | 'advanced';

const TRACKS: { id: TrackId; title: string; desc: string; unlockAt: number; badge: string }[] = [
    { id: 'foundation', title: 'Foundation Track', desc: 'Core principles and audience psychology.', unlockAt: 0, badge: 'Start' },
    { id: 'performance', title: 'Performance Track', desc: 'Timing, structure, and directing choices.', unlockAt: 2, badge: '2+' },
    { id: 'advanced', title: 'Advanced Theory Track', desc: 'Deep theory and craft refinement.', unlockAt: 4, badge: '4+' },
];


const estimateMinutes = (lesson: MagicTheoryLesson) => {
    // Simple, predictable estimate for Tier 1.
    const mins = 6 + lesson.concepts.length * 3;
    return Math.max(8, Math.min(12, mins));
};

const getLessonSummary = (lesson: MagicTheoryLesson) => {
    const first = lesson.concepts?.[0]?.description?.trim();
    if (!first) return 'A focused lesson to strengthen your performance craft through practical magic theory.';
    // Keep it short so the right panel reads like a “lesson card”.
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

interface MagicTheoryTutorProps {
    user: User;
}

const MagicTheoryTutor: React.FC<MagicTheoryTutorProps> = ({ user }) => {
    const [progress, setProgress] = useState<Progress | null>(null);
    const [activeLesson, setActiveLesson] = useState<{ module: MagicTheoryModule; lesson: MagicTheoryLesson; } | null>(null);
    const [selectedLessonRef, setSelectedLessonRef] = useState<LessonRef | null>(null);
    const [resumeProgress, setResumeProgress] = useState<Progress | null>(null);

    const [selectedTrack, setSelectedTrack] = useState<TrackId>('foundation');

    const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [lessonPhase, setLessonPhase] = useState<'intro' | 'feedback' | 'complete'>('intro');

    const { showToast } = useToast();

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Load progress from local storage
        try {
            const savedProgress = localStorage.getItem(TUTOR_PROGRESS_KEY);
            if (savedProgress) {
                const parsed = JSON.parse(savedProgress) as Progress;
                setResumeProgress(parsed);
                setCompletedLessons(getCompletedLessons(parsed));
            }
        } catch (error) {
            console.error("Failed to load tutor progress:", error);
        }
    }, []);

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


    const completedCount = completedLessons.size;
    const totalLessons = useMemo(() => MAGIC_THEORY_CURRICULUM.reduce((acc, m) => acc + m.lessons.length, 0), []);
    const masteryPct = Math.min(100, totalLessons ? Math.round((completedCount / totalLessons) * 100) : 0);

    const unlocked = useMemo(() => ({
        foundation: true,
        performance: completedCount >= 2,
        advanced: completedCount >= 4,
    }), [completedCount]);

    const displayModules = useMemo(() => {
        if (selectedTrack === 'foundation') return [{ module: MAGIC_THEORY_CURRICULUM[0], mIndex: 0 }];
        if (selectedTrack === 'performance') return [{ module: MAGIC_THEORY_CURRICULUM[1], mIndex: 1 }];
        return MAGIC_THEORY_CURRICULUM.map((module, mIndex) => ({ module, mIndex }));
    }, [selectedTrack]);

    const startTrack = (trackId: TrackId) => {
        const track = TRACKS.find(t => t.id === trackId)!;
        if (track.unlockAt > 0 && completedCount < track.unlockAt) {
            showToast(`Locked — complete ${track.unlockAt} lessons to unlock.`, { variant: 'info' });
            return;
        }
        setSelectedTrack(trackId);

        // Auto-select the first lesson in the track so the click always “does something”.
        if (trackId === 'foundation') {
            setSelectedLessonRef({ moduleIndex: 0, lessonIndex: 0 });
            return;
        }
        if (trackId === 'performance') {
            setSelectedLessonRef({ moduleIndex: 1, lessonIndex: 0 });
            return;
        }
        // Advanced: jump to first incomplete lesson (or the very first if all complete)
        for (let m = 0; m < MAGIC_THEORY_CURRICULUM.length; m++) {
            for (let l = 0; l < MAGIC_THEORY_CURRICULUM[m].lessons.length; l++) {
                if (!completedLessons.has(`${m}-${l}`)) {
                    setSelectedLessonRef({ moduleIndex: m, lessonIndex: l });
                    return;
                }
            }
        }
        setSelectedLessonRef({ moduleIndex: 0, lessonIndex: 0 });
    };


    const getCompletedLessons = (p: Progress | null): Set<string> => {
        if (!p) return new Set();
        const completed = new Set<string>();
        for (let m = 0; m <= p.module; m++) {
            const module = MAGIC_THEORY_CURRICULUM[m];
            const lessonLimit = (m < p.module) ? module.lessons.length : p.lesson;
            for (let l = 0; l < lessonLimit; l++) {
                completed.add(`${m}-${l}`);
            }
        }
        return completed;
    };
    
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const startConcept = async (
        moduleIndex: number,
        lessonIndex: number,
        conceptIndex: number,
        options?: { mode?: 'guided' | 'quick' | 'apply' }
    ) => {
        const module = MAGIC_THEORY_CURRICULUM[moduleIndex];
        const lesson = module.lessons[lessonIndex];
        const concept = lesson.concepts[conceptIndex];

        if (!module || !lesson || !concept) return;

        setActiveLesson({ module, lesson });
        setSelectedLessonRef({ moduleIndex, lessonIndex });
        setProgress({ module: moduleIndex, lesson: lessonIndex, concept: conceptIndex });
        setLessonPhase('intro');
        setIsLoading(true);
        setChatMessages([]);

        const systemInstruction = MAGIC_THEORY_TUTOR_SYSTEM_INSTRUCTION(concept.name, concept.description);

        const opener =
            options?.mode === 'quick'
                ? "Give me a quick overview, 3 practical takeaways, and 1 short drill question to apply this concept."
                : "Let's begin with this concept.";

        // Pass the user object to generateResponse as the 3rd argument.
        const response = await generateResponse(opener, systemInstruction, user);

        setChatMessages([createChatMessage('model', response)]);
        setIsLoading(false);
    };

    const handleSend = async () => {
        if (!userInput.trim() || !progress || !activeLesson) return;

        const userMessage = createChatMessage('user', userInput);
        setChatMessages(prev => [...prev, userMessage]);
        setUserInput('');
        setIsLoading(true);

        const { module, lesson, concept } = progress;
        const currentConcept = activeLesson.lesson.concepts[concept];
        const systemInstruction = MAGIC_THEORY_TUTOR_SYSTEM_INSTRUCTION(currentConcept.name, currentConcept.description);
        
        // This history only includes the last AI question and the user's answer
        const history = [...chatMessages.slice(-1), userMessage];

        // FIX: Reordered arguments to pass 'user' as the 3rd argument and 'history' as the 4th, matching generateResponse signature.
        const response = await generateResponse(userInput, systemInstruction, user, history);

        setChatMessages(prev => [...prev, createChatMessage('model', response)]);
        setIsLoading(false);
        setLessonPhase('feedback');
    };

    const handleNextConcept = () => {
        if (!progress || !activeLesson) return;

        const { module, lesson, concept } = progress;
        if (concept + 1 < activeLesson.lesson.concepts.length) {
            // Go to next concept in the same lesson
            startConcept(module, lesson, concept + 1);
        } else {
            // Lesson complete
            setLessonPhase('complete');
            
            // Update progress in local storage
            const newCompleted = new Set(completedLessons);
            newCompleted.add(`${module}-${lesson}`);
            setCompletedLessons(newCompleted);

            const nextProgress = findNextLesson(module, lesson);
            if (nextProgress) {
                try {
                    localStorage.setItem(TUTOR_PROGRESS_KEY, JSON.stringify(nextProgress));
                    setResumeProgress(nextProgress);
                } catch (error) {
                     console.error("Failed to save tutor progress:", error);
                }
            }
        }
    };
    
    const findNextLesson = (currentModule: number, currentLesson: number): Progress | null => {
        const module = MAGIC_THEORY_CURRICULUM[currentModule];
        if (currentLesson + 1 < module.lessons.length) {
            return { module: currentModule, lesson: currentLesson + 1, concept: 0 };
        }
        if (currentModule + 1 < MAGIC_THEORY_CURRICULUM.length) {
            return { module: currentModule + 1, lesson: 0, concept: 0 };
        }
        return null; // Course complete
    };

    const handleStartNextLesson = () => {
        if (!progress) return;
        const next = findNextLesson(progress.module, progress.lesson);
        if (next) {
            startConcept(next.module, next.lesson, next.concept);
        }
    };

    return (
        <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">
            {/* Curriculum Menu */}
            <nav className="w-full md:w-1/3 lg:w-1/4 p-4 border-b md:border-b-0 md:border-r border-slate-700 overflow-y-auto">
                <h2 className="text-xl font-bold text-slate-200 font-cinzel mb-4">Curriculum</h2>
                {resumeProgress && (
                    <button
                        onClick={() => {
                            const m = resumeProgress.module;
                            const l = resumeProgress.lesson;
                            setSelectedLessonRef({ moduleIndex: m, lessonIndex: l });
                            showToast('Ready to resume — choose a mode to continue.', {
                                label: 'Start',
                                onClick: () => startConcept(m, l, resumeProgress.concept ?? 0, { mode: 'guided' })
                            });
                        }}
                        className="w-full mb-4 px-3 py-2 rounded-lg border border-purple-500/40 bg-slate-900/40 hover:bg-slate-900/60 text-left"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-xs uppercase tracking-wider text-slate-400">Resume</div>
                                <div className="text-sm font-semibold text-white">Resume Last Lesson</div>
                            </div>
                            <div className="text-xs text-purple-300">→</div>
                        </div>
                    </button>
                
                )}

                {/* Tier 3: Theory Mastery + Curriculum Path */}
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-slate-900/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-xs uppercase tracking-wider text-amber-300/90">Theory Mastery</div>
                            <div className="mt-1 text-3xl font-bold text-white">{masteryPct}%</div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-slate-400">Lessons</div>
                            <div className="text-sm font-semibold text-slate-200">{completedCount}/{totalLessons}</div>
                        </div>
                    </div>
                    <div className="mt-3 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                        <div className="h-full bg-amber-500/80" style={{ width: `${masteryPct}%` }} />
                    </div>
                    <div className="mt-3 text-xs text-slate-400">
                        Earn mastery by completing lessons, applying concepts, and doing drills.
                    </div>
                </div>

                <div className="mb-4">
                    <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Curriculum Path</div>
                    <div className="space-y-2">
                        {TRACKS.map(t => {
                            const isLocked = t.unlockAt > 0 && completedCount < t.unlockAt;
                            const isActive = selectedTrack === t.id;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => startTrack(t.id)}
                                    className={[
                                        'w-full text-left rounded-xl border px-3 py-3 transition-colors',
                                        isActive ? 'border-purple-500/60 bg-purple-900/20' : 'border-slate-700 bg-slate-900/30 hover:bg-slate-900/50',
                                        isLocked ? 'opacity-70' : 'opacity-100',
                                    ].join(' ')}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-semibold text-slate-100">
                                                {t.title}{isLocked ? ' (Locked)' : ''}
                                            </div>
                                            <div className="text-xs text-slate-400 mt-1">{t.desc}</div>
                                        </div>
                                        <div className="text-xs text-slate-400">{t.badge}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-4">
                    {displayModules.map(({ module, mIndex }) => (
                        <div key={module.name}>
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-purple-400 mb-2">{module.name}</h3>
                            <div className="mb-2">
                                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                                    <span>{moduleProgress[mIndex]?.done ?? 0}/{moduleProgress[mIndex]?.total ?? module.lessons.length} lessons</span>
                                    <span>{moduleProgress[mIndex]?.pct ?? 0}%</span>
                                </div>
                                <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                                    <div className="h-full bg-purple-600" style={{ width: `${moduleProgress[mIndex]?.pct ?? 0}%` }} />
                                </div>
                            </div>
                            <ul className="space-y-1">
                                {module.lessons.map((lesson, lIndex) => {
                                    const isCompleted = completedLessons.has(`${mIndex}-${lIndex}`);
                                    const isActive = (progress?.module === mIndex && progress?.lesson === lIndex) || (selectedLessonRef?.moduleIndex === mIndex && selectedLessonRef?.lessonIndex === lIndex);
                                    return (
                                        <li key={lesson.name}>
                                            <button 
                                                onClick={() => setSelectedLessonRef({ moduleIndex: mIndex, lessonIndex: lIndex })}
                                                className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition-colors ${
                                                    isActive ? 'bg-purple-800 text-white' : 'hover:bg-slate-700'
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
            <main className="flex-1 flex flex-col overflow-hidden">
                {!activeLesson ? (
                    <div className="flex-1 overflow-y-auto p-6 md:p-8">
                        {!selectedLesson ? (
                            <div className="min-h-[50vh] flex flex-col items-center justify-center text-center">
                                <TutorIcon className="w-24 h-24 text-slate-600 mb-4" />
                                <h2 className="text-2xl font-bold text-slate-300 font-cinzel">Magic Theory Tutor</h2>
                                <p className="text-slate-400 max-w-md mt-2">Select a lesson from the curriculum to begin your structured journey into the art and science of magic.</p>
                            </div>
                        ) : (
                            <div className="max-w-3xl mx-auto">
                                <div className="flex items-start justify-between gap-4 mb-6">
                                    <div>
                                        <div className="text-xs uppercase tracking-wider text-slate-400">{selectedLesson.module.name}</div>
                                        <h2 className="text-3xl font-bold text-white font-cinzel">{selectedLesson.lesson.name}</h2>
                                        <p className="text-slate-300 mt-2">{getLessonSummary(selectedLesson.lesson)}</p>
                                        <div className="mt-3 inline-flex items-center gap-2 text-xs text-slate-400">
                                            <BookIcon className="w-4 h-4" />
                                            <span>Estimated time: <span className="text-slate-200 font-semibold">{estimateMinutes(selectedLesson.lesson)} min</span></span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                                    <button
                                        onClick={() => startConcept(selectedLessonRef!.moduleIndex, selectedLessonRef!.lessonIndex, 0, { mode: 'guided' })}
                                        className="px-4 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold flex items-center justify-center gap-2"
                                    >
                                        <WandIcon className="w-5 h-5" />
                                        Begin Guided Session
                                    </button>
                                    <button
                                        onClick={() => startConcept(selectedLessonRef!.moduleIndex, selectedLessonRef!.lessonIndex, 0, { mode: 'quick' })}
                                        className="px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700"
                                    >
                                        Quick Insight Mode
                                    </button>
                                    <button
                                        onClick={() => {
                                            showToast('Apply to My Routine is coming in Tier 2 (will connect to Saved Ideas / Show Planner).');
                                        }}
                                        className="px-4 py-3 rounded-lg bg-slate-900/40 hover:bg-slate-900/60 text-white font-semibold border border-slate-700"
                                    >
                                        Apply to My Routine
                                    </button>
                                </div>

                                {/* Why this matters */}
                                <div className="mb-4 p-4 rounded-xl border border-yellow-600/40 bg-yellow-900/10">
                                    <div className="text-xs uppercase tracking-wider text-yellow-300 mb-1">Why This Matters</div>
                                    <p className="text-slate-200">{getWhyThisMatters(selectedLesson.lesson.name)}</p>
                                </div>

                                {/* Director Insight */}
                                <div className="p-4 rounded-xl border border-slate-700 bg-slate-900/30">
                                    <div className="text-xs uppercase tracking-wider text-purple-300 mb-1">🎩 Director Insight</div>
                                    <p className="text-slate-200">{getDirectorsInsight(selectedLesson.lesson.name)}</p>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <header className="p-4 border-b border-slate-700 flex-shrink-0">
                            <h3 className="text-xs uppercase text-slate-400">{activeLesson.module.name}</h3>
                            <h2 className="text-lg font-bold text-white">{activeLesson.lesson.name}</h2>
                            {progress && <p className="text-sm text-purple-300">{activeLesson.lesson.concepts[progress.concept].name}</p>}
                            <div className="mt-2 p-3 rounded-lg bg-slate-900/40 border border-slate-700">
                                <div className="text-xs uppercase tracking-wider text-purple-300">🎩 Director Insight</div>
                                <p className="text-sm text-slate-200">{getDirectorsInsight(activeLesson.lesson.name)}</p>
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
                                        <div className="max-w-lg px-4 py-2 rounded-xl bg-slate-700 text-slate-200">
                                            <FormattedText text={msg.text} />
                                        </div>
                                    </>
                                    ) : (
                                        <div className="max-w-lg px-4 py-2 rounded-xl bg-purple-800 text-white">
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
                            {lessonPhase === 'intro' ? (
                                <div className="flex items-center bg-slate-800 rounded-lg">
                                    <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend()} placeholder="Type your answer here..." className="flex-1 w-full bg-transparent px-4 py-3 text-white placeholder-slate-400 focus:outline-none" disabled={isLoading}/>
                                    <button onClick={handleSend} disabled={isLoading || !userInput.trim()} className="p-3 text-purple-400 hover:text-purple-300 disabled:text-slate-600"><SendIcon className="w-6 h-6" /></button>
                                </div>
                            ) : lessonPhase === 'feedback' ? (
                                <button onClick={handleNextConcept} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold">Continue</button>
                            ) : (
                                <div className="text-center p-4 bg-green-900/30 rounded-lg border border-green-700/50">
                                    <h3 className="font-bold text-green-300">Lesson Complete!</h3>
                                    {findNextLesson(progress!.module, progress!.lesson) ? (
                                        <button onClick={handleStartNextLesson} className="mt-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded-md text-white font-semibold">Start Next Lesson</button>
                                    ) : (
                                        <p className="text-slate-300">Congratulations, you have completed the course!</p>
                                    )}
                                </div>
                            )}
                        </footer>
                    </>
                )}
            </main>
        </div>
    );
};

export default MagicTheoryTutor;
