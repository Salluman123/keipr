import * as FileSystem from 'expo-file-system/legacy'
import type { CategoryId } from '../constants/categories'
import { getCurrencyRate } from './currency'

const VALID_CURRENCIES = ['USD', 'GBP', 'EUR', 'AED', 'INR', 'CAD', 'AUD', 'JPY']

// ⚠️  API key is embedded client-side for prototyping only.
// Move this call to a Supabase Edge Function before shipping to production.
const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? ''

export interface ExtractedReceipt {
  vendor: string | null
  amount: number | null
  date: string | null        // YYYY-MM-DD
  category: CategoryId | null
  currency: string | null    // ISO 4217 code e.g. "USD", or null if undetectable
}

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
Rules:
- vendor: the business or store name only, no address
- amount: the final total the customer paid, not subtotals or tax lines individually
- date: the transaction date, not print date
- category: pick the best match from the list
- currency: detect from currency symbols ($ £ € ₹ ¥ etc.), explicit currency codes, or country context inferred from the vendor/address. Use null only if truly undetectable.
If a field cannot be determined, use null.
Return ONLY the raw JSON object — no markdown fences, no explanation, nothing else.`

export async function extractFromImage(imageUri: string): Promise<ExtractedReceipt> {
  if (!API_KEY) throw new Error('EXPO_PUBLIC_ANTHROPIC_API_KEY is not set in .env')

  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const mediaType = imageUri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'

  const requestBody = {
    model: 'claude-sonnet-4-5',
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          { type: 'text', text: 'Extract the receipt data.' },
        ],
      },
    ],
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Claude API error ${response.status}: ${body}`)
  }

  const payload = await response.json()
  const text: string = payload?.content?.[0]?.text ?? ''

  // Strip markdown code fences if present
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`Unexpected Claude response: ${text.slice(0, 120)}`)

  const parsed = JSON.parse(match[0])

  const detectedCurrency =
    typeof parsed.currency === 'string' && VALID_CURRENCIES.includes(parsed.currency.toUpperCase())
      ? parsed.currency.toUpperCase()
      : null

  return {
    vendor: typeof parsed.vendor === 'string' && parsed.vendor ? parsed.vendor : null,
    amount: typeof parsed.amount === 'number' && parsed.amount > 0 ? parsed.amount : null,
    date: typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
    category: parsed.category ?? null,
    currency: detectedCurrency,
  }
}
