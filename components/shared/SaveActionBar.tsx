import React from "react";

type ButtonTone = "primary" | "secondary" | "ghost";

type ActionButton = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  tone?: ButtonTone;
};

type UtilityButton = {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
};

export interface SaveActionBarProps {
  /** Header */
  title?: string;
  subtitle?: string;

  /** Primary save action (big purple CTA) */
  primary: ActionButton;

  /** Two “workflow” actions under the primary button */
  secondaryLeft?: ActionButton; // e.g., Add to Show Planner
  secondaryRight?: ActionButton; // e.g., Convert to Task

  /** Utility actions row (Strong / Copy / Share) */
  utilities?: UtilityButton[];

  /** Optional “Refine This Idea” section content (buttons, toggles, etc.) */
  refineTitle?: string;
  refineContent?: React.ReactNode;

  /** Visual state */
  saved?: boolean;
  savingLabel?: string; // default "Saving..."
  savedLabel?: string; // default "Saved"
  className?: string;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Button({
  label,
  onClick,
  disabled,
  loading,
  icon,
  tone = "secondary",
  fullWidth,
}: ActionButton & { fullWidth?: boolean }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus:outline-none focus:ring-2 focus:ring-purple-500/40 disabled:opacity-50 disabled:cursor-not-allowed";

  const tones: Record<ButtonTone, string> = {
    primary:
      "bg-purple-600 text-white hover:bg-purple-700 shadow-[0_10px_30px_-12px_rgba(168,85,247,0.9)]",
    secondary:
      "bg-zinc-900/40 text-zinc-100 border border-zinc-700/70 hover:bg-zinc-900/60",
    ghost:
      "bg-transparent text-zinc-100 hover:bg-zinc-900/40 border border-zinc-700/60",
  };

  const size = fullWidth ? "w-full px-4 py-3" : "px-4 py-2";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cx(base, tones[tone], size)}
    >
      {icon ? <span className="opacity-90">{icon}</span> : null}
      <span>{loading ? "Working..." : label}</span>
    </button>
  );
}

function UtilityPill({ label, onClick, active, disabled, icon }: UtilityButton) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition border",
        "bg-zinc-950/30 border-zinc-700/70 hover:bg-zinc-950/45",
        active ? "ring-1 ring-purple-500/40 border-purple-500/40" : "",
        disabled ? "opacity-50 cursor-not-allowed" : ""
      )}
    >
      {icon ? <span className="opacity-90">{icon}</span> : null}
      <span>{label}</span>
    </button>
  );
}

export default function SaveActionBar({
  title = "Next step:",
  subtitle = "Save it, then move it into a Show or Task.",
  primary,
  secondaryLeft,
  secondaryRight,
  utilities,
  refineTitle = "Refine This Idea",
  refineContent,
  saved = false,
  savingLabel = "Saving...",
  savedLabel = "Saved",
  className,
}: SaveActionBarProps) {
  const primaryLabel = primary.loading ? savingLabel : saved ? savedLabel : primary.label;

  return (
    <div
      className={cx(
        "rounded-2xl border border-zinc-700/60 bg-zinc-950/35 backdrop-blur",
        "shadow-[0_18px_70px_-40px_rgba(0,0,0,0.9)]",
        "p-5",
        className
      )}
    >
      {/* Header + utility corner */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-zinc-100">{title}</div>
          <div className="mt-1 text-sm text-zinc-400">{subtitle}</div>
        </div>

        {utilities && utilities.length > 0 ? (
          <div className="flex flex-col items-end gap-2">
            {/* keep the “corner” feel */}
            <div className="flex gap-2 flex-wrap justify-end max-w-[260px]">
              {utilities.map((u, idx) => (
                <UtilityPill key={idx} {...u} />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Primary CTA */}
      <div className="mt-4">
        <Button
          {...primary}
          label={primaryLabel}
          tone="primary"
          fullWidth
          disabled={primary.disabled}
          loading={primary.loading}
        />
      </div>

      {/* Secondary actions row */}
      {(secondaryLeft || secondaryRight) && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {secondaryLeft ? (
            <Button
              {...secondaryLeft}
              tone={secondaryLeft.tone ?? "secondary"}
              fullWidth
              disabled={secondaryLeft.disabled}
              loading={secondaryLeft.loading}
            />
          ) : (
            <div />
          )}

          {secondaryRight ? (
            <Button
              {...secondaryRight}
              tone={secondaryRight.tone ?? "secondary"}
              fullWidth
              disabled={secondaryRight.disabled}
              loading={secondaryRight.loading}
            />
          ) : (
            <div />
          )}
        </div>
      )}

      {/* Divider + Refine section */}
      {refineContent ? (
        <>
          <div className="mt-5 border-t border-zinc-700/50" />
          <div className="mt-4">
            <div className="text-sm font-semibold text-zinc-200">{refineTitle}</div>
            <div className="mt-3">{refineContent}</div>
          </div>
        </>
      ) : null}
    </div>
  );
}
