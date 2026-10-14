-- =========================================================================
-- Trials: start for ANY Tradie/Builder profile that has never had one.
--
-- 20261014010000 only started a trial when the segment CHANGED, so anyone
-- already saved as a Tradie or Builder before trials existed could never get
-- one (re-saving the same segment isn't a change). The real rule is simpler:
-- one trial per account, ever — trial_ends_at being null is the whole test.
--
-- The trigger is still `update of segment`, so it only runs when a statement
-- sets segment (signup, onboarding, the account form, choosing a plan). It
-- never writes trial_* on an account that already has an end date.
-- =========================================================================

create or replace function public.start_trial_for_segment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.trial_ends_at is null and new.segment in ('tradie', 'builder') then
    new.trial_tier    := case new.segment
                           when 'tradie' then 'pro'::public.subscription_tier
                           else 'business'::public.subscription_tier
                         end;
    new.trial_ends_at := now() + interval '14 days';
  end if;
  return new;
end;
$$;

revoke execute on function public.start_trial_for_segment() from public, anon, authenticated;

-- Tradies/Builders who signed up before trials existed get theirs from today.
update public.profiles set segment = segment
 where trial_ends_at is null and segment in ('tradie', 'builder');
