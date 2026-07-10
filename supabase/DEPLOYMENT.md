# Supabase security deployment

Deploy these changes together. The database intentionally trusts only
`user_entitlements`, which clients cannot modify.

1. Review existing policies on `storage.objects`. Remove any old broad policy
   that grants access to the `receipts` bucket; the migration adds owner-folder
   policies but cannot safely remove policies belonging to unrelated buckets.
2. Apply `migrations/202607090001_backend_integrity.sql`.
3. Set function secrets:

   ```sh
   supabase secrets set ANTHROPIC_API_KEY=...
   supabase secrets set REVENUECAT_WEBHOOK_SECRET=...
   supabase secrets set REVENUECAT_ENTITLEMENT_ID="get.keipr Pro"
   supabase secrets set REVENUECAT_SECRET_API_KEY=sk_...
   ```

   `REVENUECAT_SECRET_API_KEY` is a RevenueCat **secret** API key (RevenueCat →
   Project settings → API keys). It powers the REST fallback that lets
   `scan-receipt` and `sync-entitlement` verify a purchase directly when the
   webhook hasn't landed yet. Without it, entitlements depend entirely on the
   webhook.

4. Deploy all three functions:

   ```sh
   supabase functions deploy scan-receipt
   supabase functions deploy sync-entitlement
   supabase functions deploy revenuecat-webhook --no-verify-jwt
   ```

5. In RevenueCat, create a webhook for:
   `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`.
   Set its authorization header to `Bearer <REVENUECAT_WEBHOOK_SECRET>`.
6. Before releasing enforcement, backfill current subscribers into
   `public.user_entitlements` using a service-role process or replay their
   latest RevenueCat events. Existing Pro users without a row are treated as
   free by design.
7. Verify with one free and one Pro test account:
   - users cannot read or mutate another user's expenses;
   - receipt object paths are private and signed URLs expire;
   - the eleventh free expense in a UTC calendar month is rejected;
   - free users cannot invoke OCR;
   - repeated Pro OCR calls receive HTTP 429 after the configured quota.

The OCR quota is 20 scans per rolling hour and 100 per rolling day. Expense
quota resets at the start of each UTC calendar month.
