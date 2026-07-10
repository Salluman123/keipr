import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')
  const authorization = req.headers.get('authorization')
  if (!webhookSecret || authorization !== `Bearer ${webhookSecret}`) {
    return json(401, { error: 'Unauthorized' })
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  const event = payload.event as Record<string, unknown> | undefined
  const eventId = event?.id
  const eventType = event?.type
  const eventTimestampMs = event?.event_timestamp_ms
  const entitlementId = Deno.env.get('REVENUECAT_ENTITLEMENT_ID') ?? 'get.keipr Pro'
  const identityCandidates = [
    event?.app_user_id,
    event?.original_app_user_id,
    ...(Array.isArray(event?.aliases) ? event.aliases : []),
  ]
  const userId = identityCandidates.find(
    value =>
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  )

  if (
    typeof userId !== 'string' ||
    typeof eventId !== 'string' ||
    typeof eventType !== 'string' ||
    typeof eventTimestampMs !== 'number'
  ) {
    return json(400, { error: 'Invalid RevenueCat event' })
  }

  const entitlementIds = Array.isArray(event.entitlement_ids) ? event.entitlement_ids : []
  if (!entitlementIds.includes(entitlementId)) {
    return json(200, { received: true, ignored: 'unrelated_entitlement' })
  }

  const expirationMs =
    typeof event.expiration_at_ms === 'number' ? event.expiration_at_ms : null
  const gracePeriodExpirationMs =
    typeof event.grace_period_expiration_at_ms === 'number'
      ? event.grace_period_expiration_at_ms
      : null
  const effectiveExpirationMs =
    expirationMs === null
      ? null
      : Math.max(expirationMs, gracePeriodExpirationMs ?? expirationMs)
  const expiresAt =
    effectiveExpirationMs ? new Date(effectiveExpirationMs).toISOString() : null
  const isExpiration = eventType === 'EXPIRATION'
  const isActive =
    !isExpiration && (effectiveExpirationMs === null || effectiveExpirationMs > Date.now())

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'Server configuration error' })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: current } = await admin
    .from('user_entitlements')
    .select('source_event_timestamp_ms')
    .eq('user_id', userId)
    .maybeSingle()

  if (
    typeof current?.source_event_timestamp_ms === 'number' &&
    current.source_event_timestamp_ms > eventTimestampMs
  ) {
    return json(200, { received: true, ignored: 'stale_event' })
  }

  const { error } = await admin.from('user_entitlements').upsert({
    user_id: userId,
    is_pro: isActive,
    product_id: typeof event.product_id === 'string' ? event.product_id : null,
    expires_at: expiresAt,
    source_event_id: eventId,
    source_event_timestamp_ms: eventTimestampMs,
    updated_at: new Date().toISOString(),
  })

  if (error) {
    console.error('RevenueCat entitlement update failed', error.message)
    return json(500, { error: 'Could not update entitlement' })
  }

  return json(200, { received: true })
})
