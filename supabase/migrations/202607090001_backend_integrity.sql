begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  account_type text not null default 'personal'
    check (account_type in ('personal', 'freelancer', 'business')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor text not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'USD'
    check (currency in ('USD', 'GBP', 'EUR', 'AED', 'INR', 'CAD', 'AUD', 'JPY')),
  category text not null default 'other'
    check (category in (
      'food_dining', 'transport', 'accommodation', 'equipment', 'software',
      'marketing', 'utilities', 'healthcare', 'entertainment', 'office',
      'travel', 'other'
    )),
  date date not null default current_date,
  receipt_image_url text,
  notes text,
  tax_deductible boolean not null default false,
  is_recurring boolean not null default false,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.expenses
  add column if not exists created_at timestamptz not null default now();

create index if not exists expenses_user_date_idx
  on public.expenses (user_id, date desc);
create index if not exists expenses_user_created_idx
  on public.expenses (user_id, created_at desc);

create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_pro boolean not null default false,
  product_id text,
  expires_at timestamptz,
  source_event_id text,
  source_event_timestamp_ms bigint,
  updated_at timestamptz not null default now()
);

alter table public.user_entitlements
  add column if not exists source_event_timestamp_ms bigint;

create table if not exists public.scan_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists scan_usage_user_created_idx
  on public.scan_usage (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.expenses enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.scan_usage enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'expenses', 'user_entitlements', 'scan_usage')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "expenses_select_own" on public.expenses;
create policy "expenses_select_own"
  on public.expenses for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "expenses_insert_own" on public.expenses;
create policy "expenses_insert_own"
  on public.expenses for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "expenses_update_own" on public.expenses;
create policy "expenses_update_own"
  on public.expenses for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "expenses_delete_own" on public.expenses;
create policy "expenses_delete_own"
  on public.expenses for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "entitlements_select_own" on public.user_entitlements;
create policy "entitlements_select_own"
  on public.user_entitlements for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.user_entitlements from anon, authenticated;
grant select on public.user_entitlements to authenticated;
revoke all on public.scan_usage from anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, account_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    case
      when new.raw_user_meta_data ->> 'account_type' in ('personal', 'freelancer', 'business')
        then new.raw_user_meta_data ->> 'account_type'
      else 'personal'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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

drop trigger if exists enforce_monthly_expense_limit on public.expenses;
create trigger enforce_monthly_expense_limit
  before insert on public.expenses
  for each row execute function public.enforce_monthly_expense_limit();

create or replace function public.consume_scan_quota()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  pro_active boolean;
  hourly_count integer;
  daily_count integer;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller::text || ':scan', 0));

  select coalesce(is_pro and (expires_at is null or expires_at > now()), false)
    into pro_active
    from public.user_entitlements
    where user_id = caller;

  if not coalesce(pro_active, false) then
    raise exception 'SCAN_REQUIRES_PRO' using errcode = 'P0001';
  end if;

  delete from public.scan_usage
  where user_id = caller
    and created_at < now() - interval '7 days';

  select
    count(*) filter (where created_at >= now() - interval '1 hour'),
    count(*) filter (where created_at >= now() - interval '1 day')
  into hourly_count, daily_count
  from public.scan_usage
  where user_id = caller
    and created_at >= now() - interval '1 day';

  if hourly_count >= 20 or daily_count >= 100 then
    raise exception 'SCAN_RATE_LIMIT_REACHED'
      using errcode = 'P0001';
  end if;

  insert into public.scan_usage (user_id) values (caller);
end;
$$;

revoke all on function public.consume_scan_quota() from public, anon;
grant execute on function public.consume_scan_quota() to authenticated;

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "receipt_objects_select_own" on storage.objects;
create policy "receipt_objects_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "receipt_objects_insert_own" on storage.objects;
create policy "receipt_objects_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "receipt_objects_update_own" on storage.objects;
create policy "receipt_objects_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "receipt_objects_delete_own" on storage.objects;
create policy "receipt_objects_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
