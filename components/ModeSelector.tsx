import type { Mode } from '../types';
import { RabbitIcon, StageCurtainsIcon } from './icons';

interface ModeSelectorProps {
  onSelectMode: (mode: Mode) => void;
}

const ModeSelector: React.FC<ModeSelectorProps> = ({ onSelectMode }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="mb-4 flex flex-col items-center justify-center">
        <div className="relative mb-5 rounded-3xl border border-amber-300/20 bg-gradient-to-b from-purple-900/35 via-slate-950/20 to-transparent px-5 py-4 shadow-[0_0_40px_rgba(168,85,247,0.18)]">
          <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.18),transparent_55%)]" />
          <img
            src="/assets/logo/Wizard_Head.png"
            alt="Magic AI Wizard logo"
            className="relative z-10 w-52 sm:w-60 md:w-72 h-auto object-contain drop-shadow-[0_0_18px_rgba(251,191,36,0.28)]"
          />
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-2">
          <RabbitIcon className="w-12 h-12 md:w-16 md:h-16 text-purple-400" />
          <h1 className="font-cinzel text-4xl md:text-6xl font-bold text-amber-300 tracking-widest text-center">
            Magicians' AI Wizard
          </h1>
        </div>
      </div>
      <p className="text-slate-200 mb-2 text-lg text-center font-semibold">The operating system for professional magicians.</p>
      <p className="text-slate-300 mb-12 text-base text-center">Choose your experience</p>
      <div className="flex flex-col md:flex-row gap-8 w-full max-w-4xl px-4">
        <button
          // If the user isn't authenticated yet, route them into the Auth flow.
          // App.tsx will switch to Magician Mode after a successful login.
          onClick={() => onSelectMode('auth')}
          className="group w-full p-8 rounded-lg border border-slate-700 hover:bg-purple-900/50 hover:border-purple-500 transition-all duration-300 transform hover:scale-105 text-center"
        >
          <RabbitIcon className="w-16 h-16 mx-auto mb-4 text-purple-400 group-hover:text-purple-300 transition-colors" />
          <h2 className="font-cinzel text-3xl font-bold text-white mb-2">Magician Mode</h2>
          <p className="text-slate-400">Private access for magicians. Get help with scripting, patter, timing, and more.</p>
        </button>
        <button
          onClick={() => onSelectMode('audience')}
          className="group w-full p-8 rounded-lg border border-slate-700 hover:bg-sky-900/50 hover:border-sky-500 transition-all duration-300 transform hover:scale-105 text-center"
        >
          <StageCurtainsIcon className="w-16 h-16 mx-auto mb-4 text-sky-400 group-hover:text-sky-300 transition-colors" />
          <h2 className="font-cinzel text-3xl font-bold text-white mb-2">Audience Mode</h2>
          <p className="text-slate-400">Public access for guests. Explore magic trivia, show info, and generate fun banter.</p>
        </button>
      </div>

      <div className="mt-10 text-center">
        <a
          href="/NewAccount_Instructions.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-amber-400/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15 hover:border-amber-400/50 transition-colors text-sm"
        >
          <span className="font-semibold">New Account Setup Instructions</span>
          <span className="text-amber-200/70">PDF</span>
        </a>
        <p className="mt-2 text-xs text-slate-500">Step-by-step help for creating and confirming a new account.</p>
      </div>
    </div>
  );
};

export default ModeSelector;
