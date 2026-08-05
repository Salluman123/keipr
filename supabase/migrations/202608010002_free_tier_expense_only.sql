begin;

-- Free-tier monthly cap should only track expense entries — income logging
-- should never consume it, and inserting an income row must not be blocked
-- by an unrelated expense count.
create or replace function public.enforce_monthly_expense_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  pro_active boolean;
  expense_count integer;
begin
  if new.user_id is distinct from auth.uid() then
    raise exception 'Expense owner does not match authenticated user'
      using errcode = '42501';
  end if;

  if new.type = 'income' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || month_start::text, 0));

  select coalesce(is_pro and (expires_at is null or expires_at > now()), false)
    into pro_active
    from public.user_entitlements
    where user_id = new.user_id;

  if coalesce(pro_active, false) then
    return new;
  end if;

  select count(*)
    into expense_count
    from public.expenses
    where user_id = new.user_id
      and type = 'expense'
      and created_at >= month_start
      and created_at < month_start + interval '1 month';

  if expense_count >= 10 then
    raise exception 'FREE_EXPENSE_LIMIT_REACHED'
      using errcode = 'P0001',
            hint = 'Upgrade to Keipr Pro for unlimited expenses.';
  end if;

  return new;
end;
$$;

commit;
