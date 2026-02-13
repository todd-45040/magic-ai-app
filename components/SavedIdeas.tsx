
import React, { useState } from "react";

type Idea = {
  id: string;
  title: string;
  description: string;
  type: string;
  tags: string[];
};

const mockIdeas: Idea[] = Array.from({ length: 18 }).map((_, i) => ({
  id: String(i),
  title: "Idea Title " + (i + 1),
  description:
    "This is a longer preview description meant to demonstrate truncation behavior. It should clamp at three lines in compact mode but expand when requested by the user.",
  type: ["Note", "Blueprint", "Analysis"][i % 3],
  tags: ["Stage", "Comedy", "Kids"].slice(0, (i % 3) + 1)
}));

export default function SavedIdeas() {
  const [compact, setCompact] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="w-full p-4">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold">My Saved Ideas</h1>

        <div className="flex items-center gap-2 text-sm">
          <span>Cozy</span>
          <button
            onClick={() => setCompact(!compact)}
            className={`w-12 h-6 rounded-full transition ${
              compact ? "bg-indigo-600" : "bg-gray-400"
            } relative`}
          >
            <div
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition ${
                compact ? "left-7" : "left-1"
              }`}
            />
          </button>
          <span>Compact</span>
        </div>
      </div>

      {/* EMPTY STATE */}
      {mockIdeas.length === 0 && (
        <div className="text-center py-24 text-gray-500">
          <div className="text-3xl mb-2">✨</div>
          <div className="text-lg font-medium">No saved ideas yet</div>
          <div className="text-sm">
            Generate your first idea to begin building your library.
          </div>
        </div>
      )}

      {/* GRID */}
      <div
        className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${
          compact ? "gap-3" : "gap-6"
        }`}
      >
        {mockIdeas.map(idea => {
          const isExpanded = expanded[idea.id];

          return (
            <div
              key={idea.id}
              className={`group border rounded-xl shadow-sm bg-gradient-to-b from-white to-slate-50
              transition transform hover:scale-[1.01] hover:-translate-y-[2px] hover:shadow-md
              ${compact ? "p-3" : "p-5"}`}
            >

              {/* TITLE ROW */}
              <div className="flex justify-between items-start mb-1">
                <div className="font-semibold text-sm flex items-center gap-2">
                  <span>📄</span>
                  {idea.title}
                </div>

                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                  {idea.type}
                </span>
              </div>

              {/* TAGS */}
              <div className="flex flex-wrap gap-1 mb-1">
                {idea.tags.map(tag => (
                  <span
                    key={tag}
                    className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-[2px] rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* DESCRIPTION */}
              <p
                className={`text-sm text-gray-600 ${
                  compact && !isExpanded ? "line-clamp-3" : ""
                }`}
              >
                {idea.description}
              </p>

              {/* EXPAND */}
              {compact && (
                <button
                  onClick={() => toggleExpand(idea.id)}
                  className="text-xs text-indigo-600 mt-1"
                >
                  {isExpanded ? "show less" : "... more"}
                </button>
              )}

              {/* ACTIONS */}
              <div className="flex gap-3 mt-2 text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition">
                <button>Open</button>
                <button>Duplicate</button>
                <button>Send</button>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
