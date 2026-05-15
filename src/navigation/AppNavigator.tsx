import React from 'react'
import { View, StyleSheet } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { useAuthStore } from '../store/authStore'
import { Colors } from '../constants/colors'
import AuthStack from './AuthStack'
import MainStack from './MainStack'

const Spinner = ({ size = 36, color = '#9F67F7' }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: 'transparent', borderTopColor: color }} />
)

export default function AppNavigator() {
  const session = useAuthStore((s) => s.session)
  const loading = useAuthStore((s) => s.loading)

  if (loading) {
    return (
      <View style={styles.loading}>
        <Spinner size={36} color={Colors.purpleLight} />
      </View>
    )
  }

  return (
    <NavigationContainer>
      {session ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
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
