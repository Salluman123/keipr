import React, { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import Purchases, { PurchasesPackage } from 'react-native-purchases'
import { Colors } from '../constants/colors'
import { usePurchaseStore } from '../store/purchaseStore'

const FEATURES = [
  { icon: '♾️', text: 'Unlimited expenses per month' },
  { icon: '📷', text: 'AI receipt scanning with OCR' },
  { icon: '📊', text: 'Advanced reports & analytics' },
  { icon: '📤', text: 'CSV export for tax season' },
  { icon: '🔒', text: 'Priority support' },
]

export default function PaywallScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation()
  const { purchasePackage, restorePurchases, loading } = usePurchaseStore()

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual')
  const [monthlyPkg, setMonthlyPkg] = useState<PurchasesPackage | null>(null)
  const [annualPkg, setAnnualPkg] = useState<PurchasesPackage | null>(null)

  useEffect(() => {
    Purchases.getOfferings()
      .then(o => {
        setMonthlyPkg(o.current?.monthly ?? null)
        setAnnualPkg(o.current?.annual ?? null)
      })
      .catch(() => {})
  }, [])

  const handlePurchase = async () => {
    const pkg = selectedPlan === 'annual' ? annualPkg : monthlyPkg
    if (!pkg) {
      Alert.alert(
        'Not Available',
        'In-app purchases are not configured yet. Please try again later.',
      )
      return
    }
    try {
      const success = await purchasePackage(pkg)
      if (success) navigation.goBack()
    } catch (e: any) {
      Alert.alert('Purchase Failed', e?.message ?? 'Could not complete purchase.')
    }
  }

  const handleRestore = async () => {
    try {
      await restorePurchases()
      Alert.alert('Restored', 'Your Pro subscription has been restored.')
      navigation.goBack()
    } catch {
      Alert.alert('Not Found', 'No active Pro subscription found.')
    }
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <TouchableOpacity
        style={[s.closeBtn, { top: insets.top + 12 }]}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="close" size={20} color={Colors.gray} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={s.hero}>
          <LinearGradient
            colors={[Colors.purpleLight, Colors.purpleDark]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.iconBadge}
          >
            <Text style={s.iconGlyph}>✦</Text>
          </LinearGradient>
          <Text style={s.title}>keipr Pro</Text>
          <Text style={s.subtitle}>Everything you need to run your business</Text>
        </View>

        {/* Features */}
        <View style={s.featureCard}>
          {FEATURES.map((f, i) => (
            <View key={i} style={[s.featureRow, i < FEATURES.length - 1 && s.featureBorder]}>
              <Text style={s.featureIcon}>{f.icon}</Text>
              <Text style={s.featureText}>{f.text}</Text>
              <Ionicons name="checkmark-circle" size={18} color={Colors.purpleLight} />
            </View>
          ))}
        </View>

        {/* Plan cards */}
        <View style={s.plansRow}>
          <TouchableOpacity
            style={[
              s.planCard,
              {
                borderColor: selectedPlan === 'monthly' ? Colors.purpleLight : Colors.border,
                backgroundColor: selectedPlan === 'monthly' ? Colors.purpleDark + '33' : Colors.card,
              },
            ]}
            onPress={() => setSelectedPlan('monthly')}
            activeOpacity={0.8}
          >
            <Text style={[s.planName, selectedPlan === 'monthly' && { color: Colors.purpleLight }]}>Monthly</Text>
            <Text style={s.planPrice}>$4.99</Text>
            <Text style={s.planPer}>per month</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              s.planCard,
              {
                borderColor: selectedPlan === 'annual' ? Colors.purpleLight : Colors.amber + '55',
                backgroundColor: selectedPlan === 'annual' ? Colors.purpleDark + '33' : Colors.card,
              },
            ]}
            onPress={() => setSelectedPlan('annual')}
            activeOpacity={0.8}
          >
            <View style={s.bestBadge}>
              <Text style={s.bestBadgeText}>BEST VALUE</Text>
            </View>
            <Text style={[s.planName, selectedPlan === 'annual' && { color: Colors.purpleLight }]}>Annual</Text>
            <Text style={s.planPrice}>$34.99</Text>
            <Text style={s.planPer}>per year · save 42%</Text>
          </TouchableOpacity>
        </View>

        {/* CTA */}
        <TouchableOpacity onPress={handlePurchase} disabled={loading} activeOpacity={0.85}>
          <LinearGradient
            colors={[Colors.purpleLight, Colors.purpleDark]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={[s.ctaBtn, loading && { opacity: 0.7 }]}
          >
            {loading ? (
              <ActivityIndicator size={20} color="#fff" />
            ) : (
              <Text style={s.ctaText}>
                Start {selectedPlan === 'annual' ? 'Annual' : 'Monthly'} Plan
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={s.legal}>Cancel anytime · Billed through the App Store</Text>

        <TouchableOpacity onPress={handleRestore} style={s.restoreBtn}>
          <Text style={s.restoreText}>Restore Purchases</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  closeBtn: {
    position: 'absolute', right: 18, zIndex: 10,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  hero: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  iconBadge: {
    width: 72, height: 72, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  iconGlyph: { fontSize: 34, color: '#fff' },
  title: { fontSize: 32, fontFamily: 'Georgia', color: Colors.offWhite, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: Colors.gray, textAlign: 'center', lineHeight: 22 },

  featureCard: {
    backgroundColor: Colors.card, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 20, overflow: 'hidden',
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 15, gap: 12,
  },
  featureBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  featureIcon: { fontSize: 20, width: 26, textAlign: 'center' },
  featureText: { flex: 1, fontSize: 14, color: Colors.offWhite, fontWeight: '500' },

  plansRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  planCard: {
    flex: 1, alignItems: 'center',
    borderRadius: 18, borderWidth: 1.5,
    paddingVertical: 18, paddingHorizontal: 10, gap: 4,
  },
  planName: { fontSize: 13, color: Colors.gray, fontWeight: '600' },
  planPrice: { fontSize: 26, fontFamily: 'Georgia', color: Colors.offWhite },
  planPer: { fontSize: 11, color: Colors.gray, textAlign: 'center' },

  bestBadge: {
    backgroundColor: Colors.amber + '33', borderRadius: 20,
    borderWidth: 1, borderColor: Colors.amber + '88',
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4,
  },
  bestBadgeText: { fontSize: 9, fontWeight: '700', color: Colors.amber, letterSpacing: 0.5 },

  ctaBtn: {
    paddingVertical: 18, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },

  legal: {
    textAlign: 'center', fontSize: 11, color: Colors.gray,
    opacity: 0.6, marginTop: 12, lineHeight: 16,
  },

  restoreBtn: { alignItems: 'center', paddingVertical: 16 },
  restoreText: { fontSize: 13, color: Colors.purpleLight, fontWeight: '500' },
})
