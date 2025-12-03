

import React, { useState } from 'react';
import { BackIcon } from './icons';

interface PassphraseInputProps {
  onSuccess: () => void;
  onBack: () => void;
}

// FIX: Define the missing `CORRECT_PASSPHRASE` constant locally to resolve an undefined variable error.
const CORRECT_PASSPHRASE = 'abracadabra';

const PassphraseInput: React.FC<PassphraseInputProps> = ({ onSuccess, onBack }) => {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passphrase === CORRECT_PASSPHRASE) {
      onSuccess();
    } else {
      setError('Incorrect passphrase. The magic word eludes you.');
      setPassphrase('');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full">
        <div className="w-full max-w-md border border-slate-700 rounded-lg p-8 shadow-2xl shadow-purple-900/20">
            <h2 className="font-cinzel text-3xl font-bold text-white mb-2 text-center">Enter Magician's Circle</h2>
            <p className="text-slate-400 mb-6 text-center">A secret word is required to proceed.</p>
            <form onSubmit={handleSubmit}>
                <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => {
                        setPassphrase(e.target.value);
                        setError('');
                    }}
                    placeholder="Speak, friend, and enter..."
                    className="w-full px-4 py-3 bg-slate-900 border-2 border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500 transition-colors"
                    autoFocus
                />
                {error && <p className="text-red-400 mt-2 text-sm">{error}</p>}
                <button
                    type="submit"
                    className="w-full mt-6 py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600"
                    disabled={!passphrase}
                >
                    Unlock Secrets
                </button>
                 <button
                    type="button"
                    onClick={onBack}
                    className="w-full mt-3 py-3 px-4 bg-slate-600/50 hover:bg-slate-700 rounded-md text-slate-300 font-bold transition-colors flex items-center justify-center gap-2"
                >
                    <BackIcon className="w-5 h-5" />
                    <span>Return</span>
                </button>
            </form>
        </div>
    </div>
  );
};

export default PassphraseInput;