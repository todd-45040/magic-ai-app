import React from 'react';
import { createPortal } from 'react-dom';
import type { Feedback } from '../types';
import { StarIcon } from './icons';

interface FeedbackModalProps {
  feedback: Feedback;
  onClose: () => void;
}

const StarRatingDisplay: React.FC<{ rating: number, className?: string }> = ({ rating, className = 'w-6 h-6' }) => (
    <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
            <StarIcon
                key={star}
                className={`${className} ${star <= rating ? 'text-amber-400' : 'text-slate-600'}`}
            />
        ))}
    </div>
);

const FeedbackModal: React.FC<FeedbackModalProps> = ({ feedback, onClose }) => {
  const modalContent = (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-slate-800 border border-purple-500 rounded-lg shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 border-b border-slate-700 flex-shrink-0">
          <h2 className="text-xl font-bold text-white">Feedback Details</h2>
          <p className="text-sm text-slate-400">
            Submitted on {new Date(feedback.timestamp).toLocaleString()}
            {feedback.name && ` by ${feedback.name}`}
          </p>
        </header>
        <main className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-1">Rating</h3>
            <StarRatingDisplay rating={feedback.rating} />
          </div>

          {(feedback.showTitle || feedback.magicianName || feedback.location || feedback.performanceDate) && (
            <div className="pt-4 border-t border-slate-700/50">
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Show Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {feedback.showTitle && <p className="text-slate-300"><strong>Show:</strong> {feedback.showTitle}</p>}
                {feedback.magicianName && <p className="text-slate-300"><strong>Magician:</strong> {feedback.magicianName}</p>}
                {feedback.location && <p className="text-slate-300"><strong>Location:</strong> {feedback.location}</p>}
                {feedback.performanceDate && <p className="text-slate-300"><strong>Date:</strong> {new Date(feedback.performanceDate).toLocaleDateString()}</p>}
              </div>
            </div>
          )}
          
          {feedback.tags.length > 0 && (
            <div className="pt-4 border-t border-slate-700/50">
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Enjoyed Aspects</h3>
              <div className="flex flex-wrap gap-2">
                {feedback.tags.map(tag => (
                  <span key={tag} className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-500/20 text-purple-300">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {feedback.comment && (
            <div className="pt-4 border-t border-slate-700/50">
              <h3 className="text-sm font-semibold text-slate-400 mb-1">Comment</h3>
              <blockquote className="text-slate-200 italic border-l-4 border-slate-600 pl-4 py-2">
                "{feedback.comment}"
              </blockquote>
            </div>
          )}
        </main>
        <footer className="p-4 flex-shrink-0 bg-slate-800 border-t border-slate-700 text-right">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2 bg-slate-600/50 hover:bg-slate-700 rounded-md text-slate-300 font-bold transition-colors"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default FeedbackModal;