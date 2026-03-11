import React, { useMemo, useState } from 'react';
import { publications } from '../constants';
import { BookIcon, BookmarkIcon, SearchIcon } from './icons';

const coverTones = [
  'from-purple-950/80 via-slate-900 to-indigo-950/80',
  'from-slate-900 via-emerald-950/50 to-slate-950',
  'from-amber-950/70 via-slate-900 to-slate-950',
  'from-fuchsia-950/60 via-slate-900 to-slate-950',
  'from-blue-950/60 via-slate-900 to-slate-950',
  'from-rose-950/50 via-slate-900 to-slate-950',
];

const getInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const MagicPublications: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('All');
  const [savedOnly, setSavedOnly] = useState(false);

  const publicationTypes = useMemo(
    () => ['All', ...Array.from(new Set(publications.map((pub) => pub.type ?? 'Publication')))],
    []
  );

  const filteredPublications = useMemo(() => {
    return publications.filter((pub) => {
      const searchTarget = `${pub.name} ${pub.description} ${pub.type ?? ''}`.toLowerCase();
      const matchesSearch = searchTarget.includes(searchQuery.trim().toLowerCase());
      const matchesType = selectedType === 'All' || (pub.type ?? 'Publication') === selectedType;
      const matchesSaved = !savedOnly;
      return matchesSearch && matchesType && matchesSaved;
    });
  }, [searchQuery, selectedType, savedOnly]);

  const featuredPublication = filteredPublications[0] ?? publications[0];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-5">
      <div className="animate-fade-in space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Magic Publications</h2>
          <p className="text-slate-400 mt-2">
            Essential reading for the modern magician. Explore magazines, journals, archives, and digital reference sources.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
          <aside className="bg-slate-900/45 border border-slate-700 rounded-xl p-4 space-y-4 xl:sticky xl:top-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">Library Filters</h3>
              <p className="text-xs text-slate-500 mt-1">
                Narrow the shelf and find the right publication faster.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Search</label>
              <div className="relative">
                <SearchIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search publications..."
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950/70 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Publication Type</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950/70 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
              >
                {publicationTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={savedOnly}
                  onChange={(e) => setSavedOnly(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500"
                />
                <div>
                  <div className="text-sm font-medium text-slate-200">Saved only</div>
                  <div className="text-xs text-slate-500">Placeholder for future saved-publication support.</div>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Total</div>
                <div className="mt-1 text-xl font-semibold text-slate-200">{publications.length}</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Showing</div>
                <div className="mt-1 text-xl font-semibold text-slate-200">{filteredPublications.length}</div>
              </div>
            </div>
          </aside>

          <section className="space-y-5 min-w-0">
            {featuredPublication ? (
              <div className="bg-gradient-to-br from-slate-900/90 via-slate-900/75 to-indigo-950/60 border border-slate-700 rounded-xl p-5 shadow-[0_10px_35px_rgba(0,0,0,0.22)]">
                <div className="flex flex-col lg:flex-row lg:items-start gap-5">
                  <div className={`w-[84px] h-[112px] shrink-0 rounded-xl border border-yellow-500/20 bg-gradient-to-br ${coverTones[0]} shadow-[0_8px_18px_rgba(0,0,0,0.25)] flex items-center justify-center`}>
                    <div className="text-center px-2">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-yellow-100/70">Featured</div>
                      <div className="mt-2 text-lg font-bold text-yellow-100">{getInitials(featuredPublication.name)}</div>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-purple-500/25 bg-purple-500/10 text-purple-100/85">
                        Featured Publication
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-yellow-500/25 bg-yellow-500/10 text-yellow-100/80">
                        {featuredPublication.type ?? 'Publication'}
                      </span>
                    </div>

                    <h3 className="text-xl md:text-2xl font-bold text-slate-100">{featuredPublication.name}</h3>

                    <p className="text-slate-300/90 mt-2 max-w-3xl">{featuredPublication.description}</p>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {featuredPublication.url ? (
                        <a
                          href={featuredPublication.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-300/90 text-slate-950 font-semibold text-sm hover:bg-yellow-200 transition-colors"
                        >
                          Visit featured site <span aria-hidden="true">↗</span>
                        </a>
                      ) : null}

                      <button
                        type="button"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-600 bg-slate-900/40 text-slate-200 text-sm hover:bg-slate-800/70 transition-colors"
                      >
                        <BookmarkIcon className="w-4 h-4" />
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-200">Publication Shelf</h3>
                <p className="text-sm text-slate-500">
                  A curated reading library for magazines, journals, archives, and video publications.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-slate-700 bg-slate-900/40 text-slate-300 w-fit">
                <BookIcon className="w-4 h-4 text-purple-300" />
                {filteredPublications.length} publication{filteredPublications.length === 1 ? '' : 's'}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPublications.map((pub, index) => (
                <div
                  key={pub.name}
                  className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 transition-all duration-200 hover:border-purple-500 hover:bg-slate-800 shadow-[0_6px_20px_rgba(0,0,0,0.14)]"
                >
                  <div className="flex gap-4">
                    <div className={`w-[72px] h-[96px] shrink-0 rounded-lg border border-yellow-500/15 bg-gradient-to-br ${coverTones[index % coverTones.length]} flex items-center justify-center shadow-[0_6px_16px_rgba(0,0,0,0.22)]`}>
                      <div className="text-center px-2">
                        <div className="text-[10px] uppercase tracking-[0.20em] text-yellow-100/65">Issue</div>
                        <div className="mt-2 text-lg font-bold text-yellow-100/90">{getInitials(pub.name)}</div>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-lg text-yellow-200">{pub.name}</h3>
                          <p className="text-slate-400 text-sm mt-1 line-clamp-3">{pub.description}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-yellow-500/25 bg-yellow-500/10 text-yellow-100/80">
                          {pub.type ?? 'Publication'}
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-900/40 hover:bg-slate-900/70 text-slate-200 transition"
                        >
                          <BookmarkIcon className="w-4 h-4" />
                          Save
                        </button>

                        {pub.url ? (
                          <a
                            href={pub.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-yellow-500/25 bg-slate-900/40 hover:bg-slate-900/70 text-yellow-200 hover:text-yellow-100 transition"
                            title="Open in a new tab"
                          >
                            Visit site <span aria-hidden="true">↗</span>
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900/20 text-slate-500 cursor-not-allowed">
                            Unavailable
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredPublications.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/35 p-8 text-center">
                <BookIcon className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h4 className="text-slate-200 font-semibold">No publications match your filters</h4>
                <p className="text-slate-500 text-sm mt-2">
                  Try a broader search or switch the publication type back to All.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
};

export default MagicPublications;
