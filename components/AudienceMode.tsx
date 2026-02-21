
import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, PredefinedPrompt, TrickIdentificationResult, AudienceTab, Question } from '../types';
import { generateResponse } from '../services/geminiService';
import { identifyTrickFromImageServer } from '../services/identifyService';
import { saveIdea } from '../services/ideasService';
import { addFeedback } from '../services/feedbackService';
import { addQuestion } from '../services/questionsService';
import { AUDIENCE_SYSTEM_INSTRUCTION, AUDIENCE_PROMPTS, publications, clubs, conventions, ASK_MAGICIAN_SYSTEM_INSTRUCTION, MAGICAL_STORY_SYSTEM_INSTRUCTION, GUEST_USER } from '../constants';
import { BackIcon, SendIcon, AudienceIcon, WandIcon, SaveIcon, NewspaperIcon, UsersIcon, CameraIcon, VideoIcon, ImageIcon, ShareIcon, StageCurtainsIcon, ThumbUpIcon, ThumbDownIcon, StarIcon, CheckIcon, QuestionMarkIcon, BookIcon } from './icons';
import ShareButton from './ShareButton';
import FormattedText from './FormattedText';

interface AudienceModeProps {
  onBack: () => void;
}

const AUDIENCE_STORAGE_KEY = 'audience_chat_history';
const AUDIENCE_TAB_STORAGE_KEY = 'audience_active_tab';
const FEEDBACK_TAGS = ["Card Tricks", "Comedy", "Mind Reading", "Storytelling", "Audience Interaction"];

const LoadingIndicator: React.FC = () => (
    <div className="flex items-center space-x-1">
        <div className="w-2 h-2 bg-sky-300 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-2 h-2 bg-sky-300 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 bg-sky-300 rounded-full animate-bounce"></div>
    </div>
);

const createChatMessage = (role: 'user' | 'model', text: string): ChatMessage => ({
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    role,
    text,
});

const learnTrickPrompt = AUDIENCE_PROMPTS.find(p => p.title === 'Learn a Trick');

const AudienceMode: React.FC<AudienceModeProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<AudienceTab>(() => {
    try {
        const savedTab = localStorage.getItem(AUDIENCE_TAB_STORAGE_KEY);
        return (savedTab as AudienceTab) || 'chat';
    } catch {
        return 'chat';
    }
  });
  
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Trick Identification state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [identificationResult, setIdentificationResult] = useState<TrickIdentificationResult | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [identificationError, setIdentificationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Feedback form state
  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [showTitle, setShowTitle] = useState('');
  const [magicianName, setMagicianName] = useState('');
  const [location, setLocation] = useState('');
  const [performanceDate, setPerformanceDate] = useState('');

  // Ask the Magician state
  const [question, setQuestion] = useState('');
  const [questionerName, setQuestionerName] = useState('');
  const [lastQuestion, setLastQuestion] = useState<Question | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);

  // Magical Story state
  const [storyKeywords, setStoryKeywords] = useState('');
  const [generatedStory, setGeneratedStory] = useState<string | null>(null);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);


  // Save idea state
  const [recentlySaved, setRecentlySaved] = useState<Set<string>>(new Set());

  // Load chat from local storage on initial render
  useEffect(() => {
    try {
      const savedChat = localStorage.getItem(AUDIENCE_STORAGE_KEY);
      if (savedChat) {
        const parsedChat = JSON.parse(savedChat) as ChatMessage[];
        // Add IDs to messages from older versions that might not have them
        const chatWithIds = parsedChat.map(msg => ({
            ...msg,
            id: msg.id || `msg-fallback-${Math.random()}`
        }));
        setMessages(chatWithIds);
      }
    } catch (error) {
      console.error("Failed to load chat from localStorage", error);
    }
  }, []);

  // Save chat to local storage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(AUDIENCE_STORAGE_KEY, JSON.stringify(messages));
    } catch (error) {
      console.error("Failed to save chat to localStorage", error);
    }
  }, [messages]);
  
  // Save active tab to local storage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(AUDIENCE_TAB_STORAGE_KEY, activeTab);
    } catch (error) {
      console.error("Failed to save active tab to localStorage", error);
    }
  }, [activeTab]);


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    if (activeTab === 'chat') {
        scrollToBottom();
    }
  }, [messages, activeTab]);

  const handleSaveIdea = (text: string, messageId: string) => {
    saveIdea('text', text, 'Audience Idea');
    setRecentlySaved(prev => new Set(prev).add(messageId));
    setTimeout(() => {
        setRecentlySaved(prev => {
            const newSet = new Set(prev);
            newSet.delete(messageId);
            return newSet;
        });
    }, 2000);
  };

  const handleBackOrReset = () => {
    // A simple check to see if any interaction has happened across multiple features
    const hasInteraction = messages.length > 0 || imagePreview !== null || rating > 0 || question.trim() !== '' || storyKeywords.trim() !== '' || generatedStory !== null;

    if (hasInteraction) {
        // Reset all state to initial values
        setMessages([]);
        setInput('');
        setIsLoading(false);

        setImageFile(null);
        setImagePreview(null);
        setIdentificationResult(null);
        setIsIdentifying(false);
        setIdentificationError(null);
        if (fileInputRef.current) fileInputRef.current.value = "";

        setRating(0);
        setSelectedTags([]);
        setComment('');
        setName('');
        setFeedbackSubmitted(false);
        setShowTitle('');
        setMagicianName('');
        setLocation('');
        setPerformanceDate('');

        setQuestion('');
        setQuestionerName('');
        setLastQuestion(null);
        setIsAnswering(false);

        setStoryKeywords('');
        setGeneratedStory(null);
        setIsGeneratingStory(false);
        
        // Return to the main chat tab
        setActiveTab('chat');
    } else {
        // If no interaction has occurred, perform the original 'back' action
        onBack();
    }
  };


  const handleSend = async (prompt?: string) => {
    const userMessage = prompt || input;
    if (!userMessage.trim()) return;

    setMessages(prev => [...prev, createChatMessage('user', userMessage)]);
    setInput('');
    setIsLoading(true);

    // FIX: Pass GUEST_USER as the 3rd argument to generateResponse
    const response = await generateResponse(userMessage, AUDIENCE_SYSTEM_INSTRUCTION, GUEST_USER);
    
    setMessages(prev => [...prev, createChatMessage('model', response)]);
    setIsLoading(false);
  };

  const handlePromptClick = (prompt: PredefinedPrompt) => {
      handleSend(prompt.prompt);
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        setImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
        setIdentificationResult(null);
        setIdentificationError(null);
    }
  };

  const handleIdentifyClick = async () => {
    if (!imagePreview || !imageFile) return;

    const base64Data = imagePreview.split(',')[1];
    const mimeType = imageFile.type;

    setIsIdentifying(true);
    setIdentificationError(null);
    setIdentificationResult(null);

    try {
        // FIX: Pass GUEST_USER as the 3rd argument to identifyTrickFromImage
        const result = await identifyTrickFromImageServer(base64Data, mimeType, GUEST_USER);
        setIdentificationResult(result);
    } catch (err) {
        setIdentificationError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
        setIsIdentifying(false);
    }
  };
  
  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => 
        prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
        alert("Please select a star rating.");
        return;
    }
    addFeedback({
        rating,
        tags: selectedTags,
        comment,
        name,
        showTitle,
        magicianName,
        location,
        performanceDate: performanceDate ? new Date(performanceDate + 'T00:00:00').getTime() : undefined
    });
    setFeedbackSubmitted(true);
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setIsAnswering(true);
    setLastQuestion(null);
    
    const prompt = `The user ${questionerName ? `(named ${questionerName})` : ''} asked: "${question}"`;
    // FIX: Pass GUEST_USER as the 3rd argument to generateResponse
    const answer = await generateResponse(prompt, ASK_MAGICIAN_SYSTEM_INSTRUCTION, GUEST_USER);
    
    const submittedQuestion = {
        id: `q-${Date.now()}`,
        question,
        name: questionerName,
        timestamp: Date.now(),
        answer
    };

    addQuestion(submittedQuestion);
    setLastQuestion(submittedQuestion);
    setIsAnswering(false);
    setQuestion('');
    setQuestionerName('');
  };

  const handleCreateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storyKeywords.trim()) return;

    setIsGeneratingStory(true);
    setGeneratedStory(null);

    const prompt = `Create a magical story based on these keywords: "${storyKeywords}"`;
    // FIX: Pass GUEST_USER as the 3rd argument to generateResponse
    const story = await generateResponse(prompt, MAGICAL_STORY_SYSTEM_INSTRUCTION, GUEST_USER);
    
    setGeneratedStory(story);
    setIsGeneratingStory(false);
  };

  const TabButton: React.FC<{
    label: string;
    icon: React.FC<{ className?: string }>;
    isActive: boolean;
    onClick: () => void;
  }> = ({ label, icon: Icon, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            isActive
                ? 'border-b-2 border-sky-400 text-sky-300'
                : 'border-b-2 border-transparent text-slate-400 hover:text-white'
        }`}
    >
        <Icon className="w-5 h-5" />
        <span>{label}</span>
    </button>
  );

  const renderContent = () => {
    switch(activeTab) {
      case 'story':
        return (
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
                <div className="animate-fade-in space-y-6 max-w-2xl mx-auto">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Magical Story Creator</h2>
                        <p className="text-slate-400 mt-1">Provide a few keywords and the AI will write a unique story for you!</p>
                    </div>

                    <form onSubmit={handleCreateStory} className="space-y-4">
                         <div>
                            <label htmlFor="storyKeywords" className="block text-sm font-medium text-slate-300 mb-1">Your Keywords</label>
                            <input
                                id="storyKeywords"
                                type="text"
                                value={storyKeywords}
                                onChange={(e) => setStoryKeywords(e.target.value)}
                                placeholder="e.g., a lost compass, a talking raven, a secret map"
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isGeneratingStory || !storyKeywords.trim()}
                            className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <WandIcon className="w-5 h-5" />
                            <span>{isGeneratingStory ? 'Weaving a Tale...' : 'Create My Story'}</span>
                        </button>
                    </form>

                    {isGeneratingStory && (
                         <div className="flex items-center justify-center p-6 bg-slate-800/50 rounded-lg">
                           <div className="flex items-center space-x-2 text-slate-300">
                                <WandIcon className="w-5 h-5 animate-pulse" />
                                <span>Dipping the quill in moonlight...</span>
                            </div>
                        </div>
                    )}
                    
                    {generatedStory && (
                        <div className="animate-fade-in bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
                            <FormattedText text={generatedStory} />
                             <div className="pt-2 flex justify-end">
                                <ShareButton
                                    title={`A Magical Story about ${storyKeywords}`}
                                    text={generatedStory}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
                                >
                                    <ShareIcon className="w-4 h-4" />
                                    <span>Share Story</span>
                                </ShareButton>
                           </div>
                        </div>
                    )}

                </div>
            </main>
        );
      case 'ask':
        return (
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
                <div className="animate-fade-in space-y-6 max-w-2xl mx-auto">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Ask the Magician</h2>
                        <p className="text-slate-400 mt-1">Have a question? The magician's AI assistant is here to answer!</p>
                    </div>

                    {!lastQuestion && !isAnswering && (
                        <form onSubmit={handleAskQuestion} className="space-y-4 bg-slate-800/50 border border-slate-700 rounded-lg p-6">
                            <div>
                                <label htmlFor="question" className="block text-sm font-medium text-slate-300 mb-1">Your Question</label>
                                <textarea
                                    id="question"
                                    rows={4}
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    placeholder="e.g., How long have you been performing magic?"
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                                />
                            </div>
                             <div>
                                <label htmlFor="questionerName" className="block text-sm font-medium text-slate-300 mb-1">Your Name (Optional)</label>
                                <input
                                    id="questionerName"
                                    type="text"
                                    value={questionerName}
                                    onChange={(e) => setQuestionerName(e.target.value)}
                                    placeholder="John Doe"
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isAnswering || !question.trim()}
                                className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                            >
                                Ask Question
                            </button>
                        </form>
                    )}

                    {isAnswering && (
                        <div className="flex items-center justify-center p-6 bg-slate-800/50 rounded-lg">
                           <div className="flex items-center space-x-2 text-slate-300">
                                <WandIcon className="w-5 h-5 animate-pulse" />
                                <span>Consulting the oracle...</span>
                            </div>
                        </div>
                    )}

                    {lastQuestion && (
                        <div className="animate-fade-in bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-4">
                            <div>
                                <p className="text-sm text-slate-400 mb-1">You asked:</p>
                                <p className="font-semibold text-white">"{lastQuestion.question}"</p>
                            </div>
                             <div className="border-t border-slate-700/50 pt-4">
                                <p className="text-sm text-slate-400 mb-1">The Magician's Assistant replies:</p>
                                <FormattedText text={lastQuestion.answer || ''} />
                             </div>
                            <div className="pt-2 flex justify-between items-center">
                                 <button onClick={() => setLastQuestion(null)} className="text-sm text-sky-400 hover:text-sky-300 font-semibold">
                                    Ask Another Question
                                </button>
                                <ShareButton
                                    title={`A Question for the Magician`}
                                    text={`I asked the magician, "${lastQuestion.question}", and got this mysterious answer: "${lastQuestion.answer}"`}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
                                >
                                    <ShareIcon className="w-4 h-4" />
                                    <span>Share</span>
                                </ShareButton>
                           </div>
                        </div>
                    )}
                </div>
            </main>
        );
      case 'identify':
        return (
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
                <div className="animate-fade-in space-y-4 max-w-2xl mx-auto">
                    <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Identify a Trick</h2>
                    <p className="text-slate-400">Saw a magic trick but don't know what it's called? Upload a picture, and our AI will try to identify it and show you some performances!</p>
                    
                    <input
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        className="hidden"
                    />

                    {!imagePreview ? (
                         <button onClick={() => fileInputRef.current?.click()} className="w-full flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-600 rounded-lg hover:bg-slate-800/50 hover:border-sky-500 transition-colors">
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
                                <button onClick={handleIdentifyClick} disabled={isIdentifying} className="flex-1 w-full py-2 px-4 bg-sky-600 hover:bg-sky-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
                                    {isIdentifying ? 'Analyzing...' : 'Identify Trick'}
                                </button>
                            </div>
                        </div>
                    )}

                    {isIdentifying && (
                        <div className="flex items-center justify-center p-6 bg-slate-800/50 rounded-lg">
                           <div className="flex items-center space-x-2 text-slate-300">
                                <WandIcon className="w-5 h-5 animate-pulse" />
                                <span>Consulting the oracle...</span>
                            </div>
                        </div>
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
                                        <a key={index} href={video.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 bg-slate-700/50 hover:bg-sky-900/50 rounded-md transition-colors">
                                            <VideoIcon className="w-6 h-6 text-sky-400 flex-shrink-0"/>
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
            </main>
        );
      case 'publications':
        return (
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="animate-fade-in space-y-4">
              <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Magic Publications</h2>
              <p className="text-slate-400">Stay up to date with the latest news, effects, and interviews from the world of magic.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {publications.map(pub => (
                      <div key={pub.name} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                          <h3 className="font-bold text-lg text-white">{pub.name}</h3>
                          <p className="text-slate-400 text-sm mt-1">{pub.description}</p>
                      </div>
                  ))}
              </div>
            </div>
          </main>
        );
      case 'community':
        return (
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="animate-fade-in space-y-8">
                  <div className="text-center">
                      <h2 className="text-3xl font-bold text-slate-200 font-cinzel">Magic Community</h2>
                      <p className="text-slate-400 mt-2">Connect with fellow magicians, access resources, and discover major events.</p>
                  </div>
                  
                  <div>
                      <h3 className="text-2xl font-bold text-slate-200 font-cinzel mb-4">Major Magic Clubs & Organizations</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {clubs.map(club => (
                              <a
                                key={club.name}
                                href={(club as any).url}
                                target="_blank"
                                rel="noreferrer"
                                className="group bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800/70 hover:border-purple-500/40 transition-all"
                                title={`Open ${club.name} website`}
                              >
                                  <div className="flex items-start justify-between gap-3">
                                    <h4 className="font-bold text-lg text-white">{club.name}</h4>
                                    <span className="text-slate-500 group-hover:text-slate-300 transition" aria-hidden="true">↗</span>
                                  </div>
                                  <p className="text-slate-400 text-sm mt-1">{club.description}</p>
                                  <div className="mt-3 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border border-slate-700/60 bg-slate-950/25 text-purple-400 group-hover:text-white group-hover:bg-slate-950/40 transition">
                                    Visit <span aria-hidden="true">↗</span>
                                  </div>
                              </a>
                          ))}
                      </div>
                  </div>

                  <div>
                      <h3 className="text-2xl font-bold text-slate-200 font-cinzel mb-4">Popular Magic Conventions</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {conventions.map(convention => (
                              <a
                                key={convention.name}
                                href={(convention as any).url}
                                target="_blank"
                                rel="noreferrer"
                                className="group bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800/70 hover:border-purple-500/40 transition-all"
                                title={`Open ${convention.name} website`}
                              >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <h4 className="font-bold text-lg text-white">{convention.name}</h4>
                                      {convention.date && <span className="text-sm font-semibold text-slate-400 flex-shrink-0">{convention.date}</span>}
                                    </div>
                                    <span className="text-slate-500 group-hover:text-slate-300 transition" aria-hidden="true">↗</span>
                                  </div>
                                  <p className="text-slate-400 text-sm mt-2">{convention.description}</p>
                                  <div className="mt-3 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border border-slate-700/60 bg-slate-950/25 text-purple-400 group-hover:text-white group-hover:bg-slate-950/40 transition">
                                    Visit <span aria-hidden="true">↗</span>
                                  </div>
                              </a>
                          ))}
                      </div>
                  </div>
              </div>
            </main>
        );
      case 'feedback':
        return (
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="animate-fade-in space-y-6 max-w-2xl mx-auto">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Share Your Feedback</h2>
                <p className="text-slate-400 mt-1">Enjoyed the show? Let the magician know what you thought!</p>
              </div>

              {feedbackSubmitted ? (
                <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-8 text-center">
                    <h3 className="text-2xl font-bold text-green-300">Thank You!</h3>
                    <p className="text-slate-300 mt-2">Your feedback helps make the magic even better.</p>
                </div>
              ) : (
                <form onSubmit={handleFeedbackSubmit} className="space-y-6 bg-slate-800/50 border border-slate-700 rounded-lg p-6">
                    {/* Star Rating */}
                    <div>
                        <label className="block text-lg font-medium text-slate-300 mb-3 text-center">How would you rate the show?</label>
                        <div className="flex items-center justify-center gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    type="button"
                                    key={star}
                                    onClick={() => setRating(star)}
                                    className="p-1 rounded-full transition-transform transform hover:scale-125"
                                >
                                    <StarIcon className={`w-10 h-10 ${rating >= star ? 'text-amber-400' : 'text-slate-600 hover:text-amber-300/50'}`} />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">What did you enjoy most? (Optional)</label>
                        <div className="flex flex-wrap gap-2">
                            {FEEDBACK_TAGS.map(tag => (
                                <button
                                    type="button"
                                    key={tag}
                                    onClick={() => handleTagToggle(tag)}
                                    className={`px-3 py-1.5 text-sm font-semibold rounded-full transition-colors ${
                                        selectedTags.includes(tag)
                                            ? 'bg-sky-600 text-white'
                                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    {/* Show Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-700/50">
                        <div>
                            <label htmlFor="showTitle" className="block text-sm font-medium text-slate-300 mb-1">Show Title (Optional)</label>
                            <input
                                id="showTitle"
                                type="text"
                                value={showTitle}
                                onChange={(e) => setShowTitle(e.target.value)}
                                placeholder="e.g., An Evening of Wonder"
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                            />
                        </div>
                        <div>
                            <label htmlFor="magicianName" className="block text-sm font-medium text-slate-300 mb-1">Magician Performing (Optional)</label>
                            <input
                                id="magicianName"
                                type="text"
                                value={magicianName}
                                onChange={(e) => setMagicianName(e.target.value)}
                                placeholder="e.g., The Great Prestini"
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                            />
                        </div>
                        <div>
                            <label htmlFor="location" className="block text-sm font-medium text-slate-300 mb-1">Location (Optional)</label>
                            <input
                                id="location"
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="e.g., The Grand Theatre"
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                            />
                        </div>
                        <div>
                            <label htmlFor="performanceDate" className="block text-sm font-medium text-slate-300 mb-1">Date of Performance (Optional)</label>
                            <input
                                id="performanceDate"
                                type="date"
                                value={performanceDate}
                                onChange={(e) => setPerformanceDate(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                            />
                        </div>
                    </div>


                    {/* Comment */}
                    <div>
                        <label htmlFor="comment" className="block text-sm font-medium text-slate-300 mb-1">Additional Comments (Optional)</label>
                        <textarea
                            id="comment"
                            rows={4}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Tell us more about your experience..."
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                        />
                    </div>
                     
                     {/* Name */}
                     <div>
                        <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1">Your Name (Optional)</label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="John Doe"
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                        />
                    </div>
                    
                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={rating === 0}
                        className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                    >
                        Submit Feedback
                    </button>
                </form>
              )}
            </div>
          </main>
        );
      case 'chat':
      default:
        return (
            <>
                <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                    {messages.map((msg) => (
                    <div key={msg.id} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'model' ? (
                        <>
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                                <AudienceIcon className="w-5 h-5 text-sky-400" />
                            </div>
                            <div className="max-w-lg">
                                <div className="px-4 py-2 rounded-xl bg-slate-700 text-slate-200">
                                    <FormattedText text={msg.text} />
                                </div>
                                <div className="mt-2 flex justify-end items-center gap-2">
                                    <button
                                        onClick={() => handleSaveIdea(msg.text, msg.id)}
                                        disabled={recentlySaved.has(msg.id)}
                                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors disabled:cursor-default"
                                        aria-label={recentlySaved.has(msg.id) ? 'Saved' : 'Save this response'}
                                    >
                                        {recentlySaved.has(msg.id) ? (
                                            <>
                                                <CheckIcon className="w-4 h-4 text-green-400" />
                                                <span>Saved!</span>
                                            </>
                                        ) : (
                                            <>
                                                <SaveIcon className="w-4 h-4" />
                                                <span>Save</span>
                                            </>
                                        )}
                                    </button>
                                    <ShareButton
                                        title="Shared from Magicians' AI Wizard"
                                        text={msg.text}
                                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
                                        aria-label="Share this response"
                                    >
                                        <ShareIcon className="w-4 h-4" />
                                        <span>Share</span>
                                    </ShareButton>
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
                        </>
                        ) : (
                            <div className="max-w-lg px-4 py-2 rounded-xl bg-sky-800 text-white">
                                <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                            </div>
                        )}
                    </div>
                    ))}
                    {isLoading && (
                    <div className="flex items-start gap-3 justify-start">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                        <AudienceIcon className="w-5 h-5 text-sky-400" />
                        </div>
                        <div className="max-w-lg px-4 py-2 rounded-xl bg-slate-700 text-slate-200">
                        <LoadingIndicator />
                        </div>
                    </div>
                    )}
                    <div ref={messagesEndRef} />
                </main>
                
                {messages.length === 0 && (
                    <div className="flex-1 flex flex-col justify-center items-center p-4 text-center">
                        <StageCurtainsIcon className="w-16 h-16 text-slate-500 mb-4"/>
                        <h2 className="text-xl font-bold text-slate-300 mb-2">Welcome to the Show!</h2>
                        <p className="text-slate-400 max-w-md">Ask me for some magic trivia or click a suggestion below to get started.</p>
                        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                            {AUDIENCE_PROMPTS.map(p => (
                                <button key={p.title} onClick={() => handlePromptClick(p)} className="p-4 bg-slate-800/50 hover:bg-sky-900/50 border border-slate-700 rounded-lg text-left transition-colors h-full flex flex-col">
                                    {p.icon && <p.icon className="w-7 h-7 mb-3 text-sky-400" />}
                                    <p className="font-bold text-slate-200">{p.title}</p>
                                    <p className="text-sm text-slate-400 mt-1 line-clamp-2">{p.prompt}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </>
        );
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="flex items-center p-4 border-b border-slate-800">
        <button onClick={handleBackOrReset} className="p-2 mr-4 rounded-full hover:bg-slate-700 transition-colors">
          <BackIcon className="w-6 h-6 text-slate-300" />
        </button>
        <AudienceIcon className="w-8 h-8 text-sky-400 mr-3" />
        <h1 className="font-cinzel text-2xl font-bold text-white">Audience Mode</h1>
        <div className="ml-auto">
        </div>
      </header>
      
      <nav className="flex border-b border-slate-800 px-2 md:px-4 flex-wrap">
        <TabButton label="AI Assistant" icon={WandIcon} isActive={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
        <TabButton label="Ask the Magician" icon={QuestionMarkIcon} isActive={activeTab === 'ask'} onClick={() => setActiveTab('ask')} />
        <TabButton label="Magical Story" icon={BookIcon} isActive={activeTab === 'story'} onClick={() => setActiveTab('story')} />
        <TabButton label="Identify a Trick" icon={CameraIcon} isActive={activeTab === 'identify'} onClick={() => setActiveTab('identify')} />
        <TabButton label="Publications" icon={NewspaperIcon} isActive={activeTab === 'publications'} onClick={() => setActiveTab('publications')} />
        <TabButton label="Community" icon={UsersIcon} isActive={activeTab === 'community'} onClick={() => setActiveTab('community')} />
        <TabButton label="Feedback" icon={StarIcon} isActive={activeTab === 'feedback'} onClick={() => setActiveTab('feedback')} />
      </nav>

      {renderContent()}

      {activeTab === 'chat' && (
        <footer className="p-4">
          <div className="flex items-center bg-slate-800/50 border border-slate-700 rounded-lg">
            {learnTrickPrompt && (
                <button
                    onClick={() => handlePromptClick(learnTrickPrompt)}
                    disabled={isLoading}
                    className="p-3 text-slate-400 hover:text-sky-300 disabled:text-slate-600 transition-colors"
                    title="Learn a simple magic trick"
                    aria-label="Learn a simple magic trick"
                >
                    <WandIcon className="w-6 h-6" />
                </button>
            )}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend()}
              placeholder="Ask a question about the show..."
              className="flex-1 w-full bg-transparent pr-3 py-3 text-white placeholder-slate-400 focus:outline-none"
              disabled={isLoading}
            />
            <button onClick={() => handleSend()} disabled={isLoading || !input.trim()} className="p-3 text-sky-400 hover:text-sky-300 disabled:text-slate-600 transition-colors">
              <SendIcon className="w-6 h-6" />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};

export default AudienceMode;
