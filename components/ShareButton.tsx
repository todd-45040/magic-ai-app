import React, { useState } from 'react';
import { ShareIcon, CheckIcon, CopyIcon } from './icons';

interface ShareButtonProps {
  title: string;
  text?: string;
  file?: File;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

const ShareButton: React.FC<ShareButtonProps> = (props) => {
  const { title, text, file, children, className, disabled, ...rest } = props;
  const [status, setStatus] = useState<'idle' | 'copied'>('idle');

  // Check if native sharing is available. For files, we need to be more specific.
  const canShareNatively = typeof navigator !== 'undefined' && 
                           !!navigator.share && 
                           (!file || (!!navigator.canShare && navigator.canShare({ files: [file] })));

  const handleShare = async () => {
    if (canShareNatively) {
      const shareData: ShareData = { title };
      if (text) shareData.text = text;
      if (file) {
        shareData.files = [file];
      }
      
      try {
        await navigator.share(shareData);
      } catch (error) {
        if ((error as DOMException).name !== 'AbortError') {
          console.error('Error sharing:', error);
        }
      }
    } else if (text) {
      // Fallback to copying text to the clipboard
      try {
        await navigator.clipboard.writeText(text);
        setStatus('copied');
        setTimeout(() => setStatus('idle'), 2000);
      } catch (error) {
        console.error('Error copying to clipboard:', error);
        alert('Could not copy text to clipboard.');
      }
    }
  };

  const isActuallyDisabled = disabled || (!canShareNatively && !text);
  const finalClassName = `${className ?? ''} ${isActuallyDisabled ? 'opacity-50 cursor-not-allowed' : ''}`.trim();
  const tooltip = isActuallyDisabled && !disabled ? "Sharing is not available for this content on your browser." : undefined;

  const getButtonContent = () => {
    if (status === 'copied') {
      return (
        <>
          <CheckIcon className="w-4 h-4 text-green-400" />
          <span>Copied!</span>
        </>
      );
    }

    if (!canShareNatively && text) {
      // In fallback mode, replace "Share" with "Copy" and ShareIcon with CopyIcon
      return React.Children.map(children, child => {
        // FIX: Add a generic type to `React.isValidElement` to correctly infer the type of `child.props`, allowing safe access to its properties.
        if (React.isValidElement<{ children?: React.ReactNode; className?: string; }>(child)) {
          // Replace icon
          if (child.type === ShareIcon) {
            return <CopyIcon className={child.props.className} />;
          }
          // Replace text inside a span
          if (child.type === 'span' && typeof child.props.children === 'string' && child.props.children.toLowerCase().includes('share')) {
            return React.cloneElement(child, {
              children: child.props.children.replace(/share/i, 'Copy')
            });
          }
        }
        return child;
      });
    }

    return children;
  };

  return (
    <button 
      onClick={handleShare} 
      disabled={isActuallyDisabled}
      title={tooltip}
      className={finalClassName}
      {...rest}
    >
      {getButtonContent()}
    </button>
  );
};

export default ShareButton;