import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// The RevenueCat entitlement identifier was created with U+2024 (ONE DOT
// LEADER), not an ASCII period: "get․keipr Pro". It cannot be renamed without
// orphaning existing purchases, so every comparison must normalize both sides.
// NFKC folds U+2024 (and other compatibility dots) to ".".
export const normalizeEntitlementId = (s: string) => s.normalize('NFKC')

// Queries the RevenueCat REST API for the user's current entitlement and, if
// active, upserts public.user_entitlements directly. This is the self-healing
// fallback for when the RevenueCat webhook hasn't landed yet (purchase→webhook
// latency) or was dropped (e.g. purchase attributed to an anonymous ID that was
// later aliased). It only ever UNLOCKS — an inactive/missing entitlement is
// reported as false without writing anything, so a misconfigured REST key can
// never downgrade a user the webhook has already marked Pro.
const SYNC_COOLDOWN_MS = 60_000


export async function syncEntitlementFromRevenueCat(userId: string): Promise<boolean> {
  const rcKey = Deno.env.get('REVENUECAT_SECRET_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const entitlementId = Deno.env.get('REVENUECAT_ENTITLEMENT_ID') ?? 'get.keipr Pro'
  if (!rcKey || !supabaseUrl || !serviceRoleKey) {
    console.error('Entitlement sync skipped — missing REVENUECAT_SECRET_API_KEY or Supabase env')
    return false
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Per-user cooldown so repeated failed scans (or restore taps) can't spam
  // RevenueCat's REST API. A free user hammering the scan button would
  // otherwise trigger one RC call per attempt with no upper bound.
  const { data: lastAttempt } = await admin
    .from('entitlement_sync_attempts')
    .select('last_attempt_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (
    lastAttempt?.last_attempt_at &&
    Date.now() - Date.parse(lastAttempt.last_attempt_at) < SYNC_COOLDOWN_MS
  ) {
    console.log('Entitlement sync skipped — cooldown active for user', userId)
    return false
  }

  await admin
    .from('entitlement_sync_attempts')
    .upsert({ user_id: userId, last_attempt_at: new Date().toISOString() })

  let res: Response
  try {
    res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${rcKey}` },
      },
    )
  } catch (error) {
    console.error('RevenueCat REST request failed', error instanceof Error ? error.message : String(error))
    return false
  }
  if (!res.ok) {
    console.error('RevenueCat REST returned status', res.status)
    return false
  }

  let payload: Record<string, unknown>
  try {
    payload = await res.json()
  } catch {
    return false
  }

  const subscriber = payload?.subscriber as Record<string, unknown> | undefined
  const entitlements = subscriber?.entitlements as Record<string, unknown> | undefined
  const expected = normalizeEntitlementId(entitlementId)
  const entitlementEntry = Object.entries(entitlements ?? {}).find(
    ([key]) => normalizeEntitlementId(key) === expected,
  )
  const entitlement = entitlementEntry?.[1] as Record<string, unknown> | undefined
  if (!entitlement) return false

  const expiresIso = typeof entitlement.expires_date === 'string' ? entitlement.expires_date : null
  const active = expiresIso === null || Date.parse(expiresIso) > Date.now()
  if (!active) return false

  const nowMs = Date.now()
  const { error } = await admin.from('user_entitlements').upsert({
    user_id: userId,
    is_pro: true,
    product_id:
      typeof entitlement.product_identifier === 'string' ? entitlement.product_identifier : null,
    expires_at: expiresIso,
    source_event_id: `rest-sync:${nowMs}`,
    source_event_timestamp_ms: nowMs,
    updated_at: new Date(nowMs).toISOString(),
  })
  if (error) {
    console.error('Entitlement sync upsert failed', error.message)
    return false
  }
  return true
}
