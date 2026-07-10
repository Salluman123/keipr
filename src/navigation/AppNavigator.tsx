import React from 'react'
import { View, StyleSheet } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { useAuthStore } from '../store/authStore'
import { Colors } from '../constants/colors'
import AuthStack from './AuthStack'
import MainStack from './MainStack'
import Spinner from '../components/Spinner'

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
