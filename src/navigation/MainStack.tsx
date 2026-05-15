import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import MainTabs from './MainTabs'
import ScanScreen from '../screens/main/ScanScreen'
import ManualEntryScreen from '../screens/main/ManualEntryScreen'

export type MainStackParamList = {
  Tabs: undefined
  ScanReceipt: undefined
  ManualEntry: undefined
}

const Stack = createNativeStackNavigator<MainStackParamList>()

export default function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen
        name="ScanReceipt"
        component={ScanScreen}
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="ManualEntry"
        component={ManualEntryScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  )
}
