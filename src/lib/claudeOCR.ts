import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from './supabase'
import type { AnyCategoryId } from '../constants/categories'
import type { TransactionType } from '../types'

export interface ExtractedReceipt {
  type: TransactionType | 'unrecognized'
  vendor: string | null
  amount: number | null
  date: string | null        // YYYY-MM-DD
  category: AnyCategoryId | null
  currency: string | null    // ISO 4217 code e.g. "USD", or null if undetectable
  needsConfirm: boolean      // true if a critical field couldn't be read, or type is unrecognized
}

export async function extractFromImage(imageUri: string): Promise<ExtractedReceipt> {
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const mediaType = imageUri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'

  // Call the Supabase Edge Function — the Anthropic API key never leaves the server.
  const { data, error } = await supabase.functions.invoke('scan-receipt', {
    body: { base64, mediaType },
  })

  if (error) throw new Error(`Edge Function error: ${error.message}`)
  if (!data) throw new Error('No data returned from scan-receipt function')

  return data as ExtractedReceipt
}
