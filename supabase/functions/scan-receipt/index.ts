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
const VALID_TYPES = new Set(['expense', 'income', 'unrecognized'])
const EXPENSE_CATEGORIES = new Set([
  'groceries', 'food_dining', 'transport', 'accommodation', 'equipment', 'software',
  'marketing', 'utilities', 'healthcare', 'entertainment', 'office', 'travel', 'other',
])
const INCOME_CATEGORIES = new Set([
  'salary', 'client_payment', 'refund', 'investment', 'other_income',
])
const VAT_TREATMENTS = new Set(['standard', 'zero_rated', 'exempt'])

// Shared between both providers — the field semantics are identical whether
// the model is looking at the image itself (Claude's vision path) or at OCR
// text lifted from it (the GLM path's second, text-only extraction step).
// Only the framing sentence before this differs per provider.
const FIELD_SCHEMA_INSTRUCTIONS = `Return ONLY valid JSON with exactly these fields:
{
  "type": one of exactly "expense", "income", or "unrecognized" —
    "expense" for a purchase receipt or bill,
    "income" for a deposit slip, cheque, invoice paid to the user, or payment confirmation,
    "unrecognized" if the image is not a financial document or its type cannot be determined,
  "vendor": string or null — the merchant/business name for an expense, or the payer/source
    name (e.g. client, employer, bank) for income,
  "amount": number (total amount, as a plain number like 12.99) or null,
  "date": string in YYYY-MM-DD format or null,
  "category": one of exactly these string values or null — pick from the expense list only
    when type is "expense", and from the income list only when type is "income":
    expense: "groceries", "food_dining", "transport", "accommodation", "equipment", "software",
      "marketing", "utilities", "healthcare", "entertainment", "office", "travel", "other"
    income: "salary", "client_payment", "refund", "investment", "other_income"

  Category guidance for expenses (read the merchant name and line items carefully —
  do not default to "other" just because you're unsure; make your best specific guess):
  - "groceries" is for supermarkets, hypermarkets, grocery/convenience stores, and
    markets selling food or household items to take home and prepare — merchant names
    containing words like "Supermarket", "Hypermarket", "Mart", "Grocery", "Market",
    "Foods" typically belong here, NOT "food_dining".
  - "food_dining" is for restaurants, cafes, bars, diners, bakeries, and takeout/delivery
    of prepared food eaten on the spot or brought home ready to eat — merchant names
    containing words like "Restaurant", "Cafe", "Coffee", "Grill", "Bistro", "Kitchen",
    "Bar", "Diner", "Pizzeria" typically belong here.
  - Use "other" only when the merchant and line items genuinely don't fit any of the
    more specific categories above (groceries, food_dining, transport, accommodation,
    equipment, software, marketing, utilities, healthcare, entertainment, office, travel).
  "currency": one of exactly these ISO 4217 codes or null:
    "USD", "GBP", "EUR", "AED", "INR", "CAD", "AUD", "JPY"
  "vatTreatment": one of exactly "standard", "zero_rated", "exempt", or null —
    ONLY relevant when currency is "AED" (UAE Dirhams). Read the receipt for a
    stated VAT rate or treatment (e.g. "VAT 5%", "Incl. VAT", "Tax Invoice",
    "Zero-Rated", "VAT Exempt", "Out of Scope") and classify accordingly:
    "standard" for the normal 5% UAE VAT rate, "zero_rated" for goods/services
    explicitly marked zero-rated, "exempt" for those explicitly marked exempt.
    If currency is "AED" but no VAT information is legible on the receipt,
    return "standard" (the default rate for most UAE purchases). If currency
    is anything other than "AED", always return null for this field.
}
Return only the raw JSON object. Use null for fields that cannot be determined.`

const SYSTEM_PROMPT_VISION = `You are a financial document scanner for a bookkeeping app. Look at the image and ${FIELD_SCHEMA_INSTRUCTIONS}`

// Text-only variant for the GLM pipeline's second step — same fields, fed
// OCR output instead of the image itself.
const SYSTEM_PROMPT_TEXT = `You are a financial document scanner for a bookkeeping app. You will be given raw OCR text extracted from a scanned receipt or financial document (it may include Markdown formatting, tables, or OCR noise — work with it as best you can). ${FIELD_SCHEMA_INSTRUCTIONS}`

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

// Best-effort — if the refund itself fails, the user just keeps the
// consumed scan; never let that failure mask or replace the response we're
// already returning for the actual scan attempt.
async function refundScan(supabase: ReturnType<typeof createClient>, scanId: number | null) {
  if (scanId == null) return
  try {
    await supabase.rpc('refund_scan', { scan_id: scanId })
  } catch (error) {
    console.error('Scan refund failed', error instanceof Error ? error.message : String(error))
  }
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

interface NormalizedResult {
  type: 'expense' | 'income' | 'unrecognized'
  vendor: string | null
  amount: number | null
  date: string | null
  category: string | null
  currency: string | null
  vatTreatment: 'standard' | 'zero_rated' | 'exempt' | null
  uncertainFields: string[]
  needsConfirm: boolean
}

// Shared by both providers — validates/defaults whatever raw JSON the model
// returned (regardless of whether it came from Claude reading the image
// directly, or Claude reading GLM-OCR's extracted text) into the exact same
// shape the app expects. Keeping this in one place means the two paths can
// never silently drift apart on validation rules.
function normalizeParsedResult(parsed: Record<string, unknown>): NormalizedResult {
  const type =
    typeof parsed.type === 'string' && VALID_TYPES.has(parsed.type)
      ? parsed.type as 'expense' | 'income' | 'unrecognized'
      : 'unrecognized'
  const currency =
    typeof parsed.currency === 'string' && VALID_CURRENCIES.has(parsed.currency.toUpperCase())
      ? parsed.currency.toUpperCase()
      : null
  const validCategoriesForType = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const category =
    typeof parsed.category === 'string' && validCategoriesForType.has(parsed.category)
      ? parsed.category
      : null
  const date =
    typeof parsed.date === 'string' && isValidDate(parsed.date) ? parsed.date : null
  const vendor =
    typeof parsed.vendor === 'string' && parsed.vendor.trim()
      ? parsed.vendor.trim().slice(0, 200)
      : null
  const amount =
    typeof parsed.amount === 'number' && Number.isFinite(parsed.amount) && parsed.amount > 0
      ? parsed.amount
      : null
  // UAE-only field — enforced regardless of what the model returns, so a
  // non-AED receipt can never carry a VAT treatment. When currency is AED
  // and the model didn't return a valid value, default to "standard" per
  // the prompt's own instruction (belt-and-braces in case the model omits
  // it despite being told to default) — tracked separately so that
  // defaulted-not-detected case can be flagged as uncertain below, distinct
  // from the "not AED, field doesn't apply" case which isn't.
  let vatTreatment: 'standard' | 'zero_rated' | 'exempt' | null
  let vatTreatmentDefaulted = false
  if (currency !== 'AED') {
    vatTreatment = null
  } else if (typeof parsed.vatTreatment === 'string' && VAT_TREATMENTS.has(parsed.vatTreatment)) {
    vatTreatment = parsed.vatTreatment as 'standard' | 'zero_rated' | 'exempt'
  } else {
    vatTreatment = 'standard'
    vatTreatmentDefaulted = true
  }

  // Deliberately not a self-reported confidence score — an LLM self-rating
  // its own confidence is known to be poorly calibrated. Instead this is
  // built from the same deterministic, validated signal the fields above
  // already produce: a field lands here when the model returned nothing
  // usable (null) or the response fell back to a default rather than an
  // actually-read value (currently only vatTreatment can do that).
  const uncertainFields: string[] = []
  if (vendor === null) uncertainFields.push('vendor')
  if (amount === null) uncertainFields.push('amount')
  if (category === null) uncertainFields.push('category')
  if (date === null) uncertainFields.push('date')
  if (currency === null) uncertainFields.push('currency')
  if (vatTreatmentDefaulted) uncertainFields.push('vatTreatment')

  // Kept for backward compatibility (gates ScanScreen's Quick Capture vs.
  // review-screen routing) — derived from uncertainFields rather than its
  // own separate null checks, plus the unrecognized-type case which isn't a
  // "field" so isn't part of that array. Only vendor/amount/category force
  // review; date/currency/vatTreatment uncertainty alone does not.
  const needsConfirm =
    type === 'unrecognized' ||
    uncertainFields.includes('vendor') ||
    uncertainFields.includes('amount') ||
    uncertainFields.includes('category')

  return { type, vendor, amount, date, category, currency, vatTreatment, uncertainFields, needsConfirm }
}

/** Extracts the `{...}` JSON object Claude returned as text, tolerating ```json fences. */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

type ProviderResult =
  | { ok: true; parsed: Record<string, unknown> }
  | { ok: false; status: number; error: string }

// ── Provider: Claude (existing path — unchanged behavior) ──────────────────
async function runClaudeProvider(apiKey: string, mediaType: string, base64: string): Promise<ProviderResult> {
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
        system: SYSTEM_PROMPT_VISION,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Classify and extract the document data.' },
          ],
        }],
      }),
    })
  } catch (error) {
    console.error('Anthropic request failed', error instanceof Error ? error.message : String(error))
    return { ok: false, status: 504, error: 'Receipt scanning timed out' }
  }

  if (!claudeRes.ok) {
    console.error('Anthropic returned status', claudeRes.status)
    return { ok: false, status: 502, error: 'Receipt scanning service is temporarily unavailable' }
  }

  const payload = await claudeRes.json()
  const text = typeof payload?.content?.[0]?.text === 'string' ? payload.content[0].text : ''
  const parsed = extractJsonObject(text)
  if (!parsed) return { ok: false, status: 502, error: 'Receipt response could not be parsed' }
  return { ok: true, parsed }
}

// ── Provider: GLM (Zhipu/Z.ai GLM-OCR) — A/B test path, additive only ──────
//
// GLM-OCR (layout_parsing) is a document-layout endpoint, not a chat model —
// it returns raw text/Markdown, no structured schema. So this is a two-step
// pipeline: (a) GLM-OCR turns the image into text, (b) a cheap Claude Haiku
// call turns that text into the same structured fields the vision path
// produces directly. Both steps' output feeds the same normalizeParsedResult()
// as the Claude path, so downstream behavior (validation, uncertainFields,
// needsConfirm, refund-on-unrecognized) is identical regardless of provider.
//
// IMPORTANT — unverified request/response shape: I don't have access to
// Zhipu/Z.ai's actual layout_parsing API reference (it's not covered by any
// documentation source available while writing this, and it's a newer,
// specialized endpoint distinct from their chat-completions API). The
// request body and response-field guesses below are best-effort, not
// confirmed. Test against a real GLM_API_KEY and adjust
// requestBody/candidate response fields in step (a) if it 400s or the
// extracted text comes back empty — the raw response is logged either way
// to make that fast.
async function callGlmOcr(apiKey: string, mediaType: string, base64: string): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  let res: Response
  try {
    res = await fetch('https://api.z.ai/api/paas/v4/layout_parsing', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      // Best-effort shape — see the function-level comment above.
      body: JSON.stringify({
        model: 'glm-ocr',
        file: `data:${mediaType};base64,${base64}`,
      }),
    })
  } catch (error) {
    console.error('GLM-OCR request failed', error instanceof Error ? error.message : String(error))
    return { ok: false, status: 504, error: 'GLM-OCR request timed out' }
  }

  const rawBody = await res.text()
  if (!res.ok) {
    console.error('GLM-OCR returned status', res.status, rawBody.slice(0, 1000))
    return { ok: false, status: 502, error: 'GLM-OCR service is temporarily unavailable' }
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    console.error('GLM-OCR response was not JSON', rawBody.slice(0, 1000))
    return { ok: false, status: 502, error: 'GLM-OCR response could not be parsed' }
  }

  // Trying the most plausible field names for the extracted text/Markdown —
  // see the "unverified" note above. Logs the raw shape if none match.
  const extractedText: string | null =
    (typeof payload?.text === 'string' && payload.text) ||
    (typeof payload?.content === 'string' && payload.content) ||
    (typeof payload?.markdown === 'string' && payload.markdown) ||
    (typeof payload?.result === 'string' && payload.result) ||
    (typeof payload?.result?.markdown === 'string' && payload.result.markdown) ||
    (typeof payload?.result?.text === 'string' && payload.result.text) ||
    (typeof payload?.data?.text === 'string' && payload.data.text) ||
    null

  if (!extractedText) {
    console.error('GLM-OCR response shape not recognized', JSON.stringify(payload).slice(0, 1000))
    return { ok: false, status: 502, error: 'GLM-OCR response could not be parsed' }
  }

  return { ok: true, text: extractedText }
}

async function extractFieldsFromText(anthropicApiKey: string, ocrText: string): Promise<ProviderResult> {
  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // Cheap, text-only extraction — this step just structures text GLM-OCR
        // already produced, it doesn't need vision or heavy reasoning.
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        system: SYSTEM_PROMPT_TEXT,
        messages: [{
          role: 'user',
          content: `Here is the OCR text extracted from the document:\n\n${ocrText}\n\nExtract the structured data as instructed.`,
        }],
      }),
    })
  } catch (error) {
    console.error('GLM pipeline: extraction request failed', error instanceof Error ? error.message : String(error))
    return { ok: false, status: 504, error: 'Receipt scanning timed out' }
  }

  if (!res.ok) {
    console.error('GLM pipeline: extraction step returned status', res.status)
    return { ok: false, status: 502, error: 'Receipt scanning service is temporarily unavailable' }
  }

  const payload = await res.json()
  const text = typeof payload?.content?.[0]?.text === 'string' ? payload.content[0].text : ''
  const parsed = extractJsonObject(text)
  if (!parsed) return { ok: false, status: 502, error: 'Receipt response could not be parsed' }
  return { ok: true, parsed }
}

async function runGlmProvider(glmApiKey: string, anthropicApiKey: string, mediaType: string, base64: string): Promise<ProviderResult> {
  const ocrResult = await callGlmOcr(glmApiKey, mediaType, base64)
  if (!ocrResult.ok) return ocrResult
  return await extractFieldsFromText(anthropicApiKey, ocrResult.text)
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

  // Provider selection. An explicit "provider" in the request body (e.g. the
  // Settings debug button's "glm") always wins — that's the per-request A/B
  // override and still works exactly as before. When the client sends
  // nothing (all real app traffic today), fall back to DEFAULT_SCAN_PROVIDER
  // — a Supabase secret, not a code change, so which provider real users hit
  // can be flipped/rolled back instantly without an app release. Missing or
  // invalid DEFAULT_SCAN_PROVIDER falls back to "claude" as the safe default.
  const defaultProvider = Deno.env.get('DEFAULT_SCAN_PROVIDER') === 'glm' ? 'glm' : 'claude'
  const provider =
    body.provider === 'glm' || body.provider === 'claude' ? body.provider : defaultProvider

  let { data: scanId, error: quotaError } = await supabase.rpc('consume_scan_quota')
  if (
    quotaError?.message.includes('SCAN_REQUIRES_PRO') ||
    quotaError?.message.includes('SCAN_FREE_LIMIT_REACHED')
  ) {
    // The webhook-written entitlement row may be missing or stale (purchase→
    // webhook latency, or a purchase that landed on an anonymous RC ID).
    // SCAN_FREE_LIMIT_REACHED is the realistic trigger for this now that
    // non-Pro callers get a free monthly allowance instead of an immediate
    // SCAN_REQUIRES_PRO (kept above only for defense) — without this, a user
    // who just subscribed could burn their free scans before ever being
    // recognized as Pro. Verify directly with RevenueCat and retry once
    // before rejecting.
    const synced = await syncEntitlementFromRevenueCat(user.id)
    if (synced) {
      const retry = await supabase.rpc('consume_scan_quota')
      quotaError = retry.error
      scanId = retry.data
    }
  }
  if (quotaError) {
    const limited = quotaError.message.includes('SCAN_RATE_LIMIT_REACHED')
    const requiresPro = quotaError.message.includes('SCAN_REQUIRES_PRO')
    const freeLimitReached = quotaError.message.includes('SCAN_FREE_LIMIT_REACHED')
    return json(limited ? 429 : requiresPro || freeLimitReached ? 403 : 500, {
      error: limited
        ? 'Scan limit reached. Please try again later.'
        : requiresPro
          ? 'Keipr Pro is required to scan receipts.'
          : freeLimitReached
            ? "You've used your 5 free scans this month — upgrade to Keipr Pro for unlimited scanning."
            : 'Could not authorize scan',
    })
  }

  let providerResult: ProviderResult
  if (provider === 'glm') {
    const glmApiKey = Deno.env.get('GLM_API_KEY')
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!glmApiKey || !anthropicApiKey) {
      await refundScan(supabase, scanId)
      return json(500, { error: 'Server configuration error' })
    }
    providerResult = await runGlmProvider(glmApiKey, anthropicApiKey, mediaType, base64)
  } else {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      await refundScan(supabase, scanId)
      return json(500, { error: 'Server configuration error' })
    }
    providerResult = await runClaudeProvider(apiKey, mediaType, base64)
  }

  if (!providerResult.ok) {
    // Quota was already consumed above for this attempt, but nothing came
    // back at all — refund it rather than charging the user's free-tier
    // count (or Pro's rate-limit window) for a service failure that wasn't
    // their doing.
    await refundScan(supabase, scanId)
    return json(providerResult.status, { error: providerResult.error })
  }

  const normalized = normalizeParsedResult(providerResult.parsed)

  // The whole point of the scan — was this even a financial document? — came
  // back negative. That's not a usable result, so it shouldn't cost the user
  // one of their free scans (or count against Pro's rate-limit window)
  // either. A recognized type with some uncertain fields (vendor/amount/
  // category still null) still counts — the OCR call did produce real,
  // partially-usable output there, just one that needs a human to fill in
  // the gaps, which is a different thing from "not a receipt at all."
  if (normalized.type === 'unrecognized') {
    await refundScan(supabase, scanId)
  }

  return json(200, { ...normalized, provider })
})
