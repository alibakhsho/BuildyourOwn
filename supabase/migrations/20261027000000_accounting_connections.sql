-- =========================================================================
-- Accounting connections (Xero, MYOB) — one row per account per provider
--
-- Each builder links their OWN Xero organisation / MYOB company file. The
-- OAuth tokens are encrypted by the server (AES-256-GCM, key in the
-- ACCOUNTING_TOKEN_KEY environment variable) before they reach this table,
-- so a database dump alone can't touch anyone's books.
--
-- No browser access at all: RLS is on with no policies, so only the server
-- (secret key) reads or writes rows. The app learns "connected to <org>"
-- from /api/accounting/status, never the tokens.
--
-- Deleting the account deletes its connections (on delete cascade).
-- IDEMPOTENT: safe to re-run.
-- =========================================================================

create table if not exists public.accounting_connections (
  user_id      uuid not null references auth.users (id) on delete cascade,
  provider     text not null check (provider in ('xero', 'myob')),
  secret       text not null,                 -- encrypted token bundle (base64 iv.tag.ciphertext)
  organisation text,                          -- display only: Xero organisation / MYOB company file name
  connected_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.accounting_connections enable row level security;
-- deliberately no policies: anon and authenticated roles can neither read nor write
revoke all on public.accounting_connections from anon, authenticated;

comment on table public.accounting_connections is
  'Per-account Xero/MYOB OAuth tokens, encrypted server-side. Server (secret key) access only.';
