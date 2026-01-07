import React, { useState, useEffect, useCallback } from 'react';
import { saveIdea } from '../services/ideasService';
import { supabase } from '../supabase';
import type { NewsArticle, NewsCategory, User } from '../types';
import { NewspaperIcon, WandIcon, SaveIcon, ShareIcon, CheckIcon } from './icons';
import ShareButton from './ShareButton';
import FormattedText from './FormattedText';
const CATEGORY_STYLES: Record<NewsCategory, string> = {
  'New Release': 'bg-sky-500/20 text-sky-300',
  'Interview': 'bg-green-500/20 text-green-300',
  'Review': 'bg-amber-500/20 text-amber-300',
  'Community News': 'bg-blue-500/20 text-blue-300',
  'Opinion': 'bg-indigo-500/20 text-indigo-300',
  'Historical Piece': 'bg-purple-500/20 text-purple-300',
};

function buildSearchUrl(article: NewsArticle) {
  const q = encodeURIComponent(`${article.headline} ${article.source}`);
  return `https://www.google.com/search?q=${q}`;
}

function getOriginalUrl(article: NewsArticle) {
  return article.sourceUrl?.trim() ? article.sourceUrl.trim() : buildSearchUrl(article);
}

function OriginalLink({ article, className }: { article: NewsArticle; className?: string }) {
  const href = getOriginalUrl(article);
  const label = article.sourceUrl?.trim() ? 'Read original' : 'Search this headline';
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={className ?? 'inline-flex items-center gap-1 underline hover:text-slate-200'}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      title={label}
    >
      <span>{label}</span>
      <span className="text-xs opacity-80">↗</span>
    </a>
  );
}

const LoadingIndicator = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: 9 }).map((_, i) => (
      <div key={i} className="h-40 rounded-xl bg-slate-900/40 border border-slate-800 animate-pulse" />
    ))}
  </div>
);

const ArticleModal = ({
  article,
  onClose,
  onIdeaSaved,
}: {
  article: NewsArticle;
  onClose: () => void;
  onIdeaSaved: () => void;
}) => {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const originalUrl = getOriginalUrl(article);

  const handleSave = () => {
    setSaveStatus('saving');

    const fullContent = `## ${article.headline}

**Source:** ${article.source}
**Original:** ${originalUrl}
**Category:** ${article.category}

${article.body}

*For personal rehearsal and performance preparation use only.*`;

    saveIdea('text', fullContent, article.headline);
    onIdeaSaved();
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl bg-zinc-950 border border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${CATEGORY_STYLES[article.category]}`}>
                {article.category}
              </span>
              <span className="text-xs text-slate-500">{new Date(article.timestamp).toLocaleString()}</span>
            </div>
            <h2 className="text-xl font-semibold mw-title mt-2 break-words">
              {article.headline}
            </h2>

            {/* Source row (more explicit) */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Source:</span>
                <a
                  href={getOriginalUrl(article)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline hover:text-white"
                  title={article.sourceUrl?.trim() ? 'Open original source' : 'Search this headline'}
                >
                  {article.source}
                </a>
              </div>
              <span className="text-slate-600">•</span>
              <OriginalLink article={article} className="text-slate-300 underline hover:text-white" />
            </div>
          </div>

          <button
            className="text-slate-400 hover:text-white rounded-md px-2 py-1"
            onClick={onClose}
            aria-label="Close article"
          >
            ✕
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto">
          <p className="text-slate-300 mb-4">{article.summary}</p>
          <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-headings:text-white">
            <FormattedText text={article.body} />
          </div>
        </div>

        <div className="p-5 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-md bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 text-sm font-medium"
              onClick={handleSave}
              disabled={saveStatus !== 'idle'}
            >
              {saveStatus === 'saved' ? <CheckIcon className="w-4 h-4" /> : <SaveIcon className="w-4 h-4" />}
              <span>{saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : 'Save to Ideas'}</span>
            </button>

            <ShareButton
              title={article.headline}
              text={`${article.headline}\n\nSource: ${article.source}\n\n${article.summary}`}
              className="inline-flex items-center gap-2 rounded-md bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 text-sm font-medium"
            >
              <ShareIcon className="w-4 h-4" />
              <span>Share</span>
            </ShareButton>
          </div>

          <OriginalLink
            article={article}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 hover:border-slate-500 text-slate-200 px-3 py-2 text-sm font-medium"
          />
        </div>
      </div>
    </div>
  );
};

const MagicWire: React.FC<{ onIdeaSaved?: () => void; currentUser?: User }> = ({ onIdeaSaved, currentUser }) => {  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<NewsArticle | null>(null);
  const [savedToast, setSavedToast] = useState(false);

  const fetchArticles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch the Magic Wire feed from the server (non-AI RSS aggregation).
      // This avoids AI-provider failures taking down the entire page.
      const { data } = await (supabase as any).auth.getSession();
      const token = data?.session?.access_token;
      const res = await fetch(`/api/magicWire?count=9`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const text = await res.text();
      let json: any;
      try { json = text ? JSON.parse(text) : []; } catch { json = []; }

      if (!res.ok) {
        const msg = json?.error || `Request failed (${res.status})`;
        throw new Error(msg);
      }

      const rawItems = Array.isArray(json) ? json : [];
      const now = Date.now();

      const newArticles: NewsArticle[] = rawItems.map((raw: any, idx: number) => {
        const ts = typeof raw?.timestamp === 'number' ? raw.timestamp : (now - idx);
        return {
          id: raw?.id || (crypto?.randomUUID ? crypto.randomUUID() : `${ts}-${Math.random()}`),
          timestamp: ts,
          category: raw?.category || 'Community News',
          headline: raw?.headline || 'Untitled',
          source: raw?.source || 'Unknown',
          sourceUrl: raw?.sourceUrl,
          summary: raw?.summary || '',
          body: raw?.body || raw?.summary || '',
        } as NewsArticle;
      });

      setArticles(newArticles);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load Magic Wire.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const handleIdeaSaved = () => {
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between gap-3 p-4 md:p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <NewspaperIcon className="w-6 h-6 text-purple-300" />
          <div>
            <h1 className="text-xl font-semibold text-white">Magic Wire</h1>
            <p className="text-sm text-slate-400">Curated magic news, reviews, and community updates.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {savedToast && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-green-300 bg-green-500/10 border border-green-500/20 px-3 py-2 rounded-md">
              <CheckIcon className="w-4 h-4" />
              <span>Saved to Ideas</span>
            </div>
          )}
          <button
            className="inline-flex items-center gap-2 rounded-md bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 text-sm font-medium"
            onClick={fetchArticles}
            disabled={isLoading}
            title="Refresh Magic Wire (runs one AI call)"
          >
            <WandIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Loading…' : 'Refresh Feed'}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        {isLoading ? (
          <LoadingIndicator />
        ) : error ? (
          <div className="text-center text-red-400">{error}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {articles.map((article) => (
              <button
                key={article.id}
                onClick={() => setSelected(article)}
                className="group text-left rounded-xl bg-slate-900/40 border border-slate-800 hover:border-purple-500 hover:shadow-lg hover:shadow-purple-900/20 p-4 flex flex-col justify-between gap-4"
              >
                <div>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${CATEGORY_STYLES[article.category]}`}>
                    {article.category}
                  </span>
                  <h3 className="font-bold text-lg mw-title mt-2">
                    {article.headline}
                  </h3>
                  <p className="text-sm text-slate-400 mt-2 line-clamp-3">{article.summary}</p>
                </div>

                {/* Explicit Source row (new) */}
                <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-slate-500">Source:</span>
                  <a
                    href={getOriginalUrl(article)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline hover:text-slate-200"
                    onClick={(e) => e.stopPropagation()}
                    title={article.sourceUrl?.trim() ? 'Open original source' : 'Search this headline'}
                  >
                    {article.source}
                  </a>
                  <span className="text-slate-600">•</span>
                  <OriginalLink article={article} className="underline hover:text-slate-200" />
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {selected && <ArticleModal article={selected} onClose={() => setSelected(null)} onIdeaSaved={handleIdeaSaved} />}
    </div>
  );
};

export default MagicWire;