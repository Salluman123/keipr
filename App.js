import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Purchases from 'react-native-purchases'
import AppNavigator from './src/navigation/AppNavigator'
import { useAuthStore } from './src/store/authStore'
import { usePurchaseStore } from './src/store/purchaseStore'

const RC_API_KEY = 'test_lOJhCwZPKnyFyqOTrThIwClckci'

export default function App() {
  const initialize = useAuthStore((state) => state.initialize)
  const checkSubscription = usePurchaseStore((state) => state.checkSubscription)

  useEffect(() => {
    try { Purchases.configure({ apiKey: RC_API_KEY }) } catch {}
    initialize()
    checkSubscription()
  }, [])

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#0D0D14" />
      <AppNavigator />
    </SafeAreaProvider>
  )
}
