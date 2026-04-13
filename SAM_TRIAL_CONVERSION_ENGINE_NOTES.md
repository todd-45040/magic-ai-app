SAM Trial Conversion Engine

Implemented:
- Global in-app trial conversion banner for SAM/IBM partner trials
- Existing dashboard and billing trial prompts remain active
- CTA click logging wired into billing conversion telemetry
- Expired partner trial users can open upgrade modal directly from global banner

Primary files changed:
- components/TrialConversionBanner.tsx
- components/MagicianMode.tsx
- services/ibmConversionTracking.ts
