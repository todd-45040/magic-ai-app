import React from 'react';
import { ADMIN_METRIC_DICTIONARY, CORE_ACTIVATION_TOOLS, ADMIN_WINDOWS } from '../utils/adminMetrics';

export default function AdminMetricDictionaryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-[min(900px,92vw)] max-h-[85vh] overflow-auto rounded-2xl border border-white/10 bg-[#0b0f19] shadow-2xl">
        <div className="p-5 border-b border-white/10 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Admin Metric Dictionary</div>
            <div className="text-sm opacity-75">Definitions + telemetry field standards used across Admin views.</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10"
          >
            Close
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="font-semibold">Time windows</div>
            <div className="opacity-80 mt-1">Admin pages use the same selectable windows:</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {ADMIN_WINDOWS.map((w) => (
                <span key={w.days} className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 font-mono text-xs">
                  {w.label}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="font-semibold">{ADMIN_METRIC_DICTIONARY.active_user.name}</div>
              <div className="opacity-80 mt-1">{ADMIN_METRIC_DICTIONARY.active_user.definition}</div>
              <div className="opacity-60 mt-2 text-xs">Source: {ADMIN_METRIC_DICTIONARY.active_user.source}</div>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="font-semibold">{ADMIN_METRIC_DICTIONARY.activated_user.name}</div>
              <div className="opacity-80 mt-1">{ADMIN_METRIC_DICTIONARY.activated_user.definition}</div>
              <div className="opacity-70 mt-2 text-xs">Core tools:</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {CORE_ACTIVATION_TOOLS.map((t) => (
                  <span key={t} className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 font-mono text-xs">
                    {t}
                  </span>
                ))}
              </div>
              <div className="opacity-60 mt-2 text-xs">Source: {ADMIN_METRIC_DICTIONARY.activated_user.source}</div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="font-semibold">{ADMIN_METRIC_DICTIONARY.outcomes.name}</div>
            <div className="opacity-80 mt-1">{ADMIN_METRIC_DICTIONARY.outcomes.definition}</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(ADMIN_METRIC_DICTIONARY.outcomes.mapping).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-black/30 border border-white/10 p-3">
                  <div className="font-mono text-xs opacity-80">{k}</div>
                  <div className="mt-1 font-mono text-[11px] opacity-70">{(v as any[]).join(', ')}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="font-semibold">{ADMIN_METRIC_DICTIONARY.telemetry_fields.name}</div>
            <div className="opacity-80 mt-1">Fields expected on ai_usage_events:</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {ADMIN_METRIC_DICTIONARY.telemetry_fields.fields.map((f) => (
                <span key={f} className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 font-mono text-xs">
                  {f}
                </span>
              ))}
            </div>
            <div className="opacity-70 mt-2 text-xs">{ADMIN_METRIC_DICTIONARY.telemetry_fields.note}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
