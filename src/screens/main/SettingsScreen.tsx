import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, Switch,
  StyleSheet, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, Linking,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { formatDistanceToNow } from 'date-fns'
import { CURRENCIES } from '../../lib/currency'
import { Colors } from '../../constants/colors'
import { Strings } from '../../constants/strings'
import { useAuthStore } from '../../store/authStore'
import { useExpenseStore } from '../../store/expenseStore'
import { usePurchaseStore } from '../../store/purchaseStore'
import { useLockStore } from '../../store/lockStore'
import { useNotificationStore } from '../../store/notificationStore'
import { supabase } from '../../lib/supabase'
import { exportExpensesAsCSV } from '../../lib/csvExport'
import { removeAllReceipts } from '../../lib/receiptStorage'
import { extractFromImage } from '../../lib/claudeOCR'
import Spinner from '../../components/Spinner'
import type { MainStackParamList } from '../../navigation/MainStack'
import type { Expense } from '../../types'

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={s.sectionHead}>{title}</Text>
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>
}

const Sep = () => <View style={s.sep} />

// Honest claim only: your data lives in your account and is synced across
// devices. Never implies it survives being offline mid-save — there's no
// local write queue behind this, so that would be a false guarantee.
function SyncStatusRow({ fetchError, lastSyncedAt }: { fetchError: boolean; lastSyncedAt: number | null }) {
  if (fetchError) {
    return (
      <View style={s.syncRow}>
        <Ionicons name="cloud-offline-outline" size={18} color={Colors.error} />
        <Text style={[s.syncTitle, { color: Colors.error }]}>Sync failed — check your connection</Text>
      </View>
    )
  }
  return (
    <View style={s.syncRow}>
      <Ionicons name="cloud-done-outline" size={18} color={lastSyncedAt ? Colors.success : Colors.gray} />
      <View style={s.syncTextCol}>
        <Text style={s.syncTitle}>{lastSyncedAt ? 'Synced to your account' : 'Not synced yet'}</Text>
        {lastSyncedAt && (
          <Text style={s.syncSubtext}>Last synced: {formatDistanceToNow(lastSyncedAt, { addSuffix: true })}</Text>
        )}
      </View>
    </View>
  )
}

function Row({
  icon, label, onPress, danger, right, disabled,
}: {
  icon: string
  label: string
  onPress?: () => void
  danger?: boolean
  right?: React.ReactNode
  disabled?: boolean
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.7}
      style={s.row}
    >
      <Text style={s.rowIcon}>{icon}</Text>
      <Text style={[s.rowLabel, danger && { color: Colors.error }]}>{label}</Text>
      <View style={s.rowRight}>
        {right ?? <Ionicons name="chevron-forward" size={15} color={Colors.gray} />}
      </View>
    </TouchableOpacity>
  )
}

// ─── SettingsScreen ───────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>()
  const { user, signOut } = useAuthStore()
  const { fetchExpenses, selectedMonth, selectedYear, currency, setCurrency, fetchError, lastSyncedAt } = useExpenseStore()
  const { isPro } = usePurchaseStore()
  const { biometricEnabled, setBiometricEnabled, checkBiometricAvailability } = useLockStore()
  const { notificationsEnabled, setNotificationsEnabled } = useNotificationStore()
  const userId = user?.id ?? ''

  const name: string = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'User'
  const initial = name.charAt(0).toUpperCase()
  const accountTypeRaw = user?.user_metadata?.account_type ?? 'personal'
  const accountLabel = accountTypeRaw === 'freelancer' ? 'Freelancer'
    : accountTypeRaw === 'business' ? 'Business' : 'Personal'

  useEffect(() => {
    checkBiometricAvailability()
  }, [])

  const toggleNotifications = async (value: boolean) => {
    const result = await setNotificationsEnabled(value)
    if (!result.success) {
      if (result.deniedPermanently) {
        Alert.alert(
          'Notifications Disabled',
          'Notifications are turned off for Keipr in your device settings. Enable them there, then try again.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        )
      } else {
        Alert.alert(
          'Permission Needed',
          'Keipr needs notification permission to send you a daily expense reminder.'
        )
      }
    }
  }

  const toggleBiometric = async (value: boolean) => {
    if (value) {
      const available = await checkBiometricAvailability()
      if (!available) {
        Alert.alert(
          'Biometric Lock Unavailable',
          'Set up Face ID, Touch ID, or a device passcode in your device settings, then try again.'
        )
        return
      }
    }
    await setBiometricEnabled(value)
  }

  // Edit profile
  const [editVisible, setEditVisible] = useState(false)
  const [editName, setEditName] = useState(name)
  const [editTrn, setEditTrn] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const trnInputRef = useRef<TextInput>(null)

  // TRN (Tax Registration Number) — lives on the profiles table, not the
  // auth user_metadata full_name uses, so it needs its own fetch.
  const [trn, setTrn] = useState<string | null>(null)
  useEffect(() => {
    if (!userId) return
    const fetchTrn = async () => {
      try {
        const { data } = await supabase.from('profiles').select('trn').eq('id', userId).maybeSingle()
        setTrn(data?.trn ?? null)
      } catch {
        // ignore — field just shows blank until the next successful fetch
      }
    }
    fetchTrn()
  }, [userId])

  // Loading
  const [exportingAll, setExportingAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)

  // ── Hidden __DEV__-only debug feature: tap the version string 7x to reveal
  // a "Debug: Test GLM Scan" row. Every piece of this — the state, the
  // handlers, and the JSX below — is gated behind `__DEV__`, React Native's
  // standard dev-vs-release flag. `__DEV__` is statically inlined to `false`
  // in a release/App Store bundle, so `if (__DEV__)` / `{__DEV__ && ...}`
  // branches become dead code the production bundler (Metro + Terser) strips
  // during minification — the same mechanism every RN debug-menu feature
  // (Flipper, Reactotron, etc.) relies on. None of this exists in a shipped
  // build; the tap gesture itself is inert (onPress is undefined) outside dev.
  const debugTapCount = useRef(0)
  const debugTapResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debugRowVisible, setDebugRowVisible] = useState(false)
  const [debugScanning, setDebugScanning] = useState(false)
  const [debugResult, setDebugResult] = useState<string | null>(null)

  const handleVersionTap = () => {
    if (!__DEV__) return // belt-and-braces — onPress itself is already gated below
    if (debugTapResetTimer.current) clearTimeout(debugTapResetTimer.current)
    debugTapCount.current += 1
    if (debugTapCount.current >= 7) {
      debugTapCount.current = 0
      setDebugRowVisible(true)
      return
    }
    // Reset the count if taps stop coming for a couple seconds, so it takes
    // 7 taps in quick succession, not 7 taps ever.
    debugTapResetTimer.current = setTimeout(() => { debugTapCount.current = 0 }, 2000)
  }

  const handleDebugGlmScan = async () => {
    if (!__DEV__) return
    let picked: ImagePicker.ImagePickerResult
    try {
      picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })
    } catch {
      Alert.alert('Error', 'Could not open your photo library.')
      return
    }
    if (picked.canceled || !picked.assets[0]) return

    setDebugScanning(true)
    try {
      const data = await extractFromImage(picked.assets[0].uri, { provider: 'glm' })
      setDebugResult(JSON.stringify(data, null, 2))
    } catch (e: any) {
      setDebugResult(`ERROR\n\n${e?.message ?? 'Unknown error'}`)
    } finally {
      setDebugScanning(false)
    }
  }

  const openEditProfile = () => {
    setEditName(name)
    setEditTrn(trn ?? '')
    setEditVisible(true)
  }

  const saveProfile = async () => {
    if (!editName.trim()) return
    setSavingProfile(true)
    try {
      const nextTrn = editTrn.trim() || null
      const { error } = await supabase.auth.updateUser({
        data: { full_name: editName.trim() },
      })
      if (error) throw error
      const { error: trnError } = await supabase
        .from('profiles')
        .update({ trn: nextTrn })
        .eq('id', userId)
      if (trnError) throw trnError
      setTrn(nextTrn)
      setEditVisible(false)
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? Strings.errors.updateProfile)
    } finally {
      setSavingProfile(false)
    }
  }

  const changePassword = async () => {
    if (!user?.email) return
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: 'keipr://reset-password',
      })
      if (error) throw error
      Alert.alert('Email Sent', `A password reset link has been sent to ${user.email}.`)
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? Strings.errors.changePassword)
    }
  }

  const exportAllData = async () => {
    setExportingAll(true)
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
      if (error) throw error
      if (!data?.length) {
        Alert.alert('No Data', 'You have no expenses to export.')
        return
      }
      await exportExpensesAsCSV(data as Expense[])
    } catch (e: any) {
      Alert.alert('Export Failed', e?.message ?? Strings.errors.export)
    } finally {
      setExportingAll(false)
    }
  }

  const deleteAllData = () => {
    Alert.alert(
      'Delete All Data',
      'This will permanently delete ALL your expenses and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything', style: 'destructive',
          onPress: async () => {
            setDeletingAll(true)
            try {
              const { error } = await supabase.from('expenses').delete().eq('user_id', userId)
              if (error) throw error
              await new Promise(resolve => setTimeout(resolve, 300))
              await fetchExpenses(userId, selectedMonth, selectedYear)
              await removeAllReceipts(userId)
              Alert.alert('Done', 'All expense data has been deleted.')
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? Strings.errors.deleteAll)
            } finally {
              setDeletingAll(false)
            }
          },
        },
      ]
    )
  }

  const deleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and ALL data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account', style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true)
            try {
              // delete_account removes storage receipts itself (inside the RPC)
              // so deletion is atomic even if the app is killed mid-flow.
              const { error } = await supabase.rpc('delete_account')
              if (error) throw error
              await signOut()
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? Strings.errors.generic)
              setDeletingAccount(false)
            }
          },
        },
      ],
    )
  }

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          try { await signOut() }
          catch (e: any) { Alert.alert('Error', e?.message ?? Strings.errors.generic) }
        },
      },
    ])
  }

  const selectCurrency = () => {
    Alert.alert('Currency', 'Select your display currency', [
      ...CURRENCIES.map(c => ({ text: c.label, onPress: () => setCurrency(c.code) })),
      { text: 'Cancel', style: 'cancel' as const },
    ])
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Edit Profile Modal */}
      <Modal visible={editVisible} transparent animationType="fade" statusBarTranslucent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={s.backdrop}
            activeOpacity={1}
            onPress={() => setEditVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={s.modalCard}>
                <Text style={s.modalTitle}>Edit Profile</Text>
                <TextInput
                  style={s.modalInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Full name"
                  placeholderTextColor={Colors.gray}
                  autoFocus
                  returnKeyType="next"
                  onSubmitEditing={() => trnInputRef.current?.focus()}
                />
                <View style={s.modalFieldGroup}>
                  <Text style={s.modalFieldLabel}>Tax Registration Number (TRN)</Text>
                  <TextInput
                    ref={trnInputRef}
                    style={s.modalInput}
                    value={editTrn}
                    onChangeText={setEditTrn}
                    placeholder="e.g. 100123456700003"
                    placeholderTextColor={Colors.gray}
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={saveProfile}
                  />
                </View>
                <View style={s.modalBtns}>
                  <TouchableOpacity
                    onPress={() => setEditVisible(false)}
                    style={s.modalCancelBtn}
                  >
                    <Text style={s.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={saveProfile}
                    disabled={savingProfile || !editName.trim()}
                    style={{ flex: 1 }}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={[Colors.purpleLight, Colors.purpleDark]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={[s.modalSaveBtn, (!editName.trim() || savingProfile) && { opacity: 0.6 }]}
                    >
                      {savingProfile ? (
                        <Spinner size={18} color="#fff" />
                      ) : (
                        <Text style={s.modalSaveText}>Save</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Screen */}
      <View style={s.header}>
        <Text style={s.heading}>Settings</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* Profile card */}
        <LinearGradient
          colors={['#3B1F8C', Colors.purpleDark, '#7C3AED']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.profileCard}
        >
          {/* Decorative circle */}
          <View style={s.profileDeco} />

          <View style={s.profileRow}>
            <LinearGradient
              colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)']}
              style={s.avatar}
            >
              <Text style={s.avatarInitial}>{initial}</Text>
            </LinearGradient>

            <View style={s.profileInfo}>
              <Text style={s.profileName}>{name}</Text>
              <Text style={s.profileRole}>{accountLabel}</Text>
              <Text style={s.profileEmail} numberOfLines={1}>{user?.email ?? ''}</Text>
            </View>

            {isPro && (
              <View style={s.proBadge}>
                <Text style={s.proBadgeText}>PRO ✦</Text>
              </View>
            )}
          </View>
        </LinearGradient>

        {/* Upgrade to Pro */}
        {!isPro && (
          <TouchableOpacity onPress={() => navigation.navigate('Paywall')} activeOpacity={0.85}>
            <LinearGradient
              colors={[Colors.purpleDark, Colors.purpleLight]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.upgradeBanner}
            >
              <View style={s.upgradeTextCol}>
                <Text style={s.upgradeTitle}>Upgrade to Pro ✦</Text>
                <Text style={s.upgradeSubtitle}>Unlock scanning, CSV export & unlimited expenses</Text>
              </View>
              <Text style={s.upgradePrice}>$4.99/mo</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Preferences */}
        <SectionHeader title="PREFERENCES" />
        <SettingsCard>
          <Row
            icon="🔔" label="Notifications"
            right={
              <Switch
                value={notificationsEnabled}
                onValueChange={toggleNotifications}
                trackColor={{ false: Colors.border, true: Colors.purpleLight }}
                thumbColor="#fff"
                ios_backgroundColor={Colors.border}
              />
            }
          />
          <Sep />
          <Row
            icon="🔒" label="Biometric Lock"
            right={
              <Switch
                value={biometricEnabled}
                onValueChange={toggleBiometric}
                trackColor={{ false: Colors.border, true: Colors.purpleLight }}
                thumbColor="#fff"
                ios_backgroundColor={Colors.border}
              />
            }
          />
          <Sep />
          <Row
            icon="💱" label="Currency"
            onPress={selectCurrency}
            right={
              <View style={s.currencyPill}>
                <Text style={s.currencyText}>{currency}</Text>
                <Ionicons name="chevron-forward" size={13} color={Colors.gray} />
              </View>
            }
          />
        </SettingsCard>

        {/* Data */}
        <SectionHeader title="DATA" />
        <SettingsCard>
          <SyncStatusRow fetchError={fetchError} lastSyncedAt={lastSyncedAt} />
          <Sep />
          <Row
            icon="📤" label={exportingAll ? 'Exporting…' : 'Export All Data'}
            onPress={exportingAll ? undefined : exportAllData}
            disabled={exportingAll}
          />
          <Sep />
          <Row
            icon="🗑️" label={deletingAll ? 'Deleting…' : 'Delete All Data'}
            onPress={deletingAll ? undefined : deleteAllData}
            disabled={deletingAll}
            danger
          />
        </SettingsCard>

        {/* Account */}
        <SectionHeader title="ACCOUNT" />
        <SettingsCard>
          <Row icon="👤" label="Edit Profile" onPress={openEditProfile} />
          <Sep />
          <Row icon="🔑" label="Change Password" onPress={changePassword} />
          <Sep />
          <Row icon="🚪" label="Sign Out" onPress={handleSignOut} danger />
          <Sep />
          <Row
            icon="⛔" label={deletingAccount ? 'Deleting Account…' : 'Delete Account'}
            onPress={deletingAccount ? undefined : deleteAccount}
            disabled={deletingAccount}
            danger
          />
        </SettingsCard>

        {/* Hidden debug row — only ever rendered in a __DEV__ build, and only
            after 7 taps on the version string below. Absent entirely from
            release/App Store builds regardless of tap count. */}
        {__DEV__ && debugRowVisible && (
          <>
            <SectionHeader title="DEBUG" />
            <SettingsCard>
              <Row
                icon="🧪"
                label={debugScanning ? 'Scanning…' : 'Debug: Test GLM Scan'}
                onPress={debugScanning ? undefined : handleDebugGlmScan}
                disabled={debugScanning}
              />
            </SettingsCard>
          </>
        )}

        <TouchableOpacity onPress={__DEV__ ? handleVersionTap : undefined} activeOpacity={__DEV__ ? 0.5 : 1}>
          <Text style={s.version}>{Strings.appName} {Strings.version}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Debug result viewer — __DEV__ only, see above */}
      {__DEV__ && (
        <Modal visible={debugResult !== null} transparent animationType="fade" statusBarTranslucent>
          <View style={s.backdrop}>
            <View style={[s.modalCard, { maxHeight: '75%' }]}>
              <Text style={s.modalTitle}>GLM Debug Result</Text>
              <ScrollView style={s.debugScroll}>
                <Text style={s.debugText}>{debugResult}</Text>
              </ScrollView>
              <TouchableOpacity onPress={() => setDebugResult(null)} style={s.modalCancelBtn}>
                <Text style={s.modalCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  heading: { fontSize: 24, fontFamily: 'Georgia', color: Colors.offWhite },

  scroll: { paddingHorizontal: 20, gap: 8 },

  // Profile card
  profileCard: {
    borderRadius: 20, padding: 20, marginBottom: 8, overflow: 'hidden',
  },
  profileDeco: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
    right: -40, top: -40,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 22, fontWeight: '700', color: '#fff' },
  profileInfo: { flex: 1, gap: 2 },
  profileName: { fontSize: 17, fontWeight: '700', color: '#fff' },
  profileRole: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  profileEmail: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  proBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  proBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFE27A' },

  // Section header
  sectionHead: {
    fontSize: 11, fontWeight: '700', color: Colors.gray,
    letterSpacing: 0.8, paddingTop: 12, paddingBottom: 6, paddingHorizontal: 4,
  },

  // Settings card + rows
  card: {
    backgroundColor: Colors.card, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 15, gap: 12,
  },
  rowIcon: { fontSize: 18, width: 26, textAlign: 'center' },
  rowLabel: { flex: 1, fontSize: 15, color: Colors.offWhite },
  rowRight: { alignItems: 'center', justifyContent: 'center' },
  sep: { height: 1, backgroundColor: Colors.border, marginLeft: 54 },

  syncRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  syncTextCol: { gap: 2 },
  syncTitle: { fontSize: 14, color: Colors.offWhite, fontWeight: '600' },
  syncSubtext: { fontSize: 12, color: Colors.gray },

  upgradeBanner: {
    borderRadius: 18, padding: 18, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  upgradeTextCol: { flex: 1, gap: 3 },
  upgradeTitle: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: 'Georgia' },
  upgradeSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 16 },
  upgradePrice: { fontSize: 14, fontWeight: '700', color: Colors.amber },

  currencyPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  currencyText: { fontSize: 14, fontWeight: '600', color: Colors.purpleLight },

  version: {
    textAlign: 'center', fontSize: 12, color: Colors.gray,
    opacity: 0.45, paddingTop: 16,
  },

  // Edit profile modal
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.card, borderRadius: 20, padding: 24, width: '100%',
    borderWidth: 1, borderColor: Colors.border, gap: 16,
  },
  modalTitle: { fontSize: 18, fontFamily: 'Georgia', color: Colors.offWhite, textAlign: 'center' },
  modalInput: {
    backgroundColor: Colors.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16, color: Colors.offWhite,
  },
  modalFieldGroup: { gap: 6 },
  modalFieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.grayLight, letterSpacing: 0.5 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: Colors.inputBg, borderWidth: 1, borderColor: Colors.border,
  },
  modalCancelText: { fontSize: 15, color: Colors.gray, fontWeight: '600' },
  modalSaveBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Debug GLM result viewer (__DEV__ only)
  debugScroll: { maxHeight: 400 },
  debugText: {
    fontSize: 12, color: Colors.offWhite,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
})
