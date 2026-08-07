import React, { useEffect, useRef } from 'react'
import { View, StyleSheet, AppState } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import * as QuickActions from 'expo-quick-actions'
import { useAuthStore } from '../store/authStore'
import { useLockStore } from '../store/lockStore'
import { Colors } from '../constants/colors'
import AuthStack from './AuthStack'
import MainStack from './MainStack'
import Spinner from '../components/Spinner'
import LockScreen from '../components/LockScreen'
import { navigationRef } from './navigationRef'

const SCAN_ACTION_ID = 'scan-receipt'

export default function AppNavigator() {
  const session = useAuthStore((s) => s.session)
  const loading = useAuthStore((s) => s.loading)
  const hydrated = useLockStore((s) => s.hydrated)
  const biometricEnabled = useLockStore((s) => s.biometricEnabled)
  const isLocked = useLockStore((s) => s.isLocked)
  const consumedInitialAction = useRef(false)

  // Handles the cold-start case: app was launched by tapping the "Scan
  // Receipt" quick action. MainStack (and the ScanReceipt route) only exists
  // once there's a session, so this re-checks whenever auth resolves rather
  // than assuming it's already ready on the first render.
  const tryConsumeInitialAction = () => {
    if (consumedInitialAction.current) return
    if (!session || !navigationRef.isReady()) return
    try {
      if (QuickActions.initial?.id === SCAN_ACTION_ID) {
        consumedInitialAction.current = true
        navigationRef.navigate('ScanReceipt')
      }
    } catch {}
  }

  useEffect(() => {
    tryConsumeInitialAction()
  }, [session])

  // Feeds background/foreground transitions into lockStore so its idle-timeout
  // re-lock (handleAppStateChange) actually fires — without this subscription
  // the store's logic is defined but never invoked, and biometric lock only
  // ever engages on cold start.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      useLockStore.getState().handleAppStateChange(nextState)
    })
    return () => sub.remove()
  }, [])

  // Warm-launch case: app was already running (foreground or background)
  // when the quick action was tapped.
  useEffect(() => {
    try {
      const sub = QuickActions.addListener((action) => {
        if (action.id === SCAN_ACTION_ID && session && navigationRef.isReady()) {
          navigationRef.navigate('ScanReceipt')
        }
      })
      return () => sub.remove()
    } catch {
      return undefined
    }
  }, [session])

  if (loading) {
    return (
      <View style={styles.loading}>
        <Spinner size={36} color={Colors.purpleLight} />
      </View>
    )
  }

  const showLock = !!session && hydrated && biometricEnabled && isLocked

  return (
    <>
      <NavigationContainer ref={navigationRef} onReady={tryConsumeInitialAction}>
        {session ? <MainStack /> : <AuthStack />}
      </NavigationContainer>
      {showLock && <LockScreen />}
    </>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
