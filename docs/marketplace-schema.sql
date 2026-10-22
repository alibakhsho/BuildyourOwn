-- =========================================================================
-- DRAFT — future marketplace tables (not applied)
--
-- Profiles, portfolios, listings, enquiries and media storage are LIVE:
-- see supabase/migrations/20261020100000_marketplace.sql. What remains
-- here is still a draft, for later phases:
--   orders           plan / prefab purchases once Stripe Connect is set up
--   contract_fees    the 1.5% on build contracts signed through the platform
--   job_shares       invite an engineer or certifier onto one job
--   approval_submissions  what they send back (plans, fee, cost impact)
-- Before applying any of it: match the live migration's conventions
-- (column GRANTs, idempotent policies, my_effective_tier()), and note that
-- listings.seller_id / pro_profiles.user_id are what these reference.
-- =========================================================================

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
