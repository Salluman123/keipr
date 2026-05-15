# Keipr — Backend Reference

## Supabase Project
- URL: https://sydapobvfnaupdipefvi.supabase.co
- Auth: Email/Password (Apple Sign In — Phase 2)

## Database Tables

### profiles
| Column | Type | Default |
|--------|------|---------|
| id | uuid | references auth.users |
| email | text | |
| full_name | text | |
| account_type | text | 'personal' |
| created_at | timestamptz | now() |

### expenses
| Column | Type | Default |
|--------|------|---------|
| id | uuid | gen_random_uuid() |
| user_id | uuid | references profiles(id) |
| vendor | text | |
| amount | numeric(10,2) | |
| date | date | |
| category | text | 'General' |
| notes | text | |
| receipt_image_url | text | |
| currency | text | 'USD' |
| tags | text[] | |
| is_recurring | boolean | false |
| tax_deductible | boolean | false |
| created_at | timestamptz | now() |

## Storage Buckets
- receipts (private) — stores receipt photos per user
  Path pattern: {user_id}/{filename}

## RLS Policies
- profiles: users can only read/update their own profile
- expenses: users can only CRUD their own expenses
- receipts: users can only upload/view their own files

## Auth Triggers

### handle_new_user
Auto-creates a `profiles` row when a new `auth.users` row is inserted.
`options.data` passed to `supabase.auth.signUp()` is written to `raw_user_meta_data` on the same INSERT, so the trigger can read it immediately.

Deploy this in Supabase → SQL Editor:

```sql
-- 1. Function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, account_type)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'account_type', 'personal')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

Verify it is deployed:
```sql
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
```

## Claude API
- Endpoint: https://api.anthropic.com/v1/messages
- Model: claude-sonnet-4-5
- Required headers:
  - x-api-key: EXPO_PUBLIC_ANTHROPIC_API_KEY
  - anthropic-version: 2023-06-01
  - anthropic-dangerous-direct-browser-access: true
- System prompt: Extract receipt data and return JSON only:
  { vendor, amount, date (YYYY-MM-DD), category }

## Categories
Food & Drink | Software | Travel | Office | Shopping | Healthcare | Entertainment | Utilities | General

## Current Phase Status
- Phase 1 ✅ Auth flow complete
- Phase 2 ✅ Home screen, tabs, expense store
- Phase 3 🔄 Scanner working, refresh bug being fixed
- Phase 4 ⏳ Expenses screen, Reports, CSV export
- Phase 5 ⏳ Settings, polish
- Phase 6 ⏳ EAS build, App Store
