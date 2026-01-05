
import React, { useState } from 'react';
import { addSuggestion } from '../services/suggestionService';
import { ChatBubbleIcon, CheckIcon, WandIcon } from './icons';

interface AppSuggestionModalProps {
    onClose: () => void;
}

const AppSuggestionModal: React.FC<AppSuggestionModalProps> = ({ onClose }) => {
    const [type, setType] = useState<'bug' | 'feature' | 'general'>('general');
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            await addSuggestion({ type, content });
            setIsSuccess(true);
            setTimeout(() => {
                onClose();
            }, 2000);
        } catch (err) {
            console.error(err);
            setError("Failed to submit suggestion. Please try again.");
            setIsSubmitting(false);
        }
    };

    return (
        <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
            onClick={onClose}
        >
            <div 
                className="w-full max-w-lg bg-slate-800 border-2 border-purple-500 rounded-lg shadow-2xl shadow-purple-900/40 flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="p-4 border-b border-slate-700 flex items-center gap-3 bg-slate-900/50">
                    <ChatBubbleIcon className="w-6 h-6 text-purple-400" />
                    <h2 className="text-xl font-bold text-white font-cinzel">App Feedback</h2>
                </header>

                <div className="p-6">
                    {isSuccess ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-500/50">
                                <CheckIcon className="w-8 h-8 text-green-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Thank You!</h3>
                            <p className="text-slate-400">Your feedback has been magically teleported to our team.</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <p className="text-sm text-slate-400 mb-4">
                                Found a bug? Have a feature request? Let us know how we can improve the Magicians' AI Wizard.
                            </p>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Feedback Type</label>
                                <div className="grid grid-cols-3 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setType('bug')}
                                        className={`py-2 px-3 rounded-md text-sm font-semibold transition-colors ${type === 'bug' ? 'bg-red-900/50 border border-red-500 text-red-200' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                    >
                                        Bug Report
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setType('feature')}
                                        className={`py-2 px-3 rounded-md text-sm font-semibold transition-colors ${type === 'feature' ? 'bg-purple-900/50 border border-purple-500 text-purple-200' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                    >
                                        Feature Request
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setType('general')}
                                        className={`py-2 px-3 rounded-md text-sm font-semibold transition-colors ${type === 'general' ? 'bg-sky-900/50 border border-sky-500 text-sky-200' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                    >
                                        General
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="content" className="block text-sm font-medium text-slate-300 mb-1">Details</label>
                                <textarea
                                    id="content"
                                    rows={5}
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="Describe your suggestion or issue..."
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                                    required
                                />
                            </div>

                            {error && <p className="text-red-400 text-sm">{error}</p>}

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 font-bold transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !content.trim()}
                                    className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <span>Sending...</span>
                                    ) : (
                                        <>
                                            <WandIcon className="w-4 h-4" />
                                            <span>Submit</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AppSuggestionModal;
