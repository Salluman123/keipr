import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { AuthStore, AccountType } from '../types'

export const useAuthStore = create<AuthStore>((set) => {
  supabase.auth.onAuthStateChange((_event, session) => {
    set({
      session,
      user: session?.user ?? null,
      loading: false,
    })
  })

  return {
    user: null,
    session: null,
    loading: true,

    initialize: async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        set({ session, user: session?.user ?? null, loading: false })
      } catch {
        set({ loading: false })
      }
    },

    signIn: async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },

    signUp: async (email: string, password: string, fullName: string, accountType: AccountType) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, account_type: accountType },
        },
      })
      if (error) throw error
    },

    signOut: async () => {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },

    resetPassword: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'keipr://reset-password',
      })
      if (error) throw error
    },
  }
})
