-- Magic AI Wizard membership/security hardening
-- Purpose: prevent authenticated browser clients from self-upgrading membership,
-- extending trials, setting admin flags, or writing Stripe entitlement fields.
-- Service-role API/webhook code is still allowed to manage these columns.

create or replace function public.maw_guard_user_entitlement_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), '');
  v_now_ms bigint := floor(extract(epoch from now()) * 1000);
  v_max_trial_ms bigint := floor(extract(epoch from (now() + interval '31 days')) * 1000);
begin
  -- Server-side service role is the only writer that may manage billing/admin fields freely.
  if v_role = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Browser-created profiles may only start as free/trial, never paid/admin.
    if coalesce(lower(new.membership), 'free') not in ('free', 'trial') then
      raise exception 'Client profile inserts may not create paid/admin memberships.';
    end if;

    if coalesce(new.is_admin, false) = true then
      raise exception 'Client profile inserts may not set admin access.';
    end if;

    -- Client-created trial dates must be reasonable: no more than 31 days out.
    if lower(coalesce(new.membership, 'free')) = 'trial' then
      if new.trial_end_date is null or new.trial_end_date < v_now_ms or new.trial_end_date > v_max_trial_ms then
        raise exception 'Client profile inserts may only create a current trial of 31 days or less.';
      end if;
    end if;

    -- Stripe entitlement fields must only be written by server webhook/billing code.
    if coalesce(new.stripe_customer_id, '') <> ''
      or coalesce(new.stripe_subscription_id, '') <> ''
      or coalesce(new.stripe_price_id, '') <> ''
      or coalesce(new.stripe_status, '') <> '' then
      raise exception 'Client profile inserts may not write Stripe entitlement fields.';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(new.membership, '') is distinct from coalesce(old.membership, '')
      or coalesce(new.is_admin, false) is distinct from coalesce(old.is_admin, false)
      or coalesce(new.trial_end_date, 0) is distinct from coalesce(old.trial_end_date, 0)
      or coalesce(new.stripe_customer_id, '') is distinct from coalesce(old.stripe_customer_id, '')
      or coalesce(new.stripe_subscription_id, '') is distinct from coalesce(old.stripe_subscription_id, '')
      or coalesce(new.stripe_price_id, '') is distinct from coalesce(old.stripe_price_id, '')
      or coalesce(new.stripe_status, '') is distinct from coalesce(old.stripe_status, '') then
      raise exception 'Only server-side billing/auth code may change entitlement columns.';
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists maw_guard_user_entitlement_columns_trg on public.users;
create trigger maw_guard_user_entitlement_columns_trg
before insert or update on public.users
for each row
execute function public.maw_guard_user_entitlement_columns();

comment on function public.maw_guard_user_entitlement_columns() is
'Prevents authenticated browser clients from self-upgrading or editing protected entitlement fields; service_role remains allowed.';
