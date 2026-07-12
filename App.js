import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Purchases from 'react-native-purchases'
import AppNavigator from './src/navigation/AppNavigator'
import { useAuthStore } from './src/store/authStore'
import { usePurchaseStore } from './src/store/purchaseStore'
import { useExpenseStore } from './src/store/expenseStore'
import { getCurrencyRate, refreshExchangeRates } from './src/lib/currency'
import { hasProEntitlement } from './src/lib/entitlements'

export default function App() {
  const initialize = useAuthStore((state) => state.initialize)
  const checkSubscription = usePurchaseStore((state) => state.checkSubscription)

  useEffect(() => {
    const boot = async () => {
      try {
        Purchases.configure({ apiKey: process.env.EXPO_PUBLIC_RC_API_KEY })
        // Real-time entitlement updates — covers delayed sandbox activations and
        // any server-side subscription changes without requiring an app restart.
        Purchases.addCustomerInfoUpdateListener((info) => {
          usePurchaseStore.setState({ isPro: hasProEntitlement(info.entitlements.active) })
        })
      } catch {}
      try { await initialize() } catch {}
      try { await checkSubscription() } catch {}
      try {
        await refreshExchangeRates()
        const { currency } = useExpenseStore.getState()
        useExpenseStore.setState({ currencyRate: getCurrencyRate(currency) })
      } catch {}
    }
    boot()
  }, [])

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#0D0D14" />
      <AppNavigator />
    </SafeAreaProvider>
  )
}
