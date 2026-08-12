-- =========================================================================
-- BYO auth: profiles, segments and subscription tiers
--
-- One row per signed-up user, created automatically by a trigger on
-- auth.users. Holds the segment they self-identified as at signup
-- (homeowner / tradie / builder / developer) and the subscription tier
-- their account is actually entitled to.
--
-- The central security concern here is that `tier` and the usage counters
-- are money. A user must be able to edit their own name and company but
-- must NOT be able to promote themselves to enterprise or reset their own
-- plan-read counter. RLS alone cannot express "these columns are
-- read-only" — a row-level policy that allows UPDATE allows updating every
-- column in the row. So the tier columns are protected with column-level
-- GRANTs instead, which is the mechanism Postgres actually provides for
-- this.
--
-- IDEMPOTENT: this script is safe to run any number of times. It was
-- originally applied in pieces across sessions, so every statement now
-- either uses IF NOT EXISTS / OR REPLACE or is wrapped so re-running it
-- converges a partial database to the correct final shape instead of
-- erroring on "already exists".
-- =========================================================================

-- ---- enums --------------------------------------------------------------
-- Postgres has no "create type if not exists", so guard each with a DO
-- block that swallows the duplicate.
do $$ begin
  create type public.user_segment as enum ('homeowner', 'tradie', 'builder', 'developer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.subscription_tier as enum ('free', 'pro', 'business', 'enterprise');
exception when duplicate_object then null;
end $$;


-- ---- profiles -----------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users on delete cascade,
  email               text,
  full_name           text,
  company             text,
  segment             public.user_segment,

  tier                public.subscription_tier not null default 'free',
  tier_updated_at     timestamptz,
  stripe_customer_id  text unique,

  plan_reads_used     integer not null default 0,
  period_started_at   timestamptz not null default now(),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- If an earlier, partial run created the table with fewer columns, add any
-- that are missing. Each is a no-op when the column is already present.
alter table public.profiles add column if not exists email              text;
alter table public.profiles add column if not exists full_name          text;
alter table public.profiles add column if not exists company            text;
alter table public.profiles add column if not exists segment            public.user_segment;
alter table public.profiles add column if not exists tier               public.subscription_tier not null default 'free';
alter table public.profiles add column if not exists tier_updated_at    timestamptz;
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists plan_reads_used    integer not null default 0;
alter table public.profiles add column if not exists period_started_at  timestamptz not null default now();
alter table public.profiles add column if not exists created_at         timestamptz not null default now();
alter table public.profiles add column if not exists updated_at         timestamptz not null default now();

comment on column public.profiles.tier is
  'Subscription entitlement. Service-role writable only — never trust a client to set this.';

alter table public.profiles enable row level security;


-- ---- signup trigger -----------------------------------------------------
-- Creates the profile row the moment a user is created, so the app never
-- has to handle a signed-in user with no profile.
--
-- SECURITY DEFINER is required (the signing-up user has no rights on
-- public.profiles yet) and is safe here because the function takes no
-- caller-supplied arguments, writes only the new user's own id, and pins
-- search_path to '' so every reference must be schema-qualified.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, segment)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    -- Segment is a harmless self-declaration used for onboarding and
    -- analytics. It is read from user_metadata deliberately; it is NOT an
    -- authorization claim. Anything that grants access lives in `tier`,
    -- which the user cannot write.
    case
      when new.raw_user_meta_data ->> 'segment' in ('homeowner','tradie','builder','developer')
        then (new.raw_user_meta_data ->> 'segment')::public.user_segment
      else null
    end
  )
  -- If the profile already exists (e.g. the trigger fired before, or a row
  -- was backfilled by hand), don't blow up the signup.
  on conflict (id) do nothing;
  return new;
end;
$$;

-- SECURITY DEFINER functions in public are callable by anon/authenticated
-- by default. This one is only ever invoked by the trigger, so take that
-- ambient grant away.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Recreate the trigger cleanly whether or not it already existed.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---- keep updated_at honest --------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();


-- ---- RLS policies -------------------------------------------------------
-- Dropped-then-created so a re-run replaces them rather than erroring.

-- Read your own row. `TO authenticated` alone would be authentication
-- without authorization — every signed-in user would see every profile —
-- so it is paired with an ownership predicate.
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using ( (select auth.uid()) = id );

-- Update your own row. Both USING and WITH CHECK are required: USING picks
-- the rows you may touch, WITH CHECK stops you handing the row to someone
-- else by rewriting id.
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

-- No INSERT policy: rows come from the trigger only.
-- No DELETE policy: deleting a profile happens via deleting the auth user,
-- which cascades. Note that deleting a user does not invalidate their
-- existing access token — revoke sessions too if that matters.


-- ---- grants -------------------------------------------------------------
-- Tables created in SQL are not necessarily exposed to the Data API, so be
-- explicit. Note UPDATE is granted per column: the profile owner may edit
-- their own details, and cannot touch tier, usage counters or the Stripe id.
grant select on public.profiles to authenticated;
grant update (full_name, company, segment) on public.profiles to authenticated;

-- anon gets nothing: profiles are never public.
revoke all on public.profiles from anon;
