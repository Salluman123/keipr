import { useEffect } from 'react'
import { AppState } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Purchases from 'react-native-purchases'
import * as QuickActions from 'expo-quick-actions'
import AppNavigator from './src/navigation/AppNavigator'
import { useAuthStore } from './src/store/authStore'
import { usePurchaseStore } from './src/store/purchaseStore'
import { useExpenseStore } from './src/store/expenseStore'
import { useLockStore } from './src/store/lockStore'
import { getCurrencyRate, refreshExchangeRates } from './src/lib/currency'
import { hasProEntitlement } from './src/lib/entitlements'

// expo-notifications resolves its native module eagerly (and throws) as a side
// effect of import, not on first call — a static top-level import can crash the
// app before this try/catch would ever run. Deferring the require to here keeps
// that resolution attempt inside the guard instead of ahead of it.
try {
  const Notifications = require('expo-notifications')
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
} catch {}

export default function App() {
  const initialize = useAuthStore((state) => state.initialize)
  const checkSubscription = usePurchaseStore((state) => state.checkSubscription)

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      useLockStore.getState().handleAppStateChange(nextState)
    })
    return () => sub.remove()
  }, [])

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
        await QuickActions.setItems([
          { id: 'scan-receipt', title: 'Scan Receipt', subtitle: 'Quick Capture', icon: 'capturePhoto' },
        ])
      } catch {}
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
