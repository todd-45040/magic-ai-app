# Membership Process Audit + Hardening Patch

## Scope audited

- IBM landing page → `/signup?source=ibm&trial=30&ibm_ring=...`
- SAM landing page → `/signup?source=sam&trial=30&sam_assembly=...`
- Signup metadata → Supabase Auth user metadata
- Auth callback → user profile creation/update
- Trial duration and partner attribution
- Entitlement resolution on frontend and server
- Stripe checkout/session creation
- Stripe webhook upgrade processing
- Admin/funnel telemetry visibility
- Security posture around client-side profile writes

## Confirmed continuity

1. IBM and SAM landing pages both collect email + required partner detail and redirect into the same signup flow with partner source and 30-day trial markers.
2. Signup stores partner metadata in Supabase Auth metadata.
3. Auth callback reads metadata and creates/updates the app user profile.
4. Partner users are normalized to `partner_source = ibm|sam`, `partner_campaign = ibm-30day|sam-30day`, and `requested_trial_days = 30`.
5. Active trials resolve to Professional access while `trial_end_date > now`.
6. Paid users resolve through active/trialing Stripe state as an access fallback.
7. Checkout requires Supabase auth and uses internal plan keys only.
8. Stripe webhook route is consolidated through the centralized processor.
9. Admin funnel endpoint supports true All Users plus IBM/SAM filtering.

## Important gap found

The biggest security gap was not the IBM/SAM landing flow. It was the profile-write model:

- The frontend creates/updates rows in `public.users`.
- The bootstrap RLS policy allows users to update their own profile row.
- If production RLS remains this permissive, a malicious browser client could attempt to write protected entitlement columns such as `membership`, `trial_end_date`, `is_admin`, or Stripe fields.

Even though normal users would not see this in the UI, it is a production hardening risk because browser code and Supabase requests can be tampered with.

## Patch included

Added:

`supabase/migrations/20260504_membership_security_hardening.sql`

This migration adds a database trigger that:

- Blocks client-side inserts from creating paid/admin memberships.
- Blocks client-side inserts from writing Stripe entitlement fields.
- Allows client-created trials only when the trial date is current and no more than 31 days away.
- Blocks client-side updates to protected entitlement columns.
- Allows service-role server code/webhooks to manage billing/admin fields normally.

Also updated the signup UI copy so IBM/SAM partner trial messaging matches the intended 60 live-rehearsal minutes per day instead of the older generic 10-minute wording.

## DB action required

Yes. Unlike the previous route/dashboard patches, this one includes a recommended DB migration.

Run this SQL in Supabase after deploying the code:

`supabase/migrations/20260504_membership_security_hardening.sql`

## Post-deploy test checklist

1. IBM landing page → signup → email confirmation → app access.
2. Confirm DB row has `partner_source = ibm`, `requested_trial_days = 30`, `membership = trial`, active `trial_end_date`.
3. SAM landing page → signup → email confirmation → app access.
4. Confirm DB row has `partner_source = sam`, `requested_trial_days = 30`, `membership = trial`, active `trial_end_date`.
5. Trial user can access Professional trial tools.
6. Trial user can checkout successfully.
7. Stripe webhook updates membership/Stripe fields successfully.
8. Attempting to manually change protected fields from the browser/anon client should fail.
9. Admin dashboard still shows All Users, IBM, and SAM funnel views.
