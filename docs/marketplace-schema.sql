-- =========================================================================
-- DRAFT — marketplace schema (phases 2–4 of docs/MARKETPLACE-PLAN.md)
--
-- Deliberately NOT in supabase/migrations: nothing here is applied until it
-- has been reviewed. Move it into a dated migration when phase 2 starts.
--
-- Same rules as the live migrations:
--   * RLS on every table; anon gets nothing it doesn't need.
--   * Anything that is trust or money (verification, listing approval) is
--     service-role writable only, enforced with column GRANTs, because a
--     row-level UPDATE policy cannot protect individual columns.
-- =========================================================================

-- ---- new kinds of user ------------------------------------------------------
alter type public.user_segment add value if not exists 'engineer';
alter type public.user_segment add value if not exists 'certifier';
alter type public.user_segment add value if not exists 'supplier';


-- ---- public pro profiles (tradies, builders, engineers, certifiers, suppliers)
create table if not exists public.pro_profiles (
  user_id            uuid primary key references auth.users on delete cascade,
  kind               text not null check (kind in ('tradie','builder','engineer','certifier','assessor','supplier','designer')),
  display_name       text not null check (char_length(display_name) <= 120),
  abn                text check (abn ~ '^\d{11}$'),
  trades             text[] not null default '{}',
  service_postcodes  text[] not null default '{}',
  bio                text check (char_length(bio) <= 4000),
  licence_number     text,
  licence_state      text check (licence_state in ('QLD','NSW','VIC','WA','SA','TAS','ACT','NT')),
  licence_expires_at date,
  insurance_pl_cents bigint,
  insurance_expires_at date,
  -- Trust columns: set by the verification job (service role) only.
  verified           boolean not null default false,
  verified_at        timestamptz,
  published          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists pro_profiles_trades on public.pro_profiles using gin (trades);
create index if not exists pro_profiles_postcodes on public.pro_profiles using gin (service_postcodes);

alter table public.pro_profiles enable row level security;
create policy "pro_profiles: public reads published" on public.pro_profiles
  for select to anon, authenticated using (published and verified);
create policy "pro_profiles: owner reads own" on public.pro_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "pro_profiles: owner inserts own" on public.pro_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "pro_profiles: owner updates own" on public.pro_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.pro_profiles from anon, authenticated;
grant select on public.pro_profiles to anon, authenticated;
grant insert (user_id, kind, display_name, abn, trades, service_postcodes, bio, licence_number, licence_state,
              licence_expires_at, insurance_pl_cents, insurance_expires_at, published)
  on public.pro_profiles to authenticated;
grant update (display_name, abn, trades, service_postcodes, bio, licence_number, licence_state,
              licence_expires_at, insurance_pl_cents, insurance_expires_at, published)
  on public.pro_profiles to authenticated;
-- Changing licence or insurance details must re-trigger verification:
create or replace function public.pro_profiles_reverify()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.licence_number, new.licence_state, new.licence_expires_at, new.insurance_pl_cents, new.insurance_expires_at)
     is distinct from
     (old.licence_number, old.licence_state, old.licence_expires_at, old.insurance_pl_cents, old.insurance_expires_at)
     and current_user <> 'service_role' then
    new.verified := false;
    new.verified_at := null;
  end if;
  return new;
end $$;
create trigger pro_profiles_reverify before update on public.pro_profiles
  for each row execute function public.pro_profiles_reverify();


-- ---- portfolio: finished jobs a pro showcases --------------------------------
create table if not exists public.portfolio_items (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references public.pro_profiles (user_id) on delete cascade,
  title         text not null check (char_length(title) <= 160),
  description   text check (char_length(description) <= 4000),
  trade         text,
  suburb        text,
  completed_on  date,
  media_paths   text[] not null default '{}',      -- storage: portfolio/<owner_id>/...
  job_ref       text,                              -- set when it came from a job run on the platform
  published     boolean not null default false,
  created_at    timestamptz not null default now()
);
alter table public.portfolio_items enable row level security;
create policy "portfolio: public reads published" on public.portfolio_items
  for select to anon, authenticated using (published);
create policy "portfolio: owner manages" on public.portfolio_items
  for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);


-- ---- listings: materials, plans, modules, services --------------------------
create table if not exists public.listings (
  id            uuid primary key default gen_random_uuid(),
  seller_id     uuid not null default auth.uid() references public.pro_profiles (user_id) on delete cascade,
  kind          text not null check (kind in ('material','plan','module','service')),
  -- How a builder sells it (src/logic/marketplace.js SALE_MODES); their choice.
  sale_mode     text check (sale_mode in ('plan_purchase','plan_licence','build_only','prefab')),
  owns_copyright boolean not null default false,
  site_works    jsonb not null default '{}'::jsonb,   -- prefab: { footings|transport|services|approvals: included|excluded }
  lead_time_weeks integer check (lead_time_weeks > 0),
  title         text not null check (char_length(title) <= 160),
  description   text check (char_length(description) <= 8000),
  price_cents   bigint check (price_cents >= 0),   -- ex GST
  unit          text,
  currency      text not null default 'AUD',
  exclusive     boolean not null default false,
  regions       text[] not null default '{}',
  specs         jsonb not null default '{}'::jsonb check (octet_length(specs::text) < 200000),
  model_ref     text,                              -- plans/modules: estimator model JSON in storage
  media_paths   text[] not null default '{}',
  status        text not null default 'draft' check (status in ('draft','pending_review','live','archived')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.listings enable row level security;
create policy "listings: public reads live" on public.listings
  for select to anon, authenticated using (status = 'live');
create policy "listings: seller reads own" on public.listings
  for select to authenticated using ((select auth.uid()) = seller_id);
create policy "listings: seller inserts" on public.listings
  for insert to authenticated with check ((select auth.uid()) = seller_id and status in ('draft','pending_review'));
create policy "listings: seller updates" on public.listings
  for update to authenticated using ((select auth.uid()) = seller_id)
  with check ((select auth.uid()) = seller_id and status in ('draft','pending_review','archived'));
-- A seller can submit for review or archive, never self-publish: 'live' is
-- excluded from both WITH CHECKs above, so only the service role sets it.
-- Any edit to a live listing sends it back to review:
create or replace function public.listings_rereview()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'live' and current_user <> 'service_role' and new.status = 'live' then
    new.status := 'pending_review';
  end if;
  return new;
end $$;
create trigger listings_rereview before update on public.listings
  for each row execute function public.listings_rereview();


-- ---- orders: plan and prefab purchases (Stripe Connect) --------------------
-- Written by the Stripe webhook only (service role). Buyer and seller read.
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  listing_id          uuid not null references public.listings on delete restrict,
  buyer_id            uuid not null references auth.users on delete restrict,
  seller_id           uuid not null references public.pro_profiles (user_id) on delete restrict,
  subtotal_cents      bigint not null,
  gst_cents           bigint not null,
  platform_fee_cents  bigint not null,               -- 1.5%, Stripe application_fee_amount
  stripe_payment_intent text unique,
  status              text not null default 'paid' check (status in ('paid','refunded','disputed')),
  created_at          timestamptz not null default now()
);
alter table public.orders enable row level security;
create policy "orders: buyer and seller read" on public.orders
  for select to authenticated using ((select auth.uid()) in (buyer_id, seller_id));
revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;

-- ---- signed contracts: the 1.5% platform fee ---------------------------------
create table if not exists public.contract_fees (
  id                  uuid primary key default gen_random_uuid(),
  builder_id          uuid not null references auth.users on delete restrict,
  job_ref             text not null,
  contract_value_cents bigint not null check (contract_value_cents > 0),
  fee_cents           bigint not null,
  signed_at           timestamptz not null default now(),
  stripe_invoice_id   text unique,
  status              text not null default 'invoiced' check (status in ('invoiced','paid','void')),
  unique (builder_id, job_ref)
);
alter table public.contract_fees enable row level security;
create policy "contract_fees: builder reads own" on public.contract_fees
  for select to authenticated using ((select auth.uid()) = builder_id);
revoke all on public.contract_fees from anon, authenticated;
grant select on public.contract_fees to authenticated;


-- ---- job shares: invite an engineer/certifier onto one job -------------------
create table if not exists public.job_shares (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users on delete cascade,
  job_ref       text not null,                     -- the builder's job id
  approval_key  text not null,                     -- e.g. 'structural_design'
  invitee_email text not null,
  invitee_id    uuid references auth.users on delete set null,   -- set on accept
  token_hash    text not null unique,              -- sha256 of the link token; the token itself is never stored
  expires_at    timestamptz not null default now() + interval '30 days',
  accepted_at   timestamptz,
  revoked       boolean not null default false,
  created_at    timestamptz not null default now()
);
alter table public.job_shares enable row level security;
create policy "job_shares: owner manages" on public.job_shares
  for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "job_shares: invitee reads" on public.job_shares
  for select to authenticated using ((select auth.uid()) = invitee_id and not revoked);
-- Accepting (binding invitee_id from a token) happens in an API route with
-- the service role after checking token_hash, expiry and the invitee's email.


-- ---- what the engineer sends back -------------------------------------------
create table if not exists public.approval_submissions (
  id              uuid primary key default gen_random_uuid(),
  share_id        uuid not null references public.job_shares on delete cascade,
  submitted_by    uuid not null default auth.uid() references auth.users on delete cascade,
  file_paths      text[] not null default '{}',     -- storage: job-documents/<share_id>/...
  fee_cents       bigint check (fee_cents >= 0),
  cost_impact_cents bigint,                         -- + / − on the construction cost
  note            text check (char_length(note) <= 4000),
  created_at      timestamptz not null default now()
);
alter table public.approval_submissions enable row level security;
create policy "submissions: invitee inserts on a live share" on public.approval_submissions
  for insert to authenticated with check (
    (select auth.uid()) = submitted_by and exists (
      select 1 from public.job_shares s
      where s.id = share_id and s.invitee_id = (select auth.uid())
        and not s.revoked and s.expires_at > now()));
create policy "submissions: invitee and owner read" on public.approval_submissions
  for select to authenticated using (
    submitted_by = (select auth.uid()) or exists (
      select 1 from public.job_shares s where s.id = share_id and s.owner_id = (select auth.uid())));

-- Storage: private bucket 'job-documents', object path '<share_id>/<file>'.
-- Policies mirror approval_submissions: invitee may upload under a live
-- share's prefix; owner and invitee may read. 'portfolio' bucket: public read,
-- owner write under '<user_id>/'.
