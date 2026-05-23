# Auth Confirmation Callback Fix

This patch hardens the Supabase email-confirmation flow so a confirmed user lands in the main app instead of returning to the login page.

## What changed

- `App.tsx`
  - Handles all common Supabase confirmation callback formats:
    - PKCE `code` callbacks
    - `token_hash` / `type=signup` callbacks
    - implicit hash callbacks with `access_token` and `refresh_token`
  - Sets the Supabase session when hash tokens are present.
  - Keeps the callback URL intact if no session is created, which makes expired/broken callback links easier to troubleshoot instead of silently cleaning the URL and returning to login.
  - Routes successful auth callbacks directly to the main Magician dashboard/home view.

- `components/Auth.tsx`
  - Adds a clearer friendly message for `Email not confirmed` login errors.

## Why this was needed

The app previously only exchanged a PKCE `code` or waited briefly for hash-token hydration. Depending on Supabase project settings or the active email template, the confirmation link can arrive as `token_hash`, hash tokens, or a PKCE code. If the app did not handle the exact format, the user could return to login and still see `Email not confirmed`.

## Post-deploy verification

1. Create a new test account.
2. Click the latest confirmation email link.
3. Confirm the URL enters `/app/?mode=auth-callback...` or `/app/#...` and lands on the main app dashboard.
4. Log out and log back in with the same account.
