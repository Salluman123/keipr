begin;

alter table public.expenses
  add column if not exists type text not null default 'expense';

alter table public.expenses
  drop constraint if exists expenses_type_check;
alter table public.expenses
  add constraint expenses_type_check check (type in ('expense', 'income'));

-- Merged enum: income categories added alongside the existing expense
-- categories on the same `category` column (single column, single check).
alter table public.expenses
  drop constraint if exists expenses_category_check;
alter table public.expenses
  add constraint expenses_category_check check (category in (
    'food_dining', 'transport', 'accommodation', 'equipment', 'software',
    'marketing', 'utilities', 'healthcare', 'entertainment', 'office',
    'travel', 'other',
    'salary', 'client_payment', 'refund', 'investment', 'other_income'
  ));

create index if not exists expenses_user_type_idx
  on public.expenses (user_id, type);

commit;
