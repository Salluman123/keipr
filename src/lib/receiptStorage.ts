import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from './supabase'

const BUCKET = 'receipts'

export async function uploadReceiptImage(uri: string, userId: string): Promise<string | null> {
  try {
    const isPng = uri.toLowerCase().split('?')[0].endsWith('.png')
    const extension = isPng ? 'png' : 'jpg'
    const contentType = isPng ? 'image/png' : 'image/jpeg'
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    const suffix = Math.random().toString(36).slice(2, 12)
    const path = `${userId}/${Date.now()}-${suffix}.${extension}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: false })

    if (error) throw error
    return path
  } catch {
    return null
  }
}

export function getReceiptPath(value?: string | null): string | null {
  if (!value) return null
  if (!/^https?:\/\//i.test(value)) return value

  const marker = `/storage/v1/object/public/${BUCKET}/`
  const markerIndex = value.indexOf(marker)
  if (markerIndex < 0) return null

  return decodeURIComponent(value.slice(markerIndex + marker.length).split('?')[0])
}

export async function createReceiptSignedUrl(
  receiptValue: string,
  expiresInSeconds = 300,
): Promise<string> {
  const path = getReceiptPath(receiptValue)
  if (!path) throw new Error('Invalid receipt path')

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}

export async function removeReceipt(receiptValue?: string | null): Promise<void> {
  const path = getReceiptPath(receiptValue)
  if (!path) return

  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

export async function removeAllReceipts(userId: string): Promise<void> {
  const paths: string[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(userId, { limit: 100, offset })
    if (error) throw error

    const page = (data ?? []).filter(item => item.id).map(item => `${userId}/${item.name}`)
    paths.push(...page)
    if ((data ?? []).length < 100) break
    offset += 100
  }

  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100))
    if (error) throw error
  }
}
