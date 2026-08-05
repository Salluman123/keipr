import { create } from 'zustand'
import * as AppleAuthentication from 'expo-apple-authentication'
import { supabase } from '../lib/supabase'
import { usePurchaseStore } from './purchaseStore'
import { useExpenseStore } from './expenseStore'
import type { AuthStore, AccountType } from '../types'

type PurchasesModule = typeof import('react-native-purchases')['default']

let cachedPurchases: PurchasesModule | null = null

// react-native-purchases resolves its native module at import time — deferring
// the require here keeps that resolution attempt inside a guard instead of
// ahead of one, same pattern as purchaseStore.ts/App.js. Only the success is
// cached — a failure isn't, so the next call gets another chance.
function getPurchases(): PurchasesModule | null {
  if (cachedPurchases) return cachedPurchases
  try {
    cachedPurchases = require('react-native-purchases').default as PurchasesModule
    return cachedPurchases
  } catch {
    return null
  }
}

async function rcLogIn(userId: string) {
  const ts = new Date().toISOString()
  const Purchases = getPurchases()
  if (!Purchases) {
    usePurchaseStore.setState({
      rcDiag: { supabaseId: userId, rcUserId: null, isAnonymous: null, logInError: 'react-native-purchases unavailable', ts },
    })
    return
  }
  try {
    const { customerInfo, created } = await Purchases.logIn(userId)
    const rcUserId = customerInfo.originalAppUserId
    console.log('[Keipr] RC logIn — userId:', userId, '| RC userId:', rcUserId, '| new:', created)
    console.log('[Keipr] RC logIn — entitlements.active:', JSON.stringify(customerInfo.entitlements.active))
    usePurchaseStore.setState({
      rcDiag: { supabaseId: userId, rcUserId, isAnonymous: rcUserId.startsWith('$RCAnonymousID'), logInError: null, ts },
    })
  } catch (e) {
    const msg = String(e)
    console.log('[Keipr] RC logIn failed:', msg)
    usePurchaseStore.setState({
      rcDiag: { supabaseId: userId, rcUserId: null, isAnonymous: null, logInError: msg, ts },
    })
  }
}

async function rcLogOut() {
  const Purchases = getPurchases()
  if (!Purchases) return
  try {
    await Purchases.logOut()
    console.log('[Keipr] RC logOut — reverted to anonymous identity')
  } catch (e) {
    console.log('[Keipr] RC logOut failed:', String(e))
  }
}

export const useAuthStore = create<AuthStore>((set) => {
  // SIGNED_IN fires on fresh logins (email/password, Apple, token refresh after restore).
  // INITIAL_SESSION fires at import time — before Purchases.configure() has run — so we
  // intentionally skip it here and handle session restore in initialize() instead.
  supabase.auth.onAuthStateChange((event, session) => {
    set({
      session,
      user: session?.user ?? null,
      loading: false,
    })
    if (event === 'SIGNED_IN' && session?.user?.id) {
      rcLogIn(session.user.id)
    }
    if (event === 'SIGNED_OUT') {
      rcLogOut()
      // Clear per-user state so the next account never sees this account's data.
      usePurchaseStore.setState({ isPro: false })
      useExpenseStore.setState({
        expenses: [],
        totalIncome: 0,
        totalExpenses: 0,
        monthChangePercent: null,
        lastFetchParams: null,
        fetchError: false,
      })
    }
  })

  return {
    user: null,
    session: null,
    loading: true,

    initialize: async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        set({ session, user: session?.user ?? null, loading: false })
        // Identify the user with RevenueCat before any entitlement check runs.
        // RC automatically aliases any anonymous purchases made on this device to
        // the identified user when logIn() is called for the first time.
        if (session?.user?.id) {
          await rcLogIn(session.user.id)
        }
      } catch {
        set({ loading: false })
      }
    },

    signIn: async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      // onAuthStateChange SIGNED_IN will call rcLogIn automatically.
    },

    signUp: async (email: string, password: string, fullName: string, accountType: AccountType) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, account_type: accountType },
        },
      })
      if (error) throw error
      // With "Confirm email" enabled in Supabase, signUp succeeds but returns no
      // session — the user must click the emailed link before they can sign in.
      // Report that so the screen can show a "check your email" state instead of
      // silently doing nothing.
      return !data.session
    },

    signOut: async () => {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      // onAuthStateChange SIGNED_OUT will call rcLogOut automatically.
    },

    resetPassword: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'keipr://reset-password',
      })
      if (error) throw error
    },

    signInWithApple: async () => {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })
      if (!credential.identityToken) throw new Error('Apple sign in failed: no identity token returned.')
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      })
      if (error) throw error
      // onAuthStateChange SIGNED_IN will call rcLogIn automatically.
    },
  }
})
