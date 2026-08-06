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
-- =========================================================================

-- ---- enums --------------------------------------------------------------
-- Segments mirror the four audiences in marketing/pricing.md.
create type public.user_segment as enum ('homeowner', 'tradie', 'builder', 'developer');

-- Tiers mirror the four plans. 'free' is the default for every new signup.
create type public.subscription_tier as enum ('free', 'pro', 'business', 'enterprise');


-- ---- profiles -----------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users on delete cascade,
  email               text,
  full_name           text,
  company             text,
  segment             public.user_segment,

  -- Billing state. Writable only by the service role (see grants below).
  tier                public.subscription_tier not null default 'free',
  tier_updated_at     timestamptz,
  stripe_customer_id  text unique,

  -- Metered usage. Plan reads are the real marginal cost of the product
  -- (a 2576px vision call), so they are counted per period rather than
  -- charging per seat. Reset by the billing job, never by the client.
  plan_reads_used     integer not null default 0,
  period_started_at   timestamptz not null default now(),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

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
create function public.handle_new_user()
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
  );
  return new;
end;
$$;

-- SECURITY DEFINER functions in public are callable by anon/authenticated
-- by default. This one is only ever invoked by the trigger, so take that
-- ambient grant away.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---- keep updated_at honest --------------------------------------------
create function public.touch_updated_at()
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

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();


-- ---- RLS policies -------------------------------------------------------
-- Read your own row. `TO authenticated` alone would be authentication
-- without authorization — every signed-in user would see every profile —
-- so it is paired with an ownership predicate.
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using ( (select auth.uid()) = id );

-- Update your own row. Both USING and WITH CHECK are required: USING picks
-- the rows you may touch, WITH CHECK stops you handing the row to someone
-- else by rewriting id.
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
