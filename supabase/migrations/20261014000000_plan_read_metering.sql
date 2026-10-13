-- =========================================================================
-- AI plan-read metering.
--
-- Until now plan_reads_used was displayed and compared but never written,
-- so "25 plan reads / month" could never trip. Two functions fix that:
--
-- reserve_plan_read(p_cap)  — called by the AI route WITH THE USER'S OWN
--   TOKEN before the (expensive) model call. In one locked step it rolls the
--   monthly window forward if a month has passed, refuses at the cap, and
--   otherwise counts the read. Check-and-count being one statement is the
--   point: a burst of parallel requests can't all slip under the cap.
--   Anyone calling it directly can only spend their own allowance, so it is
--   safe to expose to `authenticated`. p_cap null = unlimited.
--
-- refund_plan_read(p_user, p_window_start) — gives one read back when the
--   model call failed. NOT callable by users (that would let anyone refill
--   their own allowance); only the server's secret key (service_role).
--   It only applies within the same window it was reserved in.
--
-- Windows are monthly, anchored on period_started_at — which the billing
-- webhook later sets to the Stripe period start — so an annual plan gets a
-- fresh allowance every month, not once a year.
-- =========================================================================

create or replace function public.reserve_plan_read(p_cap integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  months integer;
  win_start timestamptz;
  used integer;
begin
  select period_started_at, plan_reads_used into r
    from public.profiles
   where id = (select auth.uid())
     for update;                                   -- row lock: atomic check + count
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;

  months := greatest(0,
    extract(year  from age(now(), r.period_started_at))::int * 12 +
    extract(month from age(now(), r.period_started_at))::int);
  win_start := r.period_started_at + make_interval(months => months);
  used := case when months > 0 then 0 else r.plan_reads_used end;

  if p_cap is not null and used >= p_cap then
    if months > 0 then
      update public.profiles set period_started_at = win_start, plan_reads_used = 0
       where id = (select auth.uid());
    end if;
    return jsonb_build_object('ok', false, 'used', used, 'cap', p_cap,
                              'window_start', win_start, 'window_end', win_start + interval '1 month');
  end if;

  update public.profiles
     set period_started_at = win_start, plan_reads_used = used + 1
   where id = (select auth.uid());
  return jsonb_build_object('ok', true, 'used', used + 1, 'cap', p_cap,
                            'window_start', win_start, 'window_end', win_start + interval '1 month');
end;
$$;

revoke execute on function public.reserve_plan_read(integer) from public, anon;
grant  execute on function public.reserve_plan_read(integer) to authenticated;


create or replace function public.refund_plan_read(p_user uuid, p_window_start timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
     set plan_reads_used = greatest(0, plan_reads_used - 1)
   where id = p_user
     and period_started_at = p_window_start;
$$;

revoke execute on function public.refund_plan_read(uuid, timestamptz) from public, anon, authenticated;
grant  execute on function public.refund_plan_read(uuid, timestamptz) to service_role;

notify pgrst, 'reload schema';
