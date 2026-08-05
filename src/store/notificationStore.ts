import { create } from 'zustand'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import * as Notifications from 'expo-notifications'

const NOTIFICATIONS_KEY = 'keipr_notifications_enabled'
const REMINDER_HOUR = 20 // 8 PM
const REMINDER_MINUTE = 0
const CHANNEL_ID = 'daily-reminder'

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Daily Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  })
}

async function scheduleDailyReminder() {
  await ensureAndroidChannel()
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
