import React, { useEffect } from "react";
import type { User } from "../types";
import { getTrialPromptCopy } from "../services/trialMessaging";
import { logTrialExpiredOnce, logTrialPromptViewed, logUpgradeClickFromTrialPrompt } from "../services/ibmConversionTracking";

interface TrialConversionBannerProps {
  user: User | null;
  location?: 'dashboard' | 'billing' | 'app';
  onPrimaryAction: () => void;
}

export default function TrialConversionBanner({ user, location = 'app', onPrimaryAction }: TrialConversionBannerProps) {
  const trialPrompt = getTrialPromptCopy(user);

  useEffect(() => {
    if (!trialPrompt || !user) return;
    void logTrialPromptViewed(user, location);
    if (trialPrompt.stage === 'expired') {
      void logTrialExpiredOnce(user, location);
    }
  }, [trialPrompt?.stage, user?.email, user?.trialEndDate, user?.signupSource, location]);

  if (!trialPrompt) return null;

  const expired = trialPrompt.stage === 'expired';
  return (
    <div className={`mx-3 mt-3 sm:mx-4 rounded-2xl border p-4 ${expired ? 'border-amber-400/35 bg-amber-500/10' : 'border-purple-400/30 bg-purple-500/10'}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{trialPrompt.title}</div>
          <div className="mt-1 text-sm text-white/75">{trialPrompt.message}</div>
        </div>
        <button
          onClick={() => {
            void logUpgradeClickFromTrialPrompt(user, location, {
              active_stage: trialPrompt.stage,
              cta_text: trialPrompt.cta,
            });
            onPrimaryAction();
          }}
          className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${expired ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
        >
          {trialPrompt.cta}
        </button>
      </div>
    </div>
  );
}
