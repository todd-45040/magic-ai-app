import React, { useState, useMemo } from 'react';
import type { Show, Task, SavedIdea, MagicianView } from '../types';
import { SearchIcon, TagIcon, ChecklistIcon, BookmarkIcon, StageCurtainsIcon } from './icons';

interface GlobalSearchProps {
    shows: Show[];
    ideas: SavedIdea[];
    onNavigate: (view: MagicianView, id: string, secondaryId?: string) => void;
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ shows, ideas, onNavigate }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTag, setSelectedTag] = useState<string | null>(null);

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        shows.forEach(show => {
            show.tags?.forEach(tag => tags.add(tag));
            show.tasks.forEach(task => {
                task.tags?.forEach(tag => tags.add(tag));
            });
        });
        ideas.forEach(idea => {
            idea.tags?.forEach(tag => tags.add(tag));
        });
        return Array.from(tags).sort((a, b) => a.localeCompare(b));
    }, [shows, ideas]);
    
    const searchResults = useMemo(() => {
        const query = (selectedTag || searchTerm).toLowerCase();
        if (!query) return null;

        const results = {
            shows: [] as Show[],
            tasks: [] as (Task & { showId: string; showTitle: string })[],
            ideas: [] as SavedIdea[],
        };

        const hasTagOrText = (item: { title?: string, description?: string, notes?: string, content?: string, tags?: string[] }) => {
            const lowerTags = item.tags?.map(t => t.toLowerCase()) || [];
            if (selectedTag && lowerTags.includes(query)) return true;
            if (searchTerm) {
                if (lowerTags.some(t => t.includes(query))) return true;
                if (item.title?.toLowerCase().includes(query)) return true;
                if (item.description?.toLowerCase().includes(query)) return true;
                if (item.notes?.toLowerCase().includes(query)) return true;
                if (typeof item.content === 'string' && item.content.toLowerCase().includes(query)) return true;
            }
            return false;
        };

        // Search Shows
        results.shows = shows.filter(show => hasTagOrText(show));

        // Search Tasks
        shows.forEach(show => {
            const matchingTasks = show.tasks
                .filter(task => hasTagOrText(task))
                .map(task => ({ ...task, showId: show.id, showTitle: show.title }));
            results.tasks.push(...matchingTasks);
        });
        
        // Search Ideas
        results.ideas = ideas.filter(idea => hasTagOrText(idea));

        return results;

    }, [shows, ideas, searchTerm, selectedTag]);

    const handleTagClick = (tag: string) => {
        setSearchTerm('');
        setSelectedTag(prev => prev === tag ? null : tag);
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedTag(null);
        setSearchTerm(e.target.value);
    };
    
    const ResultRow: React.FC<{ icon: React.FC<any>, title: string, subtitle?: string, tags?: string[], onClick: () => void }> = ({ icon: Icon, title, subtitle, tags, onClick }) => (
        <button onClick={onClick} className="w-full text-left p-3 bg-slate-800 hover:bg-purple-900/50 border border-slate-700 rounded-lg transition-colors">
            <div className="flex items-start gap-3">
                <div className="mt-1"><Icon className="w-5 h-5 text-purple-400" /></div>
                <div>
                    <p className="font-semibold text-slate-200">{title}</p>
                    {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
                    {tags && tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {tags.map(tag => <span key={tag} className="px-1.5 py-0.5 text-xs font-semibold rounded bg-purple-500/20 text-purple-300">{tag}</span>)}
                        </div>
                    )}
                </div>
            </div>
        </button>
    );

    return (
        <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 animate-fade-in">
            <header className="mb-6">
                <div className="flex items-center gap-3">
                    <SearchIcon className="w-8 h-8 text-purple-400" />
                    <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Global Search</h2>
                </div>
                <p className="text-slate-400 mt-1">Find anything across your shows, tasks, and ideas.</p>
            </header>

            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg mb-6">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={handleSearchChange}
                    placeholder="Search by keyword..."
                    className="flex-1 w-full bg-transparent px-4 py-3 text-white placeholder-slate-400 focus:outline-none"
                />
            </div>

            {searchResults ? (
                <div>
                    <h3 className="text-lg font-bold text-slate-300 mb-3">
                        {selectedTag ? `Items tagged with "${selectedTag}"` : `Search Results for "${searchTerm}"`}
                    </h3>
                    <div className="space-y-3">
                        {searchResults.shows.length > 0 && (
                            <div>
                                <h4 className="font-semibold text-slate-400 mb-2">Shows ({searchResults.shows.length})</h4>
                                <div className="space-y-2">
                                    {searchResults.shows.map(show => <ResultRow key={show.id} icon={StageCurtainsIcon} title={show.title} subtitle={show.description} tags={show.tags} onClick={() => onNavigate('show-planner', show.id)} />)}
                                </div>
                            </div>
                        )}
                        {searchResults.tasks.length > 0 && (
                             <div>
                                <h4 className="font-semibold text-slate-400 mb-2">Tasks ({searchResults.tasks.length})</h4>
                                <div className="space-y-2">
                                    {searchResults.tasks.map(task => <ResultRow key={task.id} icon={ChecklistIcon} title={task.title} subtitle={`In Show: ${task.showTitle}`} tags={task.tags} onClick={() => onNavigate('show-planner', task.showId, task.id)} />)}
                                </div>
                            </div>
                        )}
                        {searchResults.ideas.length > 0 && (
                             <div>
                                <h4 className="font-semibold text-slate-400 mb-2">Saved Ideas ({searchResults.ideas.length})</h4>
                                <div className="space-y-2">
                                    {searchResults.ideas.map(idea => <ResultRow key={idea.id} icon={BookmarkIcon} title={idea.title || `Untitled ${idea.type} idea`} subtitle={idea.type === 'text' ? (idea.content.substring(0, 100) + '...') : `[${idea.type}]`} tags={idea.tags} onClick={() => onNavigate('saved-ideas', idea.id)} />)}
                                </div>
                            </div>
                        )}
                         {(searchResults.shows.length + searchResults.tasks.length + searchResults.ideas.length) === 0 && <p className="text-slate-500 text-center py-8">No results found.</p>}
                    </div>
                </div>
            ) : (
                <div>
                    <h3 className="text-lg font-bold text-slate-300 mb-3 flex items-center gap-2"><TagIcon className="w-5 h-5" /> All Tags</h3>
                    {allTags.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {allTags.map(tag => (
                                <button key={tag} onClick={() => handleTagClick(tag)} className={`px-3 py-1 text-sm font-semibold rounded-full capitalize transition-colors ${selectedTag === tag ? 'bg-purple-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
                                    {tag}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="text-slate-500 text-center py-8">No tags found. Add tags to your shows, tasks, and ideas to organize them here.</p>
                    )}
                </div>
            )}

        </div>
    );
};

export default GlobalSearch;