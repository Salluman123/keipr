import { create } from 'zustand'
import Purchases, { PurchasesPackage } from 'react-native-purchases'
import { supabase } from '../lib/supabase'

// Push the entitlement to the server right away so scan/expense gates unlock
// without waiting for the RevenueCat webhook. Fire-and-forget: the scan-receipt
// function also self-heals, so a failure here is not fatal.
function syncServerEntitlement() {
  supabase.functions.invoke('sync-entitlement').catch(() => {})
}

export interface RcDiag {
  supabaseId: string | null
  rcUserId: string | null
  isAnonymous: boolean | null
  logInError: string | null
  ts: string | null
}

interface PurchaseStore {
  isPro: boolean
  loading: boolean
  rcDiag: RcDiag
  checkSubscription: () => Promise<void>
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>
  restorePurchases: () => Promise<void>
}

export const usePurchaseStore = create<PurchaseStore>((set) => ({
  isPro: false,
  loading: false,
  rcDiag: { supabaseId: null, rcUserId: null, isAnonymous: null, logInError: null, ts: null },

  checkSubscription: async () => {
    try {
      const info = await Purchases.getCustomerInfo()
      const active = info.entitlements.active
      console.log('[Keipr] checkSubscription — entitlements.active:', JSON.stringify(active))
      const isPro = 'get.keipr Pro' in active
      console.log('[Keipr] checkSubscription — isPro:', isPro)
      set({ isPro })
    } catch (e) {
      console.log('[Keipr] checkSubscription — error:', String(e))
    }
  },

  purchasePackage: async (pkg: PurchasesPackage): Promise<boolean> => {
    set({ loading: true })
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg)
      const active = customerInfo.entitlements.active
      console.log('[Keipr] purchasePackage — entitlements.active:', JSON.stringify(active))
      const isPro = 'get.keipr Pro' in active
      console.log('[Keipr] purchasePackage — isPro:', isPro)
      set({ isPro })
      if (isPro) syncServerEntitlement()
      return isPro
    } catch (e: any) {
      if (e?.userCancelled) return false
      throw e
    } finally {
      set({ loading: false })
    }
  },

  restorePurchases: async () => {
    set({ loading: true })
    try {
      const info = await Purchases.restorePurchases()
      const active = info.entitlements.active
      console.log('[Keipr] restorePurchases — entitlement keys:', Object.keys(active))
      console.log('[Keipr] restorePurchases — full active:', JSON.stringify(active))
      const isPro = 'get.keipr Pro' in active
      console.log('[Keipr] restorePurchases — isPro:', isPro)
      set({ isPro })
      if (isPro) syncServerEntitlement()
      // Treat a key mismatch as a failure — "Restored" must not show unless isPro is actually true.
      if (!isPro) throw new Error('NO_ENTITLEMENT')
    } catch (e: any) {
      if (e?.message === 'NO_ENTITLEMENT') {
        throw new Error('No active Keipr Pro subscription was found for this account.')
      }
      throw new Error('Could not restore purchases.')
    } finally {
      set({ loading: false })
    }
  },
}))
