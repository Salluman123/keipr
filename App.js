import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import AppNavigator from './src/navigation/AppNavigator'
import { useAuthStore } from './src/store/authStore'

export default function App() {
  const initialize = useAuthStore((state) => state.initialize)

  useEffect(() => {
    initialize()
  }, [])

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#0D0D14" />
      <AppNavigator />
    </SafeAreaProvider>
  )
}
