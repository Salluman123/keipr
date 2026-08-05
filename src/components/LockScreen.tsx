import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors } from '../constants/colors'
import { Strings } from '../constants/strings'
import { useLockStore } from '../store/lockStore'

export default function LockScreen() {
  const insets = useSafeAreaInsets()
  const authenticate = useLockStore((s) => s.authenticate)
  const [failed, setFailed] = useState(false)

  const tryUnlock = async () => {
    setFailed(false)
    const success = await authenticate()
    if (!success) setFailed(true)
  }

  useEffect(() => {
    tryUnlock()
  }, [])

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={s.center}>
        <Text style={s.icon}>🔒</Text>
        <Text style={s.heading}>{Strings.appName} is locked</Text>
        <Text style={s.subtitle}>
          {failed ? 'Authentication failed. Try again.' : 'Unlock with Face ID, Touch ID, or your passcode.'}
        </Text>

        <TouchableOpacity onPress={tryUnlock} activeOpacity={0.85} style={s.btnWrap}>
          <LinearGradient
            colors={[Colors.purpleLight, Colors.purpleDark]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.btn}
          >
            <Text style={s.btnText}>Unlock</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 999, elevation: 999,
  },
  center: { alignItems: 'center', paddingHorizontal: 32, gap: 8 },
  icon: { fontSize: 44, marginBottom: 8 },
  heading: { fontSize: 22, fontFamily: 'Georgia', color: Colors.offWhite, textAlign: 'center' },
  subtitle: { fontSize: 14, color: Colors.gray, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  btnWrap: { width: '100%', maxWidth: 260 },
  btn: { paddingVertical: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
})
