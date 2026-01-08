import React, { useState } from 'react';
import { ShareIcon, CheckIcon } from './icons';

interface ShareButtonProps {
  title: string;
  text?: string;
  file?: File;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * ShareButton
 * - Renders a single button (no extra "Copy" button) to avoid duplicate UI actions.
 * - Uses the Web Share API when available.
 * - Fallback: copies share text to clipboard and briefly shows a confirmation state.
 */
const ShareButton: React.FC<ShareButtonProps> = (props) => {
  const { title, text, file, children, className, disabled, ...rest } = props;
  const [status, setStatus] = useState<'idle' | 'done'>('idle');

  const doCopyFallback = async () => {
    const payload = [title, text].filter(Boolean).join('\n\n').trim();
    if (!payload) return;

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
    } else {
      const ta = document.createElement('textarea');
      ta.value = payload;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const handleShare = async () => {
    if (disabled) return;

    try {
      if (navigator.share) {
        // Most browsers ignore/limit files; include if provided.
        const data: any = { title };
        if (text) data.text = text;
        if (file) data.files = [file];
        await navigator.share(data);
      } else {
        // Fallback: copy (but still a single "Share" button in the UI)
        await doCopyFallback();
        setStatus('done');
        setTimeout(() => setStatus('idle'), 1500);
      }
    } catch (err) {
      // If user cancels share, it's not really an error. Quietly ignore.
      // If share fails, try copy fallback once.
      try {
        await doCopyFallback();
        setStatus('done');
        setTimeout(() => setStatus('idle'), 1500);
      } catch (e) {
        console.error('Share failed:', err);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={disabled}
      className={className}
      {...rest}
      title={status === 'done' ? 'Copied to clipboard' : 'Share'}
    >
      {status === 'done' ? (
        <span className="inline-flex items-center gap-2">
          <CheckIcon className="w-4 h-4 text-green-400" />
          <span>Copied</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-2">
          <ShareIcon className="w-4 h-4" />
          {children}
        </span>
      )}
    </button>
  );
};

export default ShareButton;
