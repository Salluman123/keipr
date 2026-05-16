import { create } from 'zustand'
import Purchases, { PurchasesPackage } from 'react-native-purchases'

interface PurchaseStore {
  isPro: boolean
  loading: boolean
  checkSubscription: () => Promise<void>
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>
  restorePurchases: () => Promise<void>
}

export const usePurchaseStore = create<PurchaseStore>((set) => ({
  isPro: false,
  loading: false,

  checkSubscription: async () => {
    try {
      const info = await Purchases.getCustomerInfo()
      set({ isPro: 'pro' in info.entitlements.active })
    } catch {
      // silently remain free tier
    }
  },

  purchasePackage: async (pkg: PurchasesPackage): Promise<boolean> => {
    set({ loading: true })
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg)
      const isPro = 'pro' in customerInfo.entitlements.active
      set({ isPro })
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
      set({ isPro: 'pro' in info.entitlements.active })
    } catch {
      throw new Error('Could not restore purchases.')
    } finally {
      set({ loading: false })
    }
  },
}))
