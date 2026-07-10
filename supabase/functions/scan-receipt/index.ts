import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { syncEntitlementFromRevenueCat } from '../_shared/entitlement.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

const MAX_BASE64_LENGTH = 7_000_000
const VALID_MEDIA_TYPES = new Set(['image/jpeg', 'image/png'])
const VALID_CURRENCIES = new Set(['USD', 'GBP', 'EUR', 'AED', 'INR', 'CAD', 'AUD', 'JPY'])
const VALID_CATEGORIES = new Set([
  'food_dining', 'transport', 'accommodation', 'equipment', 'software',
  'marketing', 'utilities', 'healthcare', 'entertainment', 'office', 'travel', 'other',
])

const SYSTEM_PROMPT = `You are a receipt scanner. Extract data from receipt images and return ONLY valid JSON with exactly these fields:
{
  "vendor": string or null,
  "amount": number (total amount paid, as a plain number like 12.99) or null,
  "date": string in YYYY-MM-DD format or null,
  "category": one of exactly these string values or null:
    "food_dining", "transport", "accommodation", "equipment", "software",
    "marketing", "utilities", "healthcare", "entertainment", "office", "travel", "other",
  "currency": one of exactly these ISO 4217 codes or null:
    "USD", "GBP", "EUR", "AED", "INR", "CAD", "AUD", "JPY"
}
Return only the raw JSON object. Use null for fields that cannot be determined.`

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const authorization = req.headers.get('authorization')
  const token = authorization?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) return json(401, { error: 'Authentication required' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) return json(500, { error: 'Server configuration error' })

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return json(401, { error: 'Invalid or expired session' })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  const base64 = body.base64
  const mediaType = body.mediaType ?? 'image/jpeg'
  if (
    typeof base64 !== 'string' ||
    base64.length === 0 ||
    base64.length > MAX_BASE64_LENGTH ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  ) {
    return json(400, { error: 'Image data is missing, invalid, or too large' })
  }
  if (typeof mediaType !== 'string' || !VALID_MEDIA_TYPES.has(mediaType)) {
    return json(400, { error: 'Unsupported image type' })
  }

  let { error: quotaError } = await supabase.rpc('consume_scan_quota')
  if (quotaError?.message.includes('SCAN_REQUIRES_PRO')) {
    // The webhook-written entitlement row may be missing or stale (purchase→
    // webhook latency, or a purchase that landed on an anonymous RC ID).
    // Verify directly with RevenueCat and retry once before rejecting.
    const synced = await syncEntitlementFromRevenueCat(user.id)
    if (synced) {
      const retry = await supabase.rpc('consume_scan_quota')
      quotaError = retry.error
    }
  }
  if (quotaError) {
    const limited = quotaError.message.includes('SCAN_RATE_LIMIT_REACHED')
    const requiresPro = quotaError.message.includes('SCAN_REQUIRES_PRO')
    return json(limited ? 429 : requiresPro ? 403 : 500, {
      error: limited
        ? 'Scan limit reached. Please try again later.'
        : requiresPro
          ? 'Keipr Pro is required to scan receipts.'
          : 'Could not authorize scan',
    })
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json(500, { error: 'Server configuration error' })

  let claudeRes: Response
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Extract the receipt data.' },
          ],
        }],
      }),
    })
  } catch (error) {
    console.error('Anthropic request failed', error instanceof Error ? error.message : String(error))
    return json(504, { error: 'Receipt scanning timed out' })
  }

  if (!claudeRes.ok) {
    console.error('Anthropic returned status', claudeRes.status)
    return json(502, { error: 'Receipt scanning service is temporarily unavailable' })
  }

  const payload = await claudeRes.json()
  const text = typeof payload?.content?.[0]?.text === 'string' ? payload.content[0].text : ''
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return json(502, { error: 'Receipt response could not be parsed' })

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return json(502, { error: 'Receipt response could not be parsed' })
  }

  const currency =
    typeof parsed.currency === 'string' && VALID_CURRENCIES.has(parsed.currency.toUpperCase())
      ? parsed.currency.toUpperCase()
      : null
  const category =
    typeof parsed.category === 'string' && VALID_CATEGORIES.has(parsed.category)
      ? parsed.category
      : null
  const date =
    typeof parsed.date === 'string' && isValidDate(parsed.date) ? parsed.date : null

  return json(200, {
    vendor:
      typeof parsed.vendor === 'string' && parsed.vendor.trim()
        ? parsed.vendor.trim().slice(0, 200)
        : null,
    amount:
      typeof parsed.amount === 'number' && Number.isFinite(parsed.amount) && parsed.amount > 0
        ? parsed.amount
        : null,
    date,
    category,
    currency,
  })
})
