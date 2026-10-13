-- Homeowner AI add-on. The free (Homeowner) plan has no AI; this flag adds
-- it without moving them to a paid tier. Like `tier`, it is money: it is NOT
-- in the column-level UPDATE grant (full_name, company, segment), so only the
-- service role / dashboard can set it. Read by api/_lib/ai-access.js via
-- src/lib/entitlements.js.
alter table public.profiles add column if not exists ai_addon boolean not null default false;
comment on column public.profiles.ai_addon is
  'Homeowner AI assistant add-on. Service-role writable only, like tier.';
