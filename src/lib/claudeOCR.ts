import * as FileSystem from 'expo-file-system/legacy'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { AnyCategoryId } from '../constants/categories'
import type { TransactionType, VatTreatment } from '../types'

export interface ExtractedReceipt {
  type: TransactionType | 'unrecognized'
  vendor: string | null
  amount: number | null
  date: string | null        // YYYY-MM-DD
  category: AnyCategoryId | null
  currency: string | null    // ISO 4217 code e.g. "USD", or null if undetectable
  // UAE VAT treatment detected from the receipt — only ever populated when
  // currency is "AED" (defaults to 'standard' if AED but not legible), null
  // for every other currency.
  vatTreatment: VatTreatment | null
  // Which of vendor/amount/category/date/currency/vatTreatment came back
  // null or fell back to a default rather than being actually read from the
  // receipt — drives the "please verify" UI on the review screen.
  uncertainFields: string[]
  needsConfirm: boolean      // true if a critical field couldn't be read, or type is unrecognized
}

export async function extractFromImage(
  imageUri: string,
  // Debug-only escape hatch (SettingsScreen's hidden __DEV__ tester) to force
  // the scan-receipt Edge Function's GLM A/B path. Omitted by every real call
  // site, which leaves the server to default to "claude" as before — purely
  // additive, no behavior change for normal scans.
  options?: { provider?: 'glm' },
): Promise<ExtractedReceipt> {
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const mediaType = imageUri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'

  // Call the Supabase Edge Function — the Anthropic API key never leaves the server.
  const { data, error } = await supabase.functions.invoke('scan-receipt', {
    body: { base64, mediaType, ...(options?.provider ? { provider: options.provider } : {}) },
  })

  if (error) {
    // supabase-js's FunctionsHttpError.message is always the generic "Edge
    // Function returned a non-2xx status code" — the specific message the
    // function actually returned (e.g. the free-scan-limit copy) lives in
    // the response body on error.context. Surface that instead when present.
    if (error instanceof FunctionsHttpError) {
      const serverMessage = await error.context
        .json()
        .then((body: { error?: unknown }) => (typeof body?.error === 'string' ? body.error : null))
        .catch(() => null)
      if (serverMessage) throw new Error(serverMessage)
    }
    throw new Error(`Edge Function error: ${error.message}`)
  }
  if (!data) throw new Error('No data returned from scan-receipt function')

  return data as ExtractedReceipt
}
