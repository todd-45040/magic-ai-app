import React from 'react';
import { ADMIN_WINDOWS, type AdminWindowDays } from '../utils/adminMetrics';

export default function AdminWindowSelector({
  value,
  onChange,
  className,
  label = 'Window',
}: {
  value: number;
  onChange: (days: AdminWindowDays) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div className={className ?? 'flex items-center gap-2'}>
      <label className="text-sm opacity-80">{label}</label>
      <select
        className="px-2 py-1 rounded border border-white/10 bg-black/20"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as AdminWindowDays)}
      >
        {ADMIN_WINDOWS.map((w) => (
          <option key={w.days} value={w.days}>
            {w.label}
          </option>
        ))}
      </select>
    </div>
  );
}
