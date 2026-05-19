import React, { useEffect, useRef, useCallback, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  RefreshControl,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import Svg, {
  Path,
  Line,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  ClipPath,
  Rect,
} from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { getCurrencySymbol, getCurrencyRate } from '../../lib/currency'
import type { CompositeNavigationProp } from '@react-navigation/native'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Colors } from '../../constants/colors'
import KeiprIcon from '../../components/KeiprIcon'
import { EXPENSE_CATEGORIES } from '../../constants/categories'
import { useAuthStore } from '../../store/authStore'
import { useExpenseStore } from '../../store/expenseStore'
import { usePurchaseStore } from '../../store/purchaseStore'
import type { Expense } from '../../types'
import type { MainTabParamList } from '../../navigation/MainTabs'
import type { MainStackParamList } from '../../navigation/MainStack'

type NavProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  NativeStackNavigationProp<MainStackParamList>
>

const { width: SW } = Dimensions.get('window')
const CARD_H = 176
const CHART_H = 120
const CHART_W = SW - 76 // 20px scroll padding + 18px card padding, each side

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ─── Spending chart ──────────────────────────────────────────────────────────

function SpendingChart({ expenses, month, year }: { expenses: Expense[]; month: number; year: number }) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const dailyTotals = Array<number>(daysInMonth).fill(0)
  expenses
    .forEach(e => {
      const d = new Date(e.date).getDate() - 1
      if (d >= 0 && d < daysInMonth) dailyTotals[d] += e.amount
    })

  const hasData = dailyTotals.some(v => v > 0)
  const maxVal = Math.max(...dailyTotals, 1)
  const n = daysInMonth

  const pts = dailyTotals.map((v, i) => ({
    x: (i / Math.max(n - 1, 1)) * CHART_W,
    y: CHART_H - (v / maxVal) * (CHART_H - 32),
  }))

  // Smooth cubic bezier
  let linePath = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const cpx = (pts[i - 1].x + pts[i].x) / 2
    linePath += ` C ${cpx} ${pts[i - 1].y} ${cpx} ${pts[i].y} ${pts[i].x} ${pts[i].y}`
  }
  const fillPath = `${linePath} L ${pts[pts.length - 1].x} ${CHART_H} L 0 ${CHART_H} Z`

  return (
    <Svg width={CHART_W} height={CHART_H} style={{ overflow: 'hidden' }}>
      <Defs>
        <SvgGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#9F67F7" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#9F67F7" stopOpacity="0" />
        </SvgGradient>
        <ClipPath id="chartClip">
          <Rect x="0" y="0" width={CHART_W} height={CHART_H} />
        </ClipPath>
      </Defs>
      {hasData ? (
        <>
          <Path d={fillPath} fill="url(#cg)" clipPath="url(#chartClip)" />
          <Path
            d={linePath}
            stroke="#9F67F7"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            clipPath="url(#chartClip)"
          />
        </>
      ) : (
        <Line
          x1="0" y1={CHART_H / 2}
          x2={CHART_W} y2={CHART_H / 2}
          stroke={Colors.border}
          strokeWidth="2"
          strokeDasharray="6,5"
        />
      )}
    </Svg>
  )
}

// ─── Expense row ─────────────────────────────────────────────────────────────

function ExpenseRow({ expense, sym, currencyRate }: { expense: Expense; sym: string; currencyRate: number }) {
  const cat = EXPENSE_CATEGORIES.find(c => c.id === expense.category)
  const dateStr = new Date(expense.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <View style={rowStyles.row}>
      <View style={[rowStyles.iconPill, { backgroundColor: (cat?.color ?? '#6B7280') + '22' }]}>
        <Text style={rowStyles.emoji}>{cat?.icon ?? '📋'}</Text>
      </View>
      <View style={rowStyles.info}>
        <Text style={rowStyles.title} numberOfLines={1}>{expense.vendor}</Text>
        <Text style={rowStyles.meta}>{cat?.label ?? 'Other'} · {dateStr}</Text>
      </View>
      <Text style={rowStyles.amount}>
        -{sym}{(expense.amount * currencyRate / getCurrencyRate(expense.currency || 'USD')).toFixed(2)}
      </Text>
    </View>
  )
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  iconPill: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 18 },
  info: { flex: 1, gap: 3 },
  title: { fontSize: 14, color: Colors.offWhite, fontWeight: '500' },
  meta: { fontSize: 12, color: Colors.gray },
  amount: { fontSize: 14, fontWeight: '600', color: Colors.offWhite },
})

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NavProp>()
  const { user } = useAuthStore()
  const {
    expenses,
    loading,
    selectedMonth,
    selectedYear,
    totalIncome,
    totalExpenses,
    monthChangePercent,
    currency,
    currencyRate,
    fetchExpenses,
    setSelectedPeriod,
  } = useExpenseStore()
  const { isPro } = usePurchaseStore()

  const [refreshing, setRefreshing] = useState(false)
  const monthScrollRef = useRef<ScrollView>(null)

  const userId = user?.id ?? ''
  const userName: string = user?.user_metadata?.full_name ?? user?.email ?? 'there'
  const userInitial = userName.charAt(0).toUpperCase()
  const sym = getCurrencySymbol(currency)
  const netBalance = -totalExpenses

  // Initial fetch
  useEffect(() => {
    if (!userId) return
    fetchExpenses(userId, selectedMonth, selectedYear)
  }, [userId])

  // Scroll month strip to active pill on mount
  useEffect(() => {
    const PILL_W = 58
    setTimeout(() => {
      const x = Math.max(0, selectedMonth * PILL_W - SW / 2 + PILL_W / 2)
      monthScrollRef.current?.scrollTo({ x, animated: false })
    }, 120)
  }, [])

  const handleMonthChange = (month: number) => {
    setSelectedPeriod(month, selectedYear)
    fetchExpenses(userId, month, selectedYear)
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchExpenses(userId, selectedMonth, selectedYear)
    setRefreshing(false)
  }, [userId, selectedMonth, selectedYear])

  const changeLabel =
    monthChangePercent == null
      ? null
      : `${monthChangePercent >= 0 ? '↑' : '↓'} ${Math.abs(monthChangePercent).toFixed(1)}%`

  return (
    <View style={[styles.root, { backgroundColor: Colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.purpleLight}
            colors={[Colors.purpleLight]}
          />
        }
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeLabel}>WELCOME BACK</Text>
            <KeiprIcon size={28} />
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} activeOpacity={0.8}>
            <LinearGradient
              colors={[Colors.purpleLight, '#E879A0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarInitial}>{userInitial}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── Balance card ── */}
        <LinearGradient
          colors={['#9F67F7', '#5418C8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          {/* Decorative circles */}
          <View style={styles.decoCircle1} />
          <View style={styles.decoCircle2} />

          <Text style={styles.balanceLabel}>
            Net Balance · {FULL_MONTHS[selectedMonth]} {selectedYear}
          </Text>
          <Text style={styles.balanceAmount}>
            {netBalance < 0 ? '-' : ''}{sym}{Math.abs(netBalance * currencyRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>

          <View style={styles.balanceRow}>
            <View style={styles.balanceStat}>
              <Text style={styles.balanceStatLabel}>Income</Text>
              <Text style={[styles.balanceStatValue, { color: '#6EE7B7' }]}>
                {sym}{(totalIncome * currencyRate).toFixed(2)}
              </Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceStat}>
              <Text style={styles.balanceStatLabel}>Expenses</Text>
              <Text style={[styles.balanceStatValue, { color: '#FCA5A5' }]}>
                {sym}{(totalExpenses * currencyRate).toFixed(2)}
              </Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceStat}>
              <Text style={styles.balanceStatLabel}>Receipts</Text>
              <Text style={styles.balanceStatValue}>{expenses.length}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── Month selector ── */}
        <ScrollView
          ref={monthScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.monthScroll}
          contentContainerStyle={styles.monthScrollContent}
        >
          {MONTHS.map((m, i) => (
            <TouchableOpacity
              key={m}
              onPress={() => handleMonthChange(i)}
              activeOpacity={0.75}
              style={[styles.monthPill, i === selectedMonth && styles.monthPillActive]}
            >
              <Text style={[styles.monthText, i === selectedMonth && styles.monthTextActive]}>
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Spending chart ── */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Spending Overview</Text>
            {changeLabel && (
              <View style={styles.changeBadge}>
                <Text style={styles.changeBadgeText}>{changeLabel}</Text>
              </View>
            )}
          </View>
          <SpendingChart expenses={expenses} month={selectedMonth} year={selectedYear} />
        </View>

        {/* ── Quick actions ── */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickPrimaryWrapper}
            activeOpacity={0.85}
            onPress={() => isPro ? navigation.navigate('ScanReceipt') : navigation.navigate('Paywall')}
          >
            <LinearGradient
              colors={[Colors.purpleLight, Colors.purpleDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.quickButton}
            >
              <Text style={styles.quickButtonText}>📷  Scan Receipt</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickSecondaryWrapper}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('ManualEntry')}
          >
            <View style={styles.quickSecondary}>
              <Text style={styles.quickButtonText}>✏️  Add Manual</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Recent expenses ── */}
        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>Recent</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Expenses')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.seeAll}>See all →</Text>
            </TouchableOpacity>
          </View>

          {loading && expenses.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>⏳</Text>
              <Text style={styles.emptyText}>Loading…</Text>
            </View>
          ) : expenses.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🧾</Text>
              <Text style={styles.emptyText}>No expenses yet</Text>
              <Text style={styles.emptySubtext}>Scan a receipt or add one manually to get started</Text>
            </View>
          ) : (
            <View style={styles.expenseList}>
              {expenses.slice(0, 5).map((e, i) => (
                <React.Fragment key={e.id}>
                  <ExpenseRow expense={e} sym={sym} currencyRate={currencyRate} />
                  {i < Math.min(expenses.length, 5) - 1 && <View style={styles.rowDivider} />}
                </React.Fragment>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeLabel: {
    fontSize: 11,
    color: Colors.gray,
    letterSpacing: 1.2,
    fontWeight: '600',
    marginBottom: 3,
  },
  appName: {
    fontSize: 22,
    fontFamily: 'Georgia',
    color: Colors.offWhite,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 18,
    color: Colors.white,
    fontWeight: '700',
  },

  // Balance card
  balanceCard: {
    borderRadius: 22,
    padding: 22,
    marginBottom: 20,
    height: CARD_H,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  decoCircle1: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -70,
    right: -50,
  },
  decoCircle2: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -20,
    left: 70,
  },
  balanceLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  balanceAmount: {
    fontSize: 38,
    fontFamily: 'Georgia',
    color: Colors.white,
    letterSpacing: -0.5,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  balanceStat: {
    flex: 1,
    gap: 2,
  },
  balanceStatLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
  },
  balanceStatValue: {
    fontSize: 14,
    color: Colors.white,
    fontWeight: '700',
  },
  balanceDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 12,
  },

  // Month selector
  monthScroll: { marginBottom: 16 },
  monthScrollContent: {
    paddingHorizontal: 4,
    gap: 8,
    flexDirection: 'row',
  },
  monthPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  monthPillActive: {
    backgroundColor: Colors.purpleDark,
  },
  monthText: {
    fontSize: 13,
    color: Colors.gray,
    fontWeight: '500',
  },
  monthTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },

  // Chart card
  chartCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 15,
    color: Colors.offWhite,
    fontWeight: '600',
  },
  changeBadge: {
    backgroundColor: Colors.purpleDark + '55',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.purpleLight + '40',
  },
  changeBadgeText: {
    fontSize: 12,
    color: Colors.purpleLight,
    fontWeight: '700',
  },

  // Quick actions
  quickRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  quickPrimaryWrapper: { flex: 1 },
  quickSecondaryWrapper: { flex: 1 },
  quickButton: {
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickSecondary: {
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickButtonText: {
    fontSize: 14,
    color: Colors.white,
    fontWeight: '600',
  },

  // Recent expenses
  recentSection: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  recentTitle: {
    fontSize: 16,
    color: Colors.offWhite,
    fontWeight: '700',
  },
  seeAll: {
    fontSize: 13,
    color: Colors.purpleLight,
    fontWeight: '500',
  },
  expenseList: {},
  rowDivider: {
    height: 1,
    backgroundColor: Colors.border,
    opacity: 0.5,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyIcon: { fontSize: 36 },
  emptyText: {
    fontSize: 15,
    color: Colors.grayLight,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.gray,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
})
