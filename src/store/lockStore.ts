import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import type { AppStateStatus } from 'react-native'

const BIOMETRIC_LOCK_KEY = 'keipr_biometric_lock'
// Only re-prompt after this much time in the background — brief interruptions
// (a notification, switching to another app to copy a value) shouldn't force
// a re-auth every time.
const IDLE_LOCK_MS = 30_000

type LocalAuthenticationModule = typeof import('expo-local-authentication')

let cachedLocalAuth: LocalAuthenticationModule | null = null

// expo-local-authentication resolves its native module eagerly (and throws) as
// a side effect of import, not on first call — a static top-level import can
// crash the app before any try/catch around a later call site would run.
// Deferring the require to here keeps that resolution attempt inside a guard,
// and lets a later call retry if the native module wasn't registered yet at
// startup. Only the success is cached — a failure isn't, so the next call
// gets another chance.
function getLocalAuthentication(): LocalAuthenticationModule | null {
  if (cachedLocalAuth) return cachedLocalAuth
  try {
    cachedLocalAuth = require('expo-local-authentication') as LocalAuthenticationModule
    return cachedLocalAuth
  } catch {
    return null
  }
}

interface LockStore {
  hydrated: boolean
  biometricEnabled: boolean
  biometricAvailable: boolean
  isLocked: boolean
  backgroundedAt: number | null
  checkBiometricAvailability: () => Promise<boolean>
  setBiometricEnabled: (enabled: boolean) => Promise<void>
  authenticate: () => Promise<boolean>
  handleAppStateChange: (nextState: AppStateStatus) => void
}

export const useLockStore = create<LockStore>((set, get) => {
  SecureStore.getItemAsync(BIOMETRIC_LOCK_KEY)
    .then((v) => {
      const enabled = v === 'true'
      // Cold start: if the user has this on, require auth before the app is usable.
      set({ biometricEnabled: enabled, isLocked: enabled, hydrated: true })
    })
    .catch(() => set({ hydrated: true }))

  return {
    hydrated: false,
    biometricEnabled: false,
    biometricAvailable: true,
    isLocked: false,
    backgroundedAt: null,

    checkBiometricAvailability: async () => {
      const LocalAuthentication = getLocalAuthentication()
      if (!LocalAuthentication) {
        set({ biometricAvailable: false })
        return false
      }
      try {
        // getEnrolledLevelAsync covers both Face/Touch ID and device-passcode-only
        // setups, since authenticateAsync can fall back to the passcode either way.
        const level = await LocalAuthentication.getEnrolledLevelAsync()
        const available = level !== LocalAuthentication.SecurityLevel.NONE
        set({ biometricAvailable: available })
        return available
      } catch {
        set({ biometricAvailable: false })
        return false
      }
    },

    setBiometricEnabled: async (enabled) => {
      set({ biometricEnabled: enabled, isLocked: false })
      SecureStore.setItemAsync(BIOMETRIC_LOCK_KEY, enabled ? 'true' : 'false').catch(() => {})
    },

    authenticate: async () => {
      const LocalAuthentication = getLocalAuthentication()
      if (!LocalAuthentication) return false
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock Keipr',
          cancelLabel: 'Cancel',
          disableDeviceFallback: false,
        })
        if (result.success) {
          set({ isLocked: false })
          return true
        }
        return false
      } catch {
        return false
      }
    },

    handleAppStateChange: (nextState) => {
      if (!get().biometricEnabled) return

      if (nextState === 'active') {
        const { backgroundedAt } = get()
        if (backgroundedAt !== null && Date.now() - backgroundedAt >= IDLE_LOCK_MS) {
          set({ isLocked: true })
        }
        set({ backgroundedAt: null })
      } else if (get().backgroundedAt === null) {
        // Covers both 'background' and the brief 'inactive' transition on iOS.
        set({ backgroundedAt: Date.now() })
      }
    },
  }
})
