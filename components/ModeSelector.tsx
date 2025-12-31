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
      <p className="text-slate-300 mb-12 text-lg text-center">Choose your experience</p>
      <div className="flex flex-col md:flex-row gap-8 w-full max-w-4xl px-4">
        <button
          onClick={() => onSelectMode('magician')}
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
    </div>
  );
};

export default ModeSelector;
