import React, { useState, useEffect, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, Alert,
} from 'react-native'
import Svg, {
  Rect, Circle, G, Defs, ClipPath,
  LinearGradient as SvgGradient, Stop,
  Text as SvgText,
} from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors } from '../../constants/colors'
import { EXPENSE_CATEGORIES } from '../../constants/categories'
import { useExpenseStore } from '../../store/expenseStore'
import { useAuthStore } from '../../store/authStore'
import { supabase } from '../../lib/supabase'
import { exportExpensesAsCSV } from '../../lib/csvExport'
import { getCurrencySymbol } from '../../lib/currency'
import type { Expense } from '../../types'

const { width: SW } = Dimensions.get('window')
const CARD_PAD = 20
const SCREEN_PAD = 20
const CHART_W = SW - (SCREEN_PAD + CARD_PAD) * 2
const BAR_H = 130
const LABEL_H = 22
const DONUT_SIZE = 156
const DONUT_R = 52
const DONUT_CX = DONUT_SIZE / 2
const DONUT_CY = DONUT_SIZE / 2
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type Period = 'weekly' | 'monthly' | 'yearly'

// ─── Bar chart ────────────────────────────────────────────────────────────────

function BarChart({
  data, currentMonth, currentYear,
}: {
  data: Array<{ month: number; year: number; total: number }>
  currentMonth: number
  currentYear: number
}) {
  if (!data.length) return null
  const maxTotal = Math.max(...data.map(d => d.total), 1)
  const BAR_COUNT = data.length
  const GAP = 10
  const BAR_W = (CHART_W - GAP * (BAR_COUNT + 1)) / BAR_COUNT
  const BAR_AREA_H = BAR_H - LABEL_H

  return (
    <Svg width={CHART_W} height={BAR_H} overflow="hidden" style={{ overflow: 'hidden' }}>
      <Defs>
        <ClipPath id="barClip">
          <Rect x="0" y="0" width={CHART_W} height={BAR_H} />
        </ClipPath>
        <SvgGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={Colors.purpleLight} stopOpacity="1" />
          <Stop offset="1" stopColor={Colors.purpleDark} stopOpacity="1" />
        </SvgGradient>
      </Defs>
      {data.map((d, i) => {
        const isActive = d.month === currentMonth && d.year === currentYear
        const barH = d.total > 0 ? Math.max((d.total / maxTotal) * (BAR_AREA_H - 8), 6) : 4
        const x = GAP + i * (BAR_W + GAP)
        const y = BAR_AREA_H - barH
        return (
          <G key={i}>
            <Rect
              x={x} y={y} width={BAR_W} height={barH} rx={5}
              fill={isActive ? 'url(#barGrad)' : Colors.purpleLight + '30'}
              clipPath="url(#barClip)"
            />
            <SvgText
              x={x + BAR_W / 2} y={BAR_H - 5}
              textAnchor="middle"
              fontSize={10}
              fontWeight={isActive ? '700' : '400'}
              fill={isActive ? Colors.offWhite : Colors.gray}
            >
              {MONTHS_SHORT[d.month]}
            </SvgText>
          </G>
        )
      })}
    </Svg>
  )
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

function DonutChart({ segments, sym, currencyRate }: {
  segments: Array<{ id: string; color: string; pct: number; label: string; amount: number }>
  sym: string
  currencyRate: number
}) {
  const circumference = 2 * Math.PI * DONUT_R
  let cumulative = 0

  return (
    <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
      <Defs>
        <ClipPath id="donutClip">
          <Rect x="0" y="0" width={DONUT_SIZE} height={DONUT_SIZE} />
        </ClipPath>
      </Defs>
      {segments.length === 0 ? (
        <Circle
          cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R}
          fill="none" stroke={Colors.border} strokeWidth={22}
        />
      ) : (
        segments.map((seg, i) => {
          const dash = seg.pct * circumference
          const offset = circumference * 0.25 - cumulative
          cumulative += dash
          return (
            <Circle
              key={seg.id}
              cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R}
              fill="none"
              stroke={seg.color}
              strokeWidth={22}
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={offset}
              clipPath="url(#donutClip)"
            />
          )
        })
      )}
      {/* Centre label */}
      <SvgText x={DONUT_CX} y={DONUT_CY - 6} textAnchor="middle" fontSize={11} fill={Colors.gray}>
        Total
      </SvgText>
      <SvgText x={DONUT_CX} y={DONUT_CY + 10} textAnchor="middle" fontSize={13} fontWeight="700" fill={Colors.offWhite}>
        {sym}{(segments.reduce((s, c) => s + c.amount, 0) * currencyRate).toFixed(0)}
      </SvgText>
    </Svg>
  )
}

// ─── ReportsScreen ────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()
  const { expenses, selectedMonth, selectedYear, currency, currencyRate } = useExpenseStore()
  const sym = getCurrencySymbol(currency)
  const userId = user?.id ?? ''

  const [period, setPeriod] = useState<Period>('monthly')
  const [yearlyExpenses, setYearlyExpenses] = useState<Expense[]>([])
  const [barData, setBarData] = useState<Array<{ month: number; year: number; total: number }>>([])
  const [exporting, setExporting] = useState(false)

  // Fetch bar chart data (last 6 months) on mount
  useEffect(() => {
    if (!userId) return
    const fetchBarData = async () => {
      const now = new Date()
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
        return { month: d.getMonth(), year: d.getFullYear() }
      })
      const results = await Promise.all(
        months.map(async ({ month, year }) => {
          const mm = String(month + 1).padStart(2, '0')
          const lastDay = new Date(year, month + 1, 0).getDate()
          const { data } = await supabase
            .from('expenses')
            .select('amount')
            .eq('user_id', userId)
            .gte('date', `${year}-${mm}-01`)
            .lte('date', `${year}-${mm}-${String(lastDay).padStart(2, '0')}`)
          return {
            month, year,
            total: (data ?? []).reduce((sum: number, e: any) => sum + (e.amount ?? 0), 0),
          }
        })
      )
      setBarData(results)
    }
    fetchBarData()
  }, [userId])

  // Fetch yearly data when period changes to yearly
  useEffect(() => {
    if (period !== 'yearly' || !userId) return
    const fetchYearly = async () => {
      const { data } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', userId)
        .gte('date', `${selectedYear}-01-01`)
        .lte('date', `${selectedYear}-12-31`)
        .order('date', { ascending: false })
      setYearlyExpenses((data ?? []) as Expense[])
    }
    fetchYearly()
  }, [period, userId, selectedYear])

  // Period-filtered expenses
  const periodExpenses = useMemo((): Expense[] => {
    if (period === 'yearly') return yearlyExpenses
    if (period === 'weekly') {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7); cutoff.setHours(0, 0, 0, 0)
      return expenses.filter(e => {
        const [y, m, d] = e.date.split('-').map(Number)
        return new Date(y, m - 1, d) >= cutoff
      })
    }
    return expenses // monthly
  }, [period, expenses, yearlyExpenses])

  const totalExpenses = periodExpenses.reduce((sum, e) => sum + e.amount, 0)

  // Category breakdown for donut
  const categoryData = useMemo(() => {
    const totals = EXPENSE_CATEGORIES.map(cat => ({
      id: cat.id,
      label: cat.label,
      icon: cat.icon,
      color: cat.color,
      total: periodExpenses.filter(e => e.category === cat.id).reduce((sum, e) => sum + e.amount, 0),
    })).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

    const grand = totals.reduce((s, c) => s + c.total, 0)
    return { totals, grand }
  }, [periodExpenses])

  const donutSegments = categoryData.totals.map(c => ({
    id: c.id,
    color: c.color,
    label: c.label,
    amount: c.total,
    pct: categoryData.grand > 0 ? c.total / categoryData.grand : 0,
  }))

  const maxCatTotal = Math.max(...categoryData.totals.map(c => c.total), 1)

  const handleExport = async () => {
    if (periodExpenses.length === 0) {
      Alert.alert('No Data', 'There are no expenses to export for this period.')
      return
    }
    setExporting(true)
    try {
      await exportExpensesAsCSV(periodExpenses)
    } catch (e: any) {
      Alert.alert('Export Failed', e?.message ?? 'Could not export CSV.')
    } finally {
      setExporting(false)
    }
  }

  const periodLabel = period === 'weekly' ? 'This Week' : period === 'monthly'
    ? MONTHS_SHORT[selectedMonth] + ' ' + selectedYear : String(selectedYear)

  return (
    <View style={[r.root, { paddingTop: insets.top }]}>
      <View style={r.screenHeader}>
        <Text style={r.screenTitle}>Reports</Text>
        <Text style={r.periodLabel}>{periodLabel}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[r.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* Period toggle */}
        <View style={r.periodToggle}>
          {(['weekly', 'monthly', 'yearly'] as Period[]).map(p => (
            <TouchableOpacity
              key={p}
              onPress={() => setPeriod(p)}
              style={[r.periodBtn, period === p && r.periodBtnActive]}
              activeOpacity={0.75}
            >
              <Text style={[r.periodBtnText, period === p && r.periodBtnTextActive]}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary card */}
        <View style={r.card}>
          <Text style={r.cardTitle}>Summary</Text>
          <View style={r.summaryRow}>
            <View style={r.summaryCol}>
              <Text style={r.summaryColLabel}>Revenue</Text>
              <Text style={[r.summaryColValue, { color: Colors.success }]}>{sym}0.00</Text>
            </View>
            <View style={r.summaryDivider} />
            <View style={r.summaryCol}>
              <Text style={r.summaryColLabel}>Expenses</Text>
              <Text style={[r.summaryColValue, { color: Colors.error }]}>
                {sym}{(totalExpenses * currencyRate).toFixed(2)}
              </Text>
            </View>
            <View style={r.summaryDivider} />
            <View style={r.summaryCol}>
              <Text style={r.summaryColLabel}>Net</Text>
              <Text style={[r.summaryColValue, { color: Colors.purpleLight }]}>
                -{sym}{(totalExpenses * currencyRate).toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Bar chart */}
        <View style={r.card}>
          <Text style={r.cardTitle}>Spending · Last 6 Months</Text>
          <View style={{ marginTop: 12 }}>
            {barData.length > 0 ? (
              <BarChart data={barData} currentMonth={selectedMonth} currentYear={selectedYear} />
            ) : (
              <View style={r.chartLoading}>
                <Text style={{ color: Colors.gray, fontSize: 13 }}>Loading chart…</Text>
              </View>
            )}
          </View>
        </View>

        {/* Donut chart */}
        <View style={r.card}>
          <Text style={r.cardTitle}>By Category</Text>
          {categoryData.totals.length === 0 ? (
            <View style={r.donutEmpty}>
              <DonutChart segments={[]} sym={sym} currencyRate={currencyRate} />
              <Text style={r.donutEmptyText}>No data for this period</Text>
            </View>
          ) : (
            <View style={r.donutRow}>
              <DonutChart segments={donutSegments} sym={sym} currencyRate={currencyRate} />
              <View style={r.legend}>
                {categoryData.totals.map(cat => (
                  <View key={cat.id} style={r.legendItem}>
                    <Text style={r.legendEmoji}>{cat.icon}</Text>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={r.legendTop}>
                        <Text style={r.legendName} numberOfLines={1}>
                          {cat.label.split('&')[0].trim()}
                        </Text>
                        <Text style={r.legendAmt}>{sym}{(cat.total * currencyRate).toFixed(0)}</Text>
                      </View>
                      <View style={r.legendBarBg}>
                        <View
                          style={[
                            r.legendBarFill,
                            {
                              width: `${(cat.total / maxCatTotal) * 100}%` as any,
                              backgroundColor: cat.color,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Tax tip */}
        <View style={r.taxCard}>
          <Text style={r.taxEmoji}>💡</Text>
          <View style={{ flex: 1 }}>
            <Text style={r.taxTitle}>Tax Tip</Text>
            <Text style={r.taxBody}>
              You have <Text style={{ fontWeight: '700' }}>{sym}{(totalExpenses * currencyRate).toFixed(2)}</Text> in
              business expenses this {period === 'yearly' ? 'year' : period === 'weekly' ? 'week' : 'month'} that may be tax deductible.
            </Text>
          </View>
        </View>

        {/* CSV Export */}
        <TouchableOpacity onPress={handleExport} disabled={exporting} activeOpacity={0.85}>
          <LinearGradient
            colors={[Colors.purpleLight, Colors.purpleDark]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={[r.exportBtn, exporting && { opacity: 0.6 }]}
          >
            {exporting ? (
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: 'transparent', borderTopColor: '#fff' }} />
            ) : (
              <>
                <Text style={r.exportIcon}>📤</Text>
                <Text style={r.exportText}>Export CSV Report</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const r = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  screenHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  screenTitle: { fontSize: 24, fontFamily: 'Georgia', color: Colors.offWhite },
  periodLabel: { fontSize: 13, color: Colors.gray },

  scroll: { paddingHorizontal: 20, gap: 16 },

  periodToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 4,
  },
  periodBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 11,
    alignItems: 'center',
  },
  periodBtnActive: { backgroundColor: Colors.purpleDark + 'AA' },
  periodBtnText: { fontSize: 13, color: Colors.gray, fontWeight: '500' },
  periodBtnTextActive: { color: Colors.purpleLight, fontWeight: '700' },

  card: {
    backgroundColor: Colors.card, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border,
    padding: 20,
  },
  cardTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.grayLight,
    letterSpacing: 0.5, marginBottom: 4,
  },

  summaryRow: {
    flexDirection: 'row', marginTop: 12,
    backgroundColor: Colors.inputBg, borderRadius: 14, overflow: 'hidden',
  },
  summaryCol: { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 4 },
  summaryDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 10 },
  summaryColLabel: { fontSize: 11, color: Colors.gray, fontWeight: '600' },
  summaryColValue: { fontSize: 16, fontWeight: '700' },

  chartLoading: {
    height: BAR_H, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.inputBg, borderRadius: 12,
  },

  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  donutEmpty: { alignItems: 'center', gap: 12, paddingVertical: 12 },
  donutEmptyText: { fontSize: 13, color: Colors.gray },

  legend: { flex: 1, gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendEmoji: { fontSize: 14, width: 22, textAlign: 'center' },
  legendTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legendName: { fontSize: 12, color: Colors.offWhite, fontWeight: '500', flex: 1, marginRight: 4 },
  legendAmt: { fontSize: 11, color: Colors.gray, fontWeight: '600' },
  legendBarBg: {
    height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden',
  },
  legendBarFill: { height: 4, borderRadius: 2 },

  taxCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.amber + '18',
    borderWidth: 1, borderColor: Colors.amber + '55',
    borderRadius: 16, padding: 16,
  },
  taxEmoji: { fontSize: 22, marginTop: 2 },
  taxTitle: { fontSize: 13, fontWeight: '700', color: Colors.amber, marginBottom: 4 },
  taxBody: { fontSize: 13, color: Colors.offWhite, lineHeight: 20 },

  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 17, borderRadius: 16, gap: 8,
  },
  exportIcon: { fontSize: 18 },
  exportText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
})
