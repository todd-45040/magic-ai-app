
import React, { useState, useEffect, useRef } from 'react';
import { MAGIC_THEORY_CURRICULUM, MAGIC_THEORY_TUTOR_SYSTEM_INSTRUCTION } from '../constants';
import type { ChatMessage, MagicTheoryModule, MagicTheoryLesson, MagicTheoryConcept, User } from '../types';
import { generateResponse } from '../services/geminiService';
import { TutorIcon, WandIcon, SendIcon, CheckIcon, BackIcon, BookIcon } from './icons';
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

interface MagicTheoryTutorProps {
    user: User;
}

const MagicTheoryTutor: React.FC<MagicTheoryTutorProps> = ({ user }) => {
    const [progress, setProgress] = useState<Progress | null>(null);
    const [activeLesson, setActiveLesson] = useState<{ module: MagicTheoryModule; lesson: MagicTheoryLesson; } | null>(null);
    const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [lessonPhase, setLessonPhase] = useState<'intro' | 'feedback' | 'complete'>('intro');

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Load progress from local storage
        try {
            const savedProgress = localStorage.getItem(TUTOR_PROGRESS_KEY);
            if (savedProgress) {
                const parsed = JSON.parse(savedProgress) as Progress;
                setCompletedLessons(getCompletedLessons(parsed));
            }
        } catch (error) {
            console.error("Failed to load tutor progress:", error);
        }
    }, []);

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

    const startConcept = async (moduleIndex: number, lessonIndex: number, conceptIndex: number) => {
        const module = MAGIC_THEORY_CURRICULUM[moduleIndex];
        const lesson = module.lessons[lessonIndex];
        const concept = lesson.concepts[conceptIndex];

        if (!module || !lesson || !concept) return;

        setActiveLesson({ module, lesson });
        setProgress({ module: moduleIndex, lesson: lessonIndex, concept: conceptIndex });
        setLessonPhase('intro');
        setIsLoading(true);
        setChatMessages([]);

        const systemInstruction = MAGIC_THEORY_TUTOR_SYSTEM_INSTRUCTION(concept.name, concept.description);
        // FIX: Pass the user object to generateResponse as the 3rd argument.
        const response = await generateResponse("Let's begin with this concept.", systemInstruction, user);

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
                <div className="space-y-4">
                    {MAGIC_THEORY_CURRICULUM.map((module, mIndex) => (
                        <div key={module.name}>
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-purple-400 mb-2">{module.name}</h3>
                            <ul className="space-y-1">
                                {module.lessons.map((lesson, lIndex) => {
                                    const isCompleted = completedLessons.has(`${mIndex}-${lIndex}`);
                                    const isActive = progress?.module === mIndex && progress?.lesson === lIndex;
                                    return (
                                        <li key={lesson.name}>
                                            <button 
                                                onClick={() => startConcept(mIndex, lIndex, 0)}
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
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                        <TutorIcon className="w-24 h-24 text-slate-600 mb-4" />
                        <h2 className="text-2xl font-bold text-slate-300 font-cinzel">Magic Theory Tutor</h2>
                        <p className="text-slate-400 max-w-md mt-2">Select a lesson from the curriculum to begin your structured journey into the art and science of magic.</p>
                    </div>
                ) : (
                    <>
                        <header className="p-4 border-b border-slate-700 flex-shrink-0">
                            <h3 className="text-xs uppercase text-slate-400">{activeLesson.module.name}</h3>
                            <h2 className="text-lg font-bold text-white">{activeLesson.lesson.name}</h2>
                            {progress && <p className="text-sm text-purple-300">{activeLesson.lesson.concepts[progress.concept].name}</p>}
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
