import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, Switch,
  StyleSheet, Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CURRENCIES } from '../../lib/currency'
import { Colors } from '../../constants/colors'
import { Strings } from '../../constants/strings'
import { useAuthStore } from '../../store/authStore'
import { useExpenseStore } from '../../store/expenseStore'
import { supabase } from '../../lib/supabase'
import { exportExpensesAsCSV } from '../../lib/csvExport'
import type { Expense } from '../../types'

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={s.sectionHead}>{title}</Text>
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>
}

const Sep = () => <View style={s.sep} />

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
  const { user, signOut } = useAuthStore()
  const { fetchExpenses, selectedMonth, selectedYear, currency, setCurrency } = useExpenseStore()
  const userId = user?.id ?? ''

  const name: string = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'User'
  const initial = name.charAt(0).toUpperCase()
  const accountTypeRaw = user?.user_metadata?.account_type ?? 'personal'
  const accountLabel = accountTypeRaw === 'freelancer' ? 'Freelancer'
    : accountTypeRaw === 'business' ? 'Business' : 'Personal'

  // Preference state
  const [notifications, setNotifications] = useState(true)
  const [biometric, setBiometric] = useState(false)
  const [darkMode] = useState(true)

  // Edit profile
  const [editVisible, setEditVisible] = useState(false)
  const [editName, setEditName] = useState(name)
  const [savingProfile, setSavingProfile] = useState(false)

  // Loading
  const [exportingAll, setExportingAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)

  const openEditProfile = () => {
    setEditName(name)
    setEditVisible(true)
  }

  const saveProfile = async () => {
    if (!editName.trim()) return
    setSavingProfile(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: editName.trim() },
      })
      if (error) throw error
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
              setTimeout(() => fetchExpenses(userId, selectedMonth, selectedYear), 300)
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

  const toggle = (value: boolean, color = Colors.purpleLight) => (
    <Switch
      value={value}
      onValueChange={() => {}}
      trackColor={{ false: Colors.border, true: color }}
      thumbColor="#fff"
      ios_backgroundColor={Colors.border}
    />
  )

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
                <Text style={s.modalTitle}>Edit Name</Text>
                <TextInput
                  style={s.modalInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Full name"
                  placeholderTextColor={Colors.gray}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={saveProfile}
                />
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
                        <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: 'transparent', borderTopColor: '#fff' }} />
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

            <View style={s.proBadge}>
              <Text style={s.proBadgeText}>PRO ✦</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Preferences */}
        <SectionHeader title="PREFERENCES" />
        <SettingsCard>
          <Row
            icon="🔔" label="Notifications"
            right={
              <Switch
                value={notifications}
                onValueChange={setNotifications}
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
                value={biometric}
                onValueChange={setBiometric}
                trackColor={{ false: Colors.border, true: Colors.purpleLight }}
                thumbColor="#fff"
                ios_backgroundColor={Colors.border}
              />
            }
          />
          <Sep />
          <Row
            icon="🌙" label="Dark Mode"
            right={toggle(darkMode)}
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
          <Row
            icon="📤" label={exportingAll ? 'Exporting…' : 'Export All Data'}
            onPress={exportingAll ? undefined : exportAllData}
            disabled={exportingAll}
          />
          <Sep />
          <Row
            icon="☁️" label="iCloud Backup"
            onPress={() => Alert.alert('Coming Soon', 'iCloud backup will be available in a future update.')}
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
        </SettingsCard>

        <Text style={s.version}>{Strings.appName} {Strings.version} · Phase 5</Text>
      </ScrollView>
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
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: Colors.inputBg, borderWidth: 1, borderColor: Colors.border,
  },
  modalCancelText: { fontSize: 15, color: Colors.gray, fontWeight: '600' },
  modalSaveBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
})
