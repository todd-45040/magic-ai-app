import React from "react";

interface SaveActionBarProps {
  title?: string;
  subtitle?: string;

  primaryLabel?: string;
  onSave: () => void;
  saving?: boolean;
  saved?: boolean;
  disabled?: boolean;

  onAddToShow?: () => void;
  onConvertToTask?: () => void;

  onCopy?: () => void;
  onShare?: () => void;

  isStrong?: boolean;
  onToggleStrong?: () => void;
}

const SaveActionBar: React.FC<SaveActionBarProps> = ({
  title = "Next Step",
  subtitle = "Save it, then move it into a Show or Task.",
  primaryLabel = "Save to Idea Vault",
  onSave,
  saving = false,
  saved = false,
  disabled = false,
  onAddToShow,
  onConvertToTask,
  onCopy,
  onShare,
  isStrong = false,
  onToggleStrong,
}) => {
  return (
    <div className="maw-card p-4 mt-6 border border-zinc-700 rounded-xl bg-zinc-900/60 backdrop-blur">
      {/* Header */}
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-zinc-400">{subtitle}</p>
      </div>

      {/* Primary Action */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={onSave}
          disabled={disabled || saving}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            saved
              ? "bg-green-600 text-white"
              : "bg-purple-600 hover:bg-purple-700 text-white"
          } disabled:opacity-50`}
        >
          {saving ? "Saving..." : saved ? "Saved ✓" : primaryLabel}
        </button>

        {onAddToShow && (
          <button
            onClick={onAddToShow}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition"
          >
            Add to Show
          </button>
        )}

        {onConvertToTask && (
          <button
            onClick={onConvertToTask}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition"
          >
            Convert to Task
          </button>
        )}
      </div>

      {/* Utility Row */}
      {(onCopy || onShare || onToggleStrong) && (
        <div className="flex flex-wrap gap-2 border-t border-zinc-700 pt-3">
          {onToggleStrong && (
            <button
              onClick={onToggleStrong}
              className={`px-3 py-1 rounded-md text-sm transition ${
                isStrong
                  ? "bg-yellow-500 text-black"
                  : "bg-zinc-800 hover:bg-zinc-700 text-white"
              }`}
            >
              {isStrong ? "Strong ✓" : "Mark Strong"}
            </button>
          )}

          {onCopy && (
            <button
              onClick={onCopy}
              className="px-3 py-1 rounded-md text-sm bg-zinc-800 hover:bg-zinc-700 text-white transition"
            >
              Copy
            </button>
          )}

          {onShare && (
            <button
              onClick={onShare}
              className="px-3 py-1 rounded-md text-sm bg-zinc-800 hover:bg-zinc-700 text-white transition"
            >
              Share
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SaveActionBar;