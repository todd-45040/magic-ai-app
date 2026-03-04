
import React, { useState, useEffect, useRef } from 'react';
import { generateImage, editImageWithPrompt } from '../services/geminiService';
import BlockedPanel from './BlockedPanel';
import { normalizeBlockedUx } from '../services/blockedUx';
import { saveIdea } from '../services/ideasService';
import { BackIcon, ImageIcon, WandIcon, SaveIcon, CheckIcon, ShareIcon, TrashIcon, CameraIcon } from './icons';
import ShareButton from './ShareButton';
import { CohesionActions } from './CohesionActions';
import type { User } from '../types';
import { canConsume, consume } from '../services/usageTracker';

interface VisualBrainstormProps {
    onIdeaSaved: () => void;
    user: User;
    onRequestUpgrade?: () => void;
}

const ImageLoadingIndicator: React.FC<{ label?: string }> = ({ label }) => {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    // Lightweight “perceived progress” indicator.
    // We cap at 92% until completion so it never looks stuck at 100%.
    setProgress(8);
    const interval = window.setInterval(() => {
      setProgress((p) => {
        const next = p + Math.max(1, Math.round((92 - p) * 0.08));
        return Math.min(92, next);
      });
    }, 650);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center text-center p-8 w-full max-w-md">
      <div className="relative">
        <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
          <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin" />
        </div>
      </div>

      <p className="text-slate-200 mt-5 text-lg font-semibold">{label || 'Generating concept art…'}</p>
      <p className="text-slate-400 text-sm mt-1">Hang tight — this can take a moment.</p>

      <div className="w-full mt-5">
        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
          <div className="h-full bg-purple-500/80 transition-all" style={{ width: `${progress}%` }} aria-hidden="true" />
        </div>
        <div className="mt-2 text-xs text-slate-500">{progress}%</div>
      </div>
    </div>
  );
};


const VisualBrainstorm: React.FC<VisualBrainstormProps> = ({ onIdeaSaved, user, onRequestUpgrade }) => {
  const [editPrompt, setEditPrompt] = useState('');
  // Phase 1: Structured inputs for text-to-image
  const [objectProp, setObjectProp] = useState('');
  const [sceneSetting, setSceneSetting] = useState('');
  const [style, setStyle] = useState('');
  const [context, setContext] = useState('');
  const [advancedPrompt, setAdvancedPrompt] = useState(false);
  const [promptOverride, setPromptOverride] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '9:16'>('1:1');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedUi, setBlockedUi] = useState<ReturnType<typeof normalizeBlockedUx> | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [saveImageStatus, setSaveImageStatus] = useState<'idle' | 'saved'>('idle');
  const [shareFile, setShareFile] = useState<File | null>(null);

  // New state for input image
  const [inputImageFile, setInputImageFile] = useState<File | null>(null);
  const [inputImagePreview, setInputImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (generatedImage) {
        const convertDataUrlToFile = async () => {
            const res = await fetch(generatedImage);
            const blob = await res.blob();
            const file = new File([blob], `magic-visual-idea-${Date.now()}.jpg`, { type: 'image/jpeg' });
            setShareFile(file);
        };
        convertDataUrlToFile();
    } else {
        setShareFile(null);
    }
  }, [generatedImage]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setError('Invalid file type. Please upload a JPG, PNG, or WEBP image.');
        return;
      }
      setInputImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setInputImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setError(null);
    }
  };

  const handleRemoveImage = () => {
    setInputImageFile(null);
    setInputImagePreview(null);
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  

  const buildPrompt = () => {
    const parts: string[] = [];

    // Order matters: style + setting first tends to steer composition.
    if (style.trim()) parts.push(style.trim());
    if (sceneSetting.trim()) parts.push(sceneSetting.trim());
    if (objectProp.trim()) parts.push(`magic concept using ${objectProp.trim()}`);
    if (context.trim()) parts.push(context.trim());

    // A gentle anchor so outputs stay “magic concept art” rather than generic product shots.
    parts.push('professional magic performance concept art');

    return parts.join(', ');
  };

  const isEditing = Boolean(inputImagePreview);
  const finalPrompt = isEditing
    ? editPrompt.trim()
    : (advancedPrompt && promptOverride.trim() ? promptOverride.trim() : buildPrompt());

const handleSubmit = async () => {
    if (!finalPrompt.trim()) {
        setError(isEditing ? "Please enter editing instructions." : "Please provide at least an Object/Prop, Scene/Setting, or Style.");
        return;
    }

    // Daily cap: images generated
    const chk = canConsume(user, 'image', 1);
    if (!chk.ok) {
        setError(`Daily image limit reached (${chk.used}/${chk.limit}). Upgrade to continue.`);
        return;
    }
    consume(user, 'image', 1);
    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);
    setSaveImageStatus('idle');

    try {
        let imageUrl: string;
        if (inputImageFile && inputImagePreview) {
            // Image editing flow
            const base64Data = inputImagePreview.split(',')[1];
            // FIX: Pass user object as the 4th argument to editImageWithPrompt
            imageUrl = await editImageWithPrompt(base64Data, inputImageFile.type, finalPrompt, user);
        } else {
            // Text-to-image flow
            // FIX: Pass user object as the 3rd argument to generateImage
            imageUrl = await generateImage(finalPrompt, aspectRatio, user);
        }
        setGeneratedImage(imageUrl);
    } catch (err) {
        setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleSaveImage = () => {
    if (generatedImage) {
        saveIdea('image', generatedImage);
        onIdeaSaved();
        setSaveImageStatus('saved');
        setTimeout(() => setSaveImageStatus('idle'), 2000);
    }
  }
  
  const placeholderText = inputImagePreview
    ? "e.g., Add a wizard hat to the person in the image. Make the background a mystical forest."
    : "e.g., A sleek, futuristic magician's top hat made of chrome, with a holographic band.";

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Control Panel */}
        <div className="flex flex-col">
            <h2 className="text-xl font-bold text-slate-300 mb-2">Describe Your Vision</h2>
            <p className="text-slate-400 mb-4">
              {inputImagePreview
                ? "Describe the changes you want to make to the uploaded image."
                : "Generate concept art for props, costumes, or posters from scratch."
              }
            </p>
            
            <div className="space-y-4">
                <div>
                    <div className="flex justify-between items-baseline mb-1">
                        <label className="block text-sm font-medium text-slate-300">
                          {isEditing ? 'Editing Instructions' : 'Visual Prompt Builder'}
                        </label>
                        {(isEditing ? editPrompt : (objectProp || sceneSetting || style || context || promptOverride)) && (
                             <button
                                type="button"
                                onClick={() => (isEditing ? setEditPrompt('') : (setObjectProp(''), setSceneSetting(''), setStyle(''), setContext(''), setPromptOverride(''), setAdvancedPrompt(false)))}
                                className="px-2 py-0.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {isEditing ? (
                      <textarea
                        id="image-prompt"
                        rows={6}
                        value={editPrompt}
                        onChange={(e) => { setEditPrompt(e.target.value); setError(null); }}
                        placeholder={placeholderText}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                      />
                    ) : (
                      <div className="space-y-3">
                        {/* Object / Prop */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Object / Prop</label>
                          <input
                            value={objectProp}
                            onChange={(e) => { setObjectProp(e.target.value); setError(null); }}
                            placeholder="coin, rope, deck of cards..."
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                          />
                        </div>

                        {/* Scene / Setting */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Scene / Setting</label>
                          <input
                            value={sceneSetting}
                            onChange={(e) => { setSceneSetting(e.target.value); setError(null); }}
                            placeholder="close-up table, stage illusion, street magic..."
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                          />
                        </div>

                        {/* Style */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Style</label>
                          <input
                            value={style}
                            onChange={(e) => { setStyle(e.target.value); setError(null); }}
                            placeholder="mysterious, steampunk, dark magic, comedy..."
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                          />
                        </div>

                        {/* Optional Context */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Optional Context</label>
                          <textarea
                            rows={3}
                            value={context}
                            onChange={(e) => { setContext(e.target.value); setError(null); }}
                            placeholder="Audience size, lighting conditions, show theme..."
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                          />
                        </div>

                        {/* Prompt preview + advanced override */}
                        <div className="rounded-md border border-slate-700 bg-slate-900/40 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-slate-400">Assembled Prompt</span>
                            <button
                              type="button"
                              onClick={() => setAdvancedPrompt(v => !v)}
                              className="text-xs font-semibold text-slate-300 hover:text-white"
                            >
                              {advancedPrompt ? 'Hide Advanced' : 'Advanced'}
                            </button>
                          </div>

                          {!advancedPrompt ? (
                            <p className="text-sm text-slate-200 break-words">{buildPrompt()}</p>
                          ) : (
                            <textarea
                              rows={4}
                              value={promptOverride}
                              onChange={(e) => { setPromptOverride(e.target.value); setError(null); }}
                              placeholder="Optional: override the full prompt (advanced)"
                              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                            />
                          )}
                        </div>
                      </div>
                    )}
                </div>
                 <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    className="hidden"
                />
                {inputImagePreview ? (
                    <div className="relative w-full h-40 bg-slate-800 rounded-lg flex items-center justify-center overflow-hidden">
                        <img src={inputImagePreview} alt="Input preview" className="max-w-full max-h-full object-contain" />
                        <button onClick={handleRemoveImage} className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white hover:bg-red-600 transition-colors" title="Remove image">
                            <TrashIcon className="w-5 h-5" />
                        </button>
                    </div>
                ) : (
                    <button onClick={() => fileInputRef.current?.click()} className="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-600 rounded-lg hover:bg-slate-800/50 hover:border-purple-500 transition-colors">
                        <CameraIcon className="w-10 h-10 text-slate-500 mb-2"/>
                        <span className="font-semibold text-slate-300">Upload an Image to Edit (Optional)</span>
                        <span className="text-sm text-slate-400">JPG, PNG, WEBP</span>
                    </button>
                )}
                {!inputImagePreview && (
                    <div>
                         <label className="block text-sm font-medium text-slate-300 mb-2">Aspect Ratio</label>
                         <div className="grid grid-cols-3 gap-2">
                            {(['1:1', '16:9', '9:16'] as const).map(ratio => (
                                <button
                                    key={ratio}
                                    onClick={() => setAspectRatio(ratio)}
                                    className={`py-2 px-3 rounded-md transition-colors text-sm font-semibold ${
                                        aspectRatio === ratio
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                                    }`}
                                >
                                    {ratio}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <button
                    onClick={handleSubmit}
                    disabled={isLoading || !finalPrompt.trim()}
                    className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                >
                    {isLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        <span>Generating concept art…</span>
                      </>
                    ) : (
                      <>
                        <WandIcon className="w-5 h-5" />
                        <span>Generate Image</span>
                      </>
                    )}
                </button>
                {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
            </div>
        </div>

        {/* Image Display Area */}
        <div className="flex items-center justify-center bg-slate-900/50 rounded-lg border border-slate-800 p-4 min-h-[300px]">
            {isLoading ? (
                <ImageLoadingIndicator label={inputImagePreview ? 'Applying your edit…' : 'Generating concept art…'} />
            ) : generatedImage ? (
                 <div className="relative group w-full h-full flex items-center justify-center">
                    <img src={generatedImage} alt="Generated concept art" className="max-w-full max-h-full object-contain rounded-md shadow-lg" />
                    <div className="absolute top-2 right-2 flex gap-2 transition-opacity">
                        <CohesionActions
                            content={generatedImage}
                            defaultTitle={`Visual Brainstorm: ${finalPrompt || 'Concept Art'}`}
                            defaultTags={["visual", "concept"]}
                            ideaType="image"
                            compact
                        />
                        {shareFile && (
                            <ShareButton
                                title="Magic Visual Idea"
                                text={`Check out this visual idea I generated with the Magician's AI Wizard: ${finalPrompt}`}
                                file={shareFile}
                                className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-800/70 hover:bg-slate-700 rounded-md text-slate-200"
                                aria-label="Share image"
                            >
                                <ShareIcon className="w-4 h-4" />
                                <span>Share</span>
                            </ShareButton>
                        )}
                        <button
                            onClick={handleSaveImage}
                            disabled={saveImageStatus === 'saved'}
                            className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-800/70 hover:bg-slate-700 rounded-md text-slate-200 disabled:opacity-100 disabled:cursor-default transition-opacity"
                        >
                            {saveImageStatus === 'saved' ? (
                                <>
                                    <CheckIcon className="w-4 h-4 text-green-400" />
                                    <span>Saved!</span>
                                </>
                            ) : (
                                <>
                                    <SaveIcon className="w-4 h-4" />
                                    <span>Save Idea</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="text-center text-slate-500">
                    <ImageIcon className="w-24 h-24 mx-auto mb-4" />
                    <p>Your generated image will appear here.</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default VisualBrainstorm;
