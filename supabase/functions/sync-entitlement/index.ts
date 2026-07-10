import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { syncEntitlementFromRevenueCat } from '../_shared/entitlement.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

// Called by the app immediately after a successful purchase or restore so the
// server-side entitlement row exists before the user's first scan, instead of
// waiting on the RevenueCat webhook.
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

  const isPro = await syncEntitlementFromRevenueCat(user.id)
  return json(200, { isPro })
})
