begin;

-- Adds a standalone "groceries" category, split out from "food_dining" so
-- supermarket/grocery-store purchases stop being classified (and iconified)
-- as restaurant dining. See src/constants/categories.ts and
-- supabase/functions/scan-receipt/index.ts for the matching client/OCR change.
alter table public.expenses
  drop constraint if exists expenses_category_check;
alter table public.expenses
  add constraint expenses_category_check check (category in (
    'groceries', 'food_dining', 'transport', 'accommodation', 'equipment', 'software',
    'marketing', 'utilities', 'healthcare', 'entertainment', 'office',
    'travel', 'other',
    'salary', 'client_payment', 'refund', 'investment', 'other_income'
  ));

commit;
