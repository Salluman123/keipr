import React, { useRef, useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
  ScrollView,
  TextInput,
  Animated,
  Alert,
  Platform,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Colors } from '../../constants/colors'
import { getCurrencySymbol } from '../../lib/currency'
import { EXPENSE_CATEGORIES } from '../../constants/categories'
import { useAuthStore } from '../../store/authStore'
import { useExpenseStore } from '../../store/expenseStore'
import { extractFromImage, type ExtractedReceipt } from '../../lib/claudeOCR'
import { supabase } from '../../lib/supabase'
import type { CategoryId } from '../../constants/categories'
import type { MainStackParamList } from '../../navigation/MainStack'

type Props = { navigation: NativeStackNavigationProp<MainStackParamList, 'ScanReceipt'> }
type Step = 'camera' | 'processing' | 'review'

const { width: SW, height: SH } = Dimensions.get('window')
const SCAN_W = SW - 72
const SCAN_H = SCAN_W * 1.45

// ─── Corner brackets ─────────────────────────────────────────────────────────

function CornerBrackets() {
  const S = 26
  const T = 3
  const C = Colors.purpleLight
  const h = { position: 'absolute' as const, height: T, width: S, backgroundColor: C, borderRadius: 2 }
  const v = { position: 'absolute' as const, width: T, height: S, backgroundColor: C, borderRadius: 2 }
  return (
    <View style={{ width: SCAN_W, height: SCAN_H }}>
      <View style={{ position: 'absolute', top: 0, left: 0 }}>
        <View style={{ ...h, top: 0, left: 0 }} /><View style={{ ...v, top: 0, left: 0 }} />
      </View>
      <View style={{ position: 'absolute', top: 0, right: 0 }}>
        <View style={{ ...h, top: 0, right: 0 }} /><View style={{ ...v, top: 0, right: 0 }} />
      </View>
      <View style={{ position: 'absolute', bottom: 0, left: 0 }}>
        <View style={{ ...h, bottom: 0, left: 0 }} /><View style={{ ...v, bottom: 0, left: 0 }} />
      </View>
      <View style={{ position: 'absolute', bottom: 0, right: 0 }}>
        <View style={{ ...h, bottom: 0, right: 0 }} /><View style={{ ...v, bottom: 0, right: 0 }} />
      </View>
    </View>
  )
}

// ─── Spinning loader ──────────────────────────────────────────────────────────

function SpinningRing() {
  const rot = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 900, useNativeDriver: true })
    ).start()
    return () => rot.stopAnimation()
  }, [])
  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  return (
    <Animated.View style={{
      width: 52, height: 52, borderRadius: 26,
      borderWidth: 4, borderColor: 'transparent',
      borderTopColor: Colors.purpleLight,
      transform: [{ rotate: spin }],
    }} />
  )
}

// ─── Success overlay ──────────────────────────────────────────────────────────

function SuccessOverlay({ onDone }: { onDone: () => void }) {
  const scale = useRef(new Animated.Value(0.4)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start()
    const t = setTimeout(onDone, 1400)
    return () => clearTimeout(t)
  }, [])

  return (
    <Animated.View style={[StyleSheet.absoluteFill, ss.overlay, { opacity }]}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient colors={[Colors.amber, '#D97706']} style={ss.badge}>
          <Text style={ss.check}>✓</Text>
        </LinearGradient>
      </Animated.View>
      <Text style={ss.label}>Saved!</Text>
    </Animated.View>
  )
}
const ss = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(13,13,20,0.92)', alignItems: 'center', justifyContent: 'center', gap: 18, zIndex: 99 },
  badge: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  check: { fontSize: 44, color: Colors.white },
  label: { fontSize: 22, fontFamily: 'Georgia', color: Colors.offWhite },
})

// ─── Supabase storage upload ──────────────────────────────────────────────────

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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ScanScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()
  const { addExpense, currency: storeCurrency } = useExpenseStore()
  const [permission, requestPermission] = useCameraPermissions()

  const cameraRef = useRef<CameraView>(null)
  const [step, setStep] = useState<Step>('camera')
  const [flash, setFlash] = useState(false)
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [ocrFailed, setOcrFailed] = useState(false)
  const [ocrError, setOcrError] = useState('')

  // Review form state
  const [expenseCurrency, setExpenseCurrency] = useState(storeCurrency)
  const [vendor, setVendor] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [category, setCategory] = useState<CategoryId>('other')
  const [notes, setNotes] = useState('')
  const [vendorFocused, setVendorFocused] = useState(false)
  const [amountFocused, setAmountFocused] = useState(false)

  const processImage = async (uri: string) => {
    setStep('processing')
    setOcrFailed(false)
    setOcrError('')
    try {
      const data: ExtractedReceipt = await extractFromImage(uri)
      setVendor(data.vendor ?? '')
      setAmount(data.amount != null ? String(data.amount) : '')
      setDate(data.date ?? new Date().toISOString().split('T')[0])
      if (data.category) setCategory(data.category)
      setExpenseCurrency(data.currency ?? storeCurrency)
      setStep('review')
    } catch (e: any) {
      const msg = e?.message ?? 'Unknown error'
      setOcrFailed(true)
      setOcrError(msg)
      setStep('review')
    }
  }

  const capturePhoto = async () => {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.75 })
      if (photo?.uri) {
        setImageUri(photo.uri)
        await processImage(photo.uri)
      }
    } catch {
      Alert.alert('Error', 'Could not capture photo. Please try again.')
    }
  }

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri)
      await processImage(result.assets[0].uri)
    }
  }

  const handleSave = async () => {
    if (!vendor.trim()) { Alert.alert('Missing field', 'Please enter a vendor name.'); return }
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) { Alert.alert('Invalid amount', 'Please enter a valid amount.'); return }

    setSaving(true)
    try {
      const receiptUrl = imageUri ? await uploadReceiptImage(imageUri, user!.id) : null
      await addExpense({
        user_id: user!.id,
        vendor: vendor.trim(),
        amount: parsedAmount,
        date,
        category,
        notes: notes.trim() || undefined,
        receipt_image_url: receiptUrl ?? undefined,
      })
      setShowSuccess(true)
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Could not save expense.')
    } finally {
      setSaving(false)
    }
  }

  // ── Permission gate ──
  if (!permission) return <View style={styles.root} />
  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.permissionView]}>
        <Ionicons name="camera-outline" size={56} color={Colors.gray} />
        <Text style={styles.permTitle}>Camera Access Needed</Text>
        <Text style={styles.permSub}>Allow camera access to scan receipts</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
          <LinearGradient colors={[Colors.purpleLight, Colors.purpleDark]} style={styles.permBtnGrad}>
            <Text style={styles.permBtnText}>Grant Permission</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.gray, fontSize: 14 }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── Camera step ──
  if (step === 'camera') {
    return (
      <View style={styles.root}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" flash={flash ? 'on' : 'off'} />

        {/* Dark vignette outside scan area */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
          <View style={{ flexDirection: 'row', height: SCAN_H }}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
            <View style={{ width: SCAN_W }} />
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
          </View>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
        </View>

        {/* Corner brackets centered */}
        <View style={styles.bracketWrapper} pointerEvents="none">
          <CornerBrackets />
        </View>

        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color={Colors.white} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={() => setFlash(f => !f)} style={styles.iconBtn}>
              <Ionicons name={flash ? 'flash' : 'flash-off'} size={22} color={flash ? Colors.amber : Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity onPress={pickFromGallery} style={styles.iconBtn}>
              <Ionicons name="images-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom controls */}
        <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.cameraHint}>Point camera at receipt</Text>
          <TouchableOpacity onPress={capturePhoto} style={styles.captureOuter} activeOpacity={0.8}>
            <View style={styles.captureInner} />
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Processing step ──
  if (step === 'processing') {
    return (
      <View style={styles.root}>
        {imageUri && <Image source={{ uri: imageUri }} style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} blurRadius={4} />}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(13,13,20,0.7)' }]} />
        <View style={styles.processingCenter}>
          <SpinningRing />
          <Text style={styles.processingTitle}>Extracting data…</Text>
          <Text style={styles.processingSubtitle}>Claude AI is reading your receipt</Text>
        </View>
      </View>
    )
  }

  // ── Review step ──
  return (
    <View style={styles.root}>
      {showSuccess && <SuccessOverlay onDone={() => navigation.goBack()} />}
      <View style={[styles.reviewHeader, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => setStep('camera')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.retakeLink}>‹ Retake</Text>
        </TouchableOpacity>
        <Text style={styles.reviewTitle}>Review Receipt</Text>
        <View style={{ width: 52 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.reviewScroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Image thumbnail */}
        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.receiptThumb} resizeMode="cover" />
        )}

        {/* OCR failure notice */}
        {ocrFailed && (
          <View style={styles.ocrBanner}>
            <Ionicons name="warning-outline" size={16} color={Colors.amber} />
            <Text style={styles.ocrBannerText}>{ocrError || 'Could not read receipt — please fill in the details below.'}</Text>
          </View>
        )}

        {/* Form card */}
        <View style={styles.formCard}>
          {/* Vendor */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>VENDOR</Text>
            <View style={[styles.inputRow, vendorFocused && styles.inputRowFocused]}>
              <Ionicons name="storefront-outline" size={16} color={vendorFocused ? Colors.purpleLight : Colors.gray} style={{ marginRight: 10 }} />
              <TextInput
                style={styles.fieldInput}
                value={vendor}
                onChangeText={setVendor}
                placeholder="e.g. Starbucks"
                placeholderTextColor={Colors.gray}
                onFocus={() => setVendorFocused(true)}
                onBlur={() => setVendorFocused(false)}
              />
            </View>
          </View>

          {/* Amount */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>AMOUNT</Text>
            <View style={[styles.inputRow, amountFocused && styles.inputRowFocused]}>
              <Text style={[styles.currencySymbol, { color: amountFocused ? Colors.purpleLight : Colors.gray }]}>{getCurrencySymbol(expenseCurrency)}</Text>
              <TextInput
                style={[styles.fieldInput, { flex: 1 }]}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={Colors.gray}
                keyboardType="decimal-pad"
                onFocus={() => setAmountFocused(true)}
                onBlur={() => setAmountFocused(false)}
              />
            </View>
          </View>

          {/* Date */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>DATE</Text>
            <View style={styles.inputRow}>
              <Ionicons name="calendar-outline" size={16} color={Colors.gray} style={{ marginRight: 10 }} />
              <TextInput
                style={styles.fieldInput}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.gray}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          {/* Category */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 2 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {EXPENSE_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setCategory(cat.id)}
                    style={[styles.catChip, category === cat.id && styles.catChipActive]}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.catChipEmoji}>{cat.icon}</Text>
                    <Text style={[styles.catChipLabel, category === cat.id && styles.catChipLabelActive]}>
                      {cat.label.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Notes */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>NOTES (optional)</Text>
            <TextInput
              style={[styles.inputRow, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add a note…"
              placeholderTextColor={Colors.gray}
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        {/* Save button */}
        <TouchableOpacity onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          <LinearGradient
            colors={[Colors.purpleLight, Colors.purpleDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          >
            {saving ? (
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: 'transparent', borderTopColor: Colors.white }} />
            ) : (
              <Text style={styles.saveBtnText}>Save Expense</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setStep('camera')} style={styles.retakeBtn}>
          <Text style={styles.retakeBtnText}>Retake Photo</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Permission
  permissionView: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  permTitle: { fontSize: 20, fontFamily: 'Georgia', color: Colors.offWhite, marginTop: 8 },
  permSub: { fontSize: 14, color: Colors.gray, textAlign: 'center', lineHeight: 20 },
  permBtn: { marginTop: 12, width: '100%' },
  permBtnGrad: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  permBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },

  // Camera
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, zIndex: 10,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  bracketWrapper: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center', gap: 16,
  },
  cameraHint: { fontSize: 14, color: 'rgba(255,255,255,0.75)', letterSpacing: 0.3 },
  captureOuter: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 3, borderColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: Colors.white },

  // Processing
  processingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  processingTitle: { fontSize: 18, color: Colors.offWhite, fontWeight: '600' },
  processingSubtitle: { fontSize: 13, color: Colors.gray },

  // Review
  reviewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  reviewTitle: { fontSize: 17, color: Colors.offWhite, fontWeight: '600' },
  retakeLink: { fontSize: 15, color: Colors.purpleLight, width: 52 },
  reviewScroll: { padding: 20, gap: 16 },
  receiptThumb: {
    width: '100%', height: 140, borderRadius: 14,
    backgroundColor: Colors.card,
  },
  formCard: {
    backgroundColor: Colors.card, borderRadius: 18,
    padding: 18, gap: 18,
    borderWidth: 1, borderColor: Colors.border,
  },
  field: { gap: 8 },
  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.grayLight,
    letterSpacing: 0.8,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  inputRowFocused: { borderColor: Colors.purpleLight },
  currencySymbol: { fontSize: 16, fontWeight: '600', marginRight: 8 },
  fieldInput: { flex: 1, fontSize: 16, color: Colors.offWhite },
  notesInput: {
    alignItems: 'flex-start', paddingTop: 12,
    minHeight: 80, textAlignVertical: 'top',
  },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.inputBg,
  },
  catChipActive: { borderColor: Colors.purpleLight, backgroundColor: Colors.purpleDark + '55' },
  catChipEmoji: { fontSize: 14 },
  catChipLabel: { fontSize: 12, color: Colors.gray },
  catChipLabelActive: { color: Colors.purpleLight, fontWeight: '600' },
  saveBtn: { paddingVertical: 17, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  retakeBtn: { alignItems: 'center', paddingVertical: 14 },
  retakeBtnText: { fontSize: 14, color: Colors.gray },

  ocrBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.amber + '18',
    borderWidth: 1, borderColor: Colors.amber + '55',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  ocrBannerText: { flex: 1, fontSize: 13, color: Colors.amber, lineHeight: 18 },
})
