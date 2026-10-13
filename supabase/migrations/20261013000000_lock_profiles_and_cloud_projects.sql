-- =========================================================================
-- 1) Lock down profiles.tier for real.
--
-- The earlier migration granted UPDATE on (full_name, company, segment) only,
-- but a column grant ADDS to whatever the role already has — and Supabase's
-- default privileges give `authenticated` full table-level INSERT/UPDATE on
-- every table in public. With those still in place, any signed-in user could
-- run   update profiles set tier = 'enterprise'   on their own row (the RLS
-- "update own" policy happily allows it). Revoke everything first, then
-- grant back exactly what the app needs.
--
-- Also drop policies left behind by an earlier build of this database:
-- "Users can insert own profile" let a client create its own profile row
-- (with any tier); rows must come from the on_auth_user_created trigger.
-- =========================================================================
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, company, segment) on public.profiles to authenticated;

drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can view own profile"   on public.profiles;
-- "profiles: read own" and "profiles: update own" (ownership-scoped) remain.


-- =========================================================================
-- 2) Cloud copies of estimator projects.
--
-- The app is local-first: a project lives in localStorage and works with no
-- account. When someone signs in, each project is mirrored here as one JSON
-- document so it follows them to other devices. The pre-existing
-- public.projects table (title/address/budget, uuid ids) is a different
-- shape from an estimator workspace and is left alone.
--
-- Keyed (user_id, id): ids are generated on the client, so scoping the key
-- by owner means one user can never collide with — or overwrite — another
-- user's row, whatever id they send.
-- =========================================================================
create table if not exists public.estimator_projects (
  user_id           uuid not null default auth.uid() references auth.users on delete cascade,
  id                text not null check (char_length(id) between 4 and 64),
  name              text not null default 'Untitled project' check (char_length(name) <= 200),
  build_mode        text check (build_mode in ('residential', 'highrise', 'materials')),
  region            text check (char_length(region) <= 8),
  data              jsonb not null default '{}'::jsonb
                    check (octet_length(data::text) < 2000000),   -- ~2 MB per project
  client_updated_at bigint not null default 0,                     -- ms epoch from the device that saved it
  deleted           boolean not null default false,                -- tombstone so deletes sync too
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists estimator_projects_user_updated
  on public.estimator_projects (user_id, client_updated_at desc);

alter table public.estimator_projects enable row level security;

drop policy if exists "estimator_projects: read own"   on public.estimator_projects;
drop policy if exists "estimator_projects: insert own" on public.estimator_projects;
drop policy if exists "estimator_projects: update own" on public.estimator_projects;
drop policy if exists "estimator_projects: delete own" on public.estimator_projects;

create policy "estimator_projects: read own" on public.estimator_projects
  for select to authenticated using ( (select auth.uid()) = user_id );
create policy "estimator_projects: insert own" on public.estimator_projects
  for insert to authenticated with check ( (select auth.uid()) = user_id );
create policy "estimator_projects: update own" on public.estimator_projects
  for update to authenticated
  using ( (select auth.uid()) = user_id ) with check ( (select auth.uid()) = user_id );
create policy "estimator_projects: delete own" on public.estimator_projects
  for delete to authenticated using ( (select auth.uid()) = user_id );

revoke all on public.estimator_projects from anon, authenticated;
grant select, insert, update, delete on public.estimator_projects to authenticated;

drop trigger if exists estimator_projects_touch_updated_at on public.estimator_projects;
create trigger estimator_projects_touch_updated_at
  before update on public.estimator_projects
  for each row execute function public.touch_updated_at();


-- =========================================================================
-- 3) Plan limit: the free (Homeowner) tier keeps 3 projects in the cloud.
--
-- Enforced here, not just in the UI, because the UI is the user's to edit.
-- Projects past the cap still work — they stay on that device only, and the
-- app labels them so. Tombstoned rows don't count.
-- =========================================================================
create or replace function public.enforce_project_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.subscription_tier;
  n integer;
begin
  -- Reviving a tombstone counts as adding a project.
  if tg_op = 'UPDATE' and not (old.deleted and not new.deleted) then
    return new;
  end if;
  if new.deleted then
    return new;
  end if;
  select tier into t from public.profiles where id = new.user_id;
  if coalesce(t, 'free') <> 'free' then
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

drop trigger if exists estimator_projects_cap on public.estimator_projects;
create trigger estimator_projects_cap
  before insert or update on public.estimator_projects
  for each row execute function public.enforce_project_cap();


-- Advisor fix: a function left by an earlier build of this database.
alter function public.update_updated_at() set search_path = '';
