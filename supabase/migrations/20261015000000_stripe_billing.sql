-- =========================================================================
-- Stripe billing state on profiles.
--
-- Stripe is the source of truth. The server (api/billing/*) re-reads a
-- customer's subscriptions from Stripe after every webhook or checkout
-- return and writes the result here through apply_billing() — never from
-- the event payload, so a replayed or out-of-order event can't set a stale
-- plan. Ordering guard: each write carries the time the server READ Stripe
-- (p_synced_at); an older read never overwrites a newer one.
--
-- Users can read these columns (own row, existing RLS) but not write them:
-- none are in the column-level UPDATE grant (full_name, company, segment).
-- The free trial (trial_tier / trial_ends_at) is untouched: a paid tier
-- outranks it in lib/entitlements.js.
-- =========================================================================

alter table public.profiles add column if not exists billing_status    text;
alter table public.profiles add column if not exists billing_interval  text;
alter table public.profiles add column if not exists plan_renews_at    timestamptz;
alter table public.profiles add column if not exists plan_cancels_at   timestamptz;
alter table public.profiles add column if not exists billing_synced_at timestamptz;

comment on column public.profiles.billing_status    is 'Stripe subscription status (active, trialing, past_due, canceled, ...). Server-written only.';
comment on column public.profiles.billing_interval  is 'month | year. Server-written only.';
comment on column public.profiles.plan_renews_at    is 'End of the current paid period. Server-written only.';
comment on column public.profiles.plan_cancels_at   is 'Set when the subscription is cancelled to end at period end. Server-written only.';
comment on column public.profiles.billing_synced_at is 'When the server last read this customer from Stripe — ordering guard for apply_billing().';

create unique index if not exists profiles_stripe_customer_id_key
  on public.profiles (stripe_customer_id) where stripe_customer_id is not null;


-- ---- link a Stripe customer to an account (first one wins) ---------------
-- Returns the customer now on the profile: if two checkouts raced and both
-- created a customer, both callers get the same (first) one back.
create or replace function public.link_stripe_customer(p_user uuid, p_customer text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked text;
begin
  update public.profiles set stripe_customer_id = p_customer
   where id = p_user and stripe_customer_id is null;
  select stripe_customer_id into linked from public.profiles where id = p_user;
  return linked;
end;
$$;

revoke execute on function public.link_stripe_customer(uuid, text) from public, anon, authenticated;
grant  execute on function public.link_stripe_customer(uuid, text) to service_role;


-- ---- write what Stripe says this customer has -----------------------------
create or replace function public.apply_billing(
  p_user       uuid,
  p_customer   text,
  p_tier       public.subscription_tier,
  p_ai_addon   boolean,
  p_status     text,
  p_interval   text,
  p_renews_at  timestamptz,
  p_cancels_at timestamptz,
  p_synced_at  timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set
    -- Enterprise is set by hand (sales-led); billing never moves it.
    tier              = case when tier = 'enterprise' then tier else p_tier end,
    tier_updated_at   = case when tier is distinct from p_tier and tier <> 'enterprise' then now() else tier_updated_at end,
    ai_addon          = p_ai_addon,
    stripe_customer_id = coalesce(stripe_customer_id, p_customer),
    billing_status    = p_status,
    billing_interval  = p_interval,
    plan_renews_at    = p_renews_at,
    plan_cancels_at   = p_cancels_at,
    billing_synced_at = p_synced_at
  where id = p_user
    -- only the customer this account is linked to (or the first link)
    and (stripe_customer_id is null or stripe_customer_id = p_customer)
    -- never let an older read of Stripe overwrite a newer one
    and (billing_synced_at is null or billing_synced_at <= p_synced_at);
  return found;
end;
$$;

revoke execute on function public.apply_billing(uuid, text, public.subscription_tier, boolean, text, text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function public.apply_billing(uuid, text, public.subscription_tier, boolean, text, text, timestamptz, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
