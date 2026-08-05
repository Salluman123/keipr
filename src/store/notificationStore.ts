import { create } from 'zustand'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const NOTIFICATIONS_KEY = 'keipr_notifications_enabled'
const REMINDER_HOUR = 20 // 8 PM
const REMINDER_MINUTE = 0
const CHANNEL_ID = 'daily-reminder'

type NotificationsModule = typeof import('expo-notifications')

let cachedNotifications: NotificationsModule | null = null

// expo-notifications resolves its native module eagerly (and throws) as a side
// effect of import, not on first call — a static top-level import can crash the
// app before any try/catch around a later call site would run. Deferring the
// require to here keeps that resolution attempt inside a guard, and lets a
// later call retry if the native module wasn't registered yet at startup. Only
// the success is cached — a failure isn't, so the next call gets another chance.
function getNotifications(): NotificationsModule | null {
  if (cachedNotifications) return cachedNotifications
  try {
    cachedNotifications = require('expo-notifications') as NotificationsModule
    return cachedNotifications
  } catch {
    return null
  }
}

async function ensureAndroidChannel(Notifications: NotificationsModule) {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Daily Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  })
}

async function scheduleDailyReminder() {
  const Notifications = getNotifications()
  if (!Notifications) return
  await ensureAndroidChannel(Notifications)
  await Notifications.cancelAllScheduledNotificationsAsync()
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Keipr',
      body: "Don't forget to log today's expenses.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: REMINDER_HOUR,
      minute: REMINDER_MINUTE,
      channelId: CHANNEL_ID,
    },
  })
}

interface NotificationStore {
  hydrated: boolean
  notificationsEnabled: boolean
  setNotificationsEnabled: (
    enabled: boolean
  ) => Promise<{ success: boolean; deniedPermanently?: boolean }>
}

export const useNotificationStore = create<NotificationStore>((set) => {
  SecureStore.getItemAsync(NOTIFICATIONS_KEY)
    .then((v) => {
      const enabled = v === 'true'
      set({ notificationsEnabled: enabled, hydrated: true })
      if (enabled) {
        // Permission was already granted the last time this was turned on —
        // this just re-arms the schedule in case the OS cleared it (app
        // update/reinstall), it's not a fresh permission request.
        scheduleDailyReminder().catch(() => {})
      }
    })
    .catch(() => set({ hydrated: true }))

  return {
    hydrated: false,
    notificationsEnabled: false,

    setNotificationsEnabled: async (enabled) => {
      const Notifications = getNotifications()
      if (!Notifications) return { success: false }

      if (!enabled) {
        set({ notificationsEnabled: false })
        SecureStore.setItemAsync(NOTIFICATIONS_KEY, 'false').catch(() => {})
        await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {})
        return { success: true }
      }

      // Always re-check live OS permission rather than trusting cached
      // state, so a permission granted later in system Settings (after an
      // earlier denial) is picked up instead of getting stuck off.
      let { status, canAskAgain } = await Notifications.getPermissionsAsync()
      if (status !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync()
        status = requested.status
        canAskAgain = requested.canAskAgain
      }

      if (status !== 'granted') {
        return { success: false, deniedPermanently: !canAskAgain }
      }

      set({ notificationsEnabled: true })
      SecureStore.setItemAsync(NOTIFICATIONS_KEY, 'true').catch(() => {})
      await scheduleDailyReminder()
      return { success: true }
    },
  }
})
