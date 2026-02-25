import React from 'react';
import type { Mode } from '../types';
import { RabbitIcon, StageCurtainsIcon } from './icons';

interface ModeSelectorProps {
  onSelectMode: (mode: Mode) => void;
}

const ModeSelector: React.FC<ModeSelectorProps> = ({ onSelectMode }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-2">
        <RabbitIcon className="w-12 h-12 md:w-16 md:h-16 text-purple-400" />
        <h1 className="font-cinzel text-4xl md:text-6xl font-bold text-amber-300 tracking-widest text-center">
          Magicians' AI Wizard
        </h1>
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
        <button
          onClick={() => {
            try { localStorage.setItem('maw_demo_mode', 'true'); } catch {}
            const url = new URL(window.location.href);
            url.searchParams.set('demo', '1');
            window.location.href = url.toString();
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:text-white hover:border-amber-400/60 hover:bg-slate-800 transition-colors text-sm"
        >
          <span className="font-semibold">Demo Mode</span>
          <span className="text-slate-500">(for talks)</span>
        </button>
        <p className="mt-2 text-xs text-slate-500">Opens a presentation-ready demo with sample data. Changes are not saved.</p>
      </div>
    </div>
  );
};

export default ModeSelector;
