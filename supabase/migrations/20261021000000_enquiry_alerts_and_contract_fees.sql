-- =========================================================================
-- Enquiry alerts + signed contracts and the 1.5% platform fee
--
-- 1. Enquiry alerts. When a buyer sends an enquiry, the app asks our server
--    (api/market/notify.js) to email the seller. `notified_at` records that
--    it went, so a retry or a second call never emails twice. Only the
--    server (service role) writes it: it's in no user GRANT.
--
-- 2. Signed contracts. "Every contract signed through BuildYourOwn carries
--    a 1.5% platform fee" (docs/MARKETPLACE-PLAN.md). A builder records the
--    contract when it's signed — from a marketplace enquiry, or from a Site
--    Office job — and the database works out the fee. The builder can correct
--    or void their own record for 14 days while it's still just "recorded";
--    after that, or once staff have invoiced it, it's locked. Staff own
--    `fee_rate` and the invoiced/paid status.
--
--    Records outlive the builder's account (accounting): deleting an account
--    sets builder_id to null rather than deleting the fee.
--
-- Needs 20261020100000_marketplace.sql first. IDEMPOTENT: safe to re-run.
-- =========================================================================


-- ---- 1. enquiry alerts ---------------------------------------------------
alter table public.enquiries add column if not exists notified_at timestamptz;
comment on column public.enquiries.notified_at is
  'When the seller was emailed about this enquiry. Server (service role) only.';

-- A seller can mark an enquiry "won" once it turns into a signed contract.
alter table public.enquiries drop constraint if exists enquiries_status_check;
alter table public.enquiries add constraint enquiries_status_check
  check (status in ('new', 'replied', 'won', 'closed'));


-- ---- 2. signed contracts -------------------------------------------------
create table if not exists public.contracts (
  id                   uuid primary key default gen_random_uuid(),
  builder_id           uuid default auth.uid() references auth.users on delete set null,
  source               text not null check (source in ('marketplace', 'site_office', 'other')),
  enquiry_id           uuid references public.enquiries on delete set null,
  listing_id           uuid references public.listings on delete set null,
  job_ref              text check (char_length(job_ref) <= 64),       -- Site Office job id (device-local today)
  job_name             text check (char_length(job_name) <= 160),
  client_name          text not null check (char_length(client_name) between 1 and 160),
  site_postcode        text check (site_postcode ~ '^\d{4}$'),
  contract_value_cents bigint not null check (contract_value_cents > 0 and contract_value_cents < 100000000000000),  -- ex GST
  signed_on            date not null default current_date,
  fee_rate             numeric(6, 5) not null default 0.015 check (fee_rate >= 0 and fee_rate < 1),  -- staff only
  fee_cents            bigint generated always as (round(contract_value_cents * fee_rate)::bigint) stored,
  status               text not null default 'recorded' check (status in ('recorded', 'invoiced', 'paid', 'void')),
  notes                text check (char_length(notes) <= 2000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint contracts_signed_not_future check (signed_on <= current_date + 1)
);

-- One contract per enquiry, and per Site Office job, per builder: a second
-- tap of "Contract signed" can't double-charge.
create unique index if not exists contracts_one_per_enquiry on public.contracts (enquiry_id) where enquiry_id is not null;
create unique index if not exists contracts_one_per_job on public.contracts (builder_id, job_ref) where job_ref is not null;
create index if not exists contracts_builder on public.contracts (builder_id, signed_on desc);
create index if not exists contracts_listing on public.contracts (listing_id);
create index if not exists contracts_status on public.contracts (status, signed_on desc);

alter table public.contracts enable row level security;

drop policy if exists "contracts: builder reads own"     on public.contracts;
drop policy if exists "contracts: builder records own"   on public.contracts;
drop policy if exists "contracts: builder corrects own"  on public.contracts;

create policy "contracts: builder reads own" on public.contracts
  for select to authenticated using ((select auth.uid()) = builder_id);
-- A contract from an enquiry must be from one of the builder's own enquiries.
create policy "contracts: builder records own" on public.contracts
  for insert to authenticated with check (
    (select auth.uid()) = builder_id
    and (enquiry_id is null or exists (
      select 1 from public.enquiries e where e.id = enquiry_id and e.seller_id = (select auth.uid())))
    and (listing_id is null or exists (
      select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid()))));
-- Corrections (or void) for 14 days while still "recorded"; staff take it
-- from there. The WITH CHECK keeps a builder from marking their own fee paid.
create policy "contracts: builder corrects own" on public.contracts
  for update to authenticated
  using ((select auth.uid()) = builder_id and status = 'recorded' and created_at > now() - interval '14 days')
  with check ((select auth.uid()) = builder_id and status in ('recorded', 'void'));

revoke all on public.contracts from anon, authenticated;
grant select on public.contracts to authenticated;
grant insert (builder_id, source, enquiry_id, listing_id, job_ref, job_name, client_name, site_postcode,
              contract_value_cents, signed_on, notes)
  on public.contracts to authenticated;
grant update (client_name, site_postcode, contract_value_cents, signed_on, notes, status)
  on public.contracts to authenticated;
-- No DELETE for users: a fee record is voided, never erased.

drop trigger if exists contracts_touch_updated_at on public.contracts;
create trigger contracts_touch_updated_at
  before update on public.contracts
  for each row execute function public.touch_updated_at();
