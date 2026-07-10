import 'react-native-url-polyfill/auto'
import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'

// expo-secure-store adapter — silently swallows errors so storage failures
// never crash the app or leave the loading spinner stuck.
const ExpoSecureStoreAdapter = {
  getItem: (key: string): Promise<string | null> =>
    SecureStore.getItemAsync(key).catch(() => null),

  setItem: (key: string, value: string): Promise<void> =>
    SecureStore.setItemAsync(key, value).catch(() => {}),

  removeItem: (key: string): Promise<void> =>
    SecureStore.deleteItemAsync(key).catch(() => {}),
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

// createClient() throws synchronously on a falsy url/key — at import time, before
// any try/catch in App.js can run — which would crash the entire app on launch.
// Fall back to placeholders so the app boots; calls will fail gracefully instead
// (already handled by try/catch in every store that talks to Supabase).
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY — check eas.json env vars for this build/update.')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
)
