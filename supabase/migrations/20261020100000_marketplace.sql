-- =========================================================================
-- BYO marketplace: pro profiles, portfolios, listings, enquiries, media
--
-- BuildYourOwn is the platform, not a party to any build. Builders and
-- tradies publish a profile and a portfolio of their own finished jobs;
-- builders list plans and prefab modules and choose how they sell them
-- (src/logic/marketplace.js SALE_MODES). Licensing, permits and the build
-- itself are the builder's responsibility. Payments are not taken here yet:
-- buyers send an enquiry, and fees are discussed on contract.
--
-- Who may do what:
--   anyone (incl. signed out)  browse published profiles, portfolios, live listings
--   Tradie / Builder plan      create a pro profile and portfolio
--   Builder plan               create listings (plans, prefab modules)
--   any signed-in user         send an enquiry (rate-limited)
--   seller                     read and triage enquiries sent to them
-- A trial counts as the plan it trials, same as everywhere else.
--
-- Trust columns (`verified`, `suspended`, `hidden`, `view_count`) are not
-- writable by users: column GRANTs exclude them, because a row-level UPDATE
-- policy cannot protect individual columns. Staff set them with the service
-- role (Supabase dashboard). `hidden` takes one listing down; `suspended`
-- takes a whole seller down (profile, portfolio, listings) and stops them
-- deleting and re-creating their profile to get round it.
--
-- Plans and lapses: going live counts as listing, so publishing needs the
-- Builder plan at the moment of publishing (same rule as enforce_project_cap:
-- reviving counts as adding). A listing already live when a plan lapses stays
-- up and editable; the seller can always unpublish, archive or delete.
--
-- IDEMPOTENT: safe to re-run; every object is created if-not-exists or
-- replaced, and policies are dropped before being recreated.
-- =========================================================================


-- ---- the plan in effect for the caller ----------------------------------
-- Mirrors entitlementsFor() in src/lib/entitlements.js: an active trial
-- counts when it is better than the paid tier. Takes no argument so it can
-- only ever reveal the caller's own plan.
create or replace function public.my_effective_tier()
returns public.subscription_tier
language sql
stable
security invoker   -- reads the caller's own profile row, which RLS already allows
set search_path = ''
as $$
  select case
           when p.trial_tier is not null and p.trial_ends_at > now() and p.trial_tier > p.tier
             then p.trial_tier
           else p.tier
         end
    from public.profiles p
   where p.id = (select auth.uid());
$$;

revoke execute on function public.my_effective_tier() from public, anon;
grant execute on function public.my_effective_tier() to authenticated;


-- ---- pro profiles -------------------------------------------------------
create table if not exists public.pro_profiles (
  user_id        uuid primary key default auth.uid() references auth.users on delete cascade,
  kind           text not null check (kind in ('builder', 'tradie', 'designer')),
  display_name   text not null check (char_length(display_name) between 2 and 120),
  tagline        text check (char_length(tagline) <= 160),
  bio            text check (char_length(bio) <= 4000),
  abn            text check (abn ~ '^\d{11}$'),
  licence_number text check (char_length(licence_number) <= 40),
  licence_state  text check (licence_state in ('QLD','NSW','VIC','WA','SA','TAS','ACT','NT')),
  trades         text[] not null default '{}' check (cardinality(trades) <= 20),
  regions        text[] not null default '{}'
                 check (regions <@ array['QLD','NSW','VIC','WA','SA','TAS','ACT','NT']::text[]),
  logo_path      text check (char_length(logo_path) <= 300),
  cover_path     text check (char_length(cover_path) <= 300),
  published      boolean not null default false,
  verified       boolean not null default false,   -- staff only
  suspended      boolean not null default false,   -- staff only: takes the whole seller down
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint pro_profiles_trades_size check (octet_length(array_to_string(trades, '')) <= 2000)
);

create index if not exists pro_profiles_published_kind on public.pro_profiles (kind) where published;
create index if not exists pro_profiles_regions on public.pro_profiles using gin (regions);

alter table public.pro_profiles enable row level security;

drop policy if exists "pro_profiles: public reads published" on public.pro_profiles;
drop policy if exists "pro_profiles: owner reads own"        on public.pro_profiles;
drop policy if exists "pro_profiles: read"                   on public.pro_profiles;
drop policy if exists "pro_profiles: pro plan creates own"   on public.pro_profiles;
drop policy if exists "pro_profiles: owner updates own"      on public.pro_profiles;
drop policy if exists "pro_profiles: owner deletes own"      on public.pro_profiles;

-- One SELECT policy (published and not suspended, or your own) rather than
-- two permissive ones, which Postgres would evaluate both of on every row.
create policy "pro_profiles: read" on public.pro_profiles
  for select to anon, authenticated
  using ((published and not suspended) or (select auth.uid()) = user_id);
create policy "pro_profiles: pro plan creates own" on public.pro_profiles
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (select public.my_effective_tier()) >= 'pro'
    -- builders list plans and modules, so a builder profile needs the Builder plan
    and (kind <> 'builder' or (select public.my_effective_tier()) >= 'business'));
create policy "pro_profiles: owner updates own" on public.pro_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- A suspended seller can't delete and re-create their way out of it.
create policy "pro_profiles: owner deletes own" on public.pro_profiles
  for delete to authenticated using ((select auth.uid()) = user_id and not suspended);

revoke all on public.pro_profiles from anon, authenticated;
grant select on public.pro_profiles to anon, authenticated;
grant insert (user_id, kind, display_name, tagline, bio, abn, licence_number, licence_state,
              trades, regions, logo_path, cover_path, published)
  on public.pro_profiles to authenticated;
-- `kind` may change (a Tradie who upgrades becomes a Builder without losing
-- their portfolio or inbox), but only to a kind the plan allows: see
-- guard_pro_kind() below.
grant update (kind, display_name, tagline, bio, abn, licence_number, licence_state,
              trades, regions, logo_path, cover_path, published)
  on public.pro_profiles to authenticated;
grant delete on public.pro_profiles to authenticated;

drop trigger if exists pro_profiles_touch_updated_at on public.pro_profiles;
create trigger pro_profiles_touch_updated_at
  before update on public.pro_profiles
  for each row execute function public.touch_updated_at();

create or replace function public.guard_pro_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Same rule as insert: builder needs the Builder plan, the rest Tradie.
  -- Staff (service role, no auth.uid()) may relabel freely.
  if new.kind is distinct from old.kind and (select auth.uid()) is not null then
    if coalesce(public.my_effective_tier() < case when new.kind = 'builder'
                  then 'business'::public.subscription_tier else 'pro'::public.subscription_tier end, true) then
      raise exception 'plan_limit: a % profile needs the % plan', new.kind,
        case when new.kind = 'builder' then 'Builder' else 'Tradie' end
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_pro_kind() from public, anon, authenticated;

drop trigger if exists pro_profiles_guard_kind on public.pro_profiles;
create trigger pro_profiles_guard_kind
  before update of kind on public.pro_profiles
  for each row execute function public.guard_pro_kind();


-- ---- portfolio: finished jobs a pro shows off ---------------------------
create table if not exists public.portfolio_items (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references public.pro_profiles (user_id) on delete cascade,
  title        text not null check (char_length(title) between 2 and 160),
  description  text check (char_length(description) <= 4000),
  category     text check (char_length(category) <= 60),
  suburb       text check (char_length(suburb) <= 80),
  state        text check (state in ('QLD','NSW','VIC','WA','SA','TAS','ACT','NT')),
  completed_on date,
  media_paths  text[] not null default '{}'
               check (cardinality(media_paths) <= 20 and octet_length(array_to_string(media_paths, '')) <= 6000),
  published    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists portfolio_items_owner on public.portfolio_items (owner_id, completed_on desc nulls last);

alter table public.portfolio_items enable row level security;

drop policy if exists "portfolio: public reads published" on public.portfolio_items;
drop policy if exists "portfolio: owner reads own"        on public.portfolio_items;
drop policy if exists "portfolio: read"                   on public.portfolio_items;
drop policy if exists "portfolio: owner inserts"          on public.portfolio_items;
drop policy if exists "portfolio: owner updates"          on public.portfolio_items;
drop policy if exists "portfolio: owner deletes"          on public.portfolio_items;

create policy "portfolio: read" on public.portfolio_items
  for select to anon, authenticated using (
    (select auth.uid()) = owner_id
    or (published and exists (
      select 1 from public.pro_profiles p where p.user_id = owner_id and p.published and not p.suspended)));
-- The FK to pro_profiles means only someone with a pro profile can add
-- items; the plan check stops a lapsed trial adding more.
create policy "portfolio: owner inserts" on public.portfolio_items
  for insert to authenticated with check (
    (select auth.uid()) = owner_id and (select public.my_effective_tier()) >= 'pro');
create policy "portfolio: owner updates" on public.portfolio_items
  for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "portfolio: owner deletes" on public.portfolio_items
  for delete to authenticated using ((select auth.uid()) = owner_id);

revoke all on public.portfolio_items from anon, authenticated;
grant select on public.portfolio_items to anon, authenticated;
grant insert (owner_id, title, description, category, suburb, state, completed_on, media_paths, published)
  on public.portfolio_items to authenticated;
grant update (title, description, category, suburb, state, completed_on, media_paths, published)
  on public.portfolio_items to authenticated;
grant delete on public.portfolio_items to authenticated;

drop trigger if exists portfolio_items_touch_updated_at on public.portfolio_items;
create trigger portfolio_items_touch_updated_at
  before update on public.portfolio_items
  for each row execute function public.touch_updated_at();


-- ---- listings: plans and prefab modules ---------------------------------
create table if not exists public.listings (
  id              uuid primary key default gen_random_uuid(),
  seller_id       uuid not null default auth.uid() references public.pro_profiles (user_id) on delete cascade,
  kind            text not null check (kind in ('plan', 'module')),
  sale_mode       text not null check (sale_mode in ('plan_purchase', 'plan_licence', 'build_only', 'prefab')),
  title           text not null check (char_length(title) between 2 and 160),
  summary         text check (char_length(summary) <= 300),
  description     text check (char_length(description) <= 8000),
  price_cents     bigint check (price_cents > 0 and price_cents < 100000000000),  -- indicative, ex GST; null = price on enquiry
  bedrooms        smallint check (bedrooms between 0 and 20),
  bathrooms       smallint check (bathrooms between 0 and 20),
  storeys         smallint check (storeys between 1 and 6),
  floor_area_m2   numeric(7, 1) check (floor_area_m2 > 0 and floor_area_m2 < 100000),
  inclusions      text[] not null default '{}'
                  check (cardinality(inclusions) <= 40 and octet_length(array_to_string(inclusions, '')) <= 8000),
  site_works      jsonb not null default '{}'::jsonb check (octet_length(site_works::text) < 2000),
  lead_time_weeks smallint check (lead_time_weeks between 1 and 104),
  regions         text[] not null default '{}'
                  check (regions <@ array['QLD','NSW','VIC','WA','SA','TAS','ACT','NT']::text[]),
  media_paths     text[] not null default '{}'
                  check (cardinality(media_paths) <= 20 and octet_length(array_to_string(media_paths, '')) <= 6000),
  owns_copyright  boolean not null default false,
  status          text not null default 'draft' check (status in ('draft', 'live', 'archived')),
  hidden          boolean not null default false,  -- staff only: takedown
  view_count      integer not null default 0,      -- written by record_listing_view() only
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A plan is sold as plans, a licence, or build-only; a module is prefab.
  constraint listings_mode_fits_kind check (
    (kind = 'plan' and sale_mode in ('plan_purchase', 'plan_licence', 'build_only'))
    or (kind = 'module' and sale_mode = 'prefab')),
  -- Selling a design means owning it (or holding the right to sell it).
  constraint listings_copyright_when_live check (
    status <> 'live' or sale_mode not in ('plan_purchase', 'plan_licence') or owns_copyright),
  -- "What you see is what you get": a live prefab listing says, for each
  -- piece of site work, whether it is included or excluded, and its lead time.
  -- coalesce(..., false): a missing key or a non-object must fail, not pass as NULL.
  constraint listings_prefab_site_works_when_live check (
    status <> 'live' or sale_mode <> 'prefab' or (
      coalesce(
        jsonb_typeof(site_works) = 'object'
        and site_works->>'footings'  in ('included', 'excluded')
        and site_works->>'transport' in ('included', 'excluded')
        and site_works->>'services'  in ('included', 'excluded')
        and site_works->>'approvals' in ('included', 'excluded'),
        false)
      and lead_time_weeks is not null)),
  constraint listings_media_when_live check (status <> 'live' or cardinality(media_paths) >= 1)
);

create index if not exists listings_live on public.listings (kind, created_at desc) where status = 'live' and not hidden;
create index if not exists listings_seller on public.listings (seller_id, updated_at desc);
create index if not exists listings_regions on public.listings using gin (regions);

alter table public.listings enable row level security;

drop policy if exists "listings: public reads live"     on public.listings;
drop policy if exists "listings: seller reads own"      on public.listings;
drop policy if exists "listings: read"                  on public.listings;
drop policy if exists "listings: builder plan inserts"  on public.listings;
drop policy if exists "listings: seller updates own"    on public.listings;
drop policy if exists "listings: seller deletes own"    on public.listings;

create policy "listings: read" on public.listings
  for select to anon, authenticated using (
    (select auth.uid()) = seller_id
    or (status = 'live' and not hidden and exists (
      select 1 from public.pro_profiles p where p.user_id = seller_id and p.published and not p.suspended)));
create policy "listings: builder plan inserts" on public.listings
  for insert to authenticated with check (
    (select auth.uid()) = seller_id and (select public.my_effective_tier()) >= 'business');
create policy "listings: seller updates own" on public.listings
  for update to authenticated
  using ((select auth.uid()) = seller_id) with check ((select auth.uid()) = seller_id);
-- A listing staff took down stays on record: deleting it and re-posting a
-- copy would undo the takedown with no trace.
create policy "listings: seller deletes own" on public.listings
  for delete to authenticated using ((select auth.uid()) = seller_id and not hidden);

revoke all on public.listings from anon, authenticated;
grant select on public.listings to anon, authenticated;
grant insert (seller_id, kind, sale_mode, title, summary, description, price_cents, bedrooms, bathrooms,
              storeys, floor_area_m2, inclusions, site_works, lead_time_weeks, regions, media_paths,
              owns_copyright, status)
  on public.listings to authenticated;
-- kind may change with sale_mode; listings_mode_fits_kind keeps them paired.
grant update (kind, sale_mode, title, summary, description, price_cents, bedrooms, bathrooms,
              storeys, floor_area_m2, inclusions, site_works, lead_time_weeks, regions, media_paths,
              owns_copyright, status)
  on public.listings to authenticated;
grant delete on public.listings to authenticated;

-- A page view is not an edit: without the WHEN, every view would reorder
-- the seller's "recently updated" list.
drop trigger if exists listings_touch_updated_at on public.listings;
create trigger listings_touch_updated_at
  before update on public.listings
  for each row
  when (old.view_count is not distinct from new.view_count)
  execute function public.touch_updated_at();

-- Going live counts as listing (new, or from draft/archived): Builder plan
-- at that moment, a trial counting as the plan it trials.
create or replace function public.enforce_listing_go_live()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'live'
     and (tg_op = 'INSERT' or old.status is distinct from 'live')
     and (select auth.uid()) is not null            -- staff (service role) exempt
     and coalesce(public.my_effective_tier(), 'free') < 'business' then
    raise exception 'plan_limit: publishing a listing needs the Builder plan'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_listing_go_live() from public, anon, authenticated;

drop trigger if exists listings_go_live on public.listings;
create trigger listings_go_live
  before insert or update of status on public.listings
  for each row execute function public.enforce_listing_go_live();


-- ---- listing views ------------------------------------------------------
-- Anyone may bump the counter on a live listing; nothing else. Counts are a
-- rough signal for the seller's dashboard, not billing data.
create or replace function public.record_listing_view(p_listing uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.listings
     set view_count = view_count + 1
   where id = p_listing and status = 'live' and not hidden
     and seller_id is distinct from (select auth.uid())    -- sellers don't count themselves
     and exists (select 1 from public.pro_profiles p
                  where p.user_id = seller_id and p.published and not p.suspended);
$$;

revoke execute on function public.record_listing_view(uuid) from public;
grant execute on function public.record_listing_view(uuid) to anon, authenticated;


-- ---- enquiries ----------------------------------------------------------
-- The buyer's way in. Signed-in only, which is the spam control that
-- matters; a daily cap catches the rest. The seller sees what the buyer
-- typed, and can only change the status.
create table if not exists public.enquiries (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid references public.listings on delete set null,
  seller_id     uuid not null references public.pro_profiles (user_id) on delete cascade,
  buyer_id      uuid not null default auth.uid() references auth.users on delete cascade,
  contact_name  text not null check (char_length(contact_name) between 1 and 120),
  contact_email text not null check (char_length(contact_email) <= 200 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text check (char_length(contact_phone) <= 40),
  postcode      text check (postcode ~ '^\d{4}$'),
  message       text not null check (char_length(message) between 1 and 4000),
  status        text not null default 'new' check (status in ('new', 'replied', 'closed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists enquiries_seller on public.enquiries (seller_id, created_at desc);
create index if not exists enquiries_buyer on public.enquiries (buyer_id, created_at desc);
create index if not exists enquiries_listing on public.enquiries (listing_id);

alter table public.enquiries enable row level security;

drop policy if exists "enquiries: buyer sends"          on public.enquiries;
drop policy if exists "enquiries: buyer reads own"      on public.enquiries;
drop policy if exists "enquiries: seller reads theirs"  on public.enquiries;
drop policy if exists "enquiries: read"                 on public.enquiries;
drop policy if exists "enquiries: seller updates status" on public.enquiries;

-- A buyer may only enquire with a published seller, about one of that
-- seller's live listings (or about the seller in general).
create policy "enquiries: buyer sends" on public.enquiries
  for insert to authenticated with check (
    (select auth.uid()) = buyer_id
    and exists (select 1 from public.pro_profiles p where p.user_id = seller_id and p.published and not p.suspended)
    and (listing_id is null or exists (
      select 1 from public.listings l
       where l.id = listing_id and l.seller_id = enquiries.seller_id and l.status = 'live' and not l.hidden)));
create policy "enquiries: read" on public.enquiries
  for select to authenticated using ((select auth.uid()) in (buyer_id, seller_id));
create policy "enquiries: seller updates status" on public.enquiries
  for update to authenticated
  using ((select auth.uid()) = seller_id) with check ((select auth.uid()) = seller_id);

revoke all on public.enquiries from anon, authenticated;
grant select on public.enquiries to authenticated;
grant insert (listing_id, seller_id, buyer_id, contact_name, contact_email, contact_phone, postcode, message)
  on public.enquiries to authenticated;
grant update (status) on public.enquiries to authenticated;

drop trigger if exists enquiries_touch_updated_at on public.enquiries;
create trigger enquiries_touch_updated_at
  before update on public.enquiries
  for each row execute function public.touch_updated_at();

create or replace function public.enforce_enquiry_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  -- Only count for the caller's own sends: for anyone else's buyer_id RLS
  -- rejects the row anyway, and counting would leak how many they've sent.
  if new.buyer_id is distinct from (select auth.uid()) then
    return new;
  end if;
  select count(*) into n from public.enquiries
   where buyer_id = new.buyer_id and created_at > now() - interval '1 day';
  if n >= 20 then
    raise exception 'rate_limit: 20 enquiries a day - try again tomorrow' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_enquiry_rate() from public, anon, authenticated;

drop trigger if exists enquiries_rate on public.enquiries;
create trigger enquiries_rate
  before insert on public.enquiries
  for each row execute function public.enforce_enquiry_rate();


-- ---- media storage ------------------------------------------------------
-- Public bucket: listing and portfolio photos are meant to be seen. Each
-- user writes only under their own folder: marketplace/<user_id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace', 'marketplace', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "marketplace media: owner reads"   on storage.objects;
drop policy if exists "marketplace media: owner uploads" on storage.objects;
drop policy if exists "marketplace media: owner updates" on storage.objects;
drop policy if exists "marketplace media: owner deletes" on storage.objects;

create policy "marketplace media: owner reads" on storage.objects
  for select to authenticated using (
    bucket_id = 'marketplace' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Only people who can sell (Tradie plan and up) put photos in the public bucket.
create policy "marketplace media: owner uploads" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'marketplace' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.my_effective_tier()) >= 'pro');
create policy "marketplace media: owner updates" on storage.objects
  for update to authenticated
  using (bucket_id = 'marketplace' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'marketplace' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "marketplace media: owner deletes" on storage.objects
  for delete to authenticated using (
    bucket_id = 'marketplace' and (storage.foldername(name))[1] = (select auth.uid())::text);
