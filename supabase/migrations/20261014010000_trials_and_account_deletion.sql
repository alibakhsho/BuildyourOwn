-- =========================================================================
-- Free trials (until Stripe billing is live) and self-service account
-- deletion.
--
-- 1) TRIALS. Signing up as a Tradie or Builder starts a 14-day trial of that
--    plan — no card. The trial lives in its own columns, separate from
--    `tier` (which billing will own), so the two can never fight:
--      effective plan = trial_tier while trial_ends_at > now(), if higher
--                       than tier; otherwise tier.
--    Nothing has to run when a trial ends: the app (lib/entitlements.js),
--    the AI routes and the project-cap trigger all read the end date.
--    One trial per account, ever (trial_ends_at is only set while null).
--    Neither column is in the users' UPDATE grant, so a trial can't be
--    started, extended or upgraded from the browser — only this trigger,
--    reacting to the (user-chosen, harmless) segment, sets them.
--
-- 2) ACCOUNT DELETION. Apple and Google require apps with sign-up to let
--    people delete their account. delete_my_account() removes the caller's
--    auth user; profiles and estimator_projects go with it (on delete
--    cascade). The client signs out straight after. If billing is added,
--    cancel any Stripe subscription BEFORE calling this.
-- =========================================================================

alter table public.profiles add column if not exists trial_tier    public.subscription_tier;
alter table public.profiles add column if not exists trial_ends_at timestamptz;

comment on column public.profiles.trial_tier    is 'Plan granted by the free trial. Trigger-written only; not client-writable.';
comment on column public.profiles.trial_ends_at is 'When the free trial ends. Set once, ever. Trigger-written only.';


-- ---- start a trial when someone identifies as a Tradie or Builder -------
-- A BEFORE trigger only edits NEW, so it needs no extra privileges: column
-- grants are checked against the columns in the user's own UPDATE
-- statement (segment), not against what the trigger fills in.
create or replace function public.start_trial_for_segment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.trial_ends_at is null
     and new.segment in ('tradie', 'builder')
     and (tg_op = 'INSERT' or old.segment is distinct from new.segment) then
    new.trial_tier    := case new.segment
                           when 'tradie' then 'pro'::public.subscription_tier
                           else 'business'::public.subscription_tier
                         end;
    new.trial_ends_at := now() + interval '14 days';
  end if;
  return new;
end;
$$;

revoke execute on function public.start_trial_for_segment() from public, anon, authenticated;

drop trigger if exists profiles_start_trial on public.profiles;
create trigger profiles_start_trial
  before insert or update of segment on public.profiles
  for each row execute function public.start_trial_for_segment();


-- ---- the 3-project cloud cap honours an active trial ---------------------
create or replace function public.enforce_project_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  n integer;
begin
  -- Reviving a tombstone counts as adding a project.
  if tg_op = 'UPDATE' and not (old.deleted and not new.deleted) then
    return new;
  end if;
  if new.deleted then
    return new;
  end if;
  select tier, trial_tier, trial_ends_at into p from public.profiles where id = new.user_id;
  if coalesce(p.tier, 'free') <> 'free'
     or (p.trial_ends_at > now() and coalesce(p.trial_tier, 'free') <> 'free') then
    return new;
  end if;
  select count(*) into n from public.estimator_projects
    where user_id = new.user_id and not deleted and id <> new.id;
  if n >= 3 then
    raise exception 'plan_limit: the Homeowner plan keeps 3 projects in the cloud'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_project_cap() from public, anon, authenticated;


-- ---- delete my account ---------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;   -- cascades to profiles, estimator_projects
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
