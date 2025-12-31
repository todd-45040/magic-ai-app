
import React, { useState, useEffect, useCallback } from 'react';
import { generateNewsArticle } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import type { NewsArticle, NewsCategory } from '../types';
import { NewspaperIcon, WandIcon, SaveIcon, ShareIcon, CheckIcon } from './icons';
import ShareButton from './ShareButton';
import FormattedText from './FormattedText';
import { useAppState } from '../store';

const CATEGORY_STYLES: Record<NewsCategory, string> = {
    'New Release': 'bg-sky-500/20 text-sky-300',
    'Interview': 'bg-green-500/20 text-green-300',
    'Review': 'bg-amber-500/20 text-amber-300',
    'Community News': 'bg-blue-500/20 text-blue-300',
    'Opinion': 'bg-indigo-500/20 text-indigo-300',
    'Historical Piece': 'bg-stone-500/20 text-stone-300'
};

const LoadingIndicator: React.FC = () => (
    <div className="flex flex-col items-center justify-center text-center p-8 h-full">
        <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
        <p className="text-slate-300 mt-4 text-lg">Fetching the latest from the wire...</p>
    </div>
);

const ArticleModal: React.FC<{
    article: NewsArticle | null;
    onClose: () => void;
    onIdeaSaved: () => void;
}> = ({ article, onClose, onIdeaSaved }) => {
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

    useEffect(() => {
        // Reset save status when a new article is opened
        setSaveStatus('idle');
    }, [article]);

    if (!article) return null;

    const handleSave = () => {
        const fullContent = `## ${article.headline}\n\n**Source:** ${article.source}\n**Category:** ${article.category}\n\n${article.body}`;
        saveIdea('text', fullContent, article.headline);
        onIdeaSaved();
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
            <div className="w-full max-w-3xl h-[90vh] bg-slate-800 border border-purple-500 rounded-lg shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-700 flex-shrink-0">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${CATEGORY_STYLES[article.category]}`}>{article.category}</span>
                    <h2 className="text-xl lg:text-2xl font-bold text-white mt-2">{article.headline}</h2>
                    <p className="text-sm text-slate-400">By {article.source} &bull; {new Date(article.timestamp).toLocaleDateString()}</p>
                </header>
                <main className="flex-1 overflow-y-auto p-6">
                    <FormattedText text={article.body} />
                </main>
                <footer className="p-4 border-t border-slate-700 flex-shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShareButton title={article.headline} text={article.body} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200">
                            <ShareIcon className="w-4 h-4" /> Share
                        </ShareButton>
                        <button onClick={handleSave} disabled={saveStatus === 'saved'} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200">
                            {saveStatus === 'saved' ? <CheckIcon className="w-4 h-4 text-green-400" /> : <SaveIcon className="w-4 h-4" />}
                            {saveStatus === 'saved' ? 'Saved!' : 'Save Idea'}
                        </button>
                    </div>
                    <button onClick={onClose} className="px-4 py-2 text-sm bg-slate-600/50 hover:bg-slate-700 rounded-md text-slate-300 font-bold">Close</button>
                </footer>
            </div>
        </div>
    );
};

const MagicWire: React.FC<{ onIdeaSaved: () => void }> = ({ onIdeaSaved }) => {
    const { currentUser } = useAppState() as any;
    const [articles, setArticles] = useState<NewsArticle[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);

    const fetchNews = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // FIX: generateNewsArticle expects currentUser
            const articlePromises = Array.from({ length: 5 }, () => generateNewsArticle(currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' }));
            const results = await Promise.all(articlePromises);
            const newArticles: NewsArticle[] = results.map(art => ({
                ...art,
                id: `article-${Date.now()}-${Math.random()}`,
                timestamp: Date.now() - Math.floor(Math.random() * 86400000) // Random timestamp within last 24h
            })).sort((a, b) => b.timestamp - a.timestamp);
            setArticles(newArticles);
        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred while fetching news.");
        } finally {
            setIsLoading(false);
        }
    }, [currentUser]);

    useEffect(() => {
        fetchNews();
    }, [fetchNews]);

    return (
        <div className="flex flex-col h-full animate-fade-in">
            {selectedArticle && <ArticleModal article={selectedArticle} onClose={() => setSelectedArticle(null)} onIdeaSaved={onIdeaSaved} />}
            <header className="p-4 md:px-6 md:pt-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <NewspaperIcon className="w-8 h-8 text-purple-400" />
                        <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Magic Wire</h2>
                    </div>
                    <button onClick={fetchNews} disabled={isLoading} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors flex items-center gap-2 text-sm disabled:bg-slate-600">
                        <WandIcon className="w-4 h-4" />
                        <span>{isLoading ? 'Loading...' : 'Refresh Feed'}</span>
                    </button>
                </div>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
                {isLoading ? <LoadingIndicator /> : error ? (
                    <div className="text-center text-red-400">{error}</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {articles.map(article => (
                            <button key={article.id} onClick={() => setSelectedArticle(article)} className="text-left bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col justify-between transition-all hover:border-purple-500 hover:shadow-lg hover:shadow-purple-900/20">
                                <div>
                                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${CATEGORY_STYLES[article.category]}`}>{article.category}</span>
                                    <h3 className="font-bold text-lg text-white mt-2">{article.headline}</h3>
                                    <p className="text-sm text-slate-400 mt-2 line-clamp-3">{article.summary}</p>
                                </div>
                                <p className="text-xs text-slate-500 mt-4">By {article.source}</p>
                            </button>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default MagicWire;
