
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getSavedIdeas, deleteIdea, updateIdea } from '../services/ideasService';
import type { SavedIdea, Transcription, IdeaType, AiSparkAction } from '../types';
import { BookmarkIcon, TrashIcon, ShareIcon, MicrophoneIcon, PrintIcon, FileTextIcon, ImageIcon, PencilIcon, WandIcon } from './icons';
import ShareButton from './ShareButton';

interface SavedIdeasProps {
    initialIdeaId?: string;
    onAiSpark: (action: AiSparkAction) => void;
}

const IdeaShareWrapper: React.FC<{ idea: SavedIdea }> = ({ idea }) => {
    const [shareFile, setShareFile] = useState<File | null>(null);

    useEffect(() => {
        if (idea.type === 'image') {
            const convertDataUrlToFile = async () => {
                try {
                    const res = await fetch(idea.content);
                    const blob = await res.blob();
                    const file = new File([blob], `magic-idea.jpg`, { type: 'image/jpeg' });
                    setShareFile(file);
                } catch (e) {
                    console.error("Error creating file for sharing", e);
                }
            };
            convertDataUrlToFile();
        }
    }, [idea]);
    
    return (
        <ShareButton
            title={idea.type === 'image' ? 'Shared Magic Idea (Image)' : 'Shared Magic Idea'}
            text={idea.type === 'text' ? idea.content : "Check out this visual idea I saved!"}
            file={shareFile ?? undefined}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-800/70 hover:bg-purple-900/50 rounded-full text-slate-300 hover:text-purple-300 transition-colors backdrop-blur-sm"
            aria-label="Share idea"
        >
            <ShareIcon className="w-3 h-3" />
            <span>Share</span>
        </ShareButton>
    );
};

const SavedIdeas: React.FC<SavedIdeasProps> = ({ initialIdeaId, onAiSpark }) => {
    const [ideas, setIdeas] = useState<SavedIdea[]>([]);
    const [typeFilter, setTypeFilter] = useState<'all' | IdeaType>('all');
    const [tagFilter, setTagFilter] = useState<string | null>(null);
    const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const ideaRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());


    useEffect(() => {
        // FIX: getSavedIdeas() is async, resolve with .then()
        getSavedIdeas().then(setIdeas);
    }, []);
    
    useEffect(() => {
        if (initialIdeaId) {
            const itemRef = ideaRefs.current.get(initialIdeaId);
            if (itemRef) {
                itemRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Add a temporary highlight effect
                itemRef.classList.add('ring-2', 'ring-purple-500', 'transition-all', 'duration-1000');
                setTimeout(() => {
                    itemRef.classList.remove('ring-2', 'ring-purple-500');
                }, 2000);
            }
        }
    }, [initialIdeaId]);


    // FIX: handler should be async to await deleteIdea
    const handleDelete = async (id: string) => {
        const updatedIdeas = await deleteIdea(id);
        setIdeas(updatedIdeas);
    };

    const handlePrint = (idea: SavedIdea) => {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            let contentToPrint = '';
            let title = idea.title || `Saved ${idea.type} Idea`;

            if (idea.type === 'rehearsal') {
                try {
                    const parsed = JSON.parse(idea.content);
                    const transcript = parsed.transcript || (Array.isArray(parsed) ? parsed : []);
                    const notes = parsed.notes || null;
                    contentToPrint = formatRehearsalForSharing(idea, transcript, notes).replace(/\n/g, '<br/>');
                    title = idea.title || 'Untitled Rehearsal';
                } catch {
                    contentToPrint = idea.content.replace(/\n/g, '<br/>');
                }
            } else if (idea.type === 'image') {
                 contentToPrint = `<img src="${idea.content}" style="max-width: 100%;" />`;
            }
            else {
                contentToPrint = idea.content.replace(/\n/g, '<br/>');
            }
            
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Print: ${title}</title>
                        <style>
                            body { font-family: sans-serif; background: #1E293B; color: #E2E8F0; padding: 2rem; }
                            h1 { color: #C4B5FD; }
                            pre { white-space: pre-wrap; }
                        </style>
                    </head>
                    <body>
                        <h1>${title}</h1>
                        <p>Saved on: ${new Date(idea.timestamp).toLocaleString()}</p>
                        <hr>
                        <div>${contentToPrint}</div>
                    </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        }
    };

    const handleStartEditTags = (idea: SavedIdea) => {
        setEditingIdeaId(idea.id);
        setEditText((idea.tags || []).join(', '));
    };

    const handleCancelEdit = () => {
        setEditingIdeaId(null);
        setEditText('');
    };

    // FIX: handler should be async to await updateIdea
    const handleSaveTags = async (ideaId: string) => {
        const newTags = editText.split(',').map(t => t.trim()).filter(Boolean);
        const updatedIdeas = await updateIdea(ideaId, { tags: newTags });
        setIdeas(updatedIdeas);
        handleCancelEdit();
    };
    
    const allTags = useMemo(() => {
        const tagsSet = new Set<string>();
        ideas.forEach(idea => {
            (idea.tags || []).forEach(tag => tagsSet.add(tag));
        });
        return Array.from(tagsSet).sort();
    }, [ideas]);

    const filteredIdeas = useMemo(() => {
        return ideas.filter(idea => {
            const typeMatch = typeFilter === 'all' || idea.type === typeFilter;
            const tagMatch = !tagFilter || (idea.tags || []).includes(tagFilter);
            return typeMatch && tagMatch;
        });
    }, [ideas, typeFilter, tagFilter]);

    const formatRehearsalForSharing = (idea: SavedIdea, transcript: Transcription[], notes: string | null): string => {
        let shareText = `Rehearsal: ${idea.title || 'Untitled Session'}\n\n`;
        if (notes) {
            shareText += `Notes:\n${notes}\n\n`;
        }
        shareText += '--- Transcript ---\n\n';

        transcript.forEach(t => {
            const speaker = t.source === 'user' ? 'You' : 'AI Coach';
            shareText += `${speaker}: ${t.text}\n\n`;
        });
        return shareText.trim();
    };
    
    const TagEditor: React.FC<{ idea: SavedIdea }> = ({ idea }) => (
        <div className="mt-2 space-y-2">
            <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="card magic, opener, comedy..."
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-600 rounded-md text-sm text-white focus:outline-none focus:border-purple-500"
                autoFocus
            />
            <div className="flex items-center gap-2">
                <button
                    onClick={() => handleSaveTags(idea.id)}
                    className="flex-1 py-1 px-3 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-semibold text-xs transition-colors"
                >
                    Save Tags
                </button>
                <button
                    onClick={handleCancelEdit}
                    className="flex-1 py-1 px-3 bg-slate-600/50 hover:bg-slate-700 rounded-md text-slate-300 font-semibold text-xs transition-colors"
                >
                    Cancel
                </button>
            </div>
        </div>
    );

    const TagDisplay: React.FC<{ idea: SavedIdea }> = ({ idea }) => (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
            {(idea.tags || []).map(tag => (
                <button
                    key={tag}
                    onClick={() => setTagFilter(tag)}
                    className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-500/20 text-purple-300 hover:bg-purple-500/40"
                >
                    {tag}
                </button>
            ))}
            <button
                onClick={() => handleStartEditTags(idea)}
                className="p-1 text-slate-500 hover:text-purple-300 rounded-full transition-colors"
                title="Edit tags"
            >
                <PencilIcon className="w-4 h-4" />
            </button>
        </div>
    );

    const RehearsalIdeaCard: React.FC<{ idea: SavedIdea }> = ({ idea }) => {
        const { transcript, notes } = useMemo(() => {
            try {
                const parsedContent = JSON.parse(idea.content);
                if (Array.isArray(parsedContent)) {
                    return { transcript: parsedContent as Transcription[], notes: null };
                } else if (parsedContent && Array.isArray(parsedContent.transcript)) {
                    return { transcript: parsedContent.transcript as Transcription[], notes: parsedContent.notes || null };
                }
            } catch (e) {
                return { transcript: [{ source: 'user' as const, text: idea.content, isFinal: true }], notes: 'Note: This is a legacy rehearsal save.' };
            }
            return { transcript: [], notes: null };
        }, [idea.content]);

        const formattedShareText = useMemo(() => formatRehearsalForSharing(idea, transcript, notes), [idea, transcript, notes]);

        const handleRefineRehearsal = () => {
            let contentForAI = `Title: ${idea.title || 'Untitled Rehearsal'}\n\n`;
            if (notes) {
                contentForAI += `My Notes:\n${notes}\n\n`;
            }
            contentForAI += "--- Transcript ---\n\n";
            transcript.forEach(t => {
                const speaker = t.source === 'user' ? 'Magician' : 'AI Coach';
                contentForAI += `${speaker}: ${t.text}\n\n`;
            });
            onAiSpark({ type: 'refine-idea', payload: { content: contentForAI.trim() } });
        };

        return (
            <div
                ref={el => { ideaRefs.current.set(idea.id, el); }}
                className="group relative bg-gradient-to-br from-slate-800 to-slate-900/50 border-2 border-purple-700/50 rounded-lg p-4 flex flex-col justify-between col-span-1 md:col-span-2 lg:col-span-3">
                <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center flex-shrink-0"><MicrophoneIcon className="w-6 h-6 text-purple-400" /></div>
                            <div>
                                <h3 className="font-bold text-yellow-300 pr-20"">{idea.title || 'Untitled Rehearsal'}</h3>
                                <p className="text-xs text-slate-400">Saved on {new Date(idea.timestamp).toLocaleDateString()}</p>
                            </div>
                        </div>
                    </div>
                    {notes && (
                        <div className="mt-2 mb-3 p-3 bg-slate-900/50 rounded-md">
                            <p className="text-sm text-slate-300 font-semibold mb-1">Notes:</p>
                            <p className="text-sm text-slate-400 whitespace-pre-wrap">{notes}</p>
                        </div>
                    )}
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                        {transcript.map((t, i) => (
                            <div key={i} className={`flex text-sm ${t.source === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <p className={`max-w-[80%] px-3 py-1.5 rounded-lg ${t.source === 'user' ? 'bg-purple-900/70 text-purple-100' : 'bg-slate-700/70 text-slate-200'}`}>
                                    <strong>{t.source === 'user' ? 'You:' : 'Coach:'}</strong> {t.text}
                                </p>
                            </div>
                        ))}
                    </div>
                    {editingIdeaId === idea.id ? <TagEditor idea={idea} /> : <TagDisplay idea={idea} />}
                </div>
                <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={handleRefineRehearsal} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-purple-900/50 rounded-full text-slate-300 hover:text-purple-300 transition-colors" aria-label="Refine with AI"><WandIcon className="w-3 h-3" /><span>Refine</span></button>
                    <ShareButton title={`Rehearsal: ${idea.title || 'Untitled Session'}`} text={formattedShareText} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-purple-900/50 rounded-full text-slate-300 hover:text-purple-300 transition-colors" aria-label="Share"><ShareIcon className="w-3 h-3" /><span>Share</span></ShareButton>
                    <button onClick={() => handlePrint(idea)} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-purple-900/50 rounded-full text-slate-300 hover:text-purple-300 transition-colors" aria-label="Print"><PrintIcon className="w-3 h-3" /></button>
                    <button onClick={() => handleDelete(idea.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/50 rounded-full transition-colors" aria-label="Delete idea"><TrashIcon className="w-4 h-4" /></button>
                </div>
            </div>
        );
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
                <BookmarkIcon className="w-8 h-8 text-purple-400" />
                <h2 className="text-2xl font-bold text-yellow-400 font-cinzel">My Saved Ideas</h2>
            </div>

            {ideas.length > 0 && (
                <div className="space-y-4 mb-6">
                    <div className="flex flex-wrap items-center gap-2">
                         <span className="text-sm font-semibold text-slate-400 mr-2">Type:</span>
                        {(['all', 'text', 'image', 'rehearsal'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => { setTypeFilter(f); setTagFilter(null); }}
                                className={`px-3 py-1 text-sm font-semibold rounded-full capitalize transition-colors ${
                                    typeFilter === f ? 'bg-purple-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                                }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                     {allTags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-slate-700/50 pt-4">
                            <span className="text-sm font-semibold text-slate-400 mr-2">Tags:</span>
                            {allTags.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => setTagFilter(prev => prev === tag ? null : tag)}
                                    className={`px-3 py-1 text-sm font-semibold rounded-full capitalize transition-colors ${
                                        tagFilter === tag ? 'bg-purple-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                                    }`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            
            {filteredIdeas.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredIdeas.map(idea => {
                        if (idea.type === 'image') {
                            return (
                                <div key={idea.id} ref={el => { ideaRefs.current.set(idea.id, el); }} className="group relative bg-slate-900 border border-slate-700 rounded-lg flex flex-col justify-between overflow-hidden aspect-square transition-all hover:border-purple-500">
                                    <img src={idea.content} alt={idea.title || 'Saved visual idea'} className="w-full h-full object-cover absolute inset-0 transition-transform duration-300 group-hover:scale-105"/>
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                                    <div className="relative z-10 p-3 flex flex-col justify-end h-full">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 bg-slate-900/70 rounded-lg flex items-center justify-center flex-shrink-0 backdrop-blur-sm"><ImageIcon className="w-5 h-5 text-purple-400" /></div>
                                            <div>
                                                <h3 className="font-bold text-yellow-300 text-sm"">Image Idea</h3>
                                                <p className="text-xs text-slate-400">{new Date(idea.timestamp).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                         {editingIdeaId === idea.id ? <TagEditor idea={idea} /> : <TagDisplay idea={idea} />}
                                    </div>
                                    <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <IdeaShareWrapper idea={idea} />
                                        <button onClick={() => handleDelete(idea.id)} className="p-1.5 bg-black/50 text-slate-300 hover:text-red-400 hover:bg-red-900/50 rounded-full transition-colors backdrop-blur-sm" aria-label="Delete idea"><TrashIcon className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            );
                        }
                        if (idea.type === 'rehearsal') {
                            return <RehearsalIdeaCard key={idea.id} idea={idea} />;
                        }
                        return (
                             <div key={idea.id} ref={el => { ideaRefs.current.set(idea.id, el); }} className="group relative bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col justify-between transition-all hover:border-purple-500">
                                <div>
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center flex-shrink-0"><FileTextIcon className="w-6 h-6 text-purple-400" /></div>
                                            <div>
                                                <h3 className="font-bold text-yellow-300 pr-20">{idea.title || 'Saved Note'}</h3>
                                                <p className="text-xs text-slate-400">Saved on {new Date(idea.timestamp).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-300 whitespace-pre-wrap break-words line-clamp-6">{idea.content}</p>
                                </div>
                                {editingIdeaId === idea.id ? <TagEditor idea={idea} /> : <TagDisplay idea={idea} />}
                                 <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => onAiSpark({ type: 'refine-idea', payload: { content: idea.content } })} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-purple-900/50 rounded-full text-slate-300 hover:text-purple-300 transition-colors" aria-label="Refine with AI"><WandIcon className="w-3 h-3" /><span>Refine</span></button>
                                    <IdeaShareWrapper idea={idea} />
                                    <button onClick={() => handlePrint(idea)} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-purple-900/50 rounded-full text-slate-300 hover:text-purple-300 transition-colors" aria-label="Print"><PrintIcon className="w-3 h-3" /></button>
                                    <button onClick={() => handleDelete(idea.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/50 rounded-full transition-colors" aria-label="Delete idea"><TrashIcon className="w-4 h-4" /></button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-12">
                    <BookmarkIcon className="w-16 h-16 mx-auto text-slate-600 mb-4" />
                    <h3 className="text-lg font-bold text-slate-400">
                        {tagFilter ? `No ideas found with the tag "${tagFilter}"` : 'No Saved Ideas Yet'}
                    </h3>
                    <p className="text-slate-500">Your saved text snippets, images, and rehearsals will appear here.</p>
                    {tagFilter && <button onClick={() => setTagFilter(null)} className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-white font-semibold">Clear Tag Filter</button>}
                </div>
            )}
        </div>
    );
};

export default SavedIdeas;
