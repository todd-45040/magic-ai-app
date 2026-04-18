# IBM Trial Lockdown and Test Plan

## What was patched

- Added pre-signup IBM campaign event capture endpoint: `/api/ibmCampaignEvent`
- Added Supabase migration: `supabase/ibm_campaign_tracking.sql`
- Hardened partner-trial provisioning so IBM/SAM 30-day trials anchor to account creation date instead of drifting to 14 days on later hydration.
- Preserved IBM ring / SAM assembly on the `users` row when those columns exist.
- Updated `/public/ibm/index.html` to:
  - validate email + IBM Ring with visible inline errors
  - track CTA clicks and form submits
  - redirect into signup with `auth=signup&source=ibm&trial=30`

## Production rollout order

1. Run `supabase/ibm_campaign_tracking.sql`
2. Deploy app code
3. Visit `/ibm`
4. Submit one controlled test lead
5. Verify campaign event rows are being created
6. Complete signup and verify `users.signup_source='ibm'` and `requested_trial_days=30`
7. Verify `trial_end_date` is about 30 days from account creation time

## Manual test accounts

Use 3 fresh emails:

- `ibm.test.1+lead@...` → clean success path
- `ibm.test.2+usage@...` → usage-limit / entitlement testing
- `normal.test.1@...` → non-IBM control

## End-to-end test checklist

### 1) Landing page tracking
- Open `/ibm`
- Click primary CTA
- Submit form with IBM ring
- Confirm `maw_campaign_events` includes:
  - `ibm_cta_click`
  - `ibm_trial_form_submit`
  - `ibm_signup_redirect`

### 2) Signup provisioning
- Complete signup from IBM redirect
- Confirm in `users`:
  - `signup_source = 'ibm'`
  - `requested_trial_days = 30`
  - `ibm_ring` populated
  - `membership = 'trial'`
  - `trial_end_date` roughly 30 days from created_at

### 3) App entitlement behavior
- Log in
- Confirm Professional-level tools are available during active trial
- Confirm trial copy references IBM Partner Access

### 4) Usage-limit behavior
- Use Live Rehearsal until warning state
- Confirm daily cap is 60 minutes and monthly cap is 300 minutes
- Confirm trial user remains blocked only at the intended limits

### 5) Expiration behavior
- Manually set `trial_end_date` into the past
- Log back in
- Confirm paid tools lock and upgrade prompts appear
- Confirm `trial_expired` appears only once in activity log

## Verification SQL

### Campaign events
```sql
select created_at, event_type, campaign, email_lower, ibm_ring, meta
from public.maw_campaign_events
where campaign = 'ibm-30day'
order by created_at desc
limit 50;
```

### IBM user provisioning
```sql
select email, created_at, signup_source, requested_trial_days, membership, trial_end_date, ibm_ring
from public.users
where lower(email) like 'ibm.test.%'
order by created_at desc;
```

### IBM activity funnel
```sql
select event_type, count(*)
from public.user_activity_log
where coalesce(metadata->>'campaign','') = 'ibm-30day'
group by event_type
order by count(*) desc;
```

### First-tool activation
```sql
select u.email, min(l.created_at) as first_tool_used_at
from public.users u
join public.user_activity_log l on l.user_id = u.id
where u.signup_source = 'ibm'
  and l.event_type = 'first_tool_used'
group by u.email
order by first_tool_used_at desc;
```
