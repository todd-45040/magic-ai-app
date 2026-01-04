import React, { useState, useMemo } from 'react';
import { MAGIC_DICTIONARY_TERMS } from '../constants';
import { TutorIcon, SearchIcon, BookIcon, ChevronDownIcon } from './icons';

const MagicDictionary: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);

  const sortedTerms = useMemo(() => {
    return [...MAGIC_DICTIONARY_TERMS].sort((a, b) => a.term.localeCompare(b.term));
  }, []);

  const filteredTerms = useMemo(() => {
    const lowercasedTerm = searchTerm.toLowerCase();
    if (!lowercasedTerm) {
      return sortedTerms;
    }
    return sortedTerms.filter(
      item =>
        item.term.toLowerCase().includes(lowercasedTerm) ||
        item.definition.toLowerCase().includes(lowercasedTerm)
    );
  }, [searchTerm, sortedTerms]);

  const handleToggle = (term: string) => {
    setExpandedTerm(prev => (prev === term ? null : term));
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 animate-fade-in">
        <header className="mb-6">
            <div className="flex items-center gap-3">
                <TutorIcon className="w-8 h-8 text-purple-400" />
                <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Magic Dictionary</h2>
            </div>
            <p className="text-slate-400 mt-1">A curated glossary of professional magic terms and concepts.</p>
        </header>

        <div className="sticky top-0 bg-slate-900/80 backdrop-blur-sm py-3 z-10">
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg">
                <div className="pl-4 pr-2 text-slate-500">
                    <SearchIcon className="w-5 h-5" />
                </div>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search terms or definitions..."
                    className="flex-1 w-full bg-transparent pr-4 py-3 text-white placeholder-slate-400 focus:outline-none"
                />
            </div>
        </div>

        <div className="mt-4 space-y-2">
            {filteredTerms.length > 0 ? (
                filteredTerms.map(item => {
                    const isExpanded = expandedTerm === item.term;
                    return (
                        <div key={item.term} className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
                            <button
                                onClick={() => handleToggle(item.term)}
                                className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-700/50 transition-colors"
                                aria-expanded={isExpanded}
                            >
                                <span className="font-bold text-lg text-white">{item.term}</span>
                                <ChevronDownIcon className={`w-6 h-6 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                            <div className={`transition-all duration-300 ease-in-out grid ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                <div className="overflow-hidden">
                                    <div className="p-4 pt-0 space-y-4">
                                        <p className="text-slate-300">{item.definition}</p>
                                        {item.references.length > 0 && (
                                            <div>
                                                <h4 className="text-sm font-semibold text-slate-400 mb-2">Further Reading:</h4>
                                                <ul className="space-y-1">
                                                    {item.references.map(ref => (
                                                        <li key={ref.url}>
                                                            <a
                                                                href={ref.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 hover:underline"
                                                            >
                                                                <BookIcon className="w-4 h-4" />
                                                                <span>{ref.title}</span>
                                                            </a>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })
            ) : (
                <div className="text-center py-12 text-slate-500">
                    <p>No terms found for "{searchTerm}".</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default MagicDictionary;
