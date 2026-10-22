-- =========================================================================
-- Sellers agree to the Terms of Use (including the 1.5% platform fee)
--
-- A pro profile records which version of the Terms its owner accepted and
-- when. The time is the database's own clock (a trigger sets it), never a
-- value the app sends, and it can't be edited directly: it changes only when
-- the accepted version changes. A new pro profile can't be created without
-- accepting the Terms.
--
-- Needs 20261020100000_marketplace.sql first. IDEMPOTENT: safe to re-run.
-- =========================================================================

alter table public.pro_profiles add column if not exists terms_version text;
alter table public.pro_profiles add column if not exists terms_accepted_at timestamptz;
alter table public.pro_profiles drop constraint if exists pro_profiles_terms_version_check;
alter table public.pro_profiles add constraint pro_profiles_terms_version_check
  check (terms_version is null or terms_version ~ '^\d{4}-\d{2}-\d{2}$');

create or replace function public.pro_profiles_stamp_terms()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.terms_version is distinct from old.terms_version then
    new.terms_accepted_at := case when new.terms_version is null then null else now() end;
  else
    new.terms_accepted_at := old.terms_accepted_at;   -- only ever set by accepting a version
  end if;
  return new;
end;
$$;

revoke execute on function public.pro_profiles_stamp_terms() from public, anon, authenticated;

drop trigger if exists pro_profiles_stamp_terms on public.pro_profiles;
create trigger pro_profiles_stamp_terms
  before insert or update on public.pro_profiles
  for each row execute function public.pro_profiles_stamp_terms();

-- Users may set the version they accept; terms_accepted_at stays server-only.
grant insert (terms_version) on public.pro_profiles to authenticated;
grant update (terms_version) on public.pro_profiles to authenticated;

-- Creating a seller profile now requires accepting the Terms.
drop policy if exists "pro_profiles: pro plan creates own" on public.pro_profiles;
create policy "pro_profiles: pro plan creates own" on public.pro_profiles
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and terms_version is not null
    and (select public.my_effective_tier()) >= 'pro'
    -- builders list plans and modules, so a builder profile needs the Builder plan
    and (kind <> 'builder' or (select public.my_effective_tier()) >= 'business'));
