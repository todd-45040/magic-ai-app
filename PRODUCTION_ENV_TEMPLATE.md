# Magic AI Wizard — Production Environment Variable Template

**Goal:** clean, minimal, Stripe-ready production baseline on Vercel.

## ✅ Client-safe (Vite) variables
These values are safe to expose to the browser bundle.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional (non-secret config):
- `VITE_FOUNDER_WINDOW_START`
- `VITE_FOUNDER_WINDOW_END`
- `VITE_FOUNDER_WINDOW_GRACE_HOURS`

> Do **not** put any AI keys or Stripe secrets behind a `VITE_` prefix.

---

## 🔐 Server-only variables (Vercel /api/*)

### AI Providers
**Preferred (Google):**
- `GOOGLE_AI_API_KEY`  ✅ (primary production key)

Optional fallbacks (only if you actively use them):
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

Optional model overrides:
- `OPENAI_MODEL`
- `ANTHROPIC_MODEL`
- `GEMINI_MODEL`
- `GEMINI_FAST_MODEL`
- `GEMINI_VISION_MODEL`
- `GEMINI_TRANSCRIBE_MODEL`

Provider override (break-glass only):
- `AI_PROVIDER`  *(leave unset for DB-controlled switching)*

### Supabase (server)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Email / SMTP (if enabled)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`

### Stripe (prepared, not live yet)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_AMATEUR_MONTHLY`
- `STRIPE_PRICE_AMATEUR_YEARLY`
- `STRIPE_PRICE_AMATEUR_FOUNDER_MONTHLY`
- `STRIPE_PRICE_AMATEUR_FOUNDER_YEARLY`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_YEARLY`
- `STRIPE_PRICE_PRO_FOUNDER_MONTHLY`
- `STRIPE_PRICE_PRO_FOUNDER_YEARLY`
- `NEXT_PUBLIC_APP_URL` *(or `APP_URL` / `VITE_APP_URL`)*
- `STRIPE_API_VERSION` *(optional override; default in server helper)*

---

## ❌ Variables to remove (legacy / risky)
- Any `VITE_GEMINI_*` keys
- Any `VITE_OPENAI_*` keys
- Any `VITE_ANTHROPIC_*` keys
- `API_KEY` *(legacy Google key name — supported as fallback, but should be removed after reconciliation)*
- `GOOGLE_API_KEY` *(legacy — supported as fallback, but should be removed after reconciliation)*

## Stripe Webhook Rotation / Hygiene

Add these server-only variables before live billing:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_WEBHOOK_SECRET_NEXT` *(optional, for secret rotation)*
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_AMATEUR_MONTHLY`
- `STRIPE_PRICE_AMATEUR_YEARLY`
- `STRIPE_PRICE_AMATEUR_FOUNDER_MONTHLY`
- `STRIPE_PRICE_AMATEUR_FOUNDER_YEARLY`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_YEARLY`
- `STRIPE_PRICE_PRO_FOUNDER_MONTHLY`
- `STRIPE_PRICE_PRO_FOUNDER_YEARLY`
- `STRIPE_PRODUCT_AMATEUR`
- `STRIPE_PRODUCT_AMATEUR_FOUNDER`
- `STRIPE_PRODUCT_PRO`
- `STRIPE_PRODUCT_PRO_FOUNDER`
- `NEXT_PUBLIC_APP_URL` *(or `APP_URL` / `VITE_APP_URL` for billing return URLs)*
- `STRIPE_COUPON_FOUNDER_PRO`

Rules:
- Never expose secret-like Stripe values through `VITE_`, `NEXT_PUBLIC_`, `PUBLIC_`, or other client-prefixed env vars.
- Production must use `sk_live_...`; preview/dev should stay on `sk_test_...`.
- Keep `STRIPE_WEBHOOK_SECRET_NEXT` empty unless you are rotating webhook secrets.
- Do not enable any bypass env var that skips webhook signature verification in production.
