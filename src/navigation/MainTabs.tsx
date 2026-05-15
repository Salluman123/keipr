import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors } from '../constants/colors'
import HomeScreen from '../screens/main/HomeScreen'
import ExpensesScreen from '../screens/main/ExpensesScreen'
import ReportsScreen from '../screens/main/ReportsScreen'
import SettingsScreen from '../screens/main/SettingsScreen'

export type MainTabParamList = {
  Home: undefined
  Expenses: undefined
  Reports: undefined
  Settings: undefined
}

const Tab = createBottomTabNavigator<MainTabParamList>()

type TabName = keyof MainTabParamList

const TAB_CONFIG: Record<TabName, { label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap }> = {
  Home:     { label: 'Home',     icon: 'home-outline',       iconActive: 'home' },
  Expenses: { label: 'Expenses', icon: 'receipt-outline',    iconActive: 'receipt' },
  Reports:  { label: 'Reports',  icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  Settings: { label: 'Settings', icon: 'settings-outline',   iconActive: 'settings' },
}

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom || 12 }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index
        const config = TAB_CONFIG[route.name as TabName]

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name)
          }
        }

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={styles.tabItem}
            activeOpacity={0.7}
          >
            <View style={styles.tabIconWrapper}>
              <Ionicons
                name={isFocused ? config.iconActive : config.icon}
                size={22}
                color={isFocused ? Colors.purpleLight : Colors.gray}
                style={{ opacity: isFocused ? 1 : 0.45 }}
              />
              {isFocused && <View style={styles.activeDot} />}
            </View>
            <Text style={[styles.tabLabel, isFocused ? styles.tabLabelActive : styles.tabLabelInactive]}>
              {config.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Expenses" component={ExpensesScreen} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#13131F',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  tabIconWrapper: {
    alignItems: 'center',
    gap: 4,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.purpleLight,
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: Colors.purpleLight,
    fontWeight: '600',
  },
  tabLabelInactive: {
    color: Colors.gray,
    opacity: 0.45,
  },
})
