-- =========================================================================
-- Sellers agree to the Terms of Use (including the 1.5% platform fee)
--
-- A pro profile records which version of the Terms its owner accepted and
-- when. The time is the database's own clock (a trigger sets it), never a
-- value the app sends, and it can't be edited directly: it changes only when
-- the accepted version changes. A user can only move their version forward
-- (an old app build can't roll it back, and it can't be cleared). A new pro
-- profile can't be created without accepting the Terms.
--
-- Also: the green "Verified" tick means staff checked the ABN and licence
-- shown, so it comes off when the seller changes either of them.
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
  if (select auth.uid()) is not null then
    -- A user can only move their accepted version forward; clearing it or
    -- going back (a stale app build) keeps what they accepted before.
    if tg_op = 'UPDATE' and old.terms_version is not null
       and (new.terms_version is null or new.terms_version < old.terms_version) then
      new.terms_version := old.terms_version;
    end if;
    -- Versions are effective dates, published at most a few months ahead.
    if new.terms_version > to_char(current_date + 120, 'YYYY-MM-DD') then
      raise exception 'Unknown Terms version %', new.terms_version using errcode = '22023';
    end if;
  end if;
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

-- The tick is a statement about the ABN and licence staff checked: a seller
-- changing either takes it off until staff check again. Staff (no auth.uid,
-- e.g. the SQL editor or the service key) can still set both at once.
create or replace function public.pro_profiles_reset_verified()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and old.verified
     and (new.abn is distinct from old.abn
          or new.licence_number is distinct from old.licence_number
          or new.licence_state is distinct from old.licence_state) then
    new.verified := false;
  end if;
  return new;
end;
$$;

revoke execute on function public.pro_profiles_reset_verified() from public, anon, authenticated;

drop trigger if exists pro_profiles_reset_verified on public.pro_profiles;
create trigger pro_profiles_reset_verified
  before update on public.pro_profiles
  for each row execute function public.pro_profiles_reset_verified();

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
