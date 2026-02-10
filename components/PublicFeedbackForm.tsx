import React, { useMemo, useState } from 'react';
import { submitShowFeedback } from '../services/showFeedbackService';
import { StarIcon, WandIcon } from './icons';

const REACTIONS: { key: any; label: string }[] = [
  { key: '🎉', label: 'Fun' },
  { key: '😲', label: 'Wow' },
  { key: '😂', label: 'Funny' },
  { key: '🤔', label: 'Confusing' },
  { key: '👏', label: 'Applause' },
  { key: '❤️', label: 'Loved it' },
];

function getParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    showId: params.get('showId') ?? '',
    token: params.get('token') ?? '',
  };
}

const PublicFeedbackForm: React.FC = () => {
  const { showId, token } = useMemo(getParams, []);
  const [rating, setRating] = useState(0);
  const [reaction, setReaction] = useState<any | null>(null);
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const canSubmit = showId && token && rating > 0 && status !== 'submitting';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus('submitting');
    setErrorMsg('');

    const res = await submitShowFeedback({
      showId,
      token,
      rating,
      reaction: reaction ?? undefined,
      comment: comment.trim() || undefined,
      name: name.trim() || undefined,
      tags: [],
    });

    if (res.ok) {
      setStatus('done');
    } else {
      setStatus('error');
      setErrorMsg(res.error ?? 'Something went wrong.');
    }
  };

  if (!showId || !token) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-slate-900/60 border border-slate-700 rounded-xl p-6 text-center">
          <h1 className="text-2xl font-bold font-cinzel">Feedback Link Invalid</h1>
          <p className="text-slate-300 mt-2">
            This QR link is missing details. Please ask the magician for a new QR code.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-purple-950 text-white">
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 justify-center mb-6">
          <WandIcon className="w-7 h-7 text-purple-300" />
          <h1 className="text-3xl font-bold font-cinzel tracking-wide">Show Feedback</h1>
        </div>

        {status === 'done' ? (
          <div className="bg-green-900/25 border border-green-500/40 rounded-xl p-8 text-center">
            <h2 className="text-2xl font-bold text-green-200">Thank you!</h2>
            <p className="text-slate-200 mt-2">Your feedback helps make the magic even better.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-slate-900/60 border border-slate-700 rounded-xl p-6 space-y-6">
            <div className="text-center">
              <p className="text-slate-300">How would you rate the show?</p>
              <div className="flex items-center justify-center gap-2 mt-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 rounded-full transition-transform hover:scale-110"
                    aria-label={`${star} star${star === 1 ? '' : 's'}`}
                  >
                    <StarIcon className={`w-10 h-10 ${rating >= star ? 'text-amber-400' : 'text-slate-600 hover:text-amber-300/40'}`} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-300 mb-2">Quick reaction (optional)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {REACTIONS.map((r) => (
                  <button
                    type="button"
                    key={r.key}
                    onClick={() => setReaction(reaction === r.key ? null : r.key)}
                    className={`px-3 py-2 rounded-lg border text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                      reaction === r.key
                        ? 'bg-purple-600/30 border-purple-400 text-white'
                        : 'bg-slate-800/50 border-slate-700 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-lg" aria-hidden="true">{r.key}</span>
                    <span>{r.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2" htmlFor="comment">
                Comments (optional)
              </label>
              <textarea
                id="comment"
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us what you enjoyed..."
                className="w-full px-3 py-2 bg-slate-950/40 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2" htmlFor="name">
                Your name (optional)
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex"
                className="w-full px-3 py-2 bg-slate-950/40 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-400"
              />
            </div>

            {status === 'error' && (
              <div className="p-3 rounded-lg bg-red-900/25 border border-red-500/40 text-red-200 text-sm">
                {errorMsg || 'Something went wrong.'}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-3 rounded-lg font-bold bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors"
            >
              {status === 'submitting' ? 'Submitting...' : 'Submit Feedback'}
            </button>

            <p className="text-xs text-slate-500 text-center">
              Powered by Magic AI Wizard
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default PublicFeedbackForm;
