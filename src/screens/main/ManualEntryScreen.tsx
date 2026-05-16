import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Animated,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Colors } from '../../constants/colors'
import { EXPENSE_CATEGORIES } from '../../constants/categories'
import type { CategoryId } from '../../constants/categories'
import { useAuthStore } from '../../store/authStore'
import { useExpenseStore } from '../../store/expenseStore'
import { usePurchaseStore } from '../../store/purchaseStore'
import { getCurrencySymbol } from '../../lib/currency'
import { supabase } from '../../lib/supabase'
import type { MainStackParamList } from '../../navigation/MainStack'

type Props = { navigation: NativeStackNavigationProp<MainStackParamList, 'ManualEntry'> }

// ─── Success overlay (same as ScanScreen) ────────────────────────────────────

function SuccessOverlay({ onDone }: { onDone: () => void }) {
  const scale = useRef(new Animated.Value(0.4)).current
  const opacity = useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start()
    const t = setTimeout(onDone, 1400)
    return () => clearTimeout(t)
  }, [])

  return (
    <Animated.View style={[StyleSheet.absoluteFill, so.overlay, { opacity }]}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient colors={[Colors.amber, '#D97706']} style={so.badge}>
          <Text style={so.check}>✓</Text>
        </LinearGradient>
      </Animated.View>
      <Text style={so.label}>Saved!</Text>
    </Animated.View>
  )
}
const so = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(13,13,20,0.92)', alignItems: 'center', justifyContent: 'center', gap: 18, zIndex: 99 },
  badge: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  check: { fontSize: 44, color: '#fff' },
  label: { fontSize: 22, fontFamily: 'Georgia', color: '#F0EEFF' },
})

// ─── Date stepper ─────────────────────────────────────────────────────────────

function DateStepper({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const isToday = value.getTime() === today.getTime()

  const shift = (n: number) => {
    const d = new Date(value); d.setDate(d.getDate() + n)
    if (d > today) return
    onChange(d)
  }

  const label = value.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <View style={ds.row}>
      <TouchableOpacity onPress={() => shift(-1)} style={ds.arrow}>
        <Text style={ds.arrowText}>‹</Text>
      </TouchableOpacity>
      <Text style={ds.value}>{label}</Text>
      <TouchableOpacity onPress={() => shift(1)} style={[ds.arrow, isToday && ds.arrowDisabled]} disabled={isToday}>
        <Text style={[ds.arrowText, isToday && { color: Colors.border }]}>›</Text>
      </TouchableOpacity>
    </View>
  )
}
const ds = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 6, paddingVertical: 4,
  },
  arrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  arrowDisabled: { opacity: 0.3 },
  arrowText: { fontSize: 24, color: Colors.purpleLight, lineHeight: 28 },
  value: { fontSize: 15, color: Colors.offWhite, fontWeight: '500' },
})

// ─── Upload helper ─────────────────────────────────────────────────────────────

async function uploadReceiptImage(uri: string, userId: string): Promise<string | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any })
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const path = `${userId}/${Date.now()}.jpg`
    const { error } = await supabase.storage.from('receipts').upload(path, bytes, { contentType: 'image/jpeg' })
    if (error) return null
    const { data } = supabase.storage.from('receipts').getPublicUrl(path)
    return data.publicUrl
  } catch {
    return null
  }
}

// ─── ManualEntryScreen ────────────────────────────────────────────────────────

export default function ManualEntryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()
  const { addExpense, expenses, currency } = useExpenseStore()
  const { isPro } = usePurchaseStore()
  const sym = getCurrencySymbol(currency)

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const [vendor, setVendor] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [category, setCategory] = useState<CategoryId>('other')
  const [notes, setNotes] = useState('')
  const [receiptUri, setReceiptUri] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const [vendorFocused, setVendorFocused] = useState(false)
  const [amountFocused, setAmountFocused] = useState(false)
  const [notesFocused, setNotesFocused] = useState(false)

  const amountRef = useRef<TextInput>(null)

  const pickReceiptPhoto = async () => {
    Alert.alert('Receipt Photo', 'Choose source', [
      {
        text: 'Camera', onPress: async () => {
          const r = await ImagePicker.launchCameraAsync({ quality: 0.75 })
          if (!r.canceled) setReceiptUri(r.assets[0].uri)
        },
      },
      {
        text: 'Gallery', onPress: async () => {
          const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })
          if (!r.canceled) setReceiptUri(r.assets[0].uri)
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const handleSave = async () => {
    if (!vendor.trim()) { Alert.alert('Required', 'Please enter a vendor name.'); return }
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) { Alert.alert('Invalid amount', 'Please enter a valid amount greater than 0.'); return }

    if (!isPro && expenses.length >= 10) {
      Alert.alert(
        'Free Limit Reached',
        'You\'ve used all 10 free expenses this month. Upgrade to Pro for unlimited expenses.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Upgrade to Pro', onPress: () => navigation.navigate('Paywall') },
        ],
      )
      return
    }

    setSaving(true)
    try {
      const receiptUrl = receiptUri ? await uploadReceiptImage(receiptUri, user!.id) : null
      await addExpense({
        user_id: user!.id,
        vendor: vendor.trim(),
        amount: parsed,
        date: date.toISOString().split('T')[0],
        category,
        notes: notes.trim() || undefined,
        receipt_image_url: receiptUrl ?? undefined,
      })
      setShowSuccess(true)
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Could not save expense. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.root}>
      {showSuccess && <SuccessOverlay onDone={() => navigation.goBack()} />}

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={Colors.offWhite} />
        </TouchableOpacity>
        <Text style={styles.heading}>Add Expense</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Vendor ── */}
          <View style={styles.field}>
            <Text style={styles.label}>VENDOR</Text>
            <View style={[styles.inputRow, vendorFocused && styles.inputRowFocused]}>
              <Ionicons name="storefront-outline" size={16} color={vendorFocused ? Colors.purpleLight : Colors.gray} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={vendor}
                onChangeText={setVendor}
                placeholder="e.g. Amazon, Starbucks"
                placeholderTextColor={Colors.gray}
                returnKeyType="next"
                onSubmitEditing={() => amountRef.current?.focus()}
                onFocus={() => setVendorFocused(true)}
                onBlur={() => setVendorFocused(false)}
              />
            </View>
          </View>

          {/* ── Amount ── */}
          <View style={styles.field}>
            <Text style={styles.label}>AMOUNT</Text>
            <View style={[styles.inputRow, amountFocused && styles.inputRowFocused]}>
              <Text style={[styles.currency, { color: amountFocused ? Colors.purpleLight : Colors.gray }]}>{sym}</Text>
              <TextInput
                ref={amountRef}
                style={[styles.input, { flex: 1 }]}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={Colors.gray}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onFocus={() => setAmountFocused(true)}
                onBlur={() => setAmountFocused(false)}
              />
            </View>
          </View>

          {/* ── Date ── */}
          <View style={styles.field}>
            <Text style={styles.label}>DATE</Text>
            <DateStepper value={date} onChange={setDate} />
          </View>

          {/* ── Category ── */}
          <View style={styles.field}>
            <Text style={styles.label}>CATEGORY</Text>
            <View style={styles.categoryGrid}>
              {EXPENSE_CATEGORIES.map(cat => {
                const active = category === cat.id
                return (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setCategory(cat.id)}
                    activeOpacity={0.75}
                    style={[styles.catItem, active && styles.catItemActive]}
                  >
                    <Text style={styles.catEmoji}>{cat.icon}</Text>
                    <Text style={[styles.catName, active && styles.catNameActive]} numberOfLines={1}>
                      {cat.label.split('&')[0].trim()}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* ── Notes ── */}
          <View style={styles.field}>
            <Text style={styles.label}>NOTES (optional)</Text>
            <TextInput
              style={[styles.inputRow, styles.notesBox, notesFocused && styles.inputRowFocused]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add a note…"
              placeholderTextColor={Colors.gray}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              onFocus={() => setNotesFocused(true)}
              onBlur={() => setNotesFocused(false)}
            />
          </View>

          {/* ── Receipt photo ── */}
          <View style={styles.field}>
            <Text style={styles.label}>RECEIPT PHOTO (optional)</Text>
            {receiptUri ? (
              <View style={styles.receiptPreviewRow}>
                <Image source={{ uri: receiptUri }} style={styles.receiptThumb} />
                <TouchableOpacity onPress={() => setReceiptUri(null)} style={styles.removePhoto}>
                  <Ionicons name="close-circle" size={20} color={Colors.error} />
                  <Text style={styles.removePhotoText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={pickReceiptPhoto} style={styles.photoPickerBtn}>
                <Ionicons name="camera-outline" size={20} color={Colors.purpleLight} />
                <Text style={styles.photoPickerText}>Add receipt photo</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        {/* ── Save button (floating) ── */}
        <View style={[styles.saveArea, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity onPress={handleSave} disabled={saving} activeOpacity={0.85}>
            <LinearGradient
              colors={[Colors.purpleLight, Colors.purpleDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            >
              {saving ? (
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: 'transparent', borderTopColor: '#fff' }} />
              ) : (
                <Text style={styles.saveBtnText}>Save Expense</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  heading: { fontSize: 17, fontFamily: 'Georgia', color: Colors.offWhite },

  scroll: { padding: 20, gap: 20 },

  field: { gap: 8 },
  label: { fontSize: 11, fontWeight: '700', color: Colors.grayLight, letterSpacing: 0.8 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  inputRowFocused: { borderColor: Colors.purpleLight },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: Colors.offWhite },
  currency: { fontSize: 16, fontWeight: '600', marginRight: 8 },

  notesBox: {
    alignItems: 'flex-start', paddingTop: 12, minHeight: 90,
  },

  categoryGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  catItem: {
    width: '30%',
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 4,
    backgroundColor: Colors.inputBg, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  catItemActive: {
    borderColor: Colors.purpleLight,
    backgroundColor: Colors.purpleDark + '44',
  },
  catEmoji: { fontSize: 22 },
  catName: { fontSize: 11, color: Colors.gray, textAlign: 'center' },
  catNameActive: { color: Colors.purpleLight, fontWeight: '600' },

  receiptPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  receiptThumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: Colors.card },
  removePhoto: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  removePhotoText: { fontSize: 13, color: Colors.error },

  photoPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    borderStyle: 'dashed',
    paddingVertical: 16, paddingHorizontal: 18,
  },
  photoPickerText: { fontSize: 14, color: Colors.purpleLight, fontWeight: '500' },

  saveArea: {
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  saveBtn: { paddingVertical: 17, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
})
