SAM 30-Day Partner Trial Implementation

Implemented in code:
- public/sam/index.html landing page
- vercel.json rewrite for /sam
- components/Auth.tsx parses source=sam&trial=30 and stores sam_assembly metadata
- App.tsx hydrates SAM 30-day trials like IBM
- services/usersService.ts provisions 30-day trial_end_date for source=sam when requested_trial_days=30
- telemetry and partner trial messaging now accept SAM

Verify in Supabase after a test signup:
select email, signup_source, requested_trial_days, trial_end_date, membership
from public.users
order by created_at desc
limit 10;

Expected:
- signup_source = sam
- requested_trial_days = 30
- trial_end_date about 30 days ahead
