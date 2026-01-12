import React from "react";

interface Tool {
  id: string;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}

interface Section {
  title: string;
  tools: Tool[];
}

interface Props {
  sections: Section[];
}

const AssistantStudio: React.FC<Props> = ({ sections }) => {
  return (
    <div className="space-y-10">
      {sections.map((section) => (
        <div key={section.title}>
          <h2 className="mb-4 text-xl font-semibold text-white">
            {section.title}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {section.tools.map((tool) => (
              <div
                key={tool.id}
                onClick={tool.onClick}
                className="cursor-pointer rounded-xl border border-white/10 bg-white/5 p-5 transition hover:border-yellow-400/40 hover:bg-white/10"
              >
                {tool.badge && (
                  <span className="mb-2 inline-block rounded bg-purple-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {tool.badge}
                  </span>
                )}

                {/* TITLE — CHANGED TO GOLD */}
                <h3 className="mb-2 text-yellow-400 font-semibold">
                  {tool.title}
                </h3>

                <p className="text-sm text-white/70">
                  {tool.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AssistantStudio;
