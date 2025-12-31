
import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, PredefinedPrompt, TrickIdentificationResult, User, Transcription, MagicianView, MagicianTab, Client, Show, Feedback, SavedIdea, TaskPriority, AiSparkAction } from '../types';
import { ai, generateResponse, identifyTrickFromImage } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { findShowByTitle, addTaskToShow, addTasksToShow } from '../services/showsService';
import { MAGICIAN_SYSTEM_INSTRUCTION, MAGICIAN_PROMPTS, publications, clubs, conventions, AMATEUR_FEATURES, SEMI_PRO_FEATURES, PROFESSIONAL_FEATURES, ADMIN_EMAIL, MAGICIAN_CHAT_TOOLS } from '../constants';
import { BackIcon, SendIcon, MagicHatIcon, RabbitIcon, WandIcon, SaveIcon, ClockIcon, AIMagicianIcon, BookIcon, MicrophoneIcon, LightbulbIcon, ShieldIcon, ImageIcon, ListIcon, SearchIcon, ShuffleIcon, CheckIcon, BookmarkIcon, NewspaperIcon, UsersIcon, CameraIcon, VideoIcon, CalendarIcon, ChecklistIcon, CrossIcon, ShareIcon, LockIcon, UsersCogIcon, ThumbUpIcon, ThumbDownIcon, StarIcon, QuestionMarkIcon, MegaphoneIcon, FileTextIcon, StageCurtainsIcon, BlueprintIcon, TutorIcon } from './icons';
import { useAppState, useAppDispatch, refreshShows, refreshIdeas, refreshClients } from '../store';
import { useToast } from './ToastProvider';
import LiveRehearsal from './LiveRehearsal';
import VisualBrainstorm from './VisualBrainstorm';
import SavedIdeas from './SavedIdeas';
import PropChecklists from './PropChecklists';
import EffectGenerator from './EffectGenerator';
import MagicArchives from './MagicArchives';
import GospelMagicAssistant from './GospelMagicAssistant';
import MentalismAssistant from './MentalismAssistant';
import ShareButton from './ShareButton';
import FormattedText from './FormattedText';
import AccountMenu from './AccountMenu';
import UpgradeModal from './UpgradeModal';
import MemberManagement from './MemberManagement';
import ShowPlanner from './ShowPlanner';
import ShowFeedback from './ShowFeedback';
import HelpModal from './HelpModal';
import PatterEngine from './PatterEngine';
import MagicWire from './MagicWire';
import MarketingCampaign from './MarketingCampaign';
import ContractGenerator from './ContractGenerator';
import AssistantStudio from './AssistantStudio';
import DirectorMode from './DirectorMode';
import PersonaSimulator from './PersonaSimulator';
import VideoRehearsal from './VideoRehearsal';
import ClientManagement from './ClientManagement';
import Dashboard from './Dashboard';
import GlobalSearch from './GlobalSearch';
import PerformanceAnalytics from './PerformanceAnalytics';
import IllusionBlueprint from './IllusionBlueprint';
import MagicTheoryTutor from './MagicTheoryTutor';
import MagicDictionary from './MagicDictionary';

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
  onPromptClick: (prompt: PredefinedPrompt) => void;
}> = ({ prompts, user, hasAmateurAccess, hasSemiProAccess, hasProfessionalAccess, onPromptClick }) => {
  return (
    <div className="flex-1 flex flex-col justify-center items-center text-center animate-fade-in p-4">
      <RabbitIcon className="w-16 h-16 text-slate-500 mb-4" />
      <h2 className="text-2xl font-bold text-slate-300 mb-2 font-cinzel">AI Assistant</h2>
      <p className="text-slate-400 max-w-md mb-6">
        How can I help you create magic today? Select a tool below or ask me anything.
      </p>
      <div className="w-full max-w-4xl grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {prompts.filter(p => user.isAdmin || p.title !== 'Member Management').map((p) => {
            const isAmateurFeature = AMATEUR_FEATURES.includes(p.title);
            const isSemiProFeature = SEMI_PRO_FEATURES.includes(p.title);
            const isProfessionalFeature = PROFESSIONAL_FEATURES.includes(p.title);
            
            const isLocked = (isAmateurFeature && !hasAmateurAccess) || 
                             (isSemiProFeature && !hasSemiProAccess) ||
                             (isProfessionalFeature && !hasProfessionalAccess);

            return (
              <button
                key={p.title}
                onClick={() => onPromptClick(p)}
                disabled={isLocked}
                title={isLocked ? 'Upgrade your membership to use this feature' : p.prompt}
                className="relative p-4 bg-slate-800/50 hover:bg-purple-900/50 border border-slate-700 rounded-lg text-left transition-colors h-full flex flex-col disabled:opacity-60 disabled:hover:bg-slate-800/50 disabled:cursor-not-allowed group"
              >
                {p.icon && <p.icon className="w-7 h-7 mb-3 text-purple-400 group-hover:text-purple-300 transition-colors" />}
                <p className="font-bold text-slate-200">{p.title}</p>
                <p className="text-sm text-slate-400 mt-1 line-clamp-2 flex-grow">{p.prompt}</p>
                {isLocked && <LockIcon className="absolute top-2 right-2 w-4 h-4 text-amber-300/80" />}
              </button>
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
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleIdentifyClick: () => void;
}> = ({ imagePreview, identificationResult, isIdentifying, identificationError, fileInputRef, handleImageUpload, handleIdentifyClick }) => (
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
                    <h3 className="font-bold text-lg text-white">{pub.name}</h3>
                    <p className="text-slate-400 text-sm mt-1">{pub.description}</p>
                </div>
            ))}
        </div>
      </div>
    </div>
);

const CommunityTab: React.FC = () => (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="animate-fade-in space-y-8">
          <div className="text-center">
              <h2 className="text-3xl font-bold text-slate-200 font-cinzel">Magic Community</h2>
              <p className="text-slate-400 mt-2">Connect with peers, access exclusive resources, and discover major events.</p>
          </div>
          
          <div>
              <h3 className="text-2xl font-bold text-slate-200 font-cinzel mb-4">Major Magic Clubs & Organizations</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {clubs.map(club => (
                      <div key={club.name} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 transition-all duration-200 hover:border-purple-500 hover:bg-slate-800">
                          <h4 className="font-bold text-lg text-white">{club.name}</h4>
                          <p className="text-slate-400 text-sm mt-1">{club.description}</p>
                      </div>
                  ))}
              </div>
          </div>

          <div>
              <h3 className="text-2xl font-bold text-slate-200 font-cinzel mb-4">Popular Magic Conventions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {conventions.map(convention => (
                      <div key={convention.name} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 transition-all duration-200 hover:border-purple-500 hover:bg-slate-800">
                           <div className="flex justify-between items-baseline gap-4">
                                <h4 className="font-bold text-lg text-white">{convention.name}</h4>
                                {convention.date && <span className="text-sm font-semibold text-slate-400 flex-shrink-0">{convention.date}</span>}
                            </div>
                          <p className="text-slate-400 text-sm mt-1">{convention.description}</p>
                      </div>
                  ))}
              </div>
          </div>
      </div>
    </div>
);

// FIX: Moved component properties, constants, and helper functions above the MagicianMode component to resolve "Cannot find name" errors caused by lack of hoisting.
interface MagicianModeProps {
  onBack: () => void;
  user: User;
  onUpgrade: (tier: 'amateur' | 'semi-pro' | 'professional') => void;
  onLogout: () => void;
}

// FIX: Relocated VIEW_TO_TAB_MAP constant above MagicianMode to ensure it is defined when the component initializes.
const VIEW_TO_TAB_MAP: Record<MagicianView, MagicianTab> = {
    'dashboard': 'chat',
    'chat': 'chat',
    'live-rehearsal': 'chat',
    'video-rehearsal': 'chat',
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
};

// FIX: Relocated storage keys and helper function above MagicianMode to resolve scoping errors.
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

  const [activeView, setActiveView] = useState<MagicianView>(() => {
    try {
        const savedView = localStorage.getItem(MAGICIAN_VIEW_STORAGE_KEY);
        const validViews: MagicianView[] = ['dashboard', 'chat', 'effect-generator', 'identify', 'publications', 'community', 'live-rehearsal', 'video-rehearsal', 'visual-brainstorm', 'saved-ideas', 'prop-checklists', 'magic-archives', 'gospel-magic-assistant', 'member-management', 'show-planner', 'show-feedback', 'patter-engine', 'mentalism-assistant', 'magic-wire', 'marketing-campaign', 'contract-generator', 'assistant-studio', 'director-mode', 'persona-simulator', 'client-management', 'performance-analytics', 'illusion-blueprint', 'magic-theory-tutor', 'global-search', 'magic-dictionary'];
        if (savedView && validViews.includes(savedView as MagicianView)) {
            return savedView as MagicianView;
        }
        return 'dashboard';
    } catch {
        return 'dashboard';
    }
  });

  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [viewingPerformanceId, setViewingPerformanceId] = useState<string | null>(null);

  const [initialShowId, setInitialShowId] = useState<string | null>(null);
  const [initialTaskId, setInitialTaskId] = useState<string | null>(null);
  const [initialIdeaId, setInitialIdeaId] = useState<string | null>(null);

  const isTrialActive = user.membership === 'trial' && user.trialEndDate ? user.trialEndDate > Date.now() : false;
  const hasAmateurAccess = ['amateur', 'semi-pro', 'professional', 'trial'].includes(user.membership) || isTrialActive;
  const hasSemiProAccess = ['semi-pro', 'professional', 'trial'].includes(user.membership) || isTrialActive;
  const hasProfessionalAccess = ['professional', 'trial'].includes(user.membership) || isTrialActive;

  const handleNavigate = (view: MagicianView) => {
    if ((view === 'show-planner' || view === 'effect-generator') && !hasAmateurAccess) {
      setIsUpgradeModalOpen(true);
      return;
    }
    if (view === 'live-rehearsal' && !hasProfessionalAccess) {
       setIsUpgradeModalOpen(true);
      return;
    }
    setActiveView(view);
  };

  useEffect(() => {
    try {
      const savedChat = localStorage.getItem(MAGICIAN_STORAGE_key);
      if (savedChat) {
        const parsedChat = JSON.parse(savedChat) as ChatMessage[];
        const chatWithIds = parsedChat.map(msg => ({
            ...msg,
            id: msg.id || `msg-fallback-${Math.random()}`
        }));
        setMessages(chatWithIds);
      }
    } catch (error) {
      console.error("Failed to load data from localStorage", error);
    }
  }, []);

  useEffect(() => {
    try {
        if (messages.length > 0) {
            localStorage.setItem(MAGICIAN_STORAGE_key, JSON.stringify(messages));
        } else {
            localStorage.removeItem(MAGICIAN_STORAGE_key);
        }
    } catch (error) {
        console.error("Failed to save chat to localStorage", error);
    }
  }, [messages]);
  
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
    if (activeView === 'chat') {
        scrollToBottom();
    }
  }, [messages, activeView]);

  const resetInlineForms = () => {
      setShowAngleRiskForm(false);
      setShowRehearsalForm(false);
      setShowInnovationEngineForm(false);
      setTrickName('');
      setAudienceType(null);
      setRoutineDescription('');
      setTargetDuration('');
      setEffectToInnovate('');
  }

  const handleReturnToStudioHome = () => {
    setActiveView('dashboard');
    resetInlineForms();
  };

  const handleSend = async (prompt?: string) => {
    const userMessageText = prompt || input;
    if (!userMessageText.trim()) return;

    setActiveView('chat');
    setInput('');
    setIsLoading(true);

    const userMessage = createChatMessage('user', userMessageText);
    const newHistoryForUI = [...messages, userMessage];
    setMessages(newHistoryForUI);

    const apiHistory = newHistoryForUI.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
    }));

    try {
        // FIX: Updated model name to gemini-3-pro-preview as per the complex text tasks guideline.
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: apiHistory,
            config: { systemInstruction: MAGICIAN_SYSTEM_INSTRUCTION },
            tools: MAGICIAN_CHAT_TOOLS,
        });

        const functionCalls = response.functionCalls;

        if (functionCalls && functionCalls.length > 0) {
            const functionCall = functionCalls[0];
            let functionResponse: any;

            if (functionCall.name === 'createTask') {
                const { showName, taskTitle, priority } = functionCall.args;
                const show = await findShowByTitle(showName);
                if (show) {
                    await addTaskToShow(show.id, { title: taskTitle, priority: (priority as TaskPriority) || 'Medium' });
                    refreshShows(dispatch);
                    functionResponse = { result: `Successfully created task "${taskTitle}" in show "${showName}".` };
                } else {
                    functionResponse = { result: `Error: Show named "${showName}" was not found.` };
                }
            } else {
                 functionResponse = { error: "Unknown function call." };
            }
            
            const toolResponseContents = [
                ...apiHistory,
                response.candidates[0].content,
                {
                    role: 'tool',
                    parts: [{ functionResponse: { name: functionCall.name, response: functionResponse } }]
                }
            ];

            // FIX: Updated model name to gemini-3-pro-preview.
            const finalResponse = await ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: toolResponseContents,
                config: { systemInstruction: MAGICIAN_SYSTEM_INSTRUCTION },
            });
            
            setMessages(prev => [...prev, createChatMessage('model', finalResponse.text)]);
        } else {
            setMessages(prev => [...prev, createChatMessage('model', response.text)]);
        }

    } catch (err) {
        console.error("Error in handleSend with function calling:", err);
        setMessages(prev => [...prev, createChatMessage('model', "Sorry, something went wrong while processing that command.")]);
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
        case 'Live Patter Rehearsal': setActiveView('live-rehearsal'); return;
        case 'Video Rehearsal Studio': setActiveView('video-rehearsal'); return;
        case 'Visual Brainstorm Studio': setActiveView('visual-brainstorm'); return;
        case 'My Saved Ideas': setActiveView('saved-ideas'); return;
        case 'Prop Checklist Generator': setActiveView('prop-checklists'); return;
        case 'Show Feedback': setActiveView('show-feedback'); return;
        case 'Magic Archives': setActiveView('magic-archives'); return;
        case 'Patter Engine': setActiveView('patter-engine'); return;
        case 'Marketing Campaign': setActiveView('marketing-campaign'); return;
        case 'Contract Generator': setActiveView('contract-generator'); return;
        case 'Assistant\'s Studio': setActiveView('assistant-studio'); return;
        case 'Director Mode': setActiveView('director-mode'); return;
        case 'Illusion Blueprint Generator': setActiveView('illusion-blueprint'); return;
        case 'Magic Theory Tutor': setActiveView('magic-theory-tutor'); return;
        case 'Magic Dictionary': setActiveView('magic-dictionary'); return;
        case 'Persona Simulator': setActiveView('persona-simulator'); return;
        case 'Gospel Magic Assistant': setActiveView('gospel-magic-assistant'); return;
        case 'Mentalism Assistant': setActiveView('mentalism-assistant'); return;
        case 'Client Management': setActiveView('client-management'); return;
        case 'Global Search': setActiveView('global-search'); return;
        case 'Member Management': if (user.isAdmin) { setActiveView('member-management'); } return;
        case 'Angle/Risk Analysis':
            if (messages.length === 0) { setActiveView('chat'); setShowAngleRiskForm(true); } else { handleSend("I'd like to do an angle and risk analysis for one of my effects."); }
            break;
        case 'Rehearsal Coaching':
            if (messages.length === 0) { setActiveView('chat'); setShowRehearsalForm(true); } else { handleSend("I'd like some rehearsal coaching for a routine."); }
            break;
        case 'Innovation Engine':
            if (messages.length === 0) { setActiveView('chat'); setShowInnovationEngineForm(true); } else { handleSend("I want to brainstorm some new presentations for an effect."); }
            break;
        default: handleSend(prompt.prompt);
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
    if (transcriptToDiscuss && transcriptToDiscuss.length > 0) {
      const newMessages: ChatMessage[] = transcriptToDiscuss.map(t => createChatMessage(t.source, `**${t.source === 'user' ? 'You' : 'AI Coach'}:** ${t.text}`));
      const contextMessage: ChatMessage = createChatMessage('model', "Here's the transcript from your live rehearsal session. You can review it here or ask follow-up questions.");
      setMessages(prev => [...prev, contextMessage, ...newMessages]);
    }
    handleNavigate('chat');
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
        const result = await identifyTrickFromImage(base64Data, mimeType, user);
        setIdentificationResult(result);
    } catch (err) {
        setIdentificationError(err instanceof Error ? err.message : "An unknown error occurred.");
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
        setActiveView('global-search');
        return;
    }
    resetInlineForms();
    setActiveView(tab);
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
        case 'refine-idea':
            prompt = `As an expert scriptwriter, please review and refine the following piece of content:\n\n---\n\n${action.payload.content}`;
            break;
        case 'draft-email':
            const client: Client = action.payload.client;
            prompt = `As a professional magician's assistant, draft a polite follow-up email to my client, ${client.name}${client.company ? ` from ${client.company}` : ''}.`;
            break;
        default: return;
    }
    setActiveView('chat');
    handleSend(prompt);
  };

  const handleNavigateToAnalytics = (performanceId: string) => {
    setViewingPerformanceId(performanceId);
    setActiveView('performance-analytics');
  };

  const handleUpgrade = (tier: 'amateur' | 'semi-pro' | 'professional') => {
    onUpgrade(tier);
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
        case 'dashboard': return <Dashboard user={user} shows={shows} feedback={feedback} ideas={ideas} onNavigate={handleNavigate} onShowsUpdate={handleShowsUpdate} onPromptClick={handlePromptClick} />;
        case 'live-rehearsal': return <LiveRehearsal onReturnToStudio={handleReturnFromRehearsal} onIdeaSaved={() => handleIdeaSaved('Rehearsal saved!')} />;
        case 'video-rehearsal': return <VideoRehearsal onIdeaSaved={() => handleIdeaSaved('Video analysis saved!')} user={user} />;
        case 'visual-brainstorm': return <VisualBrainstorm onIdeaSaved={() => handleIdeaSaved('Image idea saved!')} user={user} />;
        case 'saved-ideas': return <SavedIdeas onAiSpark={handleAiSpark} initialIdeaId={initialIdeaId || undefined} />;
        case 'prop-checklists': return <PropChecklists onIdeaSaved={() => handleIdeaSaved('Checklist saved!')} />;
        case 'show-planner': return <ShowPlanner user={user} clients={clients} onNavigateToAnalytics={handleNavigateToAnalytics} initialShowId={initialShowId} initialTaskId={initialTaskId} />;
        case 'performance-analytics': return <PerformanceAnalytics performanceId={viewingPerformanceId!} onBack={() => { setViewingPerformanceId(null); setActiveView('show-planner'); }} />;
        case 'show-feedback': return <ShowFeedback />;
        case 'magic-archives': return <MagicArchives onIdeaSaved={() => handleIdeaSaved('Research saved!')} />;
        case 'patter-engine': return <PatterEngine onIdeaSaved={() => handleIdeaSaved('Patter ideas saved!')} user={user} />;
        case 'marketing-campaign': return <MarketingCampaign onIdeaSaved={() => handleIdeaSaved('Marketing campaign ideas saved!')} user={user} />;
        case 'contract-generator': return <ContractGenerator onIdeaSaved={() => handleIdeaSaved('Contract saved!')} user={user} />;
        case 'assistant-studio': return <AssistantStudio onIdeaSaved={() => handleIdeaSaved('Assistant idea saved!')} user={user} />;
        case 'director-mode': return <DirectorMode onIdeaSaved={() => handleIdeaSaved('Show Plan saved!')} />;
        case 'illusion-blueprint': return <IllusionBlueprint onIdeaSaved={() => handleIdeaSaved('Illusion Blueprint saved!')} user={user} />;
        case 'magic-theory-tutor': return <MagicTheoryTutor user={user} />;
        case 'magic-dictionary': return <MagicDictionary />;
        case 'persona-simulator': return <PersonaSimulator onIdeaSaved={() => handleIdeaSaved('Persona simulation saved!')} user={user} />;
        case 'gospel-magic-assistant': return <GospelMagicAssistant onIdeaSaved={() => handleIdeaSaved('Gospel routine idea saved!')} />;
        case 'mentalism-assistant': return <MentalismAssistant onIdeaSaved={() => handleIdeaSaved('Mentalism idea saved!')} user={user} />;
        case 'client-management': return <ClientManagement onClientsUpdate={handleClientsUpdate} onAiSpark={handleAiSpark} />;
        case 'member-management': return <MemberManagement />;
        case 'effect-generator': return <EffectGenerator onIdeaSaved={() => handleIdeaSaved('Effect ideas saved!')} />;
        case 'magic-wire': return <MagicWire onIdeaSaved={() => handleIdeaSaved('News article saved!')} />;
        case 'global-search': return <GlobalSearch shows={shows} ideas={ideas} onNavigate={handleDeepLink} />;
        case 'identify': return <IdentifyTab imageFile={imageFile} imagePreview={imagePreview} identificationResult={identificationResult} isIdentifying={isIdentifying} identificationError={identificationError} fileInputRef={fileInputRef} handleImageUpload={handleImageUpload} handleIdentifyClick={handleIdentifyClick} />;
        case 'publications': return <PublicationsTab />;
        case 'community': return <CommunityTab />;
        case 'chat': default: return <ChatView messages={messages} isLoading={isLoading} recentlySaved={recentlySaved} handleSaveIdea={handleSaveIdea} handleFeedback={handleFeedback} messagesEndRef={messagesEndRef} showAngleRiskForm={showAngleRiskForm} trickName={trickName} setTrickName={setTrickName} audienceType={audienceType} setAudienceType={setAudienceType} handleAngleRiskSubmit={handleAngleRiskSubmit} onCancelAngleRisk={() => { setShowAngleRiskForm(false); setTrickName(''); setAudienceType(null); }} showRehearsalForm={showRehearsalForm} routineDescription={routineDescription} setRoutineDescription={setRoutineDescription} targetDuration={targetDuration} setTargetDuration={setTargetDuration} handleRehearsalSubmit={handleRehearsalSubmit} onCancelRehearsal={() => { setShowRehearsalForm(false); setRoutineDescription(''); setTargetDuration(''); }} onFileChange={handleRoutineScriptUpload} showInnovationEngineForm={showInnovationEngineForm} effectToInnovate={effectToInnovate} setEffectToInnovate={setEffectToInnovate} handleInnovationEngineSubmit={handleInnovationEngineSubmit} onCancelInnovationEngine={() => { setShowInnovationEngineForm(false); setEffectToInnovate(''); }} prompts={MAGICIAN_PROMPTS} user={user} hasAmateurAccess={hasAmateurAccess} hasSemiProAccess={hasSemiProAccess} hasProfessionalAccess={hasProfessionalAccess} onPromptClick={handlePromptClick} />;
    }
  }

  const TabButton: React.FC<{ label: string; icon: React.FC<{ className?: string }>; isActive: boolean; onClick: () => void; isLocked?: boolean; }> = ({ label, icon: Icon, isActive, onClick, isLocked }) => (
    <button onClick={onClick} title={isLocked ? 'Upgrade to access this feature' : ''} className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${ isActive ? 'border-b-2 border-purple-400 text-purple-300' : 'border-b-2 border-transparent text-slate-400 hover:text-white'} ${isLocked ? 'text-slate-600 hover:text-slate-600' : ''}`}>
        <Icon className="w-5 h-5" />
        <span>{label}</span>
        {isLocked && <LockIcon className="absolute top-1 right-1 w-3 h-3 text-amber-400/80" />}
    </button>
  );

  const activeTab = VIEW_TO_TAB_MAP[activeView];
  const showFooter = activeView === 'chat';

  return (
    <div className="relative flex flex-col h-full rounded-lg border border-slate-800 shadow-2xl shadow-purple-900/20 overflow-hidden">
        {isUpgradeModalOpen && <UpgradeModal onClose={() => setIsUpgradeModalOpen(false)} onUpgrade={handleUpgrade} />}
        {isHelpModalOpen && <HelpModal onClose={() => setIsHelpModalOpen(false)} />}
      <header className="flex items-center p-4 border-b border-slate-800">
        <button onClick={handleReturnToStudioHome} className="p-2 mr-4 rounded-full hover:bg-slate-700 transition-colors">
          <BackIcon className="w-6 h-6 text-slate-300" />
        </button>
        <img src="/logo.svg" alt="Magicians' AI Wizard" className="h-10 w-auto mr-3" />
        <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setIsHelpModalOpen(true)} className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Help" aria-label="Open help center">
                <QuestionMarkIcon className="w-6 h-6" />
            </button>
            <AccountMenu user={user} onLogout={onLogout} />
        </div>
      </header>
      
      <nav className="flex border-b border-slate-800 px-2 md:px-4 flex-wrap">
        <TabButton label="AI Assistant" icon={WandIcon} isActive={activeTab === 'chat'} onClick={() => handleTabClick('chat')} />
        <TabButton label="Show Planner" icon={ChecklistIcon} isActive={activeTab === 'show-planner'} onClick={() => handleTabClick('show-planner')} isLocked={!hasAmateurAccess} />
        <TabButton label="Effect Generator" icon={LightbulbIcon} isActive={activeTab === 'effect-generator'} onClick={() => handleTabClick('effect-generator')} />
        <TabButton label="Dictionary" icon={TutorIcon} isActive={activeTab === 'magic-dictionary'} onClick={() => handleTabClick('magic-dictionary')} isLocked={!hasProfessionalAccess} />
        <TabButton label="Search" icon={SearchIcon} isActive={activeTab === 'search'} onClick={() => handleTabClick('search')} />
        <TabButton label="Identify Trick" icon={CameraIcon} isActive={activeTab === 'identify'} onClick={() => handleTabClick('identify')} />
        <TabButton label="Magic Wire" icon={NewspaperIcon} isActive={activeTab === 'magic-wire'} onClick={() => handleTabClick('magic-wire')} />
        <TabButton label="Publications" icon={NewspaperIcon} isActive={activeTab === 'publications'} onClick={() => handleTabClick('publications')} />
        <TabButton label="Community" icon={UsersIcon} isActive={activeTab === 'community'} onClick={() => handleTabClick('community')} />
      </nav>

      <main className="flex-1 flex flex-col overflow-y-auto">
        <div className="flex-1 flex flex-col animate-fade-in">
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
