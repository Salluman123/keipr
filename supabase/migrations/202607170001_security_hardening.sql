begin;

-- MEDIUM-1: delete_account must remove storage receipts itself so account
-- deletion is atomic — previously the client deleted receipts before calling
-- this RPC, which left orphaned files if the app was killed mid-flow.
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

  delete from storage.objects
  where bucket_id = 'receipts'
    and (storage.foldername(name))[1] = caller::text;

  delete from auth.users where id = caller;
end;
$$;

-- MEDIUM-2: tracks the last RevenueCat REST self-heal attempt per user so
-- repeated failed scans (or restores) can't spam RevenueCat's API. Deny-all
-- to clients — only the service role (used by the entitlement sync helper)
-- touches this table.
create table if not exists public.entitlement_sync_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_attempt_at timestamptz not null default now()
);

alter table public.entitlement_sync_attempts enable row level security;
revoke all on public.entitlement_sync_attempts from anon, authenticated;

-- LOW-1: handle_new_user and enforce_monthly_expense_limit are trigger-only
-- functions. Revoking EXECUTE does not stop the triggers from firing (trigger
-- invocation is not subject to the invoking role's EXECUTE privilege) — it
-- only removes the direct /rest/v1/rpc/... call surface flagged by the
-- Supabase security advisor.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.enforce_monthly_expense_limit() from public, anon, authenticated;

commit;
